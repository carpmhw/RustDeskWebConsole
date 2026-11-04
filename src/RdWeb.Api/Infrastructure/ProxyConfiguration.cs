using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using RdWeb.Api.Configuration;

namespace RdWeb.Api.Infrastructure;

public static class ProxyConfiguration
{
    // 僅允許明確設定的代理轉送標頭，空設定也不能變成信任所有來源。
    public static ForwardedHeadersOptions Create(IConfiguration configuration, AppOptions application)
    {
        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.All,
            ForwardLimit = 1,
        };
        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();
        // 無可路由的來源佔位，避免框架將兩個空清單解讀成信任任意代理。
        options.KnownProxies.Add(IPAddress.None);
        options.AllowedHosts.Add(application.PublicUrl.Host);
        foreach (var value in (configuration["TRUSTED_PROXIES"] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (IPAddress.TryParse(value, out var address))
            {
                options.KnownProxies.Add(address);
            }
            else if (System.Net.IPNetwork.TryParse(value, out var network))
            {
                options.KnownIPNetworks.Add(network);
            }
            else
            {
                throw new InvalidOperationException("TRUSTED_PROXIES 包含非法 IP 或 CIDR。");
            }
        }
        return options;
    }
}
