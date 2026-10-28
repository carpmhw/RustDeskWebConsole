namespace RdWeb.Receiver.NativeSupervisor;

// 狀態與原因只代表固定診斷分類，不承載原生錯誤或動態字串。
public enum ProbePhase { Unknown, Failed, Complete }
public enum ProbeReason
{
    Unknown, None, GuardRejected, IoFailed, Deadline, UnexpectedOutput,
    CleanupUnconfirmed, CaseMismatch, NativeStderrInterrupted
}
public enum EvidenceState { Unknown, NotAcquired, Confirmed, Unconfirmed }
public enum ProbeCaseSet { Unknown, Matched, Mismatched }
public enum ProbeCancelState { Unknown, NotRequested, Requested, Unconfirmed }
public enum ProbeStatus { Unavailable, Observed, DefectObserved }
public enum CancelTarget { None, OwnedProcess, OwnedJob }

// 事件是呼叫者宣告的安全事實，不是執行原生API的指令或證據來源。
public enum ProbeEvent
{
    SupervisorBoundaryVerify, Suspended, Assigned, Resumed, ProcessSignaled,
    CaseE0, CaseE1, CaseE2, CaseE7, CaseO, CaseR, CaseA,
    ChildExit, ChildPolicyRestore, TreeEmpty, StdoutEof, StderrEof, ResourcesClose,
    StdoutOverflow, StderrOverflow, StderrInterrupted, Cancelled, JobOwned, ChildFrameRejected
}

// 不可變診斷使舊snapshot與終態不能由後續事件改寫；預設全為未知。
public sealed record ProbeDiagnostic
{
    public int Version => 3;
    public ProbePhase Phase { get; init; }
    public ProbeReason Reason { get; init; }
    public EvidenceState ChildStart { get; init; }
    public EvidenceState ChildExit { get; init; }
    public EvidenceState ChildPolicyRestore { get; init; }
    public EvidenceState SupervisorBoundaryVerify { get; init; }
    public EvidenceState ResourcesClose { get; init; }
    public EvidenceState JobAssigned { get; init; }
    public EvidenceState TreeEmpty { get; init; }
    public EvidenceState StdoutEof { get; init; }
    public EvidenceState StderrEof { get; init; }
    public ProbeCaseSet CaseSet { get; init; }
    public ProbeCancelState CancelState { get; init; }
}

// 結果只包含封閉分類及診斷，不傳回收到的原始wire。
public sealed record ProbeResult(ProbeStatus Status, ProbeDiagnostic Diagnostic);

// 取消決策不持有handle／PID，也不代表已執行或已確認退出。
public readonly record struct CancelDecision(CancelTarget Target, long? DeadlineMs);
