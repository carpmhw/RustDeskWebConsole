"""只用公開bytes與隔離tmp測封裝器，不下載或執行任何Windows檔。"""

import base64
import hashlib
import importlib.util
import io
import json
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
    repo = Path(__file__).resolve().parents[3]
    home = root()
    for name in ["frontend/e2e/receiver/native-supervisor", "frontend/e2e/scripts/start-windows-test-receiver.ps1", "frontend/e2e/scripts/windows-host-observer-supervisor.ps1", "frontend/e2e/receiver/node-runtime-pin.json", "frontend/scripts/build_receiver_native_supervisor.py", "frontend/e2e/scripts/test_build_receiver_native_supervisor.py", "Directory.Build.props", "global.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]:
      destination = home / name
      destination.parent.mkdir(parents=True, exist_ok=True)
      if (repo / name).is_dir():
        shutil.copytree(repo / name, destination)
      else:
        shutil.copyfile(repo / name, destination)
    (home / "frontend/e2e/receiver/native-supervisor/README.md").write_bytes(b"public usage")
    release = home / "release"
    release.mkdir()
    source = home / "frontend/e2e/receiver/native-supervisor"
    for kind in ["Core", "Windows"]:
      (release / kind).mkdir()
      for path in (source / kind).iterdir():
        if path.suffix in (".cs", ".csproj"):
          shutil.copyfile(path, release / kind / path.name)
      framework = {} if kind == "Core" else {"rdweb.receiver.nativesupervisor.core": {"type": "Project"}}
      (release / kind / "packages.lock.json").write_text(json.dumps({"version": 1, "dependencies": {"net10.0": framework, "net10.0/win-x64": {}}}))
    shutil.copyfile(home / "Directory.Build.props", release / "Directory.Build.props")
    (release / "global.json").write_bytes(b'{"sdk":{"version":"10.0.113","rollForward":"disable"}}')
    (release / "NuGet.Config").write_bytes(b'<configuration><packageSources><clear/><add key="receiver-native-local" value="../local-feed"/></packageSources><auditSources><clear/><add key="nuget-audit" value="https://api.nuget.org/v3/index.json"/></auditSources><fallbackPackageFolders><clear/></fallbackPackageFolders></configuration>')
    (home / "private-secret").write_bytes(b"must not be copied")
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
      self.assertEqual(kwargs["cwd"], output / "source")
      self.assertEqual(kwargs["env"]["NUGET_PACKAGES"], str(output / "packages"))
      if "--version" in args:
        return subprocess.CompletedProcess(args, 0, "10.0.112\n" if failure == "version" else "10.0.113\n", "")
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
    for failure, count in [("version", 1), ("restore", 2), ("extra", 2), ("lock", 2), ("publish", 3)]:
      repo, feed, output, runner, calls = self.fixture(failure)
      with self.assertRaises(ValueError):
        rebuild(repo, feed, output, runner=runner)
      self.assertEqual(len(calls), count)
      self.assertFalse((output / "staging").exists())
      self.assertTrue((output / "source").is_dir())


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
