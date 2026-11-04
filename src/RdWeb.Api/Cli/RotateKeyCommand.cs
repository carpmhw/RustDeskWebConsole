using System.Security.Cryptography;
using System.Text.Json;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Security;

namespace RdWeb.Api.Cli;

public static class RotateKeyCommand
{
    // 金鑰僅環境輸入，stdout只回版本／筆數，任何錯誤不帶低層內容。
    public static async Task<int> RunAsync(IConfiguration configuration)
    {
        byte[]? oldKey = null; byte[]? newKey = null;
        try
        {
            oldKey = Convert.FromBase64String(configuration["ROTATE_OLD_KEY"] ?? "");
            newKey = Convert.FromBase64String(configuration["ROTATE_NEW_KEY"] ?? "");
            if (oldKey.Length != 32 || newKey.Length != 32 || CryptographicOperations.FixedTimeEquals(oldKey, newKey)
                || !int.TryParse(configuration["ROTATE_OLD_VERSION"], out var oldVersion) || oldVersion < 1
                || !int.TryParse(configuration["ROTATE_NEW_VERSION"], out var newVersion) || newVersion <= oldVersion) throw new FormatException();
            var options = DatabaseOptions.FromConfiguration(configuration);
            await DatabaseInitializer.InitializeAsync(options);
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(options.Path));
            var result = await KeyRotation.RotateAsync(database, new Vault(oldKey, oldVersion), new Vault(newKey, newVersion));
            Console.WriteLine(JsonSerializer.Serialize(new { status = "ok", rotated_totp_count = result.TotpCount, rotated_secret_count = result.SecretCount, key_version = result.KeyVersion }));
            return 0;
        }
        catch { Console.Error.WriteLine("Vault 輪替失敗，請檢查環境與資料庫。"); return 1; }
        finally { if (oldKey != null) CryptographicOperations.ZeroMemory(oldKey); if (newKey != null) CryptographicOperations.ZeroMemory(newKey); }
    }
}
