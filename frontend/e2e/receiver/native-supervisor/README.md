# Windows 獨立接收器函數診斷包

這是專用的原生程序／輸出／退出碼診斷工具，不是 RustDesk 接收器可攜包，也不是遠端控制服務。它透過 **.NET 10 → 系統 Windows PowerShell 5.1 → 包內 Node** 呼叫既有 `Invoke-ReceiverChild`，只使用固定公開七案；不啟動接收器 main、不建立 RustDesk 連線、不讀取真實剪貼簿或要求密碼。

**目前僅提供封裝與靜態核對；附重建流程，實際 SDK 重建未驗證。** Windows loader／冷啟動、PS5.1 parser／七案／政策 finally、NTFS／SID／DACL、Job／pipe 與取消故障尚未完成原生驗收。Linux 公開 fixtures 或自製 DLL 的建置成功不代表以上項目通過，也不保證整個 OS 啟動能在 20 秒內返回。

## 交付物與完整性

- `receiver-native-supervisor-win-x64.zip`：204 個檔案，包含 .NET self-contained 多檔輸出、固定 Node／PS／wrapper／公開 fixture、完整授權及 `integrity.json`。
- `receiver-native-supervisor-corresponding-source.zip`：這一份診斷包實際使用的自製來源、建置控制檔、測試與發布 locks；不是 `git archive HEAD`，不冒稱已提交或公開 release。

搬運前必須從另行可信的交接管道取得**兩個 ZIP 各自的 SHA-256**，先核對下載 bytes，再解壓到全新隔離目錄。包內 `integrity.json` 的 `schemaVersion` 為 1，`files` 列出除它自己以外的全部相對路徑與 SHA-256；核對時須同時拒絕缺檔、多檔、變更 bytes、大小寫別名與非普通檔案。清單不是簽章，不能用同一個尚未受信任的 ZIP 內清單替自己背書。

二進位包根目錄直接放 `RdWeb.Receiver.NativeSupervisor.Windows.exe` 與相鄰 .NET 成員、`node.exe`、原兩份 PS 及 `receiver-native-child.ps1`；公開 Node 案例固定放在 `PUBLIC 空格 繁體/receiver-native-case.mjs`。不要搬動、轉碼、改名、替換來源或從舊包補檔。包內故意沒有 `receiver.mjs`、binding／connection 設定、node_modules、開發 SDK、PDB、秘密與 `native-probe.claim`。

## Windows 使用前置：必須另外授權

**取得或解壓本包不是執行許可。** 不直接雙擊 EXE／PS、不重播舊輪、不自行清理 claim 或調整政策／ACL／MOTW。

未來每次原生操作須先確認 Microsoft 支援 .NET 10 的 Windows x64、系統 Windows PowerShell 5.1／Desktop／STA／FullLanguage、非提升身份與全新私有固定 NTFS 目錄。self-contained 只附 .NET 程序資源，不附 Windows／系統 PowerShell 或所有 OS 原生前置。ZIP 不保存可當成可信證據的 Windows DACL；外部 ZIP／成員核對、目錄 SID／protected DACL 與普通祖先前置仍須另作部署確認。

監督程式只接受 `--receiver-native-cases-v1`，只以 `AppContext.BaseDirectory` 定位包根，不接受 root／exe／script／command 或案例參數。來源守衛通過後，建立 run 才 exclusive 建立零 bytes 的 `native-probe.claim`；一旦建立即消耗，失敗也不刪除、重設或自動重試。它不是可重複執行的一般測試 runner。

父程序不改 PowerShell 政策；wrapper 只在另獲許可的自有 PS child 內暫用 Process RemoteSigned，並於 finally 嘗試還原／回驗。強殺不能保證 finally 執行。不要使用 Bypass、Unblock-File、持久政策變更或改父終端環境繞過拒絕。

結果只有既有固定 v3 兩行終態；observed／defect／unavailable 對應 exit 0／1／2。完整輸出、真退出碼、期限與資源證據必須一起核對，不能靠 marker、port healthy 或 exit 0 單獨判成功。新輪的精確 root、政策／程序／claim 許可及接受條件須由操作者另外確認。

## 診斷基線候選入口（未發布）

`Baseline/RdWeb.Receiver.NativeBaseline.Windows.csproj` 是獨立候選入口，只接受 `--receiver-native-baseline-v1`。它保持原 CreateProcess 旗標、系統 PS5.1、原 `Invoke-ReceiverChild` 及固定七案；不加入 `CREATE_NO_WINDOW`、不更換終端或直接由 .NET 啟 Node。原入口仍只接受 `--receiver-native-cases-v1`。

基線使用獨立 `receiver-native-baseline-child.ps1`／編譯 pins 與 `receiver_native_baseline_child_v1` purpose，輸出原 v3 兩行後再加 `receiver_native_baseline_observation,` 的固定 17 鍵觀察行。觀察只有首問題案、ref／raw 型別和值的安全分類、公開輸出是否符合及首次取消檢查快照；不輸出內容、原生錯誤文字或程序識別。未知值不推成成功；`io_failed` 加真 PS exit2 即使能採信診斷，也不能補成 Core 的案例、退出或政策成功證據。原 exit0／1／2 分類不變。

基線來源 factory 只向自有 PS child 提供固定 `PATHEXT=.EXE`，另保留 `PSModulePath`、`RDWEB_NATIVE_PROBE_ROOT`、`SystemRoot`、`WINDIR` 四個原有值；不繼承呼叫端環境、不加入其他副檔名或 PATH／TEMP／USERPROFILE／COMSPEC。一般 probe 仍只提供原四變數，不隨基線候選改變。這是啟動配置差異，不代表 child 內環境已獨立量測或 Windows 原生驗證已完成。

**這個候選未發布，也未完成 PS5.1／Windows 原生驗證。** 舊兩行 collector 不相容；新三行資料須由專用 consumer 核對，之後的外層四行 collector 仍待另行準備。builder 提供固定的 `rebuild-baseline`／`pack-baseline` 候選子命令；下述原 `rebuild`／`pack` 不會自動切換模式。不可將開發 build 當作 Windows self-contained 包，也不可用舊 ZIP／hash 替新來源背書。基線 SDK 固定 10.0.114，發布維持 runtime 10.0.14／Node 24.22.1 及原授權要求。

### 基線發布工具的分界

- `rebuild-baseline` 固定使用 Baseline project；參數為 repo／packages／output 及必填 `--dotnet`，沒有任意 entry／profile。SDK 入口必須是絕對路徑的普通、非 symlink、可執行檔，不自動下載 SDK，也不回落 PATH 的系統 dotnet。version／restore／publish 均使用同一入口，僅接受 SDK 10.0.114。需要正式三 project 的發布 locks、固定 SDK 10.0.114／rollForward=disable 的 global.json 與 local-feed／audit 設定；開發 locks 不可替代。來源包的 `rebuild-inputs` 只保存發布控制檔，編譯原碼仍從其原目錄按明列清單凍結。
- SDK 原始輸出保留在 `raw-publish/`，只接受契約明列的 195／197／198 檔組合；存在的 Windows companion 也必須驗證。通過後另建固定 195 檔的 `staging/`，只交付 Baseline apphost、三份自製 DLL、Baseline deps／runtimeconfig 與原官方 runtime／完整授權。未知檔拒絕，不自動刪除來修布局。這些是工具接受契約，不是已驗證的真 SDK 發布布局。
- `pack-baseline` 只接受 canonical staging，另需 release-source／可選 expected-staging-sha256。來源、發布 source 的精確成員與 bytes、wrapper pins、staging 全部先驗，才取得固定 Node 材料；不接受 raw 輸出、不補舊包缺檔。發布 source 若多出隱含編譯檔或 build targets 也拒絕。
- 新產物名固定為 `receiver-native-baseline-win-x64.zip` 與 `receiver-native-baseline-corresponding-source.zip`；契約含 manifest 分別為 205／71 檔。來源清單包含全部相依 C#、wrapper、公開測試、工具、授權與發布控制檔，不以 Git HEAD 或包內 manifest 替 workspace bytes 背書。
- 原模式保留原來源凍結摘要，因此不接受 cj 修改後的共享來源；不得更新舊摘要來把新來源追認為舊包。新模式使用獨立來源摘要及檔名，原兩 ZIP 不覆寫。

上述工具只有公開假 SDK／下載邊界驗證；正式發布 locks 生成、真 self-contained publish、Node 取得／GPG、交付 ZIP 與來源重建仍須另外授權並驗證。公開假 PE／nupkg／ZIP fixtures 不可交付，工具通過也不是 Windows 執行許可。

基線重建範例（須先備妥三 project 發布 locks，並另獲 SDK／audit 操作許可）：

```sh
python3 -B frontend/scripts/build_receiver_native_supervisor.py rebuild-baseline \
  --repo "$PWD" \
  --dotnet /approved/isolated-sdk/dotnet \
  --packages /approved/new-dotnet-feed \
  --output /approved/new-baseline-rebuild
```

工具以入口父目錄設定子程序的 `DOTNET_ROOT`／`DOTNET_ROOT_X64`，並以同一入口設定 `DOTNET_HOST_PATH`；不改持久 PATH／系統 SDK。入口與版本檢查不能代替 SDK 來源、完整性、安全更新及宿主相容性核對，目錄隔離也不是沙箱。

發布、封裝、搬運與任何新 Windows 啟動均須另外授權；不重用或清除舊 claim、不重播舊輪，現有包與歷史結果保留。目錄隔離不是沙箱，新增觀察也不代表已確認或修復 ch 失敗的根因。

## 來源與授權

自製監督程式、原 PS、公開 fixture 與建置工具沿根 `LICENSE` 的 **AGPL-3.0-or-later**；應與本次確切的完整對應來源 ZIP 一起交付，保留版權與適用條款，不以未提交 workspace 的位置或某個舊 commit 取代來源。

- .NET runtime／apphost：`Microsoft.NETCore.App.Runtime.win-x64`／`Microsoft.NETCore.App.Host.win-x64` **10.0.14**。固定 URL、SHA-512、真實上游 revision 及原文授權 hashes 見來源包 `frontend/e2e/receiver/native-supervisor/dotnet-runtime-pin.json`。二進位包保留完整 `LICENSE.DotNet.txt`／`THIRD-PARTY-NOTICES.DotNet.txt`。
- Node：官方 **v24.22.1 win-x64**，固定 URL、archive／exe／完整 LICENSE hashes 與 release key 見 `frontend/e2e/receiver/node-runtime-pin.json`。二進位包 `LICENSE.Node.txt` 保留 Node 與所有內含第三方條款，不只是 MIT 摘要。官方對應來源為 <https://github.com/nodejs/node/tree/v24.22.1>。
- 本包不含 receiver bundle、TweetNaCl／protobuf.js／Long、RustDesk 生成 schema 或影像素材；根 `THIRD_PARTY_NOTICES.md` 的其他產品聲明仍保留，但不表示那些成員被加進本包。

官方 Node 簽章與 .NET 來源 pins 不替自製程式／ZIP 背書；checksum、選版與當次驗簽亦不表示版本沒有漏洞，或已通過 Windows Authenticode／revocation 驗收。

## Linux 建置與重建

需要已安裝 Python 3.10 以上、`/usr/bin/gpg`；原 `rebuild` 契約維持 **.NET SDK 10.0.113**，`rebuild-baseline` 則需 **10.0.114** 的明確絕對入口及相應 targeting packs。工具不安裝任何依賴。保留原契約不是建議執行未處置安全問題的 SDK／宿主；兩模式都須先核對當前安全修補、來源與宿主相容性，另獲執行及必要網路授權。以下原模式範例從解壓後的**對應來源包根目錄**執行，路徑例子須換成此次明確核准的位置。

### 1. 取得並核對兩個 .NET 原包

將以下兩個原始 nupkg 放入一個新目錄，檔名保持 URL 的 basename；不得用其他 runtime／版本或舊解包內容替代：

- <https://api.nuget.org/v3-flatcontainer/microsoft.netcore.app.runtime.win-x64/10.0.14/microsoft.netcore.app.runtime.win-x64.10.0.14.nupkg>
- <https://api.nuget.org/v3-flatcontainer/microsoft.netcore.app.host.win-x64/10.0.14/microsoft.netcore.app.host.win-x64.10.0.14.nupkg>

用來源包 `dotnet-runtime-pin.json` 的每包 Base64 SHA-512 核對完整下載，再使用工具；工具會重新驗證原包、RuntimeList 與完整授權，不從 Internet 補第三包。取得原包及後續 NuGet audit／預設簽章信任鏈查詢皆須先獲相應網路許可。

### 2. 重建 .NET staging（另需 SDK／audit 操作許可）

```sh
python3 -B frontend/scripts/build_receiver_native_supervisor.py rebuild \
  --repo "$PWD" \
  --packages /approved/new-dotnet-feed \
  --output /approved/new-native-rebuild
```

output 必須不存在，父目錄須已準備；既存即拒絕。來源包 `rebuild-inputs/` 保存發布用固定 SDK global.json、local-feed NuGet.Config 與兩個發布 locks；原 `Core`／`Windows` 的開發 locks 保持原樣，不用它們代替發布圖。工具只將原碼、props 及發布控制檔複製到新 `source/`，所有 caches／artifacts 均隔離。

實際流程為 SDK version gate → 一次 locked restore → 真 assets／dgspec／兩包 gate → 一次 no-restore publish → 完整 194 檔靜態核對。Release、win-x64、SelfContained／UseAppHost=true、RuntimeFrameworkVersion=10.0.14、DisableTransitiveFrameworkReferenceDownloads=true、AOT／trimming／single-file／ReadyToRun=false、DebugType=None／DebugSymbols=false 及獨立 ArtifactsPath 等參數由工具固定；audit／warnings／預設簽章檢查不降低，不重新生成 lock。

**實際 SDK 重建未驗證**；此子命令目前只有公開 fixtures／fake SDK runner 控制流程測試。新建置的五個自製輸出不保證跨路徑／工具環境逐 byte 相同；187 個官方 runtime 成員、完整原文授權與固定受測來源 pins 不得變更。

### 3. 封裝（會重新下載並驗簽 Node，不會啟 SDK）

```sh
python3 -B frontend/scripts/build_receiver_native_supervisor.py pack \
  --repo "$PWD" \
  --staging /approved/new-native-rebuild/staging \
  --release-source /approved/new-native-rebuild/source \
  --packages /approved/new-dotnet-feed \
  --output /approved/new-native-package
```

工具先凍結明列的自製來源及發布控制檔，驗 staging 與原包；接著只取得 pin 所列 Node archive、SHASUMS256.txt、簽章及同固定 commit 的 release key。每來源最多一次，無 redirect／自動重試；四個下載及失敗部分檔均保留。用新 `gpg-home` 核對唯一完整 primary fingerprint、GOODSIG／完整 VALIDSIG signer／primary，再核 checksum、archive、node.exe、完整 LICENSE 與 x64 PE；不讀寫全域 keyring／ownertrust、不自動換 key。

成功後 output 內含 `package/`、`corresponding-source/` 及 `archives/` 的兩個固定名稱 ZIP，stdout 只交兩個 ZIP 的 SHA-256。它們必須由可信交接管道另送給接收者。工具不執行 Node／PS／Windows EXE，不產生 claim；任一失敗均保留本次 root，不清理、不重試、不換 root 自救。

初次沿既有已驗 staging 組包時可額外傳 `--expected-staging-sha256` 作那次的整組 bytes gate；此值不是通用重建 hash，也不是 ZIP SHA-256。

### 公開工具測試

```sh
python3 -B frontend/e2e/scripts/test_build_receiver_native_supervisor.py
```

只使用公開 bytes、小 ZIP、不可執行 PE、假 HTTP／GPG／SDK 邊界與新自有 tmp；不下載或啟動 Windows。此測試不等於真 SDK 重建、Windows 原生七案或 RustDesk 互通驗收。
