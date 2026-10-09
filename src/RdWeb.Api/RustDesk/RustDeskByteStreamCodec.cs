namespace RdWeb.Api.RustDesk;

public static class RustDeskByteStreamCodec
{
    public const int MaxControlFrameLength = 64 * 1024;
    public const int MaxRelayFrameLength = 64 * 1024 * 1024;
    private const int MaxEncodableFrameLength = 0x3fff_ffff;

    // 依固定BytesCodec格式產生最短little-endian封包長度header。
    public static byte[] EncodeHeader(int payloadLength)
    {
        if (payloadLength is < 0 or > MaxEncodableFrameLength)
            throw new ArgumentOutOfRangeException(nameof(payloadLength));

        var headerLength = payloadLength <= 0x3f ? 1
            : payloadLength <= 0x3fff ? 2
            : payloadLength <= 0x3fffff ? 3
            : 4;
        var encoded = ((uint)payloadLength << 2) | (uint)(headerLength - 1);
        var header = new byte[headerLength];
        for (var index = 0; index < headerLength; index++)
            header[index] = (byte)(encoded >> (index * 8));
        return header;
    }

    // 增量解碼header；資料未完整時回傳false，超限長度立即拒絕。
    public static bool TryDecodeHeader(ReadOnlySpan<byte> header, int maximumPayloadLength, out int headerLength, out int payloadLength)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(maximumPayloadLength);
        headerLength = 0;
        payloadLength = 0;
        if (header.IsEmpty) return false;

        var requiredLength = (header[0] & 0x03) + 1;
        if (header.Length < requiredLength) return false;

        uint encoded = 0;
        for (var index = 0; index < requiredLength; index++)
            encoded |= (uint)header[index] << (index * 8);
        var decodedLength = encoded >> 2;
        if (decodedLength > MaxEncodableFrameLength || decodedLength > maximumPayloadLength)
            throw new InvalidDataException("RustDesk frame length exceeds the configured limit.");

        headerLength = requiredLength;
        payloadLength = (int)decodedLength;
        return true;
    }

    // 從可能碎片化的stream讀完整header，再回傳受限的frame長度。
    public static async ValueTask<int> ReadFrameLengthAsync(Stream source, int maximumPayloadLength, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);
        var header = new byte[4];
        await source.ReadExactlyAsync(header.AsMemory(0, 1), cancellationToken);
        var requiredLength = (header[0] & 0x03) + 1;
        if (requiredLength > 1)
            await source.ReadExactlyAsync(header.AsMemory(1, requiredLength - 1), cancellationToken);
        if (!TryDecodeHeader(header.AsSpan(0, requiredLength), maximumPayloadLength, out _, out var payloadLength))
            throw new InvalidDataException("RustDesk frame header is incomplete.");
        return payloadLength;
    }

    // 控制訊息上限固定為64KiB，避免依不可信header配置大型buffer。
    public static async ValueTask<byte[]> ReadControlFrameAsync(Stream source, CancellationToken cancellationToken = default)
    {
        var length = await ReadFrameLengthAsync(source, MaxControlFrameLength, cancellationToken);
        var payload = new byte[length];
        await source.ReadExactlyAsync(payload, cancellationToken);
        return payload;
    }

    // 寫出受限控制訊息的BytesCodec header及payload。
    public static async ValueTask WriteControlFrameAsync(Stream destination, ReadOnlyMemory<byte> payload, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(destination);
        if (payload.Length > MaxControlFrameLength)
            throw new InvalidDataException("RustDesk control frame exceeds the configured limit.");
        await destination.WriteAsync(EncodeHeader(payload.Length), cancellationToken);
        await destination.WriteAsync(payload, cancellationToken);
    }

    // 以固定16KiB buffer複製指定frame payload，不配置整個relay frame。
    public static async ValueTask CopyExactlyAsync(Stream source, Stream destination, int length, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(destination);
        if (length is < 0 or > MaxRelayFrameLength)
            throw new InvalidDataException("RustDesk relay frame exceeds the configured limit.");

        var buffer = new byte[16 * 1024];
        var remaining = length;
        while (remaining > 0)
        {
            var count = Math.Min(buffer.Length, remaining);
            var read = await source.ReadAsync(buffer.AsMemory(0, count), cancellationToken);
            if (read == 0) throw new EndOfStreamException("RustDesk relay frame ended early.");
            await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            remaining -= read;
        }
    }
}
