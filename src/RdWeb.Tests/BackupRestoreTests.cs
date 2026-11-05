using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Cli;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class BackupRestoreTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "rdweb-backup-" + Guid.NewGuid());
    private string DataPath => Path.Combine(directory, "data", "app.db");

    // 每個測試使用獨立資料目錄。
    public BackupRestoreTests() => Directory.CreateDirectory(directory);

    // 釋放 SQLite 連線池後刪除暫存目錄。
    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        Directory.Delete(directory, true);
    }

    // 以 DATA_PATH 建立 CLI 使用的設定。
    private IConfiguration Configuration() =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = DataPath }).Build();

    // 新增一位測試使用者，代表一筆已提交資料。
    private static async Task AddUserAsync(string path, string username)
    {
        await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
        database.Users.Add(new User { Username = username, NormalizedUsername = username.ToUpperInvariant() });
        await database.SaveChangesAsync();
    }

    // 查詢指定資料庫是否含有該使用者。
    private static async Task<bool> HasUserAsync(string path, string username)
    {
        await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
        return await database.Users.AnyAsync(user => user.Username == username);
    }

    // 執行 backup 並回傳結束碼與輸出。
    private async Task<(int Code, string Output)> BackupAsync(string output)
    {
        using var writer = new StringWriter();
        var code = await BackupCommand.RunAsync(Configuration(), output, writer);
        return (code, writer.ToString());
    }

    // 執行 restore 並回傳結束碼與輸出。
    private async Task<(int Code, string Output)> RestoreAsync(string source)
    {
        using var writer = new StringWriter();
        var code = await RestoreCommand.RunAsync(Configuration(), source, writer);
        return (code, writer.ToString());
    }

    // WAL 尚未 checkpoint 時，線上備份仍須包含已提交資料且完整性正確。
    [Fact]
    public async Task BackupCapturesCommittedRowsWhileWalIsActive()
    {
        await DatabaseInitializer.InitializeAsync(new(DataPath));
        await using var holder = new SqliteConnection($"Data Source={DataPath};Pooling=False");
        await holder.OpenAsync();
        await using (var command = holder.CreateCommand())
        {
            command.CommandText = "PRAGMA wal_autocheckpoint=0;";
            await command.ExecuteNonQueryAsync();
        }
        await using (var database = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(holder).Options))
        {
            database.Users.Add(new User { Username = "wal-row", NormalizedUsername = "WAL-ROW" });
            await database.SaveChangesAsync();
        }
        Assert.True(new FileInfo(DataPath + "-wal").Length > 0);
        var output = Path.Combine(directory, "backups", "snapshot.db");
        var (code, text) = await BackupAsync(output);
        Assert.Equal(0, code);
        Assert.True(await HasUserAsync(output, "wal-row"));
        using var json = JsonDocument.Parse(text);
        Assert.Equal("ok", json.RootElement.GetProperty("status").GetString());
        Assert.Equal(output, json.RootElement.GetProperty("path").GetString());
        Assert.False(string.IsNullOrEmpty(json.RootElement.GetProperty("migration").GetString()));
        if (!OperatingSystem.IsWindows()) Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(output));
        Assert.False(File.Exists(output + ".partial"));
    }

    // 輸出檔已存在或資料庫不存在時失敗，且不留下 partial 檔、不建立資料庫。
    [Fact]
    public async Task BackupRefusesExistingOutputAndLeavesNoPartial()
    {
        var output = Path.Combine(directory, "snapshot.db");
        Assert.Equal(1, (await BackupAsync(output)).Code);
        Assert.False(File.Exists(output));
        Assert.False(File.Exists(output + ".partial"));
        Assert.False(File.Exists(DataPath));

        await DatabaseInitializer.InitializeAsync(new(DataPath));
        await File.WriteAllTextAsync(output, "keep");
        Assert.Equal(1, (await BackupAsync(output)).Code);
        Assert.Equal("keep", await File.ReadAllTextAsync(output));
        Assert.False(File.Exists(output + ".partial"));
    }

    // 還原以備份取代現有資料，並移除舊 WAL／SHM 以免套用到新檔。
    [Fact]
    public async Task RestoreReplacesDatabaseAndRemovesWalFiles()
    {
        await DatabaseInitializer.InitializeAsync(new(DataPath));
        await AddUserAsync(DataPath, "before");
        var output = Path.Combine(directory, "a.db");
        Assert.Equal(0, (await BackupAsync(output)).Code);
        await AddUserAsync(DataPath, "after");
        SqliteConnection.ClearAllPools();
        await File.WriteAllBytesAsync(DataPath + "-wal", []);
        await File.WriteAllBytesAsync(DataPath + "-shm", []);

        var (code, text) = await RestoreAsync(output);
        Assert.Equal(0, code);
        Assert.Equal("ok", JsonDocument.Parse(text).RootElement.GetProperty("status").GetString());
        Assert.False(File.Exists(DataPath + "-wal"));
        Assert.False(File.Exists(DataPath + "-shm"));
        Assert.True(await HasUserAsync(DataPath, "before"));
        Assert.False(await HasUserAsync(DataPath, "after"));
        if (!OperatingSystem.IsWindows()) Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(DataPath));
    }

    // 備份含目前程式不認得的 migration（較新 schema）時回 3，且不動現有資料。
    [Fact]
    public async Task RestoreRejectsUnknownMigrationWithoutTouchingData()
    {
        await DatabaseInitializer.InitializeAsync(new(DataPath));
        var output = Path.Combine(directory, "future.db");
        Assert.Equal(0, (await BackupAsync(output)).Code);
        await using (var connection = new SqliteConnection($"Data Source={output};Pooling=False"))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO __EFMigrationsHistory (MigrationId, ProductVersion) VALUES ('99991231235959_Future', '10.0.0');";
            await command.ExecuteNonQueryAsync();
        }
        SqliteConnection.ClearAllPools();
        var before = await File.ReadAllBytesAsync(DataPath);
        Assert.Equal(3, (await RestoreAsync(output)).Code);
        Assert.Equal(before, await File.ReadAllBytesAsync(DataPath));
        Assert.False(File.Exists(DataPath + ".restore"));
    }

    // 非 SQLite 或不存在的來源拒絕，現有資料不變。
    [Fact]
    public async Task RestoreRejectsCorruptFile()
    {
        await DatabaseInitializer.InitializeAsync(new(DataPath));
        SqliteConnection.ClearAllPools();
        var corrupt = Path.Combine(directory, "corrupt.db");
        await File.WriteAllBytesAsync(corrupt, System.Security.Cryptography.RandomNumberGenerator.GetBytes(8192));
        var before = await File.ReadAllBytesAsync(DataPath);
        Assert.Equal(1, (await RestoreAsync(corrupt)).Code);
        Assert.Equal(1, (await RestoreAsync(Path.Combine(directory, "missing.db"))).Code);
        Assert.Equal(before, await File.ReadAllBytesAsync(DataPath));
        Assert.False(File.Exists(DataPath + ".restore"));
    }

    // 缺少路徑參數時回用法錯誤，不當成啟動 Web。
    [Fact]
    public async Task DispatcherRoutesBackupAndRestore()
    {
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["backup"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["restore"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["backup", "a", "b"]));
    }
}
