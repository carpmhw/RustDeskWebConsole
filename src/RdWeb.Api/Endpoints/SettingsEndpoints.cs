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
        group.MapGet("/audit", GetAuditAsync); group.MapPut("/audit", PutAuditAsync);
        group.MapGet("/connections", GetConnectionsAsync); group.MapPut("/connections", PutConnectionsAsync);
        group.MapGet("/connections/idle", GetIdleAsync);
    }
    // 僅返回分類政策，不含任何安全金鑰。
    private static async Task<IResult> GetAsync(ClaimsPrincipal principal, AdminService admin, CancellationToken ct) => Results.Ok(await admin.GetSecurityAsync(principal, ct));
    // 連線管控設定讀取（管理員）。
    private static async Task<IResult> GetConnectionsAsync(ClaimsPrincipal principal, AdminService admin, CancellationToken ct) => Results.Ok(await admin.GetConnectionSettingAsync(principal, ct));
    // 閒置分鐘數讀取（所有登入者）。
    private static async Task<IResult> GetIdleAsync(ClaimsPrincipal principal, AdminService admin, CancellationToken ct) => Results.Ok(await admin.GetIdleSettingAsync(principal, ct));
    // 連線管控設定修改必須完成管理員二次驗證。
    private static async Task<IResult> PutConnectionsAsync(ConnectionSettingRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
        => Results.Ok(await admin.SetConnectionSettingAsync(principal, request, MfaEndpoints.Ip(http), ct));
    // 稽核保留天數讀取。
    private static async Task<IResult> GetAuditAsync(ClaimsPrincipal principal, AdminService admin, CancellationToken ct) => Results.Ok(await admin.GetAuditSettingAsync(principal, ct));
    // 保留天數修改必須完成管理員二次驗證。
    private static async Task<IResult> PutAuditAsync(AuditSettingRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
        => Results.Ok(await admin.SetAuditSettingAsync(principal, request, MfaEndpoints.Ip(http), ct));
    // 政策修改必須完成管理員二次驗證。
    private static async Task<IResult> PutAsync(SecuritySettingRequest request, ClaimsPrincipal principal, HttpContext http, AdminService admin, CancellationToken ct)
        => Results.Ok(await admin.SetSecurityAsync(principal, request, MfaEndpoints.Ip(http), ct));
}
