using RdWeb.Api.Endpoints;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class ActiveConnectionRegistryTests
{
    // 活躍binding只接受相同user、target、family與安全版本，assist僅一個claim成功。
    [Fact]
    public async Task BindingClaimAndDisposeAreAtomic()
    {
        var registry = new ActiveConnectionRegistry();
        var grant = new ConnectionGrant(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), 1, "operator", false));
        using var lease = registry.Register(grant, new("123456789", Convert.ToBase64String(new byte[32])));
        Assert.True(lease.Matches(grant));
        Assert.False(lease.Matches(grant with { UserId = Guid.NewGuid() }));
        Assert.False(lease.Matches(grant with { TargetId = Guid.NewGuid() }));
        Assert.False(lease.Matches(grant with { Session = grant.Session! with { FamilyId = Guid.NewGuid() } }));
        var claims = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => lease.TryClaimAssist())));
        Assert.Equal(1, claims.Count(result => result));
        lease.Dispose(); lease.Dispose();
        Assert.Null(registry.Find(lease.Id)); Assert.False(lease.Matches(grant)); Assert.Equal(0, registry.Count);
    }

    // Registry不得超過全站五個名額，缺少session snapshot也不得建立entry。
    [Fact]
    public void RegistryCapsActiveEntriesAndRequiresSessionBinding()
    {
        var registry = new ActiveConnectionRegistry();
        var grant = new ConnectionGrant(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), 1, "operator", false));
        var peer = new VerifiedPeerIdentity("123456789", Convert.ToBase64String(new byte[32]));
        var leases = new List<ActiveConnectionLease>();
        try
        {
            for (var index = 0; index < 5; index++) leases.Add(registry.Register(grant, peer));
            Assert.Throws<InvalidOperationException>(() => registry.Register(grant, peer));
            Assert.Throws<InvalidOperationException>(() => registry.Register(grant with { Session = null }, peer));
        }
        finally { foreach (var lease in leases) lease.Dispose(); }
    }
}
