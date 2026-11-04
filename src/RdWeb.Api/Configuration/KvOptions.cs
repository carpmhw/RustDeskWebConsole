using System.Globalization;
using StackExchange.Redis;

namespace RdWeb.Api.Configuration;

public sealed record KvOptions(ConfigurationOptions? Redis)
{
    // 解析標準 Redis URL，不將含認證資訊的輸入放進例外或日誌。
    public static KvOptions FromConfiguration(IConfiguration configuration)
    {
        var raw = configuration["REDIS_URL"];
        if (string.IsNullOrEmpty(raw)) return new((ConfigurationOptions?)null);
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || uri.Scheme is not ("redis" or "rediss")
            || string.IsNullOrEmpty(uri.Host) || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new InvalidOperationException("REDIS_URL 格式無效。");
        var database = 0;
        if (uri.AbsolutePath is not ("" or "/") && (!int.TryParse(uri.AbsolutePath.TrimStart('/'), NumberStyles.None, CultureInfo.InvariantCulture, out database) || database > 15))
            throw new InvalidOperationException("Redis database 必須在 0 至 15 之間。");
        var options = new ConfigurationOptions
        {
            Ssl = uri.Scheme == "rediss",
            DefaultDatabase = database,
            AbortOnConnectFail = true,
            ConnectRetry = 0,
            ConnectTimeout = 3000,
            AsyncTimeout = 3000,
            SyncTimeout = 3000
        };
        options.EndPoints.Add(uri.DnsSafeHost, uri.Port > 0 ? uri.Port : 6379);
        if (uri.UserInfo.Length > 0)
        {
            var parts = uri.UserInfo.Split(':', 2);
            if (parts.Length == 1) options.Password = Uri.UnescapeDataString(parts[0]);
            else
            {
                if (parts[0].Length > 0) options.User = Uri.UnescapeDataString(parts[0]);
                options.Password = Uri.UnescapeDataString(parts[1]);
            }
        }
        return new(options);
    }
}
