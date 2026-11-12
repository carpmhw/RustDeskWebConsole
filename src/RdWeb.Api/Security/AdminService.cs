using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.RustDesk;

namespace RdWeb.Api.Security;

public sealed class AdminService(AppDbContext database, SessionValidator sessions, MfaService mfa, AuthService auth, PasswordHasher hasher,
    ActiveConnectionRegistry connections)
{
    // 列表僅選安全欄位，operator／viewer 不可使用。
    public async Task<object> ListAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        return await database.Users.AsNoTracking().OrderBy(user => user.NormalizedUsername).Select(user => new
        { id = user.Id, username = user.Username, email = user.Email, role = user.Role, is_active = user.IsActive, totp_enabled = user.TotpEnabledAt != null, password_change_required = user.PasswordChangeRequired }).ToListAsync(ct);
    }
    // 新使用者沿用 Argon2id，唯一性由 SQLite 與 normalized username 保證。
    public async Task<object> CreateAsync(ClaimsPrincipal principal, CreateUserRequest request, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var normalized = request.Username.ToUpperInvariant();
        if (await database.Users.AnyAsync(user => user.NormalizedUsername == normalized, ct)) throw new AuthException("username_conflict", 409);
        var user = new User { Username = request.Username, NormalizedUsername = normalized, Email = request.Email, Role = request.Role, PasswordHash = await hasher.HashAsync(request.Password), PasswordChangeRequired = true };
        database.Users.Add(user); await database.SaveChangesAsync(ct);
        await auth.AuditAsync(AuditAction.UserChanged, AuditResult.Success, actor.Id, null, ip, ct, user.Id);
        return View(user);
    }
    // 不得停用或降權最後有效 admin；權限變更同步撤銷認證。
    public async Task<object> UpdateAsync(ClaimsPrincipal principal, Guid id, UpdateUserRequest request, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var user = await FindAsync(id, ct);
        var active = request.IsActive ?? user.IsActive; var role = request.Role ?? user.Role;
        if (user.Role == "admin" && user.IsActive && (!active || role != "admin") && await database.Users.CountAsync(item => item.IsActive && item.Role == "admin", ct) <= 1)
            throw new AuthException("last_admin", 409);
        await using var transaction = await database.Database.BeginTransactionAsync(ct);
        var revoke = active != user.IsActive || role != user.Role;
        if (revoke) { user.AuthVersion++; await auth.RevokeUserAsync(user.Id, ct); }
        user.IsActive = active; user.Role = role;
        if (request.Email != null) user.Email = request.Email.Length == 0 ? null : request.Email;
        await database.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        if (revoke) connections.Terminate(grant => grant.UserId == user.Id);
        await auth.AuditAsync(AuditAction.UserChanged, AuditResult.Success, actor.Id, null, ip, ct, user.Id);
        return View(user);
    }
    // 管理員重設密碼必須二次驗證，不能透過既有 token 偷渡更改。
    public async Task ResetPasswordAsync(ClaimsPrincipal principal, Guid id, ResetPasswordRequest request, string ip, CancellationToken ct)
    {
        var actor = await mfa.LoadAsync((await sessions.RequireAsync(principal, admin: true, cancellationToken: ct)).Id, ct);
        await mfa.ReauthenticateAsync(actor, new(request.Password, request.Code), ip, ct);
        var user = await FindAsync(id, ct); var hash = await hasher.HashAsync(request.NewPassword);
        await using var transaction = await database.Database.BeginTransactionAsync(ct);
        // 管理員交付的密碼只能用一次；對自己重設則是自己決定的密碼，不要求再改。
        user.PasswordHash = hash; user.PasswordChangeRequired = user.Id != actor.Id; user.AuthVersion++; user.FailedLoginCount = 0; user.LockedUntil = null;
        await auth.RevokeUserAsync(user.Id, ct); await database.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        connections.Terminate(grant => grant.UserId == user.Id);
        await auth.AuditAsync(AuditAction.UserChanged, AuditResult.Success, actor.Id, null, ip, ct, user.Id);
    }
    // 管理員只能重設他人 MFA，不能繞過自己的強制 MFA 流程。
    public async Task ResetTotpAsync(ClaimsPrincipal principal, Guid id, ReauthenticationRequest request, string ip, CancellationToken ct)
    {
        var actor = await mfa.LoadAsync((await sessions.RequireAsync(principal, admin: true, cancellationToken: ct)).Id, ct);
        if (actor.Id == id) throw new AuthException("forbidden", 403);
        await mfa.ReauthenticateAsync(actor, request, ip, ct);
        await mfa.ResetAsync(await FindAsync(id, ct), ct);
        await auth.AuditAsync(AuditAction.Mfa, AuditResult.Success, actor.Id, null, ip, ct, id);
    }
    // 安全設定只允許完整認證 admin 讀取。
    public async Task<object> GetSecurityAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        return new { require_mfa = await sessions.PolicyAsync(ct) };
    }
    // 政策由資料庫即時檢查，更新後現有 session 立即受新限制。
    public async Task<object> SetSecurityAsync(ClaimsPrincipal principal, SecuritySettingRequest request, string ip, CancellationToken ct)
    {
        var actor = await mfa.LoadAsync((await sessions.RequireAsync(principal, admin: true, cancellationToken: ct)).Id, ct);
        await mfa.ReauthenticateAsync(actor, new(request.Password, request.Code), ip, ct);
        var setting = await database.SystemSettings.SingleOrDefaultAsync(item => item.Key == "require_mfa", ct);
        if (setting == null) { setting = new SystemSetting { Key = "require_mfa" }; database.SystemSettings.Add(setting); }
        setting.Value = JsonSerializer.Serialize(request.RequireMfa);
        await database.SaveChangesAsync(ct);
        // 政策即時生效：依各連線綁定的MFA狀態重算完整登入，不再符合者立即終止；放寬時不會有新不符者。
        foreach (var grant in connections.Grants(_ => true))
        {
            var user = await database.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == grant.UserId, ct);
            if (user == null || !user.IsActive || !await sessions.IsFullAsync(user, grant.Session?.MfaVerified == true, ct))
                connections.Terminate(candidate => candidate == grant);
        }
        await auth.AuditAsync(AuditAction.SettingsChanged, AuditResult.Success, actor.Id, null, ip, ct, setting.Id, "setting");
        return new { require_mfa = request.RequireMfa };
    }
    // 讀取網頁閒置登出設定；僅管理員。
    public async Task<object> GetSessionSettingAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        return new { idle_minutes = await SessionService.ReadIdleMinutesAsync(database, ct) };
    }
    // 修改網頁閒置登出設定：0 表示關閉，其餘須為 30–1440 分鐘，並完成管理員二次驗證。
    public async Task<object> SetSessionSettingAsync(ClaimsPrincipal principal, SessionSettingRequest request, string ip, CancellationToken ct)
    {
        var actor = await mfa.LoadAsync((await sessions.RequireAsync(principal, admin: true, cancellationToken: ct)).Id, ct);
        if (request.IdleMinutes is > 0 and < SessionService.MinIdleMinutes) throw new AuthException("invalid_request", 400);
        await mfa.ReauthenticateAsync(actor, new(request.Password, request.Code), ip, ct);
        var setting = await database.SystemSettings.SingleOrDefaultAsync(item => item.Key == SessionService.IdleMinutesKey, ct);
        if (setting == null) { setting = new SystemSetting { Key = SessionService.IdleMinutesKey }; database.SystemSettings.Add(setting); }
        setting.Value = JsonSerializer.Serialize(request.IdleMinutes);
        await database.SaveChangesAsync(ct);
        await auth.AuditAsync(AuditAction.SettingsChanged, AuditResult.Success, actor.Id, null, ip, ct, null, "setting");
        return new { idle_minutes = request.IdleMinutes };
    }
    // 讀取連線管控設定；僅管理員。
    public async Task<object> GetConnectionSettingAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var settings = await ConnectionPolicy.ReadAsync(database, ct);
        return new { idle_minutes = settings.IdleMinutes, max_hours = settings.MaxHours };
    }
    // 主控台閒置倒數只需閒置分鐘數，所有完整登入者可讀。
    public async Task<object> GetIdleSettingAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, cancellationToken: ct);
        return new { idle_minutes = (await ConnectionPolicy.ReadAsync(database, ct)).IdleMinutes };
    }
    // 修改連線管控設定：0 表示關閉，其餘值須在範圍內（閒置 5–480 分鐘、上限 1–24 小時），並完成管理員二次驗證。
    public async Task<object> SetConnectionSettingAsync(ClaimsPrincipal principal, ConnectionSettingRequest request, string ip, CancellationToken ct)
    {
        var actor = await mfa.LoadAsync((await sessions.RequireAsync(principal, admin: true, cancellationToken: ct)).Id, ct);
        if (request.IdleMinutes is > 0 and < 5) throw new AuthException("invalid_request", 400);
        await mfa.ReauthenticateAsync(actor, new(request.Password, request.Code), ip, ct);
        foreach (var (key, value) in new[] { (ConnectionPolicy.IdleMinutesKey, request.IdleMinutes), (ConnectionPolicy.MaxHoursKey, request.MaxHours) })
        {
            var setting = await database.SystemSettings.SingleOrDefaultAsync(item => item.Key == key, ct);
            if (setting == null) { setting = new SystemSetting { Key = key }; database.SystemSettings.Add(setting); }
            setting.Value = JsonSerializer.Serialize(value);
        }
        await database.SaveChangesAsync(ct);
        await auth.AuditAsync(AuditAction.SettingsChanged, AuditResult.Success, actor.Id, null, ip, ct, null, "setting");
        return new { idle_minutes = request.IdleMinutes, max_hours = request.MaxHours };
    }
    // 讀取稽核保留天數；僅管理員。
    public async Task<object> GetAuditSettingAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        return new { retention_days = await AuditRetention.ReadAsync(database, ct) };
    }
    // 縮短保留天數等同刪除資料，必須完成管理員二次驗證並留下稽核。
    public async Task<object> SetAuditSettingAsync(ClaimsPrincipal principal, AuditSettingRequest request, string ip, CancellationToken ct)
    {
        var actor = await mfa.LoadAsync((await sessions.RequireAsync(principal, admin: true, cancellationToken: ct)).Id, ct);
        await mfa.ReauthenticateAsync(actor, new(request.Password, request.Code), ip, ct);
        var setting = await database.SystemSettings.SingleOrDefaultAsync(item => item.Key == AuditRetention.Key, ct);
        if (setting == null) { setting = new SystemSetting { Key = AuditRetention.Key }; database.SystemSettings.Add(setting); }
        setting.Value = JsonSerializer.Serialize(request.RetentionDays);
        await database.SaveChangesAsync(ct);
        await auth.AuditAsync(AuditAction.SettingsChanged, AuditResult.Success, actor.Id, null, ip, ct, setting.Id, "setting");
        return new { retention_days = request.RetentionDays };
    }
    // 不存在的管理目標返回固定錯誤，不附資料庫細節。
    private async Task<User> FindAsync(Guid id, CancellationToken ct) => await database.Users.SingleOrDefaultAsync(user => user.Id == id, ct) ?? throw new AuthException("not_found", 404);
    // 單一使用者回應也不能意外序列化敏感實體欄位。
    private static object View(User user) => new { id = user.Id, username = user.Username, email = user.Email, role = user.Role, is_active = user.IsActive, totp_enabled = user.TotpEnabledAt != null, password_change_required = user.PasswordChangeRequired };
}
