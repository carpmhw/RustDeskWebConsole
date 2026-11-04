using System.Security.Claims;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Targets;

namespace RdWeb.Api.Endpoints;

public static class TargetEndpoints
{
    // 目標共用JWT／Origin／JSON／gate／body規則。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/targets").AddEndpointFilter<AuthApiFilter>().RequireAuthorization().RequireRateLimiting("auth-work");
        group.MapGet("/", ListAsync); group.MapGet("/{id:guid}", GetAsync); group.MapPost("/", CreateAsync); group.MapPut("/{id:guid}", UpdateAsync); group.MapDelete("/{id:guid}", DeleteAsync);
        group.MapGet("/{id:guid}/permissions", GetPermissionsAsync); group.MapPut("/{id:guid}/permissions", SetPermissionsAsync);
        group.MapPost("/{id:guid}/password/reveal", RevealAsync);
        group.MapPost("/import", ImportAsync); group.MapGet("/export", ExportAsync); group.MapPost("/bulk-delete", BulkDeleteAsync);
    }
    // 僅metadata分頁，無任意SQL排序。
    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, TargetService service, CancellationToken ct, string? q = null, string? group = null, int page = 1, int page_size = 20) => Results.Ok(await service.ListAsync(principal, q, group, page, page_size, ct));
    // 安全詳情投影。
    private static async Task<IResult> GetAsync(Guid id, ClaimsPrincipal principal, TargetService service, CancellationToken ct) => Results.Ok(await service.GetAsync(principal, id, ct));
    // Creator不可由client覆寫。
    private static async Task<IResult> CreateAsync(TargetRequest request, ClaimsPrincipal principal, TargetService service, CancellationToken ct) => Results.Json(await service.CreateAsync(principal, request, ct), statusCode: 201);
    // 整筆設定及Version。
    private static async Task<IResult> UpdateAsync(Guid id, TargetRequest request, ClaimsPrincipal principal, TargetService service, CancellationToken ct) => Results.Ok(await service.UpdateAsync(principal, id, request, ct));
    // 同交易刪除關聯與祕密。
    private static async Task<IResult> DeleteAsync(Guid id, int version, ClaimsPrincipal principal, TargetService service, CancellationToken ct) { await service.DeleteAsync(principal, id, version, ct); return Results.NoContent(); }
    // ACL讀取只admin。
    private static async Task<IResult> GetPermissionsAsync(Guid id, ClaimsPrincipal principal, TargetService service, CancellationToken ct) => Results.Ok(await service.GetPermissionsAsync(principal, id, ct));
    // ACL更新使用TargetVersion。
    private static async Task<IResult> SetPermissionsAsync(Guid id, TargetPermissionsRequest request, ClaimsPrincipal principal, TargetService service, CancellationToken ct) => Results.Ok(await service.SetPermissionsAsync(principal, id, request, ct));
    // 獨立敏感端點回no-store，UI清除期限由expires_in提供。
    private static async Task<IResult> RevealAsync(Guid id, ReauthenticationRequest request, ClaimsPrincipal principal, HttpContext http, TargetSecretsService service, CancellationToken ct)
        => Results.Ok(await service.RevealAsync(principal, id, request, MfaEndpoints.Ip(http), ct));
    // Import只接有限JSON metadata CSV。
    private static async Task<IResult> ImportAsync(TargetImportRequest request, ClaimsPrincipal principal, TargetTransferService service, CancellationToken ct) => Results.Json(await service.ImportAsync(principal, request.Csv, ct), statusCode: 201);
    // Attachment檔名固定，不把輸入或目標名稱放進header。
    private static async Task<IResult> ExportAsync(ClaimsPrincipal principal, HttpContext http, TargetTransferService service, CancellationToken ct, string? q = null, string? group = null)
    { var csv = await service.ExportAsync(principal, q, group, ct); http.Response.Headers.ContentDisposition = "attachment; filename=\"targets.csv\""; return Results.Text(csv, "text/csv; charset=utf-8"); }
    // Bulk同交易刪除，成功才204。
    private static async Task<IResult> BulkDeleteAsync(TargetBulkRequest request, ClaimsPrincipal principal, TargetTransferService service, CancellationToken ct) { await service.BulkDeleteAsync(principal, request, ct); return Results.NoContent(); }
}
