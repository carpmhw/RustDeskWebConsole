using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 每組先驗正向lease，再驗其相對拒絕；只替換OS，不替換被測政策。
internal static class ProbeSourceCases
{
    // 固定安全斷言，不輸出路徑／SID／bytes或例外。
    internal static void Require(bool condition) { if (!condition) throw new InvalidOperationException("source_guard_assertion_failed"); }
    // 正向anchor會在拒絕基準實際FAIL，不能靠全拒絕通過負向。
    private static void Positive()
    {
        var api = new FakeSourceApi();
        var owner = OwnedProbeSources.Acquire(api, api, api.Pins);
        Require(owner.TryGetLaunchPlan(out var plan) && plan is not null);
        Require(owner.Close(2000) && api.Closed.Count == api.Handles.Count);
        Require(owner.ResourcesClose == EvidenceState.Confirmed && !owner.TryGetLaunchPlan(out _));
    }
    // 拒絕仍必須提供owner，所有已取得handle只關閉一次。
    private static void Rejected(FakeSourceApi api)
    {
        var owner = OwnedProbeSources.Acquire(api, api, api.Pins);
        Require(!owner.TryGetLaunchPlan(out _));
        Require(owner.Close(Math.Min(20000, api.ElapsedMs + 2000)));
        Require(api.Closed.Count == api.Handles.Count);
    }
    // 移除final-path、non-reparse或單link檢查都會讓對應負向失敗。
    internal static void PathsAndIdentity()
    {
        Positive();
        foreach (var path in new[] { "\\\\server\\share", "\\\\?\\C:\\PUBLIC", "C:\\PUBLIC:ads", "relative", "C:\\PUBLIC\\..\\probe", "C:\\PUBLIC.\\probe" })
            Rejected(new() { PackageDirectory = path });
        Rejected(new() { Volume = false });
        Rejected(new() { FailOpen = true });
        foreach (var change in new Func<SourceMetadata, SourceMetadata>[] {
            value => value with { Attributes = value.Attributes | 1024 },
            value => value with { FinalPath = "C:\\OTHER" },
            value => value.Length > 0 ? value with { Links = 2 } : value,
            value => value.Length > 0 ? value with { Attributes = 16 } : value })
            Rejected(new() { ChangeMetadata = change });
        var changed = new FakeSourceApi();
        changed.ChangeMetadata = value => changed.MetadataCalls > changed.Handles.Count ? value with { Index = 999 } : value;
        Rejected(changed);
        var missing = new FakeSourceApi();
        missing.Files.Remove(missing.PackageDirectory + "\\node.exe");
        Rejected(missing);
    }
    // 忽略membership查詢失敗、NULL ACL或陌生ACE都會錯放行。
    internal static void IdentityAndAcl()
    {
        Positive();
        Rejected(new() { Identity = new(FakeSourceApi.Owner, false, false) });
        Rejected(new() { Identity = new(FakeSourceApi.Owner, true, true) });
        foreach (var security in new SourceSecurity[] {
            new("S-1-5-21-999", true, true, []), new(FakeSourceApi.Owner, false, true, []),
            new(FakeSourceApi.Owner, true, false, []),
            new(FakeSourceApi.Owner, true, true, [new("S-1-1-0", true, true)]),
            new(FakeSourceApi.Owner, true, true, [new(FakeSourceApi.Owner, true, false)]) })
            Rejected(new() { Security = security });
    }
    // hash、長度與有界讀取必須各自成立，短讀或錯bytes不能由metadata補成功。
    internal static void PinsAndReadLimits()
    {
        Positive();
        Rejected(new() { ReadOk = false });
        foreach (var bytes in new[] { Array.Empty<byte>(), Encoding.ASCII.GetBytes("PUBLIC_WRONG"), new byte[65537] })
        {
            var api = new FakeSourceApi();
            api.Files[api.PackageDirectory + "\\node.exe"] = bytes;
            Rejected(api);
        }
        var shortRead = new FakeSourceApi();
        shortRead.ChangeMetadata = value => value.Length > 0 ? value with { Length = value.Length + 1 } : value;
        Rejected(shortRead);
    }
    // 取得後跨期限仍須認領；close失敗／倒退clock／晚到plan不可恢復。
    internal static void LifetimeAndDeadline()
    {
        Positive();
        Rejected(new() { ElapsedMs = 18000 });
        var stopped = new FakeSourceApi { IsRunning = false };
        var stoppedOwner = OwnedProbeSources.Acquire(stopped, stopped, stopped.Pins);
        Require(!stoppedOwner.TryGetLaunchPlan(out _) && !stoppedOwner.Close(2000) && stopped.Handles.Count == 0);
        var late = new FakeSourceApi();
        late.Before = operation => { if (operation == "open") late.ElapsedMs = 18000; };
        Rejected(late);
        foreach (var fileClose in new[] { true, false })
        {
            var api = new FakeSourceApi { CloseOk = fileClose, AuxiliaryOk = !fileClose };
            var owner = OwnedProbeSources.Acquire(api, api, api.Pins);
            Require(owner.TryGetLaunchPlan(out _));
            Require(!owner.Close(2000) && !owner.Close(4000));
            Require(owner.ResourcesClose == EvidenceState.Unconfirmed && api.Closed.Count == api.Handles.Count);
        }
        var expired = new FakeSourceApi();
        var held = OwnedProbeSources.Acquire(expired, expired, expired.Pins);
        expired.ElapsedMs = 18000;
        Require(!held.TryGetLaunchPlan(out _));
        Require(!held.Close(18000) && expired.Closed.Count == 0);
        var backwards = new FakeSourceApi { ElapsedMs = 10 };
        var lease = OwnedProbeSources.Acquire(backwards, backwards, backwards.Pins);
        backwards.ElapsedMs = 9;
        Require(!lease.TryGetLaunchPlan(out _));
        var invalidDeadline = new FakeSourceApi();
        var invalidOwner = OwnedProbeSources.Acquire(invalidDeadline, invalidDeadline, invalidDeadline.Pins);
        Require(!invalidOwner.Close(20001) && invalidDeadline.Closed.Count == 0);
        var slowSystem = new FakeSourceApi();
        var identityCalls = 0;
        slowSystem.Before = operation => { if (operation == "system") slowSystem.ElapsedMs = 18000; if (operation == "identity") identityCalls++; };
        Rejected(slowSystem);
        Require(identityCalls == 0);
        var rewind = new FakeSourceApi();
        rewind.Before = operation => { if (operation == "open") rewind.ElapsedMs = 18000; };
        var rewoundOwner = OwnedProbeSources.Acquire(rewind, rewind, rewind.Pins);
        rewind.Before = null;
        rewind.ElapsedMs = 17999;
        Require(!rewoundOwner.Close(19999) && rewind.Closed.Count == 0);
    }
    // 固定命令只能傳wrapper原文；環境不得沿用caller或重複prefix。
    internal static void LaunchPlan()
    {
        Positive();
        const string wrapper = "# PUBLIC 繁體\nexit 2\n";
        var api = new FakeSourceApi(wrapper);
        var owner = OwnedProbeSources.Acquire(api, api, api.Pins);
        Require(owner.TryGetLaunchPlan(out var plan) && plan is not null);
        Require(plan!.Application == "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
        Require(plan.Directory == "C:\\PUBLIC 空格 繁體\\probe");
        Require(plan.Environment == "PSModulePath=C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules\0RDWEB_NATIVE_PROBE_ROOT=C:\\PUBLIC 空格 繁體\\probe\0SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0");
        const string prefix = "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -NoLogo -NoProfile -NonInteractive -STA -InputFormat Text -OutputFormat Text -EncodedCommand ";
        Require(plan.CommandLine.StartsWith(prefix, StringComparison.Ordinal));
        Require(Encoding.Unicode.GetString(Convert.FromBase64String(plan.CommandLine[prefix.Length..])) == wrapper);
        foreach (var bad in new[] { "\uFEFFexit 2", "exit\0 2" }) Rejected(new(bad));
        Rejected(new(wrapperBytes: [0xed, 0xa0, 0x80]));
        Rejected(new(new string('x', 12288)));
        // 由短路徑基準選公開系統目錄長度，精確落在Win32命令列上限兩側。
        var limit = new FakeSourceApi(new string('x', 12200));
        var shortOwner = OwnedProbeSources.Acquire(limit, limit, limit.Pins);
        Require(shortOwner.TryGetLaunchPlan(out var shortPlan));
        var extra = 32766 - shortPlan!.CommandLine.Length;
        Require(extra > 0);
        limit = new(new string('x', 12200)) { SystemDirectory = "C:\\Windows" + new string('s', extra) + "\\System32" };
        var atLimit = OwnedProbeSources.Acquire(limit, limit, limit.Pins);
        Require(atLimit.TryGetLaunchPlan(out var limitPlan) && limitPlan!.CommandLine.Length == 32766);
        Rejected(new(new string('x', 12200)) { SystemDirectory = "C:\\Windows" + new string('s', extra + 1) + "\\System32" });
    }
}
