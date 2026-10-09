using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Api.Targets;

public sealed class TargetService(AppDbContext database, SessionValidator sessions, TargetPolicy policy, EncryptedSecretStore secrets, AuditWriter audits)
{
    // 只可見target參與count／分頁，搜尋使用EF參數化。
    public async Task<object> ListAsync(ClaimsPrincipal principal, string? q, string? group, int page, int pageSize, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct);
        if (page is < 1 or > 10000 || pageSize is < 1 or > 100 || q?.Length > 128 || group?.Length > 64) throw new AuthException("invalid_request", 400);
        var query = Filter(actor, q, group); var count = await query.CountAsync(ct);
        var rows = await query.AsNoTracking().OrderBy(target => target.Name).ThenBy(target => target.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var items = new List<object>(); foreach (var target in rows) items.Add(await ViewAsync(actor, target, ct));
        return new { count, page, page_size = pageSize, items };
    }
    // 詳情安全DTO，沒有secret FK或cipher。
    public async Task<object> GetAsync(ClaimsPrincipal principal, Guid id, CancellationToken ct)
    { var actor = await sessions.RequireAsync(principal, cancellationToken: ct); return await ViewAsync(actor, await policy.FindVisibleAsync(actor, id, ct), ct); }
    // Creator取server身分，metadata／secret／FK同交易。
    public async Task<object> CreateAsync(ClaimsPrincipal principal, TargetRequest request, CancellationToken ct)
    {
        var actor = await RequireWriterAsync(principal, ct);
        await using var transaction = await database.Database.BeginTransactionAsync(ct);
        var target = await CreateCoreAsync(actor, request, ct); await transaction.CommitAsync(ct);
        await AuditAsync(AuditAction.TargetChanged, actor.Id, target.Id, true, ct); return await ViewAsync(actor, target, ct);
    }
    // Version與action先檢查，password省略保持、空字串清除。
    public async Task<object> UpdateAsync(ClaimsPrincipal principal, Guid id, TargetRequest request, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct); var target = await policy.FindVisibleAsync(actor, id, ct);
        if (!(await policy.RightsAsync(actor, target, ct)).CanEdit) throw new AuthException("forbidden", 403);
        CheckVersion(target, request.Version); await using var transaction = await database.Database.BeginTransactionAsync(ct);
        await ApplyAsync(target, request, false, ct);
        if (request.Password is { Length: > 0 }) target.PasswordSecretId = (await secrets.StageAsync(target.Id, request.Password, ct)).Id;
        else if (request.Password == "") target.PasswordSecretId = null;
        // 密碼替換可能只有secret row變更，整筆PUT仍必須更新TargetVersion。
        database.Entry(target).Property(item => item.UpdatedAt).IsModified = true;
        await SaveAsync(ct); if (request.Password == "") await secrets.DeleteAsync(target.Id, ct); await transaction.CommitAsync(ct);
        await AuditAsync(AuditAction.TargetChanged, actor.Id, id, true, ct); return await ViewAsync(actor, target, ct);
    }
    // 刪除順序先target／ACL再secret，仍在同一交易。
    public async Task DeleteAsync(ClaimsPrincipal principal, Guid id, int version, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct); var target = await policy.FindVisibleAsync(actor, id, ct);
        if (!(await policy.RightsAsync(actor, target, ct)).CanEdit) throw new AuthException("forbidden", 403);
        CheckVersion(target, version); await using var transaction = await database.Database.BeginTransactionAsync(ct);
        database.Targets.Remove(target); await SaveAsync(ct); await secrets.DeleteAsync(target.Id, ct); await transaction.CommitAsync(ct);
        await AuditAsync(AuditAction.TargetChanged, actor.Id, id, true, ct);
    }
    // ACL只有admin可管理，can_edit不代表可轉授權。
    public async Task<object> GetPermissionsAsync(ClaimsPrincipal principal, Guid id, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var target = await database.Targets.SingleOrDefaultAsync(target => target.Id == id, ct) ?? throw new AuthException("not_found", 404);
        var grants = await database.TargetPermissions.Where(permission => permission.TargetId == id).OrderBy(permission => permission.Id).Select(permission => new
        { user_id = permission.UserId, role = permission.Role, can_connect = permission.CanConnect, can_view_password = permission.CanViewPassword, can_edit = permission.CanEdit }).ToListAsync(ct);
        return new { version = target.Version, grants };
    }
    // 整批驗subject／duplicates／viewer ceiling後才替換ACL，TargetVersion增加。
    public async Task<object> SetPermissionsAsync(ClaimsPrincipal principal, Guid id, TargetPermissionsRequest request, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var target = await policy.FindVisibleAsync(actor, id, ct); CheckVersion(target, request.Version);
        if (request.Grants == null || request.Grants.Length > 50) throw new AuthException("invalid_request", 400);
        var subjects = new HashSet<string>(StringComparer.Ordinal);
        foreach (var grant in request.Grants)
        {
            if (grant == null || grant.UserId.HasValue == (grant.Role != null) || grant.UserId == Guid.Empty
                || grant.Role != null && grant.Role is not ("operator" or "viewer")) throw new AuthException("invalid_request", 400);
            var role = grant.Role;
            if (grant.UserId.HasValue) role = (await database.Users.AsNoTracking().SingleOrDefaultAsync(user => user.Id == grant.UserId, ct))?.Role ?? throw new AuthException("invalid_request", 400);
            if (role == "viewer" && (grant.CanConnect || grant.CanViewPassword || grant.CanEdit)) throw new AuthException("invalid_request", 400);
            if (!subjects.Add(grant.UserId?.ToString() ?? "role:" + grant.Role)) throw new AuthException("invalid_request", 400);
        }
        await using var transaction = await database.Database.BeginTransactionAsync(ct);
        await database.TargetPermissions.Where(permission => permission.TargetId == id).ExecuteDeleteAsync(ct);
        database.TargetPermissions.AddRange(request.Grants.Select(grant => new TargetPermission { TargetId = id, UserId = grant.UserId, Role = grant.Role, CanConnect = grant.CanConnect, CanViewPassword = grant.CanViewPassword, CanEdit = grant.CanEdit }));
        database.Entry(target).Property(item => item.UpdatedAt).IsModified = true; await SaveAsync(ct); await transaction.CommitAsync(ct);
        await AuditAsync(AuditAction.TargetChanged, actor.Id, id, true, ct); return await GetPermissionsAsync(principal, id, ct);
    }
    // CSV與CRUD共用writer角色上限。
    internal async Task<User> RequireWriterAsync(ClaimsPrincipal principal, CancellationToken ct)
    { var actor = await sessions.RequireAsync(principal, cancellationToken: ct); if (actor.Role is not ("admin" or "operator")) throw new AuthException("forbidden", 403); return actor; }
    // 呼叫者交易內建立，不在持交易時enqueue audit。
    internal async Task<Target> CreateCoreAsync(User actor, TargetRequest request, CancellationToken ct)
    {
        var target = new Target { CreatedBy = actor.Id }; await ApplyAsync(target, request, true, ct);
        if (!string.IsNullOrEmpty(request.Password)) target.PasswordSecretId = (await secrets.StageAsync(target.Id, request.Password, ct)).Id;
        database.Targets.Add(target); await SaveAsync(ct); return target;
    }
    // 可見性與metadata篩選不讀祕密。
    internal IQueryable<Target> Filter(User actor, string? q, string? group)
    {
        var query = policy.VisibleTargets(actor);
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(target => target.Name.Contains(q) || target.RustDeskId.Contains(q) || target.Tags.Contains(q));
        if (group != null) query = query.Where(target => target.GroupName == group); return query;
    }
    // 明確投影，password永遠不在DTO裡。
    private async Task<object> ViewAsync(User actor, Target target, CancellationToken ct)
    {
        var rights = await policy.RightsAsync(actor, target, ct);
        return new
        {
            id = target.Id,
            server_id = target.ServerId,
            name = target.Name,
            rustdesk_id = target.RustDeskId,
            group_name = target.GroupName,
            tags = JsonSerializer.Deserialize<string[]>(target.Tags),
            notes = target.Notes,
            created_by = target.CreatedBy,
            has_password = target.PasswordSecretId.HasValue,
            permissions = new { can_connect = rights.CanConnect, can_view_password = rights.CanViewPassword, can_edit = rights.CanEdit },
            version = target.Version,
            created_at = target.CreatedAt,
            updated_at = target.UpdatedAt
        };
    }
    // 只可新選enabled server；舊disabled metadata仍可維護。
    private async Task ApplyAsync(Target target, TargetRequest request, bool creating, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 128 || request.ServerId == Guid.Empty
            || string.IsNullOrEmpty(request.RustDeskId) || request.RustDeskId.Length > 64 || request.RustDeskId.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '_' or '-'))
            || request.GroupName?.Length > 64 || request.Notes?.Length > 2000 || request.Password?.Length > 1024 || request.Tags?.Length > 20
            || request.Tags?.Any(tag => string.IsNullOrWhiteSpace(tag) || tag.Length > 32) == true) throw new AuthException("invalid_request", 400);
        var server = await database.RustDeskServers.AsNoTracking().SingleOrDefaultAsync(server => server.Id == request.ServerId, ct) ?? throw new AuthException("invalid_server", 400);
        if (!server.Enabled && (creating || target.ServerId != request.ServerId)) throw new AuthException("server_disabled", 409);
        if (await database.Targets.AnyAsync(item => item.Id != target.Id && item.ServerId == request.ServerId && item.RustDeskId == request.RustDeskId, ct)) throw new AuthException("target_conflict", 409);
        target.Name = request.Name.Trim(); target.ServerId = request.ServerId; target.RustDeskId = request.RustDeskId;
        target.GroupName = request.GroupName; target.Tags = JsonSerializer.Serialize(request.Tags ?? []); target.Notes = request.Notes;
    }
    // Version只作比較，不由client直接賦值。
    internal static void CheckVersion(Target target, int version) { if (version < 1 || target.Version != version) throw new AuthException("version_conflict", 409); }
    // DB錯誤轉穩定分類，不回SQL。
    internal async Task SaveAsync(CancellationToken ct)
    { try { await database.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { throw new AuthException("version_conflict", 409); } catch (DbUpdateException) { throw new AuthException("target_conflict", 409); } }
    // 稽核只分類／UUID，不含name、RustDeskID、password或CSV。
    internal Task AuditAsync(AuditAction action, Guid actor, Guid id, bool success, CancellationToken ct) => audits.WriteAsync(new(action, success ? AuditResult.Success : AuditResult.Failure,
        actor, new(success ? AuditReason.Completed : AuditReason.Denied), "target", id), ct);
}
