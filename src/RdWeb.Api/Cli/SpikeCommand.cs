using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using Google.Protobuf;
using Hbb;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;
using Serilog.Events;
using Serilog.Parsing;

namespace RdWeb.Api.Cli;

public static class SpikeCommand
{
    // 在發布後的執行映像實測原生驗簽、protobuf、SQLite 與 Argon2id，不輸出敏感值。
    public static async Task RunAsync()
    {
        var key = Convert.FromHexString("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
        var signature = Convert.FromHexString("e5564300c360ac729086e2cc806e828a" + "84877f1eb8e5d974d873e06522490155" + "5fb8821590a33bacc61e39701cf9b46b" + "d25bf5f0595bbe24655141438e7a100b");
        if (!ServerSignatureVerifier.Verify(key, [], signature) || ServerSignatureVerifier.Verify(key, [1], signature))
        {
            throw new InvalidOperationException("Ed25519 spike 失敗。");
        }
        var message = new RendezvousMessage { PunchHoleRequest = new() { Id = "123456789", ForceRelay = true } };
        if (!message.Equals(RendezvousMessage.Parser.ParseFrom(message.ToByteArray())))
        {
            throw new InvalidOperationException("Protobuf spike 失敗。");
        }

        var directory = Path.Combine(Path.GetTempPath(), "rdweb-spike-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        int rows;
        try
        {
            rows = await SqliteSpike.RunAsync(Path.Combine(directory, "spike.db"));
            if (rows != 20) throw new InvalidOperationException("SQLite spike 失敗。");
        }
        finally
        {
            Directory.Delete(directory, true);
        }

        var hasher = new PasswordHasher();
        var stopwatch = Stopwatch.StartNew();
        var hash = await hasher.HashAsync("only-a-public-spike-value");
        var hashMilliseconds = stopwatch.Elapsed.TotalMilliseconds;
        if (!await hasher.VerifyAsync("only-a-public-spike-value", hash) || await hasher.VerifyAsync("wrong-public-spike-value", hash))
        {
            throw new InvalidOperationException("Argon2id spike 失敗。");
        }
        Console.WriteLine(JsonSerializer.Serialize(new { status = "ok", ed25519 = true, protobuf = true, sqliteRows = rows, argon2idMilliseconds = Math.Round(hashMilliseconds, 1) }));

        var zone = Environment.GetEnvironmentVariable("LOG_TIME_ZONE") ?? "UTC";
        var eventTime = DateTimeOffset.Parse("2026-10-07T16:00:00Z", CultureInfo.InvariantCulture);
        var logEvent = new LogEvent(eventTime, LogEventLevel.Information, null, new MessageTemplateParser().Parse("容器時區驗證"), []);
        new TimeZoneLogFormatter(zone).Format(logEvent, Console.Out);
    }

    // 執行映像自帶健康探測，不依賴 curl、shell 或容器本地時區。
    public static async Task HealthcheckAsync()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var response = await client.GetAsync("http://127.0.0.1:8080/api/v1/health");
        response.EnsureSuccessStatusCode();
    }
}
