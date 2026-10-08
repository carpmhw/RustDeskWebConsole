using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace RdWeb.Api.Security;

public sealed class PasswordHasher
{
    private const string Prefix = "$argon2id$v=19$m=65536,t=3,p=1$";

    // 以隨機鹽和固定資安參數輸出可攜 PHC 格式，不暴露中間值。
    public async Task<string> HashAsync(string password)
    {
        if (password.Length is < 12 or > 1024)
        {
            throw new ArgumentException("密碼長度需為 12 至 1024 字元。", nameof(password));
        }
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = await DeriveAsync(password, salt);
        return Prefix + Encode(salt) + "$" + Encode(hash);
    }

    // 只接受已支援的有限參數，避免遭竄改的雜湊字串造成記憶體耗盡。
    public async Task<bool> VerifyAsync(string password, string encoded)
    {
        if (password.Length > 1024 || encoded.Length > 256 || !encoded.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return false;
        }
        var parts = encoded[Prefix.Length..].Split('$');
        if (parts.Length != 2)
        {
            return false;
        }
        try
        {
            var salt = Decode(parts[0]);
            var expected = Decode(parts[1]);
            if (salt.Length != 16 || expected.Length != 32)
            {
                return false;
            }
            var actual = await DeriveAsync(password, salt);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    // 將密碼轉換成短命位元組並在派生後清除，64 MiB／三輪／單一 lane。
    private static async Task<byte[]> DeriveAsync(string password, byte[] salt)
    {
        var bytes = Encoding.UTF8.GetBytes(password);
        try
        {
            using var argon = new Argon2id(bytes) { Salt = salt, MemorySize = 65536, Iterations = 3, DegreeOfParallelism = 1 };
            return await argon.GetBytesAsync(32);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    // PHC 的 Base64 不帶 padding，保留與其他 Argon2 實作交換的能力。
    private static string Encode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=');

    // 恢復 PHC Base64 padding，非法內容由呼叫端統一拒絕。
    private static byte[] Decode(string text) => Convert.FromBase64String(text.PadRight((text.Length + 3) / 4 * 4, '='));
}
