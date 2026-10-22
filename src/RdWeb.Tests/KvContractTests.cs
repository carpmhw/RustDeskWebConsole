using Microsoft.Extensions.Configuration;
using RdWeb.Api.Configuration;
using RdWeb.Api.Infrastructure.Kv;
using StackExchange.Redis;

namespace RdWeb.Tests;

// 真實時鐘的 TTL 邊界與高 CPU 的 Argon2id 等案例隔離；不改正式期限或案例內的並行競爭。
[CollectionDefinition("KvContractTiming", DisableParallelization = true)]
public sealed class KvContractTimingCollection
{
}

[Collection("KvContractTiming")]
public sealed class KvContractTests
{
    // 一百個並發取出者只允許一人取得原本的值。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TakeOnceHasExactlyOneWinner(bool redis)
    {
        await using var fixture = await StoreFixture.CreateAsync(redis);
        var store = fixture.Store;
        await store.SetWithTtlAsync("ticket:fixture", "public-fixture", TimeSpan.FromSeconds(10));
        var results = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => Task.Run(() => store.TakeOnceAsync("ticket:fixture"))));
        Assert.Single(results, value => value == "public-fixture");
    }

    // 重播保護競爭只能有一個勝者，並發遞增不得遺失任何更新。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SetIfAbsentAndCountersAreAtomic(bool redis)
    {
        await using var fixture = await StoreFixture.CreateAsync(redis);
        var store = fixture.Store;
        var winners = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => Task.Run(() => store.SetIfAbsentWithTtlAsync("totp:fixture", "used", TimeSpan.FromSeconds(10)))));
        Assert.Single(winners, winner => winner);
        var counts = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => Task.Run(() => store.IncrementAsync("conn:all"))));
        Assert.Equal(Enumerable.Range(1, 100).Select(value => (long)value), counts.Order());
        for (var index = 0; index < 101; index++) await store.DecrementAsync("conn:all");
        Assert.Equal("0", await store.GetAsync("conn:all"));
        Assert.Equal(0, await store.DecrementAsync("missing"));
        Assert.Null(await store.GetAsync("missing"));
    }

    // 遞增與遞減不得延長原始固定視窗，過期後可建立新視窗。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExpiryAndFixedWindowsMatch(bool redis)
    {
        await using var fixture = await StoreFixture.CreateAsync(redis);
        var store = fixture.Store;
        var ttl = TimeSpan.FromSeconds(2);
        await store.SetWithTtlAsync("ticket:expired", "fixture", ttl);
        Assert.Equal(1, await store.IncrementAsync("rl:fixture", ttl));
        await Task.Delay(800);
        Assert.Equal(2, await store.IncrementAsync("rl:fixture", ttl));
        Assert.Equal(1, await store.DecrementAsync("rl:fixture"));
        await Task.Delay(1400);
        Assert.Null(await store.TakeOnceAsync("ticket:expired"));
        Assert.Null(await store.GetAsync("rl:fixture"));
        Assert.Equal(1, await store.IncrementAsync("rl:fixture", ttl));
        Assert.True(await store.SetIfAbsentWithTtlAsync("ticket:expired", "new", ttl));
        await store.SetWithTtlAsync("ticket:expired", "replacement", ttl);
        Assert.Equal("replacement", await store.GetAsync("ticket:expired"));
    }

    // 重設只清連線計數；取消與錯誤 TTL 不得建立資料。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ResetAndInputValidationPreserveOtherKeys(bool redis)
    {
        await using var fixture = await StoreFixture.CreateAsync(redis);
        var store = fixture.Store;
        await store.IncrementAsync("conn:all");
        await store.IncrementAsync("conn:user");
        await store.SetWithTtlAsync("ticket:keep", "fixture", TimeSpan.FromSeconds(10));
        await store.ResetConnectionCountsAsync();
        Assert.Null(await store.GetAsync("conn:all"));
        Assert.Null(await store.GetAsync("conn:user"));
        Assert.Equal("fixture", await store.GetAsync("ticket:keep"));
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => store.SetWithTtlAsync("bad", "value", TimeSpan.Zero));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => store.IncrementAsync("cancelled", cancellationToken: new CancellationToken(true)));
        Assert.Null(await store.GetAsync("cancelled"));
    }

    // 兩個實作都拒絕非標準計數值，錯誤不得修改原值；大整數不能失去精度。
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InvalidCountersAreUnchangedAndLargeIntegersStayExact(bool redis)
    {
        await using var fixture = await StoreFixture.CreateAsync(redis);
        var store = fixture.Store;
        foreach (var value in new[] { "01", "-1", "not-a-counter" })
        {
            await store.SetWithTtlAsync("counter:invalid", value, TimeSpan.FromSeconds(10));
            await Assert.ThrowsAnyAsync<Exception>(() => store.IncrementAsync("counter:invalid"));
            Assert.Equal(value, await store.GetAsync("counter:invalid"));
            await Assert.ThrowsAnyAsync<Exception>(() => store.DecrementAsync("counter:invalid"));
            Assert.Equal(value, await store.GetAsync("counter:invalid"));
        }
        await store.SetWithTtlAsync("counter:large", "9007199254740992", TimeSpan.FromSeconds(10));
        Assert.Equal(9007199254740993, await store.IncrementAsync("counter:large"));
        Assert.Equal(9007199254740992, await store.DecrementAsync("counter:large"));
        await store.SetWithTtlAsync("counter:overflow", long.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture), TimeSpan.FromSeconds(10));
        await Assert.ThrowsAnyAsync<Exception>(() => store.IncrementAsync("counter:overflow"));
        Assert.Equal(long.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture), await store.GetAsync("counter:overflow"));
    }

    // 可控制時鐘驗證閒置過期項目被清理及零期限的精確邊界。
    [Fact]
    public async Task MemoryCleanupUsesInjectedClock()
    {
        var clock = new ManualClock();
        var store = new MemoryKvStore(clock);
        await store.SetWithTtlAsync("expired", "fixture", TimeSpan.FromSeconds(1));
        await store.IncrementAsync("conn:keep");
        clock.Now += TimeSpan.FromSeconds(1);
        Assert.Equal(1, store.SweepExpired());
        Assert.Null(await store.GetAsync("expired"));
        Assert.Equal("1", await store.GetAsync("conn:keep"));
    }

    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        // 測試明確推進 UTC，不依靠等待排程。
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class StoreFixture(IKvStore store, IConnectionMultiplexer? connection) : IAsyncDisposable
    {
        public IKvStore Store { get; } = store;
        // Redis 必須實際提供服務；未設定時明確失敗而非略過驗收。
        public static async Task<StoreFixture> CreateAsync(bool redis)
        {
            if (!redis) return new(new MemoryKvStore(), null);
            var url = Environment.GetEnvironmentVariable("TEST_REDIS_URL");
            Assert.False(string.IsNullOrEmpty(url), "真實 Redis 契約需要 TEST_REDIS_URL。");
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["REDIS_URL"] = url }).Build();
            var connection = await ConnectionMultiplexer.ConnectAsync(KvOptions.FromConfiguration(configuration).Redis!);
            return new(new RedisKvStore(connection, "rdweb-test:" + Guid.NewGuid() + ":"), connection);
        }
        // 測試使用獨立前綴，完成後清理所有殘留的無期限計數與連線。
        public async ValueTask DisposeAsync()
        {
            await Store.ResetConnectionCountsAsync();
            if (connection != null) await connection.DisposeAsync();
        }
    }
}
