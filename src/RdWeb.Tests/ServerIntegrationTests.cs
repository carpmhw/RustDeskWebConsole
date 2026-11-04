using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure;

namespace RdWeb.Tests;

public sealed class ServerIntegrationTests
{
    // Admin可CRUD，版本過期不覆蓋，記actor/server而不記設定原文。
    [Fact]
    public async Task AdminCrudRejectsStaleVersionsAndAudits()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var actor = await AuthIntegrationTests.SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        var payload = new { name = "fixture", id_server = "server.example:21116", relay_server = "relay.example:21117", public_key = Convert.ToBase64String(new byte[32]), transport = "tcp", enabled = true, allow_private_network = false, version = 0 };
        using var created = await client.PostAsJsonAsync("/api/v1/servers", payload); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var body = await created.Content.ReadFromJsonAsync<JsonElement>(); var id = body.GetProperty("id").GetGuid();
        using var update = await client.PutAsJsonAsync($"/api/v1/servers/{id}", payload with { version = 1, name = "updated" });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        using var stale = await client.PutAsJsonAsync($"/api/v1/servers/{id}", payload with { version = 1 }); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var deleted = await client.DeleteAsync($"/api/v1/servers/{id}?version=2"); Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        await factory.Services.GetRequiredService<AuditWriter>().StopAsync(default);
        await using var read = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Equal(3, await read.AuditLogs.CountAsync(audit => audit.UserId == actor && audit.ObjectId == id && audit.Action == "ServerChanged"));
    }

    // 非admin不能讀內部設定；即使admin也不能保存metadata端點或損壞公鑰。
    [Fact]
    public async Task RolesAndUnsafeServerInputsAreRejected()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory, "viewer", "viewer");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "viewer", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var denied = await client.GetAsync("/api/v1/servers"); Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        await AuthIntegrationTests.SeedAsync(factory);
        using var adminLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await adminLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        var payload = new { name = "fixture", id_server = "169.254.169.254:80", relay_server = "relay.example:21117", public_key = Convert.ToBase64String(new byte[32]), transport = "tcp", enabled = true, allow_private_network = true, version = 0 };
        using var blocked = await client.PostAsJsonAsync("/api/v1/servers", payload); Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        using var badKey = await client.PostAsJsonAsync("/api/v1/servers", payload with { id_server = "server.example:21116", public_key = "not-a-key" }); Assert.Equal(HttpStatusCode.BadRequest, badKey.StatusCode);
        using var privateDenied = await client.PostAsJsonAsync("/api/v1/servers", payload with { id_server = "10.1.2.3:21116", allow_private_network = false }); Assert.Equal(HttpStatusCode.BadRequest, privateDenied.StatusCode);
    }

    // HTTP probe只使用已保存的endpoint，並保持Version／安全分類／限流。
    [Fact]
    public async Task SavedConnectionProbeIsReadOnlyAndBounded()
    {
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0); listener.Start();
        try
        {
            await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("Origin", "http://localhost");
            await AuthIntegrationTests.SeedAsync(factory);
            using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
            client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
            var endpoint = "127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port;
            using var created = await client.PostAsJsonAsync("/api/v1/servers", new { name = "fixture", id_server = endpoint, relay_server = endpoint, public_key = Convert.ToBase64String(new byte[32]), transport = "tcp", enabled = true, allow_private_network = true, version = 0 });
            var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
            for (var attempt = 0; attempt < 5; attempt++)
            {
                // Browser query不能覆寫DB目的地；listener確實只收到已保存的連線。
                using var response = await client.GetAsync($"/api/v1/servers/{id}/connection-test?host=169.254.169.254"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                var result = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal("reachable", result.GetProperty("id_server").GetProperty("status").GetString());
                Assert.False(result.GetProperty("protocol_verified").GetBoolean());
                using var first = await listener.AcceptTcpClientAsync(); using var second = await listener.AcceptTcpClientAsync();
            }
            using var limited = await client.GetAsync($"/api/v1/servers/{id}/connection-test"); Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
            using var read = await client.GetAsync($"/api/v1/servers/{id}"); Assert.Equal(1, (await read.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt32());
        }
        finally { listener.Stop(); }
    }
}
