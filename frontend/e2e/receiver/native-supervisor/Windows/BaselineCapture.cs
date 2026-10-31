namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 本輪安全快照只接受session已驗的typed事實，不授予Core或OS成功證據。
internal sealed class BaselineCapture
{
    private BaselineObservation _value = new();
    private bool _firstCheck;

    // 不可變snapshot不能被後續清理覆寫。
    internal BaselineObservation Snapshot() => _value;

    // 同輪首份可信child資料封存後不接受另一份。
    internal void AcceptChild(BaselineChildFrame frame)
    {
        if (_value.ChildObservation != BaselineChildObservation.NotObserved) return;
        _value = _value with { ChildObservation = BaselineChildObservation.Accepted, Comparison = frame.Comparison };
    }

    // 整份拒絕不保留部分比較，不覆蓋已有可信資料。
    internal void RejectChild()
    {
        if (_value.ChildObservation == BaselineChildObservation.NotObserved)
            _value = _value with { ChildObservation = BaselineChildObservation.Rejected };
    }

    // 僅首個原取消檢查點封存；後續呼叫不能補寫到前次結果。
    internal void ObserveCancellationCheck(CancelDecision decision, bool? psSignaled, BaselineJobState job)
    {
        _firstCheck = _value.CancelObservation == BaselineCancelObservation.NotReached;
        if (!_firstCheck) return;
        _value = _value with
        {
            CancelObservation = BaselineCancelObservation.Sampled,
            PsSignaledAtDecision = psSignaled,
            JobAtDecision = job,
            CancelTarget = decision.Target,
            TerminationAttempted = false
        };
    }

    // 進入真終止API前記attempt，即使API拋錯也不冒稱未呼叫。
    internal void TerminationStarting()
    {
        if (_firstCheck) _value = _value with { TerminationAttempted = true };
    }

    // 只有同一次API正常返回才補結果。
    internal void TerminationReturned(bool result)
    {
        if (_firstCheck) _value = _value with { TerminationResult = result };
    }
}
