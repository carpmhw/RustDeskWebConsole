using System.Diagnostics.CodeAnalysis;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// claim的OS建立邊界是RAM替身，guard／run／Core及實體handle持有決策皆是真實程式。
internal static class ProbeClaimCases
{
    private const string ClaimPath = "C:\\PUBLIC 空格 繁體\\probe\\native-probe.claim";
    private const string Frame = "receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\",\"reason\":\"none\",\"cases\":[true,true,true,true,true,true,true],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"}\n";

    // 固定斷言不回顯路徑、handle或例外。
    private static void Check([DoesNotReturnIf(false)] bool condition) => ProbeSourceCases.Require(condition);
    // run只由真正來源lease建立；不提供可跳過claim的測試入口。
    private static (OwnedProbeRun Run, OwnedProbeSources Lease, NativeSessionCases.FakeApi Native) Create(FakeSourceApi source)
    {
        var lease = OwnedProbeSources.Acquire(source, source, source.Pins);
        var native = new NativeSessionCases.FakeApi();
        Check(OwnedProbeRun.TryCreate(lease, native, out var run) && run is not null);
        return (run!, lease, native);
    }
    // 每組正向anchor須證明唯讀Acquire、claim先於native及最後持續保留marker。
    private static void Positive()
    {
        var source = new FakeSourceApi();
        var lease = OwnedProbeSources.Acquire(source, source, source.Pins);
        Check(source.ClaimPaths.Count == 0 && !source.Files.ContainsKey(ClaimPath));
        var native = new NativeSessionCases.FakeApi();
        native.AfterAcquire = _ => Check(source.ClaimPaths.Count == 1 && source.Files.ContainsKey(ClaimPath));
        Check(OwnedProbeRun.TryCreate(lease, native, out var run) && run is not null);
        Check(run!.Snapshot().SupervisorBoundaryVerify == EvidenceState.Confirmed && native.Acquisitions == 0);
        Check(source.ClaimPaths.SequenceEqual([ClaimPath]) && source.Files[ClaimPath].Length == 0);
        Check(lease.TryClaim() && source.ClaimPaths.Count == 1 && run.Prepare());
        run.Cleanup();
        Check(run.IsTerminal && source.Closed.Count == source.Handles.Count && source.Files.ContainsKey(ClaimPath));
        Check(!lease.TryClaim() && source.ClaimPaths.Count == 1);
        native.ReleaseFixture();
    }
    // 遇claim拒絕，真run不可取得任何native資源或重試建立；caller仍須收尾lease。
    private static void Rejected(FakeSourceApi source, bool created)
    {
        var (run, lease, native) = Create(source);
        Check(run.Snapshot().SupervisorBoundaryVerify == EvidenceState.Unconfirmed);
        Check(!run.Prepare() && !run.Launch() && native.Acquisitions == 0);
        Check(!lease.TryClaim() && source.ClaimPaths.Count <= 1);
        run.Cleanup();
        Check(run.IsTerminal && source.Closed.Count == source.Handles.Count && source.Files.ContainsKey(ClaimPath) == created);
        native.ReleaseFixture();
    }
    // 不可在未驗／未轉移／已close狀態寫入，且建立只用已驗root／SID而非晚到外部值。
    internal static void Ordering()
    {
        Positive();
        var source = new FakeSourceApi();
        var lease = OwnedProbeSources.Acquire(source, source, source.Pins);
        Check(!lease.TryClaim() && source.ClaimPaths.Count == 0);
        Check(lease.Close(2000) && !lease.TryClaim() && source.ClaimPaths.Count == 0);
        var rejected = new FakeSourceApi { Volume = false };
        Rejected(rejected, false);
        Check(rejected.ClaimPaths.Count == 0);
        var cached = new FakeSourceApi();
        var identities = 0;
        cached.Before = operation => { if (operation == "identity") identities++; };
        var held = OwnedProbeSources.Acquire(cached, cached, cached.Pins);
        cached.PackageDirectory = "C:\\PUBLIC_OTHER";
        cached.Identity = new("S-1-5-21-999", true, true);
        var native = new NativeSessionCases.FakeApi();
        Check(OwnedProbeRun.TryCreate(held, native, out var run) && run is not null);
        Check(run!.Snapshot().SupervisorBoundaryVerify == EvidenceState.Confirmed && identities == 1 && cached.ClaimPaths.SequenceEqual([ClaimPath]));
        run.Cleanup(); native.ReleaseFixture();
    }
    // 不得把失敗create改成open／truncate，也不得將新handle的異常metadata或ACL放行。
    internal static void Refusal()
    {
        Positive();
        var existing = new FakeSourceApi();
        byte[] original = [65, 66, 67]; existing.Files.Add(ClaimPath, original);
        Rejected(existing, true);
        Check(ReferenceEquals(existing.Files[ClaimPath], original) && !existing.Opens.Contains(ClaimPath));
        foreach (var invalid in new nint[] { 0, -1 }) Rejected(new() { FailClaim = true, ClaimFailure = invalid }, false);
        foreach (var change in new Func<SourceMetadata, SourceMetadata>[] {
            value => value with { Length = 1 }, value => value with { Attributes = 16 },
            value => value with { Attributes = 1024 }, value => value with { Links = 2 },
            value => value with { FinalPath = "C:\\PUBLIC_OTHER\\native-probe.claim" } })
        {
            var source = new FakeSourceApi(); source.AfterClaim = () => source.ChangeMetadata = change;
            Rejected(source, true);
        }
        foreach (var security in new SourceSecurity[] {
            new("S-1-5-21-999", true, true, []), new(FakeSourceApi.Owner, false, true, []),
            new(FakeSourceApi.Owner, true, false, []), new(FakeSourceApi.Owner, true, true, [new("S-1-1-0", true, true)]),
            new(FakeSourceApi.Owner, true, true, [new(FakeSourceApi.Owner, true, false)]) })
        {
            var source = new FakeSourceApi(); source.AfterClaim = () => source.Security = security;
            Rejected(source, true);
        }
        var wrongVolume = new FakeSourceApi(); wrongVolume.AfterClaim = () => wrongVolume.Volume = false;
        Rejected(wrongVolume, true);
        var auxiliary = new FakeSourceApi(); auxiliary.AfterClaim = () => { auxiliary.Supported = false; auxiliary.AuxiliaryOk = false; };
        Rejected(auxiliary, true);
    }
    // 17999仍有normal預算，18000或late成功不可繼續metadata／native，取得項仍須owned。
    internal static void Deadline()
    {
        Positive();
        foreach (var time in new long[] { 17999, 18000 })
        {
            var source = new FakeSourceApi(); var lease = OwnedProbeSources.Acquire(source, source, source.Pins);
            source.ElapsedMs = time;
            var native = new NativeSessionCases.FakeApi();
            Check(OwnedProbeRun.TryCreate(lease, native, out var run) && run is not null);
            Check((run!.Snapshot().SupervisorBoundaryVerify == EvidenceState.Confirmed) == (time == 17999));
            Check(source.ClaimPaths.Count == (time == 17999 ? 1 : 0) && native.Acquisitions == 0);
            run.Cleanup(); Check(run.IsTerminal && source.Closed.Count == source.Handles.Count);
            native.ReleaseFixture();
        }
        foreach (var cleanupExpired in new[] { false, true })
        {
            var source = new FakeSourceApi(); var calls = 0;
            source.AfterClaim = () => { source.ElapsedMs = 18000; calls = source.MetadataCalls; };
            var (run, _, native) = Create(source);
            Check(run.Snapshot().SupervisorBoundaryVerify != EvidenceState.Confirmed && !run.Prepare());
            Check(source.ClaimHandles.Count == 1 && source.MetadataCalls == calls && source.Files.ContainsKey(ClaimPath) && native.Acquisitions == 0);
            if (cleanupExpired) source.ElapsedMs = 20000;
            run.Cleanup(); Check(run.IsTerminal);
            Check(cleanupExpired ? source.Closed.Count == 0 : source.Closed.Count == source.Handles.Count);
            Check(source.Files.ContainsKey(ClaimPath)); native.ReleaseFixture();
        }
    }
    // 已建立marker不因後續prepare故障或正常收尾而撤回，claim close失敗也不能observed。
    internal static void PersistenceAndClose()
    {
        Positive();
        foreach (var failPrepare in new[] { false, true })
        {
            var source = new FakeSourceApi(); var (run, _, native) = Create(source);
            if (failPrepare) native.FailAt = 1;
            Check(run.Prepare() != failPrepare); run.Cleanup();
            Check(run.IsTerminal && source.Files.ContainsKey(ClaimPath) && source.ClaimPaths.Count == 1);
            var again = new FakeSourceApi(files: source.Files); Rejected(again, true);
            Check(again.ClaimPaths.Count == 1 && !again.Opens.Contains(ClaimPath)); native.ReleaseFixture();
        }
        var close = new FakeSourceApi(); var (heldRun, _, heldNative) = Create(close);
        heldNative.Streams = [new(), new()]; heldNative.Signaled = true; heldNative.Active = 0;
        heldNative.Streams[0].Enqueue((IoState.Complete, System.Text.Encoding.UTF8.GetBytes(Frame)));
        heldNative.Streams[0].Enqueue((IoState.Eof, [])); heldNative.Streams[1].Enqueue((IoState.Eof, []));
        Check(heldRun.Prepare() && heldRun.Launch());
        for (var index = 0; index < 8; index++) heldRun.Poll();
        close.ClaimCloseOk = false;
        var end = heldRun.Cleanup();
        Check(heldRun.IsTerminal && end.CaseSet == ProbeCaseSet.Matched && end.ResourcesClose == EvidenceState.Unconfirmed);
        Check(close.Closed.Count == close.Handles.Count && close.ClaimHandles.All(handle => close.Closed.Count(value => value == handle) == 1));
        close.ClaimCloseOk = true;
        Check(ReferenceEquals(heldRun.Cleanup(), end) && close.Files.ContainsKey(ClaimPath)); heldNative.ReleaseFixture();
    }
}
