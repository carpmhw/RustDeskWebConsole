using System.Net;
using RdWeb.Api.RustDesk;

namespace RdWeb.Tests;

public sealed class ServerAddressTests
{
    // 模糊格式、URL與metadata別名不能成為已保存目的地。
    [Theory]
    [InlineData("http://server.example:80/path")]
    [InlineData("user@server.example:80")]
    [InlineData("127.1:21116")]
    [InlineData("0x7f000001:21116")]
    [InlineData("server.example:0")]
    [InlineData("server.example:65536")]
    [InlineData("metadata.google.internal:80")]
    [InlineData("[fe80::1%2]:21116")]
    [InlineData("server.example:21116/path")]
    public void RejectsAmbiguousEndpoints(string input) => Assert.Throws<ArgumentException>(() => ServerEndpoint.Parse(input));

    // 主機名大小寫及IPv6表示會正規化，不丟失port。
    [Fact]
    public void NormalizesValidEndpoints()
    {
        Assert.Equal(new ServerEndpoint("server.example", 21116), ServerEndpoint.Parse("SERVER.EXAMPLE:21116"));
        Assert.Equal(new ServerEndpoint("2001:db8::1", 21117), ServerEndpoint.Parse("[2001:db8::1]:21117"));
    }

    // Metadata／mapped／link-local不得因允許私網而通過。
    [Theory]
    [InlineData("169.254.169.254")]
    [InlineData("::ffff:169.254.169.254")]
    [InlineData("100.100.100.200")]
    [InlineData("168.63.129.16")]
    [InlineData("fd00:ec2::254")]
    [InlineData("fe80::1")]
    [InlineData("224.0.0.1")]
    [InlineData("0.0.0.0")]
    public void AlwaysBlocksUnsafeAddresses(string input) => Assert.False(AddressPolicy.IsAllowed(IPAddress.Parse(input), true));

    // Private需要逐筆允許，公開位址不依賴該選項。
    [Fact]
    public void RequiresExplicitPrivatePermission()
    {
        foreach (var input in new[] { "127.0.0.1", "10.1.2.3", "192.168.50.1", "::1", "fd12::1" })
        {
            Assert.False(AddressPolicy.IsAllowed(IPAddress.Parse(input), false));
            Assert.True(AddressPolicy.IsAllowed(IPAddress.Parse(input), true));
        }
        Assert.True(AddressPolicy.IsAllowed(IPAddress.Parse("8.8.8.8"), false));
    }
}
