using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RdWeb.Api.Data;

namespace RdWeb.Tests;

public sealed class TargetTransferTests
{
    // Import新增-only、整批rollback；export沒有password，且formula保護。
    [Fact]
    public async Task CsvImportAndExportAreMetadataOnlyAndAtomic()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator");
        var header = "server_id,name,rustdesk_id,group_name,tags,notes\r\n";
        var csv = header + $"{server},=formula,123456789,work,[],public-note\r\n";
        using var imported = await owner.PostAsJsonAsync("/api/v1/targets/import", new { csv }); Assert.Equal(HttpStatusCode.Created, imported.StatusCode);
        Assert.Equal(1, (await imported.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("count").GetInt32());
        using var export = await owner.GetAsync("/api/v1/targets/export"); Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        var text = await export.Content.ReadAsStringAsync(); Assert.Contains("'=formula", text); Assert.DoesNotContain("password", text);
        using var partial = await owner.PostAsJsonAsync("/api/v1/targets/import", new { csv = header + $"{server},new,other-id,work,[],ok\r\n{server},dup,123456789,work,[],ok\r\n" }); Assert.Equal(HttpStatusCode.Conflict, partial.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(); Assert.Equal(1, await database.Targets.CountAsync());
        using var passwordColumn = await owner.PostAsJsonAsync("/api/v1/targets/import", new { csv = "server_id,name,rustdesk_id,password\r\n" }); Assert.Equal(HttpStatusCode.BadRequest, passwordColumn.StatusCode);
    }
    // 批刪有任何stale version即全部不刪；成功後metadata／ACL／secret全部清除。
    [Fact]
    public async Task BulkDeleteChecksAllVersionsBeforeChangingAnyRow()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator"); var ids = new List<Guid>();
        for (var index = 0; index < 2; index++)
        {
            using var created = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "fixture", server_id = server, rustdesk_id = "id-" + index, password = "public-bulk-marker" });
            ids.Add((await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        }
        using var stale = await owner.PostAsJsonAsync("/api/v1/targets/bulk-delete", new { items = new[] { new { id = ids[0], version = 1 }, new { id = ids[1], version = 99 } } }); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(); Assert.Equal(2, await database.Targets.CountAsync());
        using var deleted = await owner.PostAsJsonAsync("/api/v1/targets/bulk-delete", new { items = ids.Select(id => new { id, version = 1 }) }); Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(0, await database.Targets.CountAsync()); Assert.Equal(0, await database.EncryptedSecrets.CountAsync());
    }
    // Export只可見資料，批刪含隱藏target不刪任何資料，viewer不能import。
    [Fact]
    public async Task TransferRespectsVisibilityAndBatchPermissions()
    {
        await using var factory = new TestApplicationFactory(); var server = await TargetIntegrationTests.SeedServerAsync(factory);
        using var owner = await TargetIntegrationTests.LoginAsync(factory, "owner", "operator"); using var other = await TargetIntegrationTests.LoginAsync(factory, "other", "operator"); using var viewer = await TargetIntegrationTests.LoginAsync(factory, "viewer", "viewer");
        using var first = await owner.PostAsJsonAsync("/api/v1/targets", new { name = "visible-marker", server_id = server, rustdesk_id = "first" });
        using var second = await other.PostAsJsonAsync("/api/v1/targets", new { name = "hidden-marker", server_id = server, rustdesk_id = "second" });
        var firstId = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid(); var secondId = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var exported = await owner.GetAsync("/api/v1/targets/export"); var csv = await exported.Content.ReadAsStringAsync(); Assert.Contains("visible-marker", csv); Assert.DoesNotContain("hidden-marker", csv);
        using var denied = await owner.PostAsJsonAsync("/api/v1/targets/bulk-delete", new { items = new[] { new { id = firstId, version = 1 }, new { id = secondId, version = 1 } } }); Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        await using var database = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(); Assert.Equal(2, await database.Targets.CountAsync());
        using var noImport = await viewer.PostAsJsonAsync("/api/v1/targets/import", new { csv = "not-csv" }); Assert.Equal(HttpStatusCode.Forbidden, noImport.StatusCode);
        using var duplicate = await owner.PostAsJsonAsync("/api/v1/targets/bulk-delete", new { items = new[] { new { id = firstId, version = 1 }, new { id = firstId, version = 1 } } }); Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
    }
}
