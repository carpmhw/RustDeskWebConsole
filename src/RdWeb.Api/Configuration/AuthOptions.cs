namespace RdWeb.Api.Configuration;

public sealed record AuthOptions(byte[] SigningKey, byte[] VaultKey, int VaultKeyVersion)
{
    // 金鑰只能由設定來源注入，錯誤不能包含原值。
    public static AuthOptions FromConfiguration(IConfiguration configuration)
    {
        try
        {
            var signing = Convert.FromBase64String(configuration["SECRET_KEY"] ?? "");
            var vault = Convert.FromBase64String(configuration["VAULT_KEY"] ?? "");
            if (signing.Length != 32 || vault.Length != 32
                || !int.TryParse(configuration["VAULT_KEY_VERSION"] ?? "1", out var version) || version < 1)
                throw new FormatException();
            return new(signing, vault, version);
        }
        catch (FormatException) { throw new InvalidOperationException("SECRET_KEY／VAULT_KEY 必須是 Base64 32-byte 金鑰，版本必須是正整數。"); }
    }
}
