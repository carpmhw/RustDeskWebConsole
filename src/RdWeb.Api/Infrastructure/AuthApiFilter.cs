using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;
using RdWeb.Api.Security;

namespace RdWeb.Api.Infrastructure;

public sealed class AuthMutationGate : IDisposable
{
    public SemaphoreSlim Semaphore { get; } = new(1, 1);
    // 主機釋放時結束認證寫入序列化鎖。
    public void Dispose() => Semaphore.Dispose();
}
public sealed class AuthApiFilter(AppOptions options, AuthMutationGate gate) : IEndpointFilter
{
    // 統一防跨來源／輸入／安全錯誤，並在四 request 上限內序列化 SQLite 認證寫入。
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        http.Response.Headers.CacheControl = "no-store";
        var jsonBody = HttpMethods.IsPost(http.Request.Method) || HttpMethods.IsPut(http.Request.Method) || HttpMethods.IsPatch(http.Request.Method);
        var mutation = jsonBody || HttpMethods.IsDelete(http.Request.Method);
        if (mutation && (http.Request.Headers.Origin.Count != 1 || http.Request.Headers.Origin.ToString() != options.PublicUrl.GetLeftPart(UriPartial.Authority)))
            return Results.Json(new { code = "invalid_origin" }, statusCode: 403);
        if (jsonBody && !http.Request.HasJsonContentType()) return Results.Json(new { code = "invalid_request" }, statusCode: 415);
        foreach (var argument in context.Arguments)
            if (argument != null && !Validator.TryValidateObject(argument, new ValidationContext(argument), [], true)) return Results.Json(new { code = "invalid_request" }, statusCode: 400);
        if (mutation) await gate.Semaphore.WaitAsync(http.RequestAborted);
        try { return await next(context); }
        catch (AuthException exception) { return Results.Json(new { code = exception.Code }, statusCode: exception.Status); }
        catch (Exception exception) when (exception is DbUpdateException or CryptographicException or System.Threading.Channels.ChannelClosedException)
        { return Results.Json(new { code = "service_unavailable" }, statusCode: 503); }
        finally { if (mutation) gate.Semaphore.Release(); }
    }
}
