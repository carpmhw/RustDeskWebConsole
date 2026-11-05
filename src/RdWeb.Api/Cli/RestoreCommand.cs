using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;

namespace RdWeb.Api.Cli;

public static class RestoreCommand
{
    // 離線還原：驗證備份完整性與 schema 相容後才取代 DATA_PATH；0 成功、1 失敗、3 備份較新或陌生 schema。
    public static async Task<int> RunAsync(IConfiguration configuration, string sourcePath, TextWriter output)
    {
        string? staging = null;
        try
        {
            var target = DatabaseOptions.FromConfiguration(configuration).Path;
            if (!File.Exists(sourcePath)) return 1;
            string migration;
            await using (var from = await SqliteSnapshotFile.OpenAsync(Path.GetFullPath(sourcePath), SqliteOpenMode.ReadOnly))
            {
                migration = await SqliteSnapshotFile.VerifyAsync(from) ?? throw new InvalidOperationException("備份完整性檢查失敗。");
                await using (var database = new AppDbContext(AppDbContextFactory.CreateOptions(target)))
                    if (!database.Database.GetMigrations().Contains(migration)) return 3;
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                staging = target + ".restore";
                SqliteSnapshotFile.CreatePrivate(staging);
                await using var to = await SqliteSnapshotFile.OpenAsync(staging, SqliteOpenMode.ReadWrite);
                from.BackupDatabase(to);
                if (await SqliteSnapshotFile.VerifyAsync(to) != migration) throw new InvalidOperationException("暫存還原檔驗證失敗。");
            }
            // 舊 WAL／SHM 屬於被取代的資料庫，必須先移除，避免 SQLite 將其套用到還原後的檔案。
            File.Delete(target + "-wal");
            File.Delete(target + "-shm");
            File.Move(staging, target, true);
            await output.WriteLineAsync(JsonSerializer.Serialize(new { status = "ok", migration }));
            return 0;
        }
        catch
        {
            if (staging != null) File.Delete(staging);
            return 1;
        }
    }
}
