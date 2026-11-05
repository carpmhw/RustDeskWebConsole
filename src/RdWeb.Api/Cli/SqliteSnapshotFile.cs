using Microsoft.Data.Sqlite;

namespace RdWeb.Api.Cli;

// backup 與 restore 共用的 SQLite 快照檔操作。
internal static class SqliteSnapshotFile
{
    // 以 0600 建立（或截斷）快照檔，避免 SQLite 建檔後到 chmod 之間暴露內容。
    public static void CreatePrivate(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            File.Create(path).Dispose();
            return;
        }
        new FileStream(path, new FileStreamOptions { Mode = FileMode.Create, Access = FileAccess.Write, UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite }).Dispose();
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
    }

    // 開啟不使用連線池的檔案連線，確保關閉後檔案控制代碼立即釋放、可安全改名。
    public static async Task<SqliteConnection> OpenAsync(string path, SqliteOpenMode mode)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Mode = mode, Pooling = false, DefaultTimeout = 5 }.ToString());
        await connection.OpenAsync();
        return connection;
    }

    // 完整性檢查通過時回傳最後一筆 migration；檢查失敗或無 migration 紀錄回 null。
    public static async Task<string?> VerifyAsync(SqliteConnection connection)
    {
        await using var integrity = connection.CreateCommand();
        integrity.CommandText = "PRAGMA integrity_check;";
        if (await integrity.ExecuteScalarAsync() as string != "ok") return null;
        await using var migration = connection.CreateCommand();
        migration.CommandText = "SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId DESC LIMIT 1;";
        return await migration.ExecuteScalarAsync() as string;
    }
}
