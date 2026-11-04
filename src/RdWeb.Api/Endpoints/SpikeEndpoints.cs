using System.Net.WebSockets;
using System.Text;
using RdWeb.Api.Configuration;

namespace RdWeb.Api.Endpoints;

public static class SpikeEndpoints
{
    // 僅由 Development 主機呼叫，正式部署不註冊驗證端點。
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/v1/spikes/redirect", Redirect);
        app.MapGet("/api/v1/spikes/context", Context);
        app.MapGet("/api/v1/spikes/ws", WebSocketReady);
    }

    // 建立無認證用途的測試 Cookie 與帶對外前綴的重新導向。
    private static IResult Redirect(HttpContext context, AppOptions options)
    {
        context.Response.Cookies.Append("rdweb_spike", "probe", new CookieOptions
        {
            Path = options.BasePath + "/api/v1/auth",
            HttpOnly = true,
            Secure = options.PublicUrl.Scheme == "https",
            SameSite = SameSiteMode.Strict,
            MaxAge = TimeSpan.FromMinutes(1),
        });
        return Results.Redirect(options.PublicUrl.GetLeftPart(UriPartial.Authority) + options.BasePath + "/api/v1/health");
    }

    // 回傳測試用的請求脈絡，供可信代理驗證使用。
    private static IResult Context(HttpContext context) => Results.Ok(new
    {
        pathBase = context.Request.PathBase.Value,
        scheme = context.Request.Scheme,
        host = context.Request.Host.Value,
    });

    // 檢查 Origin 後送出固定 ready 訊息，限制握手測試時間與輸出大小。
    private static async Task WebSocketReady(HttpContext context, AppOptions options)
    {
        if (!context.WebSockets.IsWebSocketRequest || context.Request.Headers.Origin != options.PublicUrl.GetLeftPart(UriPartial.Authority))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        await socket.SendAsync(Encoding.UTF8.GetBytes("{\"status\":\"ready\"}"), WebSocketMessageType.Text, true, timeout.Token);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "spike complete", timeout.Token);
    }
}
