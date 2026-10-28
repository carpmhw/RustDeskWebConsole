using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 真lease／session／pipe／parser／Core整合；只有來源與Win32邊界被替換。
internal static class ProbeRunCases
{
    private const string Frame = "receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\",\"reason\":\"none\",\"cases\":[true,true,true,true,true,true,true],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"}\n";
    private const string Complete = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"complete\",\"reason\":\"none\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"matched\",\"cancelState\":\"not_requested\"}\n";
    private const string Mismatch = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"failed\",\"reason\":\"case_mismatch\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"mismatched\",\"cancelState\":\"not_requested\"}\n";
    private const string Interrupted = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"failed\",\"reason\":\"native_stderr_interrupted\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"mismatched\",\"cancelState\":\"not_requested\"}\n";

    // 訊息只含固定分類，不輸出原bytes／路徑／handle。
    private static void Check(bool value) => ProbeSourceCases.Require(value);
    // 固定公開fixture，沒有真exe或OS pipe；每路預設獨立queue。
    private static (OwnedProbeRun Run, FakeSourceApi Source, NativeSessionCases.FakeApi Native, OwnedProbeSources Lease) Create(string frame = Frame, bool eof = true)
    {
        var source = new FakeSourceApi();
        var lease = OwnedProbeSources.Acquire(source, source, source.Pins);
        var native = new NativeSessionCases.FakeApi { Streams = [new(), new()], Signaled = true, Active = 0 };
        if (frame.Length > 0) native.Streams[0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(frame)));
        if (eof) { native.Streams[0].Enqueue((IoState.Eof, [])); native.Streams[1].Enqueue((IoState.Eof, [])); }
        Check(OwnedProbeRun.TryCreate(lease, native, out var run) && run is not null);
        return (run!, source, native, lease);
    }
    // 正常library需要呼叫端逐步Poll；這是固定有限測試迴圈，不是產品busy loop。
    private static void Drain(OwnedProbeRun run) { for (var index = 0; index < 8; index++) run.Poll(); }
    // 完整可收尾fixture應立即終態，並驗parser仍接受同一全域診斷。
    private static ProbeDiagnostic Finish(OwnedProbeRun run, string status)
    {
        var value = run.Cleanup();
        Check(run.IsTerminal);
        var parsed = ProbeWire.Parse(ProbeWire.Format(value) + "receiver_native_supervisor_result,status=" + status + "\n");
        Check(parsed.Diagnostic == value);
        return value;
    }
    // 缺任何真實owner證據，完整matched literal都不可能相等。
    internal static void Matched()
    {
        var (run, source, native, _) = Create();
        Check(run.Prepare() && run.Launch());
        Check(source.Closed.Count == 0);
        Drain(run);
        var end = Finish(run, "observed");
        Check(ProbeWire.Format(end) == Complete && source.Closed.Count == source.Handles.Count);
        Check(native.Handles.Count == 0 && native.Memory.Count == 0 && native.JobKills == 0);
        Check(ReferenceEquals(run.Cleanup(), end));
        native.ReleaseFixture();
    }
    // 首false的案例前綴與R事件有不同reason，完整正常收尾才defect_observed。
    internal static void Defects()
    {
        foreach (var interrupted in new[] { false, true })
        {
            var frame = Frame.Replace("\"none\"", interrupted ? "\"native_stderr_interrupted\"" : "\"case_mismatch\"", StringComparison.Ordinal)
                .Replace("[true,true,true,true,true,true,true]", interrupted ? "[true,true,true,true,true,false]" : "[false]", StringComparison.Ordinal);
            var (run, _, native, _) = Create(frame);
            Check(run.Prepare() && run.Launch());
            Drain(run);
            Check(ProbeWire.Format(Finish(run, "defect_observed")) == (interrupted ? Interrupted : Mismatch));
            native.ReleaseFixture();
        }
    }
    // 先signal但缺最後一段或另一EOF時，不能先提交ChildExit鎖住案例。
    internal static void DeferredSignal()
    {
        var (run, _, native, _) = Create("", false);
        native.Streams![0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(Frame[..20])));
        Check(run.Prepare() && run.Launch());
        run.Poll();
        Check(run.Snapshot().ChildExit == EvidenceState.Unknown && run.Snapshot().CaseSet == ProbeCaseSet.Unknown);
        native.Streams[0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(Frame[20..])));
        native.Streams[0].Enqueue((IoState.Eof, []));
        Drain(run);
        Check(run.Snapshot().ChildExit == EvidenceState.Unknown);
        native.Streams[1].Enqueue((IoState.Eof, []));
        Drain(run);
        Check(ProbeWire.Format(Finish(run, "observed")) == Complete);
        native.ReleaseFixture();
    }
    // 合法JSON不夠；重複、額外內容、錯purpose或收尾與exit0矛盾都須拒絕。
    internal static void FrameRefusal()
    {
        Matched();
        foreach (var frame in new[] { "", "PUBLIC_BAD\n", Frame + Frame, Frame + "\n", Frame.Replace("receiver_native_child_cases_v1", "PUBLIC_WRONG", StringComparison.Ordinal),
            Frame.Replace("\"none\"", "\"cleanup_unconfirmed\"", StringComparison.Ordinal).Replace("\"childPolicyRestore\":\"confirmed\"", "\"childPolicyRestore\":\"unconfirmed\"", StringComparison.Ordinal),
            Frame.Replace("\"none\"", "\"case_mismatch\"", StringComparison.Ordinal).Replace("[true,true,true,true,true,true,true]", "[false]", StringComparison.Ordinal).Replace("\"childResourcesClose\":\"confirmed\"", "\"childResourcesClose\":\"unconfirmed\"", StringComparison.Ordinal),
            Frame.Replace("\"none\"", "\"guard_rejected\"", StringComparison.Ordinal).Replace("[true,true,true,true,true,true,true]", "[]", StringComparison.Ordinal) })
        {
            var (run, _, native, _) = Create(frame);
            Check(run.Prepare() && run.Launch()); Drain(run);
            var end = Finish(run, "unavailable");
            Check(end.Reason == ProbeReason.UnexpectedOutput && end.ChildExit != EvidenceState.Confirmed && end.CaseSet == ProbeCaseSet.Unknown);
            native.ReleaseFixture();
        }
        var dirty = Create();
        dirty.Native.Streams![1].Clear();
        dirty.Native.Streams[1].Enqueue((IoState.Complete, "PUBLIC_STDERR"u8.ToArray()));
        dirty.Native.Streams[1].Enqueue((IoState.Eof, []));
        Check(dirty.Run.Prepare() && dirty.Run.Launch()); Drain(dirty.Run);
        Check(Finish(dirty.Run, "unavailable").Reason == ProbeReason.UnexpectedOutput);
        dirty.Native.ReleaseFixture();
    }
    // 非零PS或取消後晚到合法frame不能恢復正常退出、案例及policy。
    internal static void ExitCancellation()
    {
        var badExit = Create();
        Check(badExit.Run.Prepare() && badExit.Run.Launch()); badExit.Native.ExitCode = 2;
        Drain(badExit.Run);
        var nonzero = Finish(badExit.Run, "unavailable");
        Check(nonzero.ChildExit != EvidenceState.Confirmed && nonzero.CaseSet == ProbeCaseSet.Unknown && nonzero.ChildPolicyRestore == EvidenceState.Unknown);
        badExit.Native.ReleaseFixture();
        var cancelled = Create("", false);
        cancelled.Native.Signaled = false; cancelled.Native.Active = 1;
        Check(cancelled.Run.Prepare() && cancelled.Run.Launch());
        cancelled.Run.Cleanup();
        cancelled.Native.Streams![0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(Frame)));
        cancelled.Native.Streams[0].Enqueue((IoState.Eof, [])); cancelled.Native.Streams[1].Enqueue((IoState.Eof, []));
        Drain(cancelled.Run); cancelled.Run.Cleanup(); cancelled.Source.ElapsedMs = 2000;
        var end = cancelled.Run.Cleanup();
        Check(cancelled.Run.IsTerminal && end.CaseSet == ProbeCaseSet.Unknown && end.CancelState != ProbeCancelState.NotRequested && cancelled.Native.JobKills == 1);
        cancelled.Native.ReleaseFixture();
    }
    // lease只能移交一次，第二個run不能關閉或使用原run的來源。
    internal static void SourceOwnership()
    {
        var (run, source, native, lease) = Create();
        Check(!OwnedProbeRun.TryCreate(lease, native, out var duplicate) && duplicate is null && source.Closed.Count == 0);
        Check(run.Prepare() && run.Launch());
        native.Active = 1; Drain(run);
        Check(source.Closed.Count == 0);
        native.Active = 0; Drain(run); Finish(run, "observed");
        Check(source.Closed.Count == source.Handles.Count);
        native.ReleaseFixture();
    }
    // native／source任一close失敗不能由其餘兩方補成ResourcesClose confirmed。
    internal static void CloseAggregation()
    {
        foreach (var sourceFailure in new[] { false, true })
        {
            var (run, source, native, _) = Create();
            Check(run.Prepare() && run.Launch()); Drain(run);
            source.CloseOk = !sourceFailure; native.AuxiliaryResult = sourceFailure;
            var end = Finish(run, "unavailable");
            Check(end.ResourcesClose == EvidenceState.Unconfirmed && end.CaseSet == ProbeCaseSet.Matched);
            native.ReleaseFixture();
        }
    }
    // 尚有後代或pending I/O時Cleanup只是進度，不能free kernel仍引用的配置。
    internal static void PendingCleanup()
    {
        var (run, source, native, _) = Create("", false);
        native.Signaled = false; native.Active = 1; native.CompleteOnKill = false; native.CancellationWillComplete = false;
        Check(run.Prepare() && run.Launch()); run.Poll();
        run.Cleanup();
        Check(!run.IsTerminal && source.Closed.Count == 0 && native.Memory.Count == 4);
        run.Cleanup(); Check(native.JobKills == 1);
        source.ElapsedMs = 2000;
        var terminal = run.Cleanup(); Check(run.IsTerminal && terminal.ResourcesClose != EvidenceState.Confirmed && native.Memory.Count == 4);
        native.Signaled = true; native.Active = 0;
        Check(ReferenceEquals(run.Cleanup(), terminal)); native.ReleaseFixture();
    }
    // normal等號與共享cleanup截止都不可追加時間或晚到採信。
    internal static void Deadlines()
    {
        var (run, source, native, _) = Create();
        Check(run.Prepare() && run.Launch()); source.ElapsedMs = 18000;
        Drain(run); var end = run.Cleanup();
        if (!run.IsTerminal) { source.ElapsedMs = 20000; end = run.Cleanup(); }
        Check(run.IsTerminal && end.CaseSet == ProbeCaseSet.Unknown && end.Reason == ProbeReason.Deadline);
        Check(ReferenceEquals(run.Cleanup(), end)); native.ReleaseFixture();
    }
    // 首次Cleanup先正常Poll並採信已buffered的案例，不能先送Core Cleanup阻止案例。
    internal static void BufferedCleanup()
    {
        var (run, _, native, _) = Create();
        Check(run.Prepare() && run.Launch()); run.Poll();
        Check(run.Snapshot().CaseSet == ProbeCaseSet.Unknown);
        Check(ProbeWire.Format(Finish(run, "observed")) == Complete);
        native.ReleaseFixture();
    }
    // 已close／逾期的lease或guard拒絕不能啟job／process。
    internal static void EarlyLaunchRefusal()
    {
        var closed = Create(); Check(closed.Lease.Close(2000));
        Check(!closed.Run.Prepare() && !closed.Run.Launch() && closed.Native.Acquisitions == 0);
        Finish(closed.Run, "unavailable"); closed.Native.ReleaseFixture();
        var failed = new FakeSourceApi { Volume = false };
        var lease = OwnedProbeSources.Acquire(failed, failed, failed.Pins);
        var native = new NativeSessionCases.FakeApi();
        Check(OwnedProbeRun.TryCreate(lease, native, out var run) && run is not null);
        Check(!run!.Prepare() && !run.Launch() && native.Acquisitions == 0);
        var end = Finish(run, "unavailable"); Check(end.SupervisorBoundaryVerify == EvidenceState.Unconfirmed && failed.Closed.Count == failed.Handles.Count);
        native.ReleaseFixture();
        foreach (var adopted in new[] { false, true })
        {
            var lost = Create();
            Check(lost.Run.Prepare() && lost.Run.Launch());
            if (adopted) Drain(lost.Run);
            Check(lost.Lease.Close(2000));
            Drain(lost.Run);
            var lostEnd = Finish(lost.Run, "unavailable");
            Check(lostEnd.ResourcesClose != EvidenceState.Confirmed);
            lost.Native.ReleaseFixture();
        }
        var duringPoll = Create();
        duringPoll.Native.Signaled = false;
        Check(duringPoll.Run.Prepare() && duringPoll.Run.Launch()); Drain(duringPoll.Run);
        duringPoll.Native.Signaled = true;
        duringPoll.Native.AfterObserve = () => Check(duringPoll.Lease.Close(2000));
        duringPoll.Run.Poll();
        Check(duringPoll.Run.Snapshot().CaseSet == ProbeCaseSet.Unknown);
        Finish(duringPoll.Run, "unavailable"); duringPoll.Native.ReleaseFixture();
    }
    // 新typed事件只映射UnexpectedOutput，首失敗與終態不可被重播取代。
    internal static void RejectedEvent()
    {
        var model = new ProbeModel();
        model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        model.Observe(ProbeEvent.Suspended, 0, true); model.Observe(ProbeEvent.Assigned, 0, true); model.Observe(ProbeEvent.Resumed, 0, true);
        model.Observe(ProbeEvent.ChildFrameRejected, 1, true);
        Check(model.Snapshot().Reason == ProbeReason.UnexpectedOutput);
        var end = model.Finish(2); model.Observe(ProbeEvent.ChildFrameRejected, 3, false);
        Check(ReferenceEquals(model.Finish(3), end));
        var early = new ProbeModel(); early.Observe(ProbeEvent.ChildFrameRejected, 0, true);
        Check(early.Finish(1).Reason == ProbeReason.GuardRejected);
        var first = new ProbeModel();
        first.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true); first.Observe(ProbeEvent.Suspended, 0, true);
        first.Observe(ProbeEvent.Assigned, 0, true); first.Observe(ProbeEvent.Resumed, 0, true);
        first.Observe(ProbeEvent.CaseE0, 1, false); first.Observe(ProbeEvent.ChildFrameRejected, 2, true);
        Check(first.Finish(3).Reason == ProbeReason.CaseMismatch);
    }
}
