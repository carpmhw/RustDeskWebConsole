using System.Security.Cryptography;
namespace RdWeb.Api.RustDesk;

public static class RustDeskLoginProof
{
    // 只產生最後一層RustDesk proof，中間hash於finally清除。
    public static byte[] Compute(ReadOnlySpan<byte> password, ReadOnlySpan<byte> salt, ReadOnlySpan<byte> challenge)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(password); hash.AppendData(salt);
        var intermediate = hash.GetHashAndReset();
        try { hash.AppendData(intermediate); hash.AppendData(challenge); return hash.GetHashAndReset(); }
        finally { CryptographicOperations.ZeroMemory(intermediate); }
    }
}
