using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Cli;
using RdWeb.Api.Data;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class BootstrapTests
{
    // 首次建立、第二次 no-op，不可用環境覆寫既有密碼或保存明文。
    [Fact]
    public async Task BootstrapCreatesOnlyFirstAdminAndNeverOverwritesPassword()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-bootstrap-" + Guid.NewGuid());
        var path = Path.Combine(directory, "app.db");
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["DATA_PATH"] = path, ["BOOTSTRAP_ADMIN_USERNAME"] = "first-admin", ["BOOTSTRAP_ADMIN_PASSWORD"] = AuthIntegrationTests.Password }).Build();
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            Assert.Equal(0, await BootstrapCommand.RunAsync(configuration));
            await using (var database = new AppDbContext(AppDbContextFactory.CreateOptions(path)))
            {
                var user = await database.Users.SingleAsync();
                Assert.Equal("admin", user.Role);
                Assert.NotEqual(AuthIntegrationTests.Password, user.PasswordHash);
                Assert.True(await new PasswordHasher().VerifyAsync(AuthIntegrationTests.Password, user.PasswordHash));
            }
            configuration["BOOTSTRAP_ADMIN_PASSWORD"] = "another-public-test-password";
            Assert.Equal(0, await BootstrapCommand.RunAsync(configuration));
            await using var read = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            Assert.Equal(1, await read.Users.CountAsync());
            Assert.True(await new PasswordHasher().VerifyAsync(AuthIntegrationTests.Password, (await read.Users.SingleAsync()).PasswordHash));
            Assert.Equal(1, await read.AuditLogs.CountAsync());
        }
        finally { Directory.Delete(directory, true); }
    }

    // 半套 bootstrap 設定不能默默啟動 Web，CLI 缺少輸入回非零。
    [Fact]
    public async Task IncompleteBootstrapConfigurationIsRejected()
    {
        Assert.Equal(1, await BootstrapCommand.RunAsync(new ConfigurationBuilder().Build()));
        await using var factory = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        { ["BOOTSTRAP_ADMIN_USERNAME"] = "admin", ["BOOTSTRAP_ADMIN_PASSWORD"] = "" })));
        var exception = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("初始管理員建立失敗", exception.Message);
        Assert.Null(exception.InnerException);
    }
}
