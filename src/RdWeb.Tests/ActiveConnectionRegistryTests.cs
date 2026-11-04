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

    // Terminate只取消符合條件的lease並回傳筆數，重複終止與釋放後終止皆無副作用。
    [Fact]
    public void TerminateCancelsOnlyMatchingLeasesOnce()
    {
        var registry = new ActiveConnectionRegistry();
        var peer = new VerifiedPeerIdentity("123456789", Convert.ToBase64String(new byte[32]));
        var revokedUser = Guid.NewGuid();
        var grant = new ConnectionGrant(revokedUser, Guid.NewGuid(), new(Guid.NewGuid(), 1, "operator", false));
        using var first = registry.Register(grant, peer);
        using var second = registry.Register(grant with { TargetId = Guid.NewGuid() }, peer);
        using var unrelated = registry.Register(grant with { UserId = Guid.NewGuid() }, peer);
        var released = registry.Register(grant, peer);
        released.Dispose();

        Assert.Equal(2, registry.Terminate(candidate => candidate.UserId == revokedUser));
        Assert.True(first.RevocationToken.IsCancellationRequested && first.Revoked);
        Assert.True(second.RevocationToken.IsCancellationRequested && second.Revoked);
        Assert.False(unrelated.RevocationToken.IsCancellationRequested || unrelated.Revoked);
        Assert.False(released.Revoked);
        // 終止不移除entry，slot仍由coordinator收尾時dispose釋放。
        Assert.Equal(3, registry.Count);
        Assert.Equal(0, registry.Terminate(candidate => candidate.UserId == revokedUser));
        first.Dispose(); first.Dispose();
        Assert.Equal(0, registry.Terminate(candidate => candidate.UserId == revokedUser));
        Assert.Equal(2, registry.Count);
    }

    // 已釋放的lease不得被終止，也不得因釋放後取消而拋出例外。
    [Fact]
    public void DisposedLeaseIsNeverRevoked()
    {
        var registry = new ActiveConnectionRegistry();
        var grant = new ConnectionGrant(Guid.NewGuid(), Guid.NewGuid(), new(Guid.NewGuid(), 1, "operator", false));
        var lease = registry.Register(grant, new("123456789", Convert.ToBase64String(new byte[32])));
        lease.Dispose();
        Assert.Equal(0, registry.Terminate(_ => true));
        Assert.False(lease.Revoked);
        Assert.Equal(0, registry.Count);
    }
}
