using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.RustDesk;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class ConnectionTicketTests
{
    // ticket發出後logout撤銷family，仍active的user也不能消耗舊ticket。
    [Fact]
    public async Task RevokedLoginFamilyCannotConsumeTicket()
    {
        await using var factory = new TestApplicationFactory();
        var setup = await CreateOwnerTargetAsync(factory, "123456789");
        using var owner = setup.Owner;
        var issued = await IssueTicketAsync(owner, setup.TargetId);
        await using (var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            foreach (var token in await db.RefreshTokens.ToListAsync()) token.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        await using var scope = factory.Services.CreateAsyncScope();
        await Assert.ThrowsAsync<AuthException>(() => scope.ServiceProvider.GetRequiredService<ConnectionTicketService>()
            .ConsumeAsync(setup.TargetId, issued.Ticket, CancellationToken.None));
    }

    // Owner只能取得短效、不含target metadata的單次連線ticket。
    [Fact]
    public async Task OwnerIssueReturnsOpaqueThirtySecondTicket()
    {
        await using var factory = new TestApplicationFactory();
        var setup = await CreateOwnerTargetAsync(factory, "123456789");
        using var owner = setup.Owner;

        var issued = await IssueTicketAsync(owner, setup.TargetId);

        Assert.Equal(30, issued.ExpiresIn);
        Assert.Equal(43, issued.Ticket.Length);
    }

    // 隱藏target回404，可見viewer或停用server均不能建立連線票證。
    [Fact]
    public async Task HiddenViewerAndDisabledServerCannotIssueTicket()
    {
        await using var factory = new TestApplicationFactory();
        var setup = await CreateOwnerTargetAsync(factory, "123456789");
        using var owner = setup.Owner;
        using var peer = await TargetIntegrationTests.LoginAsync(factory, "peer", "operator");
        using var viewer = await TargetIntegrationTests.LoginAsync(factory, "reader", "viewer");
        var viewerId = await GetUserIdAsync(factory, "reader");
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            database.TargetPermissions.Add(new TargetPermission
            {
                TargetId = setup.TargetId,
                UserId = viewerId,
                CanConnect = false,
                CanViewPassword = false,
                CanEdit = false
            });
            await database.SaveChangesAsync();
        }

        using var hidden = await peer.PostAsJsonAsync($"/api/v1/targets/{setup.TargetId}/connect-ticket", new { });
        using var viewerDenied = await viewer.PostAsJsonAsync($"/api/v1/targets/{setup.TargetId}/connect-ticket", new { });
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, viewerDenied.StatusCode);

        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            var server = await database.RustDeskServers.SingleAsync(item => item.Id == setup.ServerId);
            server.Enabled = false;
            await database.SaveChangesAsync();
        }
        using var disabled = await owner.PostAsJsonAsync($"/api/v1/targets/{setup.TargetId}/connect-ticket", new { });
        Assert.Equal(HttpStatusCode.Forbidden, disabled.StatusCode);
    }

    // Browser不得透過ticket request覆寫管理員保存的hbbs或hbbr目的位址。
    [Fact]
    public async Task TicketRequestRejectsClientSuppliedUpstreamEndpoints()
    {
        await using var factory = new TestApplicationFactory();
        var setup = await CreateOwnerTargetAsync(factory, "123456789");
        using var owner = setup.Owner;

        using var response = await owner.PostAsJsonAsync($"/api/v1/targets/{setup.TargetId}/connect-ticket", new
        {
            id_server = "169.254.169.254:80",
            relay_server = "169.254.169.254:80",
            transport = "tcp"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // 同一ticket只允許一個原子消耗者，且route target必須與票證binding一致。
    [Fact]
    public async Task TicketConsumptionIsBoundAndAtomic()
    {
        await using var factory = new TestApplicationFactory();
        var setup = await CreateOwnerTargetAsync(factory, "123456789");
        using var owner = setup.Owner;
        var issued = await IssueTicketAsync(owner, setup.TargetId);
        var secondTarget = await CreateTargetAsync(owner, setup.ServerId, "987654321");
        await using var scope = factory.Services.CreateAsyncScope();
        var tickets = scope.ServiceProvider.GetRequiredService<ConnectionTicketService>();

        await Assert.ThrowsAsync<AuthException>(() => tickets.ConsumeAsync(secondTarget, issued.Ticket, CancellationToken.None));
        var replay = await Assert.ThrowsAsync<AuthException>(() => tickets.ConsumeAsync(setup.TargetId, issued.Ticket, CancellationToken.None));
        Assert.Equal("unauthorized", replay.Code);

        var nextTicket = await IssueTicketAsync(owner, setup.TargetId);
        var attempts = await Task.WhenAll(
            TryConsumeAsync(tickets, setup.TargetId, nextTicket.Ticket),
            TryConsumeAsync(tickets, setup.TargetId, nextTicket.Ticket));
        Assert.Equal(1, attempts.Count(result => result));
    }

    // KV expiry後即使ticket字串正確也不能消耗或建立grant。
    [Fact]
    public async Task TicketExpiresAfterThirtySeconds()
    {
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = CreateFactory(clock);
        var setup = await CreateOwnerTargetAsync(factory, "123456789");
        using var owner = setup.Owner;
        var issued = await IssueTicketAsync(owner, setup.TargetId);
        clock.Advance(TimeSpan.FromSeconds(31));
        await using var scope = factory.Services.CreateAsyncScope();
        var tickets = scope.ServiceProvider.GetRequiredService<ConnectionTicketService>();

        var expired = await Assert.ThrowsAsync<AuthException>(() => tickets.ConsumeAsync(setup.TargetId, issued.Ticket, CancellationToken.None));

        Assert.Equal("unauthorized", expired.Code);
    }

    // 使用可控UTC時鐘驗證TTL，不更動production ticket期限。
    private static TestApplicationFactory CreateFactory(ManualTimeProvider? clock = null)
        => new(builder =>
        {
            if (clock == null) return;
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(clock);
            });
        });

    // 透過正式owner API登入並建立server與target fixture。
    private static async Task<(Guid ServerId, Guid TargetId, HttpClient Owner)> CreateOwnerTargetAsync(TestApplicationFactory factory, string rustdeskId)
    {
        var serverId = await TargetIntegrationTests.SeedServerAsync(factory);
        var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        var targetId = await CreateTargetAsync(owner, serverId, rustdeskId);
        return (serverId, targetId, owner);
    }

    // 以真實target create API取得UUID，不直接寫入production service狀態。
    private static async Task<Guid> CreateTargetAsync(HttpClient owner, Guid serverId, string rustdeskId)
    {
        using var response = await owner.PostAsJsonAsync("/api/v1/targets", new
        {
            server_id = serverId,
            name = "ticket-fixture-" + rustdeskId,
            rustdesk_id = rustdeskId
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    // 發票證只讀安全DTO欄位，ticket內容不進 assertion message。
    private static async Task<(string Ticket, int ExpiresIn)> IssueTicketAsync(HttpClient client, Guid targetId)
    {
        using var response = await client.PostAsJsonAsync($"/api/v1/targets/{targetId}/connect-ticket", new { });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return (json.GetProperty("ticket").GetString()!, json.GetProperty("expires_in").GetInt32());
    }

    // 只回傳單次消耗是否成功，不輸出票證或grant內容。
    private static async Task<bool> TryConsumeAsync(ConnectionTicketService service, Guid targetId, string ticket)
    {
        try
        {
            _ = await service.ConsumeAsync(targetId, ticket, CancellationToken.None);
            return true;
        }
        catch (AuthException)
        {
            return false;
        }
    }

    // 依隔離DB查出測試user UUID供ACL fixture使用。
    private static async Task<Guid> GetUserIdAsync(TestApplicationFactory factory, string username)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        return await database.Users.Where(user => user.Username == username).Select(user => user.Id).SingleAsync();
    }

    private sealed class ManualTimeProvider(DateTimeOffset initialTime) : TimeProvider
    {
        private DateTimeOffset _now = initialTime;

        // 回傳測試控制的UTC時間供token與KV expiry共用。
        public override DateTimeOffset GetUtcNow() => _now;

        // 前進測試時間，不等待真實wall clock。
        public void Advance(TimeSpan duration) => _now += duration;
    }
}
