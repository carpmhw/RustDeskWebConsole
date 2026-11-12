using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;

namespace RdWeb.Api.Infrastructure;

public sealed class AuditRetentionService(IDbContextFactory<AppDbContext> factory, AuditWriter audits, TimeProvider clock, ILogger<AuditRetentionService> logger)
    : BackgroundService
{
    public const int BatchSize = 1_000;
    private static readonly TimeSpan Interval = TimeSpan.FromDays(1);

    // 啟動後先清除一次，之後每日執行；單輪失敗只記固定分類並於下一輪重試，不中斷服務。
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, clock);
        do
        {
            try { await PurgeOnceAsync(stoppingToken); }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning("audit_retention_failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    // 以短交易分批刪除早於保留期限的稽核，回傳刪除筆數；有刪除時寫一筆只含筆數的清除稽核。不執行 VACUUM。
    public async Task<int> PurgeOnceAsync(CancellationToken ct)
    {
        await using var database = await factory.CreateDbContextAsync(ct);
        var cutoff = clock.GetUtcNow().UtcDateTime.AddDays(-await AuditRetention.ReadAsync(database, ct));
        var total = 0;
        while (true)
        {
            var ids = await database.AuditLogs.Where(audit => audit.Timestamp < cutoff).OrderBy(audit => audit.Timestamp)
                .Select(audit => audit.Id).Take(BatchSize).ToListAsync(ct);
            if (ids.Count == 0) break;
            total += await database.AuditLogs.Where(audit => ids.Contains(audit.Id)).ExecuteDeleteAsync(ct);
            if (ids.Count < BatchSize) break;
        }
        if (total > 0) await audits.WriteAsync(new(AuditAction.AuditPurged, AuditResult.Success, Detail: new(Count: total)), ct);
        return total;
    }
}
