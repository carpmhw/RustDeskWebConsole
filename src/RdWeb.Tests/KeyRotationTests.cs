using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class KeyRotationTests
{
    // TOTP與目標祕密在同交易輪替，明文不變且AuthVersion不受影響。
    [Fact]
    public async Task RotationPreservesAllPlaintextAndRebindsStartupKey()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-rotate-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        var oldVault = new Vault(RandomNumberGenerator.GetBytes(32)); var next = new Vault(RandomNumberGenerator.GetBytes(32), 2);
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path)); await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            await VaultState.InitializeAsync(database, oldVault);
            var user = new User { Username = "fixture", NormalizedUsername = "FIXTURE" }; var plaintext = RandomNumberGenerator.GetBytes(20);
            var envelope = oldVault.Encrypt(plaintext, $"user:{user.Id}:totp");
            user.TotpSecretEnc = envelope.Ciphertext; user.TotpNonce = envelope.Nonce; user.TotpKeyVersion = envelope.KeyVersion; user.TotpEnabledAt = DateTime.UtcNow;
            database.Users.Add(user); await database.SaveChangesAsync(); var target = Guid.NewGuid();
            await new EncryptedSecretStore(database, oldVault).SetAsync(target, "public-rotation-marker");
            var result = await KeyRotation.RotateAsync(database, oldVault, next);
            Assert.Equal(new RotationResult(1, 1, 2), result);
            Assert.Equal("public-rotation-marker", await new EncryptedSecretStore(database, next).GetAsync(target));
            var bytes = next.Decrypt(new(user.TotpSecretEnc!, user.TotpNonce!, user.TotpKeyVersion!.Value), $"user:{user.Id}:totp");
            try { Assert.True(bytes.SequenceEqual(plaintext)); } finally { CryptographicOperations.ZeroMemory(bytes); CryptographicOperations.ZeroMemory(plaintext); }
            Assert.Equal(1, user.AuthVersion); Assert.Equal(2, user.TotpKeyVersion);
            await VaultState.InitializeAsync(database, next);
            await Assert.ThrowsAsync<InvalidOperationException>(() => VaultState.InitializeAsync(database, oldVault));
            Assert.Equal(1, await database.AuditLogs.CountAsync(audit => audit.Action == "VaultRotated"));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    // 任一cipher篡改造成整批rollback，已先處理的其它列與keycheck也不改變。
    [Fact]
    public async Task CorruptSecretRollsBackEarlierRowsAndKeyState()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-rotate-failure-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        var oldVault = new Vault(RandomNumberGenerator.GetBytes(32)); var next = new Vault(RandomNumberGenerator.GetBytes(32), 2);
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path));
            await using (var database = new AppDbContext(AppDbContextFactory.CreateOptions(path)))
            {
                await VaultState.InitializeAsync(database, oldVault);
                var store = new EncryptedSecretStore(database, oldVault);
                await store.SetAsync(Guid.NewGuid(), "first-public-marker"); await store.SetAsync(Guid.NewGuid(), "second-public-marker");
                var rows = await database.EncryptedSecrets.ToListAsync(); rows[1].Ciphertext[0] ^= 1;
                database.Entry(rows[1]).Property(row => row.Ciphertext).IsModified = true; await database.SaveChangesAsync();
                var error = await Assert.ThrowsAsync<InvalidOperationException>(() => KeyRotation.RotateAsync(database, oldVault, next));
                Assert.Null(error.InnerException);
            }
            await using var read = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            Assert.All(await read.EncryptedSecrets.ToListAsync(), row => Assert.Equal(1, row.KeyVersion));
            await VaultState.InitializeAsync(read, oldVault);
            Assert.Equal(0, await read.AuditLogs.CountAsync(audit => audit.Action == "VaultRotated"));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    // CLI格式／同key／版本倒退在碰到資料庫前拒絕，不打印金鑰。
    [Fact]
    public async Task CliRejectsSameKeyAndInvalidVersions()
    {
        var key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var configuration = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["ROTATE_OLD_KEY"] = key, ["ROTATE_NEW_KEY"] = key, ["ROTATE_OLD_VERSION"] = "1", ["ROTATE_NEW_VERSION"] = "2" }).Build();
        Assert.Equal(1, await RdWeb.Api.Cli.RotateKeyCommand.RunAsync(configuration));
        configuration["ROTATE_NEW_KEY"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)); configuration["ROTATE_NEW_VERSION"] = "1";
        Assert.Equal(1, await RdWeb.Api.Cli.RotateKeyCommand.RunAsync(configuration));
    }

    // 錯舊key與混合version都fail closed，DB版本與audit不部分改寫。
    [Fact]
    public async Task WrongOldKeyAndMixedVersionsDoNotChangeDatabase()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rdweb-rotate-mixed-" + Guid.NewGuid()); var path = Path.Combine(directory, "app.db");
        var oldVault = new Vault(RandomNumberGenerator.GetBytes(32)); var next = new Vault(RandomNumberGenerator.GetBytes(32), 2);
        try
        {
            await DatabaseInitializer.InitializeAsync(new(path)); await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(path));
            await VaultState.InitializeAsync(database, oldVault);
            await new EncryptedSecretStore(database, oldVault).SetAsync(Guid.NewGuid(), "public-old-marker");
            await Assert.ThrowsAsync<InvalidOperationException>(() => KeyRotation.RotateAsync(database, new Vault(RandomNumberGenerator.GetBytes(32)), next));
            await VaultState.InitializeAsync(database, oldVault);
            await new EncryptedSecretStore(database, next).SetAsync(Guid.NewGuid(), "public-mixed-marker");
            await Assert.ThrowsAsync<InvalidOperationException>(() => KeyRotation.RotateAsync(database, oldVault, next));
            Assert.Equal(new[] { 1, 2 }, await database.EncryptedSecrets.OrderBy(row => row.KeyVersion).Select(row => row.KeyVersion).ToArrayAsync());
            Assert.Equal(0, await database.AuditLogs.CountAsync(audit => audit.Action == "VaultRotated"));
            await VaultState.InitializeAsync(database, oldVault);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
