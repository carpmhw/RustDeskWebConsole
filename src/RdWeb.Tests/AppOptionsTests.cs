using Microsoft.Extensions.Configuration;
using RdWeb.Api.Configuration;

namespace RdWeb.Tests;

public sealed class AppOptionsTests
{
    // 拒絕可能被不同層解讀成不同資源的路徑，包含全斜線與雙結尾斜線。
    [Theory]
    [InlineData("//")]
    [InlineData("/a//")]
    [InlineData("/a/../b")]
    [InlineData("/a?query")]
    [InlineData("relative")]
    public void AmbiguousBasePathsAreRejected(string path)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["APP_BASE_PATH"] = path }).Build();
        Assert.Throws<InvalidOperationException>(() => AppOptions.FromConfiguration(configuration));
    }
}
