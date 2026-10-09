using System.Net;
using System.Net.Sockets;
using Google.Protobuf;
using Hbb;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class RendezvousTransportTests
{
    // TCP控制訊息使用BytesCodec framing，分段回覆仍可還原生成的protobuf。
    [Fact]
    public async Task TcpRoundTripsGeneratedRendezvousMessages()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var accept = listener.AcceptTcpClientAsync(timeout.Token);
            var transport = CreateTransport(IPAddress.Loopback);
            await using var session = await transport.ConnectAsync(new("127.0.0.1", port), "tcp", true, timeout.Token);
            using var peer = await accept;
            var stream = peer.GetStream();
            var request = new RendezvousMessage
            {
                PunchHoleRequest = new PunchHoleRequest { Id = "123456789", ForceRelay = true }
            };

            await session.SendControlAsync(request, timeout.Token);
            var requestBytes = await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, timeout.Token);
            Assert.Equal(request, RendezvousMessage.Parser.ParseFrom(requestBytes));

            var response = new RendezvousMessage
            {
                PunchHoleResponse = new PunchHoleResponse { OtherFailure = "public-fixture-failure" }
            };
            await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, response.ToByteArray(), timeout.Token);
            Assert.Equal(response, await session.ReceiveControlAsync(timeout.Token));
        }
        finally
        {
            listener.Stop();
        }
    }

    // TCP rendezvous reader略過KeyExchange後再交付下一則protocol control message。
    [Fact]
    public async Task TcpReceiveSkipsKeyExchangeControlMessages()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var accept = listener.AcceptTcpClientAsync(timeout.Token);
            var transport = CreateTransport(IPAddress.Loopback);
            await using var session = await transport.ConnectAsync(new("127.0.0.1", port), "tcp", true, timeout.Token);
            using var peer = await accept;
            var stream = peer.GetStream();
            var keyExchange = new RendezvousMessage { KeyExchange = new KeyExchange() };
            var expected = new RendezvousMessage
            {
                RelayResponse = new RelayResponse { Uuid = "12345678-1234-4234-8234-123456789abc" }
            };
            await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, keyExchange.ToByteArray(), timeout.Token);
            await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, expected.ToByteArray(), timeout.Token);

            Assert.Equal(expected, await session.ReceiveControlAsync(timeout.Token));
        }
        finally
        {
            listener.Stop();
        }
    }

    // 呼叫端讀取逾時不能丟失已從TCP socket消耗的部分frame header。
    [Fact]
    public async Task CancelledControlWaitPreservesPartialFrameForNextRead()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var firstByteSent = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseRemainder = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var accept = listener.AcceptTcpClientAsync(timeout.Token);
            var transport = CreateTransport(IPAddress.Loopback);
            await using var session = await transport.ConnectAsync(new("127.0.0.1", port), "tcp", true, timeout.Token);
            using var peer = await accept;
            var stream = peer.GetStream();
            var request = new RendezvousMessage { PunchHoleRequest = new PunchHoleRequest { Id = "123456789" } };
            var response = new RendezvousMessage { RelayResponse = new RelayResponse { Uuid = "12345678-1234-4234-8234-123456789abc", Version = new string('v', 64) } };
            var responsePayload = response.ToByteArray();
            var header = RustDeskByteStreamCodec.EncodeHeader(responsePayload.Length);
            var frame = header.Concat(responsePayload).ToArray();
            var serverTask = Task.Run(async () =>
            {
                _ = await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, timeout.Token);
                await stream.WriteAsync(frame.AsMemory(0, 1), timeout.Token);
                firstByteSent.TrySetResult(true);
                await releaseRemainder.Task.WaitAsync(timeout.Token);
                await stream.WriteAsync(frame.AsMemory(1), timeout.Token);
            }, timeout.Token);
            await session.SendControlAsync(request, timeout.Token);
            await firstByteSent.Task.WaitAsync(timeout.Token);
            using var readTimeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => session.ReceiveControlAsync(readTimeout.Token));
            releaseRemainder.TrySetResult(true);
            Assert.Equal(response, await session.ReceiveControlAsync(timeout.Token));
            await serverTask;
        }
        finally
        {
            releaseRemainder.TrySetResult(true);
            listener.Stop();
        }
    }

    // WS adapter連接管理員saved host:port根路徑並透過approved IP完成binary control roundtrip。
    [Fact]
    public async Task WebSocketUsesSavedEndpointAndPinnedResolverAddress()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var received = new TaskCompletionSource<RendezvousMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        var path = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        await using var app = builder.Build();
        app.UseWebSockets();
        app.MapGet("/", async (HttpContext context) =>
        {
            path.TrySetResult(context.Request.Path.Value ?? string.Empty);
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            var buffer = new byte[64 * 1024];
            var first = await socket.ReceiveAsync(buffer.AsMemory(), timeout.Token);
            received.TrySetResult(RendezvousMessage.Parser.ParseFrom(buffer.AsSpan(0, first.Count)));
            var keyExchange = new RendezvousMessage { KeyExchange = new KeyExchange() };
            await socket.SendAsync(keyExchange.ToByteArray(), System.Net.WebSockets.WebSocketMessageType.Binary, true, timeout.Token);
            var response = new RendezvousMessage
            {
                RelayResponse = new RelayResponse { Uuid = "12345678-1234-4234-8234-123456789abc" }
            };
            await socket.SendAsync(response.ToByteArray(), System.Net.WebSockets.WebSocketMessageType.Binary, true, timeout.Token);
        });
        await app.StartAsync(timeout.Token);
        try
        {
            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            var port = new Uri(address).Port;
            var transport = CreateTransport(IPAddress.Loopback);
            await using var session = await transport.ConnectAsync(new("fixture.example", port), "ws", true, timeout.Token);
            var request = new RendezvousMessage
            {
                PunchHoleRequest = new PunchHoleRequest { Id = "123456789", ForceRelay = true }
            };

            await session.SendControlAsync(request, timeout.Token);

            Assert.Equal("/", await path.Task.WaitAsync(timeout.Token));
            Assert.Equal(request, await received.Task.WaitAsync(timeout.Token));
            Assert.Equal("12345678-1234-4234-8234-123456789abc", (await session.ReceiveControlAsync(timeout.Token)).RelayResponse.Uuid);
        }
        finally
        {
            await app.StopAsync(timeout.Token);
        }
    }

    // 測試transport使用固定DNS結果，確認domain不會在socket connect時重新解析。
    private static RendezvousTransport CreateTransport(IPAddress address)
        => new(new ApprovedHostResolver(new FixedHostResolver(address)));

    private sealed class FixedHostResolver(IPAddress address) : IHostResolver
    {
        // 回傳測試明確指定的位址，不查詢外部DNS。
        public Task<IPAddress[]> ResolveAsync(string host, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new[] { address });
        }
    }
}
