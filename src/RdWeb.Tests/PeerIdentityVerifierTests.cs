using System.Security.Cryptography;
using Google.Protobuf;
using Hbb;
using NSec.Cryptography;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class PeerIdentityVerifierTests
{
    // 只有hbbs server key簽署的target IdPk可以通過驗證。
    [Fact]
    public void VerifyAttachedIdentityAcceptsExpectedTarget()
    {
        using var key = Key.Create(SignatureAlgorithm.Ed25519);
        var peerKey = RandomNumberGenerator.GetBytes(32);
        var payload = new IdPk { Id = "123456789", Pk = ByteString.CopyFrom(peerKey) }.ToByteArray();
        var attached = SignAttached(key, payload);
        var publicKey = key.PublicKey.Export(KeyBlobFormat.RawPublicKey);

        var valid = PeerIdentityVerifier.TryVerify(publicKey, attached, "123456789", out var identity);

        Assert.True(valid);
        Assert.NotNull(identity);
        Assert.Equal("123456789", identity.Id);
        Assert.Equal(peerKey, identity.Pk.ToByteArray());
        CryptographicOperations.ZeroMemory(peerKey);
    }

    // 簽章payload／簽章本身／server公鑰遭竄改都必須拒絕。
    [Fact]
    public void VerifyAttachedIdentityRejectsTamperingAndWrongServerKey()
    {
        using var key = Key.Create(SignatureAlgorithm.Ed25519);
        using var wrongKey = Key.Create(SignatureAlgorithm.Ed25519);
        var payload = new IdPk { Id = "123456789", Pk = ByteString.CopyFrom(new byte[32]) }.ToByteArray();
        var attached = SignAttached(key, payload);
        var publicKey = key.PublicKey.Export(KeyBlobFormat.RawPublicKey);

        var changedSignature = attached.ToArray();
        changedSignature[0] ^= 1;
        var changedPayload = attached.ToArray();
        changedPayload[^1] ^= 1;

        Assert.False(PeerIdentityVerifier.TryVerify(publicKey, changedSignature, "123456789", out _));
        Assert.False(PeerIdentityVerifier.TryVerify(publicKey, changedPayload, "123456789", out _));
        Assert.False(PeerIdentityVerifier.TryVerify(wrongKey.PublicKey.Export(KeyBlobFormat.RawPublicKey), attached, "123456789", out _));
    }

    // 目標ID不符、key長度錯誤或attached簽章不足長度皆fail closed。
    [Fact]
    public void VerifyAttachedIdentityRejectsWrongIdAndMalformedKeyMaterial()
    {
        using var key = Key.Create(SignatureAlgorithm.Ed25519);
        var payload = new IdPk { Id = "123456789", Pk = ByteString.CopyFrom(new byte[32]) }.ToByteArray();
        var attached = SignAttached(key, payload);
        var publicKey = key.PublicKey.Export(KeyBlobFormat.RawPublicKey);

        Assert.False(PeerIdentityVerifier.TryVerify(publicKey, attached, "987654321", out _));
        Assert.False(PeerIdentityVerifier.TryVerify(publicKey, attached[..^1], "123456789", out _));
        Assert.False(PeerIdentityVerifier.TryVerify(publicKey, new byte[63], "123456789", out _));
        Assert.False(PeerIdentityVerifier.TryVerify(publicKey, SignAttached(key, new IdPk { Id = "123456789", Pk = ByteString.CopyFrom(new byte[31]) }.ToByteArray()), "123456789", out _));
    }

    // libsodium attached形式為64-byte簽章接protobuf payload，不寫入或輸出私鑰。
    private static byte[] SignAttached(Key key, byte[] payload)
    {
        var signature = SignatureAlgorithm.Ed25519.Sign(key, payload);
        var attached = new byte[signature.Length + payload.Length];
        signature.CopyTo(attached, 0);
        payload.CopyTo(attached, signature.Length);
        return attached;
    }
}
