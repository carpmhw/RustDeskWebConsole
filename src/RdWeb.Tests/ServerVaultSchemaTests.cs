using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Tests;

public sealed class ServerVaultSchemaTests
{
    // 真實migration建立新表，DB約束不可只靠HTTP驗證。
    [Fact]
    public async Task ServerAndSecretSchemaEnforceConstraints()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-m2-schema-" + Guid.NewGuid());
        var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            var server = new RustDeskServer { Name = "fixture", IdServer = "server.example:21116", RelayServer = "relay.example:21117", PublicKey = "public-fixture" };
            database.RustDeskServers.Add(server); await database.SaveChangesAsync();
            Assert.Equal(1, server.Version);
            server.Transport = "udp";
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
            database.ChangeTracker.Clear();
            var id = Guid.NewGuid();
            database.EncryptedSecrets.Add(new EncryptedSecret { ObjectId = id, Nonce = new byte[12], Ciphertext = new byte[17], KeyVersion = 1 });
            await database.SaveChangesAsync();
            database.EncryptedSecrets.Add(new EncryptedSecret { ObjectId = id, Nonce = new byte[12], Ciphertext = new byte[17], KeyVersion = 1 });
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
            database.ChangeTracker.Clear();
            database.EncryptedSecrets.Add(new EncryptedSecret { ObjectId = Guid.NewGuid(), Nonce = new byte[11], Ciphertext = new byte[17], KeyVersion = 1 });
            await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
