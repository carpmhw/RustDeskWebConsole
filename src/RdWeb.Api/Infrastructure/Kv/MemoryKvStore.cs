using System.Globalization;

namespace RdWeb.Api.Infrastructure.Kv;

public sealed class MemoryKvStore(TimeProvider? timeProvider = null) : IKvStore
{
    private readonly TimeProvider _clock = timeProvider ?? TimeProvider.System;
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private sealed record Entry(string Value, DateTimeOffset? ExpiresAt);

    // 鎖內確認期限，避免取出已過期的認證資料。
    public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        Validate(key, null, cancellationToken);
        lock (_gate) return Task.FromResult(Read(key)?.Value);
    }

    // 寫入新值時明確重設 TTL。
    public Task SetWithTtlAsync(string key, string value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        Validate(key, ttl, cancellationToken);
        ArgumentNullException.ThrowIfNull(value);
        lock (_gate) _entries[key] = new(value, _clock.GetUtcNow() + ttl);
        return Task.CompletedTask;
    }

    // 將過期項目視為不存在，檢查與寫入保持同一原子區段。
    public Task<bool> SetIfAbsentWithTtlAsync(string key, string value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        Validate(key, ttl, cancellationToken);
        ArgumentNullException.ThrowIfNull(value);
        lock (_gate)
        {
            if (Read(key) != null) return Task.FromResult(false);
            _entries[key] = new(value, _clock.GetUtcNow() + ttl);
            return Task.FromResult(true);
        }
    }

    // 讀取與移除在同一鎖內，只有一個呼叫者能取得資料。
    public Task<string?> TakeOnceAsync(string key, CancellationToken cancellationToken = default)
    {
        Validate(key, null, cancellationToken);
        lock (_gate)
        {
            var entry = Read(key);
            _entries.Remove(key);
            return Task.FromResult(entry?.Value);
        }
    }

    // 只有新視窗設定期限，後續遞增不得延長 TTL。
    public Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        Validate(key, ttl, cancellationToken);
        lock (_gate)
        {
            var entry = Read(key);
            var value = checked(ParseCounter(entry) + 1);
            _entries[key] = new(value.ToString(CultureInfo.InvariantCulture), entry?.ExpiresAt ?? (entry == null && ttl.HasValue ? _clock.GetUtcNow() + ttl.Value : null));
            return Task.FromResult(value);
        }
    }

    // 不建立缺少的計數器，也不將現有值降至零以下。
    public Task<long> DecrementAsync(string key, CancellationToken cancellationToken = default)
    {
        Validate(key, null, cancellationToken);
        lock (_gate)
        {
            var entry = Read(key);
            var value = Math.Max(0, ParseCounter(entry) - 1);
            if (entry != null) _entries[key] = entry with { Value = value.ToString(CultureInfo.InvariantCulture) };
            return Task.FromResult(value);
        }
    }

    // 重啟初始化不清除其他短效工作資料。
    public Task ResetConnectionCountsAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
            foreach (var key in _entries.Keys.Where(key => key.StartsWith("conn:", StringComparison.Ordinal)).ToArray()) _entries.Remove(key);
        return Task.CompletedTask;
    }

    // 背景清掃只移除已過期項目，並回報清掃數量供測試驗證。
    public int SweepExpired()
    {
        lock (_gate)
        {
            var keys = _entries.Where(pair => pair.Value.ExpiresAt <= _clock.GetUtcNow()).Select(pair => pair.Key).ToArray();
            foreach (var key in keys) _entries.Remove(key);
            return keys.Length;
        }
    }

    // 呼叫者必須持有鎖；過期項目立即移除。
    private Entry? Read(string key)
    {
        if (!_entries.TryGetValue(key, out var entry)) return null;
        if (entry.ExpiresAt <= _clock.GetUtcNow()) { _entries.Remove(key); return null; }
        return entry;
    }

    // 計數器只允許非負十進位整數，禁止混用一般字串。
    private static long ParseCounter(Entry? entry)
    {
        if (entry == null) return 0;
        if (!long.TryParse(entry.Value, NumberStyles.None, CultureInfo.InvariantCulture, out var value)
            || value.ToString(CultureInfo.InvariantCulture) != entry.Value)
            throw new InvalidOperationException("KV 計數器格式無效。");
        return value;
    }

    // 共用鍵值、TTL 與取消驗證，Redis 採相同輸入契約。
    internal static void Validate(string key, TimeSpan? ttl, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        if (ttl.HasValue && (ttl.Value < TimeSpan.FromMilliseconds(1) || ttl.Value > TimeSpan.FromDays(365)))
            throw new ArgumentOutOfRangeException(nameof(ttl));
    }
}
