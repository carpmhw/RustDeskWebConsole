using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OtpNet;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class TargetRevealTests
{
    // 明文只在獨立端點的正確二次驗證回應，no-store與稽核同時生效。
    [Fact]
    public async Task RevealRequiresProofAndAuditsWithoutSecretDetails()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "fixture", server_id = server, rustdesk_id = "123456789", password = "public-reveal-marker" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var wrong = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/password/reveal", new { password = "wrong-public-proof" }); Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        using var reveal = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/password/reveal", new { password = AuthIntegrationTests.Password }); Assert.Equal(HttpStatusCode.OK, reveal.StatusCode);
        Assert.Contains("no-store", reveal.Headers.CacheControl!.ToString()); var result = await reveal.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(result.GetProperty("password").GetString() == "public-reveal-marker"); Assert.Equal(30, result.GetProperty("expires_in").GetInt32());
        using var read = await owner.GetAsync($"/api/v1/targets/{id}"); Assert.DoesNotContain("public-reveal-marker", await read.Content.ReadAsStringAsync());
        await factory.Services.GetRequiredService<AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var logs = await database.AuditLogs.Where(log => log.ObjectId == id && log.Action == "PasswordViewed").ToListAsync();
        Assert.Equal(2, logs.Count); Assert.Contains(logs, log => log.Result == "Success"); Assert.Contains(logs, log => log.Result == "Failure");
        Assert.All(logs, log => { Assert.DoesNotContain("public-reveal-marker", log.Detail); Assert.DoesNotContain(AuthIntegrationTests.Password, log.Detail); });
    }
    // 未授權者在proof之前拒絕，不能利用端點猜測使用者密碼。
    [Fact]
    public async Task HiddenTargetRejectsBeforePasswordVerification()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator"); using var other = await TargetIntegrationTests.LoginAsync(factory, "other", "operator");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "fixture", server_id = server, rustdesk_id = "123456789", password = "public-reveal-marker" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var denied = await other.PostAsJsonAsync($"/api/v1/targets/{id}/password/reveal", new { password = "wrong-public-proof" }); Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Equal(0, (await database.Users.SingleAsync(user => user.Username == "other")).FailedLoginCount);
    }
    // 顯示密碼的TOTP二次驗證也共用counter防重播，不能連續顯示重用碼。
    [Fact]
    public async Task RevealTotpProofIsSingleUse()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "fixture", server_id = server, rustdesk_id = "123456789", password = "public-reveal-marker" });
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        await MfaIntegrationTests.EnableFixtureAsync(factory);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(); var user = await database.Users.SingleAsync();
        var grant = factory.Services.GetRequiredService<TokenService>().Create(user, true); database.RefreshTokens.Add(grant.Token); await database.SaveChangesAsync();
        owner.DefaultRequestHeaders.Authorization = new("Bearer", grant.AccessToken);
        var secret = factory.Services.GetRequiredService<Vault>().Decrypt(new(user.TotpSecretEnc!, user.TotpNonce!, user.TotpKeyVersion!.Value), $"user:{user.Id}:totp");
        try
        {
            var code = new Totp(secret).ComputeTotp(DateTime.UtcNow);
            using var first = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/password/reveal", new { code }); Assert.Equal(HttpStatusCode.OK, first.StatusCode);
            using var replay = await owner.PostAsJsonAsync($"/api/v1/targets/{id}/password/reveal", new { code }); Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        }
        finally { CryptographicOperations.ZeroMemory(secret); }
    }
}
