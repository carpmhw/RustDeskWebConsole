namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 單一序列呼叫端的唯一協調owner；clock／model／來源／OS session不分叉。
internal sealed class OwnedProbeRun
{
    private readonly OwnedProbeSources _sources;
    private readonly IProbeClock _clock;
    private readonly ProbeModel _model = new();
    private readonly OwnedProbeSession? _session;
    private bool _failed, _prepared, _childResources, _sourcesClosed, _clockInvalid, _sourceLost;
    private long _lastTime;
    private long? _cleanupEnd;
    private ProbeDiagnostic? _terminal;

    // 來源ownership已在TryCreate轉移；guard失敗仍保有來源供唯一cleanup。
    private OwnedProbeRun(OwnedProbeSources sources, IProbeNativeApi api)
    {
        _sources = sources;
        _clock = sources.Clock;
        var verified = sources.TryGetLaunchPlan(out var plan) && Within() && sources.TryClaim() && Within();
        _model.Observe(ProbeEvent.SupervisorBoundaryVerify, _clock.ElapsedMs, verified);
        if (verified) _session = new(api, _clock, _model, plan!);
        else _failed = true;
    }
    internal bool IsTerminal => _terminal is not null;
    // 只描述停止正常工作的事實；正常signal本身不是可信frame或成功證據。
    internal bool NeedsCleanup => _failed || _childResources || _session is { Failed: true } or { NonzeroExitObserved: true };
    // driver只讀首次收尾已鎖的截止，不自行重算或延長。
    internal long? CleanupDeadline => _cleanupEnd;
    // 只接受實體lease，不接任意command、frame或替代clock。
    internal static bool TryCreate(OwnedProbeSources sources, IProbeNativeApi api, out OwnedProbeRun? run)
    {
        run = null;
        if (!sources.TryTransferOwnership()) return false;
        run = new(sources, api);
        return true;
    }
    // 準備及啟動前重驗lease未被提早close或逾期；錯誤黏住。
    internal bool Prepare()
    {
        if (_prepared || _failed || _cleanupEnd is not null || IsTerminal || !Within() || !_sources.TryGetLaunchPlan(out _)) { _failed = true; return false; }
        _prepared = _session is not null && _session.Prepare();
        if (!_prepared) _failed = true;
        return _prepared;
    }
    // 只有同一session持有的標準handles及固定plan可用於一次建立。
    internal bool Launch()
    {
        if (_failed || !_prepared || _cleanupEnd is not null || IsTerminal || !Within() || !_sources.TryGetLaunchPlan(out _)) { _failed = true; return false; }
        var launched = _session!.Launch();
        if (!launched && _session.Failed) _failed = true;
        return launched;
    }
    // signal可早到；案例必先於正常ChildExit，且只有normal期限內可採信一次。
    internal void Poll()
    {
        if (IsTerminal || !Within(_cleanupEnd ?? 18000)) return;
        CaptureSourceLoss();
        _session?.Poll();
        CaptureSourceLoss();
        if (_cleanupEnd is not null || _failed || !Within() || _session is null || !_session.TryTakeChildFrame(out var frame)) return;
        if (!Within()) return;
        if (!frame.Accepted)
        {
            _failed = true;
            _model.Observe(ProbeEvent.ChildFrameRejected, _clock.ElapsedMs, true);
            return;
        }
        ProbeEvent[] cases = [ProbeEvent.CaseE0, ProbeEvent.CaseE1, ProbeEvent.CaseE2, ProbeEvent.CaseE7, ProbeEvent.CaseO, ProbeEvent.CaseR, ProbeEvent.CaseA];
        for (var index = 0; index < frame.PassedCases; index++) _model.Observe(cases[index], _clock.ElapsedMs, true);
        if (frame.Reason == ProbeReason.NativeStderrInterrupted) _model.Observe(ProbeEvent.StderrInterrupted, _clock.ElapsedMs, true);
        else if (frame.Reason == ProbeReason.CaseMismatch) _model.Observe(cases[frame.PassedCases], _clock.ElapsedMs, false);
        _model.Observe(ProbeEvent.ChildPolicyRestore, _clock.ElapsedMs, true);
        _model.Observe(ProbeEvent.ChildExit, _clock.ElapsedMs, true);
        _childResources = true;
    }
    // snapshot從不封存或格式化可能尚缺證的中途狀態。
    internal ProbeDiagnostic Snapshot() => _terminal ?? _model.Snapshot();
    // 第一次先消費buffered案例，再開始唯一cleanup；重複呼叫只推進同一截止。
    internal ProbeDiagnostic Cleanup()
    {
        if (_terminal is not null) return _terminal;
        if (_cleanupEnd is null)
        {
            Poll();
            _cleanupEnd = Math.Min(20000, Math.Max(0, _clock.ElapsedMs) + 2000);
        }
        var decision = _model.Cleanup(_clock.ElapsedMs);
        if (!Within(_cleanupEnd.Value)) return _terminal = _model.Finish(_clock.ElapsedMs);
        _session?.Cleanup(_cleanupEnd.Value, decision);
        if (!Within(_cleanupEnd.Value)) return _terminal = _model.Finish(_clock.ElapsedMs);
        CaptureSourceLoss();
        if (!_sourcesClosed && (_session is null || _session.SourceReleaseSafe))
        {
            _sources.Close(_cleanupEnd.Value);
            _sourcesClosed = true;
        }
        if (!Within(_cleanupEnd.Value)) return _terminal = _model.Finish(_clock.ElapsedMs);
        if (_sourcesClosed && (_session is null || _session.CleanupComplete))
        {
            // Core啟動前置未成立時不捏造ResourcesClose／signal／EOF。
            if (_session is not null && _model.Snapshot().ChildStart == EvidenceState.Confirmed)
                _model.Observe(ProbeEvent.ResourcesClose, _clock.ElapsedMs,
                    _session.ResourcesClosed && _sources.ResourcesClose == EvidenceState.Confirmed && _childResources && !_sourceLost);
            _terminal = _model.Finish(_clock.ElapsedMs);
            return _terminal;
        }
        return _model.Snapshot();
    }
    // 移交後若原引用提早close，不能把其confirmed當成run維持來源持有的證據。
    private void CaptureSourceLoss()
    {
        if (!_sourcesClosed && _sources.ResourcesClose != EvidenceState.Unknown) { _sourceLost = true; _failed = true; }
    }
    // high-water含逾期觀察；停止／倒退永久拒絕後續OS操作，deadline不補時。
    private bool Within(long end = 18000)
    {
        var now = _clock.ElapsedMs;
        if (!_clock.IsRunning || now < 0 || now < _lastTime) _clockInvalid = true;
        if (_clockInvalid) { _failed = true; return false; }
        _lastTime = now;
        if (now >= end) { _failed = true; return false; }
        return true;
    }
}
