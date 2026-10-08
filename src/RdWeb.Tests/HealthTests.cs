using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using RdWeb.Api;

namespace RdWeb.Tests;

public sealed class HealthTests
{
    // 確認公開健康端點僅回傳安全狀態與帶 UTC 標記的時間。
    [Fact]
    public async Task HealthReturnsStatusAndUtcTimestamp()
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/v1/health");
        Assert.True(response.IsSuccessStatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("ok", body.GetProperty("status").GetString());
        Assert.EndsWith("Z", body.GetProperty("timestamp").GetString());
        Assert.Equal(2, body.EnumerateObject().Count());
    }
}
