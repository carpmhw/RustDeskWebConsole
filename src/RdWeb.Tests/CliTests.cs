using System.Net;
using RdWeb.Api.Cli;

namespace RdWeb.Tests;

public sealed class CliTests
{
    // CLI 同時檢查 HTTP 與有限 JSON body，拒絕看似成功的無效狀態。
    [Theory]
    [InlineData(200, "{\"status\":\"ok\"}", 0)]
    [InlineData(200, "{\"status\":\"unavailable\"}", 1)]
    [InlineData(503, "{\"status\":\"ok\"}", 1)]
    [InlineData(200, "not-json", 1)]
    [InlineData(200, "{}", 1)]
    [InlineData(200, "{\"status\":true}", 1)]
    public async Task HealthcheckReturnsExplicitExitCode(int status, string body, int expected)
    {
        using var client = new HttpClient(new ProbeHandler(status, body));
        Assert.Equal(expected, await HealthcheckCommand.RunAsync(client));
    }

    // 過大或已取消的探測不輸出 body，並回失敗狀態。
    [Fact]
    public async Task HealthcheckRejectsOversizedAndCancelledResponses()
    {
        using var client = new HttpClient(new ProbeHandler(200, new string('x', 4097)));
        Assert.Equal(1, await HealthcheckCommand.RunAsync(client));
        Assert.Equal(1, await HealthcheckCommand.RunAsync(client, new CancellationToken(true)));
    }

    // CLI 分派不可把未知子命令當成啟動 Web。
    [Fact]
    public async Task DispatcherSeparatesCommandsFromWebArguments()
    {
        Assert.Null(await CommandDispatcher.ExecuteAsync([]));
        Assert.Null(await CommandDispatcher.ExecuteAsync(["--urls", "http://localhost:8080"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["unknown-command"]));
    }

    // Web 模式也不能透過預設 configuration parser 接受 argv 中的祕密。
    [Fact]
    public async Task SensitiveConfigurationCannotBePassedAsArguments()
    {
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["--BOOTSTRAP_ADMIN_PASSWORD", "public-cli-fixture"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["--SECRET_KEY=public-cli-fixture"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["--urls", "http://localhost:8080", "VAULT_KEY=public-cli-fixture"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["--ROTATE_OLD_KEY=public-cli-fixture"]));
        Assert.Equal(2, await CommandDispatcher.ExecuteAsync(["--urls", "http://localhost:8080", "ROTATE_NEW_KEY=public-cli-fixture"]));
    }

    private sealed class ProbeHandler(int status, string body) : HttpMessageHandler
    {
        // 測試固定 localhost health URL，不建立外部網路連線。
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("http://127.0.0.1:8080/api/v1/health", request.RequestUri!.ToString());
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(body) });
        }
    }
}
