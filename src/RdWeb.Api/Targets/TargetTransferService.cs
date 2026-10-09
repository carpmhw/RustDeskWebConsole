using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Endpoints;
using RdWeb.Api.Infrastructure;
using RdWeb.Api.Security;

namespace RdWeb.Api.Targets;

public sealed class TargetTransferService(AppDbContext database, SessionValidator sessions, TargetPolicy policy,
    TargetService targets, EncryptedSecretStore secrets)
{
    private static readonly string[] Headers = ["server_id", "name", "rustdesk_id", "group_name", "tags", "notes"];
    // 有限新增-only，所有列在同交易，CSV從未寫入audit或error。
    public async Task<object> ImportAsync(ClaimsPrincipal principal, string csv, CancellationToken ct)
    {
        var actor = await targets.RequireWriterAsync(principal, ct); var rows = CsvCodec.Parse(csv);
        if (rows.Count < 2 || rows.Count > 51 || rows[0].Length != 6) throw Invalid();
        var indexes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < rows[0].Length; index++)
        {
            var name = rows[0][index].Trim();
            if (!Headers.Contains(name, StringComparer.OrdinalIgnoreCase) || !indexes.TryAdd(name, index)) throw Invalid();
        }
        var requests = new List<TargetRequest>();
        foreach (var row in rows.Skip(1))
        {
            if (row.Length != 6 || !Guid.TryParse(row[indexes["server_id"]], out var serverId)) throw Invalid();
            string[]? tags;
            try { tags = JsonSerializer.Deserialize<string[]>(row[indexes["tags"]]); } catch (JsonException) { throw Invalid(); }
            if (tags == null) throw Invalid();
            requests.Add(new(row[indexes["name"]], serverId, row[indexes["rustdesk_id"]], EmptyToNull(row[indexes["group_name"]]), tags, EmptyToNull(row[indexes["notes"]]), null, 0));
        }
        var ids = new List<Guid>();
        await using (var transaction = await database.Database.BeginTransactionAsync(ct))
        {
            foreach (var request in requests) ids.Add((await targets.CreateCoreAsync(actor, request, ct)).Id);
            await transaction.CommitAsync(ct);
        }
        foreach (var id in ids) await targets.AuditAsync(AuditAction.TargetChanged, actor.Id, id, true, ct);
        return new { count = ids.Count, ids };
    }
    // 可見metadata最多1000列，不decrypt、沒有password／secret欄。
    public async Task<string> ExportAsync(ClaimsPrincipal principal, string? q, string? group, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct);
        if (q?.Length > 128 || group?.Length > 64) throw new AuthException("invalid_request", 400);
        var rows = await targets.Filter(actor, q, group).AsNoTracking().OrderBy(target => target.Name).ThenBy(target => target.Id).Take(1001).ToListAsync(ct);
        if (rows.Count > 1000) throw new AuthException("export_limit", 400);
        return CsvCodec.Export(new[] { Headers }.Concat(rows.Select(target => new[] { target.ServerId.ToString(), target.Name, target.RustDeskId, target.GroupName ?? "", target.Tags, target.Notes ?? "" })));
    }
    // 全部權限及版本成功才開始交易，不能用stale或隱藏項目造成partial delete。
    public async Task BulkDeleteAsync(ClaimsPrincipal principal, TargetBulkRequest request, CancellationToken ct)
    {
        var actor = await sessions.RequireAsync(principal, cancellationToken: ct);
        if (request.Items == null || request.Items.Length is < 1 or > 100 || request.Items.Any(item => item == null || item.Id == Guid.Empty)
            || request.Items.Select(item => item.Id).Distinct().Count() != request.Items.Length) throw new AuthException("invalid_request", 400);
        var rows = new List<RdWeb.Api.Data.Entities.Target>();
        foreach (var item in request.Items)
        {
            var target = await policy.FindVisibleAsync(actor, item.Id, ct);
            if (!(await policy.RightsAsync(actor, target, ct)).CanEdit) throw new AuthException("forbidden", 403);
            TargetService.CheckVersion(target, item.Version); rows.Add(target);
        }
        await using (var transaction = await database.Database.BeginTransactionAsync(ct))
        {
            database.Targets.RemoveRange(rows); await targets.SaveAsync(ct);
            foreach (var target in rows) await secrets.DeleteAsync(target.Id, ct);
            await transaction.CommitAsync(ct);
        }
        foreach (var target in rows) await targets.AuditAsync(AuditAction.TargetChanged, actor.Id, target.Id, true, ct);
    }
    // CSV空白optional欄位對應null，但不剝除有意義空白或apostrophe。
    private static string? EmptyToNull(string value) => value.Length == 0 ? null : value;
    // 固定分類不包含CSV內容或欄位值。
    private static AuthException Invalid() => new("invalid_csv", 400);
}
