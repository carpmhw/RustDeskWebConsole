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
    // 連線結束移除entry，不保留challenge、proof或密碼。
    private void Remove(Guid id) { lock (_gate) _entries.Remove(id); }
}
public sealed class ActiveConnectionLease(Guid id, ConnectionGrant grant, VerifiedPeerIdentity peer, Action<Guid> remove) : IDisposable
{
    private readonly object _gate = new();
    private bool _active = true;
    private bool _claimed;
    public Guid Id => id;
    public ConnectionGrant Grant => grant;
    public VerifiedPeerIdentity Peer => peer;
    public bool IsActive { get { lock (_gate) return _active; } }
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
    // 先作廢entry，再釋放registry slot；重複dispose無副作用。
    public void Dispose()
    {
        lock (_gate) { if (!_active) return; _active = false; }
        remove(id);
    }
}
