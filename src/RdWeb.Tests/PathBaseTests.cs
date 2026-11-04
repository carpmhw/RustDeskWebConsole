using System.Net;
using System.Net.WebSockets;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api;

namespace RdWeb.Tests;

public sealed class PathBaseTests
{
    // 驗證不同掛載路徑與兩種代理模式的重新導向及 Cookie。
    [Theory]
    [InlineData("", false)]
    [InlineData("", true)]
    [InlineData("/rdweb", false)]
    [InlineData("/rdweb", true)]
    [InlineData("/a/b/c", false)]
    [InlineData("/a/b/c", true)]
    public async Task RedirectAndCookieUseExternalBase(string prefix, bool preserved)
    {
        await using var factory = CreateFactory(prefix);
        using var client = factory.CreateClient(new() { AllowAutoRedirect = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, (preserved ? prefix : "") + "/api/v1/spikes/redirect");
        request.Headers.Add("X-Forwarded-Prefix", prefix.Length == 0 ? "/" : prefix);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("https://tools.example.test" + prefix + "/api/v1/health", response.Headers.Location!.ToString());
        Assert.Contains("path=" + prefix + "/api/v1/auth", response.Headers.GetValues("Set-Cookie").Single());
        Assert.Contains("secure", response.Headers.GetValues("Set-Cookie").Single());
    }

    // 確認前綴不影響 WebSocket 升級與有限的 ready 訊息。
    [Theory]
    [InlineData("", false)]
    [InlineData("/rdweb", false)]
    [InlineData("/rdweb", true)]
    [InlineData("/a/b/c", false)]
    [InlineData("/a/b/c", true)]
    public async Task WebSocketUsesBothPrefixModes(string prefix, bool preserved)
    {
        await using var factory = CreateFactory(prefix);
        var client = factory.Server.CreateWebSocketClient();
        // 在握手中提供與對外網址相符的來源。
        client.ConfigureRequest = request => request.Headers["Origin"] = "https://tools.example.test";
        using var socket = await client.ConnectAsync(new Uri("ws://localhost" + (preserved ? prefix : "") + "/api/v1/spikes/ws"), CancellationToken.None);
        var buffer = new byte[256];
        var result = await socket.ReceiveAsync(buffer, CancellationToken.None);
        Assert.Equal("{\"status\":\"ready\"}", Encoding.UTF8.GetString(buffer, 0, result.Count));
    }

    // 陌生代理無法利用轉送標頭覆寫設定的路徑與協定。
    [Fact]
    public async Task UnknownProxyHeadersAreIgnored()
    {
        await using var factory = CreateFactory("/rdweb", "203.0.113.4");
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/spikes/context");
        request.Headers.Add("X-Forwarded-Prefix", "/evil");
        request.Headers.Add("X-Forwarded-Proto", "https");
        request.Headers.Add("X-Forwarded-Host", "evil.example");
        using var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"pathBase\":\"/rdweb\"", body);
        Assert.Contains("\"scheme\":\"http\"", body);
        Assert.DoesNotContain("evil", body);
    }

    // 正式環境禁止存取 spike 端點。
    [Fact]
    public async Task SpikeEndpointsAreAbsentInProduction()
    {
        await using var factory = CreateFactory("", environment: "Production");
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/v1/spikes/context");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // 非法來源不得建立 WebSocket。
    [Fact]
    public async Task WrongWebSocketOriginIsRejected()
    {
        await using var factory = CreateFactory("/rdweb");
        var client = factory.Server.CreateWebSocketClient();
        // 模擬不受信任網站的瀏覽器握手。
        client.ConfigureRequest = request => request.Headers["Origin"] = "https://evil.example";
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.ConnectAsync(new Uri("ws://localhost/api/v1/spikes/ws"), CancellationToken.None));
    }

    // 在主機建置前注入每個案例的設定與來源 IP。
    internal static WebApplicationFactory<Program> CreateFactory(string prefix, string remoteIp = "127.0.0.1", string environment = "Development")
    {
        return new TestApplicationFactory(builder =>
        {
            builder.UseEnvironment(environment);
            // 模擬啟動時讀取 Docker 環境設定。
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["APP_BASE_PATH"] = prefix.Length == 0 ? "/" : prefix,
                ["APP_PUBLIC_URL"] = "https://tools.example.test" + prefix,
                ["TRUSTED_PROXIES"] = "127.0.0.1",
            }));
            // TestServer 預設沒有來源 IP，以啟動 filter 模擬真實 TCP。
            builder.ConfigureTestServices(services => services.AddSingleton<IStartupFilter>(new RemoteIpFilter(remoteIp)));
        });
    }

    private sealed class RemoteIpFilter(string address) : IStartupFilter
    {
        // 在應用中介軟體前設定測試來源，避免在產品程式碼加入測試分支。
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            // 模擬 Kestrel 取得的遠端 IP。
            app.Use((context, continuation) =>
            {
                context.Connection.RemoteIpAddress = IPAddress.Parse(address);
                return continuation(context);
            });
            next(app);
        };
    }
}
