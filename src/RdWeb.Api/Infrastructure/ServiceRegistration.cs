using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure.Kv;
using StackExchange.Redis;

namespace RdWeb.Api.Infrastructure;

public static class ServiceRegistration
{
    // 延後至 DI 解析才讀取設定，保留測試與外部主機覆寫能力。
    public static void AddApplicationInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton(provider => DatabaseOptions.FromConfiguration(provider.GetRequiredService<IConfiguration>()));
        services.AddSingleton(provider => KvOptions.FromConfiguration(provider.GetRequiredService<IConfiguration>()));
        services.AddSingleton(provider => RuntimeOptions.FromConfiguration(provider.GetRequiredService<IConfiguration>()));
        services.AddSingleton(TimeProvider.System);
        services.AddDbContextFactory<AppDbContext>((provider, options) =>
        {
            var path = provider.GetRequiredService<DatabaseOptions>().Path;
            options.UseSqlite(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource = path, Pooling = false, DefaultTimeout = 5 }.ToString())
                .AddInterceptors(new SqliteConnectionInterceptor());
        });
        services.AddSingleton<MemoryKvStore>();
        services.AddSingleton<IConnectionMultiplexer>(provider =>
        {
            try { return ConnectionMultiplexer.Connect(provider.GetRequiredService<KvOptions>().Redis!); }
            catch { throw new InvalidOperationException("Redis 初始化失敗。"); }
        });
        services.AddSingleton<IKvStore>(provider => provider.GetRequiredService<KvOptions>().Redis == null
            ? provider.GetRequiredService<MemoryKvStore>()
            : new RedisKvStore(provider.GetRequiredService<IConnectionMultiplexer>()));
        services.AddHostedService<KvCleanupService>();
        services.AddSingleton<AuditWriter>();
        services.AddHostedService(provider => provider.GetRequiredService<AuditWriter>());
    }

    // 在 HTTP 啟動前完成 migration、依賴探測與連線計數清理。
    public static async Task InitializeInfrastructureAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        _ = services.GetRequiredService<RuntimeOptions>();
        _ = services.GetRequiredService<KvOptions>();
        try
        {
            await DatabaseInitializer.InitializeAsync(services.GetRequiredService<DatabaseOptions>(), cancellationToken);
            var store = services.GetRequiredService<IKvStore>();
            await store.GetAsync("health:startup", cancellationToken);
            await store.ResetConnectionCountsAsync(cancellationToken);
        }
        catch { throw new InvalidOperationException("應用儲存初始化失敗，請檢查資料目錄及 KV 設定。"); }
    }
}
