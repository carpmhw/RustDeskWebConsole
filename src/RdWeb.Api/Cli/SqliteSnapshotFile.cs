using System.Text.Json;
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

    // 錯誤輸出只寫固定分類，讓維運者判斷原因而不回顯路徑、資料或低層訊息。
    public static Task WriteFailureAsync(TextWriter error, string reason) =>
        error.WriteLineAsync(JsonSerializer.Serialize(new { status = "error", reason }));

    // 依例外型別歸類失敗原因；SQLITE_NOTADB（26）代表來源不是 SQLite 資料庫。
    public static string Classify(Exception exception) => exception switch
    {
        SqliteException { SqliteErrorCode: 26 } => "not_sqlite",
        SqliteException => "sqlite",
        InvalidDataException => "integrity",
        IOException or UnauthorizedAccessException => "io",
        InvalidOperationException => "configuration",
        _ => "unexpected",
    };

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
