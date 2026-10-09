using RdWeb.Api.Infrastructure.Kv;
using RdWeb.Api.Security;

namespace RdWeb.Api.RustDesk;

public sealed class ConnectionSlots(IKvStore store)
{
    // 非取消KV操作避免INCR已生效卻因caller cancellation遺失lease ownership。
    public async Task<IAsyncDisposable> AcquireAsync(Guid userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var global = false;
        var user = false;
        var key = "conn:" + userId;
        try
        {
            var count = await store.IncrementAsync("conn:all");
            global = true;
            if (count > 5) throw new AuthException("connection_limit", StatusCodes.Status429TooManyRequests);
            cancellationToken.ThrowIfCancellationRequested();
            await store.IncrementAsync(key);
            user = true;
            cancellationToken.ThrowIfCancellationRequested();
            return new Lease(store, key);
        }
        catch
        {
            try { if (user) await store.DecrementAsync(key); }
            finally { if (global) await store.DecrementAsync("conn:all"); }
            throw;
        }
    }

    private sealed class Lease(IKvStore store, string userKey) : IAsyncDisposable
    {
        private int _disposed;
        // 即使request已取消仍釋放計數；重複dispose只能歸還一次。
        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            try { await store.DecrementAsync(userKey); }
            finally { await store.DecrementAsync("conn:all"); }
        }
    }
}
