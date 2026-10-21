# Windows-only公開契約；不讀記事本／剪貼簿、不變更安全政策，尚需操作者原生執行。
$ErrorActionPreference = 'Stop'
try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5) { throw 'guard' }
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-host-observer-native.cs') -ErrorAction Stop
    # 真5.1 parser校準，不能用Linux regex檢查代替。
    $tokens=$null; $errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-host-observer.ps1'),[ref]$tokens,[ref]$errors)
    if ($errors.Count -ne 0) { throw 'guard' }
    if (-not [HostObserverNative]::IsSafeText('Public 中文',32768) -or [HostObserverNative]::IsSafeText("Public`0bad",32768)) { throw 'guard' }
    $pair=[HostObserverNative]::CompareText('Public same','Public same','Public same','Public expected',$true,$true)
    if ($pair.EditorExact -or $pair.ClipboardExact -or $pair.ClipboardMatchesEditor -ne $true) { throw 'guard' }
    $bytes = [Text.Encoding]::UTF8.GetBytes("public_frame`n")
    $stream = New-Object IO.MemoryStream -ArgumentList (, $bytes)
    try { if ([HostObserverNative]::ReadFrame($stream, 1000) -cne 'public_frame') { throw 'guard' } }
    finally { $stream.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
    $oversized = $false
    $bytes = [Text.Encoding]::UTF8.GetBytes(('A' * 8193) + "`n")
    $stream = New-Object IO.MemoryStream -ArgumentList (, $bytes)
    try { [void][HostObserverNative]::ReadFrame($stream, 1000) } catch { $oversized = $true }
    finally { $stream.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
    if (-not $oversized) { throw 'guard' }
    # listener只收通知metadata，不讀clipboard內容／寫剪貼簿或取得焦點。
    $listener=New-Object HostObserverNative
    try { if (-not $listener.Ready) { throw 'guard' } }
    finally { if (-not $listener.Stop()) { throw 'guard' } }
    [Console]::WriteLine('host_core_listener_contracts_observed,liveTextQueries=false')
} catch { [Console]::WriteLine('host_pipe_contracts_unavailable,windowsNative=false'); exit 2 }
