using OtpNet;

namespace RdWeb.Api.Security;

public sealed class TotpService
{
    // 使用六位 SHA-1 與有限視窗，回傳 counter 供原子防重播。
    public bool Verify(byte[] secret, string code, DateTime utcNow, out long counter)
    {
        counter = 0;
        return utcNow.Kind == DateTimeKind.Utc && code.Length == 6 && code.All(char.IsAsciiDigit)
            && new Totp(secret, step: 30, mode: OtpHashMode.Sha1, totpSize: 6).VerifyTotp(utcNow, code, out counter, new VerificationWindow(1, 1));
    }
}
