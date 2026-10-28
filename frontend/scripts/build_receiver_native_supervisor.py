"""獨立診斷包的Linux建置工具；不部署或執行Windows程式。"""

import base64
import argparse
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import re
import stat
import struct
import subprocess
import sys
import time
import urllib.request
import urllib.error
import zipfile
import xml.etree.ElementTree as ET

PREFIX = "RdWeb.Receiver.NativeSupervisor."
SOURCE = "frontend/e2e/receiver/native-supervisor"
MAX_FILE = 128 * 1024 * 1024
SOURCE_FILES = tuple("""Core/ChildProbeFrame.cs
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
EXTRA_SOURCE = (
  SOURCE + "/README.md", "frontend/scripts/build_receiver_native_supervisor.py",
  "frontend/e2e/scripts/test_build_receiver_native_supervisor.py",
  "frontend/e2e/scripts/start-windows-test-receiver.ps1",
  "frontend/e2e/scripts/windows-host-observer-supervisor.ps1",
  "frontend/e2e/receiver/node-runtime-pin.json", "LICENSE", "THIRD_PARTY_NOTICES.md",
  "Directory.Build.props", "global.json",
)
RELEASE_FILES = ("global.json", "NuGet.Config", "Core/packages.lock.json", "Windows/packages.lock.json")
SOURCE_PINS = {
  "start-windows-test-receiver.ps1": "b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19",
  "windows-host-observer-supervisor.ps1": "51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2",
  "node.exe": "d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5",
  "PUBLIC 空格 繁體/receiver-native-case.mjs": "846af281f23a2c5ab7ebc6c54fd6f6725406f9a4da73036ad4fd9cb3a10c512b",
  "receiver-native-child.ps1": "fd65687dfc382b55481217d8dc14bb5b48ab7b45d721bc57c6797e081e3f5b47",
}
BT_DIGEST = "801f0292af376b8f829f492094e64fd23f60f538c220feea3781b648ef94335a"


# 只對公開程式與發行來源計hash，不接收診斷輪次或秘密。
def sha(data):
  return hashlib.sha256(data).hexdigest()


# 同descriptor讀取普通單link檔案；拒絕symlink、空檔與超限輸入。
def read_plain(path, limit):
  path = Path(path)
  before = path.lstat()
  if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= limit:
    raise ValueError("source_file_rejected")
  with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
    opened = os.fstat(stream.fileno())
    if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_nlink) != (before.st_dev, before.st_ino, before.st_size, 1):
      raise ValueError("source_file_changed")
    data = stream.read(limit + 1)
    after = os.fstat(stream.fileno())
    if len(data) != before.st_size or after.st_ctime_ns != opened.st_ctime_ns or after.st_size != opened.st_size:
      raise ValueError("source_file_changed")
  return data


# ZIP名稱同時遵守POSIX相對路徑與Windows解壓別名限制。
def checked_names(names):
  seen = set()
  prefixes = {}
  for name in names:
    if not isinstance(name, str) or not name or len(name) > 4096 or any(ord(c) < 32 or c in '\\:<>"|?*' for c in name):
      raise ValueError("archive_name_rejected")
    parts = name.split("/")
    if any(p in ("", ".", "..") or p.endswith((".", " ")) or re.fullmatch(r"(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])", p.split(".")[0]) for p in parts):
      raise ValueError("archive_name_rejected")
    normalized = name.casefold()
    if normalized in seen:
      raise ValueError("archive_alias_rejected")
    seen.add(normalized)
    for i in range(1, len(parts) + 1):
      prefix = "/".join(parts[:i])
      previous = prefixes.setdefault(prefix.casefold(), prefix)
      if previous != prefix:
        raise ValueError("archive_directory_alias_rejected")
  if any("/".join(n.split("/")[:i]) in seen for n in seen for i in range(1, len(n.split("/")))):
    raise ValueError("archive_file_directory_collision")


# 發行集合的組合指紋與bt相同；不將它當簽章或ZIP hash。
def combined_digest(files):
  digest = hashlib.sha256()
  for name, data in sorted(files.items()):
    digest.update(name.encode("utf-8") + b"\0" + data + b"\0")
  return digest.hexdigest()


# 僅解析標準ZIP metadata，並在讀取成員前拒絕重複、加密與非普通成員。
def zip_index(z):
  entries = z.infolist()
  if not 0 < len(entries) <= 8192:
    raise ValueError("archive_count_rejected")
  names = []
  files = {}
  for info in entries:
    if info.orig_filename != info.filename:
      raise ValueError("archive_name_normalized")
    name = info.filename.rstrip("/") if info.is_dir() else info.filename
    names.append(name)
    mode = info.external_attr >> 16
    if info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
      raise ValueError("archive_member_rejected")
    if (stat.S_ISDIR(mode) and not info.is_dir()) or (stat.S_ISREG(mode) and info.is_dir()):
      raise ValueError("archive_member_type_mismatch")
    if info.file_size > MAX_FILE or info.compress_size > MAX_FILE:
      raise ValueError("archive_size_rejected")
    if not info.is_dir():
      files[name] = info
  # 目錄項可作祖先，檔案項不能同時是其他成員的目錄。
  seen = set()
  for name in names:
    checked_names([name])
    if name.casefold() in seen:
      raise ValueError("archive_alias_rejected")
    seen.add(name.casefold())
  checked_names(files)
  return files


# 有界成員在metadata限制及CRC通過後才交給呼叫端。
def zip_member(z, info, limit):
  if not 0 < info.file_size <= limit:
    raise ValueError("archive_size_rejected")
  with z.open(info) as stream:
    data = stream.read(limit + 1)
  if len(data) != info.file_size:
    raise ValueError("archive_size_rejected")
  return data


# PE檢查只證x64 metadata，不執行loader或聲稱Authenticode通過。
def verify_pe(data):
  if len(data) < 64 or data[:2] != b"MZ":
    raise ValueError("pe_rejected")
  offset = struct.unpack_from("<I", data, 0x3c)[0]
  if offset < 64 or offset + 26 > len(data) or data[offset:offset + 4] != b"PE\0\0" or struct.unpack_from("<H", data, offset + 4)[0] != 0x8664 or struct.unpack_from("<H", data, offset + 24)[0] != 0x20b:
    raise ValueError("pe_rejected")


# 固定兩nupkg先驗SHA512，再讀RuntimeList及完整授權；不解壓任意路徑。
def dotnet_materials(packages, pin):
  if pin["version"] != "10.0.14" or pin["rid"] != "win-x64" or [p["id"] for p in pin["packages"]] != ["Microsoft.NETCore.App.Runtime.win-x64", "Microsoft.NETCore.App.Host.win-x64"]:
    raise ValueError("dotnet_pin_rejected")
  official = {}
  notices = None
  for package in pin["packages"]:
    if package["version"] != "10.0.14":
      raise ValueError("dotnet_version_rejected")
    data = read_plain(Path(packages) / (package["id"].lower() + ".10.0.14.nupkg"), MAX_FILE)
    if base64.b64encode(hashlib.sha512(data).digest()).decode() != package["sha512"]:
      raise ValueError("dotnet_package_hash_rejected")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
      index = zip_index(z)
      licenses = {}
      for key, name in (("license", "LICENSE.DotNet.txt"), ("thirdPartyNotices", "THIRD-PARTY-NOTICES.DotNet.txt")):
        material = zip_member(z, index[package[key]["member"]], 4 * 1024 * 1024)
        if sha(material) != package[key]["sha256"]:
          raise ValueError("dotnet_license_rejected")
        licenses[name] = material
      if notices is not None and notices != licenses:
        raise ValueError("dotnet_license_mismatch")
      notices = licenses
      if "runtimeList" in package:
        listing = zip_member(z, index[package["runtimeList"]["member"]], 1024 * 1024)
        if sha(listing) != package["runtimeList"]["sha256"]:
          raise ValueError("dotnet_runtime_list_rejected")
        for entry in ET.fromstring(listing):
          member = entry.attrib["Path"]
          name = member.rsplit("/", 1)[-1]
          if name in official:
            raise ValueError("dotnet_runtime_collision")
          official[name] = zip_member(z, index[member], MAX_FILE)
  if len(official) != 187:
    raise ValueError("dotnet_runtime_count_rejected")
  return official, notices


# 驗完整194檔集合、官方bytes及自製入口契約，不把SDK輸出全盤接受。
def inspect_dotnet(staging, packages, pin, expected_digest=None):
  official, notices = dotnet_materials(packages, pin)
  custom = {PREFIX + name for name in ("Core.dll", "Windows.dll", "Windows.exe", "Windows.deps.json", "Windows.runtimeconfig.json")}
  paths = list(Path(staging).iterdir())
  if {p.name for p in paths} != custom | official.keys() | notices.keys():
    raise ValueError("dotnet_member_set_rejected")
  files = {p.name: read_plain(p, MAX_FILE) for p in paths}
  if any(files[n] != b for n, b in (official | notices).items()):
    raise ValueError("dotnet_member_bytes_rejected")
  config = json.loads(files[PREFIX + "Windows.runtimeconfig.json"])["runtimeOptions"]
  if config.get("tfm") != "net10.0" or config.get("includedFrameworks") != [{"name": "Microsoft.NETCore.App", "version": "10.0.14"}] or "framework" in config or "frameworks" in config:
    raise ValueError("dotnet_runtime_config_rejected")
  deps = json.loads(files[PREFIX + "Windows.deps.json"])
  if deps["runtimeTarget"]["name"] != ".NETCoreApp,Version=v10.0/win-x64" or set(deps["libraries"]) != {PREFIX + "Core/1.0.0", PREFIX + "Windows/1.0.0", "runtimepack.Microsoft.NETCore.App.Runtime.win-x64/10.0.14"}:
    raise ValueError("dotnet_dependencies_rejected")
  exe = files[PREFIX + "Windows.exe"]
  verify_pe(exe)
  if exe.count((PREFIX + "Windows.dll").encode() + b"\0") != 1:
    raise ValueError("dotnet_entry_rejected")
  if expected_digest is not None and combined_digest(files) != expected_digest:
    raise ValueError("dotnet_staging_hash_rejected")
  return files


# 發行目錄從已凍結bytes建立，任何既存root均拒絕且不清理失敗產物。
def write_bundle(root, files):
  checked_names(files)
  if any(name.casefold() == "integrity.json" for name in files):
    raise ValueError("manifest_self_reference")
  manifest = {"schemaVersion": 1, "files": {n: sha(b) for n, b in sorted(files.items())}}
  result = files | {"integrity.json": (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()}
  root = Path(root)
  root.mkdir(mode=0o700)
  for name, data in sorted(result.items()):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as output:
      output.write(data)
  return result


# 固定排序／時間／普通檔模式建立ZIP，並重新開啟驗完整bytes及CRC。
def write_zip(path, files):
  checked_names(files)
  with Path(path).open("xb") as output:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as z:
      for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o644) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)
  with zipfile.ZipFile(path) as z:
    if set(z.namelist()) != set(files) or z.testzip() is not None or any(z.read(n) != b for n, b in files.items()):
      raise ValueError("archive_roundtrip_rejected")
  return sha(read_plain(path, 512 * 1024 * 1024))


# 發布設定是外部輸入的唯一驗證邊界，禁止變成遠端package source或開發SDK。
def release_inputs(directory):
  directory = Path(directory)
  files = {n: read_plain(directory / n, 1024 * 1024) for n in RELEASE_FILES}
  if json.loads(files["global.json"]) != {"sdk": {"version": "10.0.113", "rollForward": "disable"}}:
    raise ValueError("release_sdk_rejected")
  config = ET.fromstring(files["NuGet.Config"])
  expected = {"packageSources": ("receiver-native-local", "../local-feed"), "auditSources": ("nuget-audit", "https://api.nuget.org/v3/index.json")}
  if config.tag != "configuration" or config.attrib or [e.tag for e in config] != ["packageSources", "auditSources", "fallbackPackageFolders"]:
    raise ValueError("release_sources_rejected")
  for section, pair in expected.items():
    elements = list(config.find(section))
    if len(elements) != 2 or elements[0].tag != "clear" or elements[0].attrib or elements[1].tag != "add" or elements[1].attrib != {"key": pair[0], "value": pair[1]}:
      raise ValueError("release_sources_rejected")
  fallback = list(config.find("fallbackPackageFolders"))
  if len(fallback) != 1 or fallback[0].tag != "clear" or fallback[0].attrib:
    raise ValueError("release_sources_rejected")
  for kind in ("Core", "Windows"):
    lock = json.loads(files[kind + "/packages.lock.json"])
    framework = {} if kind == "Core" else {"rdweb.receiver.nativesupervisor.core": {"type": "Project"}}
    if lock != {"version": 1, "dependencies": {"net10.0": framework, "net10.0/win-x64": {}}}:
      raise ValueError("release_lock_rejected")
  return files


# 明列來源closure，不遞迴打包workspace或用HEAD冒充未提交的實際原碼。
def source_snapshot(repo, release_source):
  repo, release_source = Path(repo), Path(release_source)
  original = {n: read_plain(repo / SOURCE / n, 4 * 1024 * 1024) for n in SOURCE_FILES}
  if combined_digest(original) != "f765cc24ec596054dae165c7f31c6d286db39d2dd8b09ad2a7b020230a1412fd":
    raise ValueError("original_source_hash_rejected")
  for name, data in original.items():
    if name.startswith(("Core/", "Windows/")) and name.endswith((".cs", ".csproj")):
      if read_plain(release_source / name, 4 * 1024 * 1024) != data:
        raise ValueError("release_source_mismatch")
  files = {SOURCE + "/" + n: b for n, b in original.items()}
  files.update({n: read_plain(repo / n, 4 * 1024 * 1024) for n in EXTRA_SOURCE})
  if read_plain(release_source / "Directory.Build.props", 1024 * 1024) != files["Directory.Build.props"]:
    raise ValueError("release_props_mismatch")
  for name in ("start-windows-test-receiver.ps1", "windows-host-observer-supervisor.ps1"):
    if sha(files["frontend/e2e/scripts/" + name]) != SOURCE_PINS[name]:
      raise ValueError("powershell_source_rejected")
  files.update({"rebuild-inputs/" + n: b for n, b in release_inputs(release_source).items()})
  return files


# 完整GPG狀態必須唯一對上本輪固定primary及signer；未知或壞狀態保守拒絕。
def verify_gpg_status(status, fingerprint):
  rows = []
  allowed = {"NEWSIG", "KEY_CONSIDERED", "SIG_ID", "GOODSIG", "VALIDSIG", "TRUST_UNDEFINED", "TRUST_FULLY", "TRUST_ULTIMATE", "TRUST_MARGINAL"}
  for line in status.splitlines():
    if not line.startswith("[GNUPG:] "):
      raise ValueError("gpg_status_rejected")
    row = line[9:].split()
    if not row or row[0] not in allowed:
      raise ValueError("gpg_status_rejected")
    rows.append(row)
  good = [r for r in rows if r[0] == "GOODSIG"]
  valid = [r for r in rows if r[0] == "VALIDSIG"]
  if len(good) != 1 or len(valid) != 1 or len(good[0]) < 2 or good[0][1] != fingerprint[-16:]:
    raise ValueError("gpg_signature_rejected")
  value = valid[0]
  if len(value) != 11 or value[1] != fingerprint or value[10] != fingerprint or value[8] not in ("8", "9", "10", "11"):
    raise ValueError("gpg_signature_rejected")


# Node archive完整hash先於ZIP解析；只回兩個已獨立pin驗證的成員。
def inspect_node_archive(data, pin):
  if not 0 < len(data) <= MAX_FILE or sha(data) != pin["archiveSha256"]:
    raise ValueError("node_archive_hash_rejected")
  prefix = "node-" + pin["version"] + "-" + pin["arch"] + "/"
  with zipfile.ZipFile(io.BytesIO(data)) as z:
    index = zip_index(z)
    if any(not info.filename.startswith(prefix) for info in z.infolist()):
      raise ValueError("node_archive_root_rejected")
    files = {}
    for member, name, key, limit in (("node.exe", "node.exe", "nodeExeSha256", MAX_FILE), ("LICENSE", "LICENSE.Node.txt", "licenseSha256", 4 * 1024 * 1024)):
      material = zip_member(z, index[prefix + member], limit)
      if sha(material) != pin[key]:
        raise ValueError("node_member_hash_rejected")
      files[name] = material
  verify_pe(files["node.exe"])
  return files


# 固定來源不接受HTTP重新導向，避免核准四URL外的隱含取得。
class NoRedirect(urllib.request.HTTPRedirectHandler):
  # 轉址一律當成取得失敗，不更換host或擴大下載範圍。
  def redirect_request(self, req, fp, code, msg, headers, newurl):
    raise ValueError("download_redirect_rejected")


# 一次HTTP取得受大小及共同deadline限制，部分下載與空失敗檔保留。
def download_once(url, path, limit, opener=None):
  if not url.startswith(("https://nodejs.org/", "https://raw.githubusercontent.com/nodejs/release-keys/")):
    raise ValueError("download_url_rejected")
  opener = opener or urllib.request.build_opener(NoRedirect())
  deadline = time.monotonic() + 120
  with Path(path).open("xb") as output:
    with opener.open(url, timeout=120) as response:
      if response.status != 200:
        raise ValueError("download_status_rejected")
      content_length = response.headers.get("Content-Length")
      if content_length is not None and (not content_length.isdecimal() or not 0 < int(content_length) <= limit):
        raise ValueError("download_size_rejected")
      length = 0
      while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
          raise ValueError("download_deadline")
        # urllib標準HTTPS回應以同一socket剩餘時間讀取；fake HTTP不用socket。
        if isinstance(response, http.client.HTTPResponse) and response.fp is not None:
          response.fp.raw._sock.settimeout(remaining)
        block = response.read1(min(65536, limit - length + 1))
        if time.monotonic() >= deadline:
          raise ValueError("download_deadline")
        if not block:
          break
        length += len(block)
        if length > limit:
          raise ValueError("download_size_rejected")
        output.write(block)
      if length == 0 or (content_length is not None and length != int(content_length)):
        raise ValueError("download_incomplete")


# 外部工具只回RAM結果，失敗不輸出任意原生錯誤或重試。
def run_process(args, **kwargs):
  return subprocess.run(args, capture_output=True, text=True, timeout=120, **kwargs)


# 四個固定公開來源各一次；隔離keyring不讀寫使用者ownertrust或自動取key。
def acquire_node(root, pin, runner=run_process):
  root = Path(root)
  downloads = root / "downloads"
  downloads.mkdir(mode=0o700)
  home = root / "gpg-home"
  home.mkdir(mode=0o700)
  base = "https://nodejs.org/dist/v24.22.1/"
  key = pin["trust"]["fingerprint"]
  expected_key = "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356"
  key_url = "https://github.com/nodejs/release-keys/blob/481637f813e912c4aa3622d7964ab426c97b8e8d/keys/" + expected_key + ".asc"
  if pin["version"] != "v24.22.1" or pin["arch"] != "win-x64" or pin["archiveUrl"] != base + "node-v24.22.1-win-x64.zip" or pin["checksumsUrl"] != base + "SHASUMS256.txt" or pin["signatureUrl"] != base + "SHASUMS256.txt.sig" or key != expected_key or pin["trust"]["sourceUrl"] != key_url or pin["trust"]["verifier"] != "/usr/bin/gpg":
    raise ValueError("node_pin_rejected")
  for field, name, limit in (("archiveUrl", "node.zip", MAX_FILE), ("checksumsUrl", "SHASUMS256.txt", 1024 * 1024), ("signatureUrl", "SHASUMS256.txt.sig", 65536)):
    download_once(pin[field], downloads / name, limit)
  download_once(key_url.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/"), downloads / "release-key.asc", 1024 * 1024)
  command = ["/usr/bin/gpg", "--no-options", "--homedir", str(home), "--no-autostart", "--no-auto-key-retrieve", "--batch"]
  shown = runner(command + ["--with-colons", "--show-keys", str(downloads / "release-key.asc")])
  if shown.returncode != 0:
    raise ValueError("gpg_key_rejected")
  rows = [r.split(":") for r in shown.stdout.splitlines()]
  primary = []
  awaiting = False
  for row in rows:
    if row[0] == "pub":
      awaiting = True
    elif row[0] == "fpr" and awaiting:
      if len(row) <= 9:
        raise ValueError("gpg_key_rejected")
      primary.append(row[9])
      awaiting = False
  if primary != [key] or sum(r[0] == "pub" for r in rows) != 1:
    raise ValueError("gpg_key_rejected")
  imported = runner(command + ["--import", str(downloads / "release-key.asc")])
  if imported.returncode != 0:
    raise ValueError("gpg_import_rejected")
  verified = runner(command + ["--status-fd", "1", "--verify", str(downloads / "SHASUMS256.txt.sig"), str(downloads / "SHASUMS256.txt")])
  if verified.returncode != 0:
    raise ValueError("gpg_verify_rejected")
  verify_gpg_status(verified.stdout, key)
  checksum = read_plain(downloads / "SHASUMS256.txt", 1024 * 1024).decode("ascii")
  matches = []
  for line in checksum.splitlines():
    match = re.fullmatch(r"([0-9a-f]{64}) [ *](\S+)", line)
    if not match:
      raise ValueError("node_checksum_rejected")
    if match[2] == "node-v24.22.1-win-x64.zip":
      matches.append(match[1])
  if matches != [pin["archiveSha256"]]:
    raise ValueError("node_checksum_rejected")
  return inspect_node_archive(read_plain(downloads / "node.zip", MAX_FILE), pin)


# 真還原結果必須只有兩個精確PackageDownload及原NETCore引用，才可進publish。
def inspect_restore(output, pin):
  output = Path(output)
  downloads = [{"name": "Microsoft.NETCore.App.Host.win-x64", "version": "[10.0.14, 10.0.14]"}, {"name": "Microsoft.NETCore.App.Runtime.win-x64", "version": "[10.0.14, 10.0.14]"}]
  for kind in ("Core", "Windows"):
    name = PREFIX + kind
    obj = output / "artifacts/obj" / name
    assets = json.loads(read_plain(obj / "project.assets.json", 4 * 1024 * 1024))
    dgspec = json.loads(read_plain(obj / (name + ".csproj.nuget.dgspec.json"), 4 * 1024 * 1024))
    if assets.get("logs") or any(v.get("type") != "project" for v in assets["libraries"].values()) or not dgspec["projects"]:
      raise ValueError("restore_dependencies_rejected")
    for project in [assets["project"], *dgspec["projects"].values()]:
      framework = project["frameworks"]["net10.0"]
      restore = project["restore"]
      if framework["frameworkReferences"] != {"Microsoft.NETCore.App": {"privateAssets": "all"}} or framework["downloadDependencies"] != downloads or set(restore["sources"]) != {str(output / "local-feed")} or restore["restoreAuditProperties"] != {"enableAudit": "true", "auditLevel": "low", "auditMode": "all"}:
        raise ValueError("restore_graph_rejected")
  expected = {p["id"].lower() for p in pin["packages"]}
  if {p.name for p in (output / "packages").iterdir()} != expected:
    raise ValueError("restore_packages_rejected")
  for package in pin["packages"]:
    base = output / "packages" / package["id"].lower()
    if {p.name for p in base.iterdir() if p.is_dir()} != {"10.0.14"}:
      raise ValueError("restore_package_version_rejected")
    data = read_plain(base / "10.0.14" / (package["id"].lower() + ".10.0.14.nupkg"), MAX_FILE)
    if base64.b64encode(hashlib.sha512(data).digest()).decode() != package["sha512"]:
      raise ValueError("restore_package_hash_rejected")


# 重建僅從來源包發布locks及明確兩包開始；本批測試只替換SDK process邊界。
def rebuild(repo, packages, output, runner=run_process):
  repo, packages, output = Path(repo).absolute(), Path(packages).absolute(), Path(output).absolute()
  inputs = release_inputs(repo / "rebuild-inputs")
  pin = json.loads(read_plain(repo / SOURCE / "dotnet-runtime-pin.json", 1024 * 1024))
  _, notices = dotnet_materials(packages, pin)
  output.mkdir(mode=0o700)
  source = output / "source"
  source.mkdir()
  feed = output / "local-feed"
  feed.mkdir()
  for name in SOURCE_FILES:
    if name.startswith(("Core/", "Windows/")) and name.endswith((".cs", ".csproj")):
      path = source / name
      path.parent.mkdir(exist_ok=True)
      with path.open("xb") as stream:
        stream.write(read_plain(repo / SOURCE / name, 4 * 1024 * 1024))
  for name, data in inputs.items():
    path = source / name
    path.parent.mkdir(exist_ok=True)
    with path.open("xb") as stream:
      stream.write(data)
  (source / "Directory.Build.props").write_bytes(read_plain(repo / "Directory.Build.props", 1024 * 1024))
  for package in pin["packages"]:
    name = package["id"].lower() + ".10.0.14.nupkg"
    with (feed / name).open("xb") as stream:
      stream.write(read_plain(packages / name, MAX_FILE))
  env = {k: v for k, v in os.environ.items() if not k.startswith(("DOTNET_", "NUGET_", "MSBUILD"))}
  env.update(DOTNET_CLI_HOME=str(output / "cli-home"), NUGET_PACKAGES=str(output / "packages"), NUGET_HTTP_CACHE_PATH=str(output / "http-cache"), DOTNET_SKIP_FIRST_TIME_EXPERIENCE="1", DOTNET_CLI_TELEMETRY_OPTOUT="1", DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE="true", DOTNET_GENERATE_ASPNET_CERTIFICATE="false", DOTNET_ADD_GLOBAL_TOOLS_TO_PATH="false", DOTNET_NOLOGO="1")
  version = runner(["dotnet", "--version"], cwd=source, env=env)
  if version.returncode != 0 or version.stdout.strip() != "10.0.113":
    raise ValueError("rebuild_sdk_rejected")
  properties = ["-p:" + item for item in ("Configuration=Release", "RuntimeIdentifier=win-x64", "SelfContained=true", "UseAppHost=true", "RuntimeFrameworkVersion=10.0.14", "PublishAot=false", "PublishTrimmed=false", "PublishSingleFile=false", "PublishReadyToRun=false", "DebugType=None", "DebugSymbols=false", "ArtifactsPath=" + str(output / "artifacts"), "UseArtifactsOutput=true", "UseSharedCompilation=false", "DisableTransitiveFrameworkReferenceDownloads=true")]
  project = "Windows/" + PREFIX + "Windows.csproj"
  restored = runner(["dotnet", "restore", project, "--locked-mode", "--configfile", str(source / "NuGet.Config"), *properties], cwd=source, env=env)
  if restored.returncode != 0:
    raise ValueError("rebuild_restore_rejected")
  for kind in ("Core", "Windows"):
    if read_plain(source / kind / "packages.lock.json", 1024 * 1024) != inputs[kind + "/packages.lock.json"]:
      raise ValueError("rebuild_lock_changed")
  inspect_restore(output, pin)
  stage = output / "staging"
  published = runner(["dotnet", "publish", project, "-c", "Release", "-r", "win-x64", "--self-contained", "true", "--no-restore", "-o", str(stage), *properties], cwd=source, env=env)
  if published.returncode != 0:
    raise ValueError("rebuild_publish_rejected")
  for name, data in notices.items():
    with (stage / name).open("xb") as stream:
      stream.write(data)
  inspect_dotnet(stage, feed, pin)
  for kind in ("Core", "Windows"):
    if read_plain(source / kind / "packages.lock.json", 1024 * 1024) != inputs[kind + "/packages.lock.json"]:
      raise ValueError("rebuild_lock_changed")
  return stage


# 封裝只消費凍結來源及已驗staging；此路徑不呼SDK或任何Windows binary。
def pack(repo, staging, packages, release_source, output, expected_digest=None, node_acquirer=acquire_node):
  repo, output = Path(repo).absolute(), Path(output).absolute()
  output.mkdir(mode=0o700)
  source = source_snapshot(repo, release_source)
  pin = json.loads(source[SOURCE + "/dotnet-runtime-pin.json"])
  dotnet = inspect_dotnet(staging, packages, pin, expected_digest)
  node_pin = json.loads(source["frontend/e2e/receiver/node-runtime-pin.json"])
  node = node_acquirer(output, node_pin)
  if set(node) != {"node.exe", "LICENSE.Node.txt"}:
    raise ValueError("node_materials_rejected")
  files = dotnet | node | {
    "start-windows-test-receiver.ps1": source["frontend/e2e/scripts/start-windows-test-receiver.ps1"],
    "windows-host-observer-supervisor.ps1": source["frontend/e2e/scripts/windows-host-observer-supervisor.ps1"],
    "receiver-native-child.ps1": source[SOURCE + "/Fixtures/receiver-native-child.ps1"],
    "PUBLIC 空格 繁體/receiver-native-case.mjs": source[SOURCE + "/Fixtures/PUBLIC 空格 繁體/receiver-native-case.mjs"],
    "LICENSE": source["LICENSE"], "THIRD_PARTY_NOTICES.md": source["THIRD_PARTY_NOTICES.md"],
    "README.md": source[SOURCE + "/README.md"],
  }
  for name, digest in SOURCE_PINS.items():
    if sha(files[name]) != digest:
      raise ValueError("compiled_source_pin_rejected")
  if len(files) != 203 or len(source) != 55:
    raise ValueError("package_member_set_rejected")
  binary = write_bundle(output / "package", files)
  corresponding = write_bundle(output / "corresponding-source", source)
  archives = output / "archives"
  archives.mkdir()
  return {
    "receiver-native-supervisor-win-x64.zip": write_zip(archives / "receiver-native-supervisor-win-x64.zip", binary),
    "receiver-native-supervisor-corresponding-source.zip": write_zip(archives / "receiver-native-supervisor-corresponding-source.zip", corresponding),
  }


# CLI明確分開pack與需要另行SDK／audit授權的rebuild，不提供執行／部署功能。
def main(argv=None):
  parser = argparse.ArgumentParser(description="封裝獨立監督程式；不執行Windows或部署")
  sub = parser.add_subparsers(dest="command", required=True)
  for command in ("pack", "rebuild"):
    child = sub.add_parser(command)
    child.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    child.add_argument("--packages", type=Path, required=True)
    child.add_argument("--output", type=Path, required=True)
    if command == "pack":
      child.add_argument("--staging", type=Path, required=True)
      child.add_argument("--release-source", type=Path, required=True)
      child.add_argument("--expected-staging-sha256")
  args = parser.parse_args(argv)
  try:
    if args.command == "rebuild":
      rebuild(args.repo, args.packages, args.output)
      print("receiver_native_rebuild_staged,windowsExecuted=false")
    else:
      if args.expected_staging_sha256 is not None and not re.fullmatch(r"[0-9a-f]{64}", args.expected_staging_sha256):
        raise ValueError("staging_digest_rejected")
      result = pack(args.repo, args.staging, args.packages, args.release_source, args.output, args.expected_staging_sha256)
      for name, digest in result.items():
        print(digest + "  " + name)
  except (OSError, ValueError, KeyError, zipfile.BadZipFile, ET.ParseError, subprocess.SubprocessError) as error:
    code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[a-z_]+", str(error)) else "receiver_native_package_unavailable"
    print(code, file=sys.stderr)
    return 2
  return 0


if __name__ == "__main__":
  sys.exit(main())
