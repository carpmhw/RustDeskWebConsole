using System.Security.Cryptography;
using System.Text;

namespace RdWeb.Api.Security;

public static class RecoveryCodes
{
    // 產生十組高熵備援碼，明文只能在建立時回傳一次。
    public static string[] Generate() => Enumerable.Range(0, 10).Select(_ => Convert.ToHexString(RandomNumberGenerator.GetBytes(16))).ToArray();
    // 資料庫只保存標準化備援碼的 SHA-256 摘要。
    public static string Hash(string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code.Replace("-", "", StringComparison.Ordinal).ToUpperInvariant())));
}
