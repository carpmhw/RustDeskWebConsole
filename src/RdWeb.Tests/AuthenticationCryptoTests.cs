using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using RdWeb.Api.Configuration;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class AuthenticationCryptoTests
{
    // 每次加密採不同 nonce，錯誤列身分與篡改都必須拒絕。
    [Fact]
    public void VaultAuthenticatesRowAndCiphertext()
    {
        var vault = new Vault(RandomNumberGenerator.GetBytes(32));
        var plaintext = Encoding.UTF8.GetBytes("public-crypto-fixture");
        var encrypted = vault.Encrypt(plaintext, "user:fixture:totp");
        Assert.NotEqual(plaintext, encrypted.Ciphertext);
        Assert.Equal(12, encrypted.Nonce.Length);
        Assert.Equal(plaintext, vault.Decrypt(encrypted, "user:fixture:totp"));
        Assert.NotEqual(encrypted.Nonce, vault.Encrypt(plaintext, "user:fixture:totp").Nonce);
        Assert.Throws<CryptographicException>(() => vault.Decrypt(encrypted, "user:other:totp"));
        encrypted.Ciphertext[0] ^= 1;
        Assert.Throws<CryptographicException>(() => vault.Decrypt(encrypted, "user:fixture:totp"));
    }

    // RFC 6238 公開 SHA-1 向量以六位截取，並驗證 ±1 視窗與輸入格式。
    [Fact]
    public void TotpMatchesPublicVectorAndLimitedWindow()
    {
        var totp = new TotpService();
        var secret = Encoding.ASCII.GetBytes("12345678901234567890");
        var time = DateTime.UnixEpoch.AddSeconds(59);
        Assert.True(totp.Verify(secret, "287082", time, out var counter));
        Assert.Equal(1, counter);
        Assert.True(totp.Verify(secret, "287082", time.AddSeconds(30), out _));
        Assert.False(totp.Verify(secret, "287082", time.AddSeconds(60), out _));
        Assert.False(totp.Verify(secret, "28708x", time, out _));
        Assert.False(totp.Verify(secret, "94287082", time, out _));
    }

    // 缺少或損壞金鑰不能使用預設值，錯誤不回顯輸入。
    [Theory]
    [InlineData(null)]
    [InlineData("public-invalid-key")]
    [InlineData("YQ==")]
    public void InvalidKeysAreRejectedWithoutEcho(string? key)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["SECRET_KEY"] = key, ["VAULT_KEY"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)) }).Build();
        var error = Assert.Throws<InvalidOperationException>(() => AuthOptions.FromConfiguration(configuration));
        Assert.DoesNotContain("public-invalid-key", error.ToString());
    }
    // 備援碼具有高熵、獨立摘要，分組與大小寫標準化不影響驗證。
    [Fact]
    public void RecoveryCodesHaveUniqueHashesAndNormalizeDisplay()
    {
        var codes = RecoveryCodes.Generate(); Assert.Equal(10, codes.Distinct().Count());
        Assert.All(codes, code => Assert.Equal(32, code.Length));
        Assert.Equal(10, codes.Select(RecoveryCodes.Hash).Distinct().Count());
        Assert.Equal(RecoveryCodes.Hash(codes[0]), RecoveryCodes.Hash(codes[0][..16].ToLowerInvariant() + "-" + codes[0][16..].ToLowerInvariant()));
    }
}
