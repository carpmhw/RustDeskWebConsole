using System.Net;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public interface IHostResolver
{
    // DNS可取消，測試不需要真的查詢外部服務。
    Task<IPAddress[]> ResolveAsync(string host, CancellationToken cancellationToken);
}
public sealed class NativeHostResolver : IHostResolver
{
    // 使用官方.NET DNS介面，不保存長命解析結果。
    public Task<IPAddress[]> ResolveAsync(string host, CancellationToken cancellationToken) => Dns.GetHostAddressesAsync(host, cancellationToken);
}
public sealed class ApprovedHostResolver(IHostResolver resolver)
{
    // 每次使用重新檢查所有IP，再固定endpoint連線，不做第二次hostname lookup。
    public async Task<IPAddress[]> ResolveAsync(ServerEndpoint endpoint, bool allowPrivate, CancellationToken cancellationToken)
    {
        var addresses = IPAddress.TryParse(endpoint.Host, out var literal) ? [literal] : await resolver.ResolveAsync(endpoint.Host, cancellationToken);
        if (addresses.Length == 0 || addresses.Length > 8) throw new AuthException("resolution_failed", 400);
        if (addresses.Any(address => !AddressPolicy.IsAllowed(address, allowPrivate))) throw new AuthException("address_blocked", 400);
        return addresses.Select(address => address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address).Distinct().ToArray();
    }
}
