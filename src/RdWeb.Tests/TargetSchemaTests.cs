using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class TargetSchemaTests
{
    // 真實migration／FK／ACL對象互斥與唯一性不能只依賴HTTP。
    [Fact]
    public async Task TargetAndPermissionsEnforceDatabaseConstraints()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-target-schema-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            var user = new User { Username = "fixture", NormalizedUsername = "FIXTURE" }; var server = new RustDeskServer { Name = "fixture" };
            database.AddRange(user, server); await database.SaveChangesAsync();
            var target = new Target { Name = "fixture", RustDeskId = "123456789", ServerId = server.Id, CreatedBy = user.Id };
            database.Targets.Add(target); await database.SaveChangesAsync(); Assert.Equal(1, target.Version);
            database.TargetPermissions.Add(new TargetPermission { TargetId = target.Id, UserId = user.Id, Role = "operator" });
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync()); database.ChangeTracker.Clear();
            database.TargetPermissions.Add(new TargetPermission { TargetId = target.Id });
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync()); database.ChangeTracker.Clear();
            database.TargetPermissions.Add(new TargetPermission { TargetId = target.Id, Role = "viewer" }); await database.SaveChangesAsync();
            database.TargetPermissions.Add(new TargetPermission { TargetId = target.Id, Role = "viewer" });
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync()); database.ChangeTracker.Clear();
            database.RustDeskServers.Remove(await database.RustDeskServers.SingleAsync());
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync()); database.ChangeTracker.Clear();
            database.Targets.Add(new Target { Name = "duplicate", RustDeskId = "123456789", ServerId = server.Id, CreatedBy = user.Id });
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
