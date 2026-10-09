using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.RustDesk;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class ConnectionSlotsTests
{
    // 五個名額取得後第六個拒絕，釋放所有lease後兩種計數均歸零。
    [Fact]
    public async Task SixthConnectionIsRejectedAndLeasesReturnCounts()
    {
        var store = new MemoryKvStore();
        var slots = new ConnectionSlots(store);
        var user = Guid.NewGuid();
        var leases = new List<IAsyncDisposable>();
        try
        {
            for (var index = 0; index < 5; index++) leases.Add(await slots.AcquireAsync(user, CancellationToken.None));
            var denied = await Assert.ThrowsAsync<AuthException>(() => slots.AcquireAsync(user, CancellationToken.None));
            Assert.Equal(429, denied.Status);
            Assert.Equal("5", await store.GetAsync("conn:all"));
            Assert.Equal("5", await store.GetAsync("conn:" + user));
        }
        finally { foreach (var lease in leases) await lease.DisposeAsync(); }
        Assert.Equal("0", await store.GetAsync("conn:all"));
        Assert.Equal("0", await store.GetAsync("conn:" + user));
        // 重複dispose不可扣除另一條連線名額。
        await using var next = await slots.AcquireAsync(user, CancellationToken.None);
        foreach (var lease in leases) await lease.DisposeAsync();
        Assert.Equal("1", await store.GetAsync("conn:all"));
    }

    // 第二個計數故障時必回滾已取得的global count。
    [Fact]
    public async Task UserCounterFailureRollsBackGlobalCount()
    {
        var store = new MemoryKvStore();
        await store.SetWithTtlAsync("conn:" + Guid.Empty, "invalid-counter", TimeSpan.FromMinutes(1));
        await Assert.ThrowsAsync<InvalidOperationException>(() => new ConnectionSlots(store).AcquireAsync(Guid.Empty, CancellationToken.None));
        Assert.Equal("0", await store.GetAsync("conn:all"));
    }
}
