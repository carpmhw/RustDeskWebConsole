using System.Security.Claims;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.RustDesk;

namespace RdWeb.Api.Endpoints;

public static class ServerEndpoints
{
    // 伺服器管理繼承既有Bearer／Origin／驗證與有界request規則。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/servers").AddEndpointFilter<AuthApiFilter>().RequireAuthorization().RequireRateLimiting("auth-work");
        group.MapGet("/", ListAsync); group.MapGet("/{id:guid}", GetAsync); group.MapPost("/", CreateAsync);
        group.MapGet("/available", AvailableAsync);
        group.MapPut("/{id:guid}", UpdateAsync); group.MapDelete("/{id:guid}", DeleteAsync); group.MapGet("/{id:guid}/connection-test", ProbeAsync);
    }
    // 列表只經過admin service。
    // Operator只需可選server摘要，不返回內部host或公鑰。
    private static async Task<IResult> AvailableAsync(ClaimsPrincipal principal, ServerService service, CancellationToken ct) => Results.Ok(await service.AvailableAsync(principal, ct));
    // 完整設定列表仍限admin。
    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, ServerService service, CancellationToken ct) => Results.Ok(await service.ListAsync(principal, ct));
    // 單筆設定不會跳過MFA判斷。
    private static async Task<IResult> GetAsync(Guid id, ClaimsPrincipal principal, ServerService service, CancellationToken ct) => Results.Ok(await service.GetAsync(principal, id, ct));
    // 建立成功回201與明確DTO。
    private static async Task<IResult> CreateAsync(ServerRequest request, ClaimsPrincipal principal, ServerService service, CancellationToken ct) => Results.Json(await service.CreateAsync(principal, request, ct), statusCode: 201);
    // 更新使用client指定的資料版本。
    private static async Task<IResult> UpdateAsync(Guid id, ServerRequest request, ClaimsPrincipal principal, ServerService service, CancellationToken ct) => Results.Ok(await service.UpdateAsync(principal, id, request, ct));
    // Query只含非敏感Version，不放金鑰或密碼。
    private static async Task<IResult> DeleteAsync(Guid id, int version, ClaimsPrincipal principal, ServerService service, CancellationToken ct) { await service.DeleteAsync(principal, id, version, ct); return Results.NoContent(); }
    // 唯讀probe不持有auth mutation gate，結果與協定驗證明確區分。
    private static async Task<IResult> ProbeAsync(Guid id, ClaimsPrincipal principal, ServerService service, CancellationToken ct) => Results.Ok(await service.ProbeAsync(principal, id, ct));
}
