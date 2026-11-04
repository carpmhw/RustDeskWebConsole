using System.Text;
using System.Text.Json;

namespace RdWeb.Receiver.NativeSupervisor;

// child frame的純資料邊界，與supervisor v3與程序生命週期分離。
public static class ChildProbeWire
{
    private const string Prefix = "receiver_native_child_frame,";
    private const string Purpose = "receiver_native_child_cases_v1";
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly string[] Fields = ["version", "purpose", "reason", "cases", "childPolicyRestore", "childResourcesClose"];
    private static readonly string[] States = ["unknown", "not_acquired", "confirmed", "unconfirmed"];

    // 唯一外部邊界先限原bytes，再解碼／驗schema／canonical；拒絕不回傳部分值。
    public static ChildProbeFrame Parse(ReadOnlySpan<byte> wire)
    {
        var unknown = new ChildProbeFrame();
        if (wire.Length == 0 || wire.Length > 8192) return unknown;
        try
        {
            var text = Utf8.GetString(wire);
            if (text.EndsWith("\r\n", StringComparison.Ordinal)) text = text[..^2] + "\n";
            if (!text.StartsWith(Prefix, StringComparison.Ordinal) || text[^1] != '\n' ||
                text.AsSpan(0, text.Length - 1).IndexOfAny('\r', '\n') >= 0) return unknown;
            using var document = JsonDocument.Parse(text[Prefix.Length..^1], new JsonDocumentOptions { MaxDepth = 4 });
            if (document.RootElement.ValueKind != JsonValueKind.Object) return unknown;
            var properties = document.RootElement.EnumerateObject().ToArray();
            if (!TryReadFields(properties, Purpose, out var frame) || text != Prefix + "{" + FormatFields(frame, Purpose) + "}\n") return unknown;
            return frame;
        }
        catch (DecoderFallbackException) { return unknown; }
        catch (JsonException) { return unknown; }
        catch (InvalidOperationException) { return unknown; }
    }

    // 兩個固定用途共用案例語法，JSON物件不離開codec邊界。
    internal static bool TryReadFields(ReadOnlySpan<JsonProperty> properties, string purpose, out ChildProbeFrame frame)
    {
        frame = new();
        if (properties.Length != 6) return false;
        for (var index = 0; index < Fields.Length; index++)
            if (properties[index].Name != Fields[index]) return false;
        if (properties[0].Value.ValueKind != JsonValueKind.Number || !properties[0].Value.TryGetInt32(out var version) || version != 1 ||
            properties[1].Value.ValueKind != JsonValueKind.String || properties[1].Value.GetString() != purpose ||
            properties[2].Value.ValueKind != JsonValueKind.String || properties[3].Value.ValueKind != JsonValueKind.Array ||
            properties[4].Value.ValueKind != JsonValueKind.String || properties[5].Value.ValueKind != JsonValueKind.String) return false;
        var reasonText = properties[2].Value.GetString();
        var reason = reasonText switch
        {
            "none" => ProbeReason.None,
            "guard_rejected" => ProbeReason.GuardRejected,
            "io_failed" => ProbeReason.IoFailed,
            "case_mismatch" => ProbeReason.CaseMismatch,
            "native_stderr_interrupted" => ProbeReason.NativeStderrInterrupted,
            "cleanup_unconfirmed" => ProbeReason.CleanupUnconfirmed,
            _ => ProbeReason.Unknown
        };
        var policyText = properties[4].Value.GetString();
        var resourcesText = properties[5].Value.GetString();
        var policyIndex = Array.IndexOf(States, policyText);
        var resourceIndex = Array.IndexOf(States, resourcesText);
        if (reason == ProbeReason.Unknown || policyIndex < 0 || policyIndex == 1 || resourceIndex < 0) return false;
        var policy = (EvidenceState)policyIndex;
        var resources = (EvidenceState)resourceIndex;
        var passed = 0;
        var count = 0;
        var failed = ChildProbeCase.None;
        foreach (var item in properties[3].Value.EnumerateArray())
        {
            if (count == 7 || failed != ChildProbeCase.None || item.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
            if (item.ValueKind == JsonValueKind.True) passed++;
            else failed = (ChildProbeCase)(count + 2);
            count++;
        }
        var valid = reason switch
        {
            ProbeReason.None => passed == 7 && policy == EvidenceState.Confirmed && resources == EvidenceState.Confirmed,
            ProbeReason.GuardRejected => count == 0,
            ProbeReason.IoFailed => count <= 6 && failed == ChildProbeCase.None,
            ProbeReason.CaseMismatch => failed != ChildProbeCase.None,
            ProbeReason.NativeStderrInterrupted => passed == 5 && failed == ChildProbeCase.R,
            ProbeReason.CleanupUnconfirmed => passed == 7 && (policy != EvidenceState.Confirmed || resources != EvidenceState.Confirmed),
            _ => false
        };
        if (!valid) return false;
        frame = new ChildProbeFrame
        {
            Accepted = true,
            Reason = reason,
            PassedCases = passed,
            FailedCase = failed,
            ChildPolicyRestore = policy,
            ChildResourcesClose = resources
        };
        return true;
    }

    // 只格式化已驗過的案例欄位，不包含外層括號或prefix。
    internal static string FormatFields(ChildProbeFrame frame, string purpose)
    {
        var reason = frame.Reason switch
        {
            ProbeReason.None => "none",
            ProbeReason.GuardRejected => "guard_rejected",
            ProbeReason.IoFailed => "io_failed",
            ProbeReason.CaseMismatch => "case_mismatch",
            ProbeReason.NativeStderrInterrupted => "native_stderr_interrupted",
            _ => "cleanup_unconfirmed"
        };
        var cases = string.Join(',', Enumerable.Repeat("true", frame.PassedCases));
        if (frame.FailedCase != ChildProbeCase.None) cases += (frame.PassedCases == 0 ? "" : ",") + "false";
        return "\"version\":1,\"purpose\":\"" + purpose + "\",\"reason\":\"" + reason + "\",\"cases\":[" + cases +
            "],\"childPolicyRestore\":\"" + States[(int)frame.ChildPolicyRestore] + "\",\"childResourcesClose\":\"" + States[(int)frame.ChildResourcesClose] + "\"";
    }
}
