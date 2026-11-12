using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using Google.Protobuf;
using Hbb;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using NSec.Cryptography;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class ConnectionCloseDeliveryTests
{
    // 重複次數：撤銷時中止仍有未讀輸入的 socket 會送出 RST，經轉送層後每輪約 5% 變成 1006；100 輪可穩定揭露。
    private const int Rounds = 100;

    // 與 E2E reconnect proxy 相同語意的 TCP relay：正常 FIN 時排完資料再關閉下游，上游 reset 時立即 reset 下游（未送出的資料一併丟棄）。
    private static async Task RelayAsync(TcpListener listener, int upstreamPort, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var downstream = await listener.AcceptTcpClientAsync(cancellationToken);
            var upstream = new TcpClient();
            await upstream.ConnectAsync(IPAddress.Loopback, upstreamPort, cancellationToken);
            _ = Task.Run(async () =>
            {
                using (downstream) using (upstream)
                {
                    var up = upstream.GetStream(); var down = downstream.GetStream();
                    var toUpstream = Task.Run(async () => { try { await down.CopyToAsync(up, cancellationToken); upstream.Client.Shutdown(SocketShutdown.Send); } catch { } });
                    try
                    {
                        var buffer = new byte[16 * 1024];
                        int read;
                        while ((read = await up.ReadAsync(buffer, cancellationToken)) > 0) await down.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                        downstream.Client.Shutdown(SocketShutdown.Send);
                    }
                    catch (IOException)
                    {
                        // 上游被 reset：比照 proxy 的 destroy，以 RST 關閉下游。
                        downstream.Client.LingerState = new LingerOption(true, 0);
                    }
                    await toUpstream;
                }
            }, cancellationToken);
        }
    }

    // 雙向持續有流量時撤銷，經過轉送層後瀏覽器仍必須每次收到原本的 1008，而非 1006（TestServer 記憶體管線無法重現，故用真實 port）。
    [Fact]
    public async Task RevokedStreamDeliversPolicyCloseOverRealSocket()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start(); hbbr.Start();
        using var signingKey = Key.Create(SignatureAlgorithm.Ed25519);
        var setup = await ConnectionCoordinatorTests.CreateGrantAsync(hbbs, hbbr, Convert.ToBase64String(signingKey.PublicKey.Export(KeyBlobFormat.RawPublicKey)));
        await using var factory = setup.Factory;
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        // 真實 Kestrel 端點：以正式 coordinator 處理被接受的 WebSocket。
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        await using var app = builder.Build();
        app.UseWebSockets();
        app.Map("/connect", async (HttpContext http) =>
        {
            using var socket = await http.WebSockets.AcceptWebSocketAsync();
            await using var scope = factory.Services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ConnectionCoordinator>().RunAsync(setup.Grant, socket, CancellationToken.None);
        });
        await app.StartAsync(timeout.Token);
        var backendPort = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First()).Port;
        using var relay = new TcpListener(IPAddress.Loopback, 0);
        relay.Start();
        var relaying = RelayAsync(relay, backendPort, timeout.Token);
        var url = new Uri($"ws://127.0.0.1:{((IPEndPoint)relay.LocalEndpoint).Port}/connect");
        var peerMessage = new Message { SignedId = new SignedId { Id = ByteString.CopyFrom(new byte[] { 1, 2, 3 }) } }.ToByteArray();
        var codes = new List<WebSocketCloseStatus?>();
        for (var round = 0; round < Rounds; round++)
        {
            var hbbsTask = ConnectionCoordinatorTests.ServeHbbsAsync(hbbs, signingKey, "123456789", "12345678-1234-4234-8234-123456789abc",
                new(TaskCreationOptions.RunContinuationsAsynchronously), new(TaskCreationOptions.RunContinuationsAsynchronously), timeout.Token);
            var hbbrTask = Task.Run(async () =>
            {
                // 受控端持續送出畫面資料並讀取輸入，直到 coordinator 釋放上游。
                using var client = await hbbr.AcceptTcpClientAsync(timeout.Token);
                var stream = client.GetStream();
                _ = await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, timeout.Token);
                var drain = Task.Run(async () => { var buffer = new byte[4096]; try { while (await stream.ReadAsync(buffer, timeout.Token) > 0) { } } catch (IOException) { } });
                try { while (!drain.IsCompleted) await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, peerMessage, timeout.Token); }
                catch (IOException) { }
                await drain;
            }, timeout.Token);
            using var browser = new ClientWebSocket();
            browser.Options.AddSubProtocol("rdweb.v1");
            await browser.ConnectAsync(url, timeout.Token);
            var receive = new byte[64 * 1024];
            Assert.Equal(WebSocketMessageType.Text, (await browser.ReceiveAsync(receive, timeout.Token)).MessageType);
            Assert.Equal(WebSocketMessageType.Binary, (await browser.ReceiveAsync(receive, timeout.Token)).MessageType);
            // 瀏覽器持續送出輸入，使後端有 pending receive。
            var input = Task.Run(async () =>
            {
                try { while (browser.State == WebSocketState.Open) await browser.SendAsync(new byte[] { 0, 0, 0, 0 }, WebSocketMessageType.Binary, true, timeout.Token); }
                catch (WebSocketException) { }
                catch (OperationCanceledException) { }
            });
            Assert.Equal(1, registry.Terminate(grant => grant.UserId == setup.Grant.UserId));
            try
            {
                while ((await browser.ReceiveAsync(receive, timeout.Token)).MessageType != WebSocketMessageType.Close) { }
                codes.Add(browser.CloseStatus);
                // 瀏覽器收到 close 會自動回應；ClientWebSocket 需手動回應才能完成握手。
                await browser.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, timeout.Token);
            }
            catch (WebSocketException)
            {
                codes.Add(null);
            }
            await input;
            await Task.WhenAll(hbbsTask, hbbrTask);
            // 下一輪前等待前一條連線完整釋放，避免名額殘留。
            while (registry.Count != 0) await Task.Yield();
        }
        // 失敗訊息只列計數，方便判斷重現頻率。
        var abnormal = codes.Count(code => code != WebSocketCloseStatus.PolicyViolation);
        Assert.True(abnormal == 0, $"{abnormal}/{Rounds} 次未收到 1008");
    }
}
