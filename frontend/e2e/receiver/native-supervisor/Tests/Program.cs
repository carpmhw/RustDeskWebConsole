using System.Text;
using RdWeb.Receiver.NativeSupervisor;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 此入口只有公開RAM測試，不是能啟PS／Node的正式監督程式。
internal static class Program
{
    private const string CompleteLine = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"complete\",\"reason\":\"none\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"matched\",\"cancelState\":\"not_requested\"}\n";
    private const string CompleteWire = CompleteLine + "receiver_native_supervisor_result,status=observed\n";
    private const string FailedLine = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"failed\",\"reason\":\"cleanup_unconfirmed\",\"childStart\":\"confirmed\",\"childExit\":\"unknown\",\"childPolicyRestore\":\"unknown\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"matched\",\"cancelState\":\"not_requested\"}\n";

    // 只允許固定測試組；逐案收集失敗但不輸出例外、路徑或原始wire。
    private static int Main(string[] args)
    {
        if (args.Length != 1 || args[0] is not ("wire" or "model" or "native-abi" or "native-session" or "child-wire" or "source-guard" or "run-session" or "claim" or "console" or "baseline-wire" or "baseline-child" or "baseline-artifact" or "baseline-run" or "baseline-console" or "all")) return 2;
        (string Group, string Name, Action Run)[] tests =
        [
            ("baseline-wire", "UnknownCanonical", BaselineWireCases.UnknownCanonical),
            ("baseline-console", "BaselineArguments", BaselineConsoleCases.BaselineArguments),
            ("baseline-console", "LegacyArgumentsUnchanged", BaselineConsoleCases.LegacyArgumentsUnchanged),
            ("baseline-console", "BaselineConsoleMatched", BaselineConsoleCases.BaselineConsoleMatched),
            ("baseline-console", "BaselineConsoleIoExitTwo", BaselineConsoleCases.BaselineConsoleIoExitTwo),
            ("baseline-console", "BaselineConsoleCancellation", BaselineConsoleCases.BaselineConsoleCancellation),
            ("baseline-console", "ResultLineIsolation", BaselineConsoleCases.ResultLineIsolation),
            ("baseline-console", "DiagnosticDoesNotFillCore", BaselineConsoleCases.DiagnosticDoesNotFillCore),
            ("baseline-run", "FirstProblemIsSticky", BaselineRunCases.FirstProblemIsSticky),
            ("baseline-run", "ThrownRawRemainsUnknown", BaselineRunCases.ThrownRawRemainsUnknown),
            ("baseline-run", "IoExitTwoObservationOnly", BaselineRunCases.IoExitTwoObservationOnly),
            ("baseline-run", "IoFrameAfterCleanupRejected", BaselineRunCases.IoFrameAfterCleanupRejected),
            ("baseline-run", "LateOrDirtyFrameRejected", BaselineRunCases.LateOrDirtyFrameRejected),
            ("baseline-run", "NoQueryIsUnknown", BaselineRunCases.NoQueryIsUnknown),
            ("baseline-run", "DecisionWithoutTermination", BaselineRunCases.DecisionWithoutTermination),
            ("baseline-run", "ChMismatchCancellationRemainsUnavailable", BaselineRunCases.ChMismatchCancellationRemainsUnavailable),
            ("baseline-run", "LegacyRunUnaffected", BaselineRunCases.LegacyRunUnaffected),
            ("baseline-artifact", "BaselineArtifactContract", () => BaselineArtifactCases.BaselineArtifactContract()),
            ("baseline-artifact", "OriginalSourcesPreserved", () => BaselineArtifactCases.OriginalSourcesPreserved()),
            ("baseline-artifact", "BaselineSourceLaunchPlan", () => BaselineArtifactCases.BaselineSourceLaunchPlan()),
            ("baseline-artifact", "BaselineEnvironmentIsolation", BaselineArtifactCases.BaselineEnvironmentIsolation),
            ("baseline-artifact", "BaselineSourceRefusal", BaselineArtifactCases.BaselineSourceRefusal),
            ("baseline-child", "SevenMatchedNone", BaselineChildCases.SevenMatchedNone),
            ("baseline-child", "MismatchE0", BaselineChildCases.MismatchE0),
            ("baseline-child", "NativeStderrR", BaselineChildCases.NativeStderrR),
            ("baseline-child", "IoThrewPrefix", BaselineChildCases.IoThrewPrefix),
            ("baseline-child", "PurposeAndEntryIsolation", BaselineChildCases.PurposeAndEntryIsolation),
            ("baseline-child", "ComparisonCasePairs", BaselineChildCases.ComparisonCasePairs),
            ("baseline-wire", "E0ComparisonCanonical", BaselineWireCases.E0ComparisonCanonical),
            ("baseline-wire", "MalformedAtomicUnknown", BaselineWireCases.MalformedAtomicUnknown),
            ("baseline-wire", "CapacityAndForbiddenPayload", BaselineWireCases.CapacityAndForbiddenPayload),
            ("wire", "WireCanonical", WireCanonical),
            ("wire", "WirePolicyIsolation", WirePolicyIsolation),
            ("wire", "WireMalformed", WireMalformed),
            ("wire", "WireUnicode", WireUnicode),
            ("wire", "WireBoundaries", WireBoundaries),
            ("wire", "WireDefect", WireDefect),
            ("model", "ModelOrderedTrace", ModelOrderedTrace),
            ("model", "ModelBoundary", ModelBoundary),
            ("model", "ModelCancellation", ModelCancellation),
            ("model", "ModelSignal", ModelSignal),
            ("model", "ModelDeadline", ModelDeadline),
            ("model", "ModelStickyFailure", ModelStickyFailure),
            ("model", "ModelTerminal", ModelTerminal),
            ("model", "ModelInvalidEvent", ModelInvalidEvent),
            ("native-abi", "NativeStartupLayout", NativeAbiCases.StartupLayout),
            ("native-abi", "NativeJobIoLayout", NativeAbiCases.JobIoLayout),
            ("native-abi", "NativeEntryPoints", NativeAbiCases.EntryPoints),
            ("native-abi", "NativePlatformRefusal", NativeAbiCases.PlatformRefusal),
            ("native-session", "NativeHandleOwnership", NativeSessionCases.HandleOwnership),
            ("native-session", "NativeHandleReuse", NativeSessionCases.HandleReuse),
            ("native-session", "NativePendingConnect", NativeSessionCases.PendingConnect),
            ("native-session", "NativeDelayedConnectLaunch", NativeSessionCases.DelayedConnectLaunch),
            ("native-session", "NativeConnectCancellationRace", NativeSessionCases.ConnectCancellationRace),
            ("native-session", "NativeLatePipeAcquisition", NativeSessionCases.LatePipeAcquisition),
            ("native-session", "NativeCleanupPreventsLaunch", NativeSessionCases.CleanupPreventsLaunch),
            ("native-session", "NativeLatePollStopsCancellation", NativeSessionCases.LatePollStopsCancellation),
            ("native-session", "NativeCleanupClockProgress", NativeSessionCases.CleanupClockProgress),
            ("native-session", "NativePendingLifetime", NativeSessionCases.PendingLifetime),
            ("native-session", "NativeCapacity", NativeSessionCases.Capacity),
            ("native-session", "NativePartialPrepare", NativeSessionCases.PartialPrepare),
            ("native-session", "NativeAssignment", NativeSessionCases.Assignment),
            ("native-session", "NativePhysicalAssignmentGap", NativeSessionCases.PhysicalAssignmentGap),
            ("native-session", "NativePhysicalEmptyBeforeCleanup", NativeSessionCases.PhysicalEmptyBeforeCleanup),
            ("native-session", "NativePhysicalEmptyNegativeAndDeadline", NativeSessionCases.PhysicalEmptyNegativeAndDeadline),
            ("native-session", "NativePhysicalOwnershipRules", NativeSessionCases.PhysicalOwnershipRules),
            ("native-session", "NativeProcessBoundary", NativeSessionCases.ProcessBoundary),
            ("native-session", "NativeDrainAndGate", NativeSessionCases.DrainAndGate),
            ("native-session", "NativeCleanupDeadline", NativeSessionCases.CleanupDeadline),
            ("native-session", "NativeGuard", NativeSessionCases.Guard),
            ("child-wire", "ChildCanonical", ChildProbeWireCases.Canonical),
            ("child-wire", "ChildCaseFailures", ChildProbeWireCases.CaseFailures),
            ("child-wire", "ChildReasonPairs", ChildProbeWireCases.ReasonPairs),
            ("child-wire", "ChildMalformed", ChildProbeWireCases.Malformed),
            ("child-wire", "ChildByteBoundary", ChildProbeWireCases.ByteBoundary),
            ("child-wire", "ChildUnicode", ChildProbeWireCases.Unicode),
            ("source-guard", "SourcePathsAndIdentity", ProbeSourceCases.PathsAndIdentity),
            ("source-guard", "SourceIdentityAndAcl", ProbeSourceCases.IdentityAndAcl),
            ("source-guard", "SourcePinsAndReadLimits", ProbeSourceCases.PinsAndReadLimits),
            ("source-guard", "SourceLifetimeAndDeadline", ProbeSourceCases.LifetimeAndDeadline),
            ("source-guard", "SourceLaunchPlan", ProbeSourceCases.LaunchPlan),
            ("source-guard", "SourceNativeLayout", SourceNativeAbiCases.Layout),
            ("source-guard", "SourceNativeEntryPoints", SourceNativeAbiCases.EntryPoints),
            ("source-guard", "SourcePlatformRefusal", SourceNativeAbiCases.PlatformRefusal),
            // 包成無參數Action，CallerFilePath仍由測試方法自己的來源決定。
            ("source-guard", "ChildArtifactContract", () => ChildArtifactCases.Contract()),
            ("run-session", "RunMatched", ProbeRunCases.Matched),
            ("run-session", "RunDefects", ProbeRunCases.Defects),
            ("run-session", "RunDeferredSignal", ProbeRunCases.DeferredSignal),
            ("run-session", "RunFrameRefusal", ProbeRunCases.FrameRefusal),
            ("run-session", "RunExitCancellation", ProbeRunCases.ExitCancellation),
            ("run-session", "RunSourceOwnership", ProbeRunCases.SourceOwnership),
            ("run-session", "RunCloseAggregation", ProbeRunCases.CloseAggregation),
            ("run-session", "RunPendingCleanup", ProbeRunCases.PendingCleanup),
            ("run-session", "RunDeadlines", ProbeRunCases.Deadlines),
            ("run-session", "RunBufferedCleanup", ProbeRunCases.BufferedCleanup),
            ("run-session", "RunEarlyLaunchRefusal", ProbeRunCases.EarlyLaunchRefusal),
            ("run-session", "RunRejectedEvent", ProbeRunCases.RejectedEvent),
            ("claim", "ClaimOrdering", ProbeClaimCases.Ordering),
            ("claim", "ClaimRefusal", ProbeClaimCases.Refusal),
            ("claim", "ClaimDeadline", ProbeClaimCases.Deadline),
            ("claim", "ClaimPersistenceAndClose", ProbeClaimCases.PersistenceAndClose),
            ("console", "ConsoleResultFormat", ProbeConsoleCases.ResultFormat),
            ("console", "ConsoleArguments", ProbeConsoleCases.Arguments),
            ("console", "ConsoleMatched", ProbeConsoleCases.Matched),
            ("console", "ConsoleDefects", ProbeConsoleCases.Defects),
            ("console", "ConsoleDelayedLaunch", ProbeConsoleCases.DelayedLaunch),
            ("console", "ConsoleDeferredFrame", ProbeConsoleCases.DeferredFrame),
            ("console", "ConsoleRefusal", ProbeConsoleCases.Refusal),
            ("console", "ConsoleDeadlines", ProbeConsoleCases.Deadlines),
            ("console", "ConsoleClock", ProbeConsoleCases.Clock),
            ("console", "ConsolePendingCleanup", ProbeConsoleCases.PendingCleanup),
            ("console", "ConsoleFailures", ProbeConsoleCases.Failures)
        ];
        var selected = tests.Where(test => args[0] == "all" || test.Group == args[0]).ToArray();
        if (selected.Length == 0) return 2;
        var failed = 0;
        foreach (var test in selected)
        {
            try { test.Run(); }
            catch (Exception)
            {
                failed++;
                Console.WriteLine($"receiver_native_supervisor_core_test,name={test.Name},status=failed");
            }
        }
        Console.WriteLine($"receiver_native_supervisor_core_tests,total={selected.Length},failed={failed}");
        return failed == 0 ? 0 : 1;
    }

    // 斷言只含固定訊息，runner不反射失敗時的實際資料。
    private static void Check(bool condition)
    {
        if (!condition) throw new InvalidOperationException("public_core_assertion_failed");
    }

    // 手寫正向資料與wire各自獨立，避免formatter產生自己的預期。
    private static ProbeDiagnostic Complete() => new()
    {
        Phase = ProbePhase.Complete,
        Reason = ProbeReason.None,
        ChildStart = EvidenceState.Confirmed,
        ChildExit = EvidenceState.Confirmed,
        ChildPolicyRestore = EvidenceState.Confirmed,
        SupervisorBoundaryVerify = EvidenceState.Confirmed,
        ResourcesClose = EvidenceState.Confirmed,
        JobAssigned = EvidenceState.Confirmed,
        TreeEmpty = EvidenceState.Confirmed,
        StdoutEof = EvidenceState.Confirmed,
        StderrEof = EvidenceState.Confirmed,
        CaseSet = ProbeCaseSet.Matched,
        CancelState = ProbeCancelState.NotRequested
    };

    // 精確固定例外才算formatter拒絕，不接受任意執行期錯誤求通過。
    private static void Reject(ProbeDiagnostic diagnostic)
    {
        var rejected = false;
        try { _ = ProbeWire.Format(diagnostic); }
        catch (InvalidOperationException error)
        {
            rejected = error.Message == "receiver_native_supervisor_diagnostic_unavailable";
        }
        Check(rejected);
    }

    // 每項證據皆有獨立缺證負向，不因只測policy而遺漏其他收尾欄。
    private static ProbeDiagnostic WithEvidence(ProbeDiagnostic value, int index, EvidenceState state) => index switch
    {
        0 => value with { ChildStart = state },
        1 => value with { ChildExit = state },
        2 => value with { ChildPolicyRestore = state },
        3 => value with { SupervisorBoundaryVerify = state },
        4 => value with { ResourcesClose = state },
        5 => value with { JobAssigned = state },
        6 => value with { TreeEmpty = state },
        7 => value with { StdoutEof = state },
        8 => value with { StderrEof = state },
        _ => throw new InvalidOperationException("public_core_case_unavailable")
    };

    // 若key序、版本或newline偏移，必須在正向canonical的真輸出被抓到。
    private static void WireCanonical()
    {
        Check(ProbeWire.Format(Complete()) == CompleteLine);
        foreach (var wire in new[] { CompleteWire, CompleteWire.Replace("\n", "\r\n", StringComparison.Ordinal) })
        {
            var result = ProbeWire.Parse(wire);
            Check(result.Status == ProbeStatus.Observed && result.Diagnostic == Complete());
        }
        Check(ProbeWire.Unknown().Version == 3 && ProbeWire.Unknown().ChildExit == EvidenceState.Unknown);
    }

    // 省略／負向九證據或替換舊父policy欄，不能誤判新版成功。
    private static void WirePolicyIsolation()
    {
        Check(ProbeWire.Parse(CompleteWire).Status == ProbeStatus.Observed);
        for (var index = 0; index < 9; index++)
            foreach (var state in new[] { EvidenceState.Unknown, EvidenceState.NotAcquired, EvidenceState.Unconfirmed })
                Reject(WithEvidence(Complete(), index, state));
        foreach (var wire in new[]
        {
            CompleteWire.Replace("supervisorBoundaryVerify", "parentPolicyVerify", StringComparison.Ordinal),
            CompleteWire.Replace("\"version\":3", "\"version\":2", StringComparison.Ordinal),
            CompleteWire.Replace("\"childPolicyRestore\":\"confirmed\",", "", StringComparison.Ordinal),
            CompleteWire.Replace("receiver_native_supervisor_", "receiver_native_job_", StringComparison.Ordinal)
        }) Check(ProbeWire.Parse(wire).Diagnostic.Phase == ProbePhase.Unknown);
    }

    // 重複key、空白、enum與結果矛盾即使能JSON解析也必須拒絕。
    private static void WireMalformed()
    {
        Check(ProbeWire.Parse(CompleteWire).Status == ProbeStatus.Observed);
        foreach (var wire in new[]
        {
            CompleteWire.Replace("\"version\":3", "\"version\":3,\"version\":3", StringComparison.Ordinal),
            CompleteWire.Replace("{\"version\"", "{ \"version\"", StringComparison.Ordinal),
            CompleteWire.Replace("\"confirmed\"", "2", StringComparison.Ordinal),
            CompleteWire.Replace("\"none\"", "\"unknown\"", StringComparison.Ordinal),
            CompleteWire.Replace("status=observed", "status=unavailable", StringComparison.Ordinal),
            CompleteWire + "\n", CompleteWire[..^1], "\n" + CompleteWire,
            CompleteWire.Replace("\n", "\r", StringComparison.Ordinal), "{invalid}", ""
        }) Check(ProbeWire.Parse(wire).Diagnostic.Phase == ProbePhase.Unknown);
        Check(ProbeWire.Parse(null).Status == ProbeStatus.Unavailable);
        Reject(Complete() with { Reason = (ProbeReason)999 });
        Reject(Complete() with { ChildExit = (EvidenceState)(-1) });
    }

    // 原始UTF-8 byte上限包含CRLF，不得先trim／normalize後再接受超額內容。
    private static void WireBoundaries()
    {
        Check(ProbeWire.Parse(CompleteWire).Status == ProbeStatus.Observed);
        foreach (var newline in new[] { "\n", "\r\n" })
        {
            var wire = CompleteWire.Replace("\n", newline, StringComparison.Ordinal);
            var atLimit = wire.Replace("{", "{" + new string(' ', 8192 - Encoding.UTF8.GetByteCount(wire)), StringComparison.Ordinal);
            Check(Encoding.UTF8.GetByteCount(atLimit) == 8192);
            Check(ProbeWire.Parse(atLimit).Status == ProbeStatus.Unavailable);
            Check(ProbeWire.Parse(atLimit + " ").Diagnostic.Phase == ProbePhase.Unknown);
        }
    }

    // JSON語法可接受的孤立surrogate仍不能成為enum字串；decoder拒絕須回unknown而非外洩例外。
    private static void WireUnicode()
    {
        Check(ProbeWire.Parse(CompleteWire).Status == ProbeStatus.Observed);
        foreach (var token in new[] { "\\uD800", "\\uDC00", "\\uD800A", "\\u0000", "PUBLIC_中文" })
        {
            var wire = CompleteWire.Replace("\"complete\"", "\"" + token + "\"", StringComparison.Ordinal);
            Check(ProbeWire.Parse(wire).Diagnostic.Phase == ProbePhase.Unknown);
        }
    }

    // 真不符與正常退出缺證分開，已空的樹不能補政策或exit0。
    private static void WireDefect()
    {
        var failure = ProbeWire.Parse(FailedLine + "receiver_native_supervisor_result,status=unavailable\n");
        Check(failure.Diagnostic.TreeEmpty == EvidenceState.Confirmed);
        Check(failure.Diagnostic.ChildExit == EvidenceState.Unknown);
        Check(ProbeWire.Format(failure.Diagnostic) == FailedLine);
        foreach (var reason in new[] { ProbeReason.CaseMismatch, ProbeReason.NativeStderrInterrupted })
        {
            var diagnostic = Complete() with { Phase = ProbePhase.Failed, Reason = reason, CaseSet = ProbeCaseSet.Mismatched };
            var line = CompleteLine.Replace("\"phase\":\"complete\",\"reason\":\"none\"",
                reason == ProbeReason.CaseMismatch ? "\"phase\":\"failed\",\"reason\":\"case_mismatch\"" : "\"phase\":\"failed\",\"reason\":\"native_stderr_interrupted\"", StringComparison.Ordinal)
                .Replace("\"caseSet\":\"matched\"", "\"caseSet\":\"mismatched\"", StringComparison.Ordinal);
            Check(ProbeWire.Format(diagnostic) == line);
            Check(ProbeWire.Parse(line + "receiver_native_supervisor_result,status=defect_observed\n").Status == ProbeStatus.DefectObserved);
            var missing = diagnostic with { StdoutEof = EvidenceState.Unconfirmed };
            Check(ProbeWire.Parse(ProbeWire.Format(missing) + "receiver_native_supervisor_result,status=unavailable\n").Status == ProbeStatus.Unavailable);
        }
    }

    // 正常launch只提交公開安全事實，沒有測試替身API或程序建立。
    private static void Launch(ProbeModel model)
    {
        model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        model.Observe(ProbeEvent.Suspended, 1, true);
        model.Observe(ProbeEvent.Assigned, 2, true);
        model.Observe(ProbeEvent.Resumed, 3, true);
    }

    // 固定七案順序供不同生命週期交互使用，不由模型產生測試輸入。
    private static void Cases(ProbeModel model, long start = 4)
    {
        ProbeEvent[] cases =
        [
            ProbeEvent.CaseE0, ProbeEvent.CaseE1, ProbeEvent.CaseE2, ProbeEvent.CaseE7,
            ProbeEvent.CaseO, ProbeEvent.CaseR, ProbeEvent.CaseA
        ];
        for (var index = 0; index < cases.Length; index++) model.Observe(cases[index], start + index, true);
    }

    // 獨立正常收尾trace要求兩EOF與查空，不以exit0或cleanup返回代替。
    private static CancelDecision Close(ProbeModel model, long start = 11, bool normalExit = true)
    {
        model.Observe(normalExit ? ProbeEvent.ChildExit : ProbeEvent.ProcessSignaled, start, true);
        model.Observe(ProbeEvent.TreeEmpty, start + 1, true);
        model.Observe(ProbeEvent.StdoutEof, start + 2, true);
        model.Observe(ProbeEvent.StderrEof, start + 3, true);
        model.Observe(ProbeEvent.ChildPolicyRestore, start + 4, true);
        var decision = model.Cleanup(start + 5);
        model.Observe(ProbeEvent.ResourcesClose, start + 6, true);
        return decision;
    }

    // 模型最終必須逐字符合獨立完整literal，不能只測formatter與自己往返。
    private static void ModelOrderedTrace()
    {
        var model = new ProbeModel();
        Check(model.Snapshot().Phase == ProbePhase.Unknown);
        Launch(model);
        Cases(model);
        Check(Close(model) == new CancelDecision(CancelTarget.None, 2016));
        var terminal = model.Finish(18);
        Check(terminal == Complete());
        Check(ProbeWire.Format(terminal) == CompleteLine);
    }

    // 監督自身前置條件與child政策不同；亂序／重播不能把失敗launch恢復成功。
    private static void ModelBoundary()
    {
        foreach (var replacement in new[] { ProbeEvent.ChildPolicyRestore, (ProbeEvent)999 })
        {
            var model = new ProbeModel();
            model.Observe(replacement, 0, true);
            model.Observe(ProbeEvent.Suspended, 1, true);
            Check(model.Finish(2).Reason == ProbeReason.GuardRejected);
            Check(model.Snapshot().ChildStart == EvidenceState.Unknown);
        }
        var rejected = new ProbeModel();
        rejected.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, false);
        rejected.Observe(ProbeEvent.SupervisorBoundaryVerify, 1, true);
        Check(rejected.Snapshot().SupervisorBoundaryVerify == EvidenceState.Unconfirmed);
        foreach (var first in new[] { ProbeEvent.Assigned, ProbeEvent.Resumed })
        {
            var model = new ProbeModel();
            model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
            model.Observe(first, 1, true);
            Check(model.Finish(2).Reason == ProbeReason.GuardRejected);
        }
        var duplicate = new ProbeModel();
        Launch(duplicate);
        duplicate.Observe(ProbeEvent.CaseE0, 4, true);
        duplicate.Observe(ProbeEvent.CaseE0, 5, true);
        Check(duplicate.Finish(6).Reason == ProbeReason.GuardRejected);
    }

    // 只決策同輪owned目標一次，取消回值與晚到exit0不能補正常成功。
    private static void ModelCancellation()
    {
        var beforeAssign = new ProbeModel();
        beforeAssign.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        beforeAssign.Observe(ProbeEvent.Suspended, 1, true);
        beforeAssign.Observe(ProbeEvent.Assigned, 2, false);
        Check(beforeAssign.Cleanup(3) == new CancelDecision(CancelTarget.OwnedProcess, 2003));
        Check(beforeAssign.Cleanup(4) == new CancelDecision(CancelTarget.None, 2003));
        var assigned = new ProbeModel();
        Launch(assigned);
        assigned.Observe(ProbeEvent.Assigned, 4, false);
        Check(assigned.Cleanup(5) == new CancelDecision(CancelTarget.OwnedJob, 2005));
        assigned.Observe(ProbeEvent.Cancelled, 6, true);
        assigned.Observe(ProbeEvent.ProcessSignaled, 7, true);
        assigned.Observe(ProbeEvent.ChildExit, 8, true);
        assigned.Observe(ProbeEvent.TreeEmpty, 9, true);
        assigned.Observe(ProbeEvent.StdoutEof, 10, true);
        assigned.Observe(ProbeEvent.StderrEof, 11, true);
        assigned.Observe(ProbeEvent.ResourcesClose, 12, true);
        var terminal = assigned.Finish(13);
        Check(terminal.TreeEmpty == EvidenceState.Confirmed && terminal.ChildExit == EvidenceState.Unconfirmed);
        Check(terminal.ChildPolicyRestore == EvidenceState.Unknown && terminal.CancelState == ProbeCancelState.Requested);
        Check(assigned.Cleanup(14).Target == CancelTarget.None);
        var negative = new ProbeModel();
        Launch(negative);
        negative.Cleanup(4);
        negative.Observe(ProbeEvent.Cancelled, 5, false);
        negative.Observe(ProbeEvent.Cancelled, 6, true);
        Check(negative.Finish(7).CancelState == ProbeCancelState.Unconfirmed);
    }

    // PS退出、Node樹空與正常exit0分開；buffered frame不代表可再resume。
    private static void ModelSignal()
    {
        var nonzero = new ProbeModel();
        Launch(nonzero);
        Cases(nonzero);
        Check(Close(nonzero, 11, false).Target == CancelTarget.None);
        var failure = nonzero.Finish(18);
        Check(failure.Phase == ProbePhase.Failed && failure.ChildExit == EvidenceState.Unknown);
        Check(failure.TreeEmpty == EvidenceState.Confirmed && failure.ResourcesClose == EvidenceState.Confirmed);
        Check(ProbeWire.Parse(ProbeWire.Format(failure) + "receiver_native_supervisor_result,status=unavailable\n").Diagnostic == failure);
        var noSignal = new ProbeModel();
        Launch(noSignal);
        noSignal.Observe(ProbeEvent.TreeEmpty, 4, true);
        Check(noSignal.Finish(5).Reason == ProbeReason.GuardRejected);
        var stillOwned = new ProbeModel();
        Launch(stillOwned);
        stillOwned.Observe(ProbeEvent.ProcessSignaled, 4, true);
        Check(stillOwned.Cleanup(5).Target == CancelTarget.OwnedJob);
        var buffered = new ProbeModel();
        Launch(buffered);
        buffered.Observe(ProbeEvent.ProcessSignaled, 4, true);
        Cases(buffered, 5);
        Close(buffered, 12);
        Check(buffered.Finish(19).Phase == ProbePhase.Complete);
        foreach (var action in new[] { ProbeEvent.Assigned, ProbeEvent.Resumed })
        {
            var stopped = new ProbeModel();
            stopped.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
            stopped.Observe(ProbeEvent.Suspended, 1, true);
            stopped.Observe(ProbeEvent.ProcessSignaled, 2, true);
            stopped.Observe(action, 3, true);
            Check(stopped.Finish(4).ChildStart == EvidenceState.Unknown);
            Check(stopped.Cleanup(5).Target == CancelTarget.None);
        }
    }

    // 共用deadline等號失敗；晚到所有權只能供既有剩餘budget收尾。
    private static void ModelDeadline()
    {
        foreach (var time in new long[] { 17999, 18000 })
        {
            var model = new ProbeModel();
            Launch(model);
            Cases(model);
            model.Observe(ProbeEvent.ChildExit, 11, true);
            model.Observe(ProbeEvent.TreeEmpty, 12, true);
            model.Observe(ProbeEvent.StdoutEof, 13, true);
            model.Observe(ProbeEvent.StderrEof, 14, true);
            model.Observe(ProbeEvent.ChildPolicyRestore, time, true);
            model.Cleanup(time);
            model.Observe(ProbeEvent.ResourcesClose, time, true);
            Check(model.Finish(time).Phase == (time == 17999 ? ProbePhase.Complete : ProbePhase.Failed));
        }
        var late = new ProbeModel();
        late.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        Check(late.Cleanup(18000) == new CancelDecision(CancelTarget.None, 20000));
        late.Observe(ProbeEvent.Suspended, 18001, true);
        late.Observe(ProbeEvent.Assigned, 18002, true);
        late.Observe(ProbeEvent.Resumed, 18003, true);
        Check(late.Cleanup(18004) == new CancelDecision(CancelTarget.OwnedJob, 20000));
        late.Observe(ProbeEvent.ProcessSignaled, 20000, true);
        Check(late.Finish(20000).ChildStart == EvidenceState.Unknown);
        var equality = new ProbeModel();
        Launch(equality);
        Check(equality.Cleanup(4).DeadlineMs == 2004);
        equality.Observe(ProbeEvent.ProcessSignaled, 2003, true);
        equality.Observe(ProbeEvent.TreeEmpty, 2004, true);
        Check(equality.Finish(2004).TreeEmpty == EvidenceState.Unknown);
    }

    // 首mismatch與overflow／逾期交互不能留下可信defect；原原因仍保留。
    private static void ModelStickyFailure()
    {
        foreach (var badTime in new long[] { 2018, 20000, -1, 0, 9007199254740992 })
        {
            var model = new ProbeModel();
            Launch(model);
            model.Observe(ProbeEvent.CaseE0, 4, false);
            Close(model, 12);
            var terminal = model.Finish(badTime);
            Check(terminal.Reason == ProbeReason.CaseMismatch && terminal.ResourcesClose == EvidenceState.Unconfirmed);
            Check(ProbeWire.Parse(ProbeWire.Format(terminal) + "receiver_native_supervisor_result,status=unavailable\n").Diagnostic.CaseSet == ProbeCaseSet.Mismatched);
        }
        foreach (var stream in new[] { ProbeEvent.StdoutOverflow, ProbeEvent.StderrOverflow })
        {
            var model = new ProbeModel();
            Launch(model);
            model.Observe(ProbeEvent.CaseE0, 4, false);
            model.Observe(stream, 5, true);
            Cases(model, 6);
            Close(model, 13);
            var terminal = model.Finish(20);
            Check(terminal.CaseSet == ProbeCaseSet.Mismatched && terminal.Reason == ProbeReason.CaseMismatch);
            Check((stream == ProbeEvent.StdoutOverflow ? terminal.StdoutEof : terminal.StderrEof) == EvidenceState.Unconfirmed);
        }
        var defect = new ProbeModel();
        Launch(defect);
        defect.Observe(ProbeEvent.CaseE0, 4, false);
        Close(defect, 5);
        var diagnostic = defect.Finish(12);
        Check(ProbeWire.Parse(ProbeWire.Format(diagnostic) + "receiver_native_supervisor_result,status=defect_observed\n").Status == ProbeStatus.DefectObserved);
        var atR = new ProbeModel();
        Launch(atR);
        foreach (var kind in new[] { ProbeEvent.CaseE0, ProbeEvent.CaseE1, ProbeEvent.CaseE2, ProbeEvent.CaseE7, ProbeEvent.CaseO })
            atR.Observe(kind, 4, true);
        atR.Observe(ProbeEvent.StderrInterrupted, 5, true);
        Close(atR, 6);
        Check(atR.Finish(13).Reason == ProbeReason.NativeStderrInterrupted);
    }

    // snapshot不能回寫模型，terminal後所有事件與重複finish都不再改狀態。
    private static void ModelTerminal()
    {
        var model = new ProbeModel();
        var before = model.Snapshot();
        Launch(model);
        Check(before.ChildStart == EvidenceState.Unknown);
        var external = model.Snapshot() with { ChildExit = EvidenceState.Confirmed };
        Check(model.Snapshot().ChildExit == EvidenceState.Unknown && external.ChildExit == EvidenceState.Confirmed);
        Cases(model);
        Close(model);
        var terminal = model.Finish(18);
        model.Observe(ProbeEvent.StdoutOverflow, 19, true);
        Check(ReferenceEquals(terminal, model.Finish(long.MaxValue)));
        Check(model.Snapshot() == terminal && terminal == Complete());
        foreach (var omitted in new[] { ProbeEvent.TreeEmpty, ProbeEvent.StdoutEof, ProbeEvent.StderrEof })
        {
            var missing = new ProbeModel();
            Launch(missing);
            missing.Observe(ProbeEvent.ProcessSignaled, 4, true);
            foreach (var kind in new[] { ProbeEvent.TreeEmpty, ProbeEvent.StdoutEof, ProbeEvent.StderrEof })
                if (kind != omitted) missing.Observe(kind, 5, true);
            missing.Cleanup(6);
            missing.Observe(ProbeEvent.ResourcesClose, 7, true);
            Check(missing.Finish(8).ResourcesClose != EvidenceState.Confirmed);
        }
    }

    // C#型別排除NaN／字串，但強轉未知enum與超出JSsafe clock仍須在邊界拒絕。
    private static void ModelInvalidEvent()
    {
        var positive = new ProbeModel();
        Launch(positive);
        Check(positive.Snapshot().ChildStart == EvidenceState.Confirmed);
        foreach (var time in new long[] { -1, 9007199254740992, long.MaxValue })
        {
            var model = new ProbeModel();
            model.Observe(ProbeEvent.SupervisorBoundaryVerify, time, true);
            Check(model.Finish(1).Reason == ProbeReason.GuardRejected);
        }
        var invalid = new ProbeModel();
        invalid.Observe((ProbeEvent)(-1), 0, true);
        Check(invalid.Finish(1).Reason == ProbeReason.GuardRejected);
        var unowned = new ProbeModel();
        unowned.Observe(ProbeEvent.ProcessSignaled, 0, true);
        Check(unowned.Finish(1).Reason == ProbeReason.GuardRejected);
    }
}
