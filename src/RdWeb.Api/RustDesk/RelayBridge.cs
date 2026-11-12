using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Channels;
using RdWeb.Api.Endpoints;

namespace RdWeb.Api.RustDesk;

public sealed record RelayTotals(long BrowserToTargetBytes, long TargetToBrowserBytes);
public sealed class RelayProgress
{
    public long BrowserToTargetBytes;
    public long TargetToBrowserBytes;
    // 讀取已成功交付的流量，故障時也供coordinator稽核使用。
    public RelayTotals Snapshot() => new(Interlocked.Read(ref BrowserToTargetBytes), Interlocked.Read(ref TargetToBrowserBytes));
}

public sealed class RelayBridge
{
    public const int ChunkSize = 16 * 1024;
    public const int QueueCapacity = 16;
    public static readonly TimeSpan ProgressTimeout = TimeSpan.FromSeconds(30);
    // 結束時等待瀏覽器回應 close 的上限；超過即釋放，不無限等待。
    public static readonly TimeSpan CloseAckTimeout = TimeSpan.FromSeconds(2);
    private sealed record Chunk(byte[] Data, int Count, bool End);

    // 兩方向各自bounded producer/consumer；任何方向終止均取消另一方向。
    // drain 觸發時先切斷上游（不再轉送任何輸入），交由 closeBrowser 送出 close，再繼續讀取並丟棄瀏覽器資料直到收到其 close
    // （上限 CloseAckTimeout）。不取消瀏覽器端 pending receive：中止仍有未讀輸入的 socket 會送出 RST，經代理後瀏覽器只看到 1006。
    public async Task<RelayTotals> RunAsync(WebSocket browser, IRustDeskUpstreamSession upstream,
        CancellationToken cancellationToken, RelayProgress? progress = null, RelayReady? ready = null,
        CancellationToken drain = default, Func<Task>? closeBrowser = null)
    {
        progress ??= new RelayProgress();
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var upstreamLifetime = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        var draining = 0;
        var toBrowser = CreateQueue();
        var toTarget = CreateQueue();
        var readTarget = ProduceAsync(upstream.TcpRelayStream, upstream.WebSocketRelay, toBrowser.Writer, true, upstream.Transport, upstreamLifetime.Token);
        var readBrowser = ProduceAsync(null, browser, toTarget.Writer, false, upstream.Transport, lifetime.Token,
            upstreamLifetime.Token, () => Volatile.Read(ref draining) == 1);
        var sendBrowser = ConsumeAsync(null, browser, toBrowser.Reader, true, upstream.Transport, progress, lifetime.Token, ready);
        var sendTarget = ConsumeAsync(upstream.TcpRelayStream, upstream.WebSocketRelay, toTarget.Reader, false, upstream.Transport, progress, upstreamLifetime.Token, ready);
        var consumers = new[] { sendBrowser, sendTarget };
        var drainRequested = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var drainRegistration = drain.Register(() => drainRequested.TrySetResult());
        try
        {
            var relayEnded = Task.WhenAny(consumers);
            if (await Task.WhenAny(relayEnded, drainRequested.Task) == relayEnded)
            {
                await await relayEnded;
                cancellationToken.ThrowIfCancellationRequested();
                return progress.Snapshot();
            }
            Volatile.Write(ref draining, 1);
            await upstreamLifetime.CancelAsync();
            // 已排入的畫面在上限內送完，避免與 close frame 交錯；之後不再有新資料。
            await Task.WhenAny(sendBrowser, Task.Delay(CloseAckTimeout, CancellationToken.None));
            if (closeBrowser != null) await closeBrowser();
            await Task.WhenAny(readBrowser, Task.Delay(CloseAckTimeout, CancellationToken.None));
            return progress.Snapshot();
        }
        finally
        {
            lifetime.Cancel();
            try { await Task.WhenAll(readTarget, readBrowser, sendBrowser, sendTarget); }
            catch { /* 主consumer錯誤由上方回傳；收尾不覆蓋原始故障。 */ }
        }
    }

    // 每格只有一個固定16KiB buffer，不依外部frame長度配置。
    private static Channel<Chunk> CreateQueue() => Channel.CreateBounded<Chunk>(new BoundedChannelOptions(QueueCapacity)
    {
        SingleReader = true,
        SingleWriter = true,
        FullMode = BoundedChannelFullMode.Wait
    });

    // 接收stream或WS fragment，TCP只驗framing長度，WS保留EndOfMessage。
    // writeToken 只控制寫入佇列（預設同 cancellationToken）；discard 為真時讀到的資料直接丟棄，用於結束時排空瀏覽器端。
    private static async Task ProduceAsync(Stream? stream, WebSocket? socket, ChannelWriter<Chunk> output,
        bool remote, string transport, CancellationToken cancellationToken, CancellationToken writeToken = default, Func<bool>? discard = null)
    {
        if (!writeToken.CanBeCanceled) writeToken = cancellationToken;
        var first = true;
        var pairingWatch = Stopwatch.StartNew();
        var messageOpen = false;
        long messageSize = 0;
        var framing = transport == "tcp" ? new FrameTracker() : null;
        try
        {
            while (true)
            {
                var buffer = new byte[ChunkSize];
                using var pairTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                if (remote && first)
                {
                    var remaining = ProgressTimeout - pairingWatch.Elapsed;
                    if (remaining <= TimeSpan.Zero) throw new TimeoutException("Relay pairing timed out.");
                    pairTimeout.CancelAfter(remaining);
                }
                int count;
                var end = true;
                try
                {
                    if (stream != null)
                    {
                        count = await stream.ReadAsync(buffer, pairTimeout.Token);
                        if (count == 0)
                        {
                            framing?.Complete();
                            if (remote && first) throw new EndOfStreamException("Peer closed before relay data.");
                            break;
                        }
                    }
                    else
                    {
                        var result = await socket!.ReceiveAsync(buffer.AsMemory(), pairTimeout.Token);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            framing?.Complete();
                            if (messageOpen) throw new InvalidDataException("Relay message truncated.");
                            if (remote && first) throw new EndOfStreamException("Peer closed before relay data.");
                            break;
                        }
                        if (result.MessageType != WebSocketMessageType.Binary) throw new InvalidDataException("Binary relay data required.");
                        count = result.Count;
                        end = result.EndOfMessage;
                        messageOpen = !end;
                    }
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    throw new TimeoutException("Relay pairing timed out.");
                }
                if (framing != null) framing.Accept(buffer.AsSpan(0, count));
                else
                {
                    messageSize += count;
                    if (messageSize > RustDeskByteStreamCodec.MaxRelayFrameLength) throw new InvalidDataException("Relay message too large.");
                    if (end) messageSize = 0;
                }
                if (remote && first && count == 0) continue;
                if (count > 0) first = false;
                if (discard?.Invoke() == true) continue;
                // 保留零長度WS最後fragment，否則可能合併兩個message。
                using var queueTimeout = CancellationTokenSource.CreateLinkedTokenSource(writeToken);
                queueTimeout.CancelAfter(ProgressTimeout);
                try { await output.WriteAsync(new(buffer, count, transport == "tcp" || end), queueTimeout.Token); }
                catch (OperationCanceledException) when (discard?.Invoke() == true) { continue; }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new TimeoutException("Relay backpressure timed out."); }
            }
            output.TryComplete();
        }
        catch (Exception failure)
        {
            output.TryComplete(failure);
        }
    }

    // 消費queue時才計數成功交付；ready固定先於首個peer binary chunk。
    private static async Task ConsumeAsync(Stream? stream, WebSocket? socket, ChannelReader<Chunk> input,
        bool browser, string transport, RelayProgress progress, CancellationToken cancellationToken, RelayReady? metadata)
    {
        var ready = false;
        await foreach (var chunk in input.ReadAllAsync(cancellationToken))
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ProgressTimeout);
            try
            {
                if (browser && !ready && chunk.Count > 0)
                {
                    var control = metadata == null
                        ? JsonSerializer.SerializeToUtf8Bytes(new { type = "rdweb.ready", protocol = "rustdesk/1.4.2", transport })
                        : JsonSerializer.SerializeToUtf8Bytes(new
                        {
                            type = "rdweb.ready",
                            protocol = "rustdesk/1.4.2",
                            transport,
                            connection_id = metadata.ConnectionId,
                            target_id = metadata.TargetId,
                            rustdesk_id = metadata.Peer.RustDeskId,
                            peer_signing_key = metadata.Peer.SigningKey
                        });
                    await socket!.SendAsync(control.AsMemory(), WebSocketMessageType.Text, true, timeout.Token);
                    ready = true;
                }
                if (stream != null) await stream.WriteAsync(chunk.Data.AsMemory(0, chunk.Count), timeout.Token);
                else await socket!.SendAsync(chunk.Data.AsMemory(0, chunk.Count), WebSocketMessageType.Binary, chunk.End, timeout.Token);
                if (browser) Interlocked.Add(ref progress.TargetToBrowserBytes, chunk.Count);
                else Interlocked.Add(ref progress.BrowserToTargetBytes, chunk.Count);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new TimeoutException("Relay send timed out."); }
        }
    }

    private sealed class FrameTracker
    {
        private readonly byte[] _header = new byte[4];
        private int _headerCount;
        private int _remaining;
        // 增量追蹤TCP frame，只保留最多4-byte header，不檢查內層加密資料。
        public void Accept(ReadOnlySpan<byte> bytes)
        {
            while (!bytes.IsEmpty)
            {
                if (_remaining > 0)
                {
                    var skip = Math.Min(_remaining, bytes.Length);
                    _remaining -= skip;
                    bytes = bytes[skip..];
                }
                else
                {
                    _header[_headerCount++] = bytes[0];
                    bytes = bytes[1..];
                    if (RustDeskByteStreamCodec.TryDecodeHeader(_header.AsSpan(0, _headerCount), RustDeskByteStreamCodec.MaxRelayFrameLength, out _, out var length))
                    { _remaining = length; _headerCount = 0; }
                }
            }
        }
        // 正常EOF不得把未完整frame當成成功傳輸。
        public void Complete()
        {
            if (_remaining != 0 || _headerCount != 0) throw new InvalidDataException("Relay frame truncated.");
        }
    }
}
