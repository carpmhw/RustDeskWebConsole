using System.Security.Cryptography;
using System.Text;

namespace RdWeb.Api.Security;

public sealed record EncryptedValue(byte[] Ciphertext, byte[] Nonce, int KeyVersion);
public sealed class Vault(byte[] key, int version = 1)
{
    public int KeyVersion => version;
    // 隨機 nonce 與列身分 AAD 避免重複密文及跨列交換。
    public EncryptedValue Encrypt(byte[] plaintext, string aad)
    {
        if (key.Length != 32 || version < 1) throw new CryptographicException("Vault 設定無效。");
        var nonce = RandomNumberGenerator.GetBytes(12);
        var ciphertext = new byte[plaintext.Length + 16];
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plaintext, ciphertext.AsSpan(0, plaintext.Length), ciphertext.AsSpan(plaintext.Length), Encoding.UTF8.GetBytes(aad));
        return new(ciphertext, nonce, version);
    }
    // 拒絕錯誤版本與任何篡改，失敗時清除解密緩衝。
    public byte[] Decrypt(EncryptedValue value, string aad)
    {
        if (key.Length != 32 || value.KeyVersion != version || value.Nonce.Length != 12 || value.Ciphertext.Length < 16)
            throw new CryptographicException("Vault 資料無效。");
        var plaintext = new byte[value.Ciphertext.Length - 16];
        try
        {
            using var aes = new AesGcm(key, 16);
            aes.Decrypt(value.Nonce, value.Ciphertext.AsSpan(0, plaintext.Length), value.Ciphertext.AsSpan(plaintext.Length), plaintext, Encoding.UTF8.GetBytes(aad));
            return plaintext;
        }
        catch { CryptographicOperations.ZeroMemory(plaintext); throw new CryptographicException("Vault 資料驗證失敗。"); }
    }
}
