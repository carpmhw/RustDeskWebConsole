using System.Security.Cryptography;
using System.Text;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 來源驗證與實體持有分離；lease不寫Core成功，也不建立任何程序。
internal sealed class OwnedProbeSources
{
    private readonly IProbeSourceApi _api;
    private readonly IProbeClock _clock;
    private readonly List<(nint Handle, SourceMetadata Metadata, bool Private)> _sources = [];
    private ProbeLaunchPlan? _plan;
    private bool _failed, _closed, _closeResult, _clockInvalid, _transferred;
    private bool _claimTried, _claimConfirmed;
    private string _packageRoot = "", _ownerSid = "";
    private long _lastTime;

    // 來源失敗仍回owner，已取得handle不能遺失。
    private OwnedProbeSources(IProbeSourceApi api, IProbeClock clock) { _api = api; _clock = clock; }
    internal EvidenceState ResourcesClose { get; private set; } = EvidenceState.Unknown;
    internal IProbeClock Clock => _clock;
    // 單一序列呼叫端只可移交一次；guard拒絕仍可交給唯一run收尾。
    internal bool TryTransferOwnership()
    {
        if (_transferred || _closed) return false;
        _transferred = true;
        return true;
    }
    // 正式來源僅使用編譯pins，不接受外部清單。
    internal static OwnedProbeSources Acquire(IProbeSourceApi api, IProbeClock clock) => Acquire(api, clock, ProbeSourcePins.All);
    // 組件內政策單元消費固定pins；friend只替換OS邊界與公開資料。
    internal static OwnedProbeSources Acquire(IProbeSourceApi api, IProbeClock clock, IReadOnlyList<SourcePin> pins) => Acquire(api, clock, pins, false);
    // 基線入口固定自己的編譯pins與EXE辨識環境，不接受外部環境設定。
    internal static OwnedProbeSources AcquireBaseline(IProbeSourceApi api, IProbeClock clock) => AcquireBaseline(api, clock, BaselineSourcePins.All);
    // friend只替換公開來源與OS邊界；基線環境政策仍固定。
    internal static OwnedProbeSources AcquireBaseline(IProbeSourceApi api, IProbeClock clock, IReadOnlyList<SourcePin> pins) => Acquire(api, clock, pins, true);
    // 兩種固定政策共用相同來源驗證與資源持有，不由來源內容推測模式。
    private static OwnedProbeSources Acquire(IProbeSourceApi api, IProbeClock clock, IReadOnlyList<SourcePin> pins, bool baseline)
    {
        var owner = new OwnedProbeSources(api, clock);
        owner._failed = !owner.Verify(pins, baseline);
        return owner;
    }

    // Windows路徑在本邊界正規化一次；不使用Linux的Path.GetFullPath模擬Windows。
    private static string? LocalPath(string value)
    {
        if (value.Length < 3 || value.Length > 240 || !char.IsAsciiLetter(value[0]) || value[1] != ':' || value[2] != '\\') return null;
        var path = value.Length == 3 ? value : value.TrimEnd('\\');
        foreach (var part in path[3..].Split('\\'))
        {
            if (path.Length == 3) break;
            if (part.Length == 0 || part is "." or ".." || part.EndsWith(' ') || part.EndsWith('.') ||
                part.Any(character => character < 32 || "<>:\"/|?*".Contains(character, StringComparison.Ordinal))) return null;
        }
        return path;
    }

    // 同一clock跨來源／plan共用；負值、停止或倒退會黏住失敗。
    private bool Within(long end = 18000)
    {
        var now = _clock.ElapsedMs;
        if (!_clock.IsRunning || now < _lastTime || now < 0) _clockInvalid = true;
        if (_clockInvalid) { _failed = true; return false; }
        _lastTime = now;
        if (now >= end) { _failed = true; return false; }
        return true;
    }

    // 只檢包內private ACL；未知ACE絕不先丟掉再推定安全。
    private bool PrivateSecurity(nint handle, string sid, bool requireProtected)
    {
        if (!Within() || !_api.TrySecurity(handle, out var security) || !Within()) return false;
        return security.Owner == sid && security.DaclPresent && (!requireProtected || security.Protected) &&
            security.Aces.All(ace => ace.Supported && (!ace.Allow || ace.Sid == sid));
    }

    // 取得成功立即認領，即使API返回後已逾期也保留供caller收尾。
    private nint Open(string path, bool directory, bool privatePath, string sid)
    {
        if (!Within()) return 0;
        var handle = _api.Open(path, directory);
        if (handle is 0 or -1) return 0;
        _sources.Add((handle, new(path, 0, 0, 0, 0, 0), privatePath));
        if (!Within() || !_api.TryMetadata(handle, out var metadata) || !Within()) return 0;
        _sources[^1] = (handle, metadata, privatePath);
        if (!string.Equals(metadata.FinalPath, path, StringComparison.OrdinalIgnoreCase) ||
            (metadata.Attributes & 1024) != 0 || ((metadata.Attributes & 16) != 0) != directory ||
            (!directory && (metadata.Links != 1 || metadata.Length <= 0)) ||
            !_api.TryVolume(handle, out var fixedNtfs) || !Within() || !fixedNtfs ||
            (privatePath && !PrivateSecurity(handle, sid, directory))) return 0;
        return handle;
    }

    // 完整來源集合先驗pins，再stream hash；成功不會釋放用來穩定來源的handles。
    private bool Verify(IReadOnlyList<SourcePin> pins, bool baseline)
    {
        if (!_api.Supported || !Within()) return false;
        var root = LocalPath(_api.PackageDirectory);
        var system = LocalPath(_api.SystemDirectory);
        if (root is null || system is null || !system.EndsWith("\\System32", StringComparison.OrdinalIgnoreCase) ||
            !Within() || !_api.TryIdentity(out var identity) || !Within() || string.IsNullOrEmpty(identity.Sid) ||
            !identity.MembershipChecked || identity.EnabledAdmin) return false;
        // 包根與所有祖先持有至Close；Windows祖先不是強制owner-only。
        var ancestors = new List<string> { root[..3] };
        for (var index = 3; index < root.Length; index++) if (root[index] == '\\') ancestors.Add(root[..index]);
        if (root.Length > 3) ancestors.Add(root);
        ancestors.Add(root + "\\PUBLIC 空格 繁體");
        foreach (var directory in ancestors)
            if (Open(directory, true, directory.Length >= root.Length, identity.Sid) == 0) return false;
        byte[]? wrapper = null;
        var buffer = new byte[4096];
        foreach (var pin in pins)
        {
            if (pin.Sha256.Length != 64 || pin.MaxBytes <= 0) return false;
            var path = root + "\\" + pin.RelativePath;
            var handle = Open(path, false, true, identity.Sid);
            if (handle == 0) return false;
            var metadata = _sources[^1].Metadata;
            if (metadata.Length > pin.MaxBytes) return false;
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            using var source = pin.Wrapper ? new MemoryStream() : null;
            long length = 0;
            while (true)
            {
                if (!Within() || !_api.TryRead(handle, buffer, out var count) || !Within() || count < 0 || count > buffer.Length) return false;
                if (count == 0) break;
                length += count;
                if (length > metadata.Length || length > pin.MaxBytes) return false;
                hash.AppendData(buffer, 0, count);
                source?.Write(buffer, 0, count);
            }
            if (length != metadata.Length || Convert.ToHexStringLower(hash.GetHashAndReset()) != pin.Sha256) return false;
            if (source is not null) wrapper = source.ToArray();
        }
        if (wrapper is null || wrapper.Length == 0 || wrapper.AsSpan().StartsWith("\uFEFF"u8)) return false;
        string text;
        try { text = new UTF8Encoding(false, true).GetString(wrapper); }
        catch (DecoderFallbackException) { return false; }
        if (text.Contains('\0')) return false;
        foreach (var (handle, metadata, privatePath) in _sources)
        {
            if (!Within() || !_api.TryMetadata(handle, out var current) || !Within() || metadata != current ||
                (privatePath && !PrivateSecurity(handle, identity.Sid, (metadata.Attributes & 16) != 0))) return false;
        }
        var home = system[..^9];
        var application = system + "\\WindowsPowerShell\\v1.0\\powershell.exe";
        var command = "\"" + application + "\" -NoLogo -NoProfile -NonInteractive -STA -InputFormat Text -OutputFormat Text -EncodedCommand " +
            Convert.ToBase64String(Encoding.Unicode.GetBytes(text));
        if (command.Length > 32766 || !Within()) return false;
        var environment = "PSModulePath=" + system + "\\WindowsPowerShell\\v1.0\\Modules\0RDWEB_NATIVE_PROBE_ROOT=" + root +
            "\0SystemRoot=" + home + "\0WINDIR=" + home + "\0\0";
        if (baseline) environment = "PATHEXT=.EXE\0" + environment;
        _plan = new(application, command, environment, root);
        _packageRoot = root;
        _ownerSid = identity.Sid;
        return true;
    }

    // 只在同一lease仍持有且未失敗／關閉／逾期時交內部計畫。
    internal bool TryGetLaunchPlan(out ProbeLaunchPlan? plan)
    {
        plan = null;
        if (_closed || _failed || !Within() || _plan is null) return false;
        plan = _plan;
        return true;
    }

    // 啟動gate最多一次CreateNew；只對這個專用marker接受零長，普通pin來源規則不放寬。
    internal bool TryClaim()
    {
        if (_closed || _failed || !_transferred || _plan is null || !Within()) return false;
        if (_claimTried) return _claimConfirmed;
        _claimTried = true;
        var path = _packageRoot + "\\native-probe.claim";
        var handle = _api.CreateClaim(path);
        if (handle is 0 or -1) { _failed = true; return false; }
        // 取得後先認領，暫存描述元free失敗或返回已逾期都不能吞掉這筆handle。
        _sources.Add((handle, new(path, 0, 0, 0, 0, 0), true));
        if (!Within() || !_api.Supported || !_api.TryMetadata(handle, out var metadata) || !Within()) { _failed = true; return false; }
        _sources[^1] = (handle, metadata, true);
        _claimConfirmed = string.Equals(metadata.FinalPath, path, StringComparison.OrdinalIgnoreCase) &&
            (metadata.Attributes & (16 | 1024)) == 0 && metadata.Length == 0 && metadata.Links == 1 &&
            _api.TryVolume(handle, out var fixedNtfs) && Within() && fixedNtfs &&
            PrivateSecurity(handle, _ownerSid, true);
        if (!_claimConfirmed) _failed = true;
        return _claimConfirmed;
    }

    // 每筆最多close一次；caller提供首次共同cleanup截止，逾期不再操作handle。
    internal bool Close(long cleanupEndMs)
    {
        if (_closed) return _closeResult;
        _closed = true;
        if (cleanupEndMs <= 0 || cleanupEndMs > 20000) { ResourcesClose = EvidenceState.Unconfirmed; return false; }
        var result = true;
        for (var index = _sources.Count - 1; index >= 0; index--)
        {
            if (!Within(cleanupEndMs)) { result = false; break; }
            var closed = _api.Close(_sources[index].Handle);
            result = closed && Within(cleanupEndMs) && result;
        }
        if (Within(cleanupEndMs)) result = _api.CloseAuxiliary() && Within(cleanupEndMs) && result;
        else result = false;
        _closeResult = result;
        ResourcesClose = result ? EvidenceState.Confirmed : EvidenceState.Unconfirmed;
        return result;
    }
}
