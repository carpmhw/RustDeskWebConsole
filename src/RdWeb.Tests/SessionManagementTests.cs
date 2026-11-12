using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.RustDesk;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class SessionManagementTests
{
    // 以固定順序的子字串規則辨識瀏覽器與作業系統；Edge／Opera 須先於 Chrome，Chrome 須先於 Safari。
    [Theory]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0", "Edge", "Windows")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 OPR/115.0", "Opera", "Windows")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", "Firefox", "Linux")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", "Chrome", "macOS")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", "Safari", "macOS")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1", "Chrome", "iOS")]
    [InlineData("Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "Safari", "iOS")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36", "Chrome", "Android")]
    [InlineData("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", "Chrome", "ChromeOS")]
    [InlineData("curl/8.5.0", null, null)]
    [InlineData("", null, null)]
    [InlineData(null, null, null)]
    public void DescribesBrowserAndOperatingSystem(string? userAgent, string? browser, string? os)
        => Assert.Equal((browser, os), SessionService.Describe(userAgent));

    internal const string WindowsChrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
    internal const string LinuxFirefox = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";

    // 以指定 User-Agent 登入並回傳帶 Bearer 的 client 與其 session（family）ID。
    internal static async Task<(HttpClient Client, Guid Session)> LoginAsync(TestApplicationFactory factory, string username, string userAgent)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        var sid = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(token).Claims.Single(claim => claim.Type == "sid").Value;
        return (client, Guid.Parse(sid));
    }

    // 讀取 session 列表的 items。
    internal static async Task<List<JsonElement>> SessionsAsync(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return [.. (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").EnumerateArray()];
    }

    // 管理員看到使用者的兩個有效 session 與辨識後的裝置；已登出與過期的不列出；回應不含 token 或雜湊。
    [Fact]
    public async Task AdminListsLiveSessionsWithDeviceNames()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var (windows, windowsSession) = await LoginAsync(factory, "alice", WindowsChrome);
        var (linux, linuxSession) = await LoginAsync(factory, "alice", LinuxFirefox);
        var (gone, goneSession) = await LoginAsync(factory, "alice", WindowsChrome);
        using (windows) using (linux) using (gone)
        {
            await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
            {
                await database.RefreshTokens.Where(token => token.FamilyId == goneSession).ExecuteUpdateAsync(set => set.SetProperty(token => token.RevokedAt, DateTime.UtcNow));
                database.RefreshTokens.Add(new() { UserId = alice, TokenHash = "expired-fixture", FamilyId = Guid.NewGuid(), AuthenticatedAt = DateTime.UtcNow.AddDays(-8), ExpiresAt = DateTime.UtcNow.AddDays(-1), UserAgent = LinuxFirefox });
                await database.SaveChangesAsync();
            }
            var (admin, _) = await LoginAsync(factory, "admin", WindowsChrome);
            using (admin)
            {
                using var raw = await admin.GetAsync($"/api/v1/users/{alice}/sessions");
                Assert.Equal(HttpStatusCode.OK, raw.StatusCode);
                var body = await raw.Content.ReadAsStringAsync();
                Assert.DoesNotContain("token", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("hash", body, StringComparison.OrdinalIgnoreCase);
                var items = await SessionsAsync(admin, $"/api/v1/users/{alice}/sessions");
                Assert.Equal(new[] { windowsSession, linuxSession }.Order(), items.Select(item => item.GetProperty("id").GetGuid()).Order());
                var row = items.Single(item => item.GetProperty("id").GetGuid() == linuxSession);
                Assert.Equal("Firefox", row.GetProperty("browser").GetString());
                Assert.Equal("Linux", row.GetProperty("os").GetString());
                Assert.False(string.IsNullOrEmpty(row.GetProperty("ip").GetString()));
                Assert.InRange(row.GetProperty("signed_in_at").GetDateTime(), DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
                Assert.InRange(row.GetProperty("last_used_at").GetDateTime(), DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
                Assert.False(row.GetProperty("current").GetBoolean());
            }
        }
    }

    // 本人列表標示目前 session；非管理員查看他人為 403 且不含資料。
    [Fact]
    public async Task UsersListOwnSessionsOnly()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var (adminClient, adminSession) = await LoginAsync(factory, "admin", LinuxFirefox);
        var (first, current) = await LoginAsync(factory, "alice", WindowsChrome);
        var (second, other) = await LoginAsync(factory, "alice", LinuxFirefox);
        using (adminClient) using (first) using (second)
        {
            var items = await SessionsAsync(first, "/api/v1/auth/sessions");
            Assert.Equal(2, items.Count);
            Assert.True(items.Single(item => item.GetProperty("id").GetGuid() == current).GetProperty("current").GetBoolean());
            Assert.False(items.Single(item => item.GetProperty("id").GetGuid() == other).GetProperty("current").GetBoolean());
            using var denied = await first.GetAsync($"/api/v1/users/{admin}/sessions");
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
            Assert.DoesNotContain(adminSession.ToString(), await denied.Content.ReadAsStringAsync());
        }
    }

    // 最近使用時間取最近 refresh、連線結束時間與作用中連線中最晚者；作用中連線時為現在。
    [Fact]
    public async Task LastUsedIncludesRemoteConnections()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var (client, session) = await LoginAsync(factory, "alice", WindowsChrome);
        var (otherClient, otherSession) = await LoginAsync(factory, "alice", LinuxFirefox);
        using (client) using (otherClient)
        {
            await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
                await database.RefreshTokens.Where(token => token.UserId == alice).ExecuteUpdateAsync(set => set.SetProperty(token => token.CreatedAt, DateTime.UtcNow.AddHours(-3)));
            var ended = DateTime.UtcNow.AddHours(-1);
            await factory.Services.GetRequiredService<IKvStore>().SetWithTtlAsync(SessionService.SeenKey(otherSession), ended.ToString("O"), TimeSpan.FromHours(1));
            using var lease = factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(
                new ConnectionGrant(alice, Guid.NewGuid(), new(session, 1, "operator", false)), new("123456789", Convert.ToBase64String(new byte[32])));
            var items = await SessionsAsync(client, "/api/v1/auth/sessions");
            Assert.InRange(items.Single(item => item.GetProperty("id").GetGuid() == session).GetProperty("last_used_at").GetDateTime(), DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
            Assert.InRange(items.Single(item => item.GetProperty("id").GetGuid() == otherSession).GetProperty("last_used_at").GetDateTime(), ended.AddSeconds(-1), ended.AddSeconds(1));
        }
    }

    // 目前帳號是否仍可用該 client 呼叫 API。
    private static async Task<HttpStatusCode> MeAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/v1/auth/me");
        return response.StatusCode;
    }

    // 送出登出請求並回傳狀態碼與登出數量（失敗時為 null）。
    private static async Task<(HttpStatusCode Status, int? Revoked)> RevokeAsync(HttpClient client, string path, object body)
    {
        using var response = await client.PostAsJsonAsync(path, body);
        return (response.StatusCode, response.IsSuccessStatusCode ? (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("revoked").GetInt32() : null);
    }

    // 讀取全部 SessionRevoked 稽核。
    private static async Task<List<RdWeb.Api.Data.Entities.AuditLog>> RevokedAuditsAsync(TestApplicationFactory factory)
    {
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        return await database.AuditLogs.AsNoTracking().Where(log => log.Action == "SessionRevoked").ToListAsync();
    }

    // 管理員登出單一 session 只影響該 session；全部登出連同遠端連線中斷，帳號仍啟用、密碼不變；稽核記錄執行者與數量。
    [Fact]
    public async Task AdminRevokesSingleAndAllSessions()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        string hash;
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
            hash = (await database.Users.SingleAsync(user => user.Id == alice)).PasswordHash;
        var (adminClient, _) = await LoginAsync(factory, "admin", WindowsChrome);
        var (first, firstSession) = await LoginAsync(factory, "alice", WindowsChrome);
        var (second, secondSession) = await LoginAsync(factory, "alice", LinuxFirefox);
        var (third, _) = await LoginAsync(factory, "alice", LinuxFirefox);
        using (adminClient) using (first) using (second) using (third)
        {
            Assert.Equal((HttpStatusCode.OK, 1), await RevokeAsync(adminClient, $"/api/v1/users/{alice}/sessions/revoke", new { session_id = firstSession }));
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(first));
            Assert.Equal(HttpStatusCode.OK, await MeAsync(second));
            // 已登出或不屬於該使用者的 session 為 404。
            Assert.Equal(HttpStatusCode.NotFound, (await RevokeAsync(adminClient, $"/api/v1/users/{alice}/sessions/revoke", new { session_id = firstSession })).Status);
            Assert.Equal(HttpStatusCode.NotFound, (await RevokeAsync(adminClient, $"/api/v1/users/{admin}/sessions/revoke", new { session_id = secondSession })).Status);
            var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
            using var lease = registry.Register(new ConnectionGrant(alice, Guid.NewGuid(), new(secondSession, 1, "operator", false)), new("123456789", Convert.ToBase64String(new byte[32])));
            Assert.Equal((HttpStatusCode.OK, 2), await RevokeAsync(adminClient, $"/api/v1/users/{alice}/sessions/revoke", new { }));
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(second));
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(third));
            Assert.True(lease.Revoked);
            Assert.Equal(ConnectionEndReason.Revoked, lease.EndReason);
            await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
            {
                var user = await database.Users.SingleAsync(user => user.Id == alice);
                Assert.True(user.IsActive);
                Assert.Equal(hash, user.PasswordHash);
                Assert.False(await database.RefreshTokens.AnyAsync(token => token.UserId == alice && token.RevokedAt == null));
            }
        }
        var audits = await RevokedAuditsAsync(factory);
        Assert.Equal(2, audits.Count);
        Assert.All(audits, audit =>
        {
            Assert.Equal(admin, audit.UserId);
            Assert.Equal("user", audit.ObjectType);
            Assert.Equal(alice, audit.ObjectId);
            Assert.Contains("\"reasonCode\":\"Terminated\"", audit.Detail);
        });
        Assert.Single(audits, audit => audit.Detail.Contains("\"count\":2"));
    }

    // 管理員對自己全部登出保留目前 session；任何人都不能經此功能登出目前 session；非管理員不能登出他人。
    [Fact]
    public async Task CurrentSessionIsNeverRevokedAndNonAdminsAreDenied()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var (current, currentSession) = await LoginAsync(factory, "admin", WindowsChrome);
        var (other, _) = await LoginAsync(factory, "admin", LinuxFirefox);
        var (operatorClient, _) = await LoginAsync(factory, "alice", WindowsChrome);
        using (current) using (other) using (operatorClient)
        {
            using (var refused = await current.PostAsJsonAsync($"/api/v1/users/{admin}/sessions/revoke", new { session_id = currentSession }))
            {
                Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
                Assert.Contains("current_session", await refused.Content.ReadAsStringAsync());
            }
            Assert.Equal((HttpStatusCode.OK, 1), await RevokeAsync(current, $"/api/v1/users/{admin}/sessions/revoke", new { }));
            Assert.Equal(HttpStatusCode.OK, await MeAsync(current));
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(other));
            Assert.Equal(HttpStatusCode.Forbidden, (await RevokeAsync(operatorClient, $"/api/v1/users/{admin}/sessions/revoke", new { })).Status);
            Assert.Equal(HttpStatusCode.OK, await MeAsync(current));
        }
    }

    // 本人登出其他所有裝置：其他 session（含遠端連線）失效、目前照常；沒有其他 session 時回 0；稽核使用者與對象皆為本人。
    [Fact]
    public async Task UsersRevokeTheirOtherSessions()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var (current, _) = await LoginAsync(factory, "alice", WindowsChrome);
        var (second, secondSession) = await LoginAsync(factory, "alice", LinuxFirefox);
        var (third, _) = await LoginAsync(factory, "alice", LinuxFirefox);
        using (current) using (second) using (third)
        {
            using var lease = factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(
                new ConnectionGrant(alice, Guid.NewGuid(), new(secondSession, 1, "operator", false)), new("123456789", Convert.ToBase64String(new byte[32])));
            Assert.Equal((HttpStatusCode.OK, 2), await RevokeAsync(current, "/api/v1/auth/sessions/revoke-others", new { }));
            Assert.Equal(HttpStatusCode.OK, await MeAsync(current));
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(second));
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(third));
            Assert.True(lease.Revoked);
            Assert.Equal((HttpStatusCode.OK, 0), await RevokeAsync(current, "/api/v1/auth/sessions/revoke-others", new { }));
        }
        var audits = await RevokedAuditsAsync(factory);
        Assert.Equal(2, audits.Count);
        Assert.All(audits, audit =>
        {
            Assert.Equal(alice, audit.UserId);
            Assert.Equal(alice, audit.ObjectId);
            Assert.Contains("\"reasonCode\":\"Completed\"", audit.Detail);
        });
    }

    // 讀取閒置登出設定的分鐘數。
    private static async Task<int> IdleSettingAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/v1/settings/sessions");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("idle_minutes").GetInt32();
    }

    // 預設 60；0 或 30–1440 才可儲存；需再驗證；成功寫入 SettingsChanged；非管理員 403。
    [Fact]
    public async Task IdleSettingIsValidatedAndRequiresReauthentication()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        using var client = await AuditIntegrationTests.LoginAsync(factory, "admin");
        Assert.Equal(60, await IdleSettingAsync(client));
        foreach (var invalid in new[] { -1, 1, 29, 1441 })
        {
            using var rejected = await client.PutAsJsonAsync("/api/v1/settings/sessions", new { idle_minutes = invalid, password = AuthIntegrationTests.Password });
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }
        using (var noProof = await client.PutAsJsonAsync("/api/v1/settings/sessions", new { idle_minutes = 0 }))
            Assert.Equal(HttpStatusCode.Unauthorized, noProof.StatusCode);
        Assert.Equal(60, await IdleSettingAsync(client));
        foreach (var valid in new[] { 30, 1440, 0 })
        {
            using var saved = await client.PutAsJsonAsync("/api/v1/settings/sessions", new { idle_minutes = valid, password = AuthIntegrationTests.Password });
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
            Assert.Equal(valid, await IdleSettingAsync(client));
        }
        using var operatorClient = await AuditIntegrationTests.LoginAsync(factory, "alice");
        using (var read = await operatorClient.GetAsync("/api/v1/settings/sessions")) Assert.Equal(HttpStatusCode.Forbidden, read.StatusCode);
        using (var write = await operatorClient.PutAsJsonAsync("/api/v1/settings/sessions", new { idle_minutes = 0, password = AuthIntegrationTests.Password }))
            Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Equal(3, await database.AuditLogs.CountAsync(audit => audit.Action == "SettingsChanged" && audit.UserId == admin));
    }

    // 測試控制的 UTC 時鐘，用於推進閒置時間。
    private sealed class MutableClock(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;
        // 回傳目前測試時間。
        public override DateTimeOffset GetUtcNow() => _now;
        // 推進測試時間。
        public void Advance(TimeSpan duration) => _now += duration;
    }

    // 以 cookie 與 CSRF 呼叫 refresh 的瀏覽器狀態；每次成功後換成新的 cookie 與 CSRF。
    private sealed class CookieSession(HttpClient client, string cookie, string csrf, Guid family)
    {
        public Guid Family => family;
        // 呼叫 refresh 並回傳狀態碼與錯誤碼。
        public async Task<(HttpStatusCode Status, string? Code)> RefreshAsync()
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
            request.Headers.Add("Cookie", cookie); request.Headers.Add("X-Rdweb-CSRF", csrf);
            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            if (response.StatusCode != HttpStatusCode.OK) return (response.StatusCode, body.TryGetProperty("code", out var code) ? code.GetString() : null);
            cookie = response.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
            csrf = body.GetProperty("csrf_token").GetString()!;
            return (response.StatusCode, null);
        }
    }

    // 建立使用可控時鐘的 factory。
    private static TestApplicationFactory ClockFactory(MutableClock clock) => new(builder => builder.ConfigureTestServices(services =>
    {
        services.RemoveAll<TimeProvider>();
        services.AddSingleton<TimeProvider>(clock);
    }));

    // 以不自動處理 cookie 的 client 登入，保留 refresh cookie 與 CSRF。
    private static async Task<CookieSession> CookieLoginAsync(TestApplicationFactory factory, string username)
    {
        var client = factory.CreateClient(new() { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var grant = await login.Content.ReadFromJsonAsync<JsonElement>();
        var sid = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(grant.GetProperty("access_token").GetString()).Claims.Single(claim => claim.Type == "sid").Value;
        return new(client, login.Headers.GetValues("Set-Cookie").Single().Split(';')[0], grant.GetProperty("csrf_token").GetString()!, Guid.Parse(sid));
    }

    // 閒置超過設定（預設 60 分）時 refresh 以 session_idle 拒絕、撤銷 session，並稽核原因 Idle。
    [Fact]
    public async Task IdleSessionIsRevokedOnRefresh()
    {
        var clock = new MutableClock(DateTimeOffset.UtcNow);
        await using var factory = ClockFactory(clock);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var session = await CookieLoginAsync(factory, "alice");
        clock.Advance(TimeSpan.FromMinutes(61));
        Assert.Equal((HttpStatusCode.Unauthorized, "session_idle"), await session.RefreshAsync());
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
            Assert.False(await database.RefreshTokens.AnyAsync(token => token.FamilyId == session.Family && token.RevokedAt == null));
        var audit = Assert.Single(await RevokedAuditsAsync(factory));
        Assert.Equal(alice, audit.UserId);
        Assert.Equal(alice, audit.ObjectId);
        Assert.Contains("\"reasonCode\":\"Idle\"", audit.Detail);
    }

    // 持續使用（每 20 分鐘 refresh）兩小時不會被登出。
    [Fact]
    public async Task ActiveSessionIsNotLoggedOut()
    {
        var clock = new MutableClock(DateTimeOffset.UtcNow);
        await using var factory = ClockFactory(clock);
        await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var session = await CookieLoginAsync(factory, "alice");
        for (var round = 0; round < 6; round++)
        {
            clock.Advance(TimeSpan.FromMinutes(20));
            Assert.Equal((HttpStatusCode.OK, (string?)null), await session.RefreshAsync());
        }
    }

    // 遠端連線進行中算使用中；連線結束時間也算最近使用。
    [Fact]
    public async Task RemoteConnectionsCountAsUse()
    {
        var clock = new MutableClock(DateTimeOffset.UtcNow);
        await using var factory = ClockFactory(clock);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var session = await CookieLoginAsync(factory, "alice");
        using (factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(
            new ConnectionGrant(alice, Guid.NewGuid(), new(session.Family, 1, "operator", false)), new("123456789", Convert.ToBase64String(new byte[32]))))
        {
            clock.Advance(TimeSpan.FromHours(2));
            Assert.Equal((HttpStatusCode.OK, (string?)null), await session.RefreshAsync());
        }
        clock.Advance(TimeSpan.FromMinutes(50));
        await SessionService.MarkSeenAsync(factory.Services.GetRequiredService<IKvStore>(), session.Family, clock.GetUtcNow().UtcDateTime, default);
        clock.Advance(TimeSpan.FromMinutes(50));
        Assert.Equal((HttpStatusCode.OK, (string?)null), await session.RefreshAsync());
    }

    // 閒置設定為 0 時不檢查，7 天期限內 refresh 都成功。
    [Fact]
    public async Task IdleLogoutCanBeTurnedOff()
    {
        var clock = new MutableClock(DateTimeOffset.UtcNow);
        await using var factory = ClockFactory(clock);
        await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            database.SystemSettings.Add(new() { Key = SessionService.IdleMinutesKey, Value = "0" });
            await database.SaveChangesAsync();
        }
        var session = await CookieLoginAsync(factory, "alice");
        clock.Advance(TimeSpan.FromDays(3));
        Assert.Equal((HttpStatusCode.OK, (string?)null), await session.RefreshAsync());
    }
}
