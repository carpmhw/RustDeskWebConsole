using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using Google.Protobuf;
using Hbb;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSec.Cryptography;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class ConnectionEndReasonTests
{
    // 建立一條串流中的連線，執行 act 後等待 coordinator 結束，回傳瀏覽器 socket 與該連線的結束稽核。
    private async Task<(RelayBridgeTests.ScriptSocket Browser, AuditLog Ended, bool ReconnectBlocked)> StreamThenAsync(
        Func<ActiveConnectionRegistry, ConnectionGrantContext, Task> act, LongTimerClock? clock = null, int? maxHours = null,
        string? hourSeconds = null)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var hbbs = new TcpListener(IPAddress.Loopback, 0);
        using var hbbr = new TcpListener(IPAddress.Loopback, 0);
        hbbs.Start(); hbbr.Start();
        using var signingKey = Key.Create(SignatureAlgorithm.Ed25519);
        var peerMessage = new Message { SignedId = new SignedId { Id = ByteString.CopyFrom(new byte[] { 1, 2, 3 }) } }.ToByteArray();
        var hbbsTask = ConnectionCoordinatorTests.ServeHbbsAsync(hbbs, signingKey, "123456789", "12345678-1234-4234-8234-123456789abc",
            new(TaskCreationOptions.RunContinuationsAsynchronously), new(TaskCreationOptions.RunContinuationsAsynchronously), timeout.Token);
        var hbbrTask = Task.Run(async () =>
        {
            // 送出首個畫面後保持開啟，直到 coordinator 釋放上游。
            using var client = await hbbr.AcceptTcpClientAsync(timeout.Token);
            var stream = client.GetStream();
            _ = await RustDeskByteStreamCodec.ReadControlFrameAsync(stream, timeout.Token);
            await RustDeskByteStreamCodec.WriteControlFrameAsync(stream, peerMessage, timeout.Token);
            try { while (await stream.ReadAsync(new byte[64], timeout.Token) > 0) { } } catch (IOException) { }
        }, timeout.Token);
        var setup = await ConnectionCoordinatorTests.CreateGrantAsync(hbbs, hbbr, Convert.ToBase64String(signingKey.PublicKey.Export(KeyBlobFormat.RawPublicKey)),
            builder =>
            {
                if (clock != null) builder.ConfigureServices(services => services.AddSingleton<TimeProvider>(clock));
                if (hourSeconds != null) builder.UseSetting(ConnectionPolicy.TestHourSecondsKey, hourSeconds);
            });
        await using var factory = setup.Factory;
        if (maxHours != null)
        {
            await using var settings = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
            settings.SystemSettings.Add(new SystemSetting { Key = ConnectionPolicy.MaxHoursKey, Value = maxHours.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            await settings.SaveChangesAsync();
        }
        var registry = factory.Services.GetRequiredService<ActiveConnectionRegistry>();
        var browser = new RelayBridgeTests.ScriptSocket(abortOnCancel: true);
        if (clock != null) clock.Armed = true;
        await using var scope = factory.Services.CreateAsyncScope();
        var run = scope.ServiceProvider.GetRequiredService<ConnectionCoordinator>().RunAsync(setup.Grant, browser, CancellationToken.None, "203.0.113.5");
        Assert.Equal(WebSocketMessageType.Text, (await browser.Output.Reader.ReadAsync(timeout.Token)).Type);
        Assert.Equal(WebSocketMessageType.Binary, (await browser.Output.Reader.ReadAsync(timeout.Token)).Type);
        await act(registry, new(setup.Grant.UserId, browser));
        await run.WaitAsync(timeout.Token);
        await Task.WhenAll(hbbsTask, hbbrTask);
        var blocked = await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.Kv.IKvStore>()
            .GetAsync(ConnectionTicketService.EndedKey(setup.Grant.Session!.FamilyId, setup.Grant.TargetId)) != null;
        LastSeen = await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.Kv.IKvStore>()
            .GetAsync(RdWeb.Api.Security.SessionService.SeenKey(setup.Grant.Session!.FamilyId));
        await factory.Services.GetRequiredService<AuditWriter>().StopAsync(timeout.Token);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        return (browser, await database.AuditLogs.SingleAsync(log => log.Action == "ConnectionEnded"), blocked);
    }

    // 系統時鐘，但一分鐘以上的計時器改由測試手動觸發；短計時器（例如 relay 延遲）照常由系統執行。
    internal sealed class LongTimerClock : TimeProvider
    {
        public List<ManualTimer> Timers { get; } = [];
        // 主機啟動時的背景服務（例如每日稽核清除）不攔截；開始建立連線前才啟用。
        public bool Armed { get; set; }
        // 啟用後的長計時器交給測試，其餘委派系統。
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            if (!Armed || dueTime < TimeSpan.FromMinutes(1)) return System.CreateTimer(callback, state, dueTime, period);
            var timer = new ManualTimer(callback, state, dueTime);
            lock (Timers) Timers.Add(timer);
            return timer;
        }
    }

    // 由測試觸發的計時器；記錄到期時間供斷言。
    internal sealed class ManualTimer(TimerCallback callback, object? state, TimeSpan dueTime) : ITimer
    {
        public TimeSpan DueTime { get; private set; } = dueTime;
        public bool Disposed { get; private set; }
        // 立即執行回呼，模擬時間已到。
        public void Fire() { if (!Disposed) callback(state); }
        // 變更到期時間。
        public bool Change(TimeSpan dueTime, TimeSpan period) { DueTime = dueTime; return !Disposed; }
        // 釋放後不再觸發。
        public void Dispose() => Disposed = true;
        // 非同步釋放。
        public ValueTask DisposeAsync() { Disposed = true; return ValueTask.CompletedTask; }
    }

    // 時間上限到期：以 4001 關閉、稽核原因 Expired；計時長度取自連線建立時的設定。
    [Fact]
    public async Task MaxDurationExpiresWithTimeLimitClose()
    {
        var clock = new LongTimerClock();
        var (browser, ended, _) = await StreamThenAsync((_, _) =>
        {
            ManualTimer timer;
            lock (clock.Timers) timer = Assert.Single(clock.Timers);
            Assert.Equal(TimeSpan.FromHours(1), timer.DueTime);
            timer.Fire();
            return Task.CompletedTask;
        }, clock, maxHours: 1);
        Assert.Equal((WebSocketCloseStatus)4001, browser.SentCloseStatus);
        Assert.Contains("\"Expired\"", ended.Detail);
    }

    // 上限為 0 時不建立計時器；未設定時預設 8 小時。
    [Theory]
    [InlineData(0, null)]
    [InlineData(null, 8)]
    public async Task MaxDurationSettingControlsTimer(int? setting, int? expectedHours)
    {
        var clock = new LongTimerClock();
        await StreamThenAsync((registry, context) =>
        {
            lock (clock.Timers)
            {
                if (expectedHours == null) Assert.Empty(clock.Timers);
                else Assert.Equal(TimeSpan.FromHours(expectedHours.Value), Assert.Single(clock.Timers).DueTime);
            }
            registry.Terminate(grant => grant.UserId == context.UserId);
            return Task.CompletedTask;
        }, clock, setting);
    }

    // 測試 stack 可把時間上限的「1 小時」縮短：協調器的計時長度依該單位計算。
    [Fact]
    public async Task MaxDurationUsesShortenedHourInTestStack()
    {
        var clock = new LongTimerClock();
        await StreamThenAsync((registry, context) =>
        {
            lock (clock.Timers) Assert.Equal(TimeSpan.FromSeconds(240), Assert.Single(clock.Timers).DueTime);
            registry.Terminate(grant => grant.UserId == context.UserId);
            return Task.CompletedTask;
        }, clock, maxHours: 2, hourSeconds: "120");
    }

    // 縮短單位只在 Development 生效；Production、缺少或範圍外的值都維持 1 小時，不放寬正式行為。
    [Theory]
    [InlineData("Development", "20", 20)]
    [InlineData("Development", null, 3600)]
    [InlineData("Development", "0", 3600)]
    [InlineData("Development", "3601", 3600)]
    [InlineData("Development", "abc", 3600)]
    [InlineData("Production", "20", 3600)]
    public void HourUnitIsShortenedOnlyInDevelopment(string environment, string? value, int expectedSeconds)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(value == null ? [] : [new(ConnectionPolicy.TestHourSecondsKey, value)]).Build();
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), ConnectionPolicy.HourUnit(environment == "Development", configuration));
    }

    // 最近一次 StreamThenAsync 結束後，該 session 的最近使用時間（連線結束時寫入）。
    private string? LastSeen { get; set; }

    // 連線結束（不論原因）時記錄 session 的最近使用時間，供網頁閒置登出判斷。
    [Fact]
    public async Task ConnectionEndRecordsSessionLastSeen()
    {
        var before = DateTime.UtcNow;
        await StreamThenAsync((registry, context) =>
        {
            registry.Terminate(grant => grant.UserId == context.UserId);
            return Task.CompletedTask;
        });
        Assert.NotNull(LastSeen);
        var seen = DateTime.Parse(LastSeen, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal);
        Assert.InRange(seen, before, DateTime.UtcNow);
    }

    // 測試用的連線上下文：使用者與瀏覽器 socket。
    internal sealed record ConnectionGrantContext(Guid UserId, RelayBridgeTests.ScriptSocket Browser);

    // 撤銷、到期與強制中斷各以專屬代碼關閉瀏覽器並記錄對應原因。
    [Theory]
    [InlineData(ConnectionEndReason.Revoked, 1008, "access revoked", "Revoked", false)]
    [InlineData(ConnectionEndReason.Expired, 4001, "time limit", "Expired", true)]
    [InlineData(ConnectionEndReason.Terminated, 4002, "terminated", "Terminated", true)]
    public async Task EndReasonSelectsCloseCodeAndAuditReason(ConnectionEndReason reason, int code, string description, string audit, bool blocksReconnect)
    {
        var (browser, ended, blocked) = await StreamThenAsync((registry, context) =>
        {
            Assert.Equal(1, registry.Terminate(grant => grant.UserId == context.UserId, reason));
            return Task.CompletedTask;
        });
        Assert.Equal((WebSocketCloseStatus)code, browser.SentCloseStatus);
        Assert.Equal(description, browser.SentCloseDescription);
        Assert.Equal("Failure", ended.Result);
        Assert.Contains($"\"{audit}\"", ended.Detail);
        // 到期與中斷的對象仍有權限，需擋下誤判為網路中斷的自動重連；撤銷本已無權限。
        Assert.Equal(blocksReconnect, blocked);
    }

    // 協調器登記連線時帶入開始時間、來源 IP 與即時流量，供管理員列表使用。
    [Fact]
    public async Task RegisteredLeaseCarriesListMetadata()
    {
        var before = DateTime.UtcNow;
        await StreamThenAsync((registry, context) =>
        {
            var lease = Assert.Single(registry.Snapshot());
            Assert.Equal("203.0.113.5", lease.SourceIp);
            Assert.InRange(lease.StartedAt, before, DateTime.UtcNow);
            Assert.True(lease.Progress.Snapshot().TargetToBrowserBytes > 0);
            registry.Terminate(grant => grant.UserId == context.UserId);
            return Task.CompletedTask;
        });
    }

    // 瀏覽器以 4003 結束（閒置）時稽核原因為 Idle，屬正常結束。
    [Fact]
    public async Task BrowserIdleCloseIsAuditedAsIdle()
    {
        var (_, ended, _) = await StreamThenAsync((_, context) =>
        {
            context.Browser.Input.Writer.TryWrite(new([], WebSocketMessageType.Close, true, (WebSocketCloseStatus)4003));
            return Task.CompletedTask;
        });
        Assert.Equal("Success", ended.Result);
        Assert.Contains("\"Idle\"", ended.Detail);
    }

    // 同一連線只記錄第一個結束原因，之後的終止不再生效。
    [Fact]
    public void FirstEndReasonWins()
    {
        var registry = new ActiveConnectionRegistry();
        var grant = new RdWeb.Api.Endpoints.ConnectionGrant(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), 1, "operator", false));
        using var lease = registry.Register(grant, new("123456789", Convert.ToBase64String(new byte[32])));
        Assert.Equal(1, registry.Terminate(_ => true, ConnectionEndReason.Terminated));
        Assert.Equal(0, registry.Terminate(_ => true, ConnectionEndReason.Expired));
        Assert.Equal(0, registry.Terminate(_ => true));
        Assert.Equal(ConnectionEndReason.Terminated, lease.EndReason);
    }
}
