using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Cli;
using RdWeb.Api.Data;

namespace RdWeb.Tests;

public sealed class SqliteSpikeTests
{
    // 驗證 spike 使用可重播的 migration，而非略過遷移的 EnsureCreated。
    [Fact]
    public void SchemaHasMigrations()
    {
        using var database = new SpikeDbContext(new DbContextOptionsBuilder<SpikeDbContext>().UseSqlite("Data Source=:memory:").Options);
        Assert.NotEmpty(database.Database.GetMigrations());
    }

    // 以真實 WAL 檔驗證二十個並發 producer、UTC 排序、JSON 與外鍵。
    [Fact]
    public async Task ConcurrentWritesPreserveIntegrityAndUtcQueries()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-spike-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            var path = Path.Combine(directory, "spike.db");
            Assert.Equal(20, await SqliteSpike.RunAsync(path));
            await using var database = new SpikeDbContext(SpikeDbContextFactory.CreateOptions("Data Source=" + path + ";Pooling=False;Default Timeout=5"));
            var timestamps = await database.Audits.OrderBy(audit => audit.Timestamp).Select(audit => audit.Timestamp).ToListAsync();
            Assert.Equal(20, timestamps.Count);
            Assert.All(timestamps, timestamp => Assert.Equal(DateTimeKind.Utc, timestamp.Kind));
            Assert.Equal(timestamps.Order().ToArray(), timestamps.ToArray());
            var action = await database.Database.SqlQuery<string>($"SELECT json_extract(Detail, '$.action') AS Value FROM spike_audits LIMIT 1").SingleAsync();
            Assert.Equal("login", action);
            database.Audits.Add(new() { Id = Guid.NewGuid(), UserId = Guid.NewGuid(), Timestamp = DateTime.UtcNow });
            var exception = await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
            Assert.Equal(19, Assert.IsType<SqliteException>(exception.InnerException).SqliteErrorCode);
            await using var connection = new SqliteConnection("Data Source=" + path + ";Pooling=False");
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA journal_mode";
            Assert.Equal("wal", await command.ExecuteScalarAsync());
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }
}
