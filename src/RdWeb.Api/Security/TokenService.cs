using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Security;

public sealed record SessionGrant(RefreshToken Token, string AccessToken, string RefreshValue, string CsrfToken);
public sealed class TokenService(AuthOptions options, AppOptions app, TimeProvider clock)
{
    // 發行新的 refresh 與固定十五分鐘 JWT；輪替維持原始期限與登入時間。
    public SessionGrant Create(User user, bool mfaVerified, Guid? family = null, DateTime? expiry = null, DateTime? authenticatedAt = null)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var token = new RefreshToken
        {
            UserId = user.Id,
            FamilyId = family ?? Guid.NewGuid(),
            AuthVersion = user.AuthVersion,
            MfaVerified = mfaVerified,
            AuthenticatedAt = authenticatedAt ?? now,
            ExpiresAt = expiry ?? now.AddDays(7)
        };
        var raw = token.Id.ToString("N") + "." + Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        token.TokenHash = Hash(raw);
        var claims = new[]
        {
            new Claim("sub", user.Id.ToString()), new Claim("role", user.Role), new Claim("sid", token.FamilyId.ToString()),
            new Claim("av", user.AuthVersion.ToString(System.Globalization.CultureInfo.InvariantCulture)), new Claim("mfa", mfaVerified ? "1" : "0"),
            new Claim("jti", Guid.NewGuid().ToString()), new Claim("iat", new DateTimeOffset(now).ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture), ClaimValueTypes.Integer64)
        };
        var jwt = new JwtSecurityToken(app.PublicUrl.AbsoluteUri.TrimEnd('/'), "rdweb-api", claims, now, now.AddMinutes(15),
            new SigningCredentials(new SymmetricSecurityKey(options.SigningKey), SecurityAlgorithms.HmacSha256));
        return new(token, new JwtSecurityTokenHandler().WriteToken(jwt), raw, Csrf(raw));
    }

    // 完整驗證簽章、用途型別、issuer、audience 與 lifetime，不接受其他演算法。
    public TokenValidationParameters ValidationParameters() => new()
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(options.SigningKey),
        ValidateIssuer = true,
        ValidIssuer = app.PublicUrl.AbsoluteUri.TrimEnd('/'),
        ValidateAudience = true,
        ValidAudience = "rdweb-api",
        ValidateLifetime = true,
        RequireExpirationTime = true,
        RequireSignedTokens = true,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ValidTypes = ["JWT"],
        ClockSkew = TimeSpan.Zero,
        NameClaimType = "sub",
        RoleClaimType = "role"
    };

    // 限制 refresh 格式及熵來源，不從任意文字取出資料列 ID。
    public static bool TryParseRefresh(string? raw, out Guid id)
    {
        id = default;
        if (raw?.Length != 76 || raw[32] != '.' || !Guid.TryParseExact(raw[..32], "N", out id)) return false;
        try { return Base64UrlEncoder.DecodeBytes(raw[33..]).Length == 32; }
        catch { return false; }
    }

    // 只保存 refresh 摘要，資料庫外洩不能直接重播 cookie。
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    // CSRF 與目前 cookie 綁定，輪替後不可沿用舊值。
    public string Csrf(string refresh) => Base64UrlEncoder.Encode(HMACSHA256.HashData(options.SigningKey, Encoding.UTF8.GetBytes("rdweb-csrf:" + refresh)));

    // 使用固定時間比較，錯誤格式僅回拒絕。
    public bool VerifyCsrf(string refresh, string? csrf)
    {
        if (csrf?.Length != 43) return false;
        try { return CryptographicOperations.FixedTimeEquals(Base64UrlEncoder.DecodeBytes(Csrf(refresh)), Base64UrlEncoder.DecodeBytes(csrf)); }
        catch { return false; }
    }

    // 摘要驗證使用固定時間，不將錯誤 cookie 視為重用。
    public static bool Matches(string raw, string hash)
    {
        try { return CryptographicOperations.FixedTimeEquals(Convert.FromHexString(Hash(raw)), Convert.FromHexString(hash)); }
        catch (FormatException) { return false; }
    }
}
