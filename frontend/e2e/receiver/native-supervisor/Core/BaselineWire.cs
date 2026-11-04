using System.Text;
using System.Text.Json;

namespace RdWeb.Receiver.NativeSupervisor;

// 獨立基線資料邊界，固定token不接收內容或任意程序資料。
public static class BaselineWire
{
    private const string Prefix = "receiver_native_baseline_observation,";
    private static readonly string[][] Tokens =
    [
        ["unknown", "none", "E0", "E1", "E2", "E7", "O", "R", "A"],
        ["unknown", "returned", "threw"], ["unknown", "int32", "other"],
        ["unknown", "0", "1", "2", "other"], ["unknown", "int32", "other"],
        ["unknown", "0", "1", "2", "7", "other"], ["unknown", "empty", "one_string", "one_error_record", "other"],
        ["not_observed", "accepted", "rejected"], ["not_reached", "sampled"], ["unknown", "empty", "nonempty"],
        ["unknown", "none", "owned_process", "owned_job"]
    ];
    private static readonly string[] ComparisonFields = ["firstProblemCase", "invocation", "refType", "refValue", "rawType", "rawValue", "outputShape", "publicOutputMatched"];
    private static readonly string[] Fields = ["schemaVersion", "purpose", "childObservation", .. ComparisonFields, "cancelObservation", "psSignaledAtDecision", "jobAtDecision", "cancelTarget", "terminationAttempted", "terminationResult"];

    // 精確三行consumer驗原canonical／exit與獨立觀察，不放寬原兩行parser。
    public static bool TryParseResult(ReadOnlySpan<byte> wire, int exitCode, out ProbeResult result, out BaselineObservation observation)
    {
        result = new(ProbeStatus.Unavailable, new());
        observation = new();
        if (wire.Length == 0 || wire.Length > 8192 || wire.ContainsAnyExceptInRange((byte)0, (byte)127)) return false;
        var text = Encoding.ASCII.GetString(wire);
        if (text.Contains('\r')) return false;
        var lines = text.Split('\n');
        if (lines.Length != 4 || lines[3] != "") return false;
        var original = lines[0] + "\n" + lines[1] + "\n";
        var parsed = ProbeWire.Parse(original);
        if (ProbeWire.FormatResult(parsed.Diagnostic).Wire != original ||
            exitCode != (parsed.Status switch { ProbeStatus.Observed => 0, ProbeStatus.DefectObserved => 1, _ => 2 }) ||
            !TryParse(Encoding.ASCII.GetBytes(lines[2] + "\n"), out var snapshot)) return false;
        var comparison = snapshot.Comparison;
        var diagnostic = parsed.Diagnostic;
        if ((diagnostic.ChildExit == EvidenceState.Confirmed && snapshot.ChildObservation != BaselineChildObservation.Accepted) ||
            (snapshot.CancelObservation == BaselineCancelObservation.Sampled && snapshot.CancelTarget != CancelTarget.None && diagnostic.CancelState == ProbeCancelState.NotRequested)) return false;
        if (parsed.Status == ProbeStatus.Observed && (snapshot.ChildObservation != BaselineChildObservation.Accepted || comparison.FirstProblemCase != ChildProbeCase.None)) return false;
        if (snapshot.ChildObservation == BaselineChildObservation.Accepted)
        {
            if (comparison.FirstProblemCase == ChildProbeCase.None)
            {
                if (diagnostic.CaseSet != ProbeCaseSet.Matched || diagnostic.ChildExit != EvidenceState.Confirmed || diagnostic.ChildPolicyRestore != EvidenceState.Confirmed) return false;
            }
            else if (comparison.Invocation == BaselineInvocation.Returned || diagnostic.Reason == ProbeReason.NativeStderrInterrupted)
            {
                if (diagnostic.CaseSet != ProbeCaseSet.Mismatched || diagnostic.ChildExit != EvidenceState.Confirmed || diagnostic.ChildPolicyRestore != EvidenceState.Confirmed ||
                    diagnostic.Reason is not (ProbeReason.CaseMismatch or ProbeReason.NativeStderrInterrupted) ||
                    (diagnostic.Reason == ProbeReason.NativeStderrInterrupted && (comparison.FirstProblemCase != ChildProbeCase.R || comparison.Invocation != BaselineInvocation.Threw))) return false;
            }
            else if (parsed.Status != ProbeStatus.Unavailable || diagnostic.ChildExit == EvidenceState.Confirmed || diagnostic.ChildPolicyRestore == EvidenceState.Confirmed || diagnostic.CaseSet != ProbeCaseSet.Unknown) return false;
        }
        result = parsed;
        observation = snapshot;
        return true;
    }

    // 公開typed邊界拒絕非法enum或矛盾未知值，再產生固定順序ASCII。
    public static bool TryFormat(BaselineObservation value, out string line)
    {
        line = "";
        if (value is null || !ValidComparison(value.Comparison) ||
            !Enum.IsDefined(value.ChildObservation) || !Enum.IsDefined(value.CancelObservation) || !Enum.IsDefined(value.JobAtDecision) ||
            (value.CancelTarget is { } target && !Enum.IsDefined(target)) ||
            (value.ChildObservation != BaselineChildObservation.Accepted && value.Comparison != new BaselineComparison()) ||
            (value.CancelObservation == BaselineCancelObservation.NotReached &&
                (value.PsSignaledAtDecision is not null || value.JobAtDecision != BaselineJobState.Unknown || value.CancelTarget is not null || value.TerminationAttempted is not null || value.TerminationResult is not null)) ||
            (value.CancelObservation == BaselineCancelObservation.Sampled && (value.CancelTarget is null || value.TerminationAttempted is null)) ||
            (value.TerminationAttempted != true && value.TerminationResult is not null) ||
            (value.TerminationAttempted == true && value.CancelTarget is not (CancelTarget.OwnedProcess or CancelTarget.OwnedJob))) return false;
        line = Prefix + "{\"schemaVersion\":1,\"purpose\":\"receiver_native_baseline_v1\",\"childObservation\":\"" + Tokens[7][(int)value.ChildObservation] + "\"," + FormatComparison(value.Comparison) +
            ",\"cancelObservation\":\"" + Tokens[8][(int)value.CancelObservation] + "\",\"psSignaledAtDecision\":" + Boolean(value.PsSignaledAtDecision) +
            ",\"jobAtDecision\":\"" + Tokens[9][(int)value.JobAtDecision] + "\",\"cancelTarget\":\"" + Tokens[10][value.CancelTarget is null ? 0 : (int)value.CancelTarget + 1] +
            "\",\"terminationAttempted\":" + Boolean(value.TerminationAttempted) + ",\"terminationResult\":" + Boolean(value.TerminationResult) + "}\n";
        if (line.Length <= 1024) return true;
        line = "";
        return false;
    }

    // 拒絕不得保存任何部分外部資料。
    public static bool TryParse(ReadOnlySpan<byte> wire, out BaselineObservation value)
    {
        value = new();
        if (wire.Length == 0 || wire.Length > 1024 || wire.ContainsAnyExceptInRange((byte)0x00, (byte)0x7f)) return false;
        var text = Encoding.ASCII.GetString(wire);
        if (!text.StartsWith(Prefix, StringComparison.Ordinal) || text[^1] != '\n') return false;
        try
        {
            using var document = JsonDocument.Parse(text[Prefix.Length..^1], new JsonDocumentOptions { MaxDepth = 4 });
            if (document.RootElement.ValueKind != JsonValueKind.Object) return false;
            var fields = document.RootElement.EnumerateObject().ToArray();
            if (fields.Length != Fields.Length) return false;
            for (var i = 0; i < fields.Length; i++) if (fields[i].Name != Fields[i]) return false;
            if (fields[0].Value.ValueKind != JsonValueKind.Number || !fields[0].Value.TryGetInt32(out var version) || version != 1 ||
                fields[1].Value.ValueKind != JsonValueKind.String || fields[1].Value.GetString() != "receiver_native_baseline_v1" ||
                !TryReadComparison(fields.AsSpan(3, 8), out var comparison)) return false;
            var child = ReadToken(fields[2].Value, 7);
            var cancel = ReadToken(fields[11].Value, 8);
            var job = ReadToken(fields[13].Value, 9);
            var target = ReadToken(fields[14].Value, 10);
            if (child < 0 || cancel < 0 || job < 0 || target < 0 || !TryBoolean(fields[12].Value, out var signal) ||
                !TryBoolean(fields[15].Value, out var attempted) || !TryBoolean(fields[16].Value, out var result)) return false;
            var parsed = new BaselineObservation
            {
                ChildObservation = (BaselineChildObservation)child,
                Comparison = comparison,
                CancelObservation = (BaselineCancelObservation)cancel,
                PsSignaledAtDecision = signal,
                JobAtDecision = (BaselineJobState)job,
                CancelTarget = target == 0 ? null : (CancelTarget)(target - 1),
                TerminationAttempted = attempted,
                TerminationResult = result
            };
            if (!TryFormat(parsed, out var canonical) || canonical != text) return false;
            value = parsed;
            return true;
        }
        catch (JsonException) { return false; }
        catch (InvalidOperationException) { return false; }
    }

    // 比較只允許已完成值，throw不能攜帶上一案raw或部分output。
    internal static bool ValidComparison(BaselineComparison value)
    {
        if (value is null || !Enum.IsDefined(value.FirstProblemCase) || !Enum.IsDefined(value.Invocation) ||
            !Enum.IsDefined(value.RefType) || !Enum.IsDefined(value.RefValue) || !Enum.IsDefined(value.RawType) ||
            !Enum.IsDefined(value.RawValue) || !Enum.IsDefined(value.OutputShape)) return false;
        if (value.FirstProblemCase is ChildProbeCase.Unknown or ChildProbeCase.None)
            return value == new BaselineComparison { FirstProblemCase = value.FirstProblemCase };
        if ((value.RefType == BaselineValueType.Int32) != (value.RefValue != BaselineRefValue.Unknown) ||
            (value.RawType == BaselineValueType.Int32) != (value.RawValue != BaselineRawValue.Unknown)) return false;
        return value.Invocation switch
        {
            BaselineInvocation.Returned => value.RefType != BaselineValueType.Unknown && value.RawType != BaselineValueType.Unknown && value.OutputShape != BaselineOutputShape.Unknown && value.PublicOutputMatched is not null,
            BaselineInvocation.Threw => value.RawType == BaselineValueType.Unknown && value.RawValue == BaselineRawValue.Unknown && value.OutputShape == BaselineOutputShape.Unknown && value.PublicOutputMatched is null,
            _ => false
        };
    }

    // 八鍵共用外部schema只在codec內傳遞JsonProperty，整份拒絕不留值。
    internal static bool TryReadComparison(ReadOnlySpan<JsonProperty> fields, out BaselineComparison value)
    {
        value = new();
        if (fields.Length != 8) return false;
        var indexes = new int[7];
        for (var i = 0; i < 8; i++)
        {
            if (fields[i].Name != ComparisonFields[i]) return false;
            if (i < 7 && (indexes[i] = ReadToken(fields[i].Value, i)) < 0) return false;
        }
        if (!TryBoolean(fields[7].Value, out var matched)) return false;
        var parsed = new BaselineComparison
        {
            FirstProblemCase = (ChildProbeCase)indexes[0],
            Invocation = (BaselineInvocation)indexes[1],
            RefType = (BaselineValueType)indexes[2],
            RefValue = (BaselineRefValue)indexes[3],
            RawType = (BaselineValueType)indexes[4],
            RawValue = (BaselineRawValue)indexes[5],
            OutputShape = (BaselineOutputShape)indexes[6],
            PublicOutputMatched = matched
        };
        if (!ValidComparison(parsed)) return false;
        value = parsed;
        return true;
    }

    // 只消費邊界已驗typed資料，回不含括號或換行的canonical八欄。
    internal static string FormatComparison(BaselineComparison value)
    {
        int[] indexes = [(int)value.FirstProblemCase, (int)value.Invocation, (int)value.RefType, (int)value.RefValue, (int)value.RawType, (int)value.RawValue, (int)value.OutputShape];
        var builder = new StringBuilder();
        for (var i = 0; i < 7; i++)
        {
            if (i != 0) builder.Append(',');
            builder.Append('"').Append(ComparisonFields[i]).Append("\":\"").Append(Tokens[i][indexes[i]]).Append('"');
        }
        return builder.Append(",\"publicOutputMatched\":").Append(Boolean(value.PublicOutputMatched)).ToString();
    }

    // 字串token不接受數字或其他JSON型別。
    private static int ReadToken(JsonElement value, int group) => value.ValueKind == JsonValueKind.String ? Array.IndexOf(Tokens[group], value.GetString()) : -1;

    // null保持未知，只有真正JSON布林可進入typed nullable值。
    private static bool TryBoolean(JsonElement value, out bool? result)
    {
        result = value.ValueKind switch { JsonValueKind.True => true, JsonValueKind.False => false, _ => null };
        return value.ValueKind is JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null;
    }

    // 固定ASCII布林不依賴文化或任意物件格式化。
    private static string Boolean(bool? value) => value switch { true => "true", false => "false", _ => "null" };
}
