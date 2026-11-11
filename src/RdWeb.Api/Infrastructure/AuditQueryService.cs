using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Api.Infrastructure;

// 已驗證的稽核篩選；查詢與匯出共用同一套解析與條件。
public sealed record AuditFilter(DateTime From, DateTime To, Guid? UserId, string? Action, string? Result)
{
    private static readonly TimeSpan DefaultRange = TimeSpan.FromDays(7);
    private static readonly TimeSpan MaximumRange = TimeSpan.FromDays(3650);

    // 解析外部查詢字串：時間須為含時區的 ISO 8601、動作／結果須完全符合已知名稱，未指定範圍時為最近 7 天。
    public static AuditFilter Parse(string? from, string? to, string? userId, string? action, string? result, DateTime now)
    {
        var end = to == null ? now : Time(to);
        var start = from == null ? end - DefaultRange : Time(from);
        if (start > end || end - start > MaximumRange) throw new AuthException("invalid_request", 400);
        Guid? user = null;
        if (userId != null) user = Guid.TryParseExact(userId, "D", out var parsed) ? parsed : throw new AuthException("invalid_request", 400);
        if (action != null && !Enum.GetNames<AuditAction>().Contains(action)) throw new AuthException("invalid_request", 400);
        if (result != null && !Enum.GetNames<AuditResult>().Contains(result)) throw new AuthException("invalid_request", 400);
        return new(start, end, user, action, result);
    }

    // 帶時區的 ISO 8601：小數秒選填（瀏覽器為毫秒），時區必須為 Z 或 ±hh:mm，不以主機時區解讀未標示者。
    private static readonly string[] TimeFormats = ["yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz"];

    // 只接受帶時區的 ISO 8601 時間並轉為 UTC。
    private static DateTime Time(string value)
        => DateTimeOffset.TryParseExact(value, TimeFormats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed.UtcDateTime
            : throw new AuthException("invalid_request", 400);

    // 套用篩選條件，供查詢與匯出共用。
    public IQueryable<AuditLog> Apply(IQueryable<AuditLog> source)
    {
        var query = source.Where(audit => audit.Timestamp >= From && audit.Timestamp <= To);
        if (UserId is { } user) query = query.Where(audit => audit.UserId == user);
        if (Action != null) query = query.Where(audit => audit.Action == Action);
        if (Result != null) query = query.Where(audit => audit.Result == Result);
        return query;
    }
}

// 對外呈現的一筆稽核：名稱於讀取時解析，Detail 展開為固定欄位，不輸出原始 JSON。
public sealed record AuditView(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("time")] DateTime Time,
    [property: JsonPropertyName("user_id")] Guid? UserId,
    [property: JsonPropertyName("user_name")] string? UserName,
    [property: JsonPropertyName("user_deleted")] bool UserDeleted,
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("result")] string Result,
    [property: JsonPropertyName("object_type")] string? ObjectType,
    [property: JsonPropertyName("object_id")] Guid? ObjectId,
    [property: JsonPropertyName("object_name")] string? ObjectName,
    [property: JsonPropertyName("object_deleted")] bool ObjectDeleted,
    [property: JsonPropertyName("source_ip")] string? SourceIp,
    [property: JsonPropertyName("user_agent")] string? UserAgent,
    [property: JsonPropertyName("reason")] string? Reason,
    [property: JsonPropertyName("duration_ms")] long? DurationMs,
    [property: JsonPropertyName("bytes_sent")] long? BytesSent,
    [property: JsonPropertyName("bytes_received")] long? BytesReceived);

public sealed class AuditQueryService(AppDbContext database, SessionValidator sessions, TimeProvider clock, AuditWriter audits)
{
    public const int PageSize = 50;

    // 管理員分頁查詢稽核，最新在前；權限依 MFA 政策判斷完整登入，篩選不合法時為 400。
    public async Task<object> ListAsync(ClaimsPrincipal principal, string? from, string? to, string? userId, string? action, string? result, int page, CancellationToken ct)
    {
        _ = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        if (page < 1) throw new AuthException("invalid_request", 400);
        var filter = AuditFilter.Parse(from, to, userId, action, result, clock.GetUtcNow().UtcDateTime);
        var query = filter.Apply(database.AuditLogs.AsNoTracking());
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(audit => audit.Timestamp).ThenByDescending(audit => audit.Id)
            .Skip((page - 1) * PageSize).Take(PageSize).ToListAsync(ct);
        return new { items = await DescribeAsync(rows, ct), page, page_size = PageSize, total };
    }

    public const int ExportLimit = 50_000;
    private static readonly string[] ExportHeaders = ["time_utc", "", "user", "action", "result", "reason", "object_type", "object_name", "object_id",
        "source_ip", "user_agent", "duration_ms", "bytes_sent", "bytes_received"];

    // 以相同篩選匯出 CSV：同時輸出 UTC 與指定顯示時區時間，逐格公式防護；超過上限不產生檔案。
    public async Task<string> ExportAsync(ClaimsPrincipal principal, string? from, string? to, string? userId, string? action, string? result, string? timeZone, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: true, cancellationToken: ct);
        if (string.IsNullOrEmpty(timeZone) || timeZone.Length > 64 || !TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out var zone))
            throw new AuthException("invalid_request", 400);
        var filter = AuditFilter.Parse(from, to, userId, action, result, clock.GetUtcNow().UtcDateTime);
        var rows = await filter.Apply(database.AuditLogs.AsNoTracking()).OrderByDescending(audit => audit.Timestamp).ThenByDescending(audit => audit.Id)
            .Take(ExportLimit + 1).ToListAsync(ct);
        if (rows.Count > ExportLimit) throw new AuthException("export_limit", 400);
        var headers = ExportHeaders.ToArray();
        headers[1] = $"time_local({zone.Id})";
        var lines = (await DescribeAsync(rows, ct)).Select(view => new[]
        {
            DateTime.SpecifyKind(view.Time, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
            TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(view.Time, DateTimeKind.Utc), zone).ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            view.UserDeleted ? "(deleted)" : view.UserName ?? "",
            view.Action,
            view.Result,
            view.Reason ?? "",
            view.ObjectType ?? "",
            view.ObjectDeleted ? "(deleted)" : view.ObjectName ?? "",
            view.ObjectId?.ToString() ?? "",
            view.SourceIp ?? "",
            view.UserAgent ?? "",
            view.DurationMs?.ToString(CultureInfo.InvariantCulture) ?? "",
            view.BytesSent?.ToString(CultureInfo.InvariantCulture) ?? "",
            view.BytesReceived?.ToString(CultureInfo.InvariantCulture) ?? ""
        });
        var csv = RdWeb.Api.Targets.CsvCodec.Export(new[] { headers }.Concat(lines));
        // 匯出等同把稽核內容帶離系統：只記筆數與篩選，不記內容。
        await audits.WriteAsync(new(AuditAction.AuditExported, AuditResult.Success, actor.Id,
            new(Count: rows.Count, Filter: new(filter.From, filter.To, filter.UserId, filter.Action, filter.Result, zone.Id)), SourceIp: ip), ct);
        return csv;
    }

    // 批次解析本批紀錄引用的使用者、目標與伺服器名稱；找不到的標示為已刪除並保留識別碼。
    public async Task<List<AuditView>> DescribeAsync(List<AuditLog> rows, CancellationToken ct)
    {
        var userIds = rows.Select(row => row.UserId).Concat(rows.Where(row => row.ObjectType == "user").Select(row => row.ObjectId))
            .OfType<Guid>().Distinct().ToList();
        var targetIds = rows.Where(row => row.ObjectType == "target").Select(row => row.ObjectId).OfType<Guid>().Distinct().ToList();
        var serverIds = rows.Where(row => row.ObjectType == "server").Select(row => row.ObjectId).OfType<Guid>().Distinct().ToList();
        var users = await database.Users.AsNoTracking().Where(user => userIds.Contains(user.Id)).ToDictionaryAsync(user => user.Id, user => user.Username, ct);
        var targets = await database.Targets.AsNoTracking().Where(target => targetIds.Contains(target.Id)).ToDictionaryAsync(target => target.Id, target => target.Name, ct);
        var servers = await database.RustDeskServers.AsNoTracking().Where(server => serverIds.Contains(server.Id)).ToDictionaryAsync(server => server.Id, server => server.Name, ct);
        return rows.Select(row =>
        {
            var names = row.ObjectType switch { "user" => users, "target" => targets, "server" => servers, _ => null };
            string? objectName = null;
            var objectDeleted = names != null && row.ObjectId is { } objectId && !names.TryGetValue(objectId, out objectName);
            string? userName = null;
            var userDeleted = row.UserId is { } userId && !users.TryGetValue(userId, out userName);
            var detail = ReadDetail(row.Detail);
            return new AuditView(row.Id, row.Timestamp, row.UserId, userName, userDeleted, row.Action, row.Result, row.ObjectType, row.ObjectId,
                objectName, objectDeleted, row.SourceIp, row.UserAgent, detail?.ReasonCode?.ToString(), detail?.DurationMilliseconds, detail?.BytesSent, detail?.BytesReceived);
        }).ToList();
    }

    private static readonly JsonSerializerOptions DetailOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, Converters = { new JsonStringEnumConverter() } };

    // 讀取固定欄位 Detail；歷史或損壞內容回傳 null，不中斷整頁。
    private static AuditDetail? ReadDetail(string value)
    {
        try { return JsonSerializer.Deserialize<AuditDetail>(value, DetailOptions); }
        catch (JsonException) { return null; }
    }
}
