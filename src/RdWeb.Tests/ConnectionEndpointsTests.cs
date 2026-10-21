using System.Buffers;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text.Json;
using Google.Protobuf;
using Hbb;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSec.Cryptography;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class ConnectionEndpointsTests
{
    // Bad Origin在take-once之前拒絕，原ticket仍只能由正確同源握手消耗。
    [Theory]
    [InlineData("", true)]
    [InlineData("/rdweb", true)]
    [InlineData("/rdweb", false)]
    [InlineData("/a/b/c", true)]
    [InlineData("/a/b/c", false)]
    public async Task WebSocketRejectsWrongOriginBeforeConsumingTicket(string prefix, bool preserve)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start();
        hbbr.Start();
        using var signingKey = Key.Create(SignatureAlgorithm.Ed25519);
        var publicKey = Convert.ToBase64String(signingKey.PublicKey.Export(KeyBlobFormat.RawPublicKey));
        var requestObserved = new TaskCompletionSource<RendezvousMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        var responseSent = new TaskCompletionSource<long>(TaskCreationOptions.RunContinuationsAsynchronously);
        var relayAccepted = new TaskCompletionSource<long>(TaskCreationOptions.RunContinuationsAsynchronously);
        var relayRequestObserved = new TaskCompletionSource<RendezvousMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        var hbbsTask = ConnectionCoordinatorTests.ServeHbbsAsync(hbbs, signingKey, "123456789", "12345678-1234-4234-8234-123456789abc", requestObserved, responseSent, timeout.Token);
        var peerMessage = new Message { SignedId = new SignedId { Id = ByteString.CopyFrom(new byte[] { 1, 2, 3 }) } }.ToByteArray();
        var hbbrTask = ConnectionCoordinatorTests.ServeHbbrAsync(hbbr, relayAccepted, relayRequestObserved, peerMessage, timeout.Token);
        var setup = await ConnectionCoordinatorTests.CreateGrantAsync(hbbs, hbbr, publicKey, builder =>
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            { ["APP_BASE_PATH"] = prefix, ["APP_PUBLIC_URL"] = "http://localhost" + prefix })));
        await using var factory = setup.Factory;
        using var owner = await LoginExistingAdminAsync(factory);
        var ticket = await IssueTicketAsync(owner, setup.Grant.TargetId);
        var uri = new Uri("ws://localhost" + (preserve ? prefix : "") + "/api/v1/targets/" + setup.Grant.TargetId + "/connect");

        var wrongOrigin = CreateWebSocketClient(factory, ticket, "https://attacker.example");
        var rejected = await Record.ExceptionAsync(() => wrongOrigin.ConnectAsync(uri, timeout.Token));
        Assert.NotNull(rejected);
        Assert.True(rejected is InvalidOperationException && rejected.Message.EndsWith("403", StringComparison.Ordinal));
        Assert.False(hbbs.Pending());

        var sameOrigin = CreateWebSocketClient(factory, ticket, "http://localhost");
        using var socket = await sameOrigin.ConnectAsync(uri, timeout.Token);
        Assert.Equal("rdweb.v1", socket.SubProtocol);
        var ready = await ReceiveFrameAsync(socket, timeout.Token);
        Assert.Equal(WebSocketMessageType.Text, ready.Type);
        using (var json = JsonDocument.Parse(ready.Payload))
        {
            Assert.Equal("rdweb.ready", json.RootElement.GetProperty("type").GetString());
            Assert.Equal("tcp", json.RootElement.GetProperty("transport").GetString());
            Assert.Equal(setup.Grant.TargetId, json.RootElement.GetProperty("target_id").GetGuid());
            Assert.Equal("123456789", json.RootElement.GetProperty("rustdesk_id").GetString());
            Assert.True(json.RootElement.GetProperty("connection_id").GetGuid() != Guid.Empty);
            Assert.True(json.RootElement.GetProperty("peer_signing_key").GetString() == Convert.ToBase64String(Enumerable.Range(1, 32).Select(value => (byte)value).ToArray()));
        }

        var binary = await ReceiveFrameAsync(socket, timeout.Token);
        Assert.Equal(WebSocketMessageType.Binary, binary.Type);
        Assert.True(binary.Payload.Length > 0);
        await Task.WhenAll(hbbsTask, hbbrTask);
        var replayClient = CreateWebSocketClient(factory, ticket, "http://localhost");
        Assert.NotNull(await Record.ExceptionAsync(() => replayClient.ConnectAsync(uri, timeout.Token)));
        // 流程真正結束後counter歸還，稽核只含固定分類與流量。
        var store = factory.Services.GetRequiredService<IKvStore>();
        while (await store.GetAsync("conn:all") != "0") await Task.Delay(10, timeout.Token);
        Assert.Equal("0", await store.GetAsync("conn:" + setup.Grant.UserId));
        Assert.Equal(0, factory.Services.GetRequiredService<RdWeb.Api.RustDesk.ActiveConnectionRegistry>().Count);
        await WaitForAuditAsync(factory, setup.Grant.TargetId, "ConnectionEnded", timeout.Token);
        await factory.Services.GetRequiredService<AuditWriter>().StopAsync(timeout.Token);
        await using var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var logs = await db.AuditLogs.Where(log => log.ObjectId == setup.Grant.TargetId).ToListAsync();
        Assert.Single(logs, log => log.Action == "ConnectionStarted");
        var ended = Assert.Single(logs, log => log.Action == "ConnectionEnded");
        Assert.True(ended.Detail.Contains("bytesReceived", StringComparison.Ordinal));
        Assert.False(ended.Detail.Contains(ticket, StringComparison.Ordinal));
        Assert.False(ended.Detail.Contains(publicKey, StringComparison.Ordinal));
    }

    // 稽核writer在連線計數釋放後才寫入結束事件；等到事件落盤再停止，避免測試競態。
    private static async Task WaitForAuditAsync(TestApplicationFactory factory, Guid targetId, string action, CancellationToken cancellationToken)
    {
        while (true)
        {
            await using var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(cancellationToken);
            if (await db.AuditLogs.AnyAsync(log => log.ObjectId == targetId && log.Action == action, cancellationToken)) return;
            await Task.Delay(10, cancellationToken);
        }
    }

    // 無票證、route不符、使用者停用及ACL撤銷皆在upgrade之前拒絕，不能觸及hbbs。
    [Theory]
    [InlineData("missing")]
    [InlineData("wrong-target")]
    [InlineData("disabled-user")]
    [InlineData("revoke")]
    public async Task InvalidAuthorizationCannotOpenUpstream(string scenario)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start(); hbbr.Start();
        using var signingKey = Key.Create(SignatureAlgorithm.Ed25519);
        var setup = await ConnectionCoordinatorTests.CreateGrantAsync(hbbs, hbbr,
            Convert.ToBase64String(signingKey.PublicKey.Export(KeyBlobFormat.RawPublicKey)));
        await using var factory = setup.Factory;
        using var owner = await LoginExistingAdminAsync(factory);
        var ticket = await IssueTicketAsync(owner, setup.Grant.TargetId);
        await using (var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            if (scenario == "disabled-user")
                (await db.Users.SingleAsync(user => user.Id == setup.Grant.UserId)).IsActive = false;
            if (scenario == "revoke")
            {
                (await db.Users.SingleAsync(user => user.Id == setup.Grant.UserId)).Role = "operator";
                // CreatedBy為FK，改指向另一個真實user後沒有任何grant。
                var other = new RdWeb.Api.Data.Entities.User { Username = "other", NormalizedUsername = "OTHER", Role = "operator", PasswordHash = "public-fixture" };
                db.Users.Add(other);
                (await db.Targets.SingleAsync(target => target.Id == setup.Grant.TargetId)).CreatedBy = other.Id;
            }
            await db.SaveChangesAsync();
        }
        var client = factory.Server.CreateWebSocketClient();
        client.SubProtocols.Add("rdweb.v1");
        if (scenario != "missing") client.SubProtocols.Add("rdweb.ticket." + ticket);
        client.ConfigureRequest = request => request.Headers.Origin = "http://localhost";
        var route = scenario == "wrong-target" ? Guid.NewGuid() : setup.Grant.TargetId;
        Assert.NotNull(await Record.ExceptionAsync(() => client.ConnectAsync(new Uri($"ws://localhost/api/v1/targets/{route}/connect"), timeout.Token)));
        Assert.False(hbbs.Pending()); Assert.False(hbbr.Pending());
    }

    // Ticket API登入沿用正式Argon2id與JWT流程，不把access token寫入測試輸出。
    internal static async Task<HttpClient> LoginExistingAdminAsync(TestApplicationFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            username = "admin",
            password = AuthIntegrationTests.Password
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new("Bearer", json.GetProperty("access_token").GetString());
        return client;
    }

    // 建立ticket時只讀ExpiresIn並在記憶體內保留短效票證。
    internal static async Task<string> IssueTicketAsync(HttpClient client, Guid targetId)
    {
        using var response = await client.PostAsJsonAsync($"/api/v1/targets/{targetId}/connect-ticket", new { });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(30, json.GetProperty("expires_in").GetInt32());
        return json.GetProperty("ticket").GetString()!;
    }

    // TestServer client在握手subprotocol中傳票證，Origin不放進URL。
    internal static WebSocketClient CreateWebSocketClient(TestApplicationFactory factory, string ticket, string origin)
    {
        var client = factory.Server.CreateWebSocketClient();
        client.SubProtocols.Add("rdweb.v1");
        client.SubProtocols.Add("rdweb.ticket." + ticket);
        client.ConfigureRequest = request => request.Headers["Origin"] = origin;
        return client;
    }

    // 讀取完整WebSocket message但只在測試RAM組合，不輸出binary內容。
    internal static async Task<SocketFrame> ReceiveFrameAsync(WebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];
        var payload = new ArrayBufferWriter<byte>();
        WebSocketMessageType? type = null;
        while (true)
        {
            var result = await socket.ReceiveAsync(buffer.AsMemory(), cancellationToken);
            type ??= result.MessageType;
            payload.Write(buffer.AsSpan(0, result.Count));
            if (result.EndOfMessage) return new SocketFrame(type.Value, payload.WrittenMemory.ToArray());
        }
    }

    // 測試helper只保存單一event的message type與payload，不附加到失敗訊息。
    internal sealed record SocketFrame(WebSocketMessageType Type, byte[] Payload);
}
