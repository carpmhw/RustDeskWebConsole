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
    public static async Task<int> Main(string[] args)
    {
        if (await CommandDispatcher.ExecuteAsync(args) is int exitCode) return exitCode;
        var builder = WebApplication.CreateBuilder(args);
        // 延後至主機完成設定來源合併後才驗證設定，支援整合測試及外部主機覆寫。
        builder.Services.AddSingleton(services => AppOptions.FromConfiguration(services.GetRequiredService<IConfiguration>()));
        builder.Services.AddApplicationInfrastructure();
        builder.Services.AddApplicationAuthentication();
        // 避免框架請求日誌記錄 URL 中的票證，僅保留必要的結構化維運資訊。
        builder.Services.AddSerilog((services, logging) =>
        {
            var configuration = services.GetRequiredService<IConfiguration>();
            logging.MinimumLevel.Information().MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
                .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
                .Enrich.FromLogContext().WriteTo.Console(new TimeZoneLogFormatter(configuration["LOG_TIME_ZONE"] ?? "UTC"));
        });
        var app = builder.Build();
        var options = app.Services.GetRequiredService<AppOptions>();
        _ = app.Services.GetRequiredService<AuthOptions>();
        await app.Services.InitializeInfrastructureAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            await RdWeb.Api.Security.VaultState.InitializeAsync(scope.ServiceProvider.GetRequiredService<RdWeb.Api.Data.AppDbContext>(), app.Services.GetRequiredService<RdWeb.Api.Security.Vault>());
        }
        await RdWeb.Api.Security.AuthService.WarmUpAsync();
        await BootstrapCommand.RunIfConfiguredAsync(app.Configuration);
        app.UseForwardedHeaders(ProxyConfiguration.Create(app.Configuration, options));
        app.UseMiddleware<PathBaseMiddleware>();
        app.UseMiddleware<AuthApiMiddleware>();
        app.UseRouting();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });
        app.MapGet("/api/v1/health", HealthEndpoints.GetAsync);
        AuthEndpoints.Map(app);
        UserEndpoints.Map(app);
        SettingsEndpoints.Map(app);
        ServerEndpoints.Map(app);
        TargetEndpoints.Map(app);
        if (app.Environment.IsDevelopment())
        {
            SpikeEndpoints.Map(app);
        }
        await app.RunAsync();
        return 0;
    }
}
