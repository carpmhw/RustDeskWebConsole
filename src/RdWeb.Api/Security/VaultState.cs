using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Security;

public static class VaultState
{
    internal const string CheckKey = "vault_key_check";
    internal const string VersionKey = "vault_key_version";
    internal const string CheckAad = "system:vault-key-check";
    private static readonly byte[] CheckValue = Encoding.UTF8.GetBytes("rdweb-vault-check-v1");

    // 接受HTTP前綁定及驗證key，不把key／fingerprint保存至DB。
    public static async Task InitializeAsync(AppDbContext database, Vault vault, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
            var check = await database.SystemSettings.SingleOrDefaultAsync(setting => setting.Key == CheckKey, cancellationToken);
            var version = await database.SystemSettings.SingleOrDefaultAsync(setting => setting.Key == VersionKey, cancellationToken);
            if (check == null && version == null)
            {
                // M1舊資料也需驗key，不能用新key建立check掩蓋不可讀的既有secret。
                foreach (var user in await database.Users.Where(user => user.TotpSecretEnc != null).ToListAsync(cancellationToken))
                    VerifyEnvelope(vault, new(user.TotpSecretEnc!, user.TotpNonce ?? [], user.TotpKeyVersion ?? 0), $"user:{user.Id}:totp");
                foreach (var secret in await database.EncryptedSecrets.ToListAsync(cancellationToken))
                    VerifyEnvelope(vault, new(secret.Ciphertext, secret.Nonce, secret.KeyVersion), EncryptedSecretStore.Aad(secret.ObjectId));
                await WriteCheckAsync(database, vault, cancellationToken);
                await database.SaveChangesAsync(cancellationToken);
            }
            else
            {
                if (check == null || version == null || JsonSerializer.Deserialize<int>(version.Value) != vault.KeyVersion) throw new CryptographicException();
                ValidateCheck(vault, JsonSerializer.Deserialize<EncryptedValue>(check.Value) ?? throw new CryptographicException());
            }
            await transaction.CommitAsync(cancellationToken);
        }
        catch (OperationCanceledException) { throw; }
        catch { throw new InvalidOperationException("Vault 金鑰或版本與資料庫不一致。"); }
    }
    // CLI在同一transaction更新check與version，沒有明文key落庫。
    internal static async Task WriteCheckAsync(AppDbContext database, Vault vault, CancellationToken cancellationToken)
    {
        foreach (var (key, value) in new[] { (CheckKey, JsonSerializer.Serialize(vault.Encrypt(CheckValue, CheckAad))), (VersionKey, JsonSerializer.Serialize(vault.KeyVersion)) })
        {
            var setting = await database.SystemSettings.SingleOrDefaultAsync(item => item.Key == key, cancellationToken);
            if (setting == null) { setting = new SystemSetting { Key = key }; database.SystemSettings.Add(setting); }
            setting.Value = value;
        }
    }
    // 固定已知文字只作驗key，錯key／AAD／版本同樣fail closed。
    internal static void ValidateCheck(Vault vault, EncryptedValue envelope)
    {
        var bytes = vault.Decrypt(envelope, CheckAad);
        try { if (!CryptographicOperations.FixedTimeEquals(bytes, CheckValue)) throw new CryptographicException(); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    // 驗證既有envelope後即清除，不讀取或輸出任何內容。
    private static void VerifyEnvelope(Vault vault, EncryptedValue envelope, string aad)
    { var bytes = vault.Decrypt(envelope, aad); CryptographicOperations.ZeroMemory(bytes); }
}
