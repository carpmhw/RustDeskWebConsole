using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OtpNet;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class ConnectionRevocationIntegrationTests
{
    // 移除ACL後只終止失去can_connect者；仍有授權者、建立者與其他target的連線不受影響。
    [Fact]
    public async Task PermissionChangeTerminatesOnlyUsersWhoLostConnectRight()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        using var admin = await TargetIntegrationTests.LoginAsync(factory, "admin", "admin");
        var lost = await AuthIntegrationTests.SeedAsync(factory, "lost", "operator");
        var kept = await AuthIntegrationTests.SeedAsync(factory, "kept", "operator");
        var target = await CreateTargetAsync(owner, server, "123456789");
        using (var granted = await admin.PutAsJsonAsync($"/api/v1/targets/{target}/permissions", new
        {
            version = 1,
            grants = new[] {
                new { user_id = lost, can_connect = true, can_view_password = false, can_edit = false },
                new { user_id = kept, can_connect = true, can_view_password = false, can_edit = false } }
        })) Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        var ownerId = await UserIdAsync(factory, "owner");
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var lostLease = Register(registry, lost, target);
        using var keptLease = Register(registry, kept, target);
        using var ownerLease = Register(registry, ownerId, target);
        using var otherTarget = Register(registry, lost, Guid.NewGuid());

        using var changed = await admin.PutAsJsonAsync($"/api/v1/targets/{target}/permissions", new
        { version = 2, grants = new[] { new { user_id = kept, can_connect = true, can_view_password = false, can_edit = false } } });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        Assert.True(lostLease.Revoked && lostLease.RevocationToken.IsCancellationRequested);
        Assert.False(keptLease.Revoked); Assert.False(ownerLease.Revoked); Assert.False(otherTarget.Revoked);
    }

    // 停用、改角色、重設密碼與重設TOTP都終止該使用者全部連線，不影響其他使用者。
    [Theory]
    [InlineData("deactivate")]
    [InlineData("role")]
    [InlineData("password")]
    [InlineData("totp")]
    public async Task AccountSecurityChangesTerminateUserConnections(string scenario)
    {
        await using var factory = new TestApplicationFactory();
        using var admin = await TargetIntegrationTests.LoginAsync(factory, "admin", "admin");
        var adminId = await UserIdAsync(factory, "admin");
        var userId = await AuthIntegrationTests.SeedAsync(factory, "operator", "operator");
        if (scenario == "totp") await MfaIntegrationTests.EnableFixtureAsync(factory, userId);
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var first = Register(registry, userId, Guid.NewGuid());
        using var second = Register(registry, userId, Guid.NewGuid());
        using var unrelated = Register(registry, adminId, Guid.NewGuid());

        using var response = scenario switch
        {
            "deactivate" => await admin.PatchAsJsonAsync($"/api/v1/users/{userId}", new { is_active = false }),
            "role" => await admin.PatchAsJsonAsync($"/api/v1/users/{userId}", new { role = "viewer" }),
            "password" => await admin.PostAsJsonAsync($"/api/v1/users/{userId}/reset-password", new { new_password = "another-public-reset-password", password = AuthIntegrationTests.Password }),
            _ => await admin.PostAsJsonAsync($"/api/v1/users/{userId}/reset-totp", new { password = AuthIntegrationTests.Password })
        };
        Assert.True(response.IsSuccessStatusCode);

        Assert.True(first.Revoked && second.Revoked);
        Assert.False(unrelated.Revoked);
    }

    // 只修改Email不改變授權，不得終止連線。
    [Fact]
    public async Task EmailOnlyUpdateKeepsConnections()
    {
        await using var factory = new TestApplicationFactory();
        using var admin = await TargetIntegrationTests.LoginAsync(factory, "admin", "admin");
        var userId = await AuthIntegrationTests.SeedAsync(factory, "operator", "operator");
        using var lease = Register(factory.Services.GetRequiredService<ActiveConnectionRegistry>(), userId, Guid.NewGuid());
        using var response = await admin.PatchAsJsonAsync($"/api/v1/users/{userId}", new { email = "operator@example.test" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(lease.Revoked);
    }

    // 本人完成TOTP綁定會撤銷舊session，舊session上的連線一併終止。
    [Fact]
    public async Task TotpConfirmationTerminatesOwnConnections()
    {
        await using var factory = new TestApplicationFactory();
        using var client = await TargetIntegrationTests.LoginAsync(factory, "operator", "operator");
        var userId = await UserIdAsync(factory, "operator");
        var otherId = await AuthIntegrationTests.SeedAsync(factory, "other", "operator");
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var own = Register(registry, userId, Guid.NewGuid());
        using var unrelated = Register(registry, otherId, Guid.NewGuid());
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = AuthIntegrationTests.Password });
        var secret = (await enroll.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("secret").GetString()!;
        using var confirm = await client.PostAsJsonAsync("/api/v1/auth/totp/confirm", new { code = new Totp(Base32Encoding.ToBytes(secret)).ComputeTotp(DateTime.UtcNow) });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        Assert.True(own.Revoked); Assert.False(unrelated.Revoked);
    }

    // 登出只終止同一refresh family的連線，同使用者其他family不受影響。
    [Fact]
    public async Task LogoutTerminatesOnlySameFamilyConnections()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient(new() { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var userId = await AuthIntegrationTests.SeedAsync(factory, "operator", "operator");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "operator", password = AuthIntegrationTests.Password });
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        Guid family;
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
            family = (await database.RefreshTokens.SingleAsync(token => token.UserId == userId)).FamilyId;
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var sameFamily = Register(registry, userId, Guid.NewGuid(), family);
        using var otherFamily = Register(registry, userId, Guid.NewGuid());

        client.DefaultRequestHeaders.Add("Cookie", login.Headers.GetValues("Set-Cookie").Single().Split(';')[0]);
        client.DefaultRequestHeaders.Add("X-Rdweb-CSRF", body.GetProperty("csrf_token").GetString());
        using var logout = await client.PostAsJsonAsync("/api/v1/auth/logout", new { });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        Assert.True(sameFamily.Revoked); Assert.False(otherFamily.Revoked);
    }

    // refresh token遭重用觸發family撤銷時，終止同family連線；同使用者其他family不受影響。
    [Fact]
    public async Task RefreshReuseTerminatesSameFamilyConnections()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient(new() { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var userId = await AuthIntegrationTests.SeedAsync(factory, "operator", "operator");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "operator", password = AuthIntegrationTests.Password });
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        Guid family;
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
            family = (await database.RefreshTokens.SingleAsync(token => token.UserId == userId)).FamilyId;
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var sameFamily = Register(registry, userId, Guid.NewGuid(), family);
        using var otherFamily = Register(registry, userId, Guid.NewGuid());
        var raw = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        var csrf = body.GetProperty("csrf_token").GetString();

        foreach (var expected in new[] { HttpStatusCode.OK, HttpStatusCode.Unauthorized })
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
            request.Headers.Add("Cookie", raw); request.Headers.Add("X-Rdweb-CSRF", csrf);
            using var response = await client.SendAsync(request);
            Assert.Equal(expected, response.StatusCode);
            // 第一次正常輪替不得切斷；第二次重用才撤銷family。
            Assert.Equal(expected == HttpStatusCode.Unauthorized, sameFamily.Revoked);
        }
        Assert.False(otherFamily.Revoked);
    }

    // require_mfa收緊時依連線綁定的MFA狀態重算完整登入，不符者終止；放寬不影響既有連線。
    [Fact]
    public async Task MfaPolicyTighteningTerminatesConnectionsThatAreNoLongerFull()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var adminId = await AuthIntegrationTests.SeedAsync(factory);
        var operatorId = await AuthIntegrationTests.SeedAsync(factory, "operator", "operator");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var adminConnection = Register(registry, adminId, Guid.NewGuid());
        using var operatorConnection = Register(registry, operatorId, Guid.NewGuid());

        using var off = await client.PutAsJsonAsync("/api/v1/settings/security", new { require_mfa = "off", password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        Assert.False(adminConnection.Revoked); Assert.False(operatorConnection.Revoked);

        using var admins = await client.PutAsJsonAsync("/api/v1/settings/security", new { require_mfa = "admins", password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, admins.StatusCode);
        Assert.True(adminConnection.Revoked); Assert.False(operatorConnection.Revoked);
    }

    // 單筆或批次刪除target後終止該target全部連線，其他target不受影響。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TargetDeletionTerminatesTargetConnections(bool bulk)
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        var ownerId = await UserIdAsync(factory, "owner");
        var deleted = await CreateTargetAsync(owner, server, "123456789");
        var kept = await CreateTargetAsync(owner, server, "987654321");
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var first = Register(registry, ownerId, deleted);
        using var second = Register(registry, Guid.NewGuid(), deleted);
        using var unrelated = Register(registry, ownerId, kept);

        using var response = bulk
            ? await owner.PostAsJsonAsync("/api/v1/targets/bulk-delete", new { items = new[] { new { id = deleted, version = 1 } } })
            : await owner.DeleteAsync($"/api/v1/targets/{deleted}?version=1");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        Assert.True(first.Revoked && second.Revoked);
        Assert.False(unrelated.Revoked);
    }

    // 停用server後終止其下target的連線；未停用的更新與其他server不受影響。
    [Fact]
    public async Task ServerDisableTerminatesConnectionsOnThatServer()
    {
        await using var factory = new TestApplicationFactory();
        var server = await TargetIntegrationTests.SeedServerAsync(factory); var otherServer = await TargetIntegrationTests.SeedServerAsync(factory);
        using var admin = await TargetIntegrationTests.LoginAsync(factory, "admin", "admin");
        var adminId = await UserIdAsync(factory, "admin");
        var target = await CreateTargetAsync(admin, server, "123456789");
        var otherTarget = await CreateTargetAsync(admin, otherServer, "123456789");
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        using var onServer = Register(registry, adminId, target);
        using var elsewhere = Register(registry, adminId, otherTarget);
        var request = new
        {
            name = "fixture",
            id_server = "server.example:21116",
            relay_server = "relay.example:21117",
            public_key = Convert.ToBase64String(new byte[32]),
            transport = "tcp",
            enabled = true,
            allow_private_network = false,
            version = 1,
            notes = (string?)null
        };

        using (var renamed = await admin.PutAsJsonAsync($"/api/v1/servers/{server}", request with { name = "renamed" }))
            Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        Assert.False(onServer.Revoked);
        using var disabled = await admin.PutAsJsonAsync($"/api/v1/servers/{server}", request with { enabled = false, version = 2 });
        Assert.Equal(HttpStatusCode.OK, disabled.StatusCode);

        Assert.True(onServer.Revoked); Assert.False(elsewhere.Revoked);
    }

    // 以真實registry建立具session snapshot的lease，模擬串流中的連線而不碰hbbs／hbbr。
    private static ActiveConnectionLease Register(ActiveConnectionRegistry registry, Guid userId, Guid targetId, Guid? family = null)
        => registry.Register(new ConnectionGrant(userId, targetId, new(family ?? Guid.NewGuid(), 1, "operator", false)),
            new("123456789", Convert.ToBase64String(new byte[32])));

    // 透過正式API建立target並回傳ID，確保ACL與FK與正式流程一致。
    private static async Task<Guid> CreateTargetAsync(HttpClient client, Guid server, string rustDeskId)
    {
        using var created = await client.PostAsJsonAsync("/api/v1/targets", new { server_id = server, name = "fixture-" + rustDeskId, rustdesk_id = rustDeskId });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        return (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    // 從隔離資料庫查詢測試帳號ID。
    private static async Task<Guid> UserIdAsync(TestApplicationFactory factory, string username)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        return (await database.Users.SingleAsync(user => user.Username == username)).Id;
    }
}
