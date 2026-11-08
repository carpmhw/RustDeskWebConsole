using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Infrastructure;

namespace RdWeb.Tests;

public sealed class InfrastructureStartupTests
{
    // 以指定 DATA_PATH 建立只含基礎設施的服務並執行啟動初始化，回傳失敗訊息。
    private static async Task<string> InitializeFailureAsync(string dataPath)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = dataPath }).Build();
        var services = new ServiceCollection().AddSingleton<IConfiguration>(configuration).AddLogging();
        services.AddApplicationInfrastructure();
        await using var provider = services.BuildServiceProvider();
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.InitializeInfrastructureAsync());
        return error.Message;
    }

    // 資料目錄無權限時，訊息帶出 database／permission 分類，但不回顯路徑。
    [Fact]
    public async Task PermissionFailureNamesDatabaseStage()
    {
        // root 可寫入任何目錄，無法重現權限不足；CI 與開發環境皆以一般使用者執行。
        if (Environment.UserName == "root") return;
        var path = Path.Combine("/root", "rdweb-" + Guid.NewGuid(), "app.db");
        var message = await InitializeFailureAsync(path);
        Assert.Contains("database／permission", message);
        Assert.DoesNotContain("/root", message);
    }

    // 資料庫檔不是 SQLite 時，訊息帶出 database／sqlite 分類。
    [Fact]
    public async Task CorruptDatabaseNamesSqlite()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-startup-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            var path = Path.Combine(directory, "app.db");
            await File.WriteAllBytesAsync(path, System.Security.Cryptography.RandomNumberGenerator.GetBytes(8192));
            var message = await InitializeFailureAsync(path);
            Assert.Contains("database／sqlite", message);
            Assert.DoesNotContain(directory, message);
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            Directory.Delete(directory, true);
        }
    }
}
