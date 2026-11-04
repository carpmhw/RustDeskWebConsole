using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api;
using StackExchange.Redis;

namespace RdWeb.Tests;

public sealed class HealthTests
{
    // 確認公開健康端點僅回傳安全狀態與帶 UTC 標記的時間。
    [Fact]
    public async Task HealthReturnsStatusAndUtcTimestamp()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/v1/health");
        Assert.True(response.IsSuccessStatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("ok", body.GetProperty("status").GetString());
        Assert.EndsWith("Z", body.GetProperty("timestamp").GetString());
        Assert.Equal("ok", body.GetProperty("database").GetString());
        Assert.Equal("ok", body.GetProperty("kv").GetString());
        Assert.False(string.IsNullOrEmpty(body.GetProperty("version").GetString()));
        Assert.Equal(5, body.EnumerateObject().Count());
    }

    // 資料庫遺失時必須回 503，且不能洩漏本機檔名與 SQLite 例外。
    [Fact]
    public async Task MissingSchemaReturnsSafeUnavailableStatus()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient();
        File.Delete(factory.DatabasePath);
        using var response = await client.GetAsync("/api/v1/health");
        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(factory.DatabasePath, text);
        Assert.DoesNotContain("SQLite", text);
        Assert.Contains("unavailable", text);
    }

    // 真實 Redis 主機可就緒；KV 失去連線後回安全 503。
    [Fact]
    public async Task RedisHealthTracksDependencyAvailability()
    {
        var url = Environment.GetEnvironmentVariable("TEST_REDIS_URL");
        Assert.False(string.IsNullOrEmpty(url), "Redis health 需要 TEST_REDIS_URL。");
        await using var factory = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["REDIS_URL"] = url })));
        using var client = factory.CreateClient();
        using var healthy = await client.GetAsync("/api/v1/health");
        Assert.True(healthy.IsSuccessStatusCode);
        await factory.Services.GetRequiredService<IConnectionMultiplexer>().CloseAsync();
        using var unavailable = await client.GetAsync("/api/v1/health");
        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);
        var body = await unavailable.Content.ReadAsStringAsync();
        Assert.Contains("\"kv\":\"unavailable\"", body);
        Assert.DoesNotContain("Redis", body);
        Assert.DoesNotContain("6379", body);
    }
}
