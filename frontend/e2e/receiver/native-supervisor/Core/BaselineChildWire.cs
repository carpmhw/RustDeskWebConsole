using System.Text;
using System.Text.Json;

namespace RdWeb.Receiver.NativeSupervisor;

// 基線child格式與原六鍵入口隔離。
public static class BaselineChildWire
{
    private const string Prefix = "receiver_native_baseline_child_frame,";
    private const string Purpose = "receiver_native_baseline_child_v1";
    private static readonly UTF8Encoding Utf8 = new(false, true);

    // 有界解碼／案例與比較關聯／canonical一起驗證，拒絕不得留半份資料。
    public static BaselineChildFrame Parse(ReadOnlySpan<byte> wire)
    {
        var unknown = new BaselineChildFrame();
        if (wire.Length == 0 || wire.Length > 8192) return unknown;
        try
        {
            var text = Utf8.GetString(wire);
            if (text.EndsWith("\r\n", StringComparison.Ordinal)) text = text[..^2] + "\n";
            if (!text.StartsWith(Prefix, StringComparison.Ordinal) || text[^1] != '\n') return unknown;
            using var document = JsonDocument.Parse(text[Prefix.Length..^1], new JsonDocumentOptions { MaxDepth = 4 });
            if (document.RootElement.ValueKind != JsonValueKind.Object) return unknown;
            var fields = document.RootElement.EnumerateObject().ToArray();
            if (fields.Length != 7 || !ChildProbeWire.TryReadFields(fields.AsSpan(0, 6), Purpose, out var cases) ||
                fields[6].Name != "comparison" || fields[6].Value.ValueKind != JsonValueKind.Object ||
                !BaselineWire.TryReadComparison(fields[6].Value.EnumerateObject().ToArray(), out var comparison)) return unknown;
            var valid = cases.Reason switch
            {
                ProbeReason.None or ProbeReason.CleanupUnconfirmed => comparison.FirstProblemCase == ChildProbeCase.None,
                ProbeReason.GuardRejected => comparison == new BaselineComparison(),
                ProbeReason.IoFailed => comparison == new BaselineComparison() ||
                    (comparison.FirstProblemCase == (ChildProbeCase)(cases.PassedCases + 2) && comparison.Invocation == BaselineInvocation.Threw),
                ProbeReason.NativeStderrInterrupted => comparison.FirstProblemCase == ChildProbeCase.R && comparison.Invocation == BaselineInvocation.Threw,
                ProbeReason.CaseMismatch => comparison.FirstProblemCase == cases.FailedCase && comparison.Invocation == BaselineInvocation.Returned && Mismatched(comparison),
                _ => false
            };
            if (!valid || text != Prefix + "{" + ChildProbeWire.FormatFields(cases, Purpose) + ",\"comparison\":{" + BaselineWire.FormatComparison(comparison) + "}}\n") return unknown;
            return new() { Accepted = true, Cases = cases, Comparison = comparison };
        }
        catch (DecoderFallbackException) { return unknown; }
        catch (JsonException) { return unknown; }
        catch (InvalidOperationException) { return unknown; }
    }

    // 正常返回的首問題必須至少有一項原比較失敗，不從觀察反寫案例。
    private static bool Mismatched(BaselineComparison value)
    {
        var expectedShape = value.FirstProblemCase switch
        {
            ChildProbeCase.O => BaselineOutputShape.OneString,
            ChildProbeCase.R => BaselineOutputShape.OneErrorRecord,
            _ => BaselineOutputShape.Empty
        };
        if (value.PublicOutputMatched == true && value.OutputShape != expectedShape) return false;
        var expectedRef = value.FirstProblemCase switch
        {
            ChildProbeCase.E1 => BaselineRefValue.One,
            ChildProbeCase.E2 or ChildProbeCase.E7 => BaselineRefValue.Two,
            _ => BaselineRefValue.Zero
        };
        var expectedRaw = value.FirstProblemCase switch
        {
            ChildProbeCase.E1 => BaselineRawValue.One,
            ChildProbeCase.E2 => BaselineRawValue.Two,
            ChildProbeCase.E7 => BaselineRawValue.Seven,
            _ => BaselineRawValue.Zero
        };
        return value.RefType != BaselineValueType.Int32 || value.RefValue != expectedRef || value.RawType != BaselineValueType.Int32 || value.RawValue != expectedRaw || value.PublicOutputMatched == false;
    }
}
