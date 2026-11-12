using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;

namespace RdWeb.Api.RustDesk;

// 連線管控設定：閒置逾時（分鐘）與單次連線時間上限（小時）；0 表示關閉。
public sealed record ConnectionPolicySettings(int IdleMinutes, int MaxHours);

public static class ConnectionPolicy
{
    public const string IdleMinutesKey = "connection_idle_minutes";
    public const string MaxHoursKey = "connection_max_hours";
    public const int DefaultIdleMinutes = 30;
    public const int DefaultMaxHours = 8;
    // 測試 stack 專用：把時間上限的 1 小時換成指定秒數，只在 Development 環境讀取。
    public const string TestHourSecondsKey = "RDWEB_TEST_CONNECTION_HOUR_SECONDS";

    // 時間上限的 1 小時實際長度：只有 Development 且設定為 1–3600 的整數秒時縮短，其他情況（含 Production）一律 1 小時。
    public static TimeSpan HourUnit(bool development, IConfiguration configuration)
        => development && int.TryParse(configuration[TestHourSecondsKey], System.Globalization.NumberStyles.None,
            System.Globalization.CultureInfo.InvariantCulture, out var seconds) && seconds is >= 1 and <= 3600
            ? TimeSpan.FromSeconds(seconds)
            : TimeSpan.FromHours(1);

    // 讀取設定；缺少、損壞或超出範圍皆視為預設值。
    public static async Task<ConnectionPolicySettings> ReadAsync(AppDbContext database, CancellationToken ct)
    {
        var values = await database.SystemSettings.AsNoTracking().Where(setting => setting.Key == IdleMinutesKey || setting.Key == MaxHoursKey)
            .ToDictionaryAsync(setting => setting.Key, setting => setting.Value, ct);
        return new(Read(values, IdleMinutesKey, DefaultIdleMinutes, 5, 480), Read(values, MaxHoursKey, DefaultMaxHours, 1, 24));
    }

    // 解析單一整數設定；0 視為關閉，其他值須在範圍內。
    private static int Read(Dictionary<string, string> values, string key, int fallback, int minimum, int maximum)
    {
        if (!values.TryGetValue(key, out var value)) return fallback;
        using var document = JsonDocument.Parse(value);
        return document.RootElement.ValueKind == JsonValueKind.Number && document.RootElement.TryGetInt32(out var number)
            && (number == 0 || number >= minimum && number <= maximum) ? number : fallback;
    }
}
