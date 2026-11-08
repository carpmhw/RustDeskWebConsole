using System.Collections;
using System.Text;

namespace RdWeb.Api.Configuration;

public static class SecretFileConfiguration
{
    // 允許以 <NAME>_FILE 提供的秘密設定；清單外的 *_FILE 一律忽略。
    public static readonly string[] SecretNames = ["SECRET_KEY", "VAULT_KEY", "BOOTSTRAP_ADMIN_PASSWORD", "ROTATE_OLD_KEY", "ROTATE_NEW_KEY", "RECOVER_ADMIN_PASSWORD"];

    private const int MaxBytes = 4096;

    // 讀取 Docker secrets 等檔案來源並以記憶體設定提供；錯誤訊息只含設定名稱，不回顯路徑或內容。
    public static IConfigurationBuilder AddSecretFiles(this IConfigurationBuilder builder, IDictionary environment)
    {
        var values = new Dictionary<string, string?>();
        foreach (var name in SecretNames)
        {
            if (environment[name + "_FILE"] is not string path) continue;
            if (environment.Contains(name)) throw new InvalidOperationException($"{name} 與 {name}_FILE 不可同時設定。");
            byte[] bytes;
            try
            {
                // 先檢查大小再讀取，避免誤指向大型檔案；IO 例外訊息含路徑，於此邊界轉為安全訊息。
                if (new FileInfo(path).Length > MaxBytes) throw new InvalidOperationException($"{name}_FILE 無法使用。");
                bytes = File.ReadAllBytes(path);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                throw new InvalidOperationException($"{name}_FILE 無法使用。");
            }
            var value = Encoding.UTF8.GetString(bytes);
            if (value.EndsWith("\r\n", StringComparison.Ordinal)) value = value[..^2];
            else if (value.EndsWith('\n')) value = value[..^1];
            if (value.Length == 0) throw new InvalidOperationException($"{name}_FILE 無法使用。");
            values[name] = value;
        }
        return values.Count == 0 ? builder : builder.AddInMemoryCollection(values);
    }
}
