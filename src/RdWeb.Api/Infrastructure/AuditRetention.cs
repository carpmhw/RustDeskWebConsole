using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;

namespace RdWeb.Api.Infrastructure;

public static class AuditRetention
{
    public const string Key = "audit_retention_days";
    public const int DefaultDays = 365;
    public const int MinimumDays = 30;
    public const int MaximumDays = 3650;

    // 讀取保留天數；缺少、損壞或超出範圍皆視為預設 365，不因設定異常提前刪除紀錄。
    public static async Task<int> ReadAsync(AppDbContext database, CancellationToken ct)
    {
        var value = await database.SystemSettings.AsNoTracking().Where(setting => setting.Key == Key).Select(setting => setting.Value).SingleOrDefaultAsync(ct);
        if (value == null) return DefaultDays;
        using var document = JsonDocument.Parse(value);
        return document.RootElement.ValueKind == JsonValueKind.Number && document.RootElement.TryGetInt32(out var days) && days is >= MinimumDays and <= MaximumDays
            ? days : DefaultDays;
    }
}
