using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 只替換OS邊界；console driver實際執行來源、claim、run、session及唯一Core。
internal static class ProbeConsoleCases
{
    private const string Flag = "--receiver-native-cases-v1";
    private const string Frame = "receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\",\"reason\":\"none\",\"cases\":[true,true,true,true,true,true,true],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"}\n";
    private const string Unknown = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"unknown\",\"reason\":\"unknown\",\"childStart\":\"unknown\",\"childExit\":\"unknown\",\"childPolicyRestore\":\"unknown\",\"supervisorBoundaryVerify\":\"unknown\",\"resourcesClose\":\"unknown\",\"jobAssigned\":\"unknown\",\"treeEmpty\":\"unknown\",\"stdoutEof\":\"unknown\",\"stderrEof\":\"unknown\",\"caseSet\":\"unknown\",\"cancelState\":\"unknown\"}\nreceiver_native_supervisor_result,status=unavailable\n";
    private const string MatchedWire = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"complete\",\"reason\":\"none\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"matched\",\"cancelState\":\"not_requested\"}\nreceiver_native_supervisor_result,status=observed\n";
    private const string MismatchWire = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"failed\",\"reason\":\"case_mismatch\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"mismatched\",\"cancelState\":\"not_requested\"}\nreceiver_native_supervisor_result,status=defect_observed\n";
    private const string InterruptedWire = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"failed\",\"reason\":\"native_stderr_interrupted\",\"childStart\":\"confirmed\",\"childExit\":\"confirmed\",\"childPolicyRestore\":\"confirmed\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"confirmed\",\"jobAssigned\":\"confirmed\",\"treeEmpty\":\"confirmed\",\"stdoutEof\":\"confirmed\",\"stderrEof\":\"confirmed\",\"caseSet\":\"mismatched\",\"cancelState\":\"not_requested\"}\nreceiver_native_supervisor_result,status=defect_observed\n";

    // 固定斷言訊息不攜帶原始輸出、路徑、handle或例外。
    private static void Check(bool condition) => ProbeSourceCases.Require(condition);

    // 假host共用唯一clock，只有來源／Win32／sleep／stdout是替身，沒有fake run。
    internal sealed class FakeHost : IProbeConsoleHost, IDisposable
    {
        internal readonly FakeSourceApi Source;
        internal readonly NativeSessionCases.FakeApi Native = new() { Signaled = true, Active = 0, Streams = [new(), new()] };
        internal readonly List<string> Writes = [];
        internal readonly List<(long Before, int Milliseconds)> Waits = [];
        internal Action? AfterWait;
        internal bool WaitOk = true, WriteOk = true, ThrowAcquire;
        internal int Acquires, NativeFactories;
        internal int BaselineAcquires;
        public bool Supported { get; set; } = true;
        public long ElapsedMs => Source.ElapsedMs;
        public bool IsRunning => Source.IsRunning;

        // 預設只提供已知公開frame及正常EOF，實際collector／parser由產品程式執行。
        internal FakeHost(bool baseline = false)
        {
            Source = new(baseline: baseline);
            SetFrame(Frame);
        }
        // 新factory仍經真guard，不替換lease或run。
        public OwnedProbeSources AcquireBaselineSources()
        {
            BaselineAcquires++;
            if (ThrowAcquire) throw new IOException("PUBLIC_FAILURE");
            return OwnedProbeSources.AcquireBaseline(Source, this, Source.Pins);
        }
        // 所有測試重用同一公開來源fixture，不建立真檔案或marker。
        public OwnedProbeSources AcquireSources()
        {
            Acquires++;
            if (ThrowAcquire) throw new IOException("PUBLIC_FAILURE");
            return OwnedProbeSources.Acquire(Source, this, Source.Pins);
        }
        // 建立的是OS替身，不略過正式session或來源claim。
        public IProbeNativeApi CreateNativeApi() { NativeFactories++; return Native; }
        // 驗driver傳入的實際等待範圍，推進同clock；額外上限只防錯誤產品迴圈卡住測試。
        public bool Wait(int milliseconds)
        {
            Check(milliseconds is >= 1 and <= 10 && Waits.Count < 2100 && Writes.Count == 0);
            Waits.Add((ElapsedMs, milliseconds));
            if (!WaitOk) return false;
            Source.ElapsedMs += milliseconds;
            AfterWait?.Invoke();
            return true;
        }
        // 連失敗write也記一次嘗試，不能讓driver補發第二份成功結果。
        public bool WriteResult(string wire) { Writes.Add(wire); return WriteOk; }
        // 只設定OS兩路queue，不直接向model提交任何事件。
        internal void SetFrame(string frame)
        {
            Native.Streams![0].Clear(); Native.Streams[1].Clear();
            if (frame.Length > 0) Native.Streams[0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(frame)));
            Native.Streams[0].Enqueue((IoState.Eof, [])); Native.Streams[1].Enqueue((IoState.Eof, []));
        }
        // 真kernel沒有這些配置；只在測試斷言後釋放fixture自己的HGlobal。
        public void Dispose() => Native.ReleaseFixture();
    }

    // 正向anchor同時證明真guard／claim先於native及終態寫出前全部owned來源已close。
    internal static void Matched()
    {
        using var host = new FakeHost();
        host.Native.AfterAcquire = _ => Check(host.Source.ClaimPaths.Count == 1 && host.Source.Closed.Count == 0);
        Check(ProbeConsole.Execute([Flag], host) == 0 && host.Writes.SequenceEqual([MatchedWire]));
        Check(host.Acquires == 1 && host.NativeFactories == 1 && host.Native.CreateCalls == 1 && host.Native.ResumeCalls == 1);
        Check(host.Source.Closed.Count == host.Source.Handles.Count && host.Native.Memory.Count == 0 && host.Native.Handles.Count == 0);
        Check(host.Source.ClaimHandles.Count == 1 && host.Native.JobKills == 0 && host.ElapsedMs < 18000);
    }
    // 新formatter不可默默輸出unknown或複製一套不相容分類，原非法enum仍須拒絕。
    internal static void ResultFormat()
    {
        foreach (var (wire, status) in new[] { (MatchedWire, ProbeStatus.Observed), (MismatchWire, ProbeStatus.DefectObserved), (InterruptedWire, ProbeStatus.DefectObserved), (Unknown, ProbeStatus.Unavailable) })
        {
            var diagnostic = ProbeWire.Parse(wire).Diagnostic;
            var result = ProbeWire.FormatResult(diagnostic);
            Check(result.Status == status && result.Wire == wire && ProbeWire.Format(diagnostic) == wire[..(wire.IndexOf('\n') + 1)]);
        }
        var rejected = false;
        try { ProbeWire.FormatResult(new() { Phase = (ProbePhase)99 }); }
        catch (InvalidOperationException error) { rejected = error.Message == "receiver_native_supervisor_diagnostic_unavailable"; }
        Check(rejected);
    }
    // 錯參不可碰來源／native／write；非Windows有效參數只能固定unknown，不能消耗claim。
    internal static void Arguments()
    {
        Matched();
        foreach (var args in new string[][] { [], ["--help"], ["--RECEIVER-native-cases-v1"], [Flag, "PUBLIC_EXTRA"] })
        {
            using var host = new FakeHost();
            Check(ProbeConsole.Execute(args, host) == 2 && host.Writes.Count == 0 && host.Acquires == 0 && host.NativeFactories == 0 && host.Waits.Count == 0);
        }
        using var unsupported = new FakeHost { Supported = false };
        Check(ProbeConsole.Execute([Flag], unsupported) == 2 && unsupported.Writes.SequenceEqual([Unknown]));
        Check(unsupported.Acquires == 0 && unsupported.NativeFactories == 0 && unsupported.Source.ClaimPaths.Count == 0 && unsupported.Waits.Count == 0);
    }
    // 可信mismatch及R正常收尾各exit1，不能視同child exit0而回observed。
    internal static void Defects()
    {
        Matched();
        foreach (var interrupted in new[] { false, true })
        {
            using var host = new FakeHost();
            host.SetFrame(Frame.Replace("\"none\"", interrupted ? "\"native_stderr_interrupted\"" : "\"case_mismatch\"", StringComparison.Ordinal)
                .Replace("[true,true,true,true,true,true,true]", interrupted ? "[true,true,true,true,true,false]" : "[false]", StringComparison.Ordinal));
            Check(ProbeConsole.Execute([Flag], host) == 1 && host.Writes.SequenceEqual([interrupted ? InterruptedWire : MismatchWire]));
            Check(host.Source.Closed.Count == host.Source.Handles.Count && host.Native.JobKills == 0 && host.ElapsedMs < 18000);
        }
    }
    // Connect pending不是啟動失敗；完成後只能CreateSuspended／Resume一次。
    internal static void DelayedLaunch()
    {
        Matched();
        using var host = new FakeHost();
        host.Native.ConnectResult = new(IoState.Pending);
        host.AfterWait = () => { if (host.Waits.Count == 2) host.Native.ReadCompletion = new(IoState.Complete); };
        Check(ProbeConsole.Execute([Flag], host) == 0 && host.Writes.SequenceEqual([MatchedWire]));
        Check(host.Waits.Count >= 2 && host.Native.CreateCalls == 1 && host.Native.ResumeCalls == 1 && host.ElapsedMs < 18000);
    }
    // signal先到、frame及另一EOF分批晚到時，driver不得提早清理或將中途snapshot寫出。
    internal static void DeferredFrame()
    {
        Matched();
        using var host = new FakeHost();
        host.Native.Streams![0].Clear(); host.Native.Streams[1].Clear();
        host.AfterWait = () =>
        {
            if (host.Waits.Count == 1) host.Native.Streams[0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(Frame[..30])));
            if (host.Waits.Count == 2)
            {
                host.Native.Streams[0].Enqueue((IoState.Complete, Encoding.UTF8.GetBytes(Frame[30..])));
                host.Native.Streams[0].Enqueue((IoState.Eof, []));
            }
            if (host.Waits.Count == 4) host.Native.Streams[1].Enqueue((IoState.Eof, []));
            Check(host.Source.Closed.Count == 0 && host.Native.JobKills == 0);
        };
        Check(ProbeConsole.Execute([Flag], host) == 0 && host.Writes.SequenceEqual([MatchedWire]));
        Check(host.Waits.Count >= 4 && host.Native.CreateCalls == 1 && host.ElapsedMs < 18000);
    }
    // claim拒絕不可啟native；壞frame、額外stderr與非零退出不可回填案例及政策。
    internal static void Refusal()
    {
        Matched();
        using var existing = new FakeHost();
        existing.Source.Files.Add("C:\\PUBLIC 空格 繁體\\probe\\native-probe.claim", []);
        Check(ProbeConsole.Execute([Flag], existing) == 2 && existing.Native.Acquisitions == 0 && existing.Writes.Count == 1);
        Check(existing.Source.ClaimPaths.Count == 1 && existing.Source.Closed.Count == existing.Source.Handles.Count);
        foreach (var mode in new[] { 0, 1, 2 })
        {
            using var host = new FakeHost();
            if (mode == 0) host.SetFrame("PUBLIC_BAD\n");
            if (mode == 1)
            {
                host.Native.Streams![1].Clear();
                host.Native.Streams[1].Enqueue((IoState.Complete, "PUBLIC_STDERR"u8.ToArray()));
                host.Native.Streams[1].Enqueue((IoState.Eof, []));
            }
            if (mode == 2) host.Native.ExitCode = 2;
            Check(ProbeConsole.Execute([Flag], host) == 2 && host.Writes.Count == 1 && host.ElapsedMs < 18000);
            var end = ProbeWire.Parse(host.Writes[0]);
            Check(end.Status == ProbeStatus.Unavailable && end.Diagnostic.ChildExit != EvidenceState.Confirmed && end.Diagnostic.CaseSet == ProbeCaseSet.Unknown);
        }
    }
    // 來源讀取吃掉正常預算、normal及hard等號都不能透過driver重設clock補時。
    internal static void Deadlines()
    {
        Matched();
        foreach (var at in new long[] { 17999, 18000 })
        {
            using var host = new FakeHost();
            host.Source.Before = operation => { if (operation == "read") host.Source.ElapsedMs = at; };
            Check(ProbeConsole.Execute([Flag], host) == 2 && host.Writes.Count == 1);
            Check(host.Source.ClaimPaths.Count == (at == 17999 ? 1 : 0) && host.Native.CreateCalls == (at == 17999 ? 1 : 0));
            Check(host.Waits.All(wait => wait.Before + wait.Milliseconds <= 18000));
            if (at == 17999) Check(host.Waits.Count == 1 && host.Waits[0] == (17999, 1));
        }
        using var pending = new FakeHost();
        pending.Native.Signaled = false; pending.Native.Active = 1;
        pending.Native.Streams![0].Clear(); pending.Native.Streams[1].Clear();
        pending.Native.CompleteOnKill = false; pending.Native.CancellationWillComplete = false;
        Check(ProbeConsole.Execute([Flag], pending) == 2 && pending.Writes.Count == 1 && pending.ElapsedMs == 20000);
        Check(pending.Waits.All(wait => wait.Before < 20000 && wait.Before + wait.Milliseconds <= (wait.Before < 18000 ? 18000 : 20000)));
        Check(pending.Native.JobKills == 1 && pending.Source.Closed.Count == 0 && pending.Native.Memory.Count == 4);
        Check(ProbeWire.Parse(pending.Writes[0]).Diagnostic.Reason == ProbeReason.Deadline);
    }
    // stopped／negative／rollback共同clock不可造成sleep迴圈、續啟或observed。
    internal static void Clock()
    {
        Matched();
        foreach (var mode in new[] { 0, 1, 2 })
        {
            using var host = new FakeHost();
            host.Native.Streams![0].Clear(); host.Native.Streams[1].Clear();
            host.AfterWait = () =>
            {
                if (mode == 0) host.Source.IsRunning = false;
                if (mode == 1) host.Source.ElapsedMs = -1;
                if (mode == 2 && host.Waits.Count == 2) host.Source.ElapsedMs = 1;
            };
            Check(ProbeConsole.Execute([Flag], host) == 2 && host.Writes.Count == 1 && host.Waits.Count == (mode == 2 ? 2 : 1));
            Check(ProbeWire.Parse(host.Writes[0]).Status == ProbeStatus.Unavailable);
        }
    }
    // 首次Cleanup pending不是終態；既不能早寫結果，也不能free尚被I/O引用的配置。
    internal static void PendingCleanup()
    {
        Matched();
        foreach (var completes in new[] { false, true })
        {
            using var host = new FakeHost();
            host.Native.ExitCode = 2; host.Native.Active = 1;
            host.Native.Streams![0].Clear(); host.Native.Streams[1].Clear();
            host.Native.CompleteOnKill = false; host.Native.CancellationWillComplete = false;
            host.AfterWait = () =>
            {
                Check(host.Source.Closed.Count == 0 && host.Native.Memory.Count == 4 && host.Native.JobKills == 1);
                if (completes && host.Waits.Count == 3)
                {
                    host.Native.Active = 0;
                    host.Native.Streams[0].Enqueue((IoState.Aborted, [])); host.Native.Streams[1].Enqueue((IoState.Aborted, []));
                }
            };
            Check(ProbeConsole.Execute([Flag], host) == 2 && host.Writes.Count == 1 && host.Native.JobKills == 1);
            Check(host.ElapsedMs == (completes ? 30 : 2000));
            Check(completes ? host.Source.Closed.Count == host.Source.Handles.Count && host.Native.Memory.Count == 0 : host.Source.Closed.Count == 0 && host.Native.Memory.Count == 4);
        }
    }
    // close、等待、輸出或factory故障不能靠其他成功證據覆蓋，也不能補寫第二份wire。
    internal static void Failures()
    {
        Matched();
        foreach (var sourceFailure in new[] { false, true })
        {
            using var host = new FakeHost();
            host.Source.ClaimCloseOk = !sourceFailure; host.Native.AuxiliaryResult = sourceFailure;
            Check(ProbeConsole.Execute([Flag], host) == 2 && host.Writes.Count == 1);
            var end = ProbeWire.Parse(host.Writes[0]);
            Check(end.Status == ProbeStatus.Unavailable && end.Diagnostic.ResourcesClose == EvidenceState.Unconfirmed && end.Diagnostic.CaseSet == ProbeCaseSet.Matched);
        }
        using var wait = new FakeHost { WaitOk = false };
        Check(ProbeConsole.Execute([Flag], wait) == 2 && wait.Writes.SequenceEqual([Unknown]) && wait.Waits.Count == 1);
        Check(wait.Source.Closed.Count == wait.Source.Handles.Count);
        using var pending = new FakeHost { WaitOk = false };
        pending.Native.Signaled = false; pending.Native.Active = 1;
        pending.Native.Streams![0].Clear(); pending.Native.Streams[1].Clear();
        pending.Native.CompleteOnKill = false; pending.Native.CancellationWillComplete = false;
        Check(ProbeConsole.Execute([Flag], pending) == 2 && pending.Writes.SequenceEqual([Unknown]) && pending.Waits.Count == 1);
        Check(pending.Native.JobKills == 1 && pending.Native.Memory.Count == 4 && pending.Source.Closed.Count == 0);
        using var write = new FakeHost { WriteOk = false };
        Check(ProbeConsole.Execute([Flag], write) == 2 && write.Writes.SequenceEqual([MatchedWire]));
        using var acquire = new FakeHost { ThrowAcquire = true };
        Check(ProbeConsole.Execute([Flag], acquire) == 2 && acquire.Writes.SequenceEqual([Unknown]) && acquire.Native.Acquisitions == 0);
    }
}
