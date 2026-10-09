using System.Diagnostics;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text.Json;
using Hbb;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;
using RdWeb.Api.Targets;

namespace RdWeb.Api.RustDesk;

public sealed class ConnectionCoordinator(AppDbContext database, TargetPolicy policy, RendezvousTransport transport, TimeProvider clock,
    ConnectionSlots slots, RelayBridge bridge, AuditWriter audits, ActiveConnectionRegistry registry)
{
    private const string RustDeskProtocolVersion = "1.4.2";
    private static readonly TimeSpan RelayRaceDelay = TimeSpan.FromMilliseconds(300);

    // 協調授權relay生命週期，資源／計數先釋放，再寫結束稽核。
    public async Task RunAsync(ConnectionGrant grant, WebSocket browser, CancellationToken cancellationToken)
    {
        var watch = Stopwatch.StartNew();
        var progress = new RelayProgress();
        var reason = AuditReason.Completed;
        var success = false;
        var started = false;
        try
        {
            await using (var lease = await slots.AcquireAsync(grant.UserId, cancellationToken))
            {
                await audits.WriteAsync(new(AuditAction.ConnectionStarted, AuditResult.Success, grant.UserId,
                    new(AuditReason.Completed), "target", grant.TargetId), cancellationToken);
                started = true;
                await using var relay = await EstablishRelayAsync(grant, cancellationToken);
                using var active = registry.Register(grant, relay.PeerIdentity ?? throw new AuthException("service_unavailable", 503));
                await bridge.RunAsync(browser, relay, cancellationToken, progress, new(active.Id, grant.TargetId, active.Peer));
                success = true;
            }
        }
        catch (OperationCanceledException) { reason = cancellationToken.IsCancellationRequested ? AuditReason.Disconnected : AuditReason.Expired; }
        catch (TimeoutException) { reason = AuditReason.Expired; await SendErrorAsync(browser, "connection_timeout"); }
        catch (AuthException failure)
        {
            reason = AuditReason.ConnectionFailed;
            await SendErrorAsync(browser, failure.Code == "connection_limit" ? "connection_limit" : "connection_failed");
        }
        catch { reason = AuditReason.ConnectionFailed; await SendErrorAsync(browser, "connection_failed"); }
        finally
        {
            // 不等待完整close handshake，避免client未讀取時拖住資源回收。
            try
            {
                using var closeTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                if (browser.State is WebSocketState.Open or WebSocketState.CloseReceived)
                    await browser.CloseOutputAsync(success ? WebSocketCloseStatus.NormalClosure : WebSocketCloseStatus.InternalServerError,
                        "relay ended", closeTimeout.Token);
            }
            catch { browser.Abort(); }
            if (started)
            {
                var totals = progress.Snapshot();
                await audits.WriteAsync(new(AuditAction.ConnectionEnded, success ? AuditResult.Success : AuditResult.Failure,
                    grant.UserId, new(reason, watch.ElapsedMilliseconds, totals.BrowserToTargetBytes, totals.TargetToBrowserBytes),
                    "target", grant.TargetId), CancellationToken.None);
            }
        }
    }

    // 錯誤control僅固定分類；一旦socket已失效就不再嘗試輸出。
    private static async Task SendErrorAsync(WebSocket socket, string code)
    {
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            if (socket.State == WebSocketState.Open)
                await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(new { type = "rdweb.error", code }).AsMemory(),
                    WebSocketMessageType.Text, true, timeout.Token);
        }
        catch { /* 不輸出可能包含protocol內容的WebSocket例外。 */ }
    }

    // 重驗grant後執行forced-relay rendezvous，驗簽成功才建立hbbr RequestRelay session。
    public async Task<IRustDeskUpstreamSession> EstablishRelayAsync(ConnectionGrant grant, CancellationToken cancellationToken)
    {
        try
        {
            return await EstablishRelayCoreAsync(grant, cancellationToken);
        }
        catch (AuthException)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
        }
    }

    // 確認user、target、server仍有效並依saved endpoints完成一次relay配對。
    private async Task<IRustDeskUpstreamSession> EstablishRelayCoreAsync(ConnectionGrant grant, CancellationToken cancellationToken)
    {
        var actor = await database.Users.AsNoTracking().SingleOrDefaultAsync(user => user.Id == grant.UserId, cancellationToken);
        if (actor == null || !actor.IsActive) throw new AuthException("unauthorized");
        var target = await policy.FindVisibleAsync(actor, grant.TargetId, cancellationToken);
        if (!(await policy.RightsAsync(actor, target, cancellationToken)).CanConnect)
            throw new AuthException("forbidden", StatusCodes.Status403Forbidden);
        var server = await database.RustDeskServers.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == target.ServerId, cancellationToken)
            ?? throw new AuthException("invalid_server", StatusCodes.Status404NotFound);
        if (!server.Enabled) throw new AuthException("server_disabled", StatusCodes.Status409Conflict);
        if (!ServerService.ValidPublicKey(server.PublicKey))
            throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);

        ServerEndpoint idEndpoint;
        ServerEndpoint relayEndpoint;
        try
        {
            idEndpoint = ServerEndpoint.Parse(server.IdServer);
            relayEndpoint = ServerEndpoint.Parse(server.RelayServer);
        }
        catch (ArgumentException)
        {
            throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
        }

        var punch = new RendezvousMessage
        {
            PunchHoleRequest = new PunchHoleRequest
            {
                Id = target.RustDeskId,
                NatType = NatType.Symmetric,
                LicenceKey = server.PublicKey,
                ConnType = ConnType.DefaultConn,
                Version = RustDeskProtocolVersion,
                ForceRelay = true
            }
        };

        await using var rendezvous = await transport.ConnectAsync(idEndpoint, server.Transport, server.AllowPrivateNetwork, cancellationToken);
        var peerRelay = await RequestPeerRelayAsync(rendezvous, punch, cancellationToken);
        var signingKey = Convert.FromBase64String(server.PublicKey);
        VerifiedPeerIdentity peerIdentity;
        try
        {
            if (!PeerIdentityVerifier.TryVerify(signingKey, peerRelay.Pk.Span, target.RustDeskId, out var identity))
                throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
            if (!Guid.TryParseExact(peerRelay.Uuid, "D", out var relayUuid) || relayUuid == Guid.Empty)
                throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
            peerIdentity = new(identity!.Id, Convert.ToBase64String(identity.Pk.Span));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(signingKey);
        }

        await Task.Delay(RelayRaceDelay, clock, cancellationToken);
        var relay = await ConnectRelayBeforeSendAsync(relayEndpoint, server, cancellationToken);
        try
        {
            await relay.SendControlAsync(new RendezvousMessage
            {
                RequestRelay = new RequestRelay
                {
                    Id = target.RustDeskId,
                    Uuid = peerRelay.Uuid,
                    LicenceKey = server.PublicKey,
                    ConnType = ConnType.DefaultConn
                }
            }, cancellationToken);
            relay.PeerIdentity = peerIdentity;
            return relay;
        }
        catch
        {
            await relay.DisposeAsync();
            throw;
        }
    }

    // 同一hbbs session最多發三次PunchHoleRequest，只有無回應才等待下一輪。
    private async Task<RelayResponse> RequestPeerRelayAsync(IRustDeskUpstreamSession rendezvous, RendezvousMessage punch,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            await rendezvous.SendControlAsync(punch, cancellationToken);
            using var readDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            readDeadline.CancelAfter(TimeSpan.FromSeconds(attempt * 3));
            RendezvousMessage response;
            try
            {
                response = await rendezvous.ReceiveControlAsync(readDeadline.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                continue;
            }

            if (response.UnionCase == RendezvousMessage.UnionOneofCase.RelayResponse)
            {
                var relay = response.RelayResponse;
                if (!string.IsNullOrEmpty(relay.RefuseReason))
                    throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
                return relay;
            }

            if (response.UnionCase == RendezvousMessage.UnionOneofCase.PunchHoleResponse)
                throw MapPunchHoleFailure(response.PunchHoleResponse);
            throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
        }

        throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
    }

    // 將hbbs拒絕回應轉為固定分類，不回傳peer或server提供的原文。
    private static AuthException MapPunchHoleFailure(PunchHoleResponse response)
    {
        if (response.SocketAddr.Length > 0 || !string.IsNullOrEmpty(response.OtherFailure))
            return new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
        return response.Failure switch
        {
            PunchHoleResponse.Types.Failure.IdNotExist => new AuthException("not_found", StatusCodes.Status404NotFound),
            PunchHoleResponse.Types.Failure.Offline => new AuthException("target_offline", StatusCodes.Status409Conflict),
            _ => new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable)
        };
    }

    // RequestRelay尚未送出時可重試hbbr connect；寫入結果不明時不重放UUID。
    private async Task<IRustDeskUpstreamSession> ConnectRelayBeforeSendAsync(ServerEndpoint endpoint, RdWeb.Api.Data.Entities.RustDeskServer server,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                return await transport.ConnectAsync(endpoint, server.Transport, server.AllowPrivateNetwork, cancellationToken);
            }
            catch (AuthException exception) when (exception.Code == "service_unavailable" && attempt < 2)
            {
                await Task.Delay(TimeSpan.FromMilliseconds((attempt + 1) * 100), clock, cancellationToken);
            }
        }
        throw new AuthException("service_unavailable", StatusCodes.Status503ServiceUnavailable);
    }
}
