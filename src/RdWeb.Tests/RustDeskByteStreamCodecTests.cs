using System.IO;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class RustDeskByteStreamCodecTests
{
    // BytesCodec長度header必須符合固定hbb_common版本的編碼界線。
    [Fact]
    public void EncodeHeaderMatchesPinnedBytesCodecBoundaries()
    {
        Assert.Equal(new byte[] { 0xfc }, RustDeskByteStreamCodec.EncodeHeader(63));
        Assert.Equal(new byte[] { 0x01, 0x01 }, RustDeskByteStreamCodec.EncodeHeader(64));
        Assert.Equal(new byte[] { 0xfd, 0xff }, RustDeskByteStreamCodec.EncodeHeader(16_383));
        Assert.Equal(new byte[] { 0x02, 0x00, 0x01 }, RustDeskByteStreamCodec.EncodeHeader(16_384));
    }

    // 解碼器遇到不完整的little-endian header時必須等待後續資料。
    [Fact]
    public void TryDecodeHeaderWaitsForAllHeaderBytes()
    {
        Assert.False(RustDeskByteStreamCodec.TryDecodeHeader([0x01], 64 * 1024, out _, out _));
        Assert.True(RustDeskByteStreamCodec.TryDecodeHeader([0x01, 0x01], 64 * 1024, out var headerLength, out var payloadLength));
        Assert.Equal(2, headerLength);
        Assert.Equal(64, payloadLength);
    }

    // 空message與最短header皆須保留BytesCodec原始語意。
    [Fact]
    public void TryDecodeHeaderAcceptsEmptyPayload()
    {
        Assert.True(RustDeskByteStreamCodec.TryDecodeHeader([0x00], 64 * 1024, out var headerLength, out var payloadLength));
        Assert.Equal(1, headerLength);
        Assert.Equal(0, payloadLength);
    }

    // 超過control或relay frame上限的長度必須在配置payload前拒絕。
    [Fact]
    public void TryDecodeHeaderRejectsPayloadAboveLimit()
    {
        var header = RustDeskByteStreamCodec.EncodeHeader(64 * 1024 + 1);
        Assert.Throws<InvalidDataException>(() => RustDeskByteStreamCodec.TryDecodeHeader(header, 64 * 1024, out _, out _));
    }

    // Relay frame長度也必須在建立payload buffer前受64MiB界線限制。
    [Fact]
    public void TryDecodeHeaderRejectsOversizedRelayFrame()
    {
        var header = RustDeskByteStreamCodec.EncodeHeader(64 * 1024 * 1024 + 1);
        Assert.Throws<InvalidDataException>(() => RustDeskByteStreamCodec.TryDecodeHeader(header, RustDeskByteStreamCodec.MaxRelayFrameLength, out _, out _));
    }

    // Control frame即使header與payload被TCP逐byte切分仍須完整讀取。
    [Fact]
    public async Task ControlFrameRoundTripsAcrossOneByteReads()
    {
        var expected = new byte[] { 0x00, 0x7f, 0x80, 0xff };
        await using var written = new MemoryStream();
        await RustDeskByteStreamCodec.WriteControlFrameAsync(written, expected, CancellationToken.None);
        await using var fragmented = new OneBytePerReadStream(written.ToArray());

        var actual = await RustDeskByteStreamCodec.ReadControlFrameAsync(fragmented, CancellationToken.None);

        Assert.Equal(expected, actual);
    }

    // 超大control header應在讀取payload前失敗，避免依宣告長度配置記憶體。
    [Fact]
    public async Task ReadControlFrameRejectsOversizedLengthBeforePayload()
    {
        var header = RustDeskByteStreamCodec.EncodeHeader(RustDeskByteStreamCodec.MaxControlFrameLength + 1);
        await using var source = new MemoryStream(header);

        await Assert.ThrowsAsync<InvalidDataException>(async () =>
            await RustDeskByteStreamCodec.ReadControlFrameAsync(source, CancellationToken.None));
    }

    // 不合法長度不得溢位或產生無效BytesCodec header。
    [Fact]
    public void EncodeHeaderRejectsNegativeAndOversizedLengths()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => RustDeskByteStreamCodec.EncodeHeader(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => RustDeskByteStreamCodec.EncodeHeader(0x4000_0000));
    }

    // 測試stream模擬TCP每次只回傳一個byte的分段情形。
    private sealed class OneBytePerReadStream(byte[] contents) : MemoryStream(contents)
    {
        // 每次非同步讀取最多提供一個byte。
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
            => base.ReadAsync(buffer[..Math.Min(1, buffer.Length)], cancellationToken);
    }
}
