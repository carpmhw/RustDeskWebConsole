using System.Security.Claims;
using RdWeb.Api.Configuration;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.RustDesk;
using RdWeb.Api.Security;

namespace RdWeb.Api.Endpoints;

public static class ConnectionEndpoints
{
    // Ticket建立繼承既有Bearer／Origin／JSON／rate-limit規則。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/targets").AddEndpointFilter<AuthApiFilter>().RequireAuthorization().RequireRateLimiting("auth-work");
        group.MapPost("/{id:guid}/connect-ticket", IssueTicketAsync);
        group.MapPost("/{id:guid}/login-assist", AssistAsync);
        // WS票證授權與JWT group分離，避免把長連線綁在auth-work名額。
        app.MapGet("/api/v1/targets/{id:guid}/connect", ConnectAsync);
    }
    // 只回當次最終proof，密碼與中間hash不得進DTO或audit。
    private static async Task<IResult> AssistAsync(Guid id, LoginAssistRequest request, ClaimsPrincipal principal,
        HttpContext http, LoginAssistService service, CancellationToken ct)
        => Results.Ok(await service.AssistAsync(principal, id, request, MfaEndpoints.Ip(http), ct));

    // Origin先於TakeOnce檢查；只協商固定rdweb.v1，不echo敏感票證subprotocol。
    private static async Task ConnectAsync(Guid id, HttpContext http, AppOptions options, ConnectionTicketService tickets,
        ConnectionCoordinator coordinator, IHostApplicationLifetime application)
    {
        if (!http.WebSockets.IsWebSocketRequest) throw new AuthException("invalid_request", 400);
        if (http.Request.Headers.Origin.Count != 1 || http.Request.Headers.Origin.ToString() != options.PublicUrl.GetLeftPart(UriPartial.Authority))
            throw new AuthException("invalid_origin", 403);
        var protocols = http.WebSockets.WebSocketRequestedProtocols;
        const string prefix = "rdweb.ticket.";
        if (protocols.Count != 2 || !protocols.Contains("rdweb.v1", StringComparer.Ordinal)) throw new AuthException("unauthorized");
        var credentials = protocols.Where(value => value.StartsWith(prefix, StringComparison.Ordinal)).ToArray();
        if (credentials.Length != 1 || credentials[0].Length != prefix.Length + 43) throw new AuthException("unauthorized");
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted, application.ApplicationStopping);
        var grant = await tickets.ConsumeAsync(id, credentials[0][prefix.Length..], lifetime.Token);
        using var browser = await http.WebSockets.AcceptWebSocketAsync("rdweb.v1");
        await coordinator.RunAsync(grant, browser, lifetime.Token);
    }

    // 只回短效ticket與存活時間，不把upstream設定帶到browser。
    private static async Task<IResult> IssueTicketAsync(Guid id, ConnectionTicketRequest request, ClaimsPrincipal principal,
        ConnectionTicketService service, CancellationToken cancellationToken)
    {
        _ = request;
        return Results.Json(await service.IssueAsync(principal, id, cancellationToken), statusCode: StatusCodes.Status201Created);
    }
}
