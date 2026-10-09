using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Configuration;

namespace RdWeb.Tests;

public sealed class InfrastructureOptionsTests
{
    // Redis 不會解除 SQLite 單實例限制，模糊或負數配置亦被拒絕。
    [Theory]
    [InlineData("0")]
    [InlineData("2")]
    [InlineData("-1")]
    [InlineData("many")]
    public void MultipleInstancesAreRejectedEvenWithRedis(string count)
    {
        var configuration = Configure(new() { ["INSTANCE_COUNT"] = count, ["REDIS_URL"] = "redis://127.0.0.1:16379" });
        Assert.Throws<InvalidOperationException>(() => RuntimeOptions.FromConfiguration(configuration));
    }

    // TLS、ACL、編碼字元及 database 都依 URL 定義解析。
    [Fact]
    public void RedisUrlParsesTlsCredentialsAndDatabase()
    {
        var options = KvOptions.FromConfiguration(Configure(new() { ["REDIS_URL"] = "rediss://test-user:public%3Afixture@localhost:6380/3" })).Redis!;
        Assert.True(options.Ssl);
        Assert.Equal("test-user", options.User);
        Assert.Equal("public:fixture", options.Password);
        Assert.Equal(3, options.DefaultDatabase);
        var endpoint = Assert.IsType<System.Net.DnsEndPoint>(options.EndPoints.Single());
        Assert.Equal("localhost", endpoint.Host);
        Assert.Equal(6380, endpoint.Port);
        Assert.Null(KvOptions.FromConfiguration(Configure(new())).Redis);
    }

    // 無效 URL 必須回固定錯誤，不能回顯 query 或認證值。
    [Theory]
    [InlineData("http://public-fixture@localhost")]
    [InlineData("redis://localhost/16")]
    [InlineData("redis://localhost/-1")]
    [InlineData("redis://localhost/1/2")]
    [InlineData("redis://localhost?marker=public-fixture")]
    public void InvalidRedisUrlDoesNotLeakInput(string url)
    {
        var exception = Assert.Throws<InvalidOperationException>(() => KvOptions.FromConfiguration(Configure(new() { ["REDIS_URL"] = url })));
        Assert.DoesNotContain(url, exception.Message);
        Assert.DoesNotContain("public-fixture", exception.Message);
    }

    // 初始化失敗必須拒絕啟動，訊息不能包含資料路徑。
    [Fact]
    public async Task DatabaseInitializationFailureIsSafe()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-invalid-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            await using var factory = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = directory })));
            var exception = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
            Assert.Contains("初始化失敗", exception.Message);
            Assert.DoesNotContain(directory, exception.ToString());
        }
        finally { Directory.Delete(directory, true); }
    }

    // 主機實際解析 INSTANCE_COUNT，不能只驗證選項類別卻漏接啟動流程。
    [Fact]
    public async Task HostRejectsMultipleInstances()
    {
        await using var factory = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["INSTANCE_COUNT"] = "2" })));
        Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
    }

    // 提供不受機器環境影響的設定來源。
    private static IConfiguration Configure(Dictionary<string, string?> values) => new ConfigurationBuilder().AddInMemoryCollection(values).Build();
}
