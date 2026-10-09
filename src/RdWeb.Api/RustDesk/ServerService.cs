using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public sealed class ProbeSlots : IDisposable
{
    public SemaphoreSlim Semaphore { get; } = new(2, 2);
    // 主機釋放時清理probe資源。
    public void Dispose() => Semaphore.Dispose();
}
public sealed class ServerService(AppDbContext database, SessionValidator sessions, AuditWriter audits, IKvStore store, ConnectionProbe probe, ProbeSlots slots)
{
    // 設定含內部端點，僅完整認證admin可讀。
    public async Task<object> ListAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        return (await database.RustDeskServers.AsNoTracking().OrderBy(server => server.Name).ToListAsync(ct)).Select(View).ToArray();
    }
    // 單筆也使用相同角色與MFA規則。
    public async Task<object> GetAsync(ClaimsPrincipal principal, Guid id, CancellationToken ct)
    { _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct); return View(await FindAsync(id, ct)); }
    // 保存語法與靜態IP已驗證的設定，不把CRUD綁死外部DNS可用性。
    public async Task<object> CreateAsync(ClaimsPrincipal principal, ServerRequest request, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var server = new RustDeskServer(); Apply(server, request);
        database.RustDeskServers.Add(server); await database.SaveChangesAsync(ct);
        await AuditAsync(AuditAction.ServerChanged, actor.Id, server.Id, true, ct);
        return View(server);
    }
    // 過期Version回409，不接受client覆寫資料庫版本。
    public async Task<object> UpdateAsync(ClaimsPrincipal principal, Guid id, ServerRequest request, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var server = await FindAsync(id, ct);
        if (request.Version != server.Version || request.Version < 1) throw new AuthException("version_conflict", 409);
        Apply(server, request); await SaveAsync(ct);
        await AuditAsync(AuditAction.ServerChanged, actor.Id, server.Id, true, ct);
        return View(server);
    }
    // 刪除也保護版本，B新增Target FK後再處理server_in_use。
    public async Task DeleteAsync(ClaimsPrincipal principal, Guid id, int version, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var server = await FindAsync(id, ct);
        if (version != server.Version || version < 1) throw new AuthException("version_conflict", 409);
        if (await database.Targets.AnyAsync(target => target.ServerId == id, ct)) throw new AuthException("server_in_use", 409);
        database.RustDeskServers.Remove(server); await SaveAsync(ct);
        await AuditAsync(AuditAction.ServerChanged, actor.Id, id, true, ct);
    }
    // 只使用DB設定，不接受request目的地；quota與並行數均有限。
    // 可選摘要只回名稱／UUID，內部端點仍限admin。
    public async Task<object> AvailableAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, cancellationToken: ct);
        return await database.RustDeskServers.AsNoTracking().Where(server => server.Enabled).OrderBy(server => server.Name).Select(server => new { id = server.Id, name = server.Name }).ToListAsync(ct);
    }
    // 只使用已保存的enabled server進行probe。
    public async Task<object> ProbeAsync(ClaimsPrincipal principal, Guid id, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var server = await FindAsync(id, ct);
        if (!server.Enabled) throw new AuthException("server_disabled", 409);
        if (await store.IncrementAsync("rl:server_probe:" + actor.Id, TimeSpan.FromSeconds(60), ct) > 5 || !await slots.Semaphore.WaitAsync(0, ct))
            throw new AuthException("rate_limited", 429);
        try
        {
            var results = await Task.WhenAll(probe.CheckAsync(ServerEndpoint.Parse(server.IdServer), server.AllowPrivateNetwork, ct),
                probe.CheckAsync(ServerEndpoint.Parse(server.RelayServer), server.AllowPrivateNetwork, ct));
            await AuditAsync(AuditAction.ServerTested, actor.Id, id, results.All(result => result.Status == "reachable"), ct);
            return new
            {
                check = "tcp_socket",
                protocol_verified = false,
                public_key_valid = ValidPublicKey(server.PublicKey),
                id_server = new { status = results[0].Status, latency_ms = results[0].LatencyMilliseconds },
                relay_server = new { status = results[1].Status, latency_ms = results[1].LatencyMilliseconds }
            };
        }
        finally { slots.Semaphore.Release(); }
    }
    // 輸入正規化與政策不會將未驗證字串放進錯誤。
    private static void Apply(RustDeskServer server, ServerRequest request)
    {
        ServerEndpoint id; ServerEndpoint relay;
        try { id = ServerEndpoint.Parse(request.IdServer); relay = ServerEndpoint.Parse(request.RelayServer); }
        catch (ArgumentException) { throw new AuthException("invalid_endpoint", 400); }
        foreach (var endpoint in new[] { id, relay })
            if (System.Net.IPAddress.TryParse(endpoint.Host, out var ip) && !AddressPolicy.IsAllowed(ip, request.AllowPrivateNetwork)) throw new AuthException("address_blocked", 400);
        if (!ValidPublicKey(request.PublicKey)) throw new AuthException("invalid_public_key", 400);
        if (string.IsNullOrWhiteSpace(request.Name)) throw new AuthException("invalid_request", 400);
        server.Name = request.Name.Trim(); server.IdServer = id.ToString(); server.RelayServer = relay.ToString(); server.PublicKey = request.PublicKey;
        server.Transport = request.Transport; server.Enabled = request.Enabled; server.AllowPrivateNetwork = request.AllowPrivateNetwork; server.Notes = request.Notes;
    }
    // Ed25519公鑰只接受標準32-byte Base64，不允許whitespace或變體。
    public static bool ValidPublicKey(string value)
    {
        if (value.Length != 44) return false;
        try { var bytes = Convert.FromBase64String(value); return bytes.Length == 32 && Convert.ToBase64String(bytes) == value; }
        catch (FormatException) { return false; }
    }
    // DB並發失敗採明確409，不把低層exception回給client。
    private async Task SaveAsync(CancellationToken ct)
    { try { await database.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { throw new AuthException("version_conflict", 409); } }
    // 找不到回固定分類，不洩漏資料庫查詢。
    private async Task<RustDeskServer> FindAsync(Guid id, CancellationToken ct) => await database.RustDeskServers.SingleOrDefaultAsync(server => server.Id == id, ct) ?? throw new AuthException("not_found", 404);
    // 明確投影避免未來新增敏感欄位被意外序列化。
    private static object View(RustDeskServer server) => new
    {
        id = server.Id,
        name = server.Name,
        id_server = server.IdServer,
        relay_server = server.RelayServer,
        public_key = server.PublicKey,
        transport = server.Transport,
        enabled = server.Enabled,
        allow_private_network = server.AllowPrivateNetwork,
        notes = server.Notes,
        version = server.Version,
        created_at = server.CreatedAt,
        updated_at = server.UpdatedAt
    };
    // 稽核僅actor／object與分類，不包含hostname／公鑰／原文。
    private Task AuditAsync(AuditAction action, Guid actor, Guid id, bool success, CancellationToken ct) => audits.WriteAsync(new(action, success ? AuditResult.Success : AuditResult.Failure,
        actor, new(success ? AuditReason.Completed : AuditReason.Denied), "server", id), ct);
}
