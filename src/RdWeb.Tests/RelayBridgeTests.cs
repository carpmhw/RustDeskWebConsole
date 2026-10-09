using System.Net.WebSockets;
using System.Threading.Channels;
using Hbb;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class RelayBridgeTests
{
    // 未收到任何peer資料即斷線不能視為配對成功。
    [Fact]
    public async Task PeerClosingBeforeDataDoesNotReportSuccess()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var browser = new ScriptSocket();
        using var peer = new ScriptSocket();
        peer.Input.Writer.TryWrite(new([], WebSocketMessageType.Close, true));
        await using var upstream = new SocketSession(peer);
        await Assert.ThrowsAsync<EndOfStreamException>(() => new RelayBridge().RunAsync(browser, upstream, timeout.Token));
        Assert.False(browser.Output.Reader.TryRead(out _));
    }

    // WS的半個message遇到EOF須回報截斷，不能把不完整加密資料當正常close。
    [Fact]
    public async Task IncompleteWebSocketMessageIsRejectedAtClose()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var browser = new ScriptSocket();
        using var peer = new ScriptSocket();
        peer.Input.Writer.TryWrite(new([1], WebSocketMessageType.Binary, false));
        peer.Input.Writer.TryWrite(new([], WebSocketMessageType.Close, true));
        await using var upstream = new SocketSession(peer);
        await Assert.ThrowsAsync<InvalidDataException>(() => new RelayBridge().RunAsync(browser, upstream, timeout.Token));
    }

    // WS轉送須保留兩個fragment的順序及message boundary，不追加BytesCodec header。
    [Fact]
    public async Task WebSocketFragmentsPreservePayloadAndEndOfMessage()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var browser = new ScriptSocket();
        using var peer = new ScriptSocket();
        peer.Input.Writer.TryWrite(new([1, 2], WebSocketMessageType.Binary, false));
        peer.Input.Writer.TryWrite(new([3], WebSocketMessageType.Binary, true));
        peer.Input.Writer.TryWrite(new([], WebSocketMessageType.Close, true));
        await using var upstream = new SocketSession(peer);

        var totals = await new RelayBridge().RunAsync(browser, upstream, timeout.Token);

        var ready = await browser.Output.Reader.ReadAsync(timeout.Token);
        Assert.Equal(WebSocketMessageType.Text, ready.Type);
        Assert.Contains("\"transport\":\"ws\"", System.Text.Encoding.UTF8.GetString(ready.Data));
        var first = await browser.Output.Reader.ReadAsync(timeout.Token);
        var second = await browser.Output.Reader.ReadAsync(timeout.Token);
        Assert.Equal(new byte[] { 1, 2 }, first.Data);
        Assert.False(first.End);
        Assert.Equal(new byte[] { 3 }, second.Data);
        Assert.True(second.End);
        Assert.Equal(3, totals.TargetToBrowserBytes);
    }

    // TCP資料只保留原始BytesCodec byte stream，ready先於第一批binary資料。
    [Fact]
    public async Task TcpBridgePreservesByteStreamAndReportsTransport()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var browser = new ScriptSocket();
        var bytes = new byte[] { 0x0c, 1, 2, 3 };
        await using var upstream = new TcpSession(new MemoryStream(bytes));

        var totals = await new RelayBridge().RunAsync(browser, upstream, timeout.Token);

        var ready = await browser.Output.Reader.ReadAsync(timeout.Token);
        Assert.Contains("\"transport\":\"tcp\"", System.Text.Encoding.UTF8.GetString(ready.Data));
        Assert.Equal(bytes, (await browser.Output.Reader.ReadAsync(timeout.Token)).Data);
        Assert.Equal(bytes.Length, totals.TargetToBrowserBytes);
    }

    // 慢consumer令queue滿後不能持續讀取upstream；正式30秒無進展須終止連線。
    [Fact]
    public async Task SlowBrowserBoundsReadAheadAndTimesOutAfterThirtySeconds()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        using var browser = new ScriptSocket(blockSends: true);
        using var peer = new ScriptSocket();
        for (var index = 0; index < 100; index++)
            peer.Input.Writer.TryWrite(new(new byte[16 * 1024], WebSocketMessageType.Binary, true));
        await using var upstream = new SocketSession(peer);
        var started = System.Diagnostics.Stopwatch.StartNew();
        var run = new RelayBridge().RunAsync(browser, upstream, timeout.Token);
        await browser.SendEntered.Task.WaitAsync(timeout.Token);
        await Task.Delay(100, timeout.Token);
        Assert.InRange(peer.Receives, 1, 18);

        await Assert.ThrowsAsync<TimeoutException>(() => run);

        Assert.True(started.Elapsed >= TimeSpan.FromSeconds(29));
        Assert.InRange(peer.Receives, 1, 18);
    }

    // Browser文字資料不是RustDesk binary protocol，必須關閉而非轉送。
    [Fact]
    public async Task BrowserTextDataIsRejected()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var browser = new ScriptSocket();
        using var peer = new ScriptSocket();
        browser.Input.Writer.TryWrite(new([1], WebSocketMessageType.Text, true));
        await using var upstream = new SocketSession(peer);
        await Assert.ThrowsAsync<InvalidDataException>(() => new RelayBridge().RunAsync(browser, upstream, timeout.Token));
        Assert.False(peer.Output.Reader.TryRead(out _));
    }

    internal sealed record Frame(byte[] Data, WebSocketMessageType Type, bool End);

    internal sealed class ScriptSocket(bool blockSends = false) : WebSocket
    {
        public Channel<Frame> Input { get; } = Channel.CreateUnbounded<Frame>();
        public Channel<Frame> Output { get; } = Channel.CreateUnbounded<Frame>();
        public TaskCompletionSource<bool> SendEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int Receives;
        private readonly CancellationTokenSource _closed = new();
        private WebSocketState _state = WebSocketState.Open;
        public override WebSocketCloseStatus? CloseStatus => WebSocketCloseStatus.NormalClosure;
        public override string? CloseStatusDescription => null;
        public override WebSocketState State => _state;
        public override string? SubProtocol => "rdweb.v1";

        // 中止測試socket並取消等待中的receive。
        public override void Abort() { _state = WebSocketState.Aborted; _closed.Cancel(); }
        // 關閉測試socket不要求真實網路close handshake。
        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
        { _state = WebSocketState.Closed; _closed.Cancel(); return Task.CompletedTask; }
        // 輸出close時立即完成，便於驗證雙向取消。
        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
            => CloseAsync(closeStatus, statusDescription, cancellationToken);
        // 釋放測試socket並結束pending receive。
        public override void Dispose() { Abort(); _closed.Dispose(); }
        // 每次讀取只取一個bounded fixture fragment，不模擬任何認證。
        public override async Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _closed.Token);
            var frame = await Input.Reader.ReadAsync(linked.Token);
            Interlocked.Increment(ref Receives);
            frame.Data.CopyTo(buffer.AsSpan());
            return new(frame.Data.Length, frame.Type, frame.End);
        }
        // 記錄安全fixture fragment或模擬停止讀取的browser。
        public override async Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
        {
            SendEntered.TrySetResult(true);
            if (blockSends) await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            await Output.Writer.WriteAsync(new(buffer.ToArray(), messageType, endOfMessage), cancellationToken);
        }
    }

    private sealed class SocketSession(WebSocket socket) : IRustDeskUpstreamSession
    {
        public string Transport => "ws";
        public Stream? TcpRelayStream => null;
        public WebSocket? WebSocketRelay => socket;
        // Bridge fixture不執行rendezvous控制訊息。
        public Task SendControlAsync(RendezvousMessage message, CancellationToken cancellationToken) => throw new NotSupportedException();
        // Bridge fixture不執行rendezvous控制訊息。
        public Task<RendezvousMessage> ReceiveControlAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        // Socket由test以using擁有，session不重複釋放。
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class TcpSession(Stream stream) : IRustDeskUpstreamSession
    {
        public string Transport => "tcp";
        public Stream? TcpRelayStream => stream;
        public WebSocket? WebSocketRelay => null;
        // Bridge fixture不執行rendezvous控制訊息。
        public Task SendControlAsync(RendezvousMessage message, CancellationToken cancellationToken) => throw new NotSupportedException();
        // Bridge fixture不執行rendezvous控制訊息。
        public Task<RendezvousMessage> ReceiveControlAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        // 釋放本測試擁有的stream。
        public ValueTask DisposeAsync() => stream.DisposeAsync();
    }
}
