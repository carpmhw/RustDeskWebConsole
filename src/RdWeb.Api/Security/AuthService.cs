using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Infrastructure.Kv;

namespace RdWeb.Api.Security;

public sealed record MfaChallenge(Guid UserId, int AuthVersion, DateTime AuthenticatedAt);
public sealed class AuthService(AppDbContext database, PasswordHasher hasher, TokenService tokens, SessionValidator sessions,
    AuthRateLimiter limiter, IKvStore store, AuditWriter audits, TimeProvider clock)
{
    private static readonly Lazy<Task<string>> DummyHash = new(() => new PasswordHasher().HashAsync("public-dummy-authentication-value"));
    public DateTime Now => clock.GetUtcNow().UtcDateTime;

    // 啟動先暖機，避免第一個未知帳號多做一次 hash generation 形成冷啟動時序差異。
    public static Task WarmUpAsync() => DummyHash.Value;

    // 未知／停用／鎖定帳號仍跑昂貴雜湊，帳密通過也不能繞過 MFA。
    public async Task<object> LoginAsync(string username, string password, string ip, CancellationToken cancellationToken)
    {
        var normalized = username.Trim().ToUpperInvariant();
        await limiter.CheckAsync(normalized, ip, cancellationToken);
        var user = await database.Users.SingleOrDefaultAsync(user => user.NormalizedUsername == normalized, cancellationToken);
        var eligible = user != null && user.IsActive && !(user.LockedUntil > Now);
        var valid = await hasher.VerifyAsync(password, eligible ? user!.PasswordHash : await DummyHash.Value);
        if (!eligible || !valid)
        {
            if (user != null && user.IsActive && !(user.LockedUntil > Now)) await RecordFailureAsync(user, cancellationToken);
            await AuditAsync(AuditAction.Login, AuditResult.Failure, user?.Id, AuditReason.InvalidCredentials, ip, cancellationToken);
            throw new AuthException("invalid_credentials");
        }
        if (user!.TotpEnabledAt != null) return new { mfa_required = true, mfa_token = await ChallengeAsync(user, Now, cancellationToken) };
        return await CompleteLoginAsync(user, false, Now, ip, cancellationToken);
    }

    // 五分鐘票證只綁身分與安全版本，不含密碼或 session token。
    public async Task<string> ChallengeAsync(User user, DateTime authenticatedAt, CancellationToken cancellationToken)
    {
        var value = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        await store.SetWithTtlAsync("mfa:" + TokenService.Hash(value), JsonSerializer.Serialize(new MfaChallenge(user.Id, user.AuthVersion, authenticatedAt)), TimeSpan.FromMinutes(5), cancellationToken);
        return value;
    }

    // 完整認證後才清除失敗狀態並建立 session。
    public async Task<SessionGrant> CompleteLoginAsync(User user, bool verified, DateTime authenticatedAt, string ip, CancellationToken cancellationToken)
    {
        user.FailedLoginCount = 0; user.LockedUntil = null; user.LastLoginAt = Now;
        var grant = tokens.Create(user, verified, authenticatedAt: authenticatedAt);
        grant.Token.Ip = ip;
        database.RefreshTokens.Add(grant.Token);
        await database.SaveChangesAsync(cancellationToken);
        await AuditAsync(AuditAction.Login, AuditResult.Success, user.Id, null, ip, cancellationToken);
        return grant;
    }

    // 漸進鎖定落庫；mutation gate 防止並發遺失計數。
    public async Task RecordFailureAsync(User user, CancellationToken cancellationToken)
    {
        user.FailedLoginCount = Math.Min(user.FailedLoginCount + 1, 1000);
        if (user.FailedLoginCount % 5 == 0) user.LockedUntil = Now.AddSeconds(Math.Min(3600, 60 * Math.Pow(2, Math.Min(6, user.FailedLoginCount / 5 - 1))));
        await database.SaveChangesAsync(cancellationToken);
    }

    // 猜測的錯誤摘要不能觸發其他使用者 session 撤銷。
    public async Task<RefreshToken> FindRefreshAsync(string? raw, bool allowRevoked, CancellationToken cancellationToken)
    {
        if (!TokenService.TryParseRefresh(raw, out var id)) throw new AuthException("unauthorized");
        var token = await database.RefreshTokens.SingleOrDefaultAsync(token => token.Id == id, cancellationToken);
        if (token == null || !TokenService.Matches(raw!, token.TokenHash) || token.ExpiresAt <= Now || !allowRevoked && token.RevokedAt != null) throw new AuthException("unauthorized");
        return token;
    }

    // 同交易撤銷舊 refresh 並建立新 token，期限不得延長。
    public async Task<SessionGrant> RefreshAsync(string? raw, CancellationToken cancellationToken)
    {
        var old = await FindRefreshAsync(raw, true, cancellationToken);
        if (old.RevokedAt != null)
        {
            await RevokeFamilyAsync(old.FamilyId, cancellationToken);
            await AuditAsync(AuditAction.Login, AuditResult.Failure, old.UserId, AuditReason.Denied, null, cancellationToken);
            throw new AuthException("unauthorized");
        }
        var user = await database.Users.SingleAsync(user => user.Id == old.UserId, cancellationToken);
        if (!user.IsActive || user.AuthVersion != old.AuthVersion) throw new AuthException("unauthorized");
        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        var grant = tokens.Create(user, old.MfaVerified, old.FamilyId, old.ExpiresAt, old.AuthenticatedAt);
        old.RevokedAt = Now; old.ReplacedById = grant.Token.Id;
        grant.Token.Ip = old.Ip; grant.Token.UserAgent = old.UserAgent;
        database.RefreshTokens.Add(grant.Token);
        await database.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return grant;
    }

    // 登出使 family 的 access 與 refresh 一併立即失效。
    public async Task LogoutAsync(string? raw, CancellationToken cancellationToken)
    {
        var token = await FindRefreshAsync(raw, true, cancellationToken);
        await RevokeFamilyAsync(token.FamilyId, cancellationToken);
        await AuditAsync(AuditAction.Login, AuditResult.Success, token.UserId, AuditReason.Completed, null, cancellationToken);
    }

    // 只修改未撤銷的 family row，同時更新並發版本。
    public Task<int> RevokeFamilyAsync(Guid family, CancellationToken cancellationToken) => database.RefreshTokens.Where(token => token.FamilyId == family && token.RevokedAt == null)
        .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.RevokedAt, Now).SetProperty(token => token.Version, token => token.Version + 1).SetProperty(token => token.UpdatedAt, Now), cancellationToken);

    // 認證狀態改變時撤銷使用者的全部工作階段。
    public Task<int> RevokeUserAsync(Guid id, CancellationToken cancellationToken) => database.RefreshTokens.Where(token => token.UserId == id && token.RevokedAt == null)
        .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.RevokedAt, Now).SetProperty(token => token.Version, token => token.Version + 1).SetProperty(token => token.UpdatedAt, Now), cancellationToken);

    // 絕不將包含 hash／secret 的 EF 實體直接回傳。
    public async Task<object> MeAsync(User user, bool verified, CancellationToken cancellationToken) => new
    { id = user.Id, username = user.Username, role = user.Role, totp_enabled = user.TotpEnabledAt != null, mfa_enrollment_required = !await sessions.IsFullAsync(user, verified, cancellationToken) };

    // 只記分類原因、已解析身分及來源，不記認證輸入。
    public Task AuditAsync(AuditAction action, AuditResult result, Guid? userId, AuditReason? reason, string? ip, CancellationToken cancellationToken, Guid? objectId = null, string objectType = "user")
        => audits.WriteAsync(new(action, result, userId, new(reason), userId.HasValue ? objectType : null, objectId ?? userId, SourceIp: ip), cancellationToken);
}
