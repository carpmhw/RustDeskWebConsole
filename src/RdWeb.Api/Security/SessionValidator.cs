using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Security;

public sealed class SessionValidator(IDbContextFactory<AppDbContext> factory, TimeProvider clock)
{
    // 每次查 active／安全版本／角色及 live family，撤銷立即生效。
    public async Task<User?> ValidateAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var id) || !Guid.TryParse(principal.FindFirstValue("sid"), out var family)
            || !int.TryParse(principal.FindFirstValue("av"), out var version)) return null;
        await using var database = await factory.CreateDbContextAsync(cancellationToken);
        var user = await database.Users.AsNoTracking().SingleOrDefaultAsync(user => user.Id == id, cancellationToken);
        if (user == null || !user.IsActive || user.AuthVersion != version || user.Role != principal.FindFirstValue("role")) return null;
        var now = clock.GetUtcNow().UtcDateTime;
        var verified = principal.FindFirstValue("mfa") == "1";
        return await database.RefreshTokens.AnyAsync(token => token.UserId == id && token.FamilyId == family && token.AuthVersion == version
            && token.MfaVerified == verified && token.RevokedAt == null && token.ExpiresAt > now, cancellationToken) ? user : null;
    }

    // 在寫入 gate 內再次驗證，避免等待中的 request 沿用已撤銷權限。
    public async Task<User> RequireAsync(ClaimsPrincipal principal, bool full = true, bool admin = false, CancellationToken cancellationToken = default)
    {
        var user = await ValidateAsync(principal, cancellationToken) ?? throw new AuthException("unauthorized");
        if (full && !await IsFullAsync(user, principal.FindFirstValue("mfa") == "1", cancellationToken)) throw new AuthException("mfa_enrollment_required", 403);
        if (admin && user.Role != "admin") throw new AuthException("forbidden", 403);
        return user;
    }

    // 依即時政策限制 password-only session，不能靠前端繞過。
    public async Task<bool> IsFullAsync(User user, bool verified, CancellationToken cancellationToken = default)
    {
        if (user.TotpEnabledAt != null) return verified;
        var policy = await PolicyAsync(cancellationToken);
        return policy == "off" || policy == "admins" && user.Role != "admin";
    }

    // 損壞政策必須 fail closed，不默默停用 MFA。
    public async Task<string> PolicyAsync(CancellationToken cancellationToken = default)
    {
        await using var database = await factory.CreateDbContextAsync(cancellationToken);
        var setting = await database.SystemSettings.AsNoTracking().SingleOrDefaultAsync(setting => setting.Key == "require_mfa", cancellationToken);
        if (setting == null) return "off";
        try { var value = JsonSerializer.Deserialize<string>(setting.Value); if (value is "off" or "admins" or "all") return value; }
        catch (JsonException) { }
        throw new AuthException("service_unavailable", 503);
    }
}
