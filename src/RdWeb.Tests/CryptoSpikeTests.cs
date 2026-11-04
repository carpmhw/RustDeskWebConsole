using Google.Protobuf;
using Hbb;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class CryptoSpikeTests
{
    // Browser公開wire fixtures須由獨立Google.Protobuf encoder交叉確認。
    [Fact]
    public void BrowserLoginFixturesMatchPinnedSchema()
    {
        var hash = new Message { Hash = new Hash { Salt = "s", Challenge = "c" } };
        Assert.Equal(new byte[] { 0x4a, 6, 0x0a, 1, 115, 0x12, 1, 99 }, hash.ToByteArray());
        var identity = new IdPk { Id = "123456789", Pk = ByteString.CopyFrom(new byte[32]) };
        Assert.Equal(new byte[] { 10, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 18, 32 }.Concat(new byte[32]), identity.ToByteArray());
    }

    // RFC 8032 公開向量只包含公鑰與簽章，不儲存任何測試私鑰。
    [Fact]
    public void Ed25519AcceptsPublicVectorAndRejectsTampering()
    {
        var key = Convert.FromHexString("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
        var signature = Convert.FromHexString("e5564300c360ac729086e2cc806e828a" + "84877f1eb8e5d974d873e06522490155" + "5fb8821590a33bacc61e39701cf9b46b" + "d25bf5f0595bbe24655141438e7a100b");
        Assert.True(ServerSignatureVerifier.Verify(key, [], signature));
        Assert.False(ServerSignatureVerifier.Verify(key, [1], signature));
        signature[0] ^= 1;
        Assert.False(ServerSignatureVerifier.Verify(key, [], signature));
        Assert.False(ServerSignatureVerifier.Verify([1], [], signature));
    }

    // 由完整上游 proto 生成的 rendezvous 與受控端訊息皆可往返序列化。
    [Fact]
    public void UpstreamProtobufRoundTrip()
    {
        var message = new RendezvousMessage { PunchHoleRequest = new PunchHoleRequest { Id = "123456789", ForceRelay = true } };
        var decoded = RendezvousMessage.Parser.ParseFrom(message.ToByteArray());
        Assert.Equal("123456789", decoded.PunchHoleRequest.Id);
        Assert.True(decoded.PunchHoleRequest.ForceRelay);
        var peer = new Message { Hash = new Hash { Salt = "public-spike-salt", Challenge = "public-spike-challenge" } };
        Assert.Equal(peer, Message.Parser.ParseFrom(peer.ToByteArray()));
    }

    // 測試探測封包必須與上游生成的 OnlineRequest／Response 位元組相符。
    [Fact]
    public void OnlineProbeFixturesMatchUpstreamSchema()
    {
        var request = new RendezvousMessage { OnlineRequest = new OnlineRequest { Peers = { "123456789" } } };
        Assert.Equal(Convert.FromHexString("ba010b1209313233343536373839"), request.ToByteArray());
        var response = new RendezvousMessage { OnlineResponse = new OnlineResponse { States = ByteString.CopyFrom(new byte[] { 0x80 }) } };
        Assert.Equal(Convert.FromHexString("c201030a0180"), response.ToByteArray());
    }
}
