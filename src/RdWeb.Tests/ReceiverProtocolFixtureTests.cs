using Google.Protobuf;
using Hbb;

namespace RdWeb.Tests;

public sealed class ReceiverProtocolFixtureTests
{
    // 用獨立Google.Protobuf編碼交叉核對Node測試的手寫公開wire，不含任何私鑰或實際裝置資料。
    [Fact]
    public void ReceiverRendezvousFixturesMatchPinnedSchema()
    {
        Assert.Equal(new byte[] { 50, 13, 10, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 16, 1 },
            new RendezvousMessage { RegisterPeer = new RegisterPeer { Id = "123456789", Serial = 1 } }.ToByteArray());
        Assert.Equal(new byte[] { 122, 17, 10, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 18, 1, 1, 26, 1, 2 },
            new RendezvousMessage { RegisterPk = new RegisterPk { Id = "123456789", Uuid = ByteString.CopyFrom(new byte[] { 1 }), Pk = ByteString.CopyFrom(new byte[] { 2 }) } }.ToByteArray());
        Assert.Equal(new byte[] { 146, 1, 6, 18, 1, 117, 50, 1, 107 },
            new RendezvousMessage { RequestRelay = new RequestRelay { Uuid = "u", LicenceKey = "k" } }.ToByteArray());
        Assert.Equal(new byte[] { 154, 1, 17, 18, 1, 117, 34, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 1, 118 },
            new RendezvousMessage { RelayResponse = new RelayResponse { Uuid = "u", Id = "123456789", Version = "v" } }.ToByteArray());
    }
}
