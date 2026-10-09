using System.Security.Claims;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Api.Endpoints;

public static class UserEndpoints
{
    // 使用者管理與 auth 共用驗證／Origin／序列化寫入，並要求 Bearer。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/users").AddEndpointFilter<AuthApiFilter>().RequireRateLimiting("auth-work").RequireAuthorization();
        group.MapGet("/", ListAsync); group.MapPost("/", CreateAsync); group.MapPatch("/{id:guid}", UpdateAsync);
        group.MapPost("/{id:guid}/reset-password", ResetPasswordAsync); group.MapPost("/{id:guid}/reset-totp", ResetTotpAsync);
    }
    // 僅傳安全列表。
    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, AdminService admin, CancellationToken ct) => Results.Ok(await admin.ListAsync(principal, ct));
    // 新增使用者後只回不含密碼的資料。
    private static async Task<IResult> CreateAsync(CreateUserRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
        => Results.Json(await admin.CreateAsync(principal, request, MfaEndpoints.Ip(http), ct), statusCode: 201);
    // 權限改變由服務同步撤銷 session。
    private static async Task<IResult> UpdateAsync(Guid id, UpdateUserRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
        => Results.Ok(await admin.UpdateAsync(principal, id, request, MfaEndpoints.Ip(http), ct));
    // 重設密碼不回顯輸入或 hash。
    private static async Task<IResult> ResetPasswordAsync(Guid id, ResetPasswordRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
    { await admin.ResetPasswordAsync(principal, id, request, MfaEndpoints.Ip(http), ct); return Results.NoContent(); }
    // 管理員重設他人 MFA 需二次驗證與稽核。
    private static async Task<IResult> ResetTotpAsync(Guid id, ReauthenticationRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
    { await admin.ResetTotpAsync(principal, id, request, MfaEndpoints.Ip(http), ct); return Results.NoContent(); }
}
