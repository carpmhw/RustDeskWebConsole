using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;

namespace RdWeb.Api.Cli;

public static class SqliteSpike
{
    // 在實際 WAL 資料檔中並發寫入使用者，稽核由有界佇列的單一消費者寫入。
    public static async Task<int> RunAsync(string path)
    {
        var options = SpikeDbContextFactory.CreateOptions("Data Source=" + path + ";Pooling=False;Default Timeout=5");
        await using (var database = new SpikeDbContext(options))
        {
            await database.Database.MigrateAsync();
            await database.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
        }
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }

        var queue = Channel.CreateBounded<SpikeAudit>(new BoundedChannelOptions(20) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
        // 將同步性較高的 SQLite 非同步 API 放在獨立工作，確保 producer 真正競爭。
        var consumer = Task.Run(async () =>
        {
            await using var database = new SpikeDbContext(options);
            await foreach (var audit in queue.Reader.ReadAllAsync())
            {
                database.Audits.Add(audit);
                await database.SaveChangesAsync();
                database.ChangeTracker.Clear();
            }
        });
        try
        {
            // 二十條不同連線同時寫入，短交易不持有跨網路操作的鎖。
            await Task.WhenAll(Enumerable.Range(0, 20).Select(index => Task.Run(async () =>
            {
                var user = new SpikeUser { Id = Guid.NewGuid(), CreatedAt = DateTime.UtcNow, Version = 1 };
                await using var database = new SpikeDbContext(options);
                database.Users.Add(user);
                await database.SaveChangesAsync();
                await queue.Writer.WriteAsync(new SpikeAudit
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    Timestamp = DateTime.UtcNow.AddSeconds(-index),
                    Detail = "{\"action\":\"login\"}",
                });
            })));
        }
        finally
        {
            queue.Writer.TryComplete();
            await consumer;
        }
        await using var verification = new SpikeDbContext(options);
        return await verification.Audits.CountAsync();
    }
}
