using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;

namespace RdWeb.Api.Data;

public static class DatabaseInitializer
{
    // 接受請求前遷移正式資料庫，並在檔案建立前限制資料目錄權限。
    public static async Task InitializeAsync(DatabaseOptions options, CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(options.Path)!;
        Directory.CreateDirectory(directory);
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            // 先以受限權限建立檔案，避免 SQLite 建檔到 chmod 之間暴露內容。
            using var file = new FileStream(options.Path, new FileStreamOptions
            {
                Mode = FileMode.OpenOrCreate,
                Access = FileAccess.ReadWrite,
                UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite
            });
            File.SetUnixFileMode(options.Path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(options.Path));
        await database.Database.MigrateAsync(cancellationToken);
        await database.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", cancellationToken);
    }
}
