using NSec.Cryptography;

namespace RdWeb.Api.Security;

public static class ServerSignatureVerifier
{
    // libsodium 驗證 Ed25519；長度或格式不符一律拒絕，不降級連線。
    public static bool Verify(ReadOnlySpan<byte> key, ReadOnlySpan<byte> message, ReadOnlySpan<byte> signature)
    {
        var algorithm = SignatureAlgorithm.Ed25519;
        return key.Length == algorithm.PublicKeySize && signature.Length == algorithm.SignatureSize
            && PublicKey.TryImport(algorithm, key, KeyBlobFormat.RawPublicKey, out var publicKey)
            && publicKey is not null
            && algorithm.Verify(publicKey, message, signature);
    }
}
