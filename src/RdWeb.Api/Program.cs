namespace RdWeb.Api;

public partial class Program
{
    // 建立主機並提供不洩漏內部資訊的健康端點。
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var app = builder.Build();
        app.MapGet("/api/v1/health", Health);
        await app.RunAsync();
    }

    // 使用 UTC 傳輸事件時間，頁面與日誌各自負責顯示時區。
    private static IResult Health() => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow });
}
