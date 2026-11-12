using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Endpoints;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class ConnectionGovernanceIntegrationTests
{
    // 讀取管理員可見的連線管控設定。
    private static async Task<JsonElement> SettingsAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/v1/settings/connections");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    // 預設 30 分鐘／8 小時；範圍外或缺少再驗證皆不變更；0 表示關閉；成功修改寫入 SettingsChanged。
    [Fact]
    public async Task SettingsAreValidatedAndRequireReauthentication()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        using var client = await AuditIntegrationTests.LoginAsync(factory, "admin");
        var initial = await SettingsAsync(client);
        Assert.Equal(30, initial.GetProperty("idle_minutes").GetInt32());
        Assert.Equal(8, initial.GetProperty("max_hours").GetInt32());
        foreach (var (idle, hours) in new[] { (3, 8), (481, 8), (30, 25), (30, -1), (-1, 8) })
        {
            using var invalid = await client.PutAsJsonAsync("/api/v1/settings/connections", new { idle_minutes = idle, max_hours = hours, password = AuthIntegrationTests.Password });
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        }
        using var noProof = await client.PutAsJsonAsync("/api/v1/settings/connections", new { idle_minutes = 0, max_hours = 0 });
        Assert.Equal(HttpStatusCode.Unauthorized, noProof.StatusCode);
        Assert.Equal(30, (await SettingsAsync(client)).GetProperty("idle_minutes").GetInt32());
        using var saved = await client.PutAsJsonAsync("/api/v1/settings/connections", new { idle_minutes = 0, max_hours = 1, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var updated = await SettingsAsync(client);
        Assert.Equal(0, updated.GetProperty("idle_minutes").GetInt32());
        Assert.Equal(1, updated.GetProperty("max_hours").GetInt32());
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Equal(1, await database.AuditLogs.CountAsync(audit => audit.Action == "SettingsChanged" && audit.UserId == admin));
    }

    // 一般使用者只能讀閒置分鐘數（主控台倒數需要），不能讀寫完整設定。
    [Fact]
    public async Task NonAdminsReadOnlyIdleMinutes()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "reader", "viewer");
        using var client = await AuditIntegrationTests.LoginAsync(factory, "reader");
        using var idle = await client.GetAsync("/api/v1/settings/connections/idle");
        Assert.Equal(HttpStatusCode.OK, idle.StatusCode);
        var body = await idle.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(30, body.GetProperty("idle_minutes").GetInt32());
        Assert.False(body.TryGetProperty("max_hours", out _));
        using var full = await client.GetAsync("/api/v1/settings/connections");
        Assert.Equal(HttpStatusCode.Forbidden, full.StatusCode);
        using var put = await client.PutAsJsonAsync("/api/v1/settings/connections", new { idle_minutes = 0, max_hours = 0, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);
    }

    // 建立目標資料並回傳其 ID；名稱供列表解析驗證。
    private static async Task<Guid> SeedTargetAsync(TestApplicationFactory factory, Guid owner, string name)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var server = new RustDeskServer { Name = "fixture-" + name, IdServer = "server.example:21116", RelayServer = "relay.example:21117", PublicKey = "public-fixture" };
        var target = new Target { ServerId = server.Id, Name = name, RustDeskId = "123456789", CreatedBy = owner };
        database.RustDeskServers.Add(server); database.Targets.Add(target);
        await database.SaveChangesAsync();
        return target.Id;
    }

    // 以 registry 登記一條作用中連線並帶入開始時間、來源 IP 與流量。
    private static ActiveConnectionLease Register(TestApplicationFactory factory, Guid user, Guid target, string ip, long sent, long received)
    {
        var progress = new RelayProgress { BrowserToTargetBytes = sent, TargetToBrowserBytes = received };
        return factory.Services.GetRequiredService<ActiveConnectionRegistry>().Register(
            new ConnectionGrant(user, target, new(Guid.NewGuid(), 1, "operator", false)),
            new("123456789", Convert.ToBase64String(new byte[32])), DateTime.UtcNow.AddMinutes(-5), ip, progress);
    }

    // 管理員看到所有作用中連線及其使用者、目標、開始時間、來源 IP 與流量；非管理員 403 且不含資料。
    [Fact]
    public async Task AdminListsActiveConnections()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var bob = await AuthIntegrationTests.SeedAsync(factory, "bob", "operator");
        var first = await SeedTargetAsync(factory, alice, "會計部-01");
        var second = await SeedTargetAsync(factory, bob, "研發-建置機");
        using var aliceLease = Register(factory, alice, first, "192.0.2.10", 100, 2000);
        using var bobLease = Register(factory, bob, second, "192.0.2.20", 5, 50);
        using var client = await AuditIntegrationTests.LoginAsync(factory, "admin");
        using var response = await client.GetAsync("/api/v1/connections");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var items = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        var row = items.Single(item => item.GetProperty("id").GetGuid() == aliceLease.Id);
        Assert.Equal("alice", row.GetProperty("user_name").GetString());
        Assert.Equal("會計部-01", row.GetProperty("target_name").GetString());
        Assert.Equal("192.0.2.10", row.GetProperty("source_ip").GetString());
        Assert.Equal(100, row.GetProperty("bytes_sent").GetInt64());
        Assert.Equal(2000, row.GetProperty("bytes_received").GetInt64());
        Assert.InRange(row.GetProperty("started_at").GetDateTime(), DateTime.UtcNow.AddMinutes(-6), DateTime.UtcNow);
        using var operatorClient = await AuditIntegrationTests.LoginAsync(factory, "alice");
        using var denied = await operatorClient.GetAsync("/api/v1/connections");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.DoesNotContain("192.0.2.10", await denied.Content.ReadAsStringAsync());
    }

    // 管理員強制中斷：lease 以 Terminated 結束，另寫一筆由管理員發起、對象為被中斷使用者的稽核；已結束或不存在為 404；非管理員 403。
    [Fact]
    public async Task AdminTerminatesConnection()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var target = await SeedTargetAsync(factory, alice, "會計部-01");
        using var lease = Register(factory, alice, target, "192.0.2.10", 0, 0);
        using var other = Register(factory, alice, target, "192.0.2.11", 0, 0);
        using var operatorClient = await AuditIntegrationTests.LoginAsync(factory, "alice");
        using var denied = await operatorClient.PostAsJsonAsync($"/api/v1/connections/{lease.Id}/terminate", new { });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.False(lease.Revoked);
        using var client = await AuditIntegrationTests.LoginAsync(factory, "admin");
        using var terminated = await client.PostAsJsonAsync($"/api/v1/connections/{lease.Id}/terminate", new { });
        Assert.Equal(HttpStatusCode.NoContent, terminated.StatusCode);
        Assert.True(lease.Revoked);
        Assert.Equal(ConnectionEndReason.Terminated, lease.EndReason);
        Assert.False(other.Revoked);
        lease.Dispose();
        using var gone = await client.PostAsJsonAsync($"/api/v1/connections/{lease.Id}/terminate", new { });
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
        using var unknown = await client.PostAsJsonAsync($"/api/v1/connections/{Guid.NewGuid()}/terminate", new { });
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var audit = await database.AuditLogs.SingleAsync(log => log.Action == "ConnectionTerminated");
        Assert.Equal(admin, audit.UserId);
        Assert.Equal("user", audit.ObjectType);
        Assert.Equal(alice, audit.ObjectId);
        Assert.Equal("Success", audit.Result);
    }
}
