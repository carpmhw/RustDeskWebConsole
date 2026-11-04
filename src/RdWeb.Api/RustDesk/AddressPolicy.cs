using System.Net;
using System.Net.Sockets;

namespace RdWeb.Api.RustDesk;

public static class AddressPolicy
{
    // 正規化mappedIPv4；metadata及不可路由目的地始終禁止。
    public static bool IsAllowed(IPAddress address, bool allowPrivate)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            if (bytes[0] == 0 || bytes[0] >= 224 || bytes[0] == 169 && bytes[1] == 254
                || address.Equals(IPAddress.Parse("100.100.100.200")) || address.Equals(IPAddress.Parse("168.63.129.16"))) return false;
            var privateAddress = bytes[0] is 10 or 127 || bytes[0] == 172 && bytes[1] is >= 16 and <= 31
                || bytes[0] == 192 && bytes[1] == 168 || bytes[0] == 100 && bytes[1] is >= 64 and <= 127
                || bytes[0] == 198 && bytes[1] is 18 or 19;
            return allowPrivate || !privateAddress;
        }
        if (address.AddressFamily != AddressFamily.InterNetworkV6 || address.Equals(IPAddress.IPv6Any)
            || address.IsIPv6Multicast || address.IsIPv6LinkLocal || address.ScopeId != 0
            || address.Equals(IPAddress.Parse("fd00:ec2::254"))) return false;
        if (IPAddress.IsLoopback(address)) return allowPrivate;
        if ((bytes[0] & 0xfe) == 0xfc || address.IsIPv6SiteLocal) return allowPrivate;
        // 不支援會隱藏IPv4目的地的deprecated/transition表示。
        if (bytes.Take(12).All(value => value == 0) || bytes[0] == 0x20 && bytes[1] == 0x02
            || bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0 && bytes[3] == 0) return false;
        return (bytes[0] & 0xe0) == 0x20;
    }
}
