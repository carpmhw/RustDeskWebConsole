namespace RdWeb.Receiver.NativeSupervisor;

// 只描述frame中的首false位置，不宣稱已取得真程序或來源證據。
public enum ChildProbeCase { Unknown, None, E0, E1, E2, E7, O, R, A }

// 僅保存已驗typed標量；拒絕時不得留下部分解析值或原始內容。
public sealed record ChildProbeFrame
{
    public bool Accepted { get; init; }
    public ProbeReason Reason { get; init; }
    public int PassedCases { get; init; }
    public ChildProbeCase FailedCase { get; init; }
    public EvidenceState ChildPolicyRestore { get; init; }
    public EvidenceState ChildResourcesClose { get; init; }
}
