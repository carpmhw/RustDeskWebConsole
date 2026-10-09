using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.RustDesk;
namespace RdWeb.Tests;

public sealed class LoginAssistTests
{
    // 不合法的連線／input／Origin／family及停用user/endpoint皆不得得到proof。
    [Theory]
    [InlineData("inactive", HttpStatusCode.Forbidden)]
    [InlineData("wrong-target", HttpStatusCode.NotFound)]
    [InlineData("long-input", HttpStatusCode.BadRequest)]
    [InlineData("utf8-input", HttpStatusCode.BadRequest)]
    [InlineData("origin", HttpStatusCode.Forbidden)]
    [InlineData("new-family", HttpStatusCode.Forbidden)]
    [InlineData("disabled-user", HttpStatusCode.Unauthorized)]
    [InlineData("disabled-server", HttpStatusCode.Forbidden)]
    [InlineData("missing-password", HttpStatusCode.NotFound)]
    [InlineData("mfa-policy", HttpStatusCode.Forbidden)]
    [InlineData("viewer", HttpStatusCode.Forbidden)]
    [InlineData("other-user", HttpStatusCode.Forbidden)]
    [InlineData("revoked-family", HttpStatusCode.Unauthorized)]
    public async Task InvalidRequestsNeverReturnProof(string scenario, HttpStatusCode expected)
    {
        await using var factory = new TestApplicationFactory();
        var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "assist", server_id = server, rustdesk_id = "123456789", password = "public-login-fixture" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var ticketResponse = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/connect-ticket", new { });
        var ticket = (await ticketResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ticket").GetString()!;
        await using var scope = factory.Services.CreateAsyncScope();
        var grant = await scope.ServiceProvider.GetRequiredService<ConnectionTicketService>().ConsumeAsync(id, ticket, default);
        using var active = factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(grant, new("123456789", Convert.ToBase64String(new byte[32])));
        if (scenario == "inactive") active.Dispose();
        if (scenario == "origin") { owner.DefaultRequestHeaders.Remove("Origin"); owner.DefaultRequestHeaders.Add("Origin", "https://invalid.example"); }
        if (scenario == "new-family")
        {
            using var login = await owner.PostAsJsonAsync("/api/v1/auth/login", new { username = "owner", password = AuthIntegrationTests.Password });
            owner.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        }
        await using (var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            if (scenario == "disabled-user") (await db.Users.SingleAsync()).IsActive = false;
            if (scenario == "disabled-server") (await db.RustDeskServers.SingleAsync()).Enabled = false;
            if (scenario == "missing-password") (await db.Targets.SingleAsync()).PasswordSecretId = null;
            if (scenario == "mfa-policy") db.SystemSettings.Add(new RdWeb.Api.Data.Entities.SystemSetting { Key = "require_mfa", Value = "\"all\"" });
            if (scenario == "viewer") db.TargetPermissions.Add(new RdWeb.Api.Data.Entities.TargetPermission { TargetId = id, Role = "viewer" });
            if (scenario == "revoked-family") foreach (var token in await db.RefreshTokens.ToListAsync()) token.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        if (scenario is "viewer" or "other-user")
        {
            using var other = await TargetIntegrationTests.LoginAsync(factory, "other", scenario == "viewer" ? "viewer" : "admin");
            owner.DefaultRequestHeaders.Authorization = other.DefaultRequestHeaders.Authorization;
        }
        var route = scenario == "wrong-target" ? Guid.NewGuid() : id;
        var salt = scenario == "long-input" ? new string('a', 129) : scenario == "utf8-input" ? new string('鹽', 128) : "public-salt";
        using var response = await owner.PostAsJsonAsync($"/api/v1/targets/{route}/login-assist", new { connection_id = active.Id, salt, challenge = "public-challenge" });
        Assert.Equal(expected, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("proof", out _));
    }

    // 六個不同活躍connection也不能繞過每分鐘五次assist配額。
    [Fact]
    public async Task DifferentConnectionsStillRespectFivePerMinuteQuota()
    {
        await using var factory = new TestApplicationFactory();
        var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "assist", server_id = server, rustdesk_id = "123456789", password = "public-login-fixture" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var ticketResponse = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/connect-ticket", new { });
        var ticket = (await ticketResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ticket").GetString()!;
        await using var scope = factory.Services.CreateAsyncScope();
        var grant = await scope.ServiceProvider.GetRequiredService<ConnectionTicketService>().ConsumeAsync(id, ticket, default);
        for (var attempt = 0; attempt < 6; attempt++)
        {
            using var active = factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(grant, new("123456789", Convert.ToBase64String(new byte[32])));
            using var response = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/login-assist", new { connection_id = active.Id, salt = "s", challenge = "c" });
            Assert.Equal(attempt < 5 ? HttpStatusCode.OK : HttpStatusCode.TooManyRequests, response.StatusCode);
        }
    }

    // 有真正session/target binding者只得到最終proof，第二次請求必須拒絕。
    [Fact]
    public async Task LiveConnectionGetsOneProofAndNoPlaintext()
    {
        await using var factory = new TestApplicationFactory();
        var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "assist", server_id = server, rustdesk_id = "123456789", password = "public-login-fixture" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var ticketResponse = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/connect-ticket", new { });
        var ticket = (await ticketResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ticket").GetString()!;
        await using var scope = factory.Services.CreateAsyncScope();
        var grant = await scope.ServiceProvider.GetRequiredService<ConnectionTicketService>().ConsumeAsync(id, ticket, default);
        using var active = factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(grant, new("123456789", Convert.ToBase64String(new byte[32])));
        using var first = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/login-assist", new { connection_id = active.Id, salt = "public-salt", challenge = "public-challenge" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var json = await first.Content.ReadFromJsonAsync<JsonElement>();
        var proof = Convert.FromBase64String(json.GetProperty("proof").GetString()!);
        Assert.Equal(32, proof.Length);
        Assert.True(Convert.ToHexString(proof).ToLowerInvariant() == "1df9c40098b58d8bc98c7281d6607521d84925b756fb67f81a9dac1624338f44");
        Assert.False(json.TryGetProperty("password", out _));
        using var again = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/login-assist", new { connection_id = active.Id, salt = "public-salt", challenge = "public-challenge" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }
}
