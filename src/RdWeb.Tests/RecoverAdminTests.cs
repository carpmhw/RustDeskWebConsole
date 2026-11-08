using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Cli;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class RecoverAdminTests
{
    private const string Recovered = "public-recovered-password";

    // 以測試主機的資料庫路徑與救援密碼建立 CLI 設定。
    private static IConfiguration Configuration(TestApplicationFactory factory, string password = Recovered) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = factory.DatabasePath, ["RECOVER_ADMIN_PASSWORD"] = password }).Build();

    // 執行救援指令並回傳結束碼與輸出。
    private static async Task<(int Code, string Output, string Error)> RunAsync(TestApplicationFactory factory, string username, bool resetTotp, string password = Recovered)
    {
        using var output = new StringWriter();
        using var error = new StringWriter();
        var code = await RecoverAdminCommand.RunAsync(Configuration(factory, password), username, resetTotp, output, error);
        return (code, output.ToString(), error.ToString());
    }

    // 開啟測試主機的資料庫。
    private static async Task<AppDbContext> DatabaseAsync(TestApplicationFactory factory) =>
        await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();

    // 建立帶 Origin 的 client。
    private static HttpClient Client(TestApplicationFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        return client;
    }

    // 停用中的唯一管理員可被救回：重新啟用、需改密碼、舊工作階段失效、新密碼可登入。
    [Fact]
    public async Task RecoversDisabledAdminAndRequiresPasswordChange()
    {
        await using var factory = new TestApplicationFactory();
        var id = await AuthIntegrationTests.SeedAsync(factory);
        using var before = Client(factory);
        using var login = await before.PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        var csrf = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("csrf_token").GetString();
        int version;
        await using (var database = await DatabaseAsync(factory))
        {
            var user = await database.Users.SingleAsync(item => item.Id == id);
            user.IsActive = false; version = user.AuthVersion;
            await database.SaveChangesAsync();
        }
        var (code, output, _) = await RunAsync(factory, "admin", false);
        Assert.Equal(0, code);
        using (var json = JsonDocument.Parse(output))
        {
            Assert.Equal("ok", json.RootElement.GetProperty("status").GetString());
            Assert.False(json.RootElement.GetProperty("totp_reset").GetBoolean());
        }
        await using (var database = await DatabaseAsync(factory))
        {
            var user = await database.Users.AsNoTracking().SingleAsync(item => item.Id == id);
            Assert.True(user.IsActive);
            Assert.True(user.PasswordChangeRequired);
            Assert.True(user.AuthVersion > version);
        }
        using var refresh = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh") { Content = JsonContent.Create(new { }) };
        refresh.Headers.Add("Cookie", cookie);
        refresh.Headers.Add("X-Rdweb-CSRF", csrf);
        using var refreshed = await before.SendAsync(refresh);
        Assert.Equal(HttpStatusCode.Unauthorized, refreshed.StatusCode);
        using var after = await Client(factory).PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = Recovered });
        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
        Assert.True((await after.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("user").GetProperty("password_change_required").GetBoolean());
    }

    // --reset-totp 同時清除雙重驗證與備援碼。
    [Fact]
    public async Task ResetTotpClearsSecretAndRecoveryCodes()
    {
        await using var factory = new TestApplicationFactory();
        var id = await AuthIntegrationTests.SeedAsync(factory);
        await using (var database = await DatabaseAsync(factory))
        {
            var user = await database.Users.SingleAsync(item => item.Id == id);
            user.TotpSecretEnc = [1, 2, 3]; user.TotpNonce = [4, 5, 6]; user.TotpKeyVersion = 1; user.TotpEnabledAt = DateTime.UtcNow;
            database.RecoveryCodes.Add(new RecoveryCode { UserId = id, CodeHash = "public-test-code-hash" });
            await database.SaveChangesAsync();
        }
        var (code, output, _) = await RunAsync(factory, "admin", true);
        Assert.Equal(0, code);
        Assert.True(JsonDocument.Parse(output).RootElement.GetProperty("totp_reset").GetBoolean());
        await using (var database = await DatabaseAsync(factory))
        {
            var user = await database.Users.AsNoTracking().SingleAsync(item => item.Id == id);
            Assert.Null(user.TotpSecretEnc);
            Assert.Null(user.TotpEnabledAt);
            Assert.Equal(0, await database.RecoveryCodes.CountAsync(item => item.UserId == id));
        }
    }

    // 非管理員、不存在的帳號與過短密碼都拒絕，錯誤輸出不回顯帳號。
    [Fact]
    public async Task RejectsNonAdminUnknownAndBadPassword()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "operator-user", "operator");
        var operatorResult = await RunAsync(factory, "operator-user", false);
        Assert.Equal(1, operatorResult.Code);
        Assert.DoesNotContain("operator-user", operatorResult.Error);
        var unknown = await RunAsync(factory, "ghost-user", false);
        Assert.Equal(1, unknown.Code);
        Assert.DoesNotContain("ghost-user", unknown.Error);
        Assert.Equal(1, (await RunAsync(factory, "admin", false, "short-11chr")).Code);
        using var stillOld = await Client(factory).PostAsJsonAsync("/api/v1/auth/login", new { username = "admin", password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, stillOld.StatusCode);
    }

    // 救援寫入稽核，操作者與對象皆為被救援的管理員。
    [Fact]
    public async Task WritesAuditForRecoveredAdmin()
    {
        await using var factory = new TestApplicationFactory();
        var id = await AuthIntegrationTests.SeedAsync(factory);
        Assert.Equal(0, (await RunAsync(factory, "admin", false)).Code);
        await using var database = await DatabaseAsync(factory);
        Assert.True(await database.AuditLogs.AnyAsync(log => log.Action == "UserChanged" && log.UserId == id && log.ObjectId == id && log.ObjectType == "user"));
    }

    // 救援密碼放在命令列時拒絕（結束碼 2），不得進入 shell history。
    [Fact]
    public async Task DispatcherRejectsPasswordOnCommandLine()
    {
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["recover-admin", "admin", "RECOVER_ADMIN_PASSWORD=public-recovered-password"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["recover-admin"]));
    }
}
