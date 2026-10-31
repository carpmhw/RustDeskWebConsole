using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 真來源owner／session／Core，只在OS回傳邊界使用公開替身。
internal static class BaselineRunCases
{
    // 有界公開fixture不讀runtime或啟程序，保留來源與OS ownership。
    internal static (OwnedProbeRun Run, FakeSourceApi Source, NativeSessionCases.FakeApi Native) Create(string frame, uint exitCode = 0, bool eof = true)
    {
        var source = new FakeSourceApi(baseline: true);
        var lease = OwnedProbeSources.AcquireBaseline(source, source, source.Pins);
        var native = new NativeSessionCases.FakeApi { Streams = [new(), new()], Signaled = true, Active = 0, ExitCode = exitCode };
        if (frame.Length != 0) native.Streams[0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(frame)));
        if (eof) { native.Streams[0].Enqueue((IoState.Eof, [])); native.Streams[1].Enqueue((IoState.Eof, [])); }
        ProbeSourceCases.Require(OwnedProbeRun.TryCreateBaseline(lease, native, out var run));
        ProbeSourceCases.Require(run!.Prepare() && run.Launch());
        return (run, source, native);
    }

    // 固定次數poll僅驅動公開RAM queue，不等待真OS。
    internal static void Drain(OwnedProbeRun run)
    {
        for (var i = 0; i < 8; i++) run.Poll();
    }

    // 首問題與已發出的不可變snapshot不得被後來合法frame或finally沖掉。
    internal static void FirstProblemIsSticky()
    {
        var test = Create(BaselineChildCases.Input("case_mismatch", "false", BaselineChildCases.E0));
        Drain(test.Run);
        var snapshot = test.Run.BaselineSnapshot();
        ProbeSourceCases.Require(snapshot.ChildObservation == BaselineChildObservation.Accepted && snapshot.Comparison.FirstProblemCase == ChildProbeCase.E0);
        test.Native.Streams![0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(BaselineChildCases.Input("io_failed", "", BaselineChildCases.Threw))));
        test.Run.Cleanup();
        ProbeSourceCases.Require(test.Run.BaselineSnapshot().Comparison == snapshot.Comparison && snapshot.CancelObservation == BaselineCancelObservation.NotReached);
        test.Native.ReleaseFixture();
    }

    // throw傳來的未知raw不能由ref或上一案回填。
    internal static void ThrownRawRemainsUnknown()
    {
        var test = Create(BaselineChildCases.Input("io_failed", "", BaselineChildCases.Threw), 2);
        Drain(test.Run);
        var observation = test.Run.BaselineSnapshot();
        ProbeSourceCases.Require(observation.ChildObservation == BaselineChildObservation.Accepted && observation.Comparison.Invocation == BaselineInvocation.Threw &&
            observation.Comparison.RawType == BaselineValueType.Unknown && observation.Comparison.RawValue == BaselineRawValue.Unknown && observation.Comparison.OutputShape == BaselineOutputShape.Unknown);
        test.Run.Cleanup();
        test.Native.ReleaseFixture();
    }

    // 真exit2僅採診斷，不可提交Core退出／policy或成功案例。
    internal static void IoExitTwoObservationOnly()
    {
        var test = Create(BaselineChildCases.Input("io_failed", "", BaselineChildCases.Threw), 2);
        Drain(test.Run);
        var value = test.Run.Cleanup();
        ProbeSourceCases.Require(test.Run.BaselineSnapshot().ChildObservation == BaselineChildObservation.Accepted &&
            value.ChildExit != EvidenceState.Confirmed && value.ChildPolicyRestore != EvidenceState.Confirmed && value.CaseSet != ProbeCaseSet.Matched &&
            ProbeWire.FormatResult(value).Status == ProbeStatus.Unavailable);
        test.Native.ReleaseFixture();
    }

    // cleanup後才到的frame不能復活觀察，即使後來signal／EOF俱全。
    internal static void IoFrameAfterCleanupRejected()
    {
        var test = Create("", 2, false);
        test.Native.Signaled = false;
        test.Native.Active = 1;
        test.Run.Cleanup();
        test.Native.Streams![0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(BaselineChildCases.Input("io_failed", "", BaselineChildCases.Threw))));
        test.Native.Streams[0].Enqueue((IoState.Eof, [])); test.Native.Streams[1].Enqueue((IoState.Eof, []));
        Drain(test.Run);
        ProbeSourceCases.Require(test.Run.BaselineSnapshot().ChildObservation != BaselineChildObservation.Accepted);
        test.Native.ReleaseFixture();
    }

    // 欠EOF／stderr非空／晚到／來源失效／錯退出碼或超容量一律不能採信。
    internal static void LateOrDirtyFrameRejected()
    {
        foreach (var mode in new[] { "stderr", "deadline", "exit", "policy", "purpose", "overflow", "source" })
        {
            var frame = BaselineChildCases.Input("io_failed", "", BaselineChildCases.Threw);
            if (mode == "policy") frame = frame.Replace("\"childPolicyRestore\":\"confirmed\"", "\"childPolicyRestore\":\"unconfirmed\"");
            if (mode == "purpose") frame = frame.Replace("baseline_child_v1", "child_cases_v1");
            var test = Create(frame, mode == "exit" ? 7u : 2u);
            if (mode == "stderr") { test.Native.Streams![1].Clear(); test.Native.Streams[1].Enqueue((IoState.Complete, "PUBLIC"u8.ToArray())); test.Native.Streams[1].Enqueue((IoState.Eof, [])); }
            if (mode == "deadline") test.Source.ElapsedMs = 18000;
            if (mode == "source") test.Source.IsRunning = false;
            if (mode == "overflow")
            {
                test.Native.Streams![0].Clear();
                for (var i = 0; i < 8; i++) test.Native.Streams[0].Enqueue((IoState.Complete, new byte[1024]));
                test.Native.Streams[0].Enqueue((IoState.Complete, new byte[1]));
            }
            Drain(test.Run);
            ProbeSourceCases.Require(test.Run.BaselineSnapshot().ChildObservation != BaselineChildObservation.Accepted);
            test.Run.Cleanup();
            test.Native.ReleaseFixture();
        }
    }

    // 未signal不會查Job；不能把預設active或歷史非空快照當本次查詢。
    internal static void NoQueryIsUnknown()
    {
        var test = Create("", 0, false);
        test.Native.Signaled = false;
        test.Native.Active = 1;
        test.Run.Cleanup();
        var snapshot = test.Run.BaselineSnapshot();
        ProbeSourceCases.Require(snapshot.CancelObservation == BaselineCancelObservation.Sampled && snapshot.JobAtDecision == BaselineJobState.Unknown &&
            snapshot.TerminationAttempted == true && snapshot.TerminationResult == true);
        test.Native.ReleaseFixture();
        var failed = Create("", 0, false);
        failed.Native.QueryResult = false;
        failed.Run.Cleanup();
        ProbeSourceCases.Require(failed.Run.BaselineSnapshot().JobAtDecision == BaselineJobState.Unknown);
        failed.Native.ReleaseFixture();
    }

    // Core已選job，但session原重驗查空時不得聲稱真的終止。
    internal static void DecisionWithoutTermination()
    {
        var test = Create(BaselineChildCases.Input("case_mismatch", "false", BaselineChildCases.E0));
        test.Native.Active = 1;
        Drain(test.Run);
        test.Native.AfterQuery = () => test.Native.Active = 0;
        test.Run.Cleanup();
        var snapshot = test.Run.BaselineSnapshot();
        ProbeSourceCases.Require(snapshot.CancelTarget == CancelTarget.OwnedJob && snapshot.JobAtDecision == BaselineJobState.Empty &&
            snapshot.TerminationAttempted == false && snapshot.TerminationResult is null && test.Native.JobKills == 0);
        test.Native.ReleaseFixture();
    }

    // ch形狀的九證據也不能將requested取消洗成可信缺陷，前後Job狀態不得混淆。
    internal static void ChMismatchCancellationRemainsUnavailable()
    {
        var test = Create(BaselineChildCases.Input("case_mismatch", "false", BaselineChildCases.E0));
        test.Native.Active = 1;
        Drain(test.Run);
        var before = test.Native.QueryCalls;
        var value = test.Run.Cleanup();
        var snapshot = test.Run.BaselineSnapshot();
        ProbeSourceCases.Require(snapshot.ChildObservation == BaselineChildObservation.Accepted && snapshot.PsSignaledAtDecision == true && snapshot.JobAtDecision == BaselineJobState.Nonempty &&
            snapshot.CancelTarget == CancelTarget.OwnedJob && snapshot.TerminationAttempted == true && snapshot.TerminationResult == true && test.Native.JobKills == 1 && test.Native.QueryCalls - before == 3);
        ProbeSourceCases.Require(value.CancelState == ProbeCancelState.Requested && value.ChildExit == EvidenceState.Confirmed && value.ResourcesClose == EvidenceState.Confirmed &&
            value.TreeEmpty == EvidenceState.Confirmed && value.ChildPolicyRestore == EvidenceState.Confirmed && value.ChildStart == EvidenceState.Confirmed && value.JobAssigned == EvidenceState.Confirmed &&
            value.SupervisorBoundaryVerify == EvidenceState.Confirmed && value.StdoutEof == EvidenceState.Confirmed && value.StderrEof == EvidenceState.Confirmed && ProbeWire.FormatResult(value).Status == ProbeStatus.Unavailable);
        test.Native.ReleaseFixture();
    }

    // 舊入口保持舊六鍵frame採信，不能由新capture開關影響。
    internal static void LegacyRunUnaffected() => ProbeRunCases.Matched();
}
