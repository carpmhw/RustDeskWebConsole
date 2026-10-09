using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public sealed record EndpointProbeResult(string Status, long LatencyMilliseconds);
public sealed class ConnectionProbe(ApprovedHostResolver resolver)
{
    // 解析後固定IP只做TCP接通，總期限有限，不讀／送任何協定內容。
    public async Task<EndpointProbeResult> CheckAsync(ServerEndpoint endpoint, bool allowPrivate, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        var watch = Stopwatch.StartNew();
        try
        {
            IPAddress[] addresses;
            try { addresses = await resolver.ResolveAsync(endpoint, allowPrivate, timeout.Token); }
            catch (SocketException) { return new("resolution_failed", watch.ElapsedMilliseconds); }
            foreach (var address in addresses)
            {
                using var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
                try { await socket.ConnectAsync(new IPEndPoint(address, endpoint.Port), timeout.Token); return new("reachable", watch.ElapsedMilliseconds); }
                catch (SocketException) { /* 嘗試同組已核准IP，不重新DNS。 */ }
            }
            return new("unreachable", watch.ElapsedMilliseconds);
        }
        catch (AuthException exception) { return new(exception.Code, watch.ElapsedMilliseconds); }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return new("timeout", watch.ElapsedMilliseconds); }
    }
}
