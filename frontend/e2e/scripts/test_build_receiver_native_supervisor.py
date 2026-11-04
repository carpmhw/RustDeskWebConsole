"""只用公開bytes與隔離tmp測封裝器，不下載或執行任何Windows檔。"""

import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import struct
import tempfile
import unittest
from unittest import mock
import shutil
import subprocess
import http.client
import sys
import zipfile


# 能力缺失以斷言呈現，不讓missing import冒充行為RED。
def api(name):
  path = Path(__file__).resolve().parents[2] / "scripts/build_receiver_native_supervisor.py"
  assert path.is_file(), "封裝器尚未提供"
  spec = importlib.util.spec_from_file_location("native_builder", path)
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  result = getattr(module, name, None)
  assert callable(result), f"尚未提供{name}"
  return result


# 最小PE只供metadata解析；此fixture不具有效的Windows程式內容。
def pe():
  data = bytearray(512)
  data[:2] = b"MZ"
  struct.pack_into("<I", data, 0x3c, 0x80)
  data[0x80:0x84] = b"PE\0\0"
  struct.pack_into("<H", data, 0x84, 0x8664)
  struct.pack_into("<H", data, 0x98, 0x20b)
  return bytes(data)


# 標準ZIP產生公開資料；不模仿正式封裝器的manifest算法。
def archive(files):
  output = io.BytesIO()
  with zipfile.ZipFile(output, "w") as z:
    for name, data in files.items():
      z.writestr(name, data)
  return output.getvalue()


# 每個測試使用新自有目錄，保留失敗材料，不清理任何舊root。
def root():
  home = Path("/tmp/opencode")
  home.mkdir(exist_ok=True)
  return Path(tempfile.mkdtemp(prefix="rdweb-native-package-test-", dir=home))


# 公開187成員與兩個假nupkg只測allowlist／bytes契約，不是官方來源。
def dotnet_fixture():
  home = root()
  stage = home / "staging"
  stage.mkdir()
  feed = home / "feed"
  feed.mkdir()
  files = {f"runtime{i}.dll": f"public{i}".encode() for i in range(187)}
  members = {"runtimes/win-x64/native/" + n: b for n, b in files.items()}
  listing = ("<FileList>" + "".join(f'<File Path="{n}" />' for n in members) + "</FileList>").encode()
  pin = {"version": "10.0.14", "rid": "win-x64", "packages": []}
  for kind in ["Runtime", "Host"]:
    body = {"LICENSE.TXT": b"public license", "THIRD-PARTY-NOTICES.TXT": b"public notice"}
    if kind == "Runtime":
      body.update(members)
      body["data/RuntimeList.xml"] = listing
    data = archive(body)
    package = {"id": f"Microsoft.NETCore.App.{kind}.win-x64", "version": "10.0.14",
               "sha512": base64.b64encode(hashlib.sha512(data).digest()).decode(),
               "license": {"member": "LICENSE.TXT", "sha256": hashlib.sha256(body["LICENSE.TXT"]).hexdigest()},
               "thirdPartyNotices": {"member": "THIRD-PARTY-NOTICES.TXT", "sha256": hashlib.sha256(body["THIRD-PARTY-NOTICES.TXT"]).hexdigest()}}
    if kind == "Runtime":
      package["runtimeList"] = {"member": "data/RuntimeList.xml", "sha256": hashlib.sha256(listing).hexdigest()}
    pin["packages"].append(package)
    (feed / (package["id"].lower() + ".10.0.14.nupkg")).write_bytes(data)
  prefix = "RdWeb.Receiver.NativeSupervisor."
  files.update({prefix + "Core.dll": b"public managed core", prefix + "Windows.dll": b"public managed entry",
                prefix + "Windows.exe": pe() + (prefix + "Windows.dll").encode() + b"\0",
                prefix + "Windows.runtimeconfig.json": json.dumps({"runtimeOptions": {"tfm": "net10.0", "includedFrameworks": [{"name": "Microsoft.NETCore.App", "version": "10.0.14"}]}}).encode(),
                prefix + "Windows.deps.json": json.dumps({"runtimeTarget": {"name": ".NETCoreApp,Version=v10.0/win-x64"}, "libraries": {prefix + "Core/1.0.0": {}, prefix + "Windows/1.0.0": {}, "runtimepack.Microsoft.NETCore.App.Runtime.win-x64/10.0.14": {}}}).encode(),
                "LICENSE.DotNet.txt": b"public license", "THIRD-PARTY-NOTICES.DotNet.txt": b"public notice"})
  for name, data in files.items():
    (stage / name).write_bytes(data)
  return home, stage, feed, pin, files


# 公開baseline metadata／PE與舊fixture共用假官方材料，不啟loader或SDK。
def baseline_dotnet_fixture():
  home, stage, feed, pin, files = dotnet_fixture()
  companions = {n: files.pop(n) for n in ["RdWeb.Receiver.NativeSupervisor.Windows.exe", "RdWeb.Receiver.NativeSupervisor.Windows.deps.json", "RdWeb.Receiver.NativeSupervisor.Windows.runtimeconfig.json"]}
  for name in companions:
    (stage / name).unlink()
  entry = "RdWeb.Receiver.NativeBaseline.Windows"
  files.update({entry + ".dll": b"public baseline managed entry", entry + ".exe": pe() + (entry + ".dll").encode() + b"\0",
                entry + ".runtimeconfig.json": companions["RdWeb.Receiver.NativeSupervisor.Windows.runtimeconfig.json"],
                entry + ".deps.json": json.dumps({"runtimeTarget": {"name": ".NETCoreApp,Version=v10.0/win-x64"}, "libraries": {
                  "RdWeb.Receiver.NativeSupervisor.Core/1.0.0": {}, "RdWeb.Receiver.NativeSupervisor.Windows/1.0.0": {},
                  entry + "/1.0.0": {}, "runtimepack.Microsoft.NETCore.App.Runtime.win-x64/10.0.14": {}}}).encode()})
  for name, data in files.items():
    (stage / name).write_bytes(data)
  return home, stage, feed, pin, files, companions


# 把預期缺少正向行為的安全拒絕轉成明確斷言FAIL，而非語法／import錯誤。
def positive(function, *args, **kwargs):
  try:
    return function(*args, **kwargs)
  except (ValueError, OSError) as error:
    raise AssertionError("public_positive_boundary_rejected") from error


class BaselineArtifactTests(unittest.TestCase):
  # 真validator必須接受獨立手寫195檔，拒絕缺檔／錯target／metadata或官方bytes。
  def test_baseline_exact_members_and_metadata(self):
    inspect = api("inspect_dotnet")
    home, stage, feed, pin, files, _ = baseline_dotnet_fixture()
    expected = {f"runtime{i}.dll" for i in range(187)} | {"LICENSE.DotNet.txt", "THIRD-PARTY-NOTICES.DotNet.txt",
      "RdWeb.Receiver.NativeSupervisor.Core.dll", "RdWeb.Receiver.NativeSupervisor.Windows.dll",
      "RdWeb.Receiver.NativeBaseline.Windows.dll", "RdWeb.Receiver.NativeBaseline.Windows.exe",
      "RdWeb.Receiver.NativeBaseline.Windows.deps.json", "RdWeb.Receiver.NativeBaseline.Windows.runtimeconfig.json"}
    self.assertEqual(set(positive(inspect, stage, feed, pin, baseline=True)), expected)
    self.assertEqual(len(expected), 195)
    for name, data in [("unknown.dll", b"extra"), ("baseline.pdb", b"public symbols"), ("runtime0.dll", b"changed"),
                       ("RdWeb.Receiver.NativeSupervisor.Windows.exe", pe()),
                       ("RdWeb.Receiver.NativeBaseline.Windows.exe", pe() + b"RdWeb.Receiver.NativeSupervisor.Windows.dll\0")]:
      (stage / name).write_bytes(data)
      with self.assertRaises(ValueError):
        inspect(stage, feed, pin, baseline=True)
      if name in files:
        (stage / name).write_bytes(files[name])
      else:
        (stage / name).unlink()
    for name in ["RdWeb.Receiver.NativeSupervisor.Core.dll", "RdWeb.Receiver.NativeSupervisor.Windows.dll"]:
      (stage / name).rename(home / "held")
      with self.assertRaises(ValueError):
        inspect(stage, feed, pin, baseline=True)
      (home / "held").rename(stage / name)
    for suffix in ["runtimeconfig.json", "deps.json"]:
      name = "RdWeb.Receiver.NativeBaseline.Windows." + suffix
      original = files[name]
      for data in [original.replace(b"10.0.14", b"10.0.13"), original.replace(b"win-x64", b"linux-x64"), b"{}"]:
        if data == original:
          continue
        (stage / name).write_bytes(data)
        with self.assertRaises((ValueError, KeyError)):
          inspect(stage, feed, pin, baseline=True)
      (stage / name).write_bytes(original)
    self.assertEqual(positive(inspect, stage, feed, pin, baseline=True), files)

  # 只有三組明列raw布局可投影canonical，未知或損壞companion不得被靜默丟棄。
  def test_baseline_raw_companion_sets(self):
    inspect = api("inspect_baseline_publish")
    for count in [0, 2, 3]:
      _, stage, feed, pin, files, companions = baseline_dotnet_fixture()
      selected = {n: b for n, b in companions.items() if count == 3 or (count == 2 and not n.endswith(".exe"))}
      for name, data in selected.items():
        (stage / name).write_bytes(data)
      self.assertEqual(positive(inspect, stage, feed, pin), files)
      self.assertEqual(len(list(stage.iterdir())), 195 + count)
      for name in selected:
        (stage / name).write_bytes(b"broken metadata")
        with self.assertRaises((ValueError, KeyError)):
          inspect(stage, feed, pin)
        (stage / name).write_bytes(selected[name])
      (stage / "unknown.dll").write_bytes(b"public")
      with self.assertRaises(ValueError):
        inspect(stage, feed, pin)
    for name in ["RdWeb.Receiver.NativeSupervisor.Windows.exe", "RdWeb.Receiver.NativeSupervisor.Windows.deps.json", "RdWeb.Receiver.NativeSupervisor.Windows.runtimeconfig.json", "RUNTIME0.DLL"]:
      _, stage, feed, pin, _, companions = baseline_dotnet_fixture()
      (stage / name).write_bytes(companions.get(name, b"public"))
      with self.assertRaises(ValueError):
        inspect(stage, feed, pin)

  # 模式不可從檔名猜測或自動升級；canonical入口不收raw companion。
  def test_baseline_profile_isolation(self):
    inspect = api("inspect_dotnet")
    _, stage, feed, pin, _, companions = baseline_dotnet_fixture()
    self.assertEqual(len(positive(inspect, stage, feed, pin, baseline=True)), 195)
    with self.assertRaises(ValueError):
      inspect(stage, feed, pin)
    for name, data in companions.items():
      (stage / name).write_bytes(data)
    with self.assertRaises(ValueError):
      inspect(stage, feed, pin, baseline=True)
    _, stage, feed, pin, files = dotnet_fixture()
    self.assertEqual(inspect(stage, feed, pin), files)
    with self.assertRaises(ValueError):
      inspect(stage, feed, pin, baseline=True)


# 與產品常數分開手寫的來源預期，能抓到完整對應來源遺漏而非自我比對。
PUBLIC_SOURCE_NAMES = tuple("""Core/ChildProbeFrame.cs
Core/ChildProbeWire.cs
Core/ProbeDiagnostic.cs
Core/ProbeModel.cs
Core/ProbeWire.cs
Core/RdWeb.Receiver.NativeSupervisor.Core.csproj
Core/packages.lock.json
Fixtures/PUBLIC 空格 繁體/receiver-native-case.mjs
Fixtures/receiver-native-child.ps1
NuGet.Config
Tests/ChildArtifactCases.cs
Tests/ChildProbeWireCases.cs
Tests/FakeSourceApi.cs
Tests/NativeAbiCases.cs
Tests/NativeSessionCases.cs
Tests/ProbeClaimCases.cs
Tests/ProbeConsoleCases.cs
Tests/ProbeRunCases.cs
Tests/ProbeSourceCases.cs
Tests/Program.cs
Tests/RdWeb.Receiver.NativeSupervisor.Core.Tests.csproj
Tests/SourceNativeAbiCases.cs
Tests/packages.lock.json
Windows/NativeAbi.cs
Windows/OwnedNativeResources.cs
Windows/OwnedPipe.cs
Windows/OwnedProbeRun.cs
Windows/OwnedProbeSession.cs
Windows/OwnedProbeSources.cs
Windows/ProbeConsole.cs
Windows/ProbeConsoleHost.cs
Windows/ProbeNativeContracts.cs
Windows/ProbeSourceContracts.cs
Windows/ProbeSourcePins.cs
Windows/Program.cs
Windows/RdWeb.Receiver.NativeSupervisor.Windows.csproj
Windows/SourceNativeAbi.cs
Windows/WindowsNativeApi.cs
Windows/WindowsSourceApi.cs
Windows/packages.lock.json
dotnet-runtime-pin.json""".splitlines())
BASELINE_ADDITIONAL_NAMES = tuple("""Baseline/Program.cs
Baseline/RdWeb.Receiver.NativeBaseline.Windows.csproj
Baseline/packages.lock.json
Core/BaselineObservation.cs
Core/BaselineWire.cs
Core/BaselineChildWire.cs
Fixtures/receiver-native-baseline-child.ps1
Tests/BaselineWireCases.cs
Tests/BaselineChildCases.cs
Tests/BaselineArtifactCases.cs
Tests/BaselineRunCases.cs
Tests/BaselineConsoleCases.cs
Windows/BaselineCapture.cs
Windows/BaselineSourcePins.cs""".splitlines())
PUBLIC_EXTRAS = ("frontend/e2e/receiver/native-supervisor/README.md", "frontend/scripts/build_receiver_native_supervisor.py",
  "frontend/e2e/scripts/test_build_receiver_native_supervisor.py", "frontend/e2e/scripts/start-windows-test-receiver.ps1",
  "frontend/e2e/scripts/windows-host-observer-supervisor.ps1", "frontend/e2e/receiver/node-runtime-pin.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "Directory.Build.props", "global.json")


# 獨立計算公開fixture輸入pin，只在修改fixture前取一次，不呼被測摘要helper。
def fixture_source_digest(repo, names):
  material = bytearray()
  for name in sorted(names):
    material.extend(name.encode() + b"\0" + (repo / "frontend/e2e/receiver/native-supervisor" / name).read_bytes() + b"\0")
  return hashlib.sha256(material).hexdigest()


# 只複製明列公開來源到新自有目錄；手寫發布inputs不是實際SDK生成的locks。
def source_fixture(baseline=True, runtime_pin=None):
  repo = root() / "repo"
  real = Path(__file__).resolve().parents[3]
  names = PUBLIC_SOURCE_NAMES + (BASELINE_ADDITIONAL_NAMES if baseline else ())
  for name in ["frontend/e2e/receiver/native-supervisor/" + n for n in names] + list(PUBLIC_EXTRAS):
    destination = repo / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes((real / name).read_bytes())
  if runtime_pin is not None:
    (repo / "frontend/e2e/receiver/native-supervisor/dotnet-runtime-pin.json").write_text(json.dumps(runtime_pin))
  release = repo / "rebuild-inputs"
  release.mkdir()
  (release / "global.json").write_text(json.dumps({"sdk": {"version": "10.0.114" if baseline else "10.0.113", "rollForward": "disable"}}))
  (release / "NuGet.Config").write_bytes(b'<configuration><packageSources><clear/><add key="receiver-native-local" value="../local-feed"/></packageSources><auditSources><clear/><add key="nuget-audit" value="https://api.nuget.org/v3/index.json"/></auditSources><fallbackPackageFolders><clear/></fallbackPackageFolders></configuration>')
  graphs = {"Core": {}, "Windows": {"rdweb.receiver.nativesupervisor.core": {"type": "Project"}}}
  if baseline:
    graphs["Baseline"] = {"rdweb.receiver.nativesupervisor.core": {"type": "Project"}, "rdweb.receiver.nativesupervisor.windows": {"type": "Project", "dependencies": {"RdWeb.Receiver.NativeSupervisor.Core": "[1.0.0, )"}}}
  for kind, graph in graphs.items():
    (release / kind).mkdir()
    (release / kind / "packages.lock.json").write_text(json.dumps({"version": 1, "dependencies": {"net10.0": graph, "net10.0/win-x64": {}}}))
    for name in names:
      if name.startswith(kind + "/") and name.endswith((".cs", ".csproj")):
        (release / name).write_bytes((repo / "frontend/e2e/receiver/native-supervisor" / name).read_bytes())
  (release / "Directory.Build.props").write_bytes((repo / "Directory.Build.props").read_bytes())
  return repo, release, fixture_source_digest(repo, names)


class BaselineSourceTests(unittest.TestCase):
  # dd核准來源必須以固定pin接受；完整snapshot逐byte包含來源與發布控制檔。
  def test_baseline_dd_frozen_source(self):
    repo, release, _ = source_fixture()
    names = PUBLIC_SOURCE_NAMES + BASELINE_ADDITIONAL_NAMES
    self.assertEqual(fixture_source_digest(repo, names), "23d6d0453cc79c176ed09ac87a117dd4a03cffb0fc3bfa3525497d2f973d1a56")
    prefix = "frontend/e2e/receiver/native-supervisor/"
    expected_sources = {name: (repo / prefix / name).read_bytes() for name in names}
    self.assertEqual(len(expected_sources), 55)
    self.assertEqual(positive(api("freeze_sources"), repo, baseline=True), expected_sources)
    expected = {prefix + name: data for name, data in expected_sources.items()}
    expected.update({name: (repo / name).read_bytes() for name in PUBLIC_EXTRAS})
    for name in ["global.json", "NuGet.Config", "Core/packages.lock.json", "Windows/packages.lock.json", "Baseline/packages.lock.json"]:
      expected["rebuild-inputs/" + name] = (release / name).read_bytes()
    self.assertEqual(len(expected), 70)
    self.assertEqual(positive(api("source_snapshot"), repo, release, baseline=True), expected)

  # 核准的六份dd來源仍是凍結輸入；任一額外byte都不能被新版pin默默接受。
  def test_baseline_dd_rejects_changed_source(self):
    freeze = api("freeze_sources")
    snapshot = api("source_snapshot")
    for name in ("Windows/OwnedProbeSources.cs", "Windows/ProbeConsoleHost.cs", "Tests/BaselineArtifactCases.cs",
                 "Tests/BaselineRunCases.cs", "Tests/ProbeConsoleCases.cs", "Tests/Program.cs"):
      with self.subTest(source=name):
        repo, release, _ = source_fixture()
        self.assertEqual(len(positive(freeze, repo, baseline=True)), 55)
        path = repo / "frontend/e2e/receiver/native-supervisor" / name
        path.write_bytes(path.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "^original_source_hash_rejected$"):
          freeze(repo, baseline=True)
        with self.assertRaisesRegex(ValueError, "^original_source_hash_rejected$"):
          snapshot(repo, release, baseline=True)

  # 兩個模式只接受自己的固定SDK，不能交叉套用或允許roll-forward。
  def test_release_sdk_versions_are_profile_specific(self):
    read = api("release_inputs")
    for baseline in [True, False]:
      _, release, _ = source_fixture(baseline)
      for version in ["10.0.113", "10.0.114"]:
        with self.subTest(baseline=baseline, version=version):
          (release / "global.json").write_text(json.dumps({"sdk": {"version": version, "rollForward": "disable"}}))
          if (baseline, version) in [(True, "10.0.114"), (False, "10.0.113")]:
            self.assertEqual(len(positive(read, release, baseline=baseline)), 5 if baseline else 4)
          else:
            with self.assertRaisesRegex(ValueError, "^release_sdk_rejected$"):
              read(release, baseline=baseline)
      (release / "global.json").write_text(json.dumps({"sdk": {"version": "10.0.114" if baseline else "10.0.113", "rollForward": "latestPatch"}}))
      with self.assertRaisesRegex(ValueError, "^release_sdk_rejected$"):
        read(release, baseline=baseline)

  # 發布source多出的隱含編譯輸入不能被漏出對應來源ZIP。
  def test_baseline_release_source_rejects_extra_compile_input(self):
    snapshot = api("source_snapshot")
    for name in ["Core/Unlisted.cs", "Directory.Build.targets"]:
      repo, release, _ = source_fixture()
      (release / name).write_bytes(b"PUBLIC_EXTRA_COMPILE_INPUT")
      with self.assertRaises(ValueError):
        snapshot(repo, release, baseline=True)

  # 來源closure必須包含新project／wrapper／測試與發布locks，任一byte不同都拒絕。
  def test_baseline_source_closure_and_freeze(self):
    snapshot = api("source_snapshot")
    repo, release, _ = source_fixture()
    src = repo / "frontend/e2e/receiver/native-supervisor"
    (repo / "private-secret").write_bytes(b"PUBLIC_NOT_INCLUDED")
    actual = positive(snapshot, repo, release, baseline=True)
    expected = {"frontend/e2e/receiver/native-supervisor/" + n for n in PUBLIC_SOURCE_NAMES + BASELINE_ADDITIONAL_NAMES} | set(PUBLIC_EXTRAS) | {
      "rebuild-inputs/global.json", "rebuild-inputs/NuGet.Config", "rebuild-inputs/Core/packages.lock.json", "rebuild-inputs/Windows/packages.lock.json", "rebuild-inputs/Baseline/packages.lock.json"}
    self.assertEqual(set(actual), expected)
    self.assertEqual(len(actual), 70)
    for path in [src / "Baseline/Program.cs", src / "Fixtures/receiver-native-baseline-child.ps1", release / "Baseline/Program.cs", release / "Directory.Build.props"]:
      original = path.read_bytes()
      path.write_bytes(original + b"changed")
      with self.assertRaises(ValueError):
        snapshot(repo, release, baseline=True)
      path.write_bytes(original)
    missing = release / "Baseline/packages.lock.json"
    missing.rename(release / "Baseline/held")
    with self.assertRaises((ValueError, FileNotFoundError)):
      snapshot(repo, release, baseline=True)

  # dev圖、錯project依賴或放寬來源不得當成正式發布inputs。
  def test_baseline_release_inputs_are_fixed(self):
    read = api("release_inputs")
    _, release, _ = source_fixture()
    self.assertEqual(len(positive(read, release, baseline=True)), 5)
    for name, data in [("global.json", b'{"sdk":{"version":"10.0.112","rollForward":"disable"}}'),
                       ("Baseline/packages.lock.json", b'{"version":1,"dependencies":{"net10.0":{}}}'),
                       ("Core/packages.lock.json", b'{"version":1,"dependencies":{"net10.0":{"external":{"type":"Direct"}},"net10.0/win-x64":{}}}'),
                       ("Windows/packages.lock.json", b'{"version":1,"dependencies":{"net10.0":{},"net10.0/win-x64":{}}}'),
                       ("NuGet.Config", b'<configuration><packageSources><clear/></packageSources></configuration>')]:
      path = release / name
      original = path.read_bytes()
      path.write_bytes(data)
      with self.assertRaises((ValueError, TypeError)):
        read(release, baseline=True)
      path.write_bytes(original)

  # 當前來源不能追認為舊凍結包；另用明確fixture pin檢查舊正向與改byte拒絕。
  def test_legacy_snapshot_fixture_and_current_refusal(self):
    snapshot = api("source_snapshot")
    repo, release, fixture_pin = source_fixture(False)
    with self.assertRaises(ValueError):
      snapshot(repo, release)
    with mock.patch.dict(snapshot.__globals__, {"LEGACY_SOURCE_DIGEST": fixture_pin}):
      actual = snapshot(repo, release)
      self.assertEqual(len(actual), 55)
      (repo / "frontend/e2e/receiver/native-supervisor/Core/ProbeWire.cs").write_bytes(b"changed public input")
      with self.assertRaises(ValueError):
        snapshot(repo, release)


class BundleTests(unittest.TestCase):
  # 若忽略hash／普通單link／容量檢查，這些讀檔會被錯誤接受。
  def test_plain_file_boundary(self):
    read = api("read_plain")
    home = root()
    path = home / "public"
    path.write_bytes(b"public")
    self.assertEqual(read(path, 6), b"public")
    for limit in [0, 5]:
      with self.assertRaises(ValueError):
        read(path, limit)
    (home / "link").symlink_to(path)
    with self.assertRaises(ValueError):
      read(home / "link", 10)
    (home / "empty").write_bytes(b"")
    with self.assertRaises(ValueError):
      read(home / "empty", 10)
    (home / "hardlink").hardlink_to(path)
    with self.assertRaises(ValueError):
      read(path, 10)

  # 少檔／多檔／改官方bytes或架構都不能只靠檔案數冒充成功。
  def test_dotnet_exact_members_and_bytes(self):
    inspect = api("inspect_dotnet")
    home, stage, feed, pin, files = dotnet_fixture()
    self.assertEqual(inspect(stage, feed, pin), files)
    for name, data in [("unknown.dll", b"extra"), ("runtime0.dll", b"tampered")]:
      path = stage / name
      path.write_bytes(data)
      with self.assertRaises(ValueError):
        inspect(stage, feed, pin)
      if name in files:
        path.write_bytes(files[name])
      else:
        path.unlink()
    missing = stage / "runtime0.dll"
    missing.rename(home / "held")
    with self.assertRaises(ValueError):
      inspect(stage, feed, pin)

  # release資訊不能偷偷退成framework-dependent、ASP.NET或錯RID。
  def test_dotnet_rejects_wrong_release_metadata(self):
    inspect = api("inspect_dotnet")
    _, stage, feed, pin, files = dotnet_fixture()
    for name in ["RdWeb.Receiver.NativeSupervisor.Windows.runtimeconfig.json", "RdWeb.Receiver.NativeSupervisor.Windows.deps.json", "RdWeb.Receiver.NativeSupervisor.Windows.exe"]:
      (stage / name).write_bytes(b"wrong metadata")
      with self.assertRaises(ValueError):
        inspect(stage, feed, pin)
      (stage / name).write_bytes(files[name])
    with self.assertRaises(ValueError):
      inspect(stage, feed, pin, "0" * 64)

  # ZIP保持繁體／空格原文且manifest不自列，既有目的地絕不覆寫。
  def test_bundle_roundtrip_and_exclusive_output(self):
    write = api("write_bundle")
    home = root()
    files = {"PUBLIC 空格 繁體/case.mjs": b"public\r\n", "LICENSE": b"license"}
    actual = write(home / "bundle", files)
    self.assertEqual(set(actual), {*files, "integrity.json"})
    manifest = json.loads(actual["integrity.json"])
    self.assertEqual(manifest, {"schemaVersion": 1, "files": {"LICENSE": hashlib.sha256(b"license").hexdigest(), "PUBLIC 空格 繁體/case.mjs": hashlib.sha256(b"public\r\n").hexdigest()}})
    zipped = api("write_zip")(home / "bundle.zip", actual)
    with zipfile.ZipFile(home / "bundle.zip") as z:
      self.assertIsNone(z.testzip())
      self.assertEqual({n: z.read(n) for n in z.namelist()}, actual)
      self.assertTrue(all(i.date_time == (1980, 1, 1, 0, 0, 0) for i in z.infolist()))
    self.assertEqual(zipped, hashlib.sha256((home / "bundle.zip").read_bytes()).hexdigest())
    with self.assertRaises(FileExistsError):
      write(home / "bundle", files)
    with self.assertRaises(FileExistsError):
      api("write_zip")(home / "bundle.zip", actual)
    self.assertEqual((home / "bundle/PUBLIC 空格 繁體/case.mjs").read_bytes(), b"public\r\n")

  # traversal、大小寫或檔案／目錄別名不能寫出指定root。
  def test_bundle_rejects_unsafe_names_before_writing(self):
    write = api("write_bundle")
    for files in [{"../outside": b"x"}, {"/absolute": b"x"}, {"C:/file": b"x"}, {"a\\b": b"x"}, {"A": b"x", "a": b"y"}, {"Dir/a": b"x", "dir/b": b"y"}, {"a": b"x", "a/b": b"y"}, {"CON": b"x"}, {"x.": b"x"}, {"integrity.json": b"fake"}, {"INTEGRITY.JSON": b"fake"}]:
      home = root()
      with self.assertRaises(ValueError):
        write(home / "bundle", files)
      self.assertFalse((home / "bundle").exists())

  # 對應來源不能從HEAD取舊檔，也不能漏掉發布lock或順帶打包cache。
  def test_source_snapshot_has_release_inputs_and_rejects_missing(self):
    snapshot = api("source_snapshot")
    home, release, fixture_pin = source_fixture(False)
    source = home / "frontend/e2e/receiver/native-supervisor"
    (home / "private-secret").write_bytes(b"must not be copied")
    with mock.patch.dict(snapshot.__globals__, {"LEGACY_SOURCE_DIGEST": fixture_pin}):
      files = snapshot(home, release)
      self.assertEqual(len(files), 55)
      self.assertNotIn("private-secret", files)
      self.assertEqual(files["rebuild-inputs/global.json"], (release / "global.json").read_bytes())
      self.assertNotEqual(files["rebuild-inputs/global.json"], files["global.json"])
      (release / "Windows/packages.lock.json").rename(release / "Windows/held-lock")
      with self.assertRaises((ValueError, FileNotFoundError)):
        snapshot(home, release)
      (release / "Windows/held-lock").rename(release / "Windows/packages.lock.json")
      (source / "Core/ProbeWire.cs").write_bytes(b"changed public source")
      with self.assertRaises(ValueError):
        snapshot(home, release)


class RuntimeTests(unittest.TestCase):
  # 簽章exit0仍必須提供唯一完整signer／primary及GOODSIG，不能只看短ID。
  def test_gpg_requires_complete_matching_status(self):
    verify = api("verify_gpg_status")
    fingerprint = "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356"
    good = f"[GNUPG:] GOODSIG 20B1A390B168D356 Public User\n[GNUPG:] VALIDSIG {fingerprint} 2026-10-21 1792540800 0 4 0 1 8 00 {fingerprint}\n[GNUPG:] TRUST_UNDEFINED 0 pgp\n"
    self.assertIsNone(verify(good, fingerprint))
    for bad in ["", good.replace(fingerprint, "A" * 40), good.replace("GOODSIG", "BADSIG"), good + "[GNUPG:] EXPKEYSIG bad\n", good + "[GNUPG:] REVKEYSIG bad\n", good + good, good.split("[GNUPG:] VALIDSIG")[0], good.replace("20B1A390B168D356", "B168D356"), good.replace("00 " + fingerprint, "00")]:
      with self.assertRaises(ValueError):
        verify(bad, fingerprint)

  # 真Node執行檔與授權都要獨立hash，不能只信archive或checksum。
  def test_node_archive_hash_pe_license_and_paths(self):
    inspect = api("inspect_node_archive")
    prefix = "node-v24.22.1-win-x64/"
    node, license_text = pe(), b"public full license"
    files = {prefix + "node.exe": node, prefix + "LICENSE": license_text}
    data = archive(files)
    pin = {"version": "v24.22.1", "arch": "win-x64", "archiveSha256": hashlib.sha256(data).hexdigest(), "nodeExeSha256": hashlib.sha256(node).hexdigest(), "licenseSha256": hashlib.sha256(license_text).hexdigest()}
    self.assertEqual(inspect(data, pin), {"node.exe": node, "LICENSE.Node.txt": license_text})
    with self.assertRaises(ValueError):
      inspect(data + b"tampered", pin)
    for key in ["nodeExeSha256", "licenseSha256"]:
      with self.assertRaises(ValueError):
        inspect(data, pin | {key: "0" * 64})
    for name in ["../evil", prefix + "NODE.EXE", "C:/evil", prefix + "bad\\path"]:
      bad = archive(files | {name: b"bad"})
      with self.assertRaises(ValueError):
        inspect(bad, pin | {"archiveSha256": hashlib.sha256(bad).hexdigest()})
    changed = archive(files | {prefix + "node.exe": b"not PE"})
    with self.assertRaises(ValueError):
      inspect(changed, pin | {"archiveSha256": hashlib.sha256(changed).hexdigest(), "nodeExeSha256": hashlib.sha256(b"not PE").hexdigest()})

  # zipfile會讀取symlink內容但封裝器不可接受，超限metadata也須先拒絕。
  def test_node_archive_rejects_symlink_and_oversized_member(self):
    inspect = api("inspect_node_archive")
    for mode, length in [(stat.S_IFLNK | 0o777, 1), (stat.S_IFREG | 0o644, 134217729)]:
      output = io.BytesIO()
      with zipfile.ZipFile(output, "w") as z:
        info = zipfile.ZipInfo("node-v24.22.1-win-x64/node.exe")
        info.external_attr = mode << 16
        z.writestr(info, b"x")
      data = bytearray(output.getvalue())
      if length > 1:
        central = data.index(b"PK\x01\x02")
        struct.pack_into("<I", data, central + 24, length)
      with self.assertRaises(ValueError):
        inspect(data, {"version": "v24.22.1", "arch": "win-x64", "archiveSha256": hashlib.sha256(data).hexdigest()})

  # ZIP原始名稱的NUL與偽裝目錄不能被zipfile正規化後當成普通node.exe。
  def test_node_archive_rejects_nul_name_and_directory_mode(self):
    inspect = api("inspect_node_archive")
    prefix = "node-v24.22.1-win-x64/"
    files = {prefix + "node.exeXtail": pe(), prefix + "LICENSE": b"public license"}
    nul_data = archive(files).replace(b"node.exeXtail", b"node.exe\0tail")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as z:
      info = zipfile.ZipInfo(prefix + "node.exe")
      info.external_attr = (stat.S_IFDIR | 0o755) << 16
      z.writestr(info, pe())
      z.writestr(prefix + "LICENSE", b"public license")
    for data in [nul_data, output.getvalue()]:
      pin = {"version": "v24.22.1", "arch": "win-x64", "archiveSha256": hashlib.sha256(data).hexdigest(), "nodeExeSha256": hashlib.sha256(pe()).hexdigest(), "licenseSha256": hashlib.sha256(b"public license").hexdigest()}
      with self.subTest(nul_name=data is nul_data):
        with self.assertRaises(ValueError):
          inspect(data, pin)

  # 使用真正HTTPResponse的EOF行為，避免最後一塊關socket後誤當下載失敗。
  def test_download_http_response_eof(self):
    download = api("download_once")
    # 公開socket替身保留標準HTTP解析，僅不做真網路IO。
    class Socket:
      # 讓HTTPResponse取得固定公開bytes串流。
      def makefile(self, mode):
        stream = io.BytesIO(b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\n\r\npublic!")
        stream.raw = mock.Mock()
        return stream
    response = http.client.HTTPResponse(Socket())
    response.begin()
    opener = mock.Mock()
    opener.open.return_value = response
    path = root() / "complete"
    download("https://nodejs.org/public", path, 7, opener=opener)
    self.assertEqual(path.read_bytes(), b"public!")

  # HTTP超限不重試；保留已有部分內容，既存目的地不被覆寫。
  def test_download_limits_and_no_retry(self):
    download = api("download_once")
    home = root()
    response = mock.MagicMock()
    response.status = 200
    response.headers = {"Content-Length": "7"}
    response.read1.side_effect = [b"public!", b""]
    response.__enter__.return_value = response
    opener = mock.Mock()
    opener.open.return_value = response
    with self.assertRaises(ValueError):
      download("https://nodejs.org/public", home / "limited", 6, opener=opener)
    self.assertEqual(opener.open.call_count, 1)
    self.assertTrue((home / "limited").exists())
    opener.reset_mock()
    with self.assertRaises(FileExistsError):
      download("https://nodejs.org/public", home / "limited", 6, opener=opener)
    opener.open.assert_not_called()

  # 假GPG邊界仍經過真checksum／archive處理，錯簽或錯checksum不得產生Node來源。
  def test_acquisition_gates_gpg_and_checksum(self):
    acquire = api("acquire_node")
    module = acquire.__globals__
    node, license_text = pe(), b"public license"
    data = archive({"node-v24.22.1-win-x64/node.exe": node, "node-v24.22.1-win-x64/LICENSE": license_text})
    repo = Path(__file__).resolve().parents[3]
    pin = json.loads((repo / "frontend/e2e/receiver/node-runtime-pin.json").read_bytes())
    pin.update(archiveSha256=hashlib.sha256(data).hexdigest(), nodeExeSha256=hashlib.sha256(node).hexdigest(), licenseSha256=hashlib.sha256(license_text).hexdigest())
    key = pin["trust"]["fingerprint"]
    calls = []
    # 只替換外部下載，程式仍須決定四URL與寫入位置。
    def fetch(url, path, limit):
      calls.append(url)
      payload = data if url.endswith(".zip") else (f"{pin['archiveSha256']}  node-v24.22.1-win-x64.zip\n".encode() if url.endswith(".txt") else b"public signature or key")
      Path(path).write_bytes(payload)
    # 只替換process；真控制流程必須解析key及驗簽status。
    def runner(args, **kwargs):
      if "--show-keys" in args:
        return subprocess.CompletedProcess(args, 0, f"pub:-:4096:1:public::::\nfpr:::::::::{key}:\n", "")
      if "--verify" in args:
        return subprocess.CompletedProcess(args, 0, f"[GNUPG:] GOODSIG {key[-16:]} Public User\n[GNUPG:] VALIDSIG {key} 2026-10-21 1792540800 0 4 0 1 8 00 {key}\n", "")
      return subprocess.CompletedProcess(args, 0, "", "")
    with mock.patch.dict(module, {"download_once": fetch}):
      result = acquire(root(), pin, runner=runner)
      self.assertEqual(result["node.exe"], node)
      self.assertEqual(len(calls), 4)
      with self.assertRaises(ValueError):
        acquire(root(), pin, runner=mock.Mock(return_value=subprocess.CompletedProcess([], 1, "", "private error")))
    # 同一有效GPG替身下改checksum，仍須由真checksum parser拒絕。
    def bad_checksum(url, path, limit):
      fetch(url, path, limit)
      if url.endswith("SHASUMS256.txt"):
        Path(path).write_bytes(("0" * 64 + "  node-v24.22.1-win-x64.zip\n").encode())
    with mock.patch.dict(module, {"download_once": bad_checksum}):
      with self.assertRaises(ValueError):
        acquire(root(), pin, runner=runner)

  # 有界讀取中途超限／deadline都不能進入解壓，部分檔保留且不重試。
  def test_download_stream_limit_and_deadline(self):
    download = api("download_once")
    for blocks, times, limit in [([b"abc", b"def"], [0, 1, 2, 3, 4], 5), ([b"abc"], [0, 1, 121], 10)]:
      response = mock.MagicMock()
      response.status, response.headers = 200, {}
      response.read1.side_effect = blocks
      response.__enter__.return_value = response
      opener = mock.Mock()
      opener.open.return_value = response
      path = root() / "partial"
      with mock.patch.object(download.__globals__["time"], "monotonic", side_effect=times):
        with self.assertRaises(ValueError):
          download("https://nodejs.org/public", path, limit, opener=opener)
      self.assertEqual(opener.open.call_count, 1)
      self.assertTrue(path.exists())

  # redirect handler不會替核准URL自動轉向另一個下載來源。
  def test_redirect_is_rejected(self):
    handler = api("NoRedirect")()
    with self.assertRaises(ValueError):
      handler.redirect_request(None, None, 302, "public redirect", {}, "https://example.invalid/")


class RebuildTests(unittest.TestCase):
  # 假SDK只產生公開assets／nupkg／publish結果，真函數仍負責source及gate順序。
  def fixture(self, failure=None):
    home, _, feed, pin, files = dotnet_fixture()
    repo = home / "repo"
    real = Path(__file__).resolve().parents[3]
    src = repo / "frontend/e2e/receiver/native-supervisor"
    src.mkdir(parents=True)
    for kind in ["Core", "Windows"]:
      (src / kind).mkdir()
      for path in (real / "frontend/e2e/receiver/native-supervisor" / kind).iterdir():
        if path.suffix in (".cs", ".csproj"):
          shutil.copyfile(path, src / kind / path.name)
    (src / "dotnet-runtime-pin.json").write_text(json.dumps(pin))
    shutil.copyfile(real / "Directory.Build.props", repo / "Directory.Build.props")
    inputs = repo / "rebuild-inputs"
    inputs.mkdir()
    (inputs / "global.json").write_text('{"sdk":{"version":"10.0.113","rollForward":"disable"}}')
    (inputs / "NuGet.Config").write_text('<configuration><packageSources><clear/><add key="receiver-native-local" value="../local-feed"/></packageSources><auditSources><clear/><add key="nuget-audit" value="https://api.nuget.org/v3/index.json"/></auditSources><fallbackPackageFolders><clear/></fallbackPackageFolders></configuration>')
    for kind in ["Core", "Windows"]:
      (inputs / kind).mkdir()
      framework = {} if kind == "Core" else {"rdweb.receiver.nativesupervisor.core": {"type": "Project"}}
      (inputs / kind / "packages.lock.json").write_text(json.dumps({"version": 1, "dependencies": {"net10.0": framework, "net10.0/win-x64": {}}}))
    output = home / "rebuilt"
    calls = []
    # 模擬的副作用只落在被測函數指定的新目錄，不吞掉真驗證邏輯。
    def runner(args, **kwargs):
      calls.append(args)
      self.assertEqual(args[0], "dotnet")
      self.assertEqual(kwargs["cwd"], output / "source")
      self.assertEqual(kwargs["env"]["NUGET_PACKAGES"], str(output / "packages"))
      if "--version" in args:
        version = {"version": "10.0.112\n", "version114": "10.0.114\n"}.get(failure, "10.0.113\n")
        return subprocess.CompletedProcess(args, 0, version, "")
      for property_value in ["-p:RuntimeFrameworkVersion=10.0.14", "-p:DisableTransitiveFrameworkReferenceDownloads=true", "-p:SelfContained=true", "-p:UseAppHost=true", "-p:PublishAot=false", "-p:PublishTrimmed=false", "-p:PublishSingleFile=false", "-p:PublishReadyToRun=false", "-p:DebugType=None", "-p:UseSharedCompilation=false"]:
        self.assertIn(property_value, args)
      if "restore" in args:
        self.assertIn("--locked-mode", args)
        self.assertNotIn("--use-lock-file", args)
        if failure == "restore":
          return subprocess.CompletedProcess(args, 1, "", "public failure")
        if failure == "lock":
          (output / "source/Core/packages.lock.json").write_bytes(b"changed")
        downloads = [{"name": "Microsoft.NETCore.App.Host.win-x64", "version": "[10.0.14, 10.0.14]"}, {"name": "Microsoft.NETCore.App.Runtime.win-x64", "version": "[10.0.14, 10.0.14]"}]
        if failure == "extra":
          downloads.append({"name": "Microsoft.AspNetCore.App.Runtime.win-x64", "version": "[10.0.14, 10.0.14]"})
        for kind in ["Core", "Windows"]:
          name = "RdWeb.Receiver.NativeSupervisor." + kind
          obj = output / "artifacts/obj" / name
          obj.mkdir(parents=True)
          project = {"frameworks": {"net10.0": {"frameworkReferences": {"Microsoft.NETCore.App": {"privateAssets": "all"}}, "downloadDependencies": downloads}}, "restore": {"sources": {str(output / "local-feed"): {}}, "restoreAuditProperties": {"enableAudit": "true", "auditLevel": "low", "auditMode": "all"}}}
          (obj / "project.assets.json").write_text(json.dumps({"project": project, "libraries": {}}))
          (obj / (name + ".csproj.nuget.dgspec.json")).write_text(json.dumps({"projects": {kind: project}}))
        for path in feed.iterdir():
          identifier = path.name.removesuffix(".10.0.14.nupkg")
          dest = output / "packages" / identifier / "10.0.14"
          dest.mkdir(parents=True)
          shutil.copyfile(path, dest / path.name)
      elif "publish" in args:
        self.assertIn("--no-restore", args)
        self.assertIn("--self-contained", args)
        if failure == "publish":
          return subprocess.CompletedProcess(args, 1, "", "public publish failure")
        stage = Path(args[args.index("-o") + 1])
        stage.mkdir()
        for name, data in files.items():
          if name not in ("LICENSE.DotNet.txt", "THIRD-PARTY-NOTICES.DotNet.txt"):
            (stage / name).write_bytes(data)
      return subprocess.CompletedProcess(args, 0, "", "")
    return repo, feed, output, runner, calls

  # 新圖只能用發布locks與兩包，在真gate之後才可publish，不能偷重新生lock。
  def test_rebuild_uses_locked_inputs_and_preserves_locks(self):
    rebuild = api("rebuild")
    repo, feed, output, runner, calls = self.fixture()
    result = rebuild(repo, feed, output, runner=runner)
    self.assertEqual(result, output / "staging")
    self.assertEqual(len(list(result.iterdir())), 194)
    self.assertEqual(len(calls), 3)
    for kind in ["Core", "Windows"]:
      self.assertEqual((output / "source" / kind / "packages.lock.json").read_bytes(), (repo / "rebuild-inputs" / kind / "packages.lock.json").read_bytes())
    with self.assertRaises(FileExistsError):
      rebuild(repo, feed, output, runner=runner)
    self.assertEqual(len(calls), 3)

  # restore錯誤、lock變動或第三包需求一律停在publish之前且保留新root。
  def test_rebuild_stops_after_failed_gate(self):
    rebuild = api("rebuild")
    for failure, count in [("version", 1), ("version114", 1), ("restore", 2), ("extra", 2), ("lock", 2), ("publish", 3)]:
      repo, feed, output, runner, calls = self.fixture(failure)
      with self.assertRaises(ValueError):
        rebuild(repo, feed, output, runner=runner)
      self.assertEqual(len(calls), count)
      self.assertFalse((output / "staging").exists())
      self.assertTrue((output / "source").is_dir())


# 假SDK提供完整三project restore圖與raw publish；真builder負責所有gate及寫檔。
def baseline_rebuild_fixture(failure=None, companions_count=3):
  _, _, feed, pin, files, companions = baseline_dotnet_fixture()
  repo, release, fixture_pin = source_fixture(runtime_pin=pin)
  output = repo.parent / "rebuilt"
  dotnet = repo.parent / "SDK 空格" / "dotnet"
  dotnet.parent.mkdir()
  dotnet.write_bytes(b"PUBLIC_FAKE_SDK_NOT_EXECUTABLE_CONTENT")
  dotnet.chmod(0o700)
  calls = []
  names = {"Core": "RdWeb.Receiver.NativeSupervisor.Core", "Windows": "RdWeb.Receiver.NativeSupervisor.Windows", "Baseline": "RdWeb.Receiver.NativeBaseline.Windows"}
  dependencies = {"Core": [], "Windows": ["Core"], "Baseline": ["Core", "Windows"]}

  # 只替換process；一旦命令序列／屬性錯誤就斷言，不幫builder補成功。
  def runner(args, **kwargs):
    calls.append(args)
    assert args[0] == str(dotnet)
    assert kwargs["cwd"] == output / "source"
    assert kwargs["env"]["NUGET_PACKAGES"] == str(output / "packages")
    assert kwargs["env"]["DOTNET_ROOT"] == str(dotnet.parent)
    assert kwargs["env"]["DOTNET_ROOT_X64"] == str(dotnet.parent)
    assert kwargs["env"]["DOTNET_HOST_PATH"] == str(dotnet)
    if "--version" in args:
      version = {"version": "10.0.112\n", "version113": "10.0.113\n", "version115": "10.0.115\n"}.get(failure, "10.0.114\n")
      return subprocess.CompletedProcess(args, 1 if failure == "version_exit" else 0, version, "")
    assert args[2] == "Baseline/RdWeb.Receiver.NativeBaseline.Windows.csproj"
    for prop in ["-p:RuntimeFrameworkVersion=10.0.14", "-p:RuntimeIdentifier=win-x64", "-p:SelfContained=true", "-p:UseAppHost=true", "-p:PublishAot=false", "-p:PublishTrimmed=false", "-p:PublishSingleFile=false", "-p:PublishReadyToRun=false", "-p:UseSharedCompilation=false", "-p:DisableTransitiveFrameworkReferenceDownloads=true", "-p:DebugType=None"]:
      assert prop in args
    if "restore" in args:
      assert "--locked-mode" in args and "--use-lock-file" not in args
      if failure == "restore":
        return subprocess.CompletedProcess(args, 1, "", "public failure")
      projects = {}
      paths = {k: str(output / "source" / k / (v + ".csproj")) for k, v in names.items()}
      downloads = [{"name": "Microsoft.NETCore.App.Host.win-x64", "version": "[10.0.14, 10.0.14]"}, {"name": "Microsoft.NETCore.App.Runtime.win-x64", "version": "[10.0.14, 10.0.14]"}]
      for kind in names:
        project = {"frameworks": {"net10.0": {"frameworkReferences": {"Microsoft.NETCore.App": {"privateAssets": "all"}}, "downloadDependencies": list(downloads)}},
          "runtimes": {"win-x64": {}}, "restore": {"projectPath": paths[kind], "sources": {str(output / "local-feed"): {}},
            "frameworks": {"net10.0": {"projectReferences": {paths[k]: {"projectPath": paths[k]} for k in dependencies[kind]}}},
            "restoreAuditProperties": {"enableAudit": "true", "auditLevel": "low", "auditMode": "all"}}}
        projects[kind] = project
      for kind, name in names.items():
        obj = output / "artifacts/obj" / name
        obj.mkdir(parents=True)
        libraries = {names[k] + "/1.0.0": {"type": "project"} for k in dependencies[kind]}
        assets = {"project": projects[kind], "libraries": libraries, "targets": {"net10.0": {}, "net10.0/win-x64": {}}}
        graph = {paths[k]: projects[k] for k in [kind] + dependencies[kind]}
        if kind == "Baseline":
          if failure == "extra":
            projects[kind]["frameworks"]["net10.0"]["downloadDependencies"].append({"name": "Microsoft.AspNetCore.App.Runtime.win-x64", "version": "[10.0.14, 10.0.14]"})
          if failure == "audit":
            projects[kind]["restore"]["restoreAuditProperties"]["enableAudit"] = "false"
          if failure == "sources":
            projects[kind]["restore"]["sources"]["https://example.invalid"] = {}
          if failure == "rid":
            projects[kind]["runtimes"] = {"linux-x64": {}}
          if failure == "project":
            graph[str(output / "source/extra.csproj")] = projects[kind]
          if failure == "library":
            libraries["external/1.0.0"] = {"type": "package"}
          if failure == "references":
            projects[kind]["restore"]["frameworks"]["net10.0"]["projectReferences"] = {}
        if not (kind == "Baseline" and failure == "assets"):
          (obj / "project.assets.json").write_text(json.dumps(assets))
        if not (kind == "Baseline" and failure == "dgspec"):
          (obj / (name + ".csproj.nuget.dgspec.json")).write_text(json.dumps({"projects": graph}))
      for path in feed.iterdir():
        identifier = path.name.removesuffix(".10.0.14.nupkg")
        dest = output / "packages" / identifier / "10.0.14"
        dest.mkdir(parents=True)
        shutil.copyfile(path, dest / path.name)
      if failure == "package":
        (output / "packages/extra-package").mkdir()
      if failure == "lock":
        (output / "source/Baseline/packages.lock.json").write_bytes(b"changed")
    elif "publish" in args:
      assert "--no-restore" in args and "--self-contained" in args
      assert Path(args[args.index("-o") + 1]) == output / "raw-publish"
      if failure == "publish":
        return subprocess.CompletedProcess(args, 1, "", "public publish failure")
      raw = output / "raw-publish"
      raw.mkdir()
      for name, data in files.items():
        if name not in ("LICENSE.DotNet.txt", "THIRD-PARTY-NOTICES.DotNet.txt"):
          (raw / name).write_bytes(data)
      for name, data in companions.items():
        if companions_count == 3 or (companions_count == 2 and not name.endswith(".exe")):
          (raw / name).write_bytes(data)
      if failure == "raw":
        (raw / "unknown.dll").write_bytes(b"public")
    else:
      raise AssertionError("unexpected_public_sdk_command")
    return subprocess.CompletedProcess(args, 0, "", "")
  return repo, feed, output, runner, calls, fixture_pin, dotnet


class BaselineRebuildTests(unittest.TestCase):
  # 相對或無效入口必須在建立output及呼process前拒絕，不能自動改走PATH。
  def test_baseline_sdk_path_rejected_before_output(self):
    rebuild = api("rebuild_baseline")
    for kind in ["relative", "missing", "directory", "symlink", "nonexecutable"]:
      with self.subTest(kind=kind):
        repo, feed, output, runner, calls, _, dotnet = baseline_rebuild_fixture()
        path = dotnet
        if kind == "relative":
          path = Path("PUBLIC/dotnet")
        elif kind == "missing":
          path = dotnet.parent / "missing"
        elif kind == "directory":
          path = dotnet.parent
        elif kind == "symlink":
          path = dotnet.parent / "linked-dotnet"
          path.symlink_to(dotnet)
        else:
          dotnet.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "^baseline_sdk_path_rejected$"):
          rebuild(repo, feed, output, runner=runner, dotnet=path)
        self.assertEqual(calls, [])
        self.assertFalse(output.exists())
    repo, feed, output, runner, calls, _, _ = baseline_rebuild_fixture()
    with self.assertRaises(TypeError):
      rebuild(repo, feed, output, runner=runner)
    self.assertEqual(calls, [])
    self.assertFalse(output.exists())

  # 每次命令都使用帶空格的明確入口，並覆蓋繼承到的錯誤SDK環境。
  def test_baseline_sdk_path_and_environment_are_fixed(self):
    rebuild = api("rebuild_baseline")
    repo, feed, output, runner, calls, fixture_pin, dotnet = baseline_rebuild_fixture()
    inherited = {"DOTNET_ROOT": "/wrong/root", "DOTNET_ROOT_X64": "/wrong/x64", "DOTNET_HOST_PATH": "/wrong/dotnet"}
    with mock.patch.dict(os.environ, inherited), mock.patch.dict(rebuild.__globals__, {"BASELINE_SOURCE_DIGEST": fixture_pin}):
      stage = positive(rebuild, repo, feed, output, runner=runner, dotnet=dotnet)
    self.assertEqual(len(list(stage.iterdir())), 195)
    self.assertEqual([args[1] for args in calls], ["--version", "restore", "publish"])

  # 錯版或version失敗只能留下新output，不得進restore或publish。
  def test_baseline_sdk_version_stops_before_restore(self):
    rebuild = api("rebuild_baseline")
    for failure in ["version113", "version115", "version_exit"]:
      with self.subTest(failure=failure):
        repo, feed, output, runner, calls, fixture_pin, dotnet = baseline_rebuild_fixture(failure)
        with mock.patch.dict(rebuild.__globals__, {"BASELINE_SOURCE_DIGEST": fixture_pin}):
          with self.assertRaisesRegex(ValueError, "^rebuild_sdk_rejected$"):
            rebuild(repo, feed, output, runner=runner, dotnet=dotnet)
        self.assertEqual(calls, [[str(dotnet), "--version"]])
        self.assertTrue(output.is_dir())
        self.assertFalse((output / "raw-publish").exists())
        self.assertFalse((output / "staging").exists())

  # 真對應來源的rebuild-inputs只有控制檔，不能要求原碼再複製一份在該目錄。
  def test_baseline_rebuild_accepts_control_only_inputs(self):
    rebuild = api("rebuild_baseline")
    repo, feed, output, runner, calls, fixture_pin, dotnet = baseline_rebuild_fixture()
    release = repo / "rebuild-inputs"
    for path in list(release.rglob("*.cs")) + list(release.rglob("*.csproj")) + [release / "Directory.Build.props"]:
      path.unlink()
    self.assertEqual(len([p for p in release.rglob("*") if p.is_file()]), 5)
    with mock.patch.dict(rebuild.__globals__, {"BASELINE_SOURCE_DIGEST": fixture_pin}):
      stage = positive(rebuild, repo, feed, output, runner=runner, dotnet=dotnet)
    self.assertEqual(len(list(stage.iterdir())), 195)
    self.assertEqual(len(calls), 3)

  # 真流程須驗三份locks與source closure，保留raw並另建唯一canonical stage。
  def test_baseline_rebuild_uses_fixed_project_and_locks(self):
    rebuild = api("rebuild_baseline")
    for count in [0, 2, 3]:
      repo, feed, output, runner, calls, fixture_pin, dotnet = baseline_rebuild_fixture(companions_count=count)
      with mock.patch.dict(rebuild.__globals__, {"BASELINE_SOURCE_DIGEST": fixture_pin}):
        result = positive(rebuild, repo, feed, output, runner=runner, dotnet=dotnet)
      self.assertEqual(result, output / "staging")
      self.assertEqual(len(list(result.iterdir())), 195)
      self.assertEqual(len(list((output / "raw-publish").iterdir())), 195 + count)
      self.assertEqual(len(calls), 3)
      self.assertFalse((result / "RdWeb.Receiver.NativeSupervisor.Windows.exe").exists())
      self.assertFalse((output / "source/Tests").exists())
      for kind in ["Core", "Windows", "Baseline"]:
        self.assertEqual((output / "source" / kind / "packages.lock.json").read_bytes(), (repo / "rebuild-inputs" / kind / "packages.lock.json").read_bytes())
      with self.assertRaises(FileExistsError):
        rebuild(repo, feed, output, runner=runner, dotnet=dotnet)
      self.assertEqual(len(calls), 3)

  # 單個錯圖／第三包／audit關閉均須先於publish拒絕，失敗root不清理或自動重試。
  def test_baseline_rebuild_stops_before_publish(self):
    rebuild = api("rebuild_baseline")
    for failure in ["version", "restore", "lock", "assets", "dgspec", "extra", "audit", "sources", "rid", "project", "library", "references", "package", "publish", "raw"]:
      with self.subTest(failure=failure):
        repo, feed, output, runner, calls, fixture_pin, dotnet = baseline_rebuild_fixture(failure)
        with mock.patch.dict(rebuild.__globals__, {"BASELINE_SOURCE_DIGEST": fixture_pin}):
          with self.assertRaises((ValueError, OSError)):
            rebuild(repo, feed, output, runner=runner, dotnet=dotnet)
        self.assertEqual(len(calls), 1 if failure == "version" else 3 if failure in ("publish", "raw") else 2)
        self.assertTrue(output.is_dir())
        self.assertFalse((output / "staging").exists())
        self.assertEqual((output / "raw-publish").exists(), failure == "raw")


# 新pack公開fixture保留所有真來源／staging gate，只有Node取得是外部替身。
def baseline_pack_fixture():
  _, stage, feed, pin, files, _ = baseline_dotnet_fixture()
  repo, release, source_pin = source_fixture(runtime_pin=pin)
  node = {"node.exe": pe(), "LICENSE.Node.txt": b"public full node license"}
  return repo, release, source_pin, stage, feed, files, node


class BaselinePackTests(unittest.TestCase):
  # 兩份ZIP真回讀CRC／manifest／完整bytes；來源閉包與binary集合獨立明列。
  def test_baseline_pack_exact_archives(self):
    pack = api("pack_baseline")
    repo, release, source_pin, stage, feed, files, node = baseline_pack_fixture()
    output = repo.parent / "packed"
    acquire = mock.Mock(return_value=node)
    pins = pack.__globals__["BASELINE_SOURCE_PINS"] | {"node.exe": hashlib.sha256(node["node.exe"]).hexdigest()}
    with mock.patch.dict(pack.__globals__, {"BASELINE_SOURCE_DIGEST": source_pin, "BASELINE_SOURCE_PINS": pins}):
      result = positive(pack, repo, stage, feed, release, output, node_acquirer=acquire)
    self.assertEqual(acquire.call_count, 1)
    self.assertEqual(acquire.call_args.args[0], output)
    self.assertEqual(set(result), {"receiver-native-baseline-win-x64.zip", "receiver-native-baseline-corresponding-source.zip"})
    binary_names = set(files) | {"node.exe", "LICENSE.Node.txt", "start-windows-test-receiver.ps1", "windows-host-observer-supervisor.ps1",
      "receiver-native-baseline-child.ps1", "PUBLIC 空格 繁體/receiver-native-case.mjs", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "integrity.json"}
    source_names = {"frontend/e2e/receiver/native-supervisor/" + n for n in PUBLIC_SOURCE_NAMES + BASELINE_ADDITIONAL_NAMES} | set(PUBLIC_EXTRAS) | {
      "rebuild-inputs/global.json", "rebuild-inputs/NuGet.Config", "rebuild-inputs/Core/packages.lock.json", "rebuild-inputs/Windows/packages.lock.json", "rebuild-inputs/Baseline/packages.lock.json", "integrity.json"}
    self.assertEqual(len(binary_names), 205)
    self.assertEqual(len(source_names), 71)
    for name, expected in [("receiver-native-baseline-win-x64.zip", binary_names), ("receiver-native-baseline-corresponding-source.zip", source_names)]:
      path = output / "archives" / name
      self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), result[name])
      with zipfile.ZipFile(path) as archive_file:
        self.assertIsNone(archive_file.testzip())
        self.assertEqual(set(archive_file.namelist()), expected)
        manifest = json.loads(archive_file.read("integrity.json"))
        self.assertEqual(manifest, {"schemaVersion": 1, "files": {n: hashlib.sha256(archive_file.read(n)).hexdigest() for n in expected if n != "integrity.json"}})
        if "corresponding-source" not in name:
          self.assertEqual(archive_file.read("receiver-native-baseline-child.ps1"), (repo / "frontend/e2e/receiver/native-supervisor/Fixtures/receiver-native-baseline-child.ps1").read_bytes())

  # 任一前置錯誤須先於Node取得，保留失敗root；既存root不能讀檔或覆寫。
  def test_baseline_pack_failure_preserves_root(self):
    pack = api("pack_baseline")
    for failure in ["source", "release", "pin", "stage", "digest"]:
      with self.subTest(failure=failure):
        repo, release, source_pin, stage, feed, _, node = baseline_pack_fixture()
        output = repo.parent / "failed"
        acquire = mock.Mock(return_value=node)
        pins = pack.__globals__["BASELINE_SOURCE_PINS"] | {"node.exe": hashlib.sha256(node["node.exe"]).hexdigest()}
        if failure == "source":
          (repo / "frontend/e2e/receiver/native-supervisor/Baseline/Program.cs").write_bytes(b"changed public source")
        if failure == "release":
          (release / "Baseline/Program.cs").write_bytes(b"changed public release source")
        if failure == "pin":
          pins["receiver-native-baseline-child.ps1"] = "0" * 64
        if failure == "stage":
          (stage / "runtime0.dll").write_bytes(b"changed public runtime")
        with mock.patch.dict(pack.__globals__, {"BASELINE_SOURCE_DIGEST": source_pin, "BASELINE_SOURCE_PINS": pins}):
          with self.assertRaises(ValueError):
            pack(repo, stage, feed, release, output, "0" * 64 if failure == "digest" else None, node_acquirer=acquire)
        self.assertTrue(output.is_dir())
        self.assertFalse((output / "archives").exists())
        acquire.assert_not_called()
    output = root()
    with mock.patch.dict(pack.__globals__, {"read_plain": mock.Mock(side_effect=AssertionError("unexpected_read"))}):
      try:
        with self.assertRaises(FileExistsError):
          pack(output, output, output, output, output)
      except ValueError:
        self.fail("exclusive_output_boundary_not_implemented")

  # 完整參數只在同程序測dispatch，help／缺參不啟任何外部邊界。
  def test_baseline_cli_dispatch(self):
    main = api("main")
    module = main.__globals__
    for command, selected in [("rebuild", "rebuild"), ("rebuild-baseline", "rebuild_baseline"), ("pack", "pack"), ("pack-baseline", "pack_baseline")]:
      functions = {n: mock.Mock(return_value={} if n.startswith("pack") else Path("PUBLIC")) for n in ["rebuild", "rebuild_baseline", "pack", "pack_baseline"]}
      args = [command, "--repo", "PUBLIC_REPO", "--packages", "PUBLIC_FEED", "--output", "PUBLIC_OUTPUT"]
      if command == "rebuild-baseline":
        args += ["--dotnet", "/approved/isolated-sdk/dotnet"]
      if command.startswith("pack"):
        args += ["--staging", "PUBLIC_STAGE", "--release-source", "PUBLIC_SOURCE"]
      with mock.patch.dict(module, functions), mock.patch("sys.stdout", new_callable=io.StringIO), mock.patch("sys.stderr", new_callable=io.StringIO):
        try:
          self.assertEqual(main(args), 0)
        except SystemExit:
          self.fail("fixed_baseline_command_not_registered")
      self.assertEqual(functions[selected].call_count, 1)
      if command == "rebuild-baseline":
        functions[selected].assert_called_once_with(Path("PUBLIC_REPO"), Path("PUBLIC_FEED"), Path("PUBLIC_OUTPUT"), dotnet=Path("/approved/isolated-sdk/dotnet"))
      elif command == "rebuild":
        functions[selected].assert_called_once_with(Path("PUBLIC_REPO"), Path("PUBLIC_FEED"), Path("PUBLIC_OUTPUT"))
      for name, function in functions.items():
        if name != selected:
          function.assert_not_called()
    with mock.patch("sys.stdout", new_callable=io.StringIO), mock.patch("sys.stderr", new_callable=io.StringIO):
      with self.assertRaises(SystemExit) as help_exit:
        main(["--help"])
      self.assertEqual(help_exit.exception.code, 0)
      for args in [["pack-baseline"], ["rebuild-baseline"], ["pack-baseline", "--entry", "PUBLIC"], ["pack-baseline", "--profile", "PUBLIC"]]:
        with self.assertRaises(SystemExit) as invalid:
          main(args)
        self.assertEqual(invalid.exception.code, 2)
    for command in ["rebuild-baseline", "rebuild", "pack", "pack-baseline"]:
      functions = {n: mock.Mock() for n in ["rebuild", "rebuild_baseline", "pack", "pack_baseline"]}
      output = root() / "not-created"
      args = [command, "--repo", "PUBLIC_REPO", "--packages", "PUBLIC_FEED", "--output", str(output)]
      if command.startswith("pack"):
        args += ["--staging", "PUBLIC_STAGE", "--release-source", "PUBLIC_SOURCE"]
      if command != "rebuild-baseline":
        args += ["--dotnet", "/approved/isolated-sdk/dotnet"]
      with mock.patch.dict(module, functions), mock.patch("sys.stderr", new_callable=io.StringIO):
        with self.assertRaises(SystemExit) as invalid:
          main(args)
      self.assertEqual(invalid.exception.code, 2)
      for function in functions.values():
        function.assert_not_called()
      self.assertFalse(output.exists())


class PackTests(unittest.TestCase):
  # CLI說明不會觸發網路／SDK，錯誤參數保留非零且不建立輸出。
  def test_cli_help_and_bad_arguments(self):
    api("main")
    tool = Path(__file__).resolve().parents[2] / "scripts/build_receiver_native_supervisor.py"
    result = subprocess.run([sys.executable, "-B", str(tool), "--help"], capture_output=True, text=True)
    self.assertEqual(result.returncode, 0)
    self.assertIn("pack", result.stdout)
    self.assertIn("rebuild", result.stdout)
    result = subprocess.run([sys.executable, "-B", str(tool), "pack"], capture_output=True, text=True)
    self.assertEqual(result.returncode, 2)

  # 組包必須使用凍結snapshot，保留兩PS／wrapper原bytes並排除受測main所需bundle。
  def test_pack_builds_two_exact_archives_without_running_sdk(self):
    pack = api("pack")
    module = pack.__globals__
    repo = Path(__file__).resolve().parents[3]
    source = {"frontend/e2e/receiver/native-supervisor/" + n: (repo / "frontend/e2e/receiver/native-supervisor" / n).read_bytes() for n in module["SOURCE_FILES"]}
    for name in module["EXTRA_SOURCE"]:
      source[name] = b"public usage" if name.endswith("native-supervisor/README.md") else (repo / name).read_bytes()
    for name in module["RELEASE_FILES"]:
      source["rebuild-inputs/" + name] = b"public release input"
    _, stage, feed, _, dotnet = dotnet_fixture()
    node = {"node.exe": pe(), "LICENSE.Node.txt": b"public full license"}
    home = root()
    snapshot = mock.Mock(return_value=source)
    pins = module["SOURCE_PINS"] | {"node.exe": hashlib.sha256(pe()).hexdigest()}
    # 此層只替換已各自實測的來源／staging邊界與網路；ZIP及合併全部走真函數。
    with mock.patch.dict(module, {"source_snapshot": snapshot, "inspect_dotnet": mock.Mock(return_value=dotnet), "SOURCE_PINS": pins}):
      result = pack(repo, stage, feed, home / "release", home / "output", node_acquirer=mock.Mock(return_value=node))
      self.assertEqual(set(result), {"receiver-native-supervisor-win-x64.zip", "receiver-native-supervisor-corresponding-source.zip"})
      with zipfile.ZipFile(home / "output/archives/receiver-native-supervisor-win-x64.zip") as z:
        self.assertEqual(len(z.namelist()), 204)
        self.assertNotIn("receiver.mjs", z.namelist())
        self.assertNotIn("native-probe.claim", z.namelist())
        self.assertEqual(z.read("start-windows-test-receiver.ps1"), source["frontend/e2e/scripts/start-windows-test-receiver.ps1"])
        self.assertEqual(z.read("PUBLIC 空格 繁體/receiver-native-case.mjs"), source["frontend/e2e/receiver/native-supervisor/Fixtures/PUBLIC 空格 繁體/receiver-native-case.mjs"])
      with zipfile.ZipFile(home / "output/archives/receiver-native-supervisor-corresponding-source.zip") as z:
        self.assertEqual(len(z.namelist()), 56)
        self.assertEqual(z.read("rebuild-inputs/Windows/packages.lock.json"), b"public release input")
      with self.assertRaises(FileExistsError):
        pack(repo, stage, feed, home / "release", home / "output")

  # 任一組包前置拒絕均保留exclusive新root且不下載，不得自動重試。
  def test_pack_preserves_failed_root_before_acquisition(self):
    pack = api("pack")
    module = pack.__globals__
    home = root()
    acquire = mock.Mock()
    with mock.patch.dict(module, {"source_snapshot": mock.Mock(side_effect=ValueError("public failure"))}):
      with self.assertRaises(ValueError):
        pack(home, home, home, home, home / "failed", node_acquirer=acquire)
    acquire.assert_not_called()
    self.assertTrue((home / "failed").is_dir())


if __name__ == "__main__":
  unittest.main(verbosity=2)
