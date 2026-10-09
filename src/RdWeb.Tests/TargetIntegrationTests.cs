using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class TargetIntegrationTests
{
    // 建立者可CRUD，DTO僅has_password，替換／清除／刪除與Version均真實生效。
    [Fact]
    public async Task OwnerCrudNeverReturnsPasswordAndProtectsVersion()
    {
        await using var factory = new TestApplicationFactory(); var server = await SeedServerAsync(factory);
        using var client = await LoginAsync(factory, "owner", "operator");
        var payload = new { server_id = server, name = "fixture", rustdesk_id = "123456789", group_name = "work", tags = new[] { "one" }, notes = "public-note", password = "public-target-password-marker", version = 0 };
        using var created = await client.PostAsJsonAsync("/api/v1/targets", payload); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var text = await created.Content.ReadAsStringAsync(); Assert.DoesNotContain("public-target-password-marker", text);
        var body = await created.Content.ReadFromJsonAsync<JsonElement>(); var id = body.GetProperty("id").GetGuid();
        Assert.True(body.GetProperty("has_password").GetBoolean()); Assert.False(body.TryGetProperty("password_secret_id", out _));
        using var update = await client.PutAsJsonAsync($"/api/v1/targets/{id}", payload with { name = "updated", version = 1, password = "" }); Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.False((await update.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("has_password").GetBoolean());
        using var stale = await client.PutAsJsonAsync($"/api/v1/targets/{id}", payload with { version = 1 }); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var deleted = await client.DeleteAsync($"/api/v1/targets/{id}?version=2"); Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Equal(0, await database.Targets.CountAsync()); Assert.Equal(0, await database.EncryptedSecrets.CountAsync());
    }
    // User／role grant聯集、撤銷即時與viewer ceiling都由後端執行。
    [Fact]
    public async Task ExplicitAclControlsVisibilityWithoutDelegatingAdministration()
    {
        await using var factory = new TestApplicationFactory(); var server = await SeedServerAsync(factory);
        using var owner = await LoginAsync(factory, "owner", "operator"); using var peer = await LoginAsync(factory, "peer", "operator");
        using var viewer = await LoginAsync(factory, "reader", "viewer"); using var admin = await LoginAsync(factory, "admin", "admin");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { server_id = server, name = "fixture", rustdesk_id = "123456789" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var hidden = await peer.GetAsync($"/api/v1/targets/{id}"); Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var peerId = (await database.Users.SingleAsync(user => user.Username == "peer")).Id; var viewerId = (await database.Users.SingleAsync(user => user.Username == "reader")).Id;
        using var granted = await admin.PutAsJsonAsync($"/api/v1/targets/{id}/permissions", new
        {
            version = 1,
            grants = new[] {
            new { user_id = peerId, can_connect = true, can_view_password = true, can_edit = false },
            new { user_id = viewerId, can_connect = false, can_view_password = false, can_edit = false } }
        }); Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        using var visible = await viewer.GetAsync($"/api/v1/targets/{id}"); Assert.Equal(HttpStatusCode.OK, visible.StatusCode);
        var permissions = (await visible.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("permissions"); Assert.False(permissions.GetProperty("can_view_password").GetBoolean());
        using var denied = await peer.PutAsJsonAsync($"/api/v1/targets/{id}", new { server_id = server, name = "unauthorized", rustdesk_id = "123456789", version = 2 }); Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var cannotGrant = await owner.PutAsJsonAsync($"/api/v1/targets/{id}/permissions", new { version = 2, grants = Array.Empty<object>() }); Assert.Equal(HttpStatusCode.Forbidden, cannotGrant.StatusCode);
        using var byRole = await admin.PutAsJsonAsync($"/api/v1/targets/{id}/permissions", new { version = 2, grants = new[] { new { role = "operator", can_connect = true, can_edit = true, can_view_password = false } } }); Assert.Equal(HttpStatusCode.OK, byRole.StatusCode);
        using var roleVisible = await peer.GetAsync($"/api/v1/targets/{id}"); Assert.True((await roleVisible.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("permissions").GetProperty("can_edit").GetBoolean());
        using var revoked = await admin.PutAsJsonAsync($"/api/v1/targets/{id}/permissions", new { version = 3, grants = Array.Empty<object>() }); Assert.Equal(HttpStatusCode.OK, revoked.StatusCode);
        using var nowHidden = await peer.GetAsync($"/api/v1/targets/{id}"); Assert.Equal(HttpStatusCode.NotFound, nowHidden.StatusCode);
        using var available = await peer.GetAsync("/api/v1/servers/available"); var summary = await available.Content.ReadAsStringAsync(); Assert.DoesNotContain("server.example", summary); Assert.DoesNotContain("public_key", summary);
        using var internalDenied = await peer.GetAsync("/api/v1/servers"); Assert.Equal(HttpStatusCode.Forbidden, internalDenied.StatusCode);
    }
    // Target FK阻止刪除使用中的server，列表count也僅計可見資料。
    [Fact]
    public async Task ServerInUseAndVisiblePagingAreEnforced()
    {
        await using var factory = new TestApplicationFactory(); var server = await SeedServerAsync(factory);
        using var owner = await LoginAsync(factory, "owner", "operator"); using var admin = await LoginAsync(factory, "admin", "admin");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { server_id = server, name = "fixture", rustdesk_id = "123456789", group_name = "work" }); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var inUse = await admin.DeleteAsync($"/api/v1/servers/{server}?version=1"); Assert.Equal(HttpStatusCode.Conflict, inUse.StatusCode);
        using var page = await owner.GetAsync("/api/v1/targets?q=fixture&group=work&page_size=1"); var result = await page.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal(1, result.GetProperty("count").GetInt32()); Assert.Equal(1, result.GetProperty("items").GetArrayLength());
        using var invalid = await owner.GetAsync("/api/v1/targets?page_size=101"); Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }
    // 只替換密碼也必須增加TargetVersion，避免舊DTO覆蓋較新的密碼。
    [Fact]
    public async Task PasswordOnlyUpdateAdvancesTargetVersion()
    {
        await using var factory = new TestApplicationFactory(); var server = await SeedServerAsync(factory); using var owner = await LoginAsync(factory, "owner", "operator");
        var payload = new { name = "fixture", server_id = server, rustdesk_id = "123456789", password = "first-public-marker", version = 0 };
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", payload); var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var changed = await owner.PutAsJsonAsync($"/api/v1/targets/{id}", payload with { password = "second-public-marker", version = 1 }); Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(2, (await changed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt32());
        using var stale = await owner.PutAsJsonAsync($"/api/v1/targets/{id}", payload with { version = 1 }); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }
    // 測試只建立已知公開server設定，不透過任何繞過production endpoint。
    internal static async Task<Guid> SeedServerAsync(TestApplicationFactory factory)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var server = new RustDeskServer { Name = "fixture", IdServer = "server.example:21116", RelayServer = "relay.example:21117", PublicKey = Convert.ToBase64String(new byte[32]) };
        database.RustDeskServers.Add(server); await database.SaveChangesAsync(); return server.Id;
    }
    // 真正Argon2id帳密登入，token只RAM，不寫入snapshot。
    internal static async Task<HttpClient> LoginAsync(TestApplicationFactory factory, string username, string role)
    {
        await AuthIntegrationTests.SeedAsync(factory, username, role);
        var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString()); return client;
    }
}
