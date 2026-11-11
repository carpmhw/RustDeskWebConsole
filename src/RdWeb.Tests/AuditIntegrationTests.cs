using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class AuditIntegrationTests
{
    // 以指定帳號登入並回傳帶 access token 的 client；所有測試帳號共用公開測試密碼。
    internal static async Task<HttpClient> LoginAsync(TestApplicationFactory factory, string username)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { username, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var grant = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new("Bearer", grant.GetProperty("access_token").GetString());
        return client;
    }

    // 直接寫入稽核列，讓查詢測試不依賴背景佇列的時序。
    internal static async Task SeedAuditAsync(TestApplicationFactory factory, params AuditLog[] rows)
    {
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        database.AuditLogs.AddRange(rows);
        await database.SaveChangesAsync();
    }

    // 非管理員呼叫查詢與匯出一律 403，回應不含任何稽核內容。
    [Fact]
    public async Task NonAdminsCannotReadAudit()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "operator1", "operator");
        await AuthIntegrationTests.SeedAsync(factory, "reader", "viewer");
        await SeedAuditAsync(factory, new AuditLog { Action = "Login", Result = "Success", SourceIp = "198.51.100.77" });
        foreach (var username in new[] { "operator1", "reader" })
        {
            using var client = await LoginAsync(factory, username);
            foreach (var path in new[] { "/api/v1/audit" })
            {
                using var response = await client.GetAsync(path);
                Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
                Assert.DoesNotContain("198.51.100.77", await response.Content.ReadAsStringAsync());
            }
        }
    }

    // 權限比照其他管理頁：政策要求管理員 MFA 時，未綁定的管理員 password-only session 被拒。
    [Fact]
    public async Task AdminAccessFollowsMfaPolicy()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        using var client = await LoginAsync(factory, "admin");
        using var allowed = await client.GetAsync("/api/v1/audit");
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        using var policy = await client.PutAsJsonAsync("/api/v1/settings/security", new { require_mfa = "admins", password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, policy.StatusCode);
        using var denied = await client.GetAsync("/api/v1/audit");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    // 讀取一頁查詢結果的 JSON。
    private static async Task<JsonElement> PageAsync(HttpClient client, string query)
    {
        using var response = await client.GetAsync("/api/v1/audit" + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    // 未指定範圍時只回最近 7 天，最新在前，每頁 50 筆並回報總數。
    [Fact]
    public async Task DefaultsToLastSevenDaysNewestFirstWithPaging()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var now = DateTime.UtcNow;
        var rows = Enumerable.Range(1, 60).Select(index => new AuditLog { Timestamp = now.AddMinutes(-index), Action = "TargetChanged", Result = "Success" }).ToList();
        rows.Add(new AuditLog { Timestamp = now.AddDays(-8), Action = "TargetChanged", Result = "Success", SourceIp = "203.0.113.8" });
        await SeedAuditAsync(factory, [.. rows]);
        using var client = await LoginAsync(factory, "admin");
        var first = await PageAsync(client, "?action=TargetChanged");
        Assert.Equal(60, first.GetProperty("total").GetInt32());
        Assert.Equal(50, first.GetProperty("page_size").GetInt32());
        var items = first.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(50, items.Count);
        var times = items.Select(item => item.GetProperty("time").GetDateTime()).ToList();
        Assert.Equal(times.OrderByDescending(time => time), times);
        var second = await PageAsync(client, "?action=TargetChanged&page=2");
        Assert.Equal(10, second.GetProperty("items").GetArrayLength());
        Assert.DoesNotContain("203.0.113.8", second.ToString());
    }

    // 時間範圍、使用者、動作與結果可組合篩選，只回傳同時符合的紀錄。
    [Fact]
    public async Task CombinesFilters()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var bob = await AuthIntegrationTests.SeedAsync(factory, "bob", "operator");
        var now = DateTime.UtcNow;
        await SeedAuditAsync(factory,
            new AuditLog { Timestamp = now.AddDays(-20), UserId = alice, Action = "ConnectionEnded", Result = "Success", SourceIp = "192.0.2.1" },
            new AuditLog { Timestamp = now.AddDays(-15), UserId = alice, Action = "ConnectionEnded", Result = "Failure", SourceIp = "192.0.2.2" },
            new AuditLog { Timestamp = now.AddDays(-14), UserId = bob, Action = "ConnectionEnded", Result = "Success", SourceIp = "192.0.2.3" },
            new AuditLog { Timestamp = now.AddDays(-13), UserId = alice, Action = "Login", Result = "Success", SourceIp = "192.0.2.4" },
            new AuditLog { Timestamp = now.AddDays(-12), UserId = alice, Action = "ConnectionEnded", Result = "Success", SourceIp = "192.0.2.5" });
        using var client = await LoginAsync(factory, "admin");
        var from = Uri.EscapeDataString(now.AddDays(-16).ToString("O"));
        var to = Uri.EscapeDataString(now.AddDays(-10).ToString("O"));
        var page = await PageAsync(client, $"?from={from}&to={to}&user_id={alice}&action=ConnectionEnded&result=Success");
        var ips = page.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("source_ip").GetString()).ToList();
        Assert.Equal(["192.0.2.5"], ips);
    }

    // 起點晚於終點、跨度過大、未知動作或結果、非 Guid 使用者與非正頁碼皆為 400。
    [Fact]
    public async Task RejectsInvalidFilters()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        using var client = await LoginAsync(factory, "admin");
        var now = DateTime.UtcNow;
        string Time(DateTime value) => Uri.EscapeDataString(value.ToString("O"));
        foreach (var query in new[]
        {
            $"?from={Time(now)}&to={Time(now.AddDays(-1))}",
            $"?from={Time(now.AddDays(-3651))}&to={Time(now)}",
            "?from=yesterday",
            "?action=DropTables",
            "?result=Maybe",
            "?user_id=not-a-guid",
            "?page=0"
        })
        {
            using var response = await client.GetAsync("/api/v1/audit" + query);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    // 接受瀏覽器 toISOString（毫秒）、無小數與帶時差的 ISO 8601；未帶時區的時間仍拒絕，避免以主機時區解讀。
    [Fact]
    public async Task AcceptsBrowserIsoTimesAndRejectsZonelessTimes()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        using var client = await LoginAsync(factory, "admin");
        foreach (var from in new[] { "2026-11-01T01:02:03.456Z", "2026-11-01T01:02:03Z", "2026-11-01T09:02:03+08:00" })
        {
            using var accepted = await client.GetAsync("/api/v1/audit?from=" + Uri.EscapeDataString(from));
            Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        }
        using var zoneless = await client.GetAsync("/api/v1/audit?from=" + Uri.EscapeDataString("2026-11-01T01:02:03"));
        Assert.Equal(HttpStatusCode.BadRequest, zoneless.StatusCode);
    }

    // 使用者與對象名稱在讀取時解析；已刪除者保留識別碼並標示；Detail 展開為固定欄位，形狀不符（資料庫只保證是 JSON）時不中斷整頁。
    [Fact]
    public async Task ResolvesNamesMarksDeletedAndExpandsDetail()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var server = new RustDeskServer { Name = "總部伺服器", IdServer = "server.example:21116", RelayServer = "relay.example:21117", PublicKey = "public-fixture" };
        var target = new Target { ServerId = server.Id, Name = "會計部-01", RustDeskId = "123456789", CreatedBy = alice };
        await using (var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync())
        {
            database.RustDeskServers.Add(server); database.Targets.Add(target);
            await database.SaveChangesAsync();
        }
        var goneTarget = Guid.NewGuid();
        var goneUser = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await SeedAuditAsync(factory,
            new AuditLog
            {
                Timestamp = now.AddMinutes(-5),
                UserId = alice,
                Action = "ConnectionEnded",
                Result = "Failure",
                ObjectType = "target",
                ObjectId = target.Id,
                Detail = "{\"reasonCode\":\"Revoked\",\"durationMilliseconds\":1234,\"bytesSent\":10,\"bytesReceived\":20}"
            },
            new AuditLog { Timestamp = now.AddMinutes(-4), UserId = alice, Action = "TargetChanged", Result = "Success", ObjectType = "target", ObjectId = goneTarget },
            // UserId 受外鍵約束（刪除時設 null），已刪除只會出現在對象欄位；以不存在的使用者對象驗證標示。
            new AuditLog { Timestamp = now.AddMinutes(-2), UserId = alice, Action = "UserChanged", Result = "Success", ObjectType = "user", ObjectId = goneUser },
            new AuditLog { Timestamp = now.AddMinutes(-3), UserId = alice, Action = "ServerChanged", Result = "Success", ObjectType = "server", ObjectId = server.Id, Detail = "{\"reasonCode\":\"NotAReason\",\"durationMilliseconds\":\"x\"}" });
        using var client = await LoginAsync(factory, "admin");
        var page = await PageAsync(client, "?action=ConnectionEnded");
        var connection = Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.Equal("alice", connection.GetProperty("user_name").GetString());
        Assert.False(connection.GetProperty("user_deleted").GetBoolean());
        Assert.Equal("會計部-01", connection.GetProperty("object_name").GetString());
        Assert.False(connection.GetProperty("object_deleted").GetBoolean());
        Assert.Equal("Revoked", connection.GetProperty("reason").GetString());
        Assert.Equal(1234, connection.GetProperty("duration_ms").GetInt64());
        Assert.Equal(10, connection.GetProperty("bytes_sent").GetInt64());
        Assert.Equal(20, connection.GetProperty("bytes_received").GetInt64());
        var deleted = Assert.Single((await PageAsync(client, "?action=TargetChanged")).GetProperty("items").EnumerateArray());
        Assert.True(deleted.GetProperty("object_deleted").GetBoolean());
        Assert.Equal(goneTarget, deleted.GetProperty("object_id").GetGuid());
        Assert.Equal(JsonValueKind.Null, deleted.GetProperty("object_name").ValueKind);
        Assert.Equal("alice", deleted.GetProperty("user_name").GetString());
        var goneObject = Assert.Single((await PageAsync(client, "?action=UserChanged")).GetProperty("items").EnumerateArray());
        Assert.True(goneObject.GetProperty("object_deleted").GetBoolean());
        Assert.Equal(goneUser, goneObject.GetProperty("object_id").GetGuid());
        var corrupt = Assert.Single((await PageAsync(client, "?action=ServerChanged")).GetProperty("items").EnumerateArray());
        Assert.Equal("總部伺服器", corrupt.GetProperty("object_name").GetString());
        Assert.Equal(JsonValueKind.Null, corrupt.GetProperty("reason").ValueKind);
        Assert.Equal(JsonValueKind.Null, corrupt.GetProperty("duration_ms").ValueKind);
    }

    // 讀取匯出結果；回傳狀態與內容。
    private static async Task<(HttpStatusCode Status, string Body)> ExportAsync(HttpClient client, string query)
    {
        using var response = await client.GetAsync("/api/v1/audit/export" + query);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    // 非管理員不可匯出，回應不含稽核內容。
    [Fact]
    public async Task NonAdminsCannotExport()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "operator1", "operator");
        await SeedAuditAsync(factory, new AuditLog { Action = "Login", Result = "Success", SourceIp = "198.51.100.77" });
        using var client = await LoginAsync(factory, "operator1");
        var (status, body) = await ExportAsync(client, "?time_zone=UTC");
        Assert.Equal(HttpStatusCode.Forbidden, status);
        Assert.DoesNotContain("198.51.100.77", body);
    }

    // 匯出套用相同篩選；標題含 UTC 與指定時區兩種時間；UserAgent 的公式字元被中和；已刪除對象標示並保留識別碼。
    [Fact]
    public async Task ExportsFilteredCsvWithBothTimesAndFormulaGuard()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var alice = await AuthIntegrationTests.SeedAsync(factory, "alice", "operator");
        var gone = Guid.NewGuid();
        var at = new DateTime(2026, 11, 1, 16, 30, 0, DateTimeKind.Utc);
        await SeedAuditAsync(factory,
            new AuditLog
            {
                Timestamp = at,
                UserId = alice,
                Action = "ConnectionEnded",
                Result = "Success",
                ObjectType = "target",
                ObjectId = gone,
                SourceIp = "192.0.2.10",
                UserAgent = "=HYPERLINK(\"http://x\")",
                Detail = "{\"reasonCode\":\"Completed\",\"durationMilliseconds\":5000,\"bytesSent\":1,\"bytesReceived\":2}"
            },
            new AuditLog { Timestamp = at, UserId = alice, Action = "Login", Result = "Success", SourceIp = "192.0.2.11" });
        using var client = await LoginAsync(factory, "admin");
        var from = Uri.EscapeDataString("2026-11-01T00:00:00Z");
        var to = Uri.EscapeDataString("2026-11-02T00:00:00Z");
        var (status, body) = await ExportAsync(client, $"?from={from}&to={to}&action=ConnectionEnded&time_zone=Asia%2FTaipei");
        Assert.Equal(HttpStatusCode.OK, status);
        var lines = body.TrimEnd().Split("\r\n");
        Assert.Equal("\"time_utc\",\"time_local(Asia/Taipei)\",\"user\",\"action\",\"result\",\"reason\",\"object_type\",\"object_name\",\"object_id\",\"source_ip\",\"user_agent\",\"duration_ms\",\"bytes_sent\",\"bytes_received\"", lines[0]);
        Assert.Equal(2, lines.Length);
        Assert.Equal($"\"2026-11-01T16:30:00Z\",\"2026-11-02 00:30:00\",\"alice\",\"ConnectionEnded\",\"Success\",\"Completed\",\"target\",\"(deleted)\",\"{gone}\",\"192.0.2.10\",\"'=HYPERLINK(\"\"http://x\"\")\",\"5000\",\"1\",\"2\"", lines[1]);
        Assert.DoesNotContain("192.0.2.11", body);
    }

    // 符合筆數超過 50,000 時不產生檔案；無效時區為 400。
    [Fact]
    public async Task RejectsOversizedExportAndInvalidTimeZone()
    {
        await using var factory = new TestApplicationFactory();
        await AuthIntegrationTests.SeedAsync(factory);
        var now = DateTime.UtcNow;
        await SeedAuditAsync(factory, [.. Enumerable.Range(0, 50_001).Select(index => new AuditLog { Timestamp = now.AddSeconds(-index), Action = "TargetChanged", Result = "Success" })]);
        using var client = await LoginAsync(factory, "admin");
        var (oversized, body) = await ExportAsync(client, "?action=TargetChanged&time_zone=UTC");
        Assert.Equal(HttpStatusCode.BadRequest, oversized);
        Assert.Contains("export_limit", body);
        var (invalid, _) = await ExportAsync(client, "?time_zone=Mars%2FOlympus");
        Assert.Equal(HttpStatusCode.BadRequest, invalid);
        var (missing, _) = await ExportAsync(client, "");
        Assert.Equal(HttpStatusCode.BadRequest, missing);
    }

    // 成功匯出寫入一筆含筆數與篩選、不含匯出內容的稽核；翻閱查詢頁不新增任何稽核。
    [Fact]
    public async Task ExportIsAuditedButViewingIsNot()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        await SeedAuditAsync(factory, new AuditLog { Timestamp = DateTime.UtcNow.AddMinutes(-1), Action = "ConnectionEnded", Result = "Success", SourceIp = "192.0.2.50" });
        using var client = await LoginAsync(factory, "admin");
        for (var page = 1; page <= 3; page++) await PageAsync(client, $"?page={page}");
        var (status, _) = await ExportAsync(client, "?action=ConnectionEnded&time_zone=Asia%2FTaipei");
        Assert.Equal(HttpStatusCode.OK, status);
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        var actions = await database.AuditLogs.Select(audit => audit.Action).ToListAsync();
        Assert.Equal(["AuditExported", "ConnectionEnded", "Login"], actions.Order().ToList());
        var exported = await database.AuditLogs.SingleAsync(audit => audit.Action == "AuditExported");
        Assert.Equal(admin, exported.UserId);
        Assert.Equal("Success", exported.Result);
        using var detail = JsonDocument.Parse(exported.Detail);
        Assert.Equal(1, detail.RootElement.GetProperty("count").GetInt64());
        var filter = detail.RootElement.GetProperty("filter");
        Assert.Equal("ConnectionEnded", filter.GetProperty("action").GetString());
        Assert.Equal("Asia/Taipei", filter.GetProperty("timeZone").GetString());
        Assert.DoesNotContain("192.0.2.50", exported.Detail);
    }

    // 讀取目前保留天數。
    private static async Task<int> RetentionAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/v1/settings/audit");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("retention_days").GetInt32();
    }

    // 預設 365；超出範圍為 400、缺少或錯誤再驗證被拒，皆不改設定；成功修改寫入 SettingsChanged；非管理員不可讀寫。
    [Fact]
    public async Task RetentionSettingIsValidatedAndRequiresReauthentication()
    {
        await using var factory = new TestApplicationFactory();
        var admin = await AuthIntegrationTests.SeedAsync(factory);
        await AuthIntegrationTests.SeedAsync(factory, "operator1", "operator");
        using var client = await LoginAsync(factory, "admin");
        Assert.Equal(365, await RetentionAsync(client));
        foreach (var days in new[] { 10, 29, 3651, 5000 })
        {
            using var outOfRange = await client.PutAsJsonAsync("/api/v1/settings/audit", new { retention_days = days, password = AuthIntegrationTests.Password });
            Assert.Equal(HttpStatusCode.BadRequest, outOfRange.StatusCode);
        }
        using var noProof = await client.PutAsJsonAsync("/api/v1/settings/audit", new { retention_days = 30 });
        Assert.Equal(HttpStatusCode.Unauthorized, noProof.StatusCode);
        using var wrongProof = await client.PutAsJsonAsync("/api/v1/settings/audit", new { retention_days = 30, password = "wrong-password-value" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongProof.StatusCode);
        Assert.Equal(365, await RetentionAsync(client));
        using var saved = await client.PutAsJsonAsync("/api/v1/settings/audit", new { retention_days = 30, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(30, await RetentionAsync(client));
        using var operatorClient = await LoginAsync(factory, "operator1");
        using var denied = await operatorClient.GetAsync("/api/v1/settings/audit");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var deniedPut = await operatorClient.PutAsJsonAsync("/api/v1/settings/audit", new { retention_days = 3650, password = AuthIntegrationTests.Password });
        Assert.Equal(HttpStatusCode.Forbidden, deniedPut.StatusCode);
        Assert.Equal(30, await RetentionAsync(client));
        await factory.Services.GetRequiredService<RdWeb.Api.Infrastructure.AuditWriter>().StopAsync(default);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync();
        Assert.Equal(1, await database.AuditLogs.CountAsync(audit => audit.Action == "SettingsChanged" && audit.UserId == admin && audit.ObjectType == "setting" && audit.Result == "Success"));
    }
}
