using Microsoft.AspNetCore.Http.Features;
using RdWeb.Api.Configuration;
using RdWeb.Api.Security;

namespace RdWeb.Api.Infrastructure;

public sealed class AuthApiMiddleware(RequestDelegate next, AppOptions options)
{
    // 在 JWT／body binding 前保護認證 API，使所有失敗也有 no-store 與安全診斷。
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/api/v1"))
        {
            context.Response.Headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers.XFrameOptions = "DENY";
        }
        var sensitive = context.Request.Path.StartsWithSegments("/api/v1/auth") || context.Request.Path.StartsWithSegments("/api/v1/users")
            || context.Request.Path.StartsWithSegments("/api/v1/settings") || context.Request.Path.StartsWithSegments("/api/v1/servers") || context.Request.Path.StartsWithSegments("/api/v1/targets");
        if (!sensitive) { await next(context); return; }
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers.XFrameOptions = "DENY";
        var size = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (size is { IsReadOnly: false }) size.MaxRequestBodySize = 16384;
        if (context.Request.ContentLength > 16384) { await ErrorAsync(context, 413, "invalid_request"); return; }
        var mutation = HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsPatch(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method);
        if (mutation && context.Request.Headers.Origin.ToString() != options.PublicUrl.GetLeftPart(UriPartial.Authority))
        { await ErrorAsync(context, 403, "invalid_origin"); return; }
        try
        {
            await next(context);
            if (!context.Response.HasStarted && context.Response.StatusCode >= 400 && context.Response.ContentType == null)
                await ErrorAsync(context, context.Response.StatusCode, context.Response.StatusCode switch { 401 => "unauthorized", 403 => "forbidden", 429 => "rate_limited", 404 => "not_found", _ => "invalid_request" });
        }
        catch (BadHttpRequestException exception) when (!context.Response.HasStarted) { await ErrorAsync(context, exception.StatusCode, "invalid_request"); }
        catch (AuthException exception) when (!context.Response.HasStarted) { await ErrorAsync(context, exception.Status, exception.Code); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
        catch (Exception) when (!context.Response.HasStarted) { await ErrorAsync(context, 503, "service_unavailable"); }
    }
    // 不附 request／exception／金鑰資訊，僅回穩定分類碼。
    private static Task ErrorAsync(HttpContext context, int status, string code)
    { context.Response.StatusCode = status; return context.Response.WriteAsJsonAsync(new { code }, context.RequestAborted); }
}
