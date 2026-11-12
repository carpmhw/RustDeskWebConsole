using System.Security.Claims;
using RdWeb.Api.Infrastructure;

namespace RdWeb.Api.Endpoints;

public static class AuditEndpoints
{
    // 稽核只讀端點與其他管理群組共用 Origin／Bearer 驗證與限流。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/audit").AddEndpointFilter<AuthApiFilter>().RequireRateLimiting("auth-work").RequireAuthorization();
        group.MapGet("/", ListAsync); group.MapGet("/export", ExportAsync);
    }
    // 分頁查詢稽核紀錄。
    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, AuditQueryService audits, CancellationToken ct,
        string? from = null, string? to = null, string? user_id = null, string? action = null, string? result = null, int page = 1)
        => Results.Ok(await audits.ListAsync(principal, from, to, user_id, action, result, page, ct));
    // 匯出 CSV；檔名固定，不把篩選或內容放進標頭。
    private static async Task<IResult> ExportAsync(ClaimsPrincipal principal, HttpContext http, AuditQueryService audits, CancellationToken ct,
        string? from = null, string? to = null, string? user_id = null, string? action = null, string? result = null, string? time_zone = null)
    {
        var csv = await audits.ExportAsync(principal, from, to, user_id, action, result, time_zone, MfaEndpoints.Ip(http), ct);
        http.Response.Headers.ContentDisposition = "attachment; filename=\"audit.csv\"";
        return Results.Text(csv, "text/csv; charset=utf-8");
    }
}
