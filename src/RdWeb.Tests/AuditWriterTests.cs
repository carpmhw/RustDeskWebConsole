using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure;

namespace RdWeb.Tests;

public sealed class AuditWriterTests
{
    // 主機停止返回時所有已接受的事件都應已保存至 SQLite。
    [Fact]
    public async Task ConcurrentAuditIsDrainedBeforeStopReturns()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-audit-" + Guid.NewGuid());
        var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            using var writer = new AuditWriter(new TestDbFactory(path));
            await writer.StartAsync(default);
            await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => writer.WriteAsync(new(AuditAction.Login, AuditResult.Success))));
            await writer.StopAsync(default);
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            Assert.Equal(20, await database.AuditLogs.CountAsync());
            Assert.All(await database.AuditLogs.ToListAsync(), audit => Assert.Equal(DateTimeKind.Utc, audit.Timestamp.Kind));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    // 未啟動消費者時容量必須有界；取消等待不得新增事件。
    [Fact]
    public async Task FullQueueAppliesBackpressureAndRejectsInvalidMetadata()
    {
        using var writer = new AuditWriter(new TestDbFactory(":memory:"), 1);
        await writer.WriteAsync(new(AuditAction.Login, AuditResult.Success));
        using var cancellation = new CancellationTokenSource();
        var waiting = writer.WriteAsync(new(AuditAction.Login, AuditResult.Success), cancellation.Token);
        Assert.False(waiting.IsCompleted);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waiting);
        await Assert.ThrowsAsync<ArgumentException>(() => writer.WriteAsync(new((AuditAction)999, AuditResult.Success)));
        await Assert.ThrowsAsync<ArgumentException>(() => writer.WriteAsync(new(AuditAction.Login, AuditResult.Failure, Detail: new(BytesSent: -1))));
    }

    // 寫入失敗不可靜默丟棄；消費者與後續 producer 都可觀察失敗。
    [Fact]
    public async Task StorageFailureClosesQueueAndIsObservable()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-audit-failure-" + Guid.NewGuid());
        var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            using var writer = new AuditWriter(new TestDbFactory(path));
            await writer.StartAsync(default);
            await writer.WriteAsync(new(AuditAction.Login, AuditResult.Success, UserId: Guid.NewGuid()));
            var failure = await Assert.ThrowsAsync<InvalidOperationException>(() => writer.ExecuteTask!);
            Assert.Equal("稽核儲存失敗。", failure.Message);
            Assert.Null(failure.InnerException);
            await Assert.ThrowsAsync<System.Threading.Channels.ChannelClosedException>(() => writer.WriteAsync(new(AuditAction.Login, AuditResult.Success)));
            await Assert.ThrowsAsync<InvalidOperationException>(() => writer.StopAsync(default));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    internal sealed class TestDbFactory(string path) : IDbContextFactory<AppDbContext>
    {
        // 每批建立獨立 context，模擬正式 background writer 的生命週期。
        public AppDbContext CreateDbContext() => new(AppDbContextFactory.CreateOptions(path));
    }

    // 排空逾時時仍要取消消費者，避免主機釋放 DI 後繼續使用資料庫。
    [Fact]
    public async Task StopDeadlineCancelsBlockedConsumer()
    {
        var factory = new BlockingFactory();
        using var writer = new AuditWriter(factory);
        await writer.StartAsync(default);
        await writer.WriteAsync(new(AuditAction.Login, AuditResult.Success));
        await factory.Started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => writer.StopAsync(new CancellationToken(true)));
        await factory.Cancelled.Task.WaitAsync(TimeSpan.FromSeconds(2));
    }

    private sealed class BlockingFactory : IDbContextFactory<AppDbContext>
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Cancelled { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        // 此測試只觀察 async consumer 的取消，不提供同步建置途徑。
        public AppDbContext CreateDbContext() => throw new NotSupportedException();
        // 模擬尚未完成的資料庫操作，取消必須由 writer 傳遞。
        public async Task<AppDbContext> CreateDbContextAsync(CancellationToken cancellationToken = default)
        {
            Started.SetResult();
            try { await Task.Delay(Timeout.Infinite, cancellationToken); }
            catch (OperationCanceledException) { Cancelled.SetResult(); throw; }
            throw new InvalidOperationException();
        }
    }
}
