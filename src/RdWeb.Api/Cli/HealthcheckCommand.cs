using System.Text.Json;

namespace RdWeb.Api.Cli;

public static class HealthcheckCommand
{
    // 不依賴 curl，只有 HTTP 與應用狀態皆成功才回傳零。
    public static async Task<int> RunAsync(HttpClient client, CancellationToken cancellationToken = default)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            using var response = await client.GetAsync("http://127.0.0.1:8080/api/v1/health", HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode) return 1;
            await response.Content.LoadIntoBufferAsync(4096, timeout.Token);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
            return json.RootElement.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.String && status.GetString() == "ok" ? 0 : 1;
        }
        catch { return 1; }
    }
}
