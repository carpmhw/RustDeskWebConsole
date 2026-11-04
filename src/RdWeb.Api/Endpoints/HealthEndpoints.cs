using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure.Kv;

namespace RdWeb.Api.Endpoints;

public static class HealthEndpoints
{
    // 公開依賴健康結果只含分類狀態，不回內部位址或例外。
    public static async Task<IResult> GetAsync(IDbContextFactory<AppDbContext> factory, IKvStore store, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        var databaseOk = await CheckDatabaseAsync(factory, timeout.Token);
        var kvOk = await CheckKvAsync(store, timeout.Token);
        return Results.Json(new
        {
            status = databaseOk && kvOk ? "ok" : "unavailable",
            version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "unknown",
            timestamp = DateTime.UtcNow,
            database = databaseOk ? "ok" : "unavailable",
            kv = kvOk ? "ok" : "unavailable"
        }, statusCode: databaseOk && kvOk ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
    }

    // 查詢正式 schema，不能只以連線成功誤判空資料庫已就緒。
    private static async Task<bool> CheckDatabaseAsync(IDbContextFactory<AppDbContext> factory, CancellationToken cancellationToken)
    {
        try
        {
            await using var database = await factory.CreateDbContextAsync(cancellationToken);
            _ = await database.Users.AsNoTracking().AnyAsync(cancellationToken);
            return true;
        }
        catch { return false; }
    }

    // 使用獨立短效探測鍵驗證寫入與單次取出，不接觸業務資料。
    private static async Task<bool> CheckKvAsync(IKvStore store, CancellationToken cancellationToken)
    {
        try
        {
            var key = "health:" + Guid.NewGuid();
            await store.SetWithTtlAsync(key, "ok", TimeSpan.FromSeconds(5), cancellationToken);
            return await store.TakeOnceAsync(key, cancellationToken) == "ok";
        }
        catch { return false; }
    }
}
