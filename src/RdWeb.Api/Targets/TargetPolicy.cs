using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Targets;

public sealed record TargetRights(bool CanConnect, bool CanViewPassword, bool CanEdit);
public sealed class TargetPolicy(AppDbContext database)
{
    // 可見性在SQL限定，grant存在即可看metadata。
    public IQueryable<Target> VisibleTargets(User actor)
    {
        if (actor.Role == "admin") return database.Targets;
        return database.Targets.Where(target => actor.Role == "operator" && target.CreatedBy == actor.Id
            || database.TargetPermissions.Any(permission => permission.TargetId == target.Id && (permission.UserId == actor.Id || permission.Role == actor.Role)));
    }
    // Viewer硬上限，owner完整、operator額外grant取聯集。
    public async Task<TargetRights> RightsAsync(User actor, Target target, CancellationToken cancellationToken = default)
    {
        if (actor.Role == "viewer") return new(false, false, false);
        var enabled = await database.RustDeskServers.AnyAsync(server => server.Id == target.ServerId && server.Enabled, cancellationToken);
        if (actor.Role == "admin" || actor.Role == "operator" && target.CreatedBy == actor.Id) return new(enabled, true, true);
        if (actor.Role != "operator") return new(false, false, false);
        var grants = await database.TargetPermissions.Where(permission => permission.TargetId == target.Id && (permission.UserId == actor.Id || permission.Role == actor.Role)).ToListAsync(cancellationToken);
        return new(enabled && grants.Any(permission => permission.CanConnect), grants.Any(permission => permission.CanViewPassword), grants.Any(permission => permission.CanEdit));
    }
    // 隱藏與不存在同為404，不從action端點枚舉目標。
    public async Task<Target> FindVisibleAsync(User actor, Guid id, CancellationToken cancellationToken)
        => await VisibleTargets(actor).SingleOrDefaultAsync(target => target.Id == id, cancellationToken) ?? throw new RdWeb.Api.Security.AuthException("not_found", 404);
}
