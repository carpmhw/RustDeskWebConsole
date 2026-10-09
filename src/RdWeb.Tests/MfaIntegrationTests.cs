using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OtpNet;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class MfaIntegrationTests
{
    // 猜測或已消耗票證的嘗試也必須受到來源 IP 限流。
    [Fact]
    public async Task InvalidMfaChallengesAreRateLimited()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        for (var attempt = 0; attempt < 5; attempt++)
        { using var failed = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = new string('A', 43), code = "123456" }); Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode); }
        using var limited = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = new string('B', 43), code = "123456" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    // 真實 TOTP 二階段登入能成功，同一 counter 在新的 challenge 中也不可重播。
    [Fact]
    public async Task TotpSecondStepSucceedsButCounterReplayFails()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory); await EnableFixtureAsync(factory);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var user = await database.Users.SingleAsync();
        var secret = factory.Services.GetRequiredService<Vault>().Decrypt(new(user.TotpSecretEnc!, user.TotpNonce!, user.TotpKeyVersion!.Value), $"user:{user.Id}:totp");
        try
        {
            var code = new Totp(secret).ComputeTotp(DateTime.UtcNow);
            using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
            using var verified = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mfa_token").GetString(), code });
            Assert.Equal(HttpStatusCode.OK, verified.StatusCode);
            using var second = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
            using var replay = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mfa_token").GetString(), code });
            Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        }
        finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(secret); }
    }
    // 確認後才啟用 TOTP，旧 session 失效；TOTP 重播拒絕，備援碼僅用一次。
    [Fact]
    public async Task EnrollmentCreatesMfaSessionAndRecoveryIsSingleUse()
    {
        await using var factory = new TestApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        var id = await AuthIntegrationTests.SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var initial = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new("Bearer", initial.GetProperty("access_token").GetString());
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, enroll.StatusCode);
        var pending = await enroll.Content.ReadFromJsonAsync<JsonElement>();
        var secret = pending.GetProperty("secret").GetString()!;
        var code = new Totp(Base32Encoding.ToBytes(secret)).ComputeTotp(DateTime.UtcNow);
        using var confirm = await client.PostAsJsonAsync("/api/v1/auth/totp/confirm", new { code });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var activated = await confirm.Content.ReadFromJsonAsync<JsonElement>();
        var recovery = activated.GetProperty("recovery_codes").EnumerateArray().Select(item => item.GetString()!).ToArray();
        Assert.Equal(10, recovery.Length);
        using var oldSession = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, oldSession.StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        using var mfaLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var challenge = await mfaLogin.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(challenge.GetProperty("mfa_required").GetBoolean());
        using var replay = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = challenge.GetProperty("mfa_token").GetString(), code });
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        var retry = await replay.Content.ReadFromJsonAsync<JsonElement>();
        using var recovered = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = retry.GetProperty("mfa_token").GetString(), code = recovery[0] });
        Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var user = await database.Users.SingleAsync(user => user.Id == id);
        Assert.NotNull(user.TotpSecretEnc);
        Assert.DoesNotContain(secret, System.Text.Encoding.UTF8.GetString(user.TotpSecretEnc!));
        Assert.Equal(1, await database.RecoveryCodes.CountAsync(item => item.UsedAt != null));
        Assert.DoesNotContain(recovery[0], string.Join(',', await database.RecoveryCodes.Select(item => item.CodeHash).ToListAsync()));
        using var anotherLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var anotherChallenge = await anotherLogin.Content.ReadFromJsonAsync<JsonElement>();
        using var reuse = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = anotherChallenge.GetProperty("mfa_token").GetString(), code = recovery[0] });
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
    }

    // 兩個 MFA challenge 同時使用同一備援碼，僅一個能建立 session。
    [Fact]
    public async Task RecoveryRaceOnlyCreatesOneSession()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory);
        await EnableFixtureAsync(factory);
        using var first = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        using var second = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var challenges = new[] { (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mfa_token").GetString(), (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mfa_token").GetString() };
        var codes = await Task.WhenAll(challenges.Select(async token =>
        {
            // 每個競爭者持有不同 challenge，不能只靠票證單次語意通過測試。
            using var response = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = token, code = "AABBCCDDEEFF00112233445566778899" });
            return response.StatusCode;
        }));
        Assert.Single(codes, code => code == HttpStatusCode.OK);
        Assert.Single(codes, code => code == HttpStatusCode.Unauthorized);
    }

    // 短效 MFA challenge 逾時後不可用，即使 code 本身有效。
    [Fact]
    public async Task ExpiredMfaChallengeCannotIssueTokens()
    {
        var clock = new MutableClock();
        await using var factory = new TestApplicationFactory(builder => builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(clock)));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory); await EnableFixtureAsync(factory);
        using var first = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var challenge = await first.Content.ReadFromJsonAsync<JsonElement>(); clock.Now += TimeSpan.FromMinutes(6);
        using var expired = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = challenge.GetProperty("mfa_token").GetString(), code = "AABBCCDDEEFF00112233445566778899" });
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
    }

    // 重產作廢全部舊碼，停用清除 secret／備援碼並立即撤銷 session。
    [Fact]
    public async Task RecoveryRegenerationAndDisableRequireReauthentication()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory); await EnableFixtureAsync(factory);
        var grant = await LoginWithRecoveryAsync(client);
        client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());
        using var bad = await client.PostAsJsonAsync("/api/v1/auth/recovery-codes", new { password = "wrong-public-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        using var regenerated = await client.PostAsJsonAsync("/api/v1/auth/recovery-codes", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, regenerated.StatusCode);
        Assert.Equal(10, (await regenerated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("recovery_codes").GetArrayLength());
        using var disable = await client.PostAsJsonAsync("/api/v1/auth/totp/disable", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, disable.StatusCode);
        using var invalidated = await client.GetAsync("/api/v1/auth/me"); Assert.Equal(HttpStatusCode.Unauthorized, invalidated.StatusCode);
        await using var read = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var user = await read.Users.SingleAsync(); Assert.Null(user.TotpSecretEnc); Assert.Null(user.TotpNonce); Assert.Null(user.TotpEnabledAt);
        Assert.Equal(0, await read.RecoveryCodes.CountAsync());
    }

    // 最新強制政策阻止停用，不能只靠 UI 隱藏按鈕。
    [Fact]
    public async Task RequiredMfaCannotBeDisabled()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory); await EnableFixtureAsync(factory);
        var grant = await LoginWithRecoveryAsync(client); client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        database.SystemSettings.Add(new SystemSetting { Key = "require_mfa", Value = "\"admins\"" }); await database.SaveChangesAsync();
        using var denied = await client.PostAsJsonAsync("/api/v1/auth/totp/disable", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    // 初始 pending 綁定超過十分鐘後不能確認。
    [Fact]
    public async Task PendingEnrollmentExpires()
    {
        var clock = new MutableClock();
        await using var factory = new TestApplicationFactory(builder => builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(clock)));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, enroll.StatusCode); clock.Now += TimeSpan.FromMinutes(11);
        using var expired = await client.PostAsJsonAsync("/api/v1/auth/totp/confirm", new { code = "123456" });
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
    }

    // 鎖定後不能利用既有 pending 確認清除鎖定並取得新的 MFA session。
    [Fact]
    public async Task LockedAccountCannotConfirmPendingEnrollment()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost"); await AuthIntegrationTests.SeedAsync(factory);
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        client.DefaultRequestHeaders.Authorization = new("Bearer", (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString());
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = AuthIntegrationTests.Password });
        var secret = (await enroll.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("secret").GetString()!;
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var user = await database.Users.SingleAsync(); user.LockedUntil = DateTime.UtcNow.AddMinutes(1); await database.SaveChangesAsync();
        using var denied = await client.PostAsJsonAsync("/api/v1/auth/totp/confirm", new { code = new Totp(Base32Encoding.ToBytes(secret)).ComputeTotp(DateTime.UtcNow) });
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
    }

    // all 政策也限制非管理員，完成確認才取得完整 MFA 權限。
    [Fact]
    public async Task RequireAllRestrictsOperatorUntilEnrollmentCompletes()
    {
        await using var factory = new TestApplicationFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        await AuthIntegrationTests.SeedAsync(factory, "operator", "operator");
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        database.SystemSettings.Add(new SystemSetting { Key = "require_mfa", Value = "\"all\"" }); await database.SaveChangesAsync();
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "operator", password = AuthIntegrationTests.Password });
        var initial = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(initial.GetProperty("user").GetProperty("mfa_enrollment_required").GetBoolean());
        client.DefaultRequestHeaders.Authorization = new("Bearer", initial.GetProperty("access_token").GetString());
        using var denied = await client.PostAsJsonAsync("/api/v1/auth/recovery-codes", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var enroll = await client.PostAsJsonAsync("/api/v1/auth/totp/enroll", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, enroll.StatusCode);
        var pending = await enroll.Content.ReadFromJsonAsync<JsonElement>();
        using var confirm = await client.PostAsJsonAsync("/api/v1/auth/totp/confirm", new { code = new Totp(Base32Encoding.ToBytes(pending.GetProperty("secret").GetString()!)).ComputeTotp(DateTime.UtcNow) });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var complete = await confirm.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(complete.GetProperty("user").GetProperty("mfa_enrollment_required").GetBoolean());
        client.DefaultRequestHeaders.Authorization = new("Bearer", complete.GetProperty("access_token").GetString());
        using var regenerated = await client.PostAsJsonAsync("/api/v1/auth/recovery-codes", new { password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, regenerated.StatusCode);
    }

    // 使用不同 challenge 驗證備援碼，回傳完整登入結果供敏感操作測試。
    private static async Task<JsonElement> LoginWithRecoveryAsync(HttpClient client)
    {
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var pending = await login.Content.ReadFromJsonAsync<JsonElement>();
        using var verified = await client.PostAsJsonAsync("/api/v1/auth/mfa/verify", new { mfa_token = pending.GetProperty("mfa_token").GetString(), code = "AABBCCDDEEFF00112233445566778899" });
        Assert.Equal(HttpStatusCode.OK, verified.StatusCode);
        return await verified.Content.ReadFromJsonAsync<JsonElement>();
    }

    // 啟用測試專用隨機 secret 與公開備援碼，避免保存測試私鑰或明文 secret。
    internal static async Task EnableFixtureAsync(TestApplicationFactory factory, Guid? id = null)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var user = await database.Users.SingleAsync(user => id == null || user.Id == id);
        var envelope = factory.Services.GetRequiredService<Vault>().Encrypt(System.Security.Cryptography.RandomNumberGenerator.GetBytes(20), $"user:{user.Id}:totp");
        user.TotpSecretEnc = envelope.Ciphertext; user.TotpNonce = envelope.Nonce; user.TotpKeyVersion = envelope.KeyVersion; user.TotpEnabledAt = DateTime.UtcNow;
        database.RecoveryCodes.Add(new RecoveryCode { UserId = user.Id, CodeHash = RecoveryCodes.Hash("AABBCCDDEEFF00112233445566778899") });
        await database.SaveChangesAsync();
    }
    private sealed class MutableClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        // 僅測試 TTL 推進，JWT 驗證仍保持實際系統時鐘。
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
