using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Security;

public sealed record RotationResult(int TotpCount, int SecretCount, int KeyVersion);
public static class KeyRotation
{
    // 全資料與keycheck同交易，任何錯誤回滾；不更改使用者AuthVersion。
    public static async Task<RotationResult> RotateAsync(AppDbContext database, Vault oldVault, Vault newVault, CancellationToken cancellationToken = default)
    {
        try
        {
            if (oldVault.KeyVersion < 1 || newVault.KeyVersion <= oldVault.KeyVersion) throw new CryptographicException();
            await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
            var check = await database.SystemSettings.SingleOrDefaultAsync(setting => setting.Key == VaultState.CheckKey, cancellationToken);
            var version = await database.SystemSettings.SingleOrDefaultAsync(setting => setting.Key == VaultState.VersionKey, cancellationToken);
            if (check != null || version != null)
            {
                if (check == null || version == null || JsonSerializer.Deserialize<int>(version.Value) != oldVault.KeyVersion) throw new CryptographicException();
                VaultState.ValidateCheck(oldVault, JsonSerializer.Deserialize<EncryptedValue>(check.Value) ?? throw new CryptographicException());
            }
            var users = await database.Users.Where(user => user.TotpSecretEnc != null || user.TotpNonce != null || user.TotpKeyVersion != null || user.TotpEnabledAt != null).ToListAsync(cancellationToken);
            var secrets = await database.EncryptedSecrets.ToListAsync(cancellationToken);
            foreach (var user in users)
            {
                var next = Reencrypt(oldVault, newVault, new(user.TotpSecretEnc ?? [], user.TotpNonce ?? [], user.TotpKeyVersion ?? 0), $"user:{user.Id}:totp");
                user.TotpSecretEnc = next.Ciphertext; user.TotpNonce = next.Nonce; user.TotpKeyVersion = next.KeyVersion;
            }
            foreach (var secret in secrets)
            {
                var next = Reencrypt(oldVault, newVault, new(secret.Ciphertext, secret.Nonce, secret.KeyVersion), EncryptedSecretStore.Aad(secret.ObjectId));
                secret.Ciphertext = next.Ciphertext; secret.Nonce = next.Nonce; secret.KeyVersion = next.KeyVersion;
            }
            await VaultState.WriteCheckAsync(database, newVault, cancellationToken);
            database.AuditLogs.Add(new AuditLog { Action = "VaultRotated", Result = "Success", ObjectType = "setting", Detail = "{}" });
            await database.SaveChangesAsync(cancellationToken); await transaction.CommitAsync(cancellationToken);
            return new(users.Count, secrets.Count, newVault.KeyVersion);
        }
        catch (OperationCanceledException) { database.ChangeTracker.Clear(); throw; }
        catch { database.ChangeTracker.Clear(); throw new InvalidOperationException("Vault 輪替失敗，資料未變更。"); }
    }
    // 明文只留短命bytes，reencrypt成功或失敗都清除。
    private static EncryptedValue Reencrypt(Vault oldVault, Vault newVault, EncryptedValue value, string aad)
    {
        var bytes = oldVault.Decrypt(value, aad);
        try { return newVault.Encrypt(bytes, aad); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
}
