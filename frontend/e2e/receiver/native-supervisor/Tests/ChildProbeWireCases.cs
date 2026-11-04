using System.Text;
using RdWeb.Receiver.NativeSupervisor;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 獨立手寫child wire oracle，不經formatter或原生producer產生預期。
internal static class ChildProbeWireCases
{
    private const string Complete = "receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\",\"reason\":\"none\",\"cases\":[true,true,true,true,true,true,true],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"}\n";

    // 正向六個typed欄位逐項符合固定公開預期，接受不等於observed。
    internal static void Canonical()
    {
        var frame = ChildProbeWire.Parse(Encoding.UTF8.GetBytes(Complete));
        Require(frame == new ChildProbeFrame
        {
            Accepted = true,
            Reason = ProbeReason.None,
            PassedCases = 7,
            FailedCase = ChildProbeCase.None,
            ChildPolicyRestore = EvidenceState.Confirmed,
            ChildResourcesClose = EvidenceState.Confirmed
        });
    }

    // 首false只可出現在固定案例前綴的尾部，任何後續項目都不能掩蓋它。
    internal static void CaseFailures()
    {
        Canonical();
        (string Cases, int Passed, ChildProbeCase Failed)[] fixtures =
        [
            ("false", 0, ChildProbeCase.E0),
            ("true,false", 1, ChildProbeCase.E1),
            ("true,true,false", 2, ChildProbeCase.E2),
            ("true,true,true,false", 3, ChildProbeCase.E7),
            ("true,true,true,true,false", 4, ChildProbeCase.O),
            ("true,true,true,true,true,false", 5, ChildProbeCase.R),
            ("true,true,true,true,true,true,false", 6, ChildProbeCase.A)
        ];
        foreach (var fixture in fixtures)
        {
            var frame = Parse(Input("case_mismatch", fixture.Cases));
            Require(frame.Accepted && frame.Reason == ProbeReason.CaseMismatch && frame.PassedCases == fixture.Passed && frame.FailedCase == fixture.Failed);
            Reject(Input("case_mismatch", fixture.Cases + ",true"));
            Reject(Input("case_mismatch", fixture.Cases + ",false"));
        }
        var interrupted = Parse(Input("native_stderr_interrupted", "true,true,true,true,true,false"));
        Require(interrupted.Accepted && interrupted.PassedCases == 5 && interrupted.FailedCase == ChildProbeCase.R && interrupted.Reason == ProbeReason.NativeStderrInterrupted);
        Reject(Input("native_stderr_interrupted", "true,true,true,true,false"));
        Reject(Input("case_mismatch", "true,true"));
    }

    // reason只允許對應的案例與收尾組合，I/O缺判定不能自動當下一案mismatch。
    internal static void ReasonPairs()
    {
        Canonical();
        var guard = Parse(Input("guard_rejected", "", "unknown", "not_acquired"));
        Require(guard.Accepted && guard.Reason == ProbeReason.GuardRejected && guard.PassedCases == 0 && guard.FailedCase == ChildProbeCase.None && guard.ChildResourcesClose == EvidenceState.NotAcquired);
        Require(Parse(Input("guard_rejected", "")).Accepted);
        (string Text, EvidenceState State)[] policies = [("unknown", EvidenceState.Unknown), ("confirmed", EvidenceState.Confirmed), ("unconfirmed", EvidenceState.Unconfirmed)];
        (string Text, EvidenceState State)[] resources = [("unknown", EvidenceState.Unknown), ("not_acquired", EvidenceState.NotAcquired), ("confirmed", EvidenceState.Confirmed), ("unconfirmed", EvidenceState.Unconfirmed)];
        foreach (var policy in policies)
        {
            foreach (var resource in resources)
            {
                var mismatch = Parse(Input("case_mismatch", "false", policy.Text, resource.Text));
                Require(mismatch.Accepted && mismatch.Reason == ProbeReason.CaseMismatch && mismatch.FailedCase == ChildProbeCase.E0);
                Require(mismatch.ChildPolicyRestore == policy.State && mismatch.ChildResourcesClose == resource.State);
            }
        }
        for (var count = 0; count <= 6; count++)
        {
            var frame = Parse(Input("io_failed", string.Join(',', Enumerable.Repeat("true", count)), "unconfirmed", "unknown"));
            Require(frame.Accepted && frame.Reason == ProbeReason.IoFailed && frame.PassedCases == count && frame.FailedCase == ChildProbeCase.None);
        }
        foreach (var evidence in new[] { "unknown", "unconfirmed" })
        {
            var cleanup = Parse(Complete.Replace("\"none\"", "\"cleanup_unconfirmed\"", StringComparison.Ordinal)
                .Replace("\"childPolicyRestore\":\"confirmed\"", "\"childPolicyRestore\":\"" + evidence + "\"", StringComparison.Ordinal));
            Require(cleanup.Accepted && cleanup.Reason == ProbeReason.CleanupUnconfirmed && cleanup.PassedCases == 7);
        }
        foreach (var evidence in new[] { "unknown", "not_acquired", "unconfirmed" })
        {
            var cleanup = Parse(Input("cleanup_unconfirmed", "true,true,true,true,true,true,true", "confirmed", evidence));
            Require(cleanup.Accepted && cleanup.Reason == ProbeReason.CleanupUnconfirmed);
        }
        foreach (var invalid in new[]
        {
            Input("guard_rejected", "true"), Input("io_failed", "true,true,true,true,true,true,true"),
            Input("cleanup_unconfirmed", "true,true"), Input("cleanup_unconfirmed", "true,true,true,true,true,true,true"),
            Input("none", "true,true,true,true,true,true,true", "unknown"),
            Input("none", "true,true,true,true,true,true,true", "confirmed", "unconfirmed"),
            Input("deadline", ""), Input("unknown", ""), Input("unexpected_output", ""),
            Input("guard_rejected", "", "not_acquired"), Input("guard_rejected", "", "unknown", "invalid")
        }) Reject(invalid);
    }

    // 完整六鍵與canonical字面值不可被角色越界、duplicate或JSON寬鬆拼法替代。
    internal static void Malformed()
    {
        Canonical();
        foreach (var input in new[]
        {
            "", Complete[..^2], Complete.Replace("child_frame", "supervisor_diagnostic", StringComparison.Ordinal),
            Complete.Replace("cases_v1", "cases_v2", StringComparison.Ordinal),
            Complete.Replace("\"version\":1", "\"version\":2", StringComparison.Ordinal),
            Complete.Replace("\"version\":1", "\"version\":1.0", StringComparison.Ordinal),
            Complete.Replace("\"version\":1", "\"version\":\"1\"", StringComparison.Ordinal),
            Complete.Replace("{\"version\":1,", "{\"version\":1,\"version\":1,", StringComparison.Ordinal),
            Complete.Replace("\"childResourcesClose\":", "\"childExit\":\"confirmed\",\"childResourcesClose\":", StringComparison.Ordinal),
            Complete.Replace("\"version\":1,", "", StringComparison.Ordinal),
            Complete.Replace("\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\"", "\"purpose\":\"receiver_native_child_cases_v1\",\"version\":1", StringComparison.Ordinal),
            Complete.Replace("{", "{ ", StringComparison.Ordinal), Complete.Replace("true", "1", StringComparison.Ordinal),
            Complete.Replace("[true", "[null", StringComparison.Ordinal), Complete.Replace("[true", "[[[[true]]]]", StringComparison.Ordinal),
            Complete.Replace("\"none\"", "null", StringComparison.Ordinal), Complete.Replace("}\n", ",}\n", StringComparison.Ordinal),
            Complete.Replace("\"version\":1", "/*PUBLIC*/\"version\":1", StringComparison.Ordinal),
            Complete.Replace("cases_v1", "cases_v\\u0031", StringComparison.Ordinal),
            Complete + "receiver_native_supervisor_result,status=observed\n"
        }) Reject(input);
        Reject(Input("none", "true,true,true,true,true,true,true,true"));
    }

    // 原始bytes先限額，僅允許唯一LF或CRLF尾行，沒有合法padding捷徑。
    internal static void ByteBoundary()
    {
        Canonical();
        Require(Parse(Complete.Replace("\n", "\r\n", StringComparison.Ordinal)).Accepted);
        foreach (var input in new[] { Complete.TrimEnd('\n'), Complete + "\n", Complete + " ", Complete.Replace("\n", "\r", StringComparison.Ordinal) }) Reject(input);
        Require(ChildProbeWire.Parse(new byte[8192]) == new ChildProbeFrame());
        Require(ChildProbeWire.Parse(new byte[8193]) == new ChildProbeFrame());
        var bom = new byte[] { 0xef, 0xbb, 0xbf }.Concat(Encoding.UTF8.GetBytes(Complete)).ToArray();
        Require(ChildProbeWire.Parse(bom) == new ChildProbeFrame());
    }

    // 非法UTF-8及JSON孤立surrogate要回固定unknown，不能把解碼例外交給caller。
    internal static void Unicode()
    {
        Canonical();
        foreach (var token in new[] { "\\uD800", "\\uDC00", "\\uD800A", "PUBLIC_中文", "\\u0000" })
            Reject(Complete.Replace("\"none\"", "\"" + token + "\"", StringComparison.Ordinal));
        foreach (var invalid in new byte[][] { [0xff], [0xc0, 0xaf], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80] })
        {
            var bytes = Encoding.UTF8.GetBytes(Complete);
            var offset = Complete.IndexOf("none", StringComparison.Ordinal);
            var wire = bytes[..offset].Concat(invalid).Concat(bytes[(offset + 4)..]).ToArray();
            Require(ChildProbeWire.Parse(wire) == new ChildProbeFrame());
        }
    }

    // fixture只建立測試輸入，預期typed值由各案例獨立指定。
    private static string Input(string reason, string cases, string policy = "confirmed", string resources = "confirmed") =>
        "receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\",\"reason\":\"" + reason + "\",\"cases\":[" + cases + "],\"childPolicyRestore\":\"" + policy + "\",\"childResourcesClose\":\"" + resources + "\"}\n";

    // 明確UTF-8公開輸入，不用被測程式或JS產預期。
    private static ChildProbeFrame Parse(string input) => ChildProbeWire.Parse(Encoding.UTF8.GetBytes(input));

    // 所有拒絕欄位必同時unknown，不能洩出前半段已解析的宣告。
    private static void Reject(string input) => Require(Parse(input) == new ChildProbeFrame());

    // 固定安全斷言，runner只回註冊名稱及數量。
    private static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException("child_wire_assertion_failed");
    }
}
