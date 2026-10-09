namespace RdWeb.Api.Infrastructure.Kv;

public sealed class KvCleanupService(MemoryKvStore store) : BackgroundService
{
    // 定期清除不再被讀取的過期項目，停止時響應主機取消。
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken)) store.SweepExpired();
    }
}
