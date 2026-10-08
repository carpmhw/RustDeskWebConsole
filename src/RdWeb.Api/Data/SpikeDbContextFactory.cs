using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace RdWeb.Api.Data;

public sealed class SpikeDbContextFactory : IDesignTimeDbContextFactory<SpikeDbContext>
{
    // EF 工具只需模型連線設定，migration 生成時不會建立真實資料檔。
    public SpikeDbContext CreateDbContext(string[] args) => new(CreateOptions("Data Source=:memory:;Default Timeout=5"));

    // 統一設定連線攔截器，測試與 spike 皆使用相同外鍵與等待規則。
    public static DbContextOptions<SpikeDbContext> CreateOptions(string connectionString) =>
        new DbContextOptionsBuilder<SpikeDbContext>().UseSqlite(connectionString).AddInterceptors(new SqliteConnectionInterceptor()).Options;
}
