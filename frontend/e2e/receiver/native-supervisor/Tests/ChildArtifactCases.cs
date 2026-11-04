using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 只讀固定候選原碼；不解析／執行PowerShell，不把手寫oracle冒稱producer輸出。
internal static class ChildArtifactCases
{
    // 呼叫端來源路徑由編譯器固定，不從CLI或環境接受任意檔案。
    internal static void Contract([CallerFilePath] string sourcePath = "")
    {
        var path = Path.Combine(Path.GetDirectoryName(sourcePath)!, "..", "Fixtures", "receiver-native-child.ps1");
        var bytes = File.ReadAllBytes(path);
        var pin = ProbeSourcePins.All.Single(value => value.Wrapper);
        ProbeSourceCases.Require(bytes.Length > 0 && bytes.Length <= 12288 && Convert.ToHexStringLower(SHA256.HashData(bytes)) == pin.Sha256);
        var text = new UTF8Encoding(false, true).GetString(bytes);
        ProbeSourceCases.Require(!text.StartsWith('\uFEFF') && !text.Contains('\r') && text.EndsWith('\n') && !text.Contains('\0'));
        var api = new FakeSourceApi(text);
        var owner = OwnedProbeSources.Acquire(api, api, api.Pins);
        ProbeSourceCases.Require(owner.TryGetLaunchPlan(out var plan));
        var encoded = plan!.CommandLine[(plan.CommandLine.LastIndexOf(' ') + 1)..];
        ProbeSourceCases.Require(Encoding.Unicode.GetString(Convert.FromBase64String(encoded)) == text && plan.CommandLine.Length <= 32766);
        ProbeSourceCases.Require(owner.Close(2000));
        // 下列是grammar對照，不是PS執行結果；grammar改動不可暗中補成功。
        foreach (var body in new[] {
            "\"reason\":\"none\",\"cases\":[true,true,true,true,true,true,true],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"",
            "\"reason\":\"case_mismatch\",\"cases\":[false],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"",
            "\"reason\":\"native_stderr_interrupted\",\"cases\":[true,true,true,true,true,false],\"childPolicyRestore\":\"confirmed\",\"childResourcesClose\":\"confirmed\"",
            "\"reason\":\"cleanup_unconfirmed\",\"cases\":[true,true,true,true,true,true,true],\"childPolicyRestore\":\"unconfirmed\",\"childResourcesClose\":\"confirmed\"" })
        {
            var wire = "receiver_native_child_frame,{\"version\":1,\"purpose\":\"receiver_native_child_cases_v1\"," + body + "}\n";
            ProbeSourceCases.Require(ChildProbeWire.Parse(Encoding.UTF8.GetBytes(wire)).Accepted);
        }
    }
}
