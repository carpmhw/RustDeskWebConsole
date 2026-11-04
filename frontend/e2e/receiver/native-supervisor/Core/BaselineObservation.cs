namespace RdWeb.Receiver.NativeSupervisor;

// 觀察只使用封閉分類，不攜帶來源內容或原生識別。
public enum BaselineChildObservation { NotObserved, Accepted, Rejected }
public enum BaselineInvocation { Unknown, Returned, Threw }
public enum BaselineValueType { Unknown, Int32, Other }
public enum BaselineRefValue { Unknown, Zero, One, Two, Other }
public enum BaselineRawValue { Unknown, Zero, One, Two, Seven, Other }
public enum BaselineOutputShape { Unknown, Empty, OneString, OneErrorRecord, Other }
public enum BaselineCancelObservation { NotReached, Sampled }
public enum BaselineJobState { Unknown, Empty, Nonempty }

// 首問題資料不沿用上一案的raw或未完成輸出。
public sealed record BaselineComparison
{
    public ChildProbeCase FirstProblemCase { get; init; }
    public BaselineInvocation Invocation { get; init; }
    public BaselineValueType RefType { get; init; }
    public BaselineRefValue RefValue { get; init; }
    public BaselineValueType RawType { get; init; }
    public BaselineRawValue RawValue { get; init; }
    public BaselineOutputShape OutputShape { get; init; }
    public bool? PublicOutputMatched { get; init; }
}

// 子觀察與父取消觀察獨立，不作Core成功證據。
public sealed record BaselineObservation
{
    public int SchemaVersion => 1;
    public string Purpose => "receiver_native_baseline_v1";
    public BaselineChildObservation ChildObservation { get; init; }
    public BaselineComparison Comparison { get; init; } = new();
    public BaselineCancelObservation CancelObservation { get; init; }
    public bool? PsSignaledAtDecision { get; init; }
    public BaselineJobState JobAtDecision { get; init; }
    public CancelTarget? CancelTarget { get; init; }
    public bool? TerminationAttempted { get; init; }
    public bool? TerminationResult { get; init; }
}

// 案例與比較須整份解析，不交付半份child frame。
public sealed record BaselineChildFrame
{
    public bool Accepted { get; init; }
    public ChildProbeFrame Cases { get; init; } = new();
    public BaselineComparison Comparison { get; init; } = new();
}
