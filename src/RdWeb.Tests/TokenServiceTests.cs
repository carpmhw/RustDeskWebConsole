using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class TokenServiceTests
{
    // 發行只將摘要放進資料列，CSRF 隨 cookie 改變，JWT 必須通過完整驗證。
    [Fact]
    public void TokensHaveSeparatePurposesAndStrictValidation()
    {
        var options = new AuthOptions(RandomNumberGenerator.GetBytes(32), RandomNumberGenerator.GetBytes(32), 1);
        var service = new TokenService(options, new("/rdweb", new("https://tools.example.test/rdweb")), TimeProvider.System);
        var grant = service.Create(new User { Username = "fixture", Role = "admin" }, false);
        Assert.True(TokenService.TryParseRefresh(grant.RefreshValue, out var id));
        Assert.Equal(grant.Token.Id, id);
        Assert.False(string.Equals(grant.RefreshValue, grant.Token.TokenHash, StringComparison.Ordinal));
        Assert.True(TokenService.Matches(grant.RefreshValue, grant.Token.TokenHash));
        Assert.True(service.VerifyCsrf(grant.RefreshValue, grant.CsrfToken));
        Assert.False(service.VerifyCsrf(grant.RefreshValue + "x", grant.CsrfToken));
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var principal = handler.ValidateToken(grant.AccessToken, service.ValidationParameters(), out _);
        Assert.Equal("admin", principal.FindFirst("role")!.Value);
        var invalid = service.ValidationParameters();
        invalid.ValidAudience = "other";
        Assert.Throws<SecurityTokenInvalidAudienceException>(() => handler.ValidateToken(grant.AccessToken, invalid, out _));
        invalid = service.ValidationParameters();
        invalid.ValidIssuer = "other";
        Assert.Throws<SecurityTokenInvalidIssuerException>(() => handler.ValidateToken(grant.AccessToken, invalid, out _));
        Assert.ThrowsAny<Exception>(() => handler.ValidateToken(grant.RefreshValue, service.ValidationParameters(), out _));
        var parts = grant.AccessToken.Split('.');
        parts[1] = parts[1][..^1] + (parts[1][^1] == 'A' ? 'B' : 'A');
        Assert.ThrowsAny<Exception>(() => handler.ValidateToken(string.Join('.', parts), service.ValidationParameters(), out _));
        var expired = new TokenService(options, new("", new("http://localhost")), new PastClock()).Create(new User(), false);
        var expiredService = new TokenService(options, new("", new("http://localhost")), TimeProvider.System);
        Assert.Throws<SecurityTokenExpiredException>(() => handler.ValidateToken(expired.AccessToken, expiredService.ValidationParameters(), out _));
    }
    private sealed class PastClock : TimeProvider
    {
        // 過去發行的 token 用於驗證 lifetime，不關閉正式 JWT 檢查。
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.UtcNow.AddDays(-1);
    }
}
