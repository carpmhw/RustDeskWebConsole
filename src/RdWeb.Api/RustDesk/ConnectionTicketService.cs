using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.Security;
using RdWeb.Api.Targets;

namespace RdWeb.Api.RustDesk;

public sealed class ConnectionTicketService(SessionValidator sessions, TargetPolicy policy, IKvStore store)
{
    private static readonly TimeSpan TicketLifetime = TimeSpan.FromSeconds(30);

    // 只為目前完整登入且有can_connect權限的使用者簽發短效opaque票證。
    public async Task<ConnectionTicketResponse> IssueAsync(ClaimsPrincipal principal, Guid targetId, CancellationToken cancellationToken)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: cancellationToken);
        var target = await policy.FindVisibleAsync(actor, targetId, cancellationToken);
        if (!(await policy.RightsAsync(actor, target, cancellationToken)).CanConnect)
            throw new AuthException("forbidden", StatusCodes.Status403Forbidden);

        var session = new ConnectionSessionBinding(Guid.Parse(principal.FindFirstValue("sid")!),
            actor.AuthVersion, actor.Role, principal.FindFirstValue("mfa") == "1");
        var binding = JsonSerializer.Serialize(new TicketBinding(actor.Id, target.Id, session));
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var bytes = RandomNumberGenerator.GetBytes(32);
            try
            {
                var ticket = EncodeTicket(bytes);
                var key = CreateKey(bytes);
                if (await store.SetIfAbsentWithTtlAsync(key, binding, TicketLifetime, cancellationToken))
                    return new ConnectionTicketResponse(ticket, (int)TicketLifetime.TotalSeconds);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(bytes);
            }
        }

        throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
    }

    // 原子消耗票證後重驗目前user、target visibility、can_connect及server enabled。
    public async Task<ConnectionGrant> ConsumeAsync(Guid routeTargetId, string ticket, CancellationToken cancellationToken)
    {
        if (!TryDecodeTicket(ticket, out var bytes)) throw new AuthException("unauthorized");
        try
        {
            var serialized = await store.TakeOnceAsync(CreateKey(bytes), cancellationToken);
            if (serialized == null) throw new AuthException("unauthorized");

            TicketBinding? binding;
            try
            {
                binding = JsonSerializer.Deserialize<TicketBinding>(serialized);
            }
            catch (JsonException)
            {
                throw new AuthException("unauthorized");
            }

            if (binding == null || binding.UserId == Guid.Empty || binding.TargetId != routeTargetId || binding.Session == null)
                throw new AuthException("unauthorized");
            var actor = await sessions.RequireAsync(binding.Session.ToPrincipal(binding.UserId), cancellationToken: cancellationToken);

            var target = await policy.FindVisibleAsync(actor, binding.TargetId, cancellationToken);
            if (!(await policy.RightsAsync(actor, target, cancellationToken)).CanConnect)
                throw new AuthException("forbidden", StatusCodes.Status403Forbidden);
            return new ConnectionGrant(actor.Id, target.Id, binding.Session);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    // 產生標準Base64URL且不帶padding的32-byte票證字串。
    private static string EncodeTicket(ReadOnlySpan<byte> bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // 票證只以SHA-256 digest組成KV key，降低錯誤診斷暴露原值的風險。
    private static string CreateKey(ReadOnlySpan<byte> bytes)
        => "ticket:" + Convert.ToHexString(SHA256.HashData(bytes));

    // 嚴格限制票證alphabet與長度，避免Base64非標準變體指向相同KV項目。
    private static bool TryDecodeTicket(string ticket, out byte[] bytes)
    {
        bytes = [];
        if (ticket.Length != 43 || ticket.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '-' or '_')))
            return false;

        try
        {
            var base64 = ticket.Replace('-', '+').Replace('_', '/') + "=";
            var decoded = Convert.FromBase64String(base64);
            if (decoded.Length != 32 || !StringComparer.Ordinal.Equals(EncodeTicket(decoded), ticket))
            {
                CryptographicOperations.ZeroMemory(decoded);
                return false;
            }
            bytes = decoded;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private sealed record TicketBinding(Guid UserId, Guid TargetId, ConnectionSessionBinding? Session);
}
