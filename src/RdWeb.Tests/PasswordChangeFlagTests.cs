using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;

namespace RdWeb.Tests;

public sealed class PasswordChangeFlagTests
{
    private const string NewPassword = "public-new-user-password";

    // 建立已登入管理員的 client，回傳管理員 id。
    private static async Task<(HttpClient Client, Guid AdminId)> AdminClientAsync(TestApplicationFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var id = await AuthIntegrationTests.SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var grant = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());
        return (client, id);
    }

    // 讀取資料庫中的旗標，避免只相信 API 回應。
    private static async Task<bool> FlagAsync(TestApplicationFactory factory, Guid id)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        return (await database.Users.AsNoTracking().SingleAsync(user => user.Id == id)).PasswordChangeRequired;
    }

    // 管理員建立的帳號必須在首次登入改密碼。
    [Fact]
    public async Task CreatedUserMustChangePassword()
    {
        await using var factory = new TestApplicationFactory();
        var (client, _) = await AdminClientAsync(factory);
        using var created = await client.PostAsJsonAsync("/api/v1/users", new { username = "colleague", password = NewPassword, role = "operator" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var body = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("password_change_required").GetBoolean());
        Assert.True(await FlagAsync(factory, body.GetProperty("id").GetGuid()));
        using var list = await client.GetAsync("/api/v1/users");
        var users = await list.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains(users.EnumerateArray(), user => user.GetProperty("username").GetString() == "colleague" && user.GetProperty("password_change_required").GetBoolean());
    }

    // 重設他人密碼會要求對方改密碼；管理員重設自己則不會。
    [Fact]
    public async Task ResetOthersSetsFlagButResetSelfDoesNot()
    {
        await using var factory = new TestApplicationFactory();
        var (client, adminId) = await AdminClientAsync(factory);
        var other = await AuthIntegrationTests.SeedAsync(factory, "viewer-user", "viewer");
        Assert.False(await FlagAsync(factory, other));
        using var resetOther = await client.PostAsJsonAsync($"/api/v1/users/{other}/reset-password", new { new_password = NewPassword, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.NoContent, resetOther.StatusCode);
        Assert.True(await FlagAsync(factory, other));
        using var resetSelf = await client.PostAsJsonAsync($"/api/v1/users/{adminId}/reset-password", new { new_password = NewPassword, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.NoContent, resetSelf.StatusCode);
        Assert.False(await FlagAsync(factory, adminId));
    }

    // 登入回應與 /auth/me 都回報旗標，前端據此導向設定新密碼。
    [Fact]
    public async Task MeReportsFlag()
    {
        await using var factory = new TestApplicationFactory();
        var (admin, _) = await AdminClientAsync(factory);
        using var created = await admin.PostAsJsonAsync("/api/v1/users", new { username = "colleague", password = NewPassword, role = "viewer" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "colleague", password = NewPassword });
        var grant = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(grant.GetProperty("user").GetProperty("password_change_required").GetBoolean());
        client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());
        using var me = await client.GetAsync("/api/v1/auth/me");
        Assert.True((await me.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("password_change_required").GetBoolean());
    }
}
