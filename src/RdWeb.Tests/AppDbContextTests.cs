using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class AppDbContextTests
{
    // 正式 schema 必須可以使用 migration 重建，不得只靠測試建表。
    [Fact]
    public void ApplicationSchemaHasMigrations()
    {
        using var database = CreateContext(":memory:");
        Assert.NotEmpty(database.Database.GetMigrations());
    }

    // 真實檔案驗證使用者唯一性、UTC、外鍵、角色與 JSON 保護。
    [Fact]
    public async Task MigrationPreservesUtcConstraintsAndRestartData()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-app-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "app.db");
        try
        {
            await using (var database = CreateContext(path))
            {
                await database.Database.MigrateAsync();
                database.Users.Add(new User { Username = "Alice", NormalizedUsername = "ALICE", PasswordHash = "public-test-hash" });
                await database.SaveChangesAsync();
                Assert.Equal(1, (await database.Users.SingleAsync()).Version);
            }
            await using (var database = CreateContext(path))
            {
                var user = await database.Users.SingleAsync();
                Assert.Equal(DateTimeKind.Utc, user.CreatedAt.Kind);
                database.Users.Add(new User { Username = "alice", NormalizedUsername = "ALICE" });
                await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
                database.ChangeTracker.Clear();
                database.RecoveryCodes.Add(new RecoveryCode { UserId = Guid.NewGuid(), CodeHash = "fixture" });
                await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
                database.ChangeTracker.Clear();
                database.SystemSettings.Add(new SystemSetting { Key = "require_mfa", Value = "not-json" });
                await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
                database.ChangeTracker.Clear();
                user = await database.Users.SingleAsync();
                user.Role = "superadmin";
                await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
            }
        }
        finally { Directory.Delete(directory, true); }
    }

    // 兩個讀取相同版本的 writer 不能覆蓋彼此的更新。
    [Fact]
    public async Task StaleUpdateIsRejectedAndLocalTimeIsNotStored()
    {
        var path = Path.Combine(Path.GetTempPath(), "rdweb-concurrency-" + Guid.NewGuid() + ".db");
        try
        {
            await using var first = CreateContext(path);
            await first.Database.MigrateAsync();
            first.Users.Add(new User { Username = "operator", NormalizedUsername = "OPERATOR" });
            await first.SaveChangesAsync();
            await using var second = CreateContext(path);
            var stale = await second.Users.SingleAsync();
            var current = await first.Users.SingleAsync();
            current.Email = "new@example.test";
            await first.SaveChangesAsync();
            stale.Email = "stale@example.test";
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());
            current.LockedUntil = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
            await Assert.ThrowsAsync<InvalidOperationException>(() => first.SaveChangesAsync());
        }
        finally { File.Delete(path); }
    }

    // 每次建立測試 context 都套用與產品相同的外鍵檢查。
    private static AppDbContext CreateContext(string path) => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseSqlite(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString())
        .AddInterceptors(new SqliteConnectionInterceptor()).Options);

    // 初始化可重播且開啟 WAL，Linux 權限及稽核 UTC 排序都有實際證據。
    [Fact]
    public async Task InitializationEnforcesWalPermissionsAndAuditIndexes()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-init-" + Guid.NewGuid());
        var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            await DatabaseInitializer.InitializeAsync(new(path));
            if (!OperatingSystem.IsWindows())
            {
                Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(path));
                Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute, File.GetUnixFileMode(directory));
            }
            await using var database = CreateContext(path);
            Assert.Equal("wal", (await database.Database.SqlQueryRaw<string>("PRAGMA journal_mode").ToListAsync()).Single());
            var now = DateTime.UtcNow;
            database.AuditLogs.AddRange(new AuditLog { Timestamp = now, Action = "Login", Result = "Success" },
                new AuditLog { Timestamp = now.AddMinutes(-1), Action = "Login", Result = "Failure" });
            await database.SaveChangesAsync();
            var times = await database.AuditLogs.OrderBy(audit => audit.Timestamp).Select(audit => audit.Timestamp).ToListAsync();
            Assert.Equal(new[] { now.AddMinutes(-1), now }, times);
            Assert.All(times, time => Assert.Equal(DateTimeKind.Utc, time.Kind));
            var indexes = await database.Database.SqlQuery<string>($"SELECT name AS Value FROM sqlite_master WHERE type='index' AND tbl_name='audit_logs'").ToListAsync();
            Assert.Equal(4, indexes.Count);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
