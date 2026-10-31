using System.Security.Cryptography;
using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 公開RAM檔案系統替身；不建立真檔案、程序或載入Windows DLL。
internal sealed class FakeSourceApi : IProbeSourceApi, IProbeClock
{
    internal const string Owner = "S-1-5-21-1000";
    internal readonly Dictionary<string, byte[]> Files;
    internal readonly Dictionary<nint, (string Path, bool Directory)> Handles = [];
    internal readonly Dictionary<nint, int> Positions = [];
    internal readonly List<nint> Closed = [];
    internal readonly List<string> Opens = [];
    internal readonly List<string> ClaimPaths = [];
    internal readonly HashSet<nint> ClaimHandles = [];
    internal Action? AfterClaim;
    internal bool FailClaim;
    internal nint ClaimFailure;
    internal bool ClaimCloseOk = true;
    internal Action<string>? Before;
    internal Func<SourceMetadata, SourceMetadata>? ChangeMetadata;
    internal SourceSecurity Security = new(Owner, true, true, [new(Owner, true, true)]);
    internal SourceIdentity Identity = new(Owner, true, false);
    internal bool Volume = true, CloseOk = true, AuxiliaryOk = true, ReadOk = true;
    internal bool FailOpen;
    internal int MetadataCalls;
    internal readonly IReadOnlyList<SourcePin> Pins;
    public bool Supported { get; set; } = true;
    public string PackageDirectory { get; set; } = "C:\\PUBLIC 空格 繁體\\probe";
    private string _systemDirectory = "C:\\Windows\\System32";
    public string SystemDirectory
    {
        // 系統路徑查詢也能耗盡budget，不能在其後再開始身份取得。
        get { Before?.Invoke("system"); return _systemDirectory; }
        set { _systemDirectory = value; }
    }
    public long ElapsedMs { get; set; }
    public bool IsRunning { get; set; } = true;

    // 五份公開測試bytes的pin獨立於正式來源，不讀原包或runtime。
    internal FakeSourceApi(string wrapper = "# PUBLIC\nexit 2\n", byte[]? wrapperBytes = null, Dictionary<string, byte[]>? files = null, bool baseline = false)
    {
        Files = files ?? new(StringComparer.OrdinalIgnoreCase);
        string[] names = ["start-windows-test-receiver.ps1", "windows-host-observer-supervisor.ps1", "node.exe", "PUBLIC 空格 繁體\\receiver-native-case.mjs", "receiver-native-child.ps1"];
        if (baseline) names[^1] = "receiver-native-baseline-child.ps1";
        var pins = new List<SourcePin>();
        foreach (var name in names)
        {
            var bytes = name == names[^1] && wrapperBytes is not null ? wrapperBytes : Encoding.UTF8.GetBytes(name == names[^1] ? wrapper : "PUBLIC_" + name);
            Files[PackageDirectory + "\\" + name] = bytes;
            pins.Add(new(name, name == names[^1] ? 12288 : 65536, Convert.ToHexStringLower(SHA256.HashData(bytes)), name == names[^1]));
        }
        Pins = pins.AsReadOnly();
    }

    // 取得身份只回公開typed值。
    public bool TryIdentity(out SourceIdentity identity) { Before?.Invoke("identity"); identity = Identity; return true; }
    // 必須精確使用固定檔名，檔案不存在不能被替身默默補成成功。
    public nint Open(string path, bool directory)
    {
        Before?.Invoke("open");
        Opens.Add(path);
        if (FailOpen || (!directory && !Files.ContainsKey(path))) return 0;
        var handle = (nint)(Handles.Count + 1);
        Handles.Add(handle, (path, directory));
        Positions.Add(handle, 0);
        return handle;
    }
    // 只模擬OS建立結果及持續存在的RAM目錄；不讀寫宿主檔案或證明NTFS原子性。
    public nint CreateClaim(string path)
    {
        Before?.Invoke("claim");
        ClaimPaths.Add(path);
        if (FailClaim) return ClaimFailure;
        if (!Files.TryAdd(path, [])) return -1;
        var handle = (nint)(Handles.Count + 1);
        Handles.Add(handle, (path, false));
        Positions.Add(handle, 0);
        ClaimHandles.Add(handle);
        AfterClaim?.Invoke();
        return handle;
    }
    // 檔案identity包含穩定handle與精確路徑，可模擬前後變更。
    public bool TryMetadata(nint handle, out SourceMetadata metadata)
    {
        Before?.Invoke("metadata");
        MetadataCalls++;
        var (path, directory) = Handles[handle];
        metadata = new(path, 1, (ulong)handle, directory ? 0 : Files[path].Length, directory ? 16u : 128u, 1);
        if (ChangeMetadata is not null) metadata = ChangeMetadata(metadata);
        return true;
    }
    // ACL只替換OS結果，真guard仍作owner／ACE決策。
    public bool TrySecurity(nint handle, out SourceSecurity security) { Before?.Invoke("security"); security = Security; return Handles.ContainsKey(handle); }
    // 不呼DriveInfo或真磁碟查詢。
    public bool TryVolume(nint handle, out bool fixedNtfs) { Before?.Invoke("volume"); fixedNtfs = Volume; return Handles.ContainsKey(handle); }
    // 分段回公開bytes，caller若超過4096會直接讓測試失敗。
    public bool TryRead(nint handle, Span<byte> buffer, out int count)
    {
        Before?.Invoke("read");
        ProbeSourceCases.Require(buffer.Length <= 4096);
        var bytes = Files[Handles[handle].Path];
        count = Math.Min(buffer.Length, bytes.Length - Positions[handle]);
        bytes.AsSpan(Positions[handle], count).CopyTo(buffer);
        Positions[handle] += count;
        return ReadOk;
    }
    // 記錄真owner所要求的close；重試同一筆會使測試失敗。
    public bool Close(nint handle) { Before?.Invoke("close"); ProbeSourceCases.Require(!Closed.Contains(handle)); Closed.Add(handle); return CloseOk && (!ClaimHandles.Contains(handle) || ClaimCloseOk); }
    // 輔助資源結果獨立，不能被檔案close蓋掉。
    public bool CloseAuxiliary() { Before?.Invoke("auxiliary"); return AuxiliaryOk; }
}
