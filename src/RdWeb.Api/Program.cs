using RdWeb.Api.Cli;
using RdWeb.Api.Configuration;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using Serilog;
using Serilog.Events;

namespace RdWeb.Api;

public partial class Program
{
    // 建立主機並提供不洩漏內部資訊的健康端點。
    public static async Task Main(string[] args)
    {
        if (args is ["spikes"])
        {
            await SpikeCommand.RunAsync();
            return;
        }
        if (args is ["healthcheck"])
        {
            await SpikeCommand.HealthcheckAsync();
            return;
        }
        var builder = WebApplication.CreateBuilder(args);
        // 延後至主機完成設定來源合併後才驗證設定，支援整合測試及外部主機覆寫。
        builder.Services.AddSingleton(services => AppOptions.FromConfiguration(services.GetRequiredService<IConfiguration>()));
        // 避免框架請求日誌記錄 URL 中的票證，僅保留必要的結構化維運資訊。
        builder.Services.AddSerilog((services, logging) =>
        {
            var configuration = services.GetRequiredService<IConfiguration>();
            logging.MinimumLevel.Information().MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
                .Enrich.FromLogContext().WriteTo.Console(new TimeZoneLogFormatter(configuration["LOG_TIME_ZONE"] ?? "UTC"));
        });
        var app = builder.Build();
        var options = app.Services.GetRequiredService<AppOptions>();
        app.UseForwardedHeaders(ProxyConfiguration.Create(app.Configuration, options));
        app.UseMiddleware<PathBaseMiddleware>();
        app.UseRouting();
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });
        app.MapGet("/api/v1/health", Health);
        if (app.Environment.IsDevelopment())
        {
            SpikeEndpoints.Map(app);
        }
        await app.RunAsync();
    }

    // 使用 UTC 傳輸事件時間，頁面與日誌各自負責顯示時區。
    private static IResult Health() => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow });
}
