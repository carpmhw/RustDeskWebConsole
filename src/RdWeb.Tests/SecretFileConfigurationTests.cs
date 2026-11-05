using System.Collections;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Configuration;

namespace RdWeb.Tests;

public sealed class SecretFileConfigurationTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "rdweb-secret-file-" + Guid.NewGuid());

    // 每個測試使用獨立暫存目錄，避免檔案互相干擾。
    public SecretFileConfigurationTests() => Directory.CreateDirectory(directory);

    // 測試結束後移除暫存秘密檔。
    public void Dispose() => Directory.Delete(directory, true);

    // 寫入暫存秘密檔並回傳路徑。
    private string WriteSecret(string name, string content)
    {
        var path = Path.Combine(directory, name);
        File.WriteAllText(path, content);
        return path;
    }

    // 以指定環境建立只含秘密檔來源的設定。
    private static IConfiguration Build(IDictionary environment) =>
        new ConfigurationBuilder().AddSecretFiles(environment).Build();

    // 秘密檔只去除單一結尾換行，LF 與 CRLF 皆可。
    [Theory]
    [InlineData("abc\n")]
    [InlineData("abc\r\n")]
    [InlineData("abc")]
    public void ReadsValueFromFileAndTrimsOneTrailingNewline(string content)
    {
        var configuration = Build(new Hashtable { ["SECRET_KEY_FILE"] = WriteSecret("secret_key", content) });
        Assert.Equal("abc", configuration["SECRET_KEY"]);
    }

    // 同一設定同時由環境變數與檔案提供時拒絕，避免來源不明。
    [Fact]
    public void RejectsBothVariableAndFile()
    {
        var environment = new Hashtable { ["VAULT_KEY"] = "env-value", ["VAULT_KEY_FILE"] = WriteSecret("vault_key", "file-value\n") };
        var error = Assert.Throws<InvalidOperationException>(() => Build(environment));
        Assert.Contains("VAULT_KEY", error.Message);
        Assert.DoesNotContain("file-value", error.Message);
        Assert.DoesNotContain("env-value", error.Message);
    }

    // 不存在、空內容、只有換行或超過上限的檔案一律拒絕。
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("\n")]
    [InlineData("\r\n")]
    [InlineData("oversized")]
    public void RejectsMissingEmptyOrOversizedFile(string? content)
    {
        var path = content switch
        {
            null => Path.Combine(directory, "missing"),
            "oversized" => WriteSecret("big", new string('x', 4097)),
            _ => WriteSecret("value", content),
        };
        var error = Assert.Throws<InvalidOperationException>(() => Build(new Hashtable { ["ROTATE_NEW_KEY_FILE"] = path }));
        Assert.Contains("ROTATE_NEW_KEY_FILE", error.Message);
        Assert.DoesNotContain(directory, error.Message);
    }

    // 不在清單內的 *_FILE 不得被轉成設定值。
    [Fact]
    public void IgnoresUnlistedNames()
    {
        var configuration = Build(new Hashtable { ["OTHER_FILE"] = WriteSecret("other", "value") });
        Assert.Null(configuration["OTHER"]);
    }

    // 未提供任何 *_FILE 時不新增設定，沿用既有環境變數來源。
    [Fact]
    public void LeavesEnvironmentOnlyValuesUntouched()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["SECRET_KEY"] = "from-env" })
            .AddSecretFiles(new Hashtable { ["SECRET_KEY"] = "from-env" })
            .Build();
        Assert.Equal("from-env", configuration["SECRET_KEY"]);
    }

    // 錯誤訊息不得回顯檔案內的秘密。
    [Fact]
    public void ErrorDoesNotEchoSecret()
    {
        var environment = new Hashtable { ["BOOTSTRAP_ADMIN_PASSWORD"] = "x", ["BOOTSTRAP_ADMIN_PASSWORD_FILE"] = WriteSecret("password", "s3cret") };
        var error = Assert.Throws<InvalidOperationException>(() => Build(environment));
        Assert.DoesNotContain("s3cret", error.Message);
    }
}
