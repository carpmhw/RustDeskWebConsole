using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OtpNet;
using RdWeb.Api.Data;

namespace RdWeb.Tests;

public sealed class PasswordChangeTests
{
    private const string Initial = "public-initial-password";
    private const string Changed = "public-changed-password";

    // 建立帶 Origin 的 client。
    private static HttpClient Client(TestApplicationFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        return client;
    }

    // 以帳密登入並回傳 grant JSON。
    private static async Task<JsonElement> LoginAsync(HttpClient client, string username, string password)
    {
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return await login.Content.ReadFromJsonAsync<JsonElement>();
    }

    // 為 client 設定 Bearer 權杖。
    private static void Bearer(HttpClient client, JsonElement grant) =>
        client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());

    // 管理員建立帶旗標的同事帳號，回傳其 id。
    private static async Task<Guid> CreateFlaggedAsync(TestApplicationFactory factory, string role = "operator", string username = "colleague")
    {
        await AuthIntegrationTests.SeedAsync(factory);
        using var admin = Client(factory);
        Bearer(admin, await LoginAsync(admin, "admin", AuthIntegrationTests.Password));
        using var created = await admin.PostAsJsonAsync("/api/v1/users", new { username, password = Initial, role });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        return (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    // 讀取錯誤碼。
    private static async Task<string?> CodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    // 讀取資料庫旗標。
    private static async Task<bool> FlagAsync(TestApplicationFactory factory, Guid id)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        return (await database.Users.AsNoTracking().SingleAsync(user => user.Id == id)).PasswordChangeRequired;
    }

    // 有旗標時只能改密碼與查詢自己，其他 API（含雙重驗證綁定）一律 403。
    [Fact]
    public async Task FlaggedSessionIsLimitedToPasswordChangeAndMe()
    {
        await using var factory = new TestApplicationFactory();
        await CreateFlaggedAsync(factory);
        using var client = Client(factory);
        Bearer(client, await LoginAsync(client, "colleague", Initial));
        using var targets = await client.GetAsync("/api/v1/targets");
        Assert.Equal(HttpStatusCode.Forbidden, targets.StatusCode);
        Assert.Equal("password_change_required", await CodeAsync(targets));
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = Initial });
        Assert.Equal(HttpStatusCode.Forbidden, enroll.StatusCode);
        Assert.Equal("password_change_required", await CodeAsync(enroll));
        using var me = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    // 改密碼後清除旗標、換發新工作階段，舊權杖與其他裝置的工作階段失效。
    [Fact]
    public async Task ChangePasswordClearsFlagAndRotatesSession()
    {
        await using var factory = new TestApplicationFactory();
        var id = await CreateFlaggedAsync(factory);
        using var other = Client(factory);
        var otherLogin = await other.PostAsJsonAsync("/api/v1/auth/login", new { username = "colleague", password = Initial });
        var otherCookie = otherLogin.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        var otherCsrf = (await otherLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("csrf_token").GetString();
        using var client = Client(factory);
        var grant = await LoginAsync(client, "colleague", Initial);
        Bearer(client, grant);
        using var changed = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = Initial, new_password = Changed });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var fresh = await changed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(fresh.GetProperty("user").GetProperty("password_change_required").GetBoolean());
        Assert.False(await FlagAsync(factory, id));
        using var stale = await client.GetAsync("/api/v1/targets");
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
        Bearer(client, fresh);
        using var allowed = await client.GetAsync("/api/v1/targets");
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        using var refresh = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
        refresh.Headers.Add("Cookie", otherCookie);
        refresh.Headers.Add("X-Rdweb-CSRF", otherCsrf);
        using var refreshed = await other.SendAsync(refresh);
        Assert.Equal(HttpStatusCode.Unauthorized, refreshed.StatusCode);
        using var oldLogin = await Client(factory).PostAsJsonAsync("/api/v1/auth/login", new { username = "colleague", password = Initial });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
    }

    // 目前密碼錯、新舊相同、新密碼過短都拒絕，且旗標不清除。
    [Fact]
    public async Task ChangePasswordRejectsWrongCurrentReuseAndShort()
    {
        await using var factory = new TestApplicationFactory();
        var id = await CreateFlaggedAsync(factory);
        using var client = Client(factory);
        Bearer(client, await LoginAsync(client, "colleague", Initial));
        using var wrong = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = "public-wrong-password", new_password = Changed });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("invalid_credentials", await CodeAsync(wrong));
        using var reuse = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = Initial, new_password = Initial });
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
        Assert.Equal("password_reuse", await CodeAsync(reuse));
        using var shortPassword = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = Initial, new_password = "short-11chr" });
        Assert.Equal(HttpStatusCode.BadRequest, shortPassword.StatusCode);
        Assert.True(await FlagAsync(factory, id));
    }

    // 只接受目前密碼：已啟用雙重驗證者帶有效驗證碼但目前密碼錯誤時仍拒絕，且請求不接受 code 欄位。
    [Fact]
    public async Task ChangePasswordDoesNotAcceptTotpInsteadOfPassword()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory, "viewer-user", "viewer");
        using var client = Client(factory);
        Bearer(client, await LoginAsync(client, "viewer-user", AuthIntegrationTests.Password));
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = AuthIntegrationTests.Password });
        var totp = new Totp(Base32Encoding.ToBytes((await enroll.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("secret").GetString()!));
        using var confirm = await client.PostAsJsonAsync("/api/v1/auth/totp/confirm", new { code = totp.ComputeTotp(DateTime.UtcNow) });
        Bearer(client, await confirm.Content.ReadFromJsonAsync<JsonElement>());
        using var withCode = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = "public-wrong-password", code = totp.ComputeTotp(DateTime.UtcNow.AddSeconds(30)), new_password = Changed });
        Assert.Equal(HttpStatusCode.BadRequest, withCode.StatusCode);
        using var wrong = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = "public-wrong-password", new_password = Changed });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
    }

    // 所有角色都能自行變更密碼。
    [Theory]
    [InlineData("viewer")]
    [InlineData("operator")]
    [InlineData("admin")]
    public async Task ChangePasswordWorksForEveryRole(string role)
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory, "member", role);
        using var client = Client(factory);
        Bearer(client, await LoginAsync(client, "member", AuthIntegrationTests.Password));
        using var changed = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = AuthIntegrationTests.Password, new_password = Changed });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        await LoginAsync(Client(factory), "member", Changed);
    }

    // 政策要求全員雙重驗證時，先改密碼，改完才接著要求綁定。
    [Fact]
    public async Task ForcedMfaAfterPasswordChange()
    {
        await using var factory = new TestApplicationFactory();
        await CreateFlaggedAsync(factory);
        using (var admin = Client(factory))
        {
            Bearer(admin, await LoginAsync(admin, "admin", AuthIntegrationTests.Password));
            using var policy = await admin.PutAsJsonAsync("/api/v1/settings/security", new { require_mfa = "all", password = AuthIntegrationTests.Password });
            Assert.Equal(HttpStatusCode.OK, policy.StatusCode);
        }
        using var client = Client(factory);
        Bearer(client, await LoginAsync(client, "colleague", Initial));
        using var blocked = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = Initial });
        Assert.Equal("password_change_required", await CodeAsync(blocked));
        using var changed = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = Initial, new_password = Changed });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var fresh = await changed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(fresh.GetProperty("user").GetProperty("mfa_enrollment_required").GetBoolean());
        Bearer(client, fresh);
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = Changed });
        Assert.Equal(HttpStatusCode.OK, enroll.StatusCode);
    }

    // 自行變更密碼有獨立限流範圍：同一來源 60 秒內第 6 次回 429，且不消耗其他敏感操作的再次驗證配額。
    // 以連續成功變更計數，避免錯誤嘗試觸發既有的帳號鎖定而混淆結果。
    [Fact]
    public async Task PasswordChangeHasItsOwnRateLimit()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory, "member", "viewer");
        using var client = Client(factory);
        Bearer(client, await LoginAsync(client, "member", AuthIntegrationTests.Password));
        var current = AuthIntegrationTests.Password;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var next = current == Changed ? Initial : Changed;
            using var changed = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = current, new_password = next });
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
            Bearer(client, await changed.Content.ReadFromJsonAsync<JsonElement>());
            current = next;
        }
        using var limited = await client.PostAsJsonAsync("/api/v1/auth/password", new { current_password = current, new_password = AuthIntegrationTests.Password });
        Assert.Equal((HttpStatusCode)429, limited.StatusCode);
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = current });
        Assert.Equal(HttpStatusCode.OK, enroll.StatusCode);
    }
}
