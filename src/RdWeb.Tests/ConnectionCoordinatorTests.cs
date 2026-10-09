using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using Google.Protobuf;
using Hbb;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSec.Cryptography;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.RustDesk;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class ConnectionCoordinatorTests
{
    // hbbs持續無回應時只可發三次PunchHoleRequest，之後失敗且不觸及hbbr。
    [Fact]
    public async Task SilentHbbsStopsAfterThreeBoundedAttempts()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start(); hbbr.Start();
        using var key = Key.Create(SignatureAlgorithm.Ed25519);
        var setup = await CreateGrantAsync(hbbs, hbbr, Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.RawPublicKey)));
        await using var factory = setup.Factory;
        var attempts = 0;
        var server = Task.Run(async () =>
        {
            using var peer = await hbbs.AcceptTcpClientAsync(timeout.Token);
            for (var index = 0; index < 3; index++)
            {
                _ = await RustDeskByteStreamCodec.ReadControlFrameAsync(peer.GetStream(), timeout.Token);
                Interlocked.Increment(ref attempts);
            }
            // 保持stream直到controller自行結束最後一次deadline。
            Assert.Equal(0, await peer.GetStream().ReadAsync(new byte[1], timeout.Token));
        }, timeout.Token);
        await using var scope = factory.Services.CreateAsyncScope();
        await Assert.ThrowsAsync<AuthException>(() => scope.ServiceProvider.GetRequiredService<ConnectionCoordinator>()
            .EstablishRelayAsync(setup.Grant, timeout.Token));
        await server;
        Assert.Equal(3, attempts); Assert.False(hbbr.Pending());
    }

    // 上游握手失敗或request取消都要歸還計數並留下結束稽核。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailedOrCancelledHandshakeReturnsCountsAndAudits(bool cancel)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var request = new CancellationTokenSource();
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start(); hbbr.Start();
        using var key = Key.Create(SignatureAlgorithm.Ed25519);
        var setup = await CreateGrantAsync(hbbs, hbbr, Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.RawPublicKey)));
        await using var factory = setup.Factory;
        var server = Task.Run(async () =>
        {
            using var peer = await hbbs.AcceptTcpClientAsync(timeout.Token);
            _ = await RustDeskByteStreamCodec.ReadControlFrameAsync(peer.GetStream(), timeout.Token);
            if (cancel) request.Cancel();
            else await RustDeskByteStreamCodec.WriteControlFrameAsync(peer.GetStream(), CreateRejectedResponse("bad-signature", key).ToByteArray(), timeout.Token);
        }, timeout.Token);
        using var browser = new RelayBridgeTests.ScriptSocket();
        await using (var scope = factory.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<ConnectionCoordinator>().RunAsync(setup.Grant, browser, request.Token).WaitAsync(timeout.Token);
        await server;
        var store = factory.Services.GetRequiredService<IKvStore>();
        Assert.Equal("0", await store.GetAsync("conn:all"));
        Assert.Equal("0", await store.GetAsync("conn:" + setup.Grant.UserId));
        Assert.False(hbbr.Pending());
        await factory.Services.GetRequiredService<AuditWriter>().StopAsync(timeout.Token);
        await using var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var ended = await db.AuditLogs.SingleAsync(log => log.Action == "ConnectionEnded" && log.ObjectId == setup.Grant.TargetId);
        Assert.Equal("Failure", ended.Result);
        Assert.Contains(cancel ? "Disconnected" : "ConnectionFailed", ended.Detail);
    }

    // Signed relay response必須先驗證，延遲300ms後才連到admin-saved hbbr並送RequestRelay。
    [Fact]
    public async Task ValidSignedIdentityConnectsSavedRelayAfterDelay()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start();
        hbbr.Start();
        using var signingKey = Key.Create(SignatureAlgorithm.Ed25519);
        var serverPublicKey = signingKey.PublicKey.Export(KeyBlobFormat.RawPublicKey);
        var serverPublicKeyBase64 = Convert.ToBase64String(serverPublicKey);
        var relayUuid = "12345678-1234-4234-8234-123456789abc";
        var targetId = "123456789";
        var peerMessage = new Message
        {
            SignedId = new SignedId { Id = ByteString.CopyFrom(new byte[] { 0x01, 0x02, 0x03 }) }
        }.ToByteArray();
        var requestObserved = new TaskCompletionSource<RendezvousMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        var responseSent = new TaskCompletionSource<long>(TaskCreationOptions.RunContinuationsAsynchronously);
        var relayAccepted = new TaskCompletionSource<long>(TaskCreationOptions.RunContinuationsAsynchronously);
        var relayRequestObserved = new TaskCompletionSource<RendezvousMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        var hbbsTask = ServeHbbsAsync(hbbs, signingKey, targetId, relayUuid, requestObserved, responseSent, timeout.Token);
        var hbbrTask = ServeHbbrAsync(hbbr, relayAccepted, relayRequestObserved, peerMessage, timeout.Token);
        var (factory, grant) = await CreateGrantAsync(hbbs, hbbr, serverPublicKeyBase64);
        await using (factory)
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var coordinator = scope.ServiceProvider.GetRequiredService<ConnectionCoordinator>();
            await using var session = await coordinator.EstablishRelayAsync(grant, timeout.Token);
            await Task.WhenAll(hbbsTask, hbbrTask);

            var request = await requestObserved.Task.WaitAsync(timeout.Token);
            Assert.Equal(targetId, request.PunchHoleRequest.Id);
            Assert.Equal(NatType.Symmetric, request.PunchHoleRequest.NatType);
            Assert.True(request.PunchHoleRequest.ForceRelay);
            Assert.True(StringComparer.Ordinal.Equals(serverPublicKeyBase64, request.PunchHoleRequest.LicenceKey));

            var relayRequest = await relayRequestObserved.Task.WaitAsync(timeout.Token);
            Assert.Equal(targetId, relayRequest.RequestRelay.Id);
            Assert.True(StringComparer.Ordinal.Equals(relayUuid, relayRequest.RequestRelay.Uuid));
            Assert.True(StringComparer.Ordinal.Equals(serverPublicKeyBase64, relayRequest.RequestRelay.LicenceKey));
            Assert.Equal(ConnType.DefaultConn, relayRequest.RequestRelay.ConnType);
            Assert.True(Stopwatch.GetElapsedTime(await responseSent.Task, await relayAccepted.Task) >= TimeSpan.FromMilliseconds(250));

            var actual = await RustDeskByteStreamCodec.ReadControlFrameAsync(session.TcpRelayStream!, timeout.Token);
            Assert.Equal(peerMessage, actual);
        }
    }

    // 離線、直接穿洞、拒絕、錯誤簽章／ID／UUID都不得連到hbbr。
    [Theory]
    [InlineData("offline")]
    [InlineData("direct")]
    [InlineData("refused")]
    [InlineData("bad-signature")]
    [InlineData("wrong-id")]
    [InlineData("bad-uuid")]
    public async Task UntrustedHbbsResponsesNeverConnectToHbbr(string scenario)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start();
        hbbr.Start();
        using var signingKey = Key.Create(SignatureAlgorithm.Ed25519);
        var publicKeyBase64 = Convert.ToBase64String(signingKey.PublicKey.Export(KeyBlobFormat.RawPublicKey));
        var requestReceived = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var response = CreateRejectedResponse(scenario, signingKey);
        var hbbsTask = ServeHbbsWithResponseAsync(hbbs, response, requestReceived, timeout.Token);
        var (factory, grant) = await CreateGrantAsync(hbbs, hbbr, publicKeyBase64);
        await using (factory)
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var coordinator = scope.ServiceProvider.GetRequiredService<ConnectionCoordinator>();

            await Assert.ThrowsAsync<AuthException>(() => coordinator.EstablishRelayAsync(grant, timeout.Token));
            await requestReceived.Task.WaitAsync(timeout.Token);
            await hbbsTask;
            Assert.False(hbbr.Pending());
        }
    }

    // 隔離正式SQLite fixture並將兩個server endpoint指向loopback fake listeners。
    internal static async Task<(TestApplicationFactory Factory, ConnectionGrant Grant)> CreateGrantAsync(
        TcpListener hbbs, TcpListener hbbr, string serverPublicKey, Action<IWebHostBuilder>? configure = null)
    {
        var factory = new TestApplicationFactory(configure);
        var userId = await AuthIntegrationTests.SeedAsync(factory);
        var idEndpoint = "127.0.0.1:" + ((IPEndPoint)hbbs.LocalEndpoint).Port;
        var relayEndpoint = "127.0.0.1:" + ((IPEndPoint)hbbr.LocalEndpoint).Port;
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var server = new RustDeskServer
        {
            Name = "coordinator-fixture",
            IdServer = idEndpoint,
            RelayServer = relayEndpoint,
            PublicKey = serverPublicKey,
            Transport = "tcp",
            Enabled = true,
            AllowPrivateNetwork = true
        };
        var target = new Target
        {
            ServerId = server.Id,
            Name = "coordinator-target",
            RustDeskId = "123456789",
            CreatedBy = userId
        };
        database.RustDeskServers.Add(server);
        database.Targets.Add(target);
        var actor = await database.Users.SingleAsync(user => user.Id == userId);
        var session = factory.Services.GetRequiredService<TokenService>().Create(actor, false);
        database.RefreshTokens.Add(session.Token);
        await database.SaveChangesAsync();
        return (factory, new ConnectionGrant(userId, target.Id, new(session.Token.FamilyId, actor.AuthVersion, actor.Role, false)));
    }

    // Fake hbbs讀取PunchHoleRequest並回傳由server key簽署的RelayResponse IdPk。
    internal static async Task ServeHbbsAsync(TcpListener listener, Key signingKey, string targetId, string relayUuid,
        TaskCompletionSource<RendezvousMessage> requestObserved, TaskCompletionSource<long> responseSent, CancellationToken cancellationToken)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellationToken);
        var stream = client.GetStream();
        var request = RendezvousMessage.Parser.ParseFrom(await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, cancellationToken));
        requestObserved.TrySetResult(request);
        var peerKey = Enumerable.Range(1, 32).Select(value => (byte)value).ToArray();
        var signedIdPk = SignAttached(signingKey, new IdPk { Id = targetId, Pk = ByteString.CopyFrom(peerKey) }.ToByteArray());
        var response = new RendezvousMessage
        {
            RelayResponse = new RelayResponse
            {
                Uuid = relayUuid,
                RelayServer = "untrusted.invalid:21117",
                Pk = ByteString.CopyFrom(signedIdPk),
                Version = "1.4.2"
            }
        };
        await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, response.ToByteArray(), cancellationToken);
        responseSent.TrySetResult(Stopwatch.GetTimestamp());
        CryptographicOperations.ZeroMemory(peerKey);
    }

    // Fake hbbs讀取PunchHoleRequest並回傳測試指定的negative response。
    private static async Task ServeHbbsWithResponseAsync(TcpListener listener, RendezvousMessage response,
        TaskCompletionSource<bool> requestReceived, CancellationToken cancellationToken)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellationToken);
        var stream = client.GetStream();
        _ = await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, cancellationToken);
        requestReceived.TrySetResult(true);
        await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, response.ToByteArray(), cancellationToken);
    }

    // 以固定案例建立negative hbbs response，不將dynamic response文字帶進測試診斷。
    private static RendezvousMessage CreateRejectedResponse(string scenario, Key signingKey)
    {
        if (scenario == "offline")
            return new RendezvousMessage { PunchHoleResponse = new PunchHoleResponse { Failure = PunchHoleResponse.Types.Failure.Offline } };
        if (scenario == "direct")
            return new RendezvousMessage { PunchHoleResponse = new PunchHoleResponse { SocketAddr = ByteString.CopyFrom(new byte[] { 1 }) } };

        var identityId = scenario == "wrong-id" ? "987654321" : "123456789";
        var uuid = scenario == "bad-uuid" ? "invalid-uuid" : "12345678-1234-4234-8234-123456789abc";
        var message = CreateSignedRelayResponse(signingKey, identityId, uuid, scenario == "refused" ? "fixture-refusal" : "");
        if (scenario == "bad-signature") message.RelayResponse.Pk = ByteString.CopyFrom([0x01, 0x02, 0x03]);
        return message;
    }

    // Fake hbbr驗證RequestRelay欄位並送出一個不含機密的protocol payload。
    internal static async Task ServeHbbrAsync(TcpListener listener, TaskCompletionSource<long> relayAccepted,
        TaskCompletionSource<RendezvousMessage> requestObserved, byte[] peerMessage, CancellationToken cancellationToken)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellationToken);
        relayAccepted.TrySetResult(Stopwatch.GetTimestamp());
        var stream = client.GetStream();
        var request = RendezvousMessage.Parser.ParseFrom(await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, cancellationToken));
        requestObserved.TrySetResult(request);
        await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, peerMessage, cancellationToken);
    }

    // 建立hbbs簽署的IdPk response，私鑰只存在於本測試程序。
    private static RendezvousMessage CreateSignedRelayResponse(Key key, string identityId, string uuid, string refusal)
    {
        var peerKey = RandomNumberGenerator.GetBytes(32);
        var identity = new IdPk { Id = identityId, Pk = ByteString.CopyFrom(peerKey) }.ToByteArray();
        var attached = SignAttached(key, identity);
        CryptographicOperations.ZeroMemory(peerKey);
        return new RendezvousMessage
        {
            RelayResponse = new RelayResponse
            {
                Uuid = uuid,
                RelayServer = "untrusted.invalid:21117",
                Pk = ByteString.CopyFrom(attached),
                RefuseReason = refusal,
                Version = "1.4.2"
            }
        };
    }

    // 以程序內一次性私鑰建立libsodium相容attached簽章fixture。
    private static byte[] SignAttached(Key key, byte[] payload)
    {
        var signature = SignatureAlgorithm.Ed25519.Sign(key, payload);
        var attached = new byte[signature.Length + payload.Length];
        signature.CopyTo(attached, 0);
        payload.CopyTo(attached, signature.Length);
        return attached;
    }
}
