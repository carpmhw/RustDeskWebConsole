using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public sealed class ConnectionAdminService(AppDbContext database, SessionValidator sessions, ActiveConnectionRegistry registry, RdWeb.Api.Infrastructure.AuditWriter audits)
{
    // 管理員強制中斷：不需再驗證，連線以 4002 結束；另寫一筆由管理員發起、對象為被中斷使用者的稽核。已結束或不存在為 404。
    public async Task TerminateAsync(ClaimsPrincipal principal, Guid id, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var lease = registry.Find(id);
        if (lease == null || registry.Terminate(grant => ReferenceEquals(grant, lease.Grant), ConnectionEndReason.Terminated) == 0)
            throw new AuthException("not_found", StatusCodes.Status404NotFound);
        await audits.WriteAsync(new(RdWeb.Api.Infrastructure.AuditAction.ConnectionTerminated, RdWeb.Api.Infrastructure.AuditResult.Success, actor.Id,
            ObjectType: "user", ObjectId: lease.Grant.UserId, SourceIp: ip), ct);
    }

    // 列出所有作用中連線：使用者與目標名稱於讀取時解析，流量取自 bridge 即時計數；僅管理員。
    public async Task<object> ListAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var leases = registry.Snapshot().Where(lease => lease.IsActive).OrderBy(lease => lease.StartedAt).ToList();
        var userIds = leases.Select(lease => lease.Grant.UserId).Distinct().ToList();
        var targetIds = leases.Select(lease => lease.Grant.TargetId).Distinct().ToList();
        var users = await database.Users.AsNoTracking().Where(user => userIds.Contains(user.Id)).ToDictionaryAsync(user => user.Id, user => user.Username, ct);
        var targets = await database.Targets.AsNoTracking().Where(target => targetIds.Contains(target.Id)).ToDictionaryAsync(target => target.Id, target => target.Name, ct);
        return new
        {
            items = leases.Select(lease =>
            {
                var totals = lease.Progress.Snapshot();
                return new
                {
                    id = lease.Id,
                    user_id = lease.Grant.UserId,
                    user_name = users.GetValueOrDefault(lease.Grant.UserId),
                    target_id = lease.Grant.TargetId,
                    target_name = targets.GetValueOrDefault(lease.Grant.TargetId),
                    started_at = DateTime.SpecifyKind(lease.StartedAt, DateTimeKind.Utc),
                    source_ip = lease.SourceIp,
                    bytes_sent = totals.BrowserToTargetBytes,
                    bytes_received = totals.TargetToBrowserBytes
                };
            })
        };
    }
}
