using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class AuthIntegrationTests
{
    public const string Password = "public-auth-test-password";

    // 真實 HTTP 登入須發安全 cookie，輪替後旧 token 重用立即撤銷 access。
    [Fact]
    public async Task LoginRefreshAndReuseRevokeSession()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient(new() { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains("no-store", login.Headers.CacheControl!.ToString());
        var grant = await login.Content.ReadFromJsonAsync<JsonElement>();
        var cookie = login.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("httponly", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/api/v1/auth", cookie);
        Assert.False(grant.TryGetProperty("refresh_token", out _));
        var raw = cookie.Split(';')[0];
        using var refreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
        refreshRequest.Headers.Add("Cookie", raw);
        refreshRequest.Headers.Add("X-Rdweb-CSRF", grant.GetProperty("csrf_token").GetString());
        using var refreshed = await client.SendAsync(refreshRequest);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var next = await refreshed.Content.ReadFromJsonAsync<JsonElement>();
        using var reusedRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
        reusedRequest.Headers.Add("Cookie", raw);
        reusedRequest.Headers.Add("X-Rdweb-CSRF", grant.GetProperty("csrf_token").GetString());
        using var reused = await client.SendAsync(reusedRequest);
        Assert.Equal(HttpStatusCode.Unauthorized, reused.StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", next.GetProperty("access_token").GetString());
        using var me = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    // 驗證失敗及 JSON 綁定失敗也不能被快取或回傳輸入片段。
    [Fact]
    public async Task UnauthorizedAndMalformedRequestsHaveSafeResponses()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient();
        using var unauthorized = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
        Assert.Contains("no-store", unauthorized.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", unauthorized.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Contains("frame-ancestors 'none'", unauthorized.Headers.GetValues("Content-Security-Policy").Single());
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var malformed = await client.PostAsync("/api/v1/auth/login", new StringContent("{\"password\":\"public-input-marker", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        var body = await malformed.Content.ReadAsStringAsync();
        Assert.DoesNotContain("public-input-marker", body);
        Assert.DoesNotContain("Exception", body);
        Assert.Equal("invalid_request", (await malformed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    // 每種 subpath 的 cookie 都限縮 auth 路徑，登出清除同一 cookie 並撤銷 access。
    [Theory]
    [InlineData("")]
    [InlineData("/rdweb")]
    [InlineData("/a/b/c")]
    public async Task CookiePathsAndLogoutFollowRuntimeBase(string prefix)
    {
        await using var factory = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        { ["APP_BASE_PATH"] = prefix.Length == 0 ? "/" : prefix, ["APP_PUBLIC_URL"] = "https://tools.example.test" + prefix })));
        using var client = factory.CreateClient(new() { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "https://tools.example.test");
        await SeedAsync(factory);
        using var login = await client.PostAsJsonAsync(prefix + "/api/v1/auth/login", new { username = "admin", password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        var cookie = login.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("path=" + prefix + "/api/v1/auth", cookie);
        Assert.Contains("secure", cookie);
        client.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);
        using var denied = await client.PostAsJsonAsync(prefix + "/api/v1/auth/refresh", new { });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var csrf = await client.GetAsync(prefix + "/api/v1/auth/csrf");
        Assert.Equal(body.GetProperty("csrf_token").GetString(), (await csrf.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("csrf_token").GetString());
        client.DefaultRequestHeaders.Add("X-Rdweb-CSRF", body.GetProperty("csrf_token").GetString());
        using var logout = await client.PostAsJsonAsync(prefix + "/api/v1/auth/logout", new { });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Contains("path=" + prefix + "/api/v1/auth", logout.Headers.GetValues("Set-Cookie").Single());
        client.DefaultRequestHeaders.Authorization = new("Bearer", body.GetProperty("access_token").GetString());
        using var me = await client.GetAsync(prefix + "/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    // 同一 refresh 的競爭僅一次成功，猜錯 secret 不會撤銷 session。
    [Fact]
    public async Task RefreshRaceAndWrongSecretCannotBypassRevocationRules()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient(new() { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = Password });
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        var raw = cookie["rdweb_refresh=".Length..];
        var forged = raw[..33] + Microsoft.IdentityModel.Tokens.Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<AuthService>();
            await Assert.ThrowsAsync<AuthException>(() => service.RefreshAsync(forged, default));
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", body.GetProperty("access_token").GetString());
        using var valid = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
        var tasks = Enumerable.Range(0, 2).Select(async _ =>
        {
            // 分別建立 request，避免同一 message 被重複傳送。
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
            request.Headers.Add("Cookie", cookie); request.Headers.Add("X-Rdweb-CSRF", body.GetProperty("csrf_token").GetString());
            using var response = await client.SendAsync(request);
            return response.StatusCode;
        });
        var statuses = await Task.WhenAll(tasks);
        Assert.Single(statuses, status => status == HttpStatusCode.OK);
        Assert.Single(statuses, status => status == HttpStatusCode.Unauthorized);
    }

    // SQLite 鎖定跨主機重啟保留，KV 視窗清空也不能繞過。
    [Fact]
    public async Task FailedLoginLocksPersistAcrossRestart()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-auth-restart-" + Guid.NewGuid());
        var path = Path.Combine(directory, "app.db");
        var vaultKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        try
        {
            await using (var factory = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = path, ["VAULT_KEY"] = vaultKey }))))
            {
                using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("Origin", "http://localhost");
                await SeedAsync(factory);
                for (var attempt = 0; attempt < 5; attempt++)
                { using var failed = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = "incorrect-public-password" }); Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode); }
                await using var read = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
                var locked = await read.Users.SingleAsync(); Assert.Equal(5, locked.FailedLoginCount); Assert.True(locked.LockedUntil > DateTime.UtcNow);
            }
            await using var restart = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = path, ["VAULT_KEY"] = vaultKey })));
            using var restarted = restart.CreateClient(); restarted.DefaultRequestHeaders.Add("Origin", "http://localhost");
            using var denied = await restarted.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = Password });
            Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    // Origin、長度、未知帳號、inactive 及 KV 固定視窗皆從 API 拒絕。
    [Fact]
    public async Task InputOriginAndAccountFailuresAreSafe()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        await SeedAsync(factory);
        using var wrongOrigin = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = Password });
        Assert.Equal(HttpStatusCode.Forbidden, wrongOrigin.StatusCode);
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var invalid = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var unknown = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "unknown", password = Password });
        using var wrong = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = "incorrect-public-password" });
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await wrong.Content.ReadAsStringAsync());
        for (var index = 0; index < 3; index++) { using var failure = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "unknown", password = Password }); }
        using var limited = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "unknown", password = Password });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    // 測試帳號的密碼使用真實 Argon2id，資料只在隔離暫存 DB。
    internal static async Task<Guid> SeedAsync(TestApplicationFactory factory, string username = "admin", string role = "admin")
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var user = new User { Username = username, NormalizedUsername = username.ToUpperInvariant(), Role = role, PasswordHash = await new PasswordHasher().HashAsync(Password) };
        database.Users.Add(user);
        await database.SaveChangesAsync();
        return user.Id;
    }
}
