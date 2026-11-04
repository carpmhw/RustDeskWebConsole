using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;

namespace RdWeb.Tests;

public sealed class AdminIntegrationTests
{
    // 最後一名管理員不可停用；強制 MFA 立即限制現有 password-only session。
    [Fact]
    public async Task LastAdminAndForcedMfaAreEnforcedOnServer()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var id = await AuthIntegrationTests.SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var grant = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());
        using var users = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.OK, users.StatusCode);
        Assert.DoesNotContain("password", await users.Content.ReadAsStringAsync());
        using var disable = await client.PatchAsJsonAsync($"/api/v1/users/{id}", new { is_active = false });
        Assert.Equal(HttpStatusCode.Conflict, disable.StatusCode);
        using var policy = await client.PutAsJsonAsync("/api/v1/settings/security", new { require_mfa = "admins", password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, policy.StatusCode);
        using var denied = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var me = await client.GetAsync("/api/v1/auth/me");
        Assert.True((await me.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mfa_enrollment_required").GetBoolean());
    }

    // Viewer 無法管理；管理員密碼重設立即撤銷目標現有 access／refresh。
    [Fact]
    public async Task RoleAndPasswordResetInvalidateTargetSessions()
    {
        await using var factory = new TestApplicationFactory(); using var admin = factory.CreateClient(); using var viewer = factory.CreateClient();
        admin.DefaultRequestHeaders.Add("Origin", "http://localhost"); viewer.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory); var viewerId = await AuthIntegrationTests.SeedAsync(factory, "reader", "viewer");
        using var adminLogin = await admin.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        using var viewerLogin = await viewer.PostAsJsonAsync("/api/v1/auth/login", new { username = "reader", password = AuthIntegrationTests.Password });
        admin.DefaultRequestHeaders.Authorization = new("Bearer", (await adminLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        viewer.DefaultRequestHeaders.Authorization = new("Bearer", (await viewerLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var denied = await viewer.GetAsync("/api/v1/users"); Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var reset = await admin.PostAsJsonAsync($"/api/v1/users/{viewerId}/reset-password", new { new_password = "another-public-reset-password", password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        using var invalidated = await viewer.GetAsync("/api/v1/auth/me"); Assert.Equal(HttpStatusCode.Unauthorized, invalidated.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.True((await database.Users.SingleAsync(user => user.Id == viewerId)).AuthVersion > 1);
        Assert.All(await database.RefreshTokens.Where(token => token.UserId == viewerId).ToListAsync(), token => Assert.NotNull(token.RevokedAt));
    }

    // 管理員可重設他人 TOTP，但必須再驗證且無法重設自己的 MFA。
    [Fact]
    public async Task AdminResetTotpClearsOnlyTargetAndRequiresProof()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var adminId = await AuthIntegrationTests.SeedAsync(factory); var viewerId = await AuthIntegrationTests.SeedAsync(factory, "reader", "viewer");
        await MfaIntegrationTests.EnableFixtureAsync(factory, viewerId);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var noProof = await client.PostAsJsonAsync($"/api/v1/users/{viewerId}/reset-totp", new { }); Assert.Equal(HttpStatusCode.Unauthorized, noProof.StatusCode);
        using var self = await client.PostAsJsonAsync($"/api/v1/users/{adminId}/reset-totp", new { password = AuthIntegrationTests.Password }); Assert.Equal(HttpStatusCode.Forbidden, self.StatusCode);
        using var reset = await client.PostAsJsonAsync($"/api/v1/users/{viewerId}/reset-totp", new { password = AuthIntegrationTests.Password }); Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var read = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Null((await read.Users.SingleAsync(user => user.Id == viewerId)).TotpEnabledAt);
        Assert.Equal(0, await read.RecoveryCodes.CountAsync(code => code.UserId == viewerId));
        Assert.True(await read.AuditLogs.AnyAsync(audit => audit.UserId == adminId && audit.ObjectId == viewerId && audit.Action == "Mfa" && audit.Result == "Success"));
    }

    // 建立、角色指派與停用皆由後端管理，已停用的帳號不得再登入。
    [Fact]
    public async Task UserCreationRoleChangesAndDeactivationAreApplied()
    {
        await using var factory = new TestApplicationFactory(); using var admin = factory.CreateClient(); using var target = factory.CreateClient();
        admin.DefaultRequestHeaders.Add("Origin", "http://localhost"); target.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory);
        using var login = await admin.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        admin.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var created = await admin.PostAsJsonAsync("/api/v1/users", new { username = "new-user", password = AuthIntegrationTests.Password, role = "operator", email = "operator@example.test" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var targetLogin = await target.PostAsJsonAsync("/api/v1/auth/login", new { username = "new-user", password = AuthIntegrationTests.Password });
        target.DefaultRequestHeaders.Authorization = new("Bearer", (await targetLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var changed = await admin.PatchAsJsonAsync($"/api/v1/users/{id}", new { role = "viewer" }); Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var invalidated = await target.GetAsync("/api/v1/auth/me"); Assert.Equal(HttpStatusCode.Unauthorized, invalidated.StatusCode);
        using var disabled = await admin.PatchAsJsonAsync($"/api/v1/users/{id}", new { is_active = false }); Assert.Equal(HttpStatusCode.OK, disabled.StatusCode);
        target.DefaultRequestHeaders.Authorization = null;
        using var inactive = await target.PostAsJsonAsync("/api/v1/auth/login", new { username = "new-user", password = AuthIntegrationTests.Password }); Assert.Equal(HttpStatusCode.Unauthorized, inactive.StatusCode);
    }
}
