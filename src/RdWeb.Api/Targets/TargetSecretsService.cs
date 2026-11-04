using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Api.Targets;

public sealed class TargetSecretsService(AppDbContext database, SessionValidator sessions, TargetPolicy policy,
    MfaService mfa, EncryptedSecretStore secrets, TargetService targets)
{
    // 權限先於proof，明文只在當次成功回應，不建立可重播二次驗證票證。
    public async Task<object> RevealAsync(ClaimsPrincipal principal, Guid id, ReauthenticationRequest proof, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct);
        try
        {
            var target = await policy.FindVisibleAsync(actor, id, ct);
            if (!(await policy.RightsAsync(actor, target, ct)).CanViewPassword) throw new AuthException("forbidden", 403);
            if (!target.PasswordSecretId.HasValue) throw new AuthException("password_not_set", 404);
            await mfa.ReauthenticateAsync(await mfa.LoadAsync(actor.Id, ct), proof, ip, ct);
            if (!await database.EncryptedSecrets.AnyAsync(secret => secret.Id == target.PasswordSecretId && secret.ObjectId == id && secret.ObjectType == "target", ct))
                throw new CryptographicException("目標祕密綁定無效。");
            var password = await secrets.GetAsync(id, ct) ?? throw new AuthException("password_not_set", 404);
            await targets.AuditAsync(AuditAction.PasswordViewed, actor.Id, id, true, ct);
            return new { password, expires_in = 30 };
        }
        catch (AuthException) { await targets.AuditAsync(AuditAction.PasswordViewed, actor.Id, id, false, ct); throw; }
        catch (CryptographicException) { await targets.AuditAsync(AuditAction.PasswordViewed, actor.Id, id, false, ct); throw; }
    }
}
