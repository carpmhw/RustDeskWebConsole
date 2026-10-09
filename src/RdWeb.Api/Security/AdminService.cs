using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;

namespace RdWeb.Api.Security;

public sealed class AdminService(AppDbContext database, SessionValidator sessions, MfaService mfa, AuthService auth, PasswordHasher hasher)
{
    // 列表僅選安全欄位，operator／viewer 不可使用。
    public async Task<object> ListAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        return await database.Users.AsNoTracking().OrderBy(user => user.NormalizedUsername).Select(user => new
        { id = user.Id, username = user.Username, email = user.Email, role = user.Role, is_active = user.IsActive, totp_enabled = user.TotpEnabledAt != null }).ToListAsync(ct);
    }
    // 新使用者沿用 Argon2id，唯一性由 SQLite 與 normalized username 保證。
    public async Task<object> CreateAsync(ClaimsPrincipal principal, CreateUserRequest request, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        var normalized = request.Username.ToUpperInvariant();
        if (await database.Users.AnyAsync(user => user.NormalizedUsername == normalized, ct)) throw new AuthException("username_conflict", 409);
        var user = new User { Username = request.Username, NormalizedUsername = normalized, Email = request.Email, Role = request.Role, PasswordHash = await hasher.HashAsync(request.Password) };
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
        if (active != user.IsActive || role != user.Role) { user.AuthVersion++; await auth.RevokeUserAsync(user.Id, ct); }
        user.IsActive = active; user.Role = role;
        if (request.Email != null) user.Email = request.Email.Length == 0 ? null : request.Email;
        await database.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
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
        user.PasswordHash = hash; user.AuthVersion++; user.FailedLoginCount = 0; user.LockedUntil = null;
        await auth.RevokeUserAsync(user.Id, ct); await database.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
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
        await auth.AuditAsync(AuditAction.SettingsChanged, AuditResult.Success, actor.Id, null, ip, ct, setting.Id, "setting");
        return new { require_mfa = request.RequireMfa };
    }
    // 不存在的管理目標返回固定錯誤，不附資料庫細節。
    private async Task<User> FindAsync(Guid id, CancellationToken ct) => await database.Users.SingleOrDefaultAsync(user => user.Id == id, ct) ?? throw new AuthException("not_found", 404);
    // 單一使用者回應也不能意外序列化敏感實體欄位。
    private static object View(User user) => new { id = user.Id, username = user.Username, email = user.Email, role = user.Role, is_active = user.IsActive, totp_enabled = user.TotpEnabledAt != null };
}
