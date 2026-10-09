using Google.Protobuf;
using Hbb;
using NSec.Cryptography;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public static class PeerIdentityVerifier
{
    // 驗證hbbs attached IdPk簽章與預期RustDesk ID，任何格式錯誤均不回身份。
    public static bool TryVerify(ReadOnlySpan<byte> serverPublicKey, ReadOnlySpan<byte> attachedSignedIdPk, string expectedTargetId, out IdPk? identity)
    {
        identity = null;
        var algorithm = SignatureAlgorithm.Ed25519;
        if (string.IsNullOrWhiteSpace(expectedTargetId)
            || attachedSignedIdPk.Length <= algorithm.SignatureSize
            || attachedSignedIdPk.Length > RustDeskByteStreamCodec.MaxControlFrameLength)
            return false;

        var signature = attachedSignedIdPk[..algorithm.SignatureSize];
        var message = attachedSignedIdPk[algorithm.SignatureSize..];
        if (!ServerSignatureVerifier.Verify(serverPublicKey, message, signature)) return false;

        IdPk parsed;
        try
        {
            parsed = IdPk.Parser.ParseFrom(message.ToArray());
        }
        catch (InvalidProtocolBufferException)
        {
            return false;
        }

        if (!StringComparer.Ordinal.Equals(parsed.Id, expectedTargetId) || parsed.Pk.Length != 32) return false;
        identity = parsed;
        return true;
    }
}
