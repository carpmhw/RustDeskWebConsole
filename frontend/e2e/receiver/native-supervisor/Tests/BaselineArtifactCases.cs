using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 固定來源契約只驗bytes與真guard，不冒充PowerShell語法或producer驗收。
internal static class BaselineArtifactCases
{
    // 新來源必須存在且由自己的編譯pin驗證；公開比較陣列與受測invoke維持。
    internal static void BaselineArtifactContract([CallerFilePath] string source = "")
    {
        var path = Path.Combine(Path.GetDirectoryName(source)!, "..", "Fixtures", "receiver-native-baseline-child.ps1");
        ProbeSourceCases.Require(File.Exists(path));
        var bytes = File.ReadAllBytes(path);
        var pin = BaselineSourcePins.All.Single(value => value.Wrapper);
        ProbeSourceCases.Require(bytes.Length <= 12288 && Convert.ToHexStringLower(SHA256.HashData(bytes)) == pin.Sha256);
        var text = new UTF8Encoding(false, true).GetString(bytes);
        ProbeSourceCases.Require(!text.StartsWith('\ufeff') && !text.Contains('\r') && text.EndsWith('\n'));
        foreach (var line in new[] { "$names = @('E0', 'E1', 'E2', 'E7', 'O', 'R', 'A')", "$expectedRef = @(0, 1, 2, 2, 0, 0, 0)",
            "$expectedRaw = @(0, 1, 2, 7, 0, 0, 0)", "$output = @(Invoke-ReceiverChild -NodePath $nodePath -Arguments $caseArgs -ExitCode ([ref]$code) 2>&1)",
            "$raw = $global:LASTEXITCODE", "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined", "receiver_native_baseline_child_frame,", "receiver_native_baseline_child_v1" })
            ProbeSourceCases.Require(text.Contains(line, StringComparison.Ordinal));
    }

    // 原來源hash仍由舊契約核，四個共同pins不能因baseline改變。
    internal static void OriginalSourcesPreserved([CallerFilePath] string source = "")
    {
        ChildArtifactCases.Contract();
        var root = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "..", "..", ".."));
        foreach (var item in new[] {
            ("frontend/e2e/scripts/start-windows-test-receiver.ps1", "b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19"),
            ("frontend/e2e/scripts/windows-host-observer-supervisor.ps1", "51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2"),
            ("frontend/e2e/receiver/native-supervisor/Fixtures/PUBLIC 空格 繁體/receiver-native-case.mjs", "846af281f23a2c5ab7ebc6c54fd6f6725406f9a4da73036ad4fd9cb3a10c512b") })
            ProbeSourceCases.Require(Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(root, item.Item1)))) == item.Item2);
        ProbeSourceCases.Require(BaselineSourcePins.All.Count == 5 && BaselineSourcePins.All.Take(4).SequenceEqual(ProbeSourcePins.All.Take(4)));
    }

    // 以新wrapper的真bytes通過既有lease並回讀encoded command，抓到UTF8或命令容量錯誤。
    internal static void BaselineSourceLaunchPlan([CallerFilePath] string source = "")
    {
        var path = Path.Combine(Path.GetDirectoryName(source)!, "..", "Fixtures", "receiver-native-baseline-child.ps1");
        ProbeSourceCases.Require(File.Exists(path));
        var text = new UTF8Encoding(false, true).GetString(File.ReadAllBytes(path));
        var api = new FakeSourceApi(text, baseline: true);
        var owner = OwnedProbeSources.AcquireBaseline(api, api, api.Pins);
        ProbeSourceCases.Require(owner.TryGetLaunchPlan(out var plan));
        ProbeSourceCases.Require(plan!.Environment == "PATHEXT=.EXE\0PSModulePath=C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules\0RDWEB_NATIVE_PROBE_ROOT=C:\\PUBLIC 空格 繁體\\probe\0SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0");
        var encoded = plan!.CommandLine[(plan.CommandLine.LastIndexOf(' ') + 1)..];
        ProbeSourceCases.Require(Encoding.Unicode.GetString(Convert.FromBase64String(encoded)) == text && plan.CommandLine.Length <= 32766);
        ProbeSourceCases.Require(api.Opens.Contains(api.PackageDirectory + "\\receiver-native-baseline-child.ps1") && owner.Clock == api);
        ProbeSourceCases.Require(owner.Close(2000));
    }

    // 同一公開來源可走兩種固定政策；檔名或pins不能暗中決定是否加入PATHEXT。
    internal static void BaselineEnvironmentIsolation()
    {
        foreach (var baselineFiles in new[] { false, true })
        {
            var originalApi = new FakeSourceApi(baseline: baselineFiles);
            var baselineApi = new FakeSourceApi(baseline: baselineFiles);
            var originalOwner = OwnedProbeSources.Acquire(originalApi, originalApi, originalApi.Pins);
            var baselineOwner = OwnedProbeSources.AcquireBaseline(baselineApi, baselineApi, baselineApi.Pins);
            ProbeSourceCases.Require(originalOwner.TryGetLaunchPlan(out var original));
            ProbeSourceCases.Require(baselineOwner.TryGetLaunchPlan(out var baseline));
            ProbeSourceCases.Require(original!.Environment == "PSModulePath=C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules\0RDWEB_NATIVE_PROBE_ROOT=C:\\PUBLIC 空格 繁體\\probe\0SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0");
            ProbeSourceCases.Require(baseline!.Environment == "PATHEXT=.EXE\0PSModulePath=C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules\0RDWEB_NATIVE_PROBE_ROOT=C:\\PUBLIC 空格 繁體\\probe\0SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0");
            ProbeSourceCases.Require(original.Application == baseline.Application && original.CommandLine == baseline.CommandLine && original.Directory == baseline.Directory);
            ProbeSourceCases.Require(originalOwner.Close(2000) && baselineOwner.Close(2000));
            ProbeSourceCases.Require(!originalOwner.TryGetLaunchPlan(out _) && !baselineOwner.TryGetLaunchPlan(out _));
        }
    }

    // 基線factory沿用來源與期限拒絕；關閉不能讓拒絕的plan復活或洗掉已失敗的close。
    internal static void BaselineSourceRefusal()
    {
        for (var mode = 0; mode < 3; mode++)
        {
            var api = new FakeSourceApi(baseline: true);
            if (mode == 0) api.Security = api.Security with { Owner = "S-1-5-21-2000" };
            if (mode == 1) api.Files[api.PackageDirectory + "\\receiver-native-baseline-child.ps1"][0] ^= 1;
            if (mode == 2) api.ElapsedMs = 18000;
            var owner = OwnedProbeSources.AcquireBaseline(api, api, api.Pins);
            ProbeSourceCases.Require(!owner.TryGetLaunchPlan(out _));
            if (mode == 2)
            {
                ProbeSourceCases.Require(!owner.Close(18000) && !owner.Close(20000));
                ProbeSourceCases.Require(owner.ResourcesClose == EvidenceState.Unconfirmed);
            }
            else
            {
                ProbeSourceCases.Require(owner.Close(20000));
                ProbeSourceCases.Require(owner.ResourcesClose == EvidenceState.Confirmed);
            }
            ProbeSourceCases.Require(!owner.TryGetLaunchPlan(out _));
        }
    }
}
