using RdWeb.Api.Configuration;

namespace RdWeb.Api.Infrastructure;

public sealed class PathBaseMiddleware(RequestDelegate next, AppOptions options)
{
    // 在路由前處理保留與剝除兩種前綴模式，不重複累加代理已設定的前綴。
    public async Task InvokeAsync(HttpContext context)
    {
        var originalPath = context.Request.Path;
        var originalBase = context.Request.PathBase;
        var forwardedBase = originalBase.Value?.TrimEnd('/') ?? "";
        if (forwardedBase.Length > 0 && forwardedBase != options.BasePath)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        if (options.BasePath.Length > 0 && originalPath.StartsWithSegments(options.BasePath, out var remaining))
        {
            context.Request.Path = remaining;
        }
        context.Request.PathBase = options.BasePath;
        try
        {
            await next(context);
        }
        finally
        {
            context.Request.Path = originalPath;
            context.Request.PathBase = originalBase;
        }
    }
}
