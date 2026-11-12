using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.RustDesk;

namespace RdWeb.Api.Security;

// 登入 session（一個 refresh family）的對外摘要；不含任何 token 或雜湊。
public sealed record SessionView(Guid Id, string? Browser, string? Os, string? Ip, DateTime SignedInAt, DateTime LastUsedAt, bool Current);

public sealed class SessionService(AppDbContext database, SessionValidator sessions, ActiveConnectionRegistry registry, IKvStore store, TimeProvider clock,
    AuthService auth, AuditWriter audits)
{
    // 經此 session 建立的遠端連線最近一次結束時間的 KV 鍵；只以 family 識別，不含任何憑證。
    public static string SeenKey(Guid family) => $"session-seen:{family:N}";
    // 閒置設定上限（分鐘）；連線結束時間只需保留這麼久，之後已不影響閒置判斷。
    public const int MaxIdleMinutes = 1440;
    public const int MinIdleMinutes = 30;
    public const int DefaultIdleMinutes = 60;
    public const string IdleMinutesKey = "session_idle_minutes";

    // 讀取網頁閒置登出分鐘數；缺少、損壞或超出範圍（0 或 30–1440 以外）皆視為預設 60。
    public static async Task<int> ReadIdleMinutesAsync(AppDbContext database, CancellationToken ct)
    {
        var value = await database.SystemSettings.AsNoTracking().Where(setting => setting.Key == IdleMinutesKey).Select(setting => setting.Value).SingleOrDefaultAsync(ct);
        if (value == null) return DefaultIdleMinutes;
        using var document = System.Text.Json.JsonDocument.Parse(value);
        return document.RootElement.ValueKind == System.Text.Json.JsonValueKind.Number && document.RootElement.TryGetInt32(out var minutes)
            && (minutes == 0 || minutes is >= MinIdleMinutes and <= MaxIdleMinutes) ? minutes : DefaultIdleMinutes;
    }

    // 記錄經此 session 建立的遠端連線剛結束（UTC），供最近使用時間與閒置判斷。
    public static Task MarkSeenAsync(IKvStore store, Guid family, DateTime endedAt, CancellationToken ct)
        => store.SetWithTtlAsync(SeenKey(family), DateTime.SpecifyKind(endedAt, DateTimeKind.Utc).ToString("O", CultureInfo.InvariantCulture),
            TimeSpan.FromMinutes(MaxIdleMinutes), ct);

    // 瀏覽器辨識規則依序比對：Edge、Opera 的字串也含 Chrome，Chrome 的字串也含 Safari，所以先比對較特定者。
    private static readonly (string Token, string Name)[] Browsers =
        [("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("CriOS/", "Chrome"), ("Safari/", "Safari")];
    // 作業系統依序比對：iOS 的字串含「like Mac OS X」、Android 與 ChromeOS 的字串含 Linux，所以先比對較特定者。
    private static readonly (string Token, string Name)[] Systems =
        [("Windows", "Windows"), ("iPhone", "iOS"), ("iPad", "iOS"), ("Android", "Android"), ("CrOS", "ChromeOS"), ("Mac OS X", "macOS"), ("Linux", "Linux")];

    // 由 User-Agent 辨識瀏覽器與作業系統，只回傳固定名稱；無法辨識的部分為 null，不回傳原始字串。
    public static (string? Browser, string? Os) Describe(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return (null, null);
        return (Browsers.FirstOrDefault(rule => userAgent.Contains(rule.Token, StringComparison.Ordinal)).Name,
            Systems.FirstOrDefault(rule => userAgent.Contains(rule.Token, StringComparison.Ordinal)).Name);
    }

    // 列出有效 session：userId 為 null 時是本人，否則需管理員；最近使用時間依最近 refresh、連線結束與作用中連線取最晚者。
    public async Task<object> ListAsync(ClaimsPrincipal principal, Guid? userId, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: userId != null, cancellationToken: ct);
        var owner = userId ?? actor.Id;
        if (!await database.Users.AnyAsync(user => user.Id == owner, ct)) throw new AuthException("not_found", StatusCodes.Status404NotFound);
        var current = Guid.TryParse(principal.FindFirstValue("sid"), out var sid) ? sid : Guid.Empty;
        var items = new List<SessionView>();
        foreach (var token in await LiveAsync(owner, ct))
        {
            var (browser, os) = Describe(token.UserAgent);
            items.Add(new(token.FamilyId, browser, os, token.Ip, DateTime.SpecifyKind(token.AuthenticatedAt, DateTimeKind.Utc),
                await LastUsedAsync(registry, store, clock.GetUtcNow().UtcDateTime, token.FamilyId, token.CreatedAt, ct), token.FamilyId == current));
        }
        return new
        {
            items = items.OrderByDescending(item => item.LastUsedAt).Select(item => new
            {
                id = item.Id,
                browser = item.Browser,
                os = item.Os,
                ip = item.Ip,
                signed_in_at = item.SignedInAt,
                last_used_at = item.LastUsedAt,
                current = item.Current
            })
        };
    }

    // 登出 session：userId 為 null 時是本人登出其他所有裝置，否則需管理員（sessionId 指定單一，省略為全部）。
    // 一律不登出發出請求的 session；每個被登出的 session 連同其遠端連線（1008）結束；寫一筆含執行者與數量的稽核。
    public async Task<object> RevokeAsync(ClaimsPrincipal principal, Guid? userId, Guid? sessionId, string ip, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, admin: userId != null, cancellationToken: ct);
        var owner = userId ?? actor.Id;
        if (!await database.Users.AnyAsync(user => user.Id == owner, ct)) throw new AuthException("not_found", StatusCodes.Status404NotFound);
        var current = Guid.TryParse(principal.FindFirstValue("sid"), out var sid) ? sid : Guid.Empty;
        if (sessionId == current) throw new AuthException("current_session", StatusCodes.Status400BadRequest);
        var live = (await LiveAsync(owner, ct)).Select(token => token.FamilyId).Distinct().ToList();
        if (sessionId != null && !live.Contains(sessionId.Value)) throw new AuthException("not_found", StatusCodes.Status404NotFound);
        var families = sessionId != null ? [sessionId.Value] : live.Where(family => family != current).ToList();
        foreach (var family in families)
        {
            await auth.RevokeFamilyAsync(family, ct);
            registry.Terminate(grant => grant.Session?.FamilyId == family);
        }
        await audits.WriteAsync(new(AuditAction.SessionRevoked, AuditResult.Success, actor.Id,
            new(userId != null ? AuditReason.Terminated : AuditReason.Completed, Count: families.Count), "user", owner, ip), ct);
        return new { revoked = families.Count };
    }

    // 使用者每個 family 目前唯一的有效列（未撤銷、未過期）。
    private async Task<List<Data.Entities.RefreshToken>> LiveAsync(Guid owner, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return await database.RefreshTokens.AsNoTracking().Where(token => token.UserId == owner && token.RevokedAt == null && token.ExpiresAt > now).ToListAsync(ct);
    }

    // 最近使用時間：作用中連線時為現在；否則取最近 refresh 與最近連線結束（KV）中較晚者。
    public static async Task<DateTime> LastUsedAsync(ActiveConnectionRegistry registry, IKvStore store, DateTime now, Guid family, DateTime refreshedAt,
        CancellationToken ct)
    {
        if (registry.Snapshot().Any(lease => lease.IsActive && lease.Grant.Session?.FamilyId == family)) return now;
        var last = DateTime.SpecifyKind(refreshedAt, DateTimeKind.Utc);
        var seen = await store.GetAsync(SeenKey(family), ct);
        if (seen != null && DateTime.TryParse(seen, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var ended) && ended > last)
            last = ended;
        return last;
    }
}
