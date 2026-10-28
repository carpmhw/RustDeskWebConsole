namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 僅負責internal OS生命週期；正式console經來源guard及唯一run接入。
internal sealed class OwnedProbeSession
{
    private readonly IProbeNativeApi _api;
    private readonly IProbeClock _clock;
    private readonly ProbeModel _model;
    private readonly ProbeLaunchPlan _plan;
    private readonly OwnedNativeResources _handles;
    private readonly OwnedPipe _stdout, _stderr;
    private nint _job, _descriptor, _stdin, _process, _thread;
    private bool _prepareTried, _prepared, _launchTried, _failed, _cancelIssued, _resourcesClosed;
    private bool _stdoutReported, _stderrReported, _signalReported, _treeReported;
    private bool _assigned;
    private bool _descriptorCloseTried, _descriptorClosed;
    private long? _cleanupEnd;
    private long _lastTime;
    private bool _cleanupDone, _frameTaken;
    private uint _exitCode;
    internal bool ResourcesClosed => _resourcesClosed;
    internal bool CleanupComplete => _cleanupDone;
    internal bool Failed => _failed;
    // 非零退出只用來停止正常工作，不能補案例、政策或正常ChildExit。
    internal bool NonzeroExitObserved => _signalReported && _exitCode != 0;
    internal bool SourceReleaseSafe => _process == 0 || (_signalReported && (!_assigned || _treeReported));

    // 測試替身只能經friend使用；正式console經唯一run傳入固定來源plan，不收外部command。
    internal OwnedProbeSession(IProbeNativeApi api, IProbeClock clock, ProbeModel model, ProbeLaunchPlan plan)
    {
        _api = api;
        _clock = clock;
        _model = model;
        _plan = plan;
        _handles = new(api);
        _stdout = new(api, WithinBudget);
        _stderr = new(api, WithinBudget);
    }

    // 來源guard須已初始化Core；此處只驗本層平台／clock，不提供任意來源的verified轉換。
    internal bool Prepare()
    {
        if (_prepareTried || _cleanupDone || _cleanupEnd is not null) return false;
        _prepareTried = true;
        if (!_api.Supported || !WithinBudget() ||
            _model.Snapshot().SupervisorBoundaryVerify != EvidenceState.Confirmed) return Reject();
        _descriptor = _api.CreateDescriptor();
        if (_descriptor == 0 || !WithinBudget()) return Reject();
        _job = _handles.Own(_api.CreateJob());
        if (_job == 0 || !WithinBudget() || !_api.LimitJob(_job) || !WithinBudget()) return Reject();
        if (!_stdout.Prepare(_descriptor) || !WithinBudget()) return Reject();
        if (!_stderr.Prepare(_descriptor) || !WithinBudget()) return Reject();
        if (!_api.CreateStdin(out var input, out var writer)) return Reject();
        _stdin = _handles.Own(input);
        _handles.Own(writer);
        if (!_handles.Close(writer) || !WithinBudget()) return Reject();
        _prepared = true;
        return true;
    }

    // 成功out先認領，再檢截止；原生assign成功立即記physical ownership，回驗前不resume。
    internal bool Launch()
    {
        if (_cleanupDone || _cleanupEnd is not null || _launchTried || !_prepared || _failed || !WithinBudget()) return Reject();
        if (!_stdout.Connected || !_stderr.Connected) return false;
        _launchTried = true;
        var result = _api.CreateSuspended(_plan, _stdin, _stdout.Writer, _stderr.Writer);
        if (!result.Success) return Reject();
        _process = _handles.Own(result.Process);
        _thread = _handles.Own(result.Thread);
        _model.Observe(ProbeEvent.Suspended, _clock.ElapsedMs, true);
        var writers = _stdout.CloseWriter();
        writers = _stderr.CloseWriter() && writers;
        if (!writers || !WithinBudget()) return Reject();
        _assigned = _api.Assign(_job, _process);
        if (_assigned) _model.Observe(ProbeEvent.JobOwned, _clock.ElapsedMs, true);
        var verified = _assigned && WithinBudget() && _api.Belongs(_job, _process);
        _model.Observe(ProbeEvent.Assigned, _clock.ElapsedMs, verified);
        if (!verified || !WithinBudget()) return Reject();
        var resumed = _api.Resume(_thread) == 1;
        _model.Observe(ProbeEvent.Resumed, _clock.ElapsedMs, resumed);
        if (!resumed || !WithinBudget()) return Reject();
        return true;
    }

    // 非阻塞公平poll；process signal、正常exit與job active查空分開取得證據。
    internal void Poll()
    {
        if (_cleanupDone || !WithinBudget()) return;
        if (_process != 0 && !_signalReported)
        {
            var observation = _api.ObserveProcess(_process);
            if (!observation.Valid) { Reject(); }
            else if (observation.Signaled && WithinBudget())
            {
                _signalReported = true;
                _model.Observe(ProbeEvent.ProcessSignaled, _clock.ElapsedMs, true);
                _exitCode = observation.ExitCode;
            }
        }
        if (_signalReported && _assigned && !_treeReported && WithinBudget())
        {
            if (!_api.QueryActive(_job, out var active)) Reject();
            else if (active == 0 && WithinBudget())
            {
                _treeReported = true;
                _model.Observe(ProbeEvent.TreeEmpty, _clock.ElapsedMs, true);
            }
        }
        if (!WithinBudget()) return;
        _stdout.Poll();
        if (!WithinBudget()) return;
        _stderr.Poll();
        ReportPipe(_stdout, true, ref _stdoutReported);
        ReportPipe(_stderr, false, ref _stderrReported);
    }

    // 唯一讀取child frame的接點，只可消費本輪兩路；沒有caller bytes／verified參數。
    internal bool TryTakeChildFrame(out ChildProbeFrame frame)
    {
        frame = new();
        if (_frameTaken || _cleanupEnd is not null || _cancelIssued || _failed || !_signalReported || _exitCode != 0 ||
            !_stdout.Eof || !_stderr.Eof || _stdout.Failed || _stderr.Failed || !WithinBudget()) return false;
        _frameTaken = true;
        if (_stderr.Collected != 0) return true;
        var parsed = ChildProbeWire.Parse(_stdout.Bytes.Span);
        if (!parsed.Accepted || !WithinBudget() || parsed.ChildPolicyRestore != EvidenceState.Confirmed ||
            parsed.ChildResourcesClose != EvidenceState.Confirmed ||
            parsed.Reason is not (ProbeReason.None or ProbeReason.CaseMismatch or ProbeReason.NativeStderrInterrupted)) return true;
        frame = parsed;
        return true;
    }

    // 低階OS呼叫者取得同Core取消決策；回傳僅是snapshot，不代表全域已收尾。
    internal ProbeDiagnostic Cleanup()
    {
        var now = _clock.ElapsedMs;
        _cleanupEnd ??= Math.Min(20000, Math.Max(0, now) + 2000);
        var decision = _model.Cleanup(now);
        return Cleanup(_cleanupEnd.Value, decision);
    }

    // coordinator給唯一共同截止／決策，本層只執行owned取消及局部close，絕不Finish。
    internal ProbeDiagnostic Cleanup(long deadline, CancelDecision decision)
    {
        if (_cleanupDone) return _model.Snapshot();
        _cleanupEnd ??= deadline;
        if (deadline <= 0 || deadline > 20000 || _cleanupEnd != deadline) { Reject(); return _model.Snapshot(); }
        Poll();
        if (!WithinBudget()) return _model.Snapshot();
        var needsCancel = decision.Target == CancelTarget.OwnedJob ? !_signalReported || !_treeReported : !_signalReported;
        if (!_cancelIssued && decision.Target != CancelTarget.None && needsCancel)
        {
            _cancelIssued = true;
            var cancelled = decision.Target == CancelTarget.OwnedJob ? _api.TerminateJob(_job) : _api.TerminateProcess(_process);
            _model.Observe(ProbeEvent.Cancelled, _clock.ElapsedMs, cancelled);
        }
        _stdout.CloseWriter();
        _stderr.CloseWriter();
        if (!WithinBudget()) return _model.Snapshot();
        _stdout.Cancel();
        if (WithinBudget()) _stderr.Cancel();
        Poll();
        if (!WithinBudget()) return _model.Snapshot();
        var stdout = _stdout.Close();
        var stderr = _stderr.Close();
        // 若仍pending，不關閉其event／read端；其他不被I/O引用的資源仍可正常收回。
        if (_descriptor != 0 && !_descriptorCloseTried)
        {
            _descriptorCloseTried = true;
            _descriptorClosed = _api.FreeDescriptor(_descriptor);
        }
        var descriptor = _descriptor == 0 || _descriptorClosed;
        var auxiliary = _api.CloseAuxiliary();
        var handles = (_process == 0 || (_signalReported && (!_assigned || _treeReported))) && _handles.CloseAll();
        _resourcesClosed = stdout && stderr && descriptor && auxiliary && handles;
        _cleanupDone = !_stdout.Pending && !_stderr.Pending && SourceReleaseSafe;
        return _model.Snapshot();
    }

    // 將每路首個可信EOF或sticky負向提交Core，不將取消完成冒充EOF。
    private void ReportPipe(OwnedPipe pipe, bool stdout, ref bool reported)
    {
        if (reported || (!pipe.Eof && !pipe.Failed)) return;
        reported = true;
        _model.Observe(pipe.Overflow ? (stdout ? ProbeEvent.StdoutOverflow : ProbeEvent.StderrOverflow) :
            (stdout ? ProbeEvent.StdoutEof : ProbeEvent.StderrEof), _clock.ElapsedMs, pipe.Eof || pipe.Overflow);
        if (pipe.Failed) _failed = true;
    }

    // 單調與期限只在本層邊界取樣；取得晚到資源後仍可移交收尾。
    private bool WithinBudget()
    {
        var now = _clock.ElapsedMs;
        if (!_clock.IsRunning || now < _lastTime || now < 0 || now >= (_cleanupEnd ?? 18000))
        {
            _failed = true;
            return false;
        }
        _lastTime = now;
        return true;
    }

    // 本層失敗只停止新工作，Core保留首原因與已取得所有權。
    private bool Reject()
    {
        _failed = true;
        return false;
    }
}
