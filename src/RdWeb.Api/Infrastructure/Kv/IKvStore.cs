namespace RdWeb.Api.Infrastructure.Kv;

public interface IKvStore
{
    // 讀取未過期的值。
    Task<string?> GetAsync(string key, CancellationToken cancellationToken = default);
    // 覆寫值並重設有效期限。
    Task SetWithTtlAsync(string key, string value, TimeSpan ttl, CancellationToken cancellationToken = default);
    // 原子建立尚未存在的短效值。
    Task<bool> SetIfAbsentWithTtlAsync(string key, string value, TimeSpan ttl, CancellationToken cancellationToken = default);
    // 原子取出並刪除值。
    Task<string?> TakeOnceAsync(string key, CancellationToken cancellationToken = default);
    // 在固定 TTL 視窗內或無期限地遞增計數。
    Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default);
    // 保留有效期限並將計數遞減至最低零。
    Task<long> DecrementAsync(string key, CancellationToken cancellationToken = default);
    // 啟動時只重設 conn:* 計數。
    Task ResetConnectionCountsAsync(CancellationToken cancellationToken = default);
}
