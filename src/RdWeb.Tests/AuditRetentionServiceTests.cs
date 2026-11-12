using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Infrastructure;

namespace RdWeb.Tests;

public sealed class AuditRetentionServiceTests
{
    // 固定時間來源，讓保留期限判斷不依賴執行當下。
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    // 以測試主機的資料庫與稽核佇列建立服務，並設定保留天數。
    private static async Task<(AuditRetentionService Service, IDbContextFactory<AppDbContext> Factory)> CreateAsync(TestApplicationFactory host, DateTimeOffset now, int days)
    {
        var factory = host.Services.GetRequiredService<IDbContextFactory<AppDbContext>>();
        await using (var database = await factory.CreateDbContextAsync())
        {
            database.SystemSettings.Add(new SystemSetting { Key = AuditRetention.Key, Value = days.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            await database.SaveChangesAsync();
        }
        return (new AuditRetentionService(factory, host.Services.GetRequiredService<AuditWriter>(), new FixedClock(now), NullLogger<AuditRetentionService>.Instance), factory);
    }

    // 早於保留期限者刪除、期限內者保留，並寫入一筆只含筆數的清除稽核。
    [Fact]
    public async Task PurgesExpiredRowsAndRecordsCount()
    {
        await using var host = new TestApplicationFactory();
        var now = DateTimeOffset.UtcNow;
        var (service, factory) = await CreateAsync(host, now, 30);
        await AuditIntegrationTests.SeedAuditAsync(host,
            new AuditLog { Timestamp = now.UtcDateTime.AddDays(-31), Action = "Login", Result = "Success", SourceIp = "192.0.2.31" },
            new AuditLog { Timestamp = now.UtcDateTime.AddDays(-29), Action = "Login", Result = "Success", SourceIp = "192.0.2.29" });
        Assert.Equal(1, await service.PurgeOnceAsync(default));
        await host.Services.GetRequiredService<AuditWriter>().StopAsync(default);
        await using var database = await factory.CreateDbContextAsync();
        Assert.False(await database.AuditLogs.AnyAsync(audit => audit.SourceIp == "192.0.2.31"));
        Assert.True(await database.AuditLogs.AnyAsync(audit => audit.SourceIp == "192.0.2.29"));
        var purged = await database.AuditLogs.SingleAsync(audit => audit.Action == "AuditPurged");
        Assert.Equal("Success", purged.Result);
        Assert.Null(purged.UserId);
        Assert.Equal("{\"count\":1}", purged.Detail);
    }

    // 沒有過期紀錄時不刪除，也不寫清除稽核。
    [Fact]
    public async Task NoExpiredRowsMeansNoPurgeAudit()
    {
        await using var host = new TestApplicationFactory();
        var now = DateTimeOffset.UtcNow;
        var (service, factory) = await CreateAsync(host, now, 30);
        await AuditIntegrationTests.SeedAuditAsync(host, new AuditLog { Timestamp = now.UtcDateTime.AddDays(-1), Action = "Login", Result = "Success" });
        Assert.Equal(0, await service.PurgeOnceAsync(default));
        await host.Services.GetRequiredService<AuditWriter>().StopAsync(default);
        await using var database = await factory.CreateDbContextAsync();
        Assert.False(await database.AuditLogs.AnyAsync(audit => audit.Action == "AuditPurged"));
        Assert.Equal(1, await database.AuditLogs.CountAsync(audit => audit.Action == "Login"));
    }

    // 超過一批的過期紀錄分批刪除完整，期限內者不受影響。
    [Fact]
    public async Task DeletesAcrossBatches()
    {
        await using var host = new TestApplicationFactory();
        var now = DateTimeOffset.UtcNow;
        var (service, factory) = await CreateAsync(host, now, 30);
        var expired = AuditRetentionService.BatchSize * 2 + 17;
        await AuditIntegrationTests.SeedAuditAsync(host, [.. Enumerable.Range(0, expired)
            .Select(index => new AuditLog { Timestamp = now.UtcDateTime.AddDays(-40).AddSeconds(-index), Action = "TargetChanged", Result = "Success" })
            .Append(new AuditLog { Timestamp = now.UtcDateTime.AddDays(-2), Action = "TargetChanged", Result = "Success" })]);
        Assert.Equal(expired, await service.PurgeOnceAsync(default));
        await using var database = await factory.CreateDbContextAsync();
        Assert.Equal(1, await database.AuditLogs.CountAsync(audit => audit.Action == "TargetChanged"));
    }
}
