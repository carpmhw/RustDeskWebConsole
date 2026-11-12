using System.Security.Claims;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.RustDesk;

namespace RdWeb.Api.Endpoints;

public static class ConnectionAdminEndpoints
{
    // 作用中連線管理與其他管理群組共用 Origin／Bearer 驗證與限流。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/connections").AddEndpointFilter<AuthApiFilter>().RequireRateLimiting("auth-work").RequireAuthorization();
        group.MapGet("/", ListAsync); group.MapPost("/{id:guid}/terminate", TerminateAsync);
    }
    // 強制中斷指定連線。
    private static async Task<IResult> TerminateAsync(Guid id, ClaimsPrincipal principal, HttpContext http, ConnectionAdminService connections, CancellationToken ct)
    { await connections.TerminateAsync(principal, id, MfaEndpoints.Ip(http), ct); return Results.NoContent(); }
    // 列出作用中連線。
    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, ConnectionAdminService connections, CancellationToken ct)
        => Results.Ok(await connections.ListAsync(principal, ct));
}
