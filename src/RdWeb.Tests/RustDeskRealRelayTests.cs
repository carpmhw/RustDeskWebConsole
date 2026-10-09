using System.Net.WebSockets;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Infrastructure.Kv;

namespace RdWeb.Tests;

[Trait("Category", "RustDeskReal")]
public sealed class RustDeskRealRelayTests
{
    // Pinned官方hbbs/hbbr及受控端必須實際交付peer bytes，不把TCP可達視為ready。
    [Theory]
    [InlineData("tcp")]
    [InlineData("ws")]
    public async Task OfficialServerPairsAndDeliversPeerData(string transport)
    {
        var publicKey = Environment.GetEnvironmentVariable("RDWEB_RUSTDESK_PUBLIC_KEY");
        var peerId = Environment.GetEnvironmentVariable("RDWEB_RUSTDESK_TARGET_ID");
        Assert.True(!string.IsNullOrEmpty(publicKey) && !string.IsNullOrEmpty(peerId), "Use deploy/dev/test-m3a-relay.sh");
        var idPort = transport == "tcp" ? 21116 : int.Parse(Environment.GetEnvironmentVariable("RDWEB_TEST_ID_WS_PORT") ?? "31118");
        var relayPort = transport == "tcp" ? 21117 : int.Parse(Environment.GetEnvironmentVariable("RDWEB_TEST_RELAY_WS_PORT") ?? "31119");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await using var factory = new TestApplicationFactory();
        var userId = await AuthIntegrationTests.SeedAsync(factory);
        Guid targetId;
        await using (var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            var server = new RustDeskServer
            {
                Name = "real-relay-fixture",
                IdServer = "127.0.0.1:" + idPort,
                RelayServer = "127.0.0.1:" + relayPort,
                PublicKey = publicKey!,
                Transport = transport,
                Enabled = true,
                AllowPrivateNetwork = true
            };
            var target = new Target { ServerId = server.Id, Name = "official-peer", RustDeskId = peerId!, CreatedBy = userId };
            db.RustDeskServers.Add(server); db.Targets.Add(target); await db.SaveChangesAsync(timeout.Token);
            targetId = target.Id;
        }
        using var owner = await ConnectionEndpointsTests.LoginExistingAdminAsync(factory);
        var ticket = await ConnectionEndpointsTests.IssueTicketAsync(owner, targetId);
        var client = ConnectionEndpointsTests.CreateWebSocketClient(factory, ticket, "http://localhost");
        using var socket = await client.ConnectAsync(new Uri($"ws://localhost/api/v1/targets/{targetId}/connect"), timeout.Token);
        var first = await ConnectionEndpointsTests.ReceiveFrameAsync(socket, timeout.Token);
        Assert.Equal(WebSocketMessageType.Text, first.Type);
        // 不輸出上游payload；只讀固定control的type及transport。
        using (var control = System.Text.Json.JsonDocument.Parse(first.Payload))
        {
            Assert.True(control.RootElement.GetProperty("type").GetString() == "rdweb.ready", "Official relay did not become ready");
            Assert.Equal(transport, control.RootElement.GetProperty("transport").GetString());
        }
        var peer = await ConnectionEndpointsTests.ReceiveFrameAsync(socket, timeout.Token);
        Assert.Equal(WebSocketMessageType.Binary, peer.Type);
        Assert.True(peer.Payload.Length > 0);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "test complete", timeout.Token);
        var store = factory.Services.GetRequiredService<IKvStore>();
        while (await store.GetAsync("conn:all") != "0") await Task.Delay(10, timeout.Token);
        Assert.Equal("0", await store.GetAsync("conn:" + userId));
    }
}
