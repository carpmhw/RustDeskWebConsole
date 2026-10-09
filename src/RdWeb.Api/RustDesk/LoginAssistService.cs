using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.Security;
using RdWeb.Api.Targets;

namespace RdWeb.Api.RustDesk;

public sealed class LoginAssistService(SessionValidator sessions, TargetPolicy policy, ActiveConnectionRegistry registry,
    IKvStore store, EncryptedSecretStore secrets)
{
    // 完整登入、活躍binding與最新can_connect都成立才可claim一次最終proof。
    public async Task<LoginAssistResponse> AssistAsync(ClaimsPrincipal principal, Guid targetId, LoginAssistRequest request,
        string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct);
        var target = await policy.FindVisibleAsync(actor, targetId, ct);
        if (!(await policy.RightsAsync(actor, target, ct)).CanConnect) throw new AuthException("forbidden", 403);
        var binding = new ConnectionSessionBinding(Guid.Parse(principal.FindFirstValue("sid")!), actor.AuthVersion, actor.Role, principal.FindFirstValue("mfa") == "1");
        var active = registry.Find(request.ConnectionId);
        if (active == null || !active.Matches(new(actor.Id, targetId, binding))) throw new AuthException("inactive_connection", 403);
        if (string.IsNullOrEmpty(request.Salt) || string.IsNullOrEmpty(request.Challenge) || request.Salt.Length > 128 || request.Challenge.Length > 128
            || Encoding.UTF8.GetByteCount(request.Salt) > 256 || Encoding.UTF8.GetByteCount(request.Challenge) > 256) throw new AuthException("invalid_request", 400);
        if (await store.IncrementAsync("rl:login_assist:user:" + actor.Id, TimeSpan.FromSeconds(60), ct) > 5
            || await store.IncrementAsync("rl:login_assist:ip:" + ip, TimeSpan.FromSeconds(60), ct) > 5) throw new AuthException("rate_limited", 429);
        if (!active.TryClaimAssist()) throw new AuthException("assist_used", 409);
        var password = await secrets.GetPasswordBytesAsync(targetId, target.PasswordSecretId, ct) ?? throw new AuthException("password_not_set", 404);
        var salt = Encoding.UTF8.GetBytes(request.Salt);
        var challenge = Encoding.UTF8.GetBytes(request.Challenge);
        byte[]? proof = null;
        try
        {
            proof = RustDeskLoginProof.Compute(password, salt, challenge);
            ct.ThrowIfCancellationRequested();
            if (!active.IsActive) throw new AuthException("inactive_connection", 403);
            return new(Convert.ToBase64String(proof));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(password); CryptographicOperations.ZeroMemory(salt);
            CryptographicOperations.ZeroMemory(challenge); if (proof != null) CryptographicOperations.ZeroMemory(proof);
        }
    }
}
