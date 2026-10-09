using System.Net;
using System.Net.Sockets;
using RdWeb.Api.RustDesk;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class ConnectionProbeTests
{
    // Probe只固定已核准IP，真實socket可通但不讀／送協定資料。
    [Fact]
    public async Task ConnectsPinnedIpWithoutASecondDnsLookup()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        try
        {
            var resolver = new TestResolver([IPAddress.Loopback]);
            var probe = new ConnectionProbe(new ApprovedHostResolver(resolver));
            var result = await probe.CheckAsync(new("fixture.example", ((IPEndPoint)listener.LocalEndpoint).Port), true);
            Assert.Equal("reachable", result.Status); Assert.Equal(1, resolver.Calls);
            using var client = await listener.AcceptTcpClientAsync();
            var buffer = new byte[1];
            Assert.Equal(0, await client.GetStream().ReadAsync(buffer));
        }
        finally { listener.Stop(); }
    }

    // 混合安全／危險DNS結果不可只挑安全IP，後續rebinding也重新驗證。
    [Fact]
    public async Task RejectsMixedAndChangedResolution()
    {
        var resolver = new TestResolver([IPAddress.Parse("8.8.8.8"), IPAddress.Parse("169.254.169.254")]);
        var approved = new ApprovedHostResolver(resolver);
        var exception = await Assert.ThrowsAsync<AuthException>(() => approved.ResolveAsync(new("fixture.example", 21116), true, default));
        Assert.Equal("address_blocked", exception.Code);
        resolver.Addresses = [IPAddress.Parse("8.8.8.8")];
        Assert.Single(await approved.ResolveAsync(new("fixture.example", 21116), false, default));
        resolver.Addresses = [IPAddress.Parse("100.100.100.200")];
        await Assert.ThrowsAsync<AuthException>(() => approved.ResolveAsync(new("fixture.example", 21116), true, default));
        Assert.Equal(3, resolver.Calls);
    }
    // 真正listener停止後回unreachable，caller取消不被誤報為成功。
    [Fact]
    public async Task ClosedPortAndCancellationAreHandled()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        var probe = new ConnectionProbe(new ApprovedHostResolver(new TestResolver([IPAddress.Loopback])));
        Assert.Equal("unreachable", (await probe.CheckAsync(new("127.0.0.1", port), true)).Status);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => probe.CheckAsync(new("127.0.0.1", port), true, new CancellationToken(true)));
    }
    // DNS無回應也受同一總deadline約束，不能永久佔用probe slot。
    [Fact]
    public async Task StalledDnsReturnsTimeout()
    {
        var probe = new ConnectionProbe(new ApprovedHostResolver(new StalledResolver()));
        var result = await probe.CheckAsync(new("stalled.example", 21116), false);
        Assert.Equal("timeout", result.Status);
        Assert.InRange(result.LatencyMilliseconds, 2500, 6000);
    }
    private sealed class StalledResolver : IHostResolver
    {
        // 只有取消會結束模擬DNS，不用外部網路。
        public async Task<IPAddress[]> ResolveAsync(string host, CancellationToken cancellationToken)
        { await Task.Delay(Timeout.Infinite, cancellationToken); return []; }
    }
    private sealed class TestResolver(IPAddress[] addresses) : IHostResolver
    {
        public IPAddress[] Addresses { get; set; } = addresses;
        public int Calls { get; private set; }
        // 每次lookup回傳可變fixture以重現rebinding，沒有網路或私密日誌。
        public Task<IPAddress[]> ResolveAsync(string host, CancellationToken cancellationToken) { Calls++; return Task.FromResult(Addresses); }
    }
}
