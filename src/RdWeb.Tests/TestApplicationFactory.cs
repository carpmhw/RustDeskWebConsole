using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using RdWeb.Api;

namespace RdWeb.Tests;

public sealed class TestApplicationFactory(Action<IWebHostBuilder>? configure = null) : WebApplicationFactory<Program>
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "rdweb-host-" + Guid.NewGuid());
    public string DatabasePath => Path.Combine(_directory, "app.db");
    private readonly string _signingKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    private readonly string _vaultKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));

    // 每個主機使用隔離正式資料庫，不修改開發者資料或受外部 Redis 設定影響。
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DATA_PATH"] = DatabasePath,
            ["REDIS_URL"] = "",
            ["INSTANCE_COUNT"] = "1",
            ["SECRET_KEY"] = _signingKey,
            ["VAULT_KEY"] = _vaultKey,
            ["BOOTSTRAP_ADMIN_USERNAME"] = "",
            ["BOOTSTRAP_ADMIN_PASSWORD"] = ""
        }));
        configure?.Invoke(builder);
    }

    // 主機與背景 writer 停止後才刪除測試資料。
    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        if (Directory.Exists(_directory)) Directory.Delete(_directory, true);
    }
}
