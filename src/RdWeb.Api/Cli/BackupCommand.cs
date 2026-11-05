using System.Text.Json;
using Microsoft.Data.Sqlite;
using RdWeb.Api.Configuration;

namespace RdWeb.Api.Cli;

public static class BackupCommand
{
    // 以 SQLite 線上備份 API 建立一致快照（含未 checkpoint 的 WAL 已提交資料）；先寫 .partial，驗證後才改名，不覆寫既有輸出。
    public static async Task<int> RunAsync(IConfiguration configuration, string outputPath, TextWriter output)
    {
        var target = Path.GetFullPath(outputPath);
        var partial = target + ".partial";
        try
        {
            var source = DatabaseOptions.FromConfiguration(configuration).Path;
            if (!File.Exists(source) || File.Exists(target)) return 1;
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            SqliteSnapshotFile.CreatePrivate(partial);
            string migration;
            await using (var from = await SqliteSnapshotFile.OpenAsync(source, SqliteOpenMode.ReadOnly))
            await using (var to = await SqliteSnapshotFile.OpenAsync(partial, SqliteOpenMode.ReadWrite))
            {
                from.BackupDatabase(to);
                // 快照改為單一檔案的 rollback journal，可在唯讀掛載下直接讀取與還原。
                await using (var journal = to.CreateCommand())
                {
                    journal.CommandText = "PRAGMA journal_mode=DELETE;";
                    await journal.ExecuteNonQueryAsync();
                }
                migration = await SqliteSnapshotFile.VerifyAsync(to) ?? throw new InvalidOperationException("快照完整性檢查失敗。");
            }
            File.Move(partial, target);
            await output.WriteLineAsync(JsonSerializer.Serialize(new { status = "ok", path = target, bytes = new FileInfo(target).Length, migration }));
            return 0;
        }
        catch
        {
            File.Delete(partial);
            return 1;
        }
    }
}
