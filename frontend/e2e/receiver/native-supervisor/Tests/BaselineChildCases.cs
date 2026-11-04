using System.Text;
using RdWeb.Receiver.NativeSupervisor;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 獨立手寫frame及比較片段驗案例與新用途隔離。
internal static class BaselineChildCases
{
    internal const string Unknown = "\"firstProblemCase\":\"unknown\",\"invocation\":\"unknown\",\"refType\":\"unknown\",\"refValue\":\"unknown\",\"rawType\":\"unknown\",\"rawValue\":\"unknown\",\"outputShape\":\"unknown\",\"publicOutputMatched\":null";
    internal const string E0 = "\"firstProblemCase\":\"E0\",\"invocation\":\"returned\",\"refType\":\"int32\",\"refValue\":\"2\",\"rawType\":\"int32\",\"rawValue\":\"0\",\"outputShape\":\"empty\",\"publicOutputMatched\":true";
    internal const string Threw = "\"firstProblemCase\":\"E0\",\"invocation\":\"threw\",\"refType\":\"int32\",\"refValue\":\"2\",\"rawType\":\"unknown\",\"rawValue\":\"unknown\",\"outputShape\":\"unknown\",\"publicOutputMatched\":null";

    // 固定手寫公開wire模板不經被測formatter計算預期。
    internal static string Input(string reason, string cases, string comparison, string policy = "confirmed", string resources = "confirmed") =>
        "receiver_native_baseline_child_frame,{\"version\":1,\"purpose\":\"receiver_native_baseline_child_v1\",\"reason\":\"" + reason + "\",\"cases\":[" + cases + "],\"childPolicyRestore\":\"" + policy + "\",\"childResourcesClose\":\"" + resources + "\",\"comparison\":{" + comparison + "}}\n";

    // 七案完成必須回none而不是沿用最後一案比較。
    internal static void SevenMatchedNone()
    {
        var frame = Parse(Input("none", "true,true,true,true,true,true,true", Unknown.Replace("\"unknown\",\"invocation\"", "\"none\",\"invocation\"")));
        Require(frame.Accepted && frame.Cases.PassedCases == 7 && frame.Comparison == new BaselineComparison { FirstProblemCase = ChildProbeCase.None });
    }

    // 首false與returned比較位置相符，原案例資料仍保持原語意。
    internal static void MismatchE0()
    {
        var frame = Parse(Input("case_mismatch", "false", E0));
        Require(frame.Accepted && frame.Cases.FailedCase == ChildProbeCase.E0 && frame.Cases.PassedCases == 0 && frame.Comparison.RefValue == BaselineRefValue.Two);
        Require(Parse(Input("case_mismatch", "false", E0).Replace("\n", "\r\n")).Accepted);
    }

    // R原生stderr中斷必須是R／threw，不得有正常raw或輸出。
    internal static void NativeStderrR()
    {
        var frame = Parse(Input("native_stderr_interrupted", "true,true,true,true,true,false", Threw.Replace("\"E0\"", "\"R\"")));
        Require(frame.Accepted && frame.Cases.FailedCase == ChildProbeCase.R && frame.Comparison.Invocation == BaselineInvocation.Threw);
    }

    // I/O中斷可指出當次案，但不能替原案例前綴補false。
    internal static void IoThrewPrefix()
    {
        var frame = Parse(Input("io_failed", "", Threw));
        Require(frame.Accepted && frame.Cases.FailedCase == ChildProbeCase.None && frame.Comparison.FirstProblemCase == ChildProbeCase.E0);
        Require(Parse(Input("guard_rejected", "", Unknown, "unknown", "not_acquired")).Accepted);
    }

    // 新舊用途或prefix互換都拒絕，不讓額外比較放寬六鍵decoder。
    internal static void PurposeAndEntryIsolation()
    {
        var wire = Input("case_mismatch", "false", E0);
        Require(!ChildProbeWire.Parse(Encoding.UTF8.GetBytes(wire)).Accepted);
        Reject(wire.Replace("receiver_native_baseline_child_v1", "receiver_native_child_cases_v1"));
        Reject(wire.Replace("receiver_native_baseline_child_frame,", "receiver_native_child_frame,"));
        Reject("receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\",\"reason\":\"case_mismatch\",\"cases\":[false],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"}\n");
    }

    // 錯案號／型別／stale raw或額外鍵不可留下部分可用資料。
    internal static void ComparisonCasePairs()
    {
        var wire = Input("case_mismatch", "false", E0);
        foreach (var invalid in new[] { wire.Replace("\"E0\"", "\"E1\""), wire.Replace("returned", "threw"),
            Input("io_failed", "", E0), Input("io_failed", "true", Threw),
            Input("case_mismatch", "false", Unknown), Input("case_mismatch", "false", E0.Replace("\"2\"", "\"0\"")),
            Input("case_mismatch", "false", E0.Replace("\"empty\"", "\"one_error_record\"")),
            Input("native_stderr_interrupted", "true,true,true,true,true,false", Threw),
            wire.Replace("\"comparison\":{", "\"comparison\":{\"extra\":0,"),
            wire.Replace("\"firstProblemCase\":\"E0\"", "\"firstProblemCase\":\"E0\",\"firstProblemCase\":\"E0\""),
            wire.Replace("\"E0\"", "\"\\ud800\""), wire + wire, wire.PadRight(8193), "\ufeff" + wire }) Reject(invalid);
        (string Name, string Prefix, string Ref, string Raw)[] matched =
        [
            ("E1", "true,", "1", "1"), ("E2", "true,true,", "2", "2"),
            ("E7", "true,true,true,", "2", "7"), ("A", "true,true,true,true,true,true,", "0", "0")
        ];
        foreach (var item in matched)
        {
            var comparison = E0.Replace("\"E0\"", "\"" + item.Name + "\"")
                .Replace("\"refValue\":\"2\"", "\"refValue\":\"" + item.Ref + "\"")
                .Replace("\"rawValue\":\"0\"", "\"rawValue\":\"" + item.Raw + "\"");
            Reject(Input("case_mismatch", item.Prefix + "false", comparison));
        }
    }

    // 只在公開byte邊界呼被測parser。
    private static BaselineChildFrame Parse(string wire) => BaselineChildWire.Parse(Encoding.UTF8.GetBytes(wire));

    // 整份拒絕也要求所有typed初值保持未知。
    private static void Reject(string wire) => Require(Parse(wire) == new BaselineChildFrame());

    // 失敗只輸出固定安全分類。
    private static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException("baseline_child_contract_failed");
    }
}
