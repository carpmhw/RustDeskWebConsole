using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace RdWeb.Api.Data;

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    // EF 工具使用獨立正式 context，不啟動 web 或讀取認證祕密。
    public AppDbContext CreateDbContext(string[] args) => new(CreateOptions("data/app.db"));

    // 集中建立檔案型 SQLite 設定，每個連線都包含外鍵與鎖等待保護。
    public static DbContextOptions<AppDbContext> CreateOptions(string path) => new DbContextOptionsBuilder<AppDbContext>()
        .UseSqlite(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false, DefaultTimeout = 5 }.ToString())
        .AddInterceptors(new SqliteConnectionInterceptor()).Options;
}
