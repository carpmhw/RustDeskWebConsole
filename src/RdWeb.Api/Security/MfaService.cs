using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OtpNet;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Infrastructure.Kv;

namespace RdWeb.Api.Security;

public sealed class MfaService(AppDbContext database, Vault vault, TotpService totp, PasswordHasher hasher, TokenService tokens,
    SessionValidator sessions, AuthService auth, AuthRateLimiter limiter, IKvStore store)
{
    // 身分驗證後重新取得追蹤實體，避免修改 detached 的安全快照。
    public async Task<User> LoadAsync(Guid id, CancellationToken cancellationToken) => await database.Users.SingleAsync(user => user.Id == id, cancellationToken);

    // 綁定先二次驗證密碼，secret 只短暫回傳、KV 保存加密 envelope。
    public async Task<object> EnrollAsync(User user, string password, string ip, CancellationToken cancellationToken)
    {
        if (user.TotpEnabledAt != null) throw new AuthException("totp_already_enabled", 409);
        await ReauthenticateAsync(user, new(password, null), ip, cancellationToken);
        var secret = RandomNumberGenerator.GetBytes(20);
        try
        {
            var encoded = Base32Encoding.ToString(secret);
            var encrypted = vault.Encrypt(secret, Aad(user.Id));
            await store.SetWithTtlAsync("totp_enroll:" + user.Id, JsonSerializer.Serialize(encrypted), TimeSpan.FromMinutes(10), cancellationToken);
            await auth.AuditAsync(AuditAction.Mfa, AuditResult.Success, user.Id, null, ip, cancellationToken);
            return new
            {
                secret = encoded,
                otpauth_uri = "otpauth://totp/" + Uri.EscapeDataString("RdWeb:" + user.Username)
                + "?secret=" + encoded + "&issuer=RdWeb&algorithm=SHA1&digits=6&period=30"
            };
        }
        finally { CryptographicOperations.ZeroMemory(secret); }
    }

    // 確認一次性 pending，啟用與撤銷舊 session／新 session／備援碼同交易。
    public async Task<(SessionGrant Grant, string[] Codes)> ConfirmAsync(User user, string code, string ip, CancellationToken cancellationToken)
    {
        if (user.TotpEnabledAt != null) throw new AuthException("totp_already_enabled", 409);
        await limiter.CheckAsync(user.NormalizedUsername, ip, cancellationToken, "mfa");
        if (user.LockedUntil > auth.Now) throw new AuthException("invalid_mfa");
        var pending = await store.TakeOnceAsync("totp_enroll:" + user.Id, cancellationToken);
        if (pending == null) throw new AuthException("invalid_mfa");
        var encrypted = JsonSerializer.Deserialize<EncryptedValue>(pending) ?? throw new AuthException("invalid_mfa");
        if (!await VerifyTotpAsync(user.Id, encrypted, code, cancellationToken))
        { await auth.RecordFailureAsync(user, cancellationToken); throw new AuthException("invalid_mfa"); }
        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        user.TotpSecretEnc = encrypted.Ciphertext; user.TotpNonce = encrypted.Nonce; user.TotpKeyVersion = encrypted.KeyVersion;
        user.TotpEnabledAt = auth.Now; user.AuthVersion++; user.FailedLoginCount = 0; user.LockedUntil = null;
        await auth.RevokeUserAsync(user.Id, cancellationToken);
        var codes = await ReplaceRecoveryAsync(user.Id, cancellationToken);
        var grant = tokens.Create(user, true);
        database.RefreshTokens.Add(grant.Token);
        await database.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await auth.AuditAsync(AuditAction.Mfa, AuditResult.Success, user.Id, AuditReason.Completed, ip, cancellationToken);
        return (grant, codes);
    }

    // 每次消耗 MFA 票證，錯誤驗證提供新票證但保留原始五分鐘期限。
    public async Task<object> VerifyLoginAsync(string challenge, string code, string ip, CancellationToken cancellationToken)
    {
        await limiter.CheckIpAsync(ip, cancellationToken, "mfa");
        var raw = await store.TakeOnceAsync("mfa:" + TokenService.Hash(challenge), cancellationToken);
        if (raw == null)
        {
            await auth.AuditAsync(AuditAction.Mfa, AuditResult.Failure, null, AuditReason.Expired, ip, cancellationToken);
            throw new AuthException("invalid_mfa");
        }
        var payload = JsonSerializer.Deserialize<MfaChallenge>(raw) ?? throw new AuthException("invalid_mfa");
        var user = await LoadAsync(payload.UserId, cancellationToken);
        if (!user.IsActive || user.AuthVersion != payload.AuthVersion || user.TotpEnabledAt == null
            || user.LockedUntil > auth.Now || payload.AuthenticatedAt < auth.Now.AddMinutes(-5)) throw new AuthException("invalid_mfa");
        await limiter.CheckAccountAsync(user.NormalizedUsername, cancellationToken, "mfa");
        var valid = await VerifyTotpAsync(user.Id, Envelope(user), code, cancellationToken);
        if (!valid && code.Length >= 32)
        {
            var hash = RecoveryCodes.Hash(code);
            valid = await database.RecoveryCodes.Where(item => item.UserId == user.Id && item.CodeHash == hash && item.UsedAt == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.UsedAt, auth.Now).SetProperty(item => item.Version, item => item.Version + 1)
                    .SetProperty(item => item.UpdatedAt, auth.Now), cancellationToken) == 1;
        }
        if (!valid)
        {
            await auth.RecordFailureAsync(user, cancellationToken);
            await auth.AuditAsync(AuditAction.Mfa, AuditResult.Failure, user.Id, AuditReason.InvalidCredentials, ip, cancellationToken);
            return new MfaRetry(user.LockedUntil > auth.Now ? null : await auth.ChallengeAsync(user, payload.AuthenticatedAt, cancellationToken));
        }
        return await auth.CompleteLoginAsync(user, true, payload.AuthenticatedAt, ip, cancellationToken);
    }

    // 敏感操作的二次驗證亦限流、鎖定與 TOTP 重播保護。
    public async Task ReauthenticateAsync(User user, ReauthenticationRequest proof, string ip, CancellationToken cancellationToken)
    {
        await limiter.CheckAsync(user.NormalizedUsername, ip, cancellationToken, "reauth");
        var valid = proof.Password != null && await hasher.VerifyAsync(proof.Password, user.PasswordHash);
        if (!valid && proof.Code != null && user.TotpEnabledAt != null) valid = await VerifyTotpAsync(user.Id, Envelope(user), proof.Code, cancellationToken);
        if (!valid || user.LockedUntil > auth.Now)
        {
            if (!(user.LockedUntil > auth.Now)) await auth.RecordFailureAsync(user, cancellationToken);
            await auth.AuditAsync(AuditAction.Mfa, AuditResult.Failure, user.Id, AuditReason.InvalidCredentials, ip, cancellationToken);
            throw new AuthException("invalid_credentials");
        }
    }

    // 停用不得繞過最新強制政策，成功後要求重新登入。
    public async Task DisableAsync(User user, ReauthenticationRequest proof, string ip, CancellationToken cancellationToken)
    {
        await ReauthenticateAsync(user, proof, ip, cancellationToken);
        var policy = await sessions.PolicyAsync(cancellationToken);
        if (policy == "all" || policy == "admins" && user.Role == "admin") throw new AuthException("mfa_required", 403);
        await ResetAsync(user, cancellationToken);
        await auth.AuditAsync(AuditAction.Mfa, AuditResult.Success, user.Id, AuditReason.Completed, ip, cancellationToken);
    }

    // 管理員重設與本人停用共用原子清除／撤銷流程，呼叫者先完成權限驗證。
    public async Task ResetAsync(User user, CancellationToken cancellationToken)
    {
        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        user.TotpSecretEnc = null; user.TotpNonce = null; user.TotpKeyVersion = null; user.TotpEnabledAt = null; user.AuthVersion++;
        await database.RecoveryCodes.Where(item => item.UserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        await auth.RevokeUserAsync(user.Id, cancellationToken);
        await database.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await store.TakeOnceAsync("totp_enroll:" + user.Id, cancellationToken);
    }

    // 舊備援碼同交易全部作廢，新碼只由當次回應顯示。
    public async Task<string[]> RegenerateAsync(User user, ReauthenticationRequest proof, string ip, CancellationToken cancellationToken)
    {
        if (user.TotpEnabledAt == null) throw new AuthException("totp_not_enabled", 409);
        await ReauthenticateAsync(user, proof, ip, cancellationToken);
        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        var codes = await ReplaceRecoveryAsync(user.Id, cancellationToken);
        await database.SaveChangesAsync(cancellationToken); await transaction.CommitAsync(cancellationToken);
        await auth.AuditAsync(AuditAction.Mfa, AuditResult.Success, user.Id, AuditReason.Completed, ip, cancellationToken);
        return codes;
    }

    // TOTP 驗證與 counter 原子記錄共用於登入、確認與二次驗證。
    private async Task<bool> VerifyTotpAsync(Guid userId, EncryptedValue envelope, string code, CancellationToken cancellationToken)
    {
        var secret = vault.Decrypt(envelope, Aad(userId));
        try
        {
            return totp.Verify(secret, code, auth.Now, out var counter)
            && await store.SetIfAbsentWithTtlAsync($"totp_used:{userId}:{counter}", "used", TimeSpan.FromSeconds(90), cancellationToken);
        }
        finally { CryptographicOperations.ZeroMemory(secret); }
    }

    // 執行在呼叫者的交易內，只有摘要入庫。
    private async Task<string[]> ReplaceRecoveryAsync(Guid userId, CancellationToken cancellationToken)
    {
        await database.RecoveryCodes.Where(item => item.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        var codes = RecoveryCodes.Generate();
        database.RecoveryCodes.AddRange(codes.Select(code => new RecoveryCode { UserId = userId, CodeHash = RecoveryCodes.Hash(code) }));
        return codes;
    }

    // AAD 明確綁定使用者，格式不依文化設定。
    private static string Aad(Guid id) => $"user:{id}:totp";
    // 只從已啟用資料建立 envelope，缺漏視為儲存故障。
    private static EncryptedValue Envelope(User user) => new(user.TotpSecretEnc ?? throw new CryptographicException(), user.TotpNonce ?? throw new CryptographicException(), user.TotpKeyVersion ?? 0);
}
public sealed record MfaRetry(string? Token);
