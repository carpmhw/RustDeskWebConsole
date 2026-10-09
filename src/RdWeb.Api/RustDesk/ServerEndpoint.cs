using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace RdWeb.Api.RustDesk;

public sealed record ServerEndpoint(string Host, int Port)
{
    // 只接受不含scheme/path/userinfo的明確host:port，拒絕模糊IPv4。
    public static ServerEndpoint Parse(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 320 || value.Any(char.IsWhiteSpace) || value.Contains('%')) throw Invalid();
        string host; string portText;
        if (value.StartsWith('['))
        {
            var end = value.IndexOf(']');
            if (end < 2 || end + 2 >= value.Length || value[end + 1] != ':') throw Invalid();
            host = value[1..end]; portText = value[(end + 2)..];
            if (!IPAddress.TryParse(host, out var ip) || ip.AddressFamily != AddressFamily.InterNetworkV6) throw Invalid();
            host = ip.ToString();
        }
        else
        {
            var separator = value.LastIndexOf(':');
            if (separator < 1) throw Invalid();
            host = value[..separator]; portText = value[(separator + 1)..];
            if (IPAddress.TryParse(host, out var ip))
            {
                if (ip.AddressFamily != AddressFamily.InterNetwork || ip.ToString() != host) throw Invalid();
            }
            else
            {
                if (host.Length > 253 || host.All(character => char.IsAsciiDigit(character) || character == '.')
                    || host.Split('.').Any(label => !Regex.IsMatch(label, "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"))) throw Invalid();
                host = host.ToLowerInvariant();
                if (host is "metadata" or "metadata.google.internal" or "instance-data" or "instance-data.ec2.internal") throw Invalid();
            }
        }
        if (!int.TryParse(portText, NumberStyles.None, CultureInfo.InvariantCulture, out var port) || port is < 1 or > 65535) throw Invalid();
        return new(host, port);
    }
    // IPv6保存時保留方括號，不與port分隔符混淆。
    public override string ToString() => (Host.Contains(':') ? "[" + Host + "]" : Host) + ":" + Port.ToString(CultureInfo.InvariantCulture);
    // 錯誤固定且不帶未驗證輸入內容。
    private static ArgumentException Invalid() => new("伺服器端點格式無效。");
}
