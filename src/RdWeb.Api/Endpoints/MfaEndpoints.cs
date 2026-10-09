using System.Security.Claims;
using RdWeb.Api.Configuration;
using RdWeb.Api.Security;

namespace RdWeb.Api.Endpoints;

public static class MfaEndpoints
{
    // 掛入同一 auth group，繼承 Origin／validation／mutation gate。
    public static void Map(RouteGroupBuilder group)
    {
        group.MapPost("/mfa/verify", VerifyAsync);
        group.MapPost("/totp/enroll", EnrollAsync).RequireAuthorization();
        group.MapPost("/totp/confirm", ConfirmAsync).RequireAuthorization();
        group.MapPost("/totp/disable", DisableAsync).RequireAuthorization();
        group.MapPost("/recovery-codes", RegenerateAsync).RequireAuthorization();
    }
    // 二階段驗證失敗可重試，但舊票證始終失效。
    private static async Task<IResult> VerifyAsync(MfaRequest request, HttpContext http, MfaService mfa, AuthService auth, AppOptions app, CancellationToken ct)
    {
        var result = await mfa.VerifyLoginAsync(request.MfaToken, request.Code, Ip(http), ct);
        return result is SessionGrant grant ? await AuthEndpoints.GrantAsync(http, grant, auth, app, ct)
            : Results.Json(new { code = "invalid_mfa", mfa_required = true, mfa_token = ((MfaRetry)result).Token }, statusCode: 401);
    }
    // Restricted session 只可進行必要綁定。
    private static async Task<IResult> EnrollAsync(PasswordRequest request, ClaimsPrincipal principal, HttpContext http, SessionValidator sessions, MfaService mfa, CancellationToken ct)
        => Results.Ok(await mfa.EnrollAsync(await mfa.LoadAsync((await sessions.RequireAsync(principal, full: false, cancellationToken: ct)).Id, ct), request.Password, Ip(http), ct));
    // 確認後發行新的已驗 MFA session，舊 access 不會自行升權。
    private static async Task<IResult> ConfirmAsync(CodeRequest request, ClaimsPrincipal principal, HttpContext http, SessionValidator sessions, MfaService mfa, AuthService auth, AppOptions app, CancellationToken ct)
    {
        var result = await mfa.ConfirmAsync(await mfa.LoadAsync((await sessions.RequireAsync(principal, full: false, cancellationToken: ct)).Id, ct), request.Code, Ip(http), ct);
        return await AuthEndpoints.GrantAsync(http, result.Grant, auth, app, ct, result.Codes);
    }
    // 停用完成即撤銷 session，要求重新登入。
    private static async Task<IResult> DisableAsync(ReauthenticationRequest request, ClaimsPrincipal principal, HttpContext http, SessionValidator sessions, MfaService mfa, AppOptions app, CancellationToken ct)
    {
        await mfa.DisableAsync(await mfa.LoadAsync((await sessions.RequireAsync(principal, cancellationToken: ct)).Id, ct), request, Ip(http), ct);
        http.Response.Cookies.Delete("rdweb_refresh", AuthEndpoints.CookieOptions(app));
        return Results.Ok(new { reauthentication_required = true });
    }
    // 備援碼只在重產回應中回傳明文。
    private static async Task<IResult> RegenerateAsync(ReauthenticationRequest request, ClaimsPrincipal principal, HttpContext http, SessionValidator sessions, MfaService mfa, CancellationToken ct)
        => Results.Ok(new { recovery_codes = await mfa.RegenerateAsync(await mfa.LoadAsync((await sessions.RequireAsync(principal, cancellationToken: ct)).Id, ct), request, Ip(http), ct) });
    // 來源已由 TrustedProxy 處理，不能自行採信 request header。
    internal static string Ip(HttpContext http) => http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
