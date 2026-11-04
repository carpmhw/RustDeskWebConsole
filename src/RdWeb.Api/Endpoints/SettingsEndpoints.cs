using System.Security.Claims;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Api.Endpoints;

public static class SettingsEndpoints
{
    // 安全政策修改與使用者管理採相同防護。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/settings").AddEndpointFilter<AuthApiFilter>().RequireRateLimiting("auth-work").RequireAuthorization();
        group.MapGet("/security", GetAsync); group.MapPut("/security", PutAsync);
    }
    // 僅返回分類政策，不含任何安全金鑰。
    private static async Task<IResult> GetAsync(ClaimsPrincipal principal, AdminService admin, CancellationToken ct) => Results.Ok(await admin.GetSecurityAsync(principal, ct));
    // 政策修改必須完成管理員二次驗證。
    private static async Task<IResult> PutAsync(SecuritySettingRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
        => Results.Ok(await admin.SetSecurityAsync(principal, request, MfaEndpoints.Ip(http), ct));
}
