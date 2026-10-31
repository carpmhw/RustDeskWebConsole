using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 真driver／owner三行契約，只有既有OS替身與公開RAM資料。
internal static class BaselineConsoleCases
{
    private const string Flag = "--receiver-native-baseline-v1";
    private const string Matched = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"complete\",\"reason\":\"none\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"matched\",\"cancelState\":\"not_requested\"}\nreceiver_native_supervisor_result,status=observed\n";
    private const string Unknown = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"unknown\",\"reason\":\"unknown\",\"childStart\":\"unknown\",\"childExit\":\"unknown\",\"childPolicyRestore\":\"unknown\",\"supervisorBoundaryVerify\":\"unknown\",\"resourcesClose\":\"unknown\",\"jobAssigned\":\"unknown\",\"treeEmpty\":\"unknown\",\"stdoutEof\":\"unknown\",\"stderrEof\":\"unknown\",\"caseSet\":\"unknown\",\"cancelState\":\"unknown\"}\nreceiver_native_supervisor_result,status=unavailable\n";
    private const string None = "\"firstProblemCase\":\"none\",\"invocation\":\"unknown\",\"refType\":\"unknown\",\"refValue\":\"unknown\",\"rawType\":\"unknown\",\"rawValue\":\"unknown\",\"outputShape\":\"unknown\",\"publicOutputMatched\":null";

    // 精確錯參須在取得來源／claim／native／write之前拒絕。
    internal static void BaselineArguments()
    {
        foreach (var args in new string[][] { [], ["--receiver-native-cases-v1"], [Flag, "extra"], ["--root", "PUBLIC"], ["--flags", "0"] })
        {
            using var host = new ProbeConsoleCases.FakeHost(true);
            ProbeSourceCases.Require(ProbeConsole.ExecuteBaseline(args, host) == 2 && host.Acquires == 0 && host.BaselineAcquires == 0 && host.NativeFactories == 0 && host.Writes.Count == 0);
        }
    }

    // 舊入口不能偷接受新參數或新增來源選擇。
    internal static void LegacyArgumentsUnchanged()
    {
        using var host = new ProbeConsoleCases.FakeHost();
        ProbeSourceCases.Require(ProbeConsole.Execute([Flag], host) == 2 && host.BaselineAcquires == 0 && host.Acquires == 0 && host.Writes.Count == 0);
    }

    // 正常基線三行為原兩行與獨立觀察，不得由新分類改exit。
    internal static void BaselineConsoleMatched()
    {
        using var host = new ProbeConsoleCases.FakeHost(true);
        host.SetFrame(BaselineChildCases.Input("none", "true,true,true,true,true,true,true", None));
        ProbeSourceCases.Require(ProbeConsole.ExecuteBaseline([Flag], host) == 0 && host.Writes.Count == 1 && host.BaselineAcquires == 1 && host.Acquires == 0);
        var observation = BaselineWireCases.Unknown.Replace("not_observed", "accepted").Replace("\"firstProblemCase\":\"unknown\"", "\"firstProblemCase\":\"none\"")
            .Replace("\"cancelObservation\":\"not_reached\"", "\"cancelObservation\":\"sampled\"").Replace("\"psSignaledAtDecision\":null", "\"psSignaledAtDecision\":true")
            .Replace("\"cancelTarget\":\"unknown\"", "\"cancelTarget\":\"none\"").Replace("\"terminationAttempted\":null", "\"terminationAttempted\":false");
        ProbeSourceCases.Require(host.Writes[0] == Matched + observation);
        ProbeSourceCases.Require(BaselineWire.TryParseResult(Encoding.ASCII.GetBytes(host.Writes[0]), 0, out var result, out var snapshot) && result.Status == ProbeStatus.Observed && snapshot.Comparison.FirstProblemCase == ChildProbeCase.None);
        ProbeSourceCases.Require(host.Source.ClaimPaths.Count == 1 && host.Native.Handles.Count == 0 && host.Native.Memory.Count == 0);
    }

    // io_failed／exit2診斷保留，原v3不能被補成observed或ChildExit成功。
    internal static void BaselineConsoleIoExitTwo()
    {
        using var host = new ProbeConsoleCases.FakeHost(true);
        host.SetFrame(BaselineChildCases.Input("io_failed", "", BaselineChildCases.Threw));
        host.Native.ExitCode = 2;
        ProbeSourceCases.Require(ProbeConsole.ExecuteBaseline([Flag], host) == 2 && host.Writes.Count == 1);
        ProbeSourceCases.Require(BaselineWire.TryParseResult(Encoding.ASCII.GetBytes(host.Writes[0]), 2, out var result, out var snapshot) &&
            result.Status == ProbeStatus.Unavailable && result.Diagnostic.ChildExit != EvidenceState.Confirmed && result.Diagnostic.ChildPolicyRestore != EvidenceState.Confirmed &&
            snapshot.ChildObservation == BaselineChildObservation.Accepted && snapshot.Comparison.Invocation == BaselineInvocation.Threw);
    }

    // 原取消語意與九證據分類不因新觀察改成defect_observed。
    internal static void BaselineConsoleCancellation()
    {
        using var host = new ProbeConsoleCases.FakeHost(true);
        host.SetFrame(BaselineChildCases.Input("case_mismatch", "false", BaselineChildCases.E0));
        host.Native.Active = 1;
        ProbeSourceCases.Require(ProbeConsole.ExecuteBaseline([Flag], host) == 2 && host.Writes.Count == 1);
        ProbeSourceCases.Require(BaselineWire.TryParseResult(Encoding.ASCII.GetBytes(host.Writes[0]), 2, out var result, out var snapshot) &&
            result.Status == ProbeStatus.Unavailable && result.Diagnostic.CancelState == ProbeCancelState.Requested && snapshot.JobAtDecision == BaselineJobState.Nonempty);
    }

    // 新consumer嚴格三行，舊consumer仍拒絕第三行；錯exit或錯關聯不得留半份out。
    internal static void ResultLineIsolation()
    {
        var none = BaselineWireCases.Unknown.Replace("not_observed", "accepted").Replace("\"firstProblemCase\":\"unknown\"", "\"firstProblemCase\":\"none\"");
        var wire = Matched + none;
        ProbeSourceCases.Require(BaselineWire.TryParseResult(Encoding.ASCII.GetBytes(wire), 0, out _, out _));
        ProbeSourceCases.Require(ProbeWire.Parse(wire).Diagnostic == new ProbeDiagnostic());
        foreach (var invalid in new[] { Matched, wire + none, none + Matched, wire.Replace("\n", "\r\n"), "\ufeff" + wire,
            wire.Replace("baseline_v1", "baseline_v2"), Matched + BaselineWireCases.E0, Matched + BaselineWireCases.Unknown, wire.PadRight(8193), wire.Replace("\"schemaVersion\":1", "\"schemaVersion\":1.0") })
            Reject(invalid, 0);
        Reject(wire.Replace("\"cancelObservation\":\"not_reached\"", "\"cancelObservation\":\"sampled\"")
            .Replace("\"cancelTarget\":\"unknown\"", "\"cancelTarget\":\"owned_job\"").Replace("\"terminationAttempted\":null", "\"terminationAttempted\":false"), 0);
        var defect = Matched.Replace("\"complete\"", "\"failed\"").Replace("\"reason\":\"none\"", "\"reason\":\"case_mismatch\"")
            .Replace("\"matched\"", "\"mismatched\"").Replace("status=observed", "status=defect_observed");
        Reject(defect + BaselineWireCases.Unknown, 1);
        Reject(wire, 1); Reject(wire, 2); Reject(wire, -1);
        Reject(Unknown + none, 2);
    }

    // Core缺證不妨礙真正獨立父層未知觀察，但不能以child觀察捏造成功。
    internal static void DiagnosticDoesNotFillCore()
    {
        ProbeSourceCases.Require(BaselineWire.TryParseResult(Encoding.ASCII.GetBytes(Unknown + BaselineWireCases.Unknown), 2, out var result, out var observation) &&
            result.Diagnostic == new ProbeDiagnostic() && observation == new BaselineObservation());
        Reject(Matched + BaselineWireCases.E0.Replace("returned", "threw"), 0);
    }

    // 拒絕的兩個out都保持固定未知，不向使用者回顯外部資料。
    private static void Reject(string wire, int exitCode)
    {
        ProbeSourceCases.Require(!BaselineWire.TryParseResult(Encoding.UTF8.GetBytes(wire), exitCode, out var result, out var observation) &&
            result == new ProbeResult(ProbeStatus.Unavailable, new()) && observation == new BaselineObservation());
    }
}
