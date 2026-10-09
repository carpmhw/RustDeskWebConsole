using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Security;

public sealed class EncryptedSecretStore(AppDbContext database, Vault vault)
{
    // 目標密碼只以AAD綁定的AES-GCM envelope保存，明文bytes立即清除。
    public async Task SetAsync(Guid targetId, string password, CancellationToken cancellationToken = default)
    {
        await StageAsync(targetId, password, cancellationToken);
        await database.SaveChangesAsync(cancellationToken);
    }
    // Target交易一次保存metadata／FK／secret，避免同一操作增加兩次Version。
    internal async Task<EncryptedSecret> StageAsync(Guid targetId, string password, CancellationToken cancellationToken = default)
    {
        if (password.Length is < 1 or > 1024 || targetId == Guid.Empty) throw new ArgumentException("目標祕密格式無效。");
        var bytes = Encoding.UTF8.GetBytes(password);
        try
        {
            var envelope = vault.Encrypt(bytes, Aad(targetId));
            var row = await database.EncryptedSecrets.SingleOrDefaultAsync(secret => secret.ObjectType == "target" && secret.ObjectId == targetId, cancellationToken);
            if (row == null) { row = new EncryptedSecret { ObjectId = targetId }; database.EncryptedSecrets.Add(row); }
            row.Ciphertext = envelope.Ciphertext; row.Nonce = envelope.Nonce; row.KeyVersion = envelope.KeyVersion;
            return row;
        }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    // 只供內部reveal／login-assist使用，解密錯誤不回顯密文或金鑰。
    public async Task<string?> GetAsync(Guid targetId, CancellationToken cancellationToken = default)
    {
        var row = await database.EncryptedSecrets.SingleOrDefaultAsync(secret => secret.ObjectType == "target" && secret.ObjectId == targetId, cancellationToken);
        if (row == null) return null;
        var bytes = vault.Decrypt(new(row.Ciphertext, row.Nonce, row.KeyVersion), Aad(targetId));
        try { return new UTF8Encoding(false, true).GetString(bytes); }
        catch (DecoderFallbackException) { throw new CryptographicException("目標祕密格式無效。"); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    // 呼叫者可在自己的transaction內移除密文，沒有plaintext side effect。
    public Task<int> DeleteAsync(Guid targetId, CancellationToken cancellationToken = default) => database.EncryptedSecrets
        .Where(secret => secret.ObjectType == "target" && secret.ObjectId == targetId).ExecuteDeleteAsync(cancellationToken);
    // AAD格式唯一且與文化設定無關。
    internal static string Aad(Guid id) => $"target:{id}:password";
}
