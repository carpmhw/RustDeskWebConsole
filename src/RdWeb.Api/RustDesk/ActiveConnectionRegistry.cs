using RdWeb.Api.Endpoints;

namespace RdWeb.Api.RustDesk;

public sealed class ActiveConnectionRegistry
{
    private readonly object _gate = new();
    private readonly Dictionary<Guid, ActiveConnectionLease> _entries = [];
    public int Count { get { lock (_gate) return _entries.Count; } }
    // 只有有session snapshot的合法bridge可註冊，容量硬限制五條。
    public ActiveConnectionLease Register(ConnectionGrant grant, VerifiedPeerIdentity peer)
    {
        lock (_gate)
        {
            if (grant.Session == null || grant.Session.FamilyId == Guid.Empty || _entries.Count >= 5)
                throw new InvalidOperationException("Active connection registration rejected.");
            var lease = new ActiveConnectionLease(Guid.NewGuid(), grant, peer, Remove);
            _entries.Add(lease.Id, lease);
            return lease;
        }
    }
    // Lookup只提供內部metadata，caller仍須Matches授權binding。
    public ActiveConnectionLease? Find(Guid id) { lock (_gate) return _entries.GetValueOrDefault(id); }
    // 列出符合條件的活躍grant快照，供需非同步重算權限的呼叫端判斷；不含proof或密碼。
    public ConnectionGrant[] Grants(Func<ConnectionGrant, bool> match)
    { lock (_gate) return _entries.Values.Select(lease => lease.Grant).Where(match).ToArray(); }
    // 鎖內快照符合條件的lease，鎖外逐一撤銷；回傳本次實際撤銷筆數，重複呼叫無副作用。
    public int Terminate(Func<ConnectionGrant, bool> match)
    {
        ActiveConnectionLease[] matched;
        lock (_gate) matched = _entries.Values.Where(lease => match(lease.Grant)).ToArray();
        return matched.Count(lease => lease.Revoke());
    }
    // 連線結束移除entry，不保留challenge、proof或密碼。
    private void Remove(Guid id) { lock (_gate) _entries.Remove(id); }
}
public sealed class ActiveConnectionLease(Guid id, ConnectionGrant grant, VerifiedPeerIdentity peer, Action<Guid> remove) : IDisposable
{
    private readonly object _gate = new();
    private readonly CancellationTokenSource _revocation = new();
    private bool _active = true;
    private bool _claimed;
    private bool _revoked;
    private bool _revoking;
    public Guid Id => id;
    public ConnectionGrant Grant => grant;
    public VerifiedPeerIdentity Peer => peer;
    public bool IsActive { get { lock (_gate) return _active; } }
    public bool Revoked { get { lock (_gate) return _revoked; } }
    // 取消來源釋放後不再存取，改回傳等價的固定token，避免ObjectDisposedException。
    public CancellationToken RevocationToken { get { lock (_gate) return _active || _revoking ? _revocation.Token : new(_revoked); } }
    // Binding需包含同一user/target/family/security version/MFA與role。
    public bool Matches(ConnectionGrant candidate) { lock (_gate) return _active && grant == candidate; }
    // 原子claim只可成功一次，dispose後不可再取得proof能力。
    public bool TryClaimAssist()
    {
        lock (_gate)
        {
            if (!_active || _claimed) return false;
            _claimed = true; return true;
        }
    }
    // 授權失效時只觸發一次取消；已釋放或已撤銷回false。取消期間延後dispose，避免取消已釋放的來源。
    internal bool Revoke()
    {
        lock (_gate)
        {
            if (!_active || _revoked) return false;
            _revoked = true; _revoking = true;
        }
        // Coordinator只註冊輕量通知callback，同步取消可確保回傳前token已轉為取消。
        try { _revocation.Cancel(); }
        finally
        {
            bool dispose;
            lock (_gate) { _revoking = false; dispose = !_active; }
            if (dispose) _revocation.Dispose();
        }
        return true;
    }
    // 先作廢entry，再釋放registry slot；重複dispose無副作用。
    public void Dispose()
    {
        bool dispose;
        lock (_gate) { if (!_active) return; _active = false; dispose = !_revoking; }
        remove(id);
        if (dispose) _revocation.Dispose();
    }
}
