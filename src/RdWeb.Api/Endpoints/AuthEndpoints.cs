using System.Security.Claims;
using RdWeb.Api.Configuration;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Api.Endpoints;

public static class AuthEndpoints
{
    // 認證 request 共用來源／驗證／背壓規則。
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/auth").AddEndpointFilter<AuthApiFilter>().RequireRateLimiting("auth-work");
        group.MapPost("/login", LoginAsync); group.MapPost("/refresh", RefreshAsync); group.MapPost("/logout", LogoutAsync);
        group.MapGet("/csrf", CsrfAsync); group.MapGet("/me", MeAsync).RequireAuthorization();
        MfaEndpoints.Map(group);
    }

    // JSON 不回 refresh 明文，僅以受限 cookie 保存。
    internal static async Task<IResult> GrantAsync(HttpContext http, SessionGrant grant, AuthService auth, AppOptions app, CancellationToken cancellationToken, string[]? recovery = null)
    {
        http.Response.Cookies.Append("rdweb_refresh", grant.RefreshValue, CookieOptions(app, grant.Token.ExpiresAt));
        var user = await http.RequestServices.GetRequiredService<RdWeb.Api.Data.AppDbContext>().Users.FindAsync([grant.Token.UserId], cancellationToken) ?? throw new AuthException("unauthorized");
        return Results.Ok(new
        {
            access_token = grant.AccessToken,
            token_type = "Bearer",
            expires_in = 900,
            csrf_token = grant.CsrfToken,
            user = await auth.MeAsync(user, grant.Token.MfaVerified, cancellationToken),
            recovery_codes = recovery
        });
    }

    // Cookie Path 尊重 subpath，Secure 依公開網址而非內部 proxy 連線。
    internal static CookieOptions CookieOptions(AppOptions app, DateTime? expiry = null) => new()
    { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = app.PublicUrl.Scheme == "https", Path = app.BasePath + "/api/v1/auth", Expires = expiry };

    // 第一階段有 MFA 時只回 challenge，不發登入 cookie。
    private static async Task<IResult> LoginAsync(LoginRequest request, HttpContext http, AuthService auth, AppOptions app, CancellationToken cancellationToken)
    {
        var result = await auth.LoginAsync(request.Username, request.Password, http.Connection.RemoteIpAddress?.ToString() ?? "unknown", cancellationToken);
        return result is SessionGrant grant ? await GrantAsync(http, grant, auth, app, cancellationToken) : Results.Ok(result);
    }

    // 只有 matching cookie／CSRF 的同源請求才能輪替。
    private static async Task<IResult> RefreshAsync(HttpContext http, AuthService auth, TokenService tokens, AppOptions app, CancellationToken cancellationToken)
        => await GrantAsync(http, await auth.RefreshAsync(RequireCsrf(http, tokens), cancellationToken), auth, app, cancellationToken);

    // 撤銷 family 並用原始 Path 清除 cookie。
    private static async Task<IResult> LogoutAsync(HttpContext http, AuthService auth, TokenService tokens, AppOptions app, CancellationToken cancellationToken)
    {
        await auth.LogoutAsync(RequireCsrf(http, tokens), cancellationToken);
        http.Response.Cookies.Delete("rdweb_refresh", CookieOptions(app));
        return Results.NoContent();
    }

    // 唯讀取得 CSRF，不延長／輪替工作階段。
    private static async Task<IResult> CsrfAsync(HttpContext http, AuthService auth, TokenService tokens, CancellationToken cancellationToken)
    {
        var raw = http.Request.Cookies["rdweb_refresh"];
        _ = await auth.FindRefreshAsync(raw, false, cancellationToken);
        return Results.Ok(new { csrf_token = tokens.Csrf(raw!) });
    }

    // Restricted session 仍可查詢綁定要求，不能看到 secret 欄位。
    private static async Task<IResult> MeAsync(ClaimsPrincipal principal, SessionValidator sessions, AuthService auth, CancellationToken cancellationToken)
        => Results.Ok(await auth.MeAsync(await sessions.RequireAsync(principal, full: false, cancellationToken: cancellationToken), principal.FindFirstValue("mfa") == "1", cancellationToken));

    // Cookie 自動附帶不足以刷新或登出，必須有綁定的 CSRF header。
    internal static string RequireCsrf(HttpContext http, TokenService tokens)
    {
        var raw = http.Request.Cookies["rdweb_refresh"];
        if (!TokenService.TryParseRefresh(raw, out _) || http.Request.Headers["X-Rdweb-CSRF"].Count != 1
            || !tokens.VerifyCsrf(raw!, http.Request.Headers["X-Rdweb-CSRF"])) throw new AuthException("invalid_csrf", 403);
        return raw!;
    }
}
