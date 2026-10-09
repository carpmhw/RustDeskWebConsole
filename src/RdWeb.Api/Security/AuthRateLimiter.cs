using RdWeb.Api.Infrastructure.Kv;

namespace RdWeb.Api.Security;

public sealed class AuthRateLimiter(IKvStore store)
{
    // 帳號與來源各自限制，鍵只保留摘要而不暴露原始輸入。
    public async Task CheckAsync(string account, string ip, CancellationToken cancellationToken = default, string scope = "login")
    {
        await CheckIpAsync(ip, cancellationToken, scope);
        await CheckAccountAsync(account, cancellationToken, scope);
    }
    // 先檢查來源，已封鎖 IP 不得用任意新帳號造成 KV 鍵數成長。
    public async Task CheckIpAsync(string ip, CancellationToken cancellationToken, string scope)
    {
        if (await store.IncrementAsync("rl:" + scope + ":ip:" + TokenService.Hash(ip), TimeSpan.FromSeconds(60), cancellationToken) > 5)
            throw new AuthException("rate_limited", 429);
    }
    // 已知 MFA challenge 可補檢查帳號，不重複消耗 IP 配額。
    public async Task CheckAccountAsync(string account, CancellationToken cancellationToken, string scope)
    {
        if (await store.IncrementAsync("rl:" + scope + ":user:" + TokenService.Hash(account), TimeSpan.FromSeconds(60), cancellationToken) > 5)
            throw new AuthException("rate_limited", 429);
    }
}
