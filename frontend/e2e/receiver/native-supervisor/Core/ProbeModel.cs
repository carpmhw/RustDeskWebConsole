namespace RdWeb.Receiver.NativeSupervisor;

// 不可變診斷加私有生命週期事實，只消費公開標量、不建立任何原生資源。
public sealed class ProbeModel
{
    private static readonly ProbeEvent[] CaseEvents =
    [
        ProbeEvent.CaseE0, ProbeEvent.CaseE1, ProbeEvent.CaseE2, ProbeEvent.CaseE7,
        ProbeEvent.CaseO, ProbeEvent.CaseR, ProbeEvent.CaseA
    ];
    private readonly HashSet<ProbeEvent> _negative = [];
    private ProbeDiagnostic _value = new() { CancelState = ProbeCancelState.NotRequested };
    private ProbeDiagnostic? _terminal;
    private bool _failed;
    private bool _processSignaled;
    private bool _cancelIssued;
    private bool _jobOwned;
    private bool _jobOwnershipObserved;
    private bool _treeEmpty;
    private long _lastTime;
    private long? _cleanupEnd;
    private int _stage;
    private int _caseIndex;

    // 唯一事件邊界驗clock與enum；內部只傳typed事實，不把宣告當成OS證據。
    public void Observe(ProbeEvent kind, long elapsedMs, bool result)
    {
        if (_terminal is not null || !AcceptTime(elapsedMs)) return;
        if (!Enum.IsDefined(kind))
        {
            Fail(ProbeReason.GuardRejected);
            return;
        }
        // 只記採信層實際拒絕，不讓frame或呼叫端補任何正常退出／政策證據。
        if (kind == ProbeEvent.ChildFrameRejected)
        {
            Fail(_stage == 3 && result && _cleanupEnd is null && _value.ChildExit != EvidenceState.Confirmed
                ? ProbeReason.UnexpectedOutput : ProbeReason.GuardRejected);
            return;
        }
        if (kind == ProbeEvent.SupervisorBoundaryVerify)
        {
            if (_stage != 0 || _failed || _cleanupEnd is not null ||
                _value.SupervisorBoundaryVerify != EvidenceState.Unknown)
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            _value = _value with { SupervisorBoundaryVerify = result ? EvidenceState.Confirmed : EvidenceState.Unconfirmed };
            if (!result) Fail(ProbeReason.GuardRejected);
            return;
        }
        if (kind == ProbeEvent.JobOwned)
        {
            if (_stage != 1 || _jobOwnershipObserved || _value.SupervisorBoundaryVerify != EvidenceState.Confirmed)
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            _jobOwnershipObserved = true;
            if (result) _jobOwned = true;
            else Fail(ProbeReason.IoFailed);
            return;
        }
        if (kind is ProbeEvent.Suspended or ProbeEvent.Assigned or ProbeEvent.Resumed)
        {
            var wanted = _stage switch
            {
                0 => ProbeEvent.Suspended,
                1 => ProbeEvent.Assigned,
                2 => ProbeEvent.Resumed,
                _ => (ProbeEvent)(-1)
            };
            if (_value.SupervisorBoundaryVerify != EvidenceState.Confirmed || _processSignaled ||
                _value.ChildExit == EvidenceState.Confirmed || kind != wanted)
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            if (kind == ProbeEvent.Resumed && (_failed || _cleanupEnd is not null))
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            if (_failed && _value.Reason is not (ProbeReason.Deadline or ProbeReason.CleanupUnconfirmed)) return;
            if (kind == ProbeEvent.Assigned)
            {
                _value = _value with { JobAssigned = result ? EvidenceState.Confirmed : EvidenceState.Unconfirmed };
                if (result) _jobOwned = true;
            }
            if (kind == ProbeEvent.Resumed)
                _value = _value with { ChildStart = result ? EvidenceState.Confirmed : EvidenceState.Unconfirmed };
            if (!result)
            {
                Fail(ProbeReason.IoFailed);
                return;
            }
            _stage++;
            if (_cleanupEnd is not null) Fail(ProbeReason.CleanupUnconfirmed);
            return;
        }
        if (elapsedMs >= (_cleanupEnd ?? 18000)) return;
        if (kind == ProbeEvent.ProcessSignaled)
        {
            if (_stage == 0 || (!result && (_processSignaled || _value.ChildExit == EvidenceState.Confirmed)))
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            if (result) _processSignaled = true;
            return;
        }
        if (kind is ProbeEvent.StdoutOverflow or ProbeEvent.StderrOverflow)
        {
            if (result)
            {
                var evidence = kind == ProbeEvent.StdoutOverflow ? ProbeEvent.StdoutEof : ProbeEvent.StderrEof;
                _negative.Add(evidence);
                SetEvidence(evidence, EvidenceState.Unconfirmed);
            }
            Fail(result ? ProbeReason.UnexpectedOutput : ProbeReason.GuardRejected);
            return;
        }
        if (kind == ProbeEvent.StderrInterrupted)
        {
            if (!_failed && _stage == 3 && _caseIndex < CaseEvents.Length &&
                CaseEvents[_caseIndex] == ProbeEvent.CaseR && result && _cleanupEnd is null &&
                _value.ChildExit != EvidenceState.Confirmed)
            {
                _value = _value with { CaseSet = ProbeCaseSet.Mismatched };
                Fail(ProbeReason.NativeStderrInterrupted);
            }
            else Fail(ProbeReason.GuardRejected);
            return;
        }
        if (Array.IndexOf(CaseEvents, kind) >= 0)
        {
            if (_failed) return;
            if (_stage != 3 || _cleanupEnd is not null || _value.ChildExit == EvidenceState.Confirmed ||
                _caseIndex >= CaseEvents.Length || kind != CaseEvents[_caseIndex])
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            if (!result)
            {
                _value = _value with { CaseSet = ProbeCaseSet.Mismatched };
                Fail(ProbeReason.CaseMismatch);
                return;
            }
            _caseIndex++;
            if (_caseIndex == CaseEvents.Length) _value = _value with { CaseSet = ProbeCaseSet.Matched };
            return;
        }
        if (kind == ProbeEvent.Cancelled)
        {
            if (!_cancelIssued)
            {
                Fail(ProbeReason.GuardRejected);
                return;
            }
            if (!result) _negative.Add(kind);
            _value = _value with
            {
                CancelState = result && !_negative.Contains(kind) ? ProbeCancelState.Requested : ProbeCancelState.Unconfirmed
            };
            return;
        }
        if (_stage == 0 ||
            (kind == ProbeEvent.ChildExit && _stage != 3) ||
            (kind == ProbeEvent.TreeEmpty && (!_jobOwned ||
                (!_processSignaled && _value.ChildExit != EvidenceState.Confirmed))) ||
            (kind == ProbeEvent.ResourcesClose && (_cleanupEnd is null ||
                (!_processSignaled && _value.ChildExit != EvidenceState.Confirmed) ||
                _value.TreeEmpty != EvidenceState.Confirmed || _value.StdoutEof != EvidenceState.Confirmed ||
                _value.StderrEof != EvidenceState.Confirmed)))
        {
            Fail(ProbeReason.GuardRejected);
            return;
        }
        var confirmed = result && !(kind == ProbeEvent.ChildExit && _cancelIssued);
        if (!confirmed)
        {
            _negative.Add(kind);
            Fail(ProbeReason.CleanupUnconfirmed);
        }
        if (kind == ProbeEvent.TreeEmpty) _treeEmpty = confirmed && !_negative.Contains(kind);
        // 實體查空供取消決策使用，公開confirmed仍須符合既有v3的歸屬回驗前置。
        var publishConfirmed = confirmed && !_negative.Contains(kind) &&
            (kind != ProbeEvent.TreeEmpty || _value.JobAssigned == EvidenceState.Confirmed);
        SetEvidence(kind, publishConfirmed ? EvidenceState.Confirmed : EvidenceState.Unconfirmed);
    }

    // 不可變record可直接交外部保存，之後內部with不會改掉舊snapshot。
    public ProbeDiagnostic Snapshot() => _value;

    // 第一次cleanup固定絕對截止，僅回一次owned取消目標，不執行要求。
    public CancelDecision Cleanup(long elapsedMs)
    {
        if (_terminal is not null || !AcceptTime(elapsedMs)) return new(CancelTarget.None, _cleanupEnd);
        _cleanupEnd ??= Math.Min(20000, elapsedMs + 2000);
        var target = CancelTarget.None;
        if (!_cancelIssued && elapsedMs < _cleanupEnd)
        {
            if (_jobOwned)
            {
                if (!_treeEmpty ||
                    (!_processSignaled && _value.ChildExit != EvidenceState.Confirmed)) target = CancelTarget.OwnedJob;
            }
            else if (_stage > 0 && !_processSignaled && _value.ChildExit != EvidenceState.Confirmed)
                target = CancelTarget.OwnedProcess;
            if (target != CancelTarget.None)
            {
                _cancelIssued = true;
                _value = _value with { CancelState = ProbeCancelState.Unconfirmed };
                Fail(ProbeReason.CleanupUnconfirmed);
            }
        }
        return new(target, _cleanupEnd);
    }

    // 終態只由全九證據成立產生，缺證則保留首失敗，後續呼叫不復活。
    public ProbeDiagnostic Finish(long elapsedMs)
    {
        if (_terminal is not null) return _terminal;
        AcceptTime(elapsedMs);
        if (!_failed && _cleanupEnd is not null && _value.CaseSet == ProbeCaseSet.Matched &&
            _value.CancelState == ProbeCancelState.NotRequested &&
            _value.ChildStart == EvidenceState.Confirmed && _value.ChildExit == EvidenceState.Confirmed &&
            _value.ChildPolicyRestore == EvidenceState.Confirmed && _value.SupervisorBoundaryVerify == EvidenceState.Confirmed &&
            _value.ResourcesClose == EvidenceState.Confirmed && _value.JobAssigned == EvidenceState.Confirmed &&
            _value.TreeEmpty == EvidenceState.Confirmed && _value.StdoutEof == EvidenceState.Confirmed &&
            _value.StderrEof == EvidenceState.Confirmed)
            _value = _value with { Phase = ProbePhase.Complete, Reason = ProbeReason.None };
        else Fail(ProbeReason.CleanupUnconfirmed);
        _terminal = _value;
        return _terminal;
    }

    // 首失敗不被後續deadline或收尾錯誤替換。
    private void Fail(ProbeReason reason)
    {
        if (_failed) return;
        _failed = true;
        _value = _value with { Phase = ProbePhase.Failed, Reason = reason };
    }

    // clock邊界同JSsafe範圍；無效／逾期時取消可信收尾接受證據而非抹掉首原因。
    private bool AcceptTime(long elapsedMs)
    {
        if (elapsedMs < 0 || elapsedMs > 9007199254740991 || elapsedMs < _lastTime)
        {
            _negative.Add(ProbeEvent.ResourcesClose);
            SetEvidence(ProbeEvent.ResourcesClose, EvidenceState.Unconfirmed);
            Fail(ProbeReason.GuardRejected);
            return false;
        }
        _lastTime = elapsedMs;
        if (elapsedMs >= (_cleanupEnd ?? 18000))
        {
            _negative.Add(ProbeEvent.ResourcesClose);
            SetEvidence(ProbeEvent.ResourcesClose, EvidenceState.Unconfirmed);
            Fail(ProbeReason.Deadline);
        }
        return true;
    }

    // 呼叫點已分類的六個證據事件共用不可變更新，不重做輸入型別驗證。
    private void SetEvidence(ProbeEvent kind, EvidenceState state)
    {
        _value = kind switch
        {
            ProbeEvent.ChildExit => _value with { ChildExit = state },
            ProbeEvent.ChildPolicyRestore => _value with { ChildPolicyRestore = state },
            ProbeEvent.TreeEmpty => _value with { TreeEmpty = state },
            ProbeEvent.StdoutEof => _value with { StdoutEof = state },
            ProbeEvent.StderrEof => _value with { StderrEof = state },
            ProbeEvent.ResourcesClose => _value with { ResourcesClose = state },
            _ => throw new InvalidOperationException("receiver_native_supervisor_model_unavailable")
        };
    }
}
