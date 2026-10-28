using System.Text;
using System.Text.Json;

namespace RdWeb.Receiver.NativeSupervisor;

// 封閉v3傳輸邊界，不接受舊父政策schema或動態字串分類。
public static class ProbeWire
{
    private const string Prefix = "receiver_native_supervisor_diagnostic,";
    private static readonly string[] Fields =
    [
        "version", "phase", "reason", "childStart", "childExit", "childPolicyRestore",
        "supervisorBoundaryVerify", "resourcesClose", "jobAssigned", "treeEmpty",
        "stdoutEof", "stderrEof", "caseSet", "cancelState"
    ];
    private static readonly string[] Phases = ["unknown", "failed", "complete"];
    private static readonly string[] Reasons =
    [
        "unknown", "none", "guard_rejected", "io_failed", "deadline", "unexpected_output",
        "cleanup_unconfirmed", "case_mismatch", "native_stderr_interrupted"
    ];
    private static readonly string[] States = ["unknown", "not_acquired", "confirmed", "unconfirmed"];
    private static readonly string[] CaseSets = ["unknown", "matched", "mismatched"];
    private static readonly string[] CancelStates = ["unknown", "not_requested", "requested", "unconfirmed"];
    private static readonly string[] Statuses = ["unavailable", "observed", "defect_observed"];

    // 缺證一律維持未知，不沿用其他runtime的歷史結果。
    public static ProbeDiagnostic Unknown() => new();

    // 公開格式化邊界驗證typed值與狀態關係，拒絕只回固定安全例外。
    public static string Format(ProbeDiagnostic value)
    {
        if (!TryFormat(value, out var line))
            throw new InvalidOperationException("receiver_native_supervisor_diagnostic_unavailable");
        return line;
    }

    // 完整終態只驗一次並沿唯一分類器，console不重寫證據規則或解析自己剛產生的wire。
    public static (ProbeStatus Status, string Wire) FormatResult(ProbeDiagnostic value)
    {
        if (!TryFormat(value, out var line))
            throw new InvalidOperationException("receiver_native_supervisor_diagnostic_unavailable");
        var status = Status(value);
        return (status, line + "receiver_native_supervisor_result,status=" + Statuses[(int)status] + "\n");
    }

    // 原wire先限byte，再驗完整兩行與JSON；非法輸入不保存也不回顯。
    public static ProbeResult Parse(string? wire)
    {
        var unknown = new ProbeResult(ProbeStatus.Unavailable, Unknown());
        if (wire is null || Encoding.UTF8.GetByteCount(wire) > 8192) return unknown;
        var normalized = wire.Replace("\r\n", "\n", StringComparison.Ordinal);
        if (normalized.Contains('\r')) return unknown;
        var lines = normalized.Split('\n');
        if (lines.Length != 3 || lines[2] != "" || !lines[0].StartsWith(Prefix, StringComparison.Ordinal))
            return unknown;
        // JSON語法與字串解碼分開：孤立surrogate可能在GetString才以InvalidOperationException拒絕。
        try
        {
            using var document = JsonDocument.Parse(lines[0][Prefix.Length..]);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return unknown;
            var properties = document.RootElement.EnumerateObject().ToArray();
            if (properties.Length != Fields.Length) return unknown;
            for (var index = 0; index < Fields.Length; index++)
            {
                if (properties[index].Name != Fields[index]) return unknown;
                if (index > 0 && properties[index].Value.ValueKind != JsonValueKind.String) return unknown;
            }
            if (properties[0].Value.ValueKind != JsonValueKind.Number ||
                !properties[0].Value.TryGetInt32(out var version) || version != 3) return unknown;
            var value = new ProbeDiagnostic
            {
                Phase = (ProbePhase)Array.IndexOf(Phases, properties[1].Value.GetString()),
                Reason = (ProbeReason)Array.IndexOf(Reasons, properties[2].Value.GetString()),
                ChildStart = (EvidenceState)Array.IndexOf(States, properties[3].Value.GetString()),
                ChildExit = (EvidenceState)Array.IndexOf(States, properties[4].Value.GetString()),
                ChildPolicyRestore = (EvidenceState)Array.IndexOf(States, properties[5].Value.GetString()),
                SupervisorBoundaryVerify = (EvidenceState)Array.IndexOf(States, properties[6].Value.GetString()),
                ResourcesClose = (EvidenceState)Array.IndexOf(States, properties[7].Value.GetString()),
                JobAssigned = (EvidenceState)Array.IndexOf(States, properties[8].Value.GetString()),
                TreeEmpty = (EvidenceState)Array.IndexOf(States, properties[9].Value.GetString()),
                StdoutEof = (EvidenceState)Array.IndexOf(States, properties[10].Value.GetString()),
                StderrEof = (EvidenceState)Array.IndexOf(States, properties[11].Value.GetString()),
                CaseSet = (ProbeCaseSet)Array.IndexOf(CaseSets, properties[12].Value.GetString()),
                CancelState = (ProbeCancelState)Array.IndexOf(CancelStates, properties[13].Value.GetString())
            };
            if (!TryFormat(value, out var canonical) || canonical[..^1] != lines[0]) return unknown;
            var status = Status(value);
            if (lines[1] != "receiver_native_supervisor_result,status=" + Statuses[(int)status]) return unknown;
            return new(status, value);
        }
        catch (JsonException) { return unknown; }
        catch (InvalidOperationException) { return unknown; }
    }

    // 九項證據維持明確順序，供formatter與可信defect分類共用。
    private static EvidenceState[] Evidence(ProbeDiagnostic value) =>
    [
        value.ChildStart, value.ChildExit, value.ChildPolicyRestore, value.SupervisorBoundaryVerify,
        value.ResourcesClose, value.JobAssigned, value.TreeEmpty, value.StdoutEof, value.StderrEof
    ];

    // enum強轉可產生未定義值，唯一外部schema邊界不得讓它索引任意token。
    private static string? Token<T>(T value, string[] names) where T : struct, Enum
    {
        var index = Convert.ToInt32(value);
        return (uint)index < (uint)names.Length ? names[index] : null;
    }

    // formatter與parser只在此檢查一次schema與語意；後續canonical僅使用已驗token。
    private static bool TryFormat(ProbeDiagnostic value, out string line)
    {
        line = "";
        if (value is null) return false;
        string?[] tokens =
        [
            "3", Token(value.Phase, Phases), Token(value.Reason, Reasons),
            Token(value.ChildStart, States), Token(value.ChildExit, States),
            Token(value.ChildPolicyRestore, States), Token(value.SupervisorBoundaryVerify, States),
            Token(value.ResourcesClose, States), Token(value.JobAssigned, States),
            Token(value.TreeEmpty, States), Token(value.StdoutEof, States), Token(value.StderrEof, States),
            Token(value.CaseSet, CaseSets), Token(value.CancelState, CancelStates)
        ];
        if (tokens.Any(token => token is null)) return false;
        if ((value.Phase == ProbePhase.Complete) != (value.Reason == ProbeReason.None) ||
            (value.Phase == ProbePhase.Unknown && value.Reason != ProbeReason.Unknown) ||
            (value.TreeEmpty == EvidenceState.Confirmed &&
                (value.JobAssigned != EvidenceState.Confirmed ||
                 (value.ChildExit != EvidenceState.Confirmed && value.Phase != ProbePhase.Failed))) ||
            (value.ChildStart == EvidenceState.Confirmed && value.JobAssigned != EvidenceState.Confirmed))
            return false;
        if (value.Phase == ProbePhase.Complete &&
            (Evidence(value).Any(state => state != EvidenceState.Confirmed) ||
             value.CaseSet != ProbeCaseSet.Matched || value.CancelState != ProbeCancelState.NotRequested))
            return false;
        if (value.Reason is ProbeReason.CaseMismatch or ProbeReason.NativeStderrInterrupted &&
            (value.Phase != ProbePhase.Failed || value.CaseSet != ProbeCaseSet.Mismatched ||
             value.ChildStart != EvidenceState.Confirmed || value.JobAssigned != EvidenceState.Confirmed))
            return false;
        var builder = new StringBuilder(Prefix + "{\"version\":3");
        for (var index = 1; index < Fields.Length; index++)
            builder.Append(",\"").Append(Fields[index]).Append("\":\"").Append(tokens[index]).Append('"');
        line = builder.Append("}\n").ToString();
        return Encoding.UTF8.GetByteCount(line) <= 8192;
    }

    // 已驗證資料的可信分類不能把取消或缺證升成已觀察的成功／缺陷。
    private static ProbeStatus Status(ProbeDiagnostic value)
    {
        if (value.Phase == ProbePhase.Complete) return ProbeStatus.Observed;
        if (value.Phase == ProbePhase.Failed &&
            value.Reason is ProbeReason.CaseMismatch or ProbeReason.NativeStderrInterrupted &&
            Evidence(value).All(state => state == EvidenceState.Confirmed) &&
            value.CancelState == ProbeCancelState.NotRequested) return ProbeStatus.DefectObserved;
        return ProbeStatus.Unavailable;
    }
}
