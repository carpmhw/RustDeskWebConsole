using System.Buffers;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Threading.Channels;
using Google.Protobuf;
using Hbb;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public interface IRustDeskUpstreamSession : IAsyncDisposable
{
    string Transport { get; }
    // Control messages依上游TCP或WebSocket framing傳送。
    Task SendControlAsync(RendezvousMessage message, CancellationToken cancellationToken);
    // 回傳下一則非KeyExchange的generated control message。
    Task<RendezvousMessage> ReceiveControlAsync(CancellationToken cancellationToken);
    // TCP pair使用raw stream，WS pair保留binary message與fragment狀態。
    Stream? TcpRelayStream { get; }
    WebSocket? WebSocketRelay { get; }
}

public sealed class RendezvousTransport(ApprovedHostResolver resolver)
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(5);

    // 先固定核准IP，再依已保存transport建立upstream連線。
    public async Task<IRustDeskUpstreamSession> ConnectAsync(ServerEndpoint endpoint, string transport,
        bool allowPrivateNetwork, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (transport is not ("tcp" or "ws")) throw new AuthException("invalid_request", 400);
        var addresses = await resolver.ResolveAsync(endpoint, allowPrivateNetwork, cancellationToken);
        return transport == "tcp"
            ? await ConnectTcpAsync(endpoint, addresses, cancellationToken)
            : await ConnectWebSocketAsync(endpoint, addresses, cancellationToken);
    }

    // TCP connector僅嘗試resolver已核准的固定IP，不再查詢hostname。
    private static async Task<IRustDeskUpstreamSession> ConnectTcpAsync(ServerEndpoint endpoint, IPAddress[] addresses,
        CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ConnectTimeout);
        foreach (var address in addresses)
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, endpoint.Port), timeout.Token);
                return new TcpUpstreamSession(new NetworkStream(socket, ownsSocket: true));
            }
            catch (SocketException)
            {
                socket.Dispose();
                if (timeout.IsCancellationRequested) break;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                socket.Dispose();
                throw new AuthException("service_unavailable", 503);
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }

        cancellationToken.ThrowIfCancellationRequested();
        throw new AuthException("service_unavailable", 503);
    }

    // WebSocket connector固定直連saved host:port根路徑並由ConnectCallback pin核准IP。
    private static async Task<IRustDeskUpstreamSession> ConnectWebSocketAsync(ServerEndpoint endpoint, IPAddress[] addresses,
        CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ConnectTimeout);
        var handler = new SocketsHttpHandler
        {
            UseProxy = false,
            AllowAutoRedirect = false,
            ConnectTimeout = ConnectTimeout,
            ConnectCallback = async (context, callbackToken) => await ConnectApprovedAddressAsync(context, endpoint, addresses, callbackToken)
        };
        var invoker = new HttpMessageInvoker(handler, disposeHandler: true);
        var socket = new ClientWebSocket();
        var uri = new UriBuilder("ws", endpoint.Host, endpoint.Port, "/").Uri;
        try
        {
            await socket.ConnectAsync(uri, invoker, timeout.Token);
            return new WebSocketUpstreamSession(socket, invoker);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            socket.Dispose();
            invoker.Dispose();
            throw new AuthException("service_unavailable", 503);
        }
        catch (Exception exception) when (exception is WebSocketException or HttpRequestException or SocketException)
        {
            socket.Dispose();
            invoker.Dispose();
            throw new AuthException("service_unavailable", 503);
        }
        catch
        {
            socket.Dispose();
            invoker.Dispose();
            throw;
        }
    }

    // ConnectCallback只可連本次ApprovedHostResolver核准的位址清單。
    private static async ValueTask<Stream> ConnectApprovedAddressAsync(SocketsHttpConnectionContext context,
        ServerEndpoint endpoint, IPAddress[] addresses, CancellationToken cancellationToken)
    {
        if (context.DnsEndPoint.Port != endpoint.Port || !HostMatches(context.DnsEndPoint.Host, endpoint.Host))
            throw new HttpRequestException("Upstream WebSocket endpoint mismatch.");

        foreach (var address in addresses)
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, endpoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (SocketException)
            {
                socket.Dispose();
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }

        throw new HttpRequestException("Approved upstream WebSocket addresses are unreachable.");
    }

    // IP literal依正規化位址比對，DNS名稱只作不分大小寫的endpoint綁定。
    private static bool HostMatches(string requested, string configured)
    {
        if (IPAddress.TryParse(requested, out var requestedAddress) && IPAddress.TryParse(configured, out var configuredAddress))
            return requestedAddress.Equals(configuredAddress);
        return StringComparer.OrdinalIgnoreCase.Equals(requested, configured);
    }

    private sealed class TcpUpstreamSession : IRustDeskUpstreamSession
    {
        private readonly NetworkStream _stream;
        private readonly CancellationTokenSource _lifetime = new();
        private readonly ControlMessagePump _controlMessages;

        // 建立長存control reader，避免呼叫端短timeout遺失已消耗的partial frame。
        public TcpUpstreamSession(NetworkStream stream)
        {
            _stream = stream;
            _controlMessages = new ControlMessagePump(ReadFrameAsync, _lifetime.Token);
        }

        // 標記此連線使用RustDesk TCP BytesCodec framing。
        public string Transport => "tcp";
        // hbbr pairing後由bridge使用相同TCP NetworkStream。
        public Stream? TcpRelayStream => _stream;
        // TCP upstream沒有WebSocket relay。
        public WebSocket? WebSocketRelay => null;

        // control protobuf以BytesCodec length prefix傳送。
        public Task SendControlAsync(RendezvousMessage message, CancellationToken cancellationToken)
            => RustDeskByteStreamCodec.WriteControlFrameAsync(_stream, message.ToByteArray(), cancellationToken).AsTask();

        // TCP reader由session lifetime token控制，呼叫端timeout只取消等待、不丟frame bytes。
        public Task<RendezvousMessage> ReceiveControlAsync(CancellationToken cancellationToken)
            => _controlMessages.ReadAsync(cancellationToken);

        // 讀取單一BytesCodec frame供persistent control pump解析。
        private Task<byte[]> ReadFrameAsync(CancellationToken cancellationToken)
            => RustDeskByteStreamCodec.ReadControlFrameAsync(_stream, cancellationToken).AsTask();

        // 先取消control pump，再關閉擁有socket的NetworkStream。
        public async ValueTask DisposeAsync()
        {
            _lifetime.Cancel();
            await _stream.DisposeAsync();
            await _controlMessages.StopAsync();
            _lifetime.Dispose();
        }
    }

    private sealed class WebSocketUpstreamSession : IRustDeskUpstreamSession
    {
        private readonly ClientWebSocket _socket;
        private readonly HttpMessageInvoker _invoker;
        private readonly CancellationTokenSource _lifetime = new();
        private readonly ControlMessagePump _controlMessages;

        // 建立persistent WS reader，維持partial message直到end-of-message。
        public WebSocketUpstreamSession(ClientWebSocket socket, HttpMessageInvoker invoker)
        {
            _socket = socket;
            _invoker = invoker;
            _controlMessages = new ControlMessagePump(ReadControlMessageAsync, _lifetime.Token);
        }

        // 標記此連線使用RustDesk WebSocket binary-message framing。
        public string Transport => "ws";
        // WS relay保留原生message／fragment boundary。
        public Stream? TcpRelayStream => null;
        // hbbr pairing後由bridge使用原生upstream WebSocket。
        public WebSocket? WebSocketRelay => _socket;

        // control protobuf以一則binary WebSocket message傳送。
        public async Task SendControlAsync(RendezvousMessage message, CancellationToken cancellationToken)
        {
            var payload = message.ToByteArray();
            if (payload.Length > RustDeskByteStreamCodec.MaxControlFrameLength)
                throw new InvalidDataException("RustDesk control frame exceeds the configured limit.");
            await _socket.SendAsync(payload.AsMemory(), WebSocketMessageType.Binary, true, cancellationToken);
        }

        // WS reader由session lifetime token控制，單次等待取消不會中止partial message。
        public Task<RendezvousMessage> ReceiveControlAsync(CancellationToken cancellationToken)
            => _controlMessages.ReadAsync(cancellationToken);

        // 由persistent pump接收單一binary control message。
        private Task<byte[]> ReadControlMessageAsync(CancellationToken cancellationToken)
            => ReceiveBinaryMessageAsync(_socket, cancellationToken);

        // control message最多64KiB，不把外部錯誤文字或超長frame留存。
        private static async Task<byte[]> ReceiveBinaryMessageAsync(WebSocket webSocket, CancellationToken cancellationToken)
        {
            var buffer = new byte[4096];
            var payload = new ArrayBufferWriter<byte>();
            while (true)
            {
                var result = await webSocket.ReceiveAsync(buffer.AsMemory(), cancellationToken);
                if (result.MessageType == WebSocketMessageType.Close)
                    throw new EndOfStreamException("Rendezvous WebSocket closed.");
                if (result.MessageType != WebSocketMessageType.Binary)
                    throw new InvalidDataException("Rendezvous WebSocket control frame must be binary.");
                if (payload.WrittenCount + result.Count > RustDeskByteStreamCodec.MaxControlFrameLength)
                    throw new InvalidDataException("RustDesk control frame exceeds the configured limit.");
                payload.Write(buffer.AsSpan(0, result.Count));
                if (result.EndOfMessage) return payload.WrittenMemory.ToArray();
            }
        }

        // 關閉upstream WebSocket及其專用HTTP connector。
        public async ValueTask DisposeAsync()
        {
            _lifetime.Cancel();
            _socket.Abort();
            _socket.Dispose();
            _invoker.Dispose();
            await _controlMessages.StopAsync();
            _lifetime.Dispose();
        }
    }

    private sealed class ControlMessagePump
    {
        private readonly Func<CancellationToken, Task<byte[]>> _receive;
        private readonly CancellationToken _lifetime;
        private readonly Channel<RendezvousMessage> _messages = Channel.CreateBounded<RendezvousMessage>(new BoundedChannelOptions(4)
        {
            SingleReader = true,
            SingleWriter = true,
            FullMode = BoundedChannelFullMode.Wait
        });
        private readonly SemaphoreSlim _reader = new(1, 1);
        private readonly object _gate = new();
        private Task? _pump;

        // 建立有界control queue；背景reader不使用每次呼叫的短deadline token。
        public ControlMessagePump(Func<CancellationToken, Task<byte[]>> receive, CancellationToken lifetime)
        {
            _receive = receive;
            _lifetime = lifetime;
        }

        // 消費control message；caller cancellation只停止等待而不丟棄底層partial frame。
        public async Task<RendezvousMessage> ReadAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            StartPump();
            await _reader.WaitAsync(cancellationToken);
            try
            {
                return await _messages.Reader.ReadAsync(cancellationToken);
            }
            catch (ChannelClosedException exception) when (exception.InnerException is AuthException failure)
            {
                throw failure;
            }
            catch (ChannelClosedException)
            {
                throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
            }
            finally
            {
                _reader.Release();
            }
        }

        // 只啟動一個persistent receive loop，略過上游key exchange control messages。
        private void StartPump()
        {
            lock (_gate) _pump ??= PumpAsync();
        }

        // 將fragmented transport messages解析後寫入有界channel。
        private async Task PumpAsync()
        {
            try
            {
                while (!_lifetime.IsCancellationRequested)
                {
                    var payload = await _receive(_lifetime);
                    var message = RendezvousMessage.Parser.ParseFrom(payload);
                    if (message.UnionCase == RendezvousMessage.UnionOneofCase.KeyExchange) continue;
                    await _messages.Writer.WriteAsync(message, _lifetime);
                }
                _messages.Writer.TryComplete();
            }
            catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
            {
                _messages.Writer.TryComplete();
            }
            catch
            {
                _messages.Writer.TryComplete(new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable));
            }
        }

        // 停止session時排空pump task並釋放consumer gate。
        public async Task StopAsync()
        {
            Task? pump;
            lock (_gate) pump = _pump;
            if (pump != null)
            {
                try { await pump; }
                catch { /* 只結束session內部reader，不回傳transport例外。 */ }
            }
            _reader.Dispose();
        }
    }
}
