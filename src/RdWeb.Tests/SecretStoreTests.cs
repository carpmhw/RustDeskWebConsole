using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class SecretStoreTests
{
    // 真實資料檔沒有明文，AAD阻止不同target資料列交換。
    [Fact]
    public async Task EncryptsPasswordsAndRejectsCrossTargetSwap()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-secret-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            var store = new EncryptedSecretStore(database, new Vault(RandomNumberGenerator.GetBytes(32)));
            var first = Guid.NewGuid(); var second = Guid.NewGuid();
            await store.SetAsync(first, "public-plaintext-marker");
            Assert.Equal("public-plaintext-marker", await store.GetAsync(first));
            Assert.DoesNotContain("public-plaintext-marker", Encoding.UTF8.GetString(await File.ReadAllBytesAsync(path)));
            await store.SetAsync(second, "another-public-marker");
            var rows = await database.EncryptedSecrets.ToListAsync();
            var a = rows.Single(row => row.ObjectId == first); var b = rows.Single(row => row.ObjectId == second);
            b.Ciphertext = a.Ciphertext; b.Nonce = a.Nonce; await database.SaveChangesAsync();
            await Assert.ThrowsAsync<CryptographicException>(() => store.GetAsync(second));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    // 啟動時有資料庫keycheck，錯key不能以相同version假裝可用。
    [Fact]
    public async Task VaultCheckBindsKeyAndVersion()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-keycheck-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            var vault = new Vault(RandomNumberGenerator.GetBytes(32));
            await VaultState.InitializeAsync(database, vault);
            await VaultState.InitializeAsync(database, vault);
            var wrong = await Assert.ThrowsAsync<InvalidOperationException>(() => VaultState.InitializeAsync(database, new Vault(RandomNumberGenerator.GetBytes(32))));
            Assert.Null(wrong.InnerException);
            await Assert.ThrowsAsync<InvalidOperationException>(() => VaultState.InitializeAsync(database, new Vault(RandomNumberGenerator.GetBytes(32), 2)));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    // Web啟動真的使用keycheck；相同DB換key需拒啟動而不是延後到登入才壞。
    [Fact]
    public async Task HostRejectsChangedVaultKey()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-vault-host-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        try
        {
            await using (var first = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = path }))))
            { using var client = first.CreateClient(); using var response = await client.GetAsync("/api/v1/health"); Assert.True(response.IsSuccessStatusCode); }
            await using var second = new TestApplicationFactory(builder => builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_PATH"] = path })));
            var error = Assert.Throws<InvalidOperationException>(() => second.CreateClient());
            Assert.Contains("Vault", error.Message); Assert.Null(error.InnerException);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
