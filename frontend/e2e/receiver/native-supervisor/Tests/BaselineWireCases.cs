using System.Text;
using RdWeb.Receiver.NativeSupervisor;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 手寫wire預期能抓到欄位／型別／未知語意的錯誤，不用formatter自製oracle。
internal static class BaselineWireCases
{
    internal const string Unknown = "receiver_native_baseline_observation,{\"schemaVersion\":1,\"purpose\":\"receiver_native_baseline_v1\",\"childObservation\":\"not_observed\",\"firstProblemCase\":\"unknown\",\"invocation\":\"unknown\",\"refType\":\"unknown\",\"refValue\":\"unknown\",\"rawType\":\"unknown\",\"rawValue\":\"unknown\",\"outputShape\":\"unknown\",\"publicOutputMatched\":null,\"cancelObservation\":\"not_reached\",\"psSignaledAtDecision\":null,\"jobAtDecision\":\"unknown\",\"cancelTarget\":\"unknown\",\"terminationAttempted\":null,\"terminationResult\":null}\n";
    internal const string E0 = "receiver_native_baseline_observation,{\"schemaVersion\":1,\"purpose\":\"receiver_native_baseline_v1\",\"childObservation\":\"accepted\",\"firstProblemCase\":\"E0\",\"invocation\":\"returned\",\"refType\":\"int32\",\"refValue\":\"2\",\"rawType\":\"int32\",\"rawValue\":\"0\",\"outputShape\":\"empty\",\"publicOutputMatched\":true,\"cancelObservation\":\"not_reached\",\"psSignaledAtDecision\":null,\"jobAtDecision\":\"unknown\",\"cancelTarget\":\"unknown\",\"terminationAttempted\":null,\"terminationResult\":null}\n";

    // 未觀察不能被格式化成none／false或省略null。
    internal static void UnknownCanonical()
    {
        Require(BaselineWire.TryFormat(new(), out var line) && line == Unknown);
        Require(BaselineWire.TryParse(Encoding.UTF8.GetBytes(Unknown), out var value) && value == new BaselineObservation());
    }

    // E0比較必須保留ref／raw各自分類而不是推成Node退出碼。
    internal static void E0ComparisonCanonical()
    {
        Require(BaselineWire.TryParse(Encoding.UTF8.GetBytes(E0), out var value));
        Require(value.ChildObservation == BaselineChildObservation.Accepted && value.Comparison == new BaselineComparison
        {
            FirstProblemCase = ChildProbeCase.E0,
            Invocation = BaselineInvocation.Returned,
            RefType = BaselineValueType.Int32,
            RefValue = BaselineRefValue.Two,
            RawType = BaselineValueType.Int32,
            RawValue = BaselineRawValue.Zero,
            OutputShape = BaselineOutputShape.Empty,
            PublicOutputMatched = true
        });
        Require(BaselineWire.TryFormat(value, out var line) && line == E0);
    }

    // 拒絕重複／多鍵／錯型別／錯關聯，不得留下已解析的部分比較。
    internal static void MalformedAtomicUnknown()
    {
        string[] invalid = [Unknown.Replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1"),
            Unknown.Replace("\"schemaVersion\":1", "\"schemaVersion\":\"1\""),
            Unknown.Replace("baseline_v1", "baseline_v2"), Unknown.Replace("not_observed", "alien"),
            E0.Replace("accepted", "rejected"), E0.Replace("\"rawType\":\"int32\"", "\"rawType\":\"other\""),
            E0.Replace("returned", "threw"), E0.Replace("\"E0\"", "\"\\u00450\""),
            E0.Replace("\"E0\"", "\"\\ud800\""), Unknown.Replace("}\n", ",\"extra\":true}\n"),
            Unknown.Replace("\"terminationResult\":null", "\"terminationResult\":false"),
            Unknown.Replace("\"jobAtDecision\":\"unknown\"", "\"jobAtDecision\":\"nonempty\""),
            Unknown.Replace("\n", "\r\n"), "\ufeff" + Unknown, Unknown + Unknown];
        foreach (var wire in invalid)
            Require(!BaselineWire.TryParse(Encoding.UTF8.GetBytes(wire), out var value) && value == new BaselineObservation());
        Require(!BaselineWire.TryFormat(new() { ChildObservation = (BaselineChildObservation)99 }, out var line) && line == "");
    }

    // 超容量與任意payload不能洩漏到typed或輸出，固定token最大值仍有界。
    internal static void CapacityAndForbiddenPayload()
    {
        foreach (var length in new[] { 1024, 1025, 8192 })
            Require(!BaselineWire.TryParse(Encoding.UTF8.GetBytes(Unknown.PadRight(length, ' ')), out var value) && value == new BaselineObservation());
        foreach (var token in new[] { "C:\\private", "ErrorRecord private", "2147942632", "-232" })
            Require(!BaselineWire.TryParse(Encoding.UTF8.GetBytes(E0.Replace("\"2\"", "\"" + token + "\"")), out _));
        var snapshot = new BaselineObservation
        {
            CancelObservation = BaselineCancelObservation.Sampled,
            PsSignaledAtDecision = false,
            JobAtDecision = BaselineJobState.Nonempty,
            CancelTarget = CancelTarget.OwnedProcess,
            TerminationAttempted = true,
            TerminationResult = false
        };
        Require(BaselineWire.TryFormat(snapshot, out var line) && Encoding.UTF8.GetByteCount(line) <= 1024);
        Require(BaselineWire.TryParse(Encoding.UTF8.GetBytes(line), out var parsed) && parsed == snapshot);
        var longest = snapshot with
        {
            ChildObservation = BaselineChildObservation.Accepted,
            Comparison = new()
            {
                FirstProblemCase = ChildProbeCase.E7,
                Invocation = BaselineInvocation.Returned,
                RefType = BaselineValueType.Other,
                RefValue = BaselineRefValue.Unknown,
                RawType = BaselineValueType.Other,
                RawValue = BaselineRawValue.Unknown,
                OutputShape = BaselineOutputShape.OneErrorRecord,
                PublicOutputMatched = false
            }
        };
        Require(BaselineWire.TryFormat(longest, out var longestLine) && Encoding.UTF8.GetByteCount(longestLine) <= 503);
        Require(BaselineWire.TryParse(Encoding.UTF8.GetBytes(longestLine), out var accepted) && accepted == longest);
    }

    // 斷言只輸出固定分類，不將wire或例外動態資料帶到console。
    private static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException("baseline_wire_contract_failed");
    }
}
