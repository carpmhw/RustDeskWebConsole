# Windows-only公開契約測試；只建立本次自有tmp與fake child，不開socket／不改政策。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = $DebugPreference = $WarningPreference = $InformationPreference = 'SilentlyContinue'
$root = $null
$exitCode = 2

# 只以固定失敗結束，不輸出ErrorRecord、路徑、exception或child原文。
function Assert-Test([bool]$Value) { if (-not $Value) { throw 'receiver_entry_test_failed' } }

# 必須確實拒絕；無例外或原生錯誤都不得誤當通過。
function Assert-Rejected([scriptblock]$Action) {
    $failed = $false
    try { [void](& $Action) } catch { $failed = $true }
    Assert-Test $failed
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'receiver_entry_test_failed' }
    # dot-source只載入函數與既有guard，不執行main／Node／TTY。
    . (Join-Path $PSScriptRoot 'start-windows-test-receiver.ps1')
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try { $owner = $identity.User } finally { $identity.Dispose() }
    $root = Join-Path ([IO.Path]::GetTempPath()) ('rdweb receiver public 中文 ' + [Guid]::NewGuid().ToString('N'))
    New-OwnerOnlyDirectory $root $owner
    Assert-HostPrivatePath $root $true $owner

    # 新子目錄必須owner-only並可由原guard回讀；額外Allow必須被拒絕。
    $privateRun = New-PrivateRunDirectory $root $owner
    Assert-HostPrivatePath $privateRun $true $owner
    $extraRun = New-PrivateRunDirectory $root $owner
    $extraAcl = Get-Acl -LiteralPath $extraRun
    $users = New-Object Security.Principal.SecurityIdentifier -ArgumentList 'S-1-5-32-545'
    $allow = New-Object Security.AccessControl.FileSystemAccessRule -ArgumentList $users, ([Security.AccessControl.FileSystemRights]::Read), ([Security.AccessControl.AccessControlType]::Allow)
    $extraAcl.AddAccessRule($allow)
    Set-Acl -LiteralPath $extraRun -AclObject $extraAcl
    Assert-Rejected { Assert-HostPrivatePath $extraRun $true $owner }

    # 本機設定先驗大小與CreateNew；過大、缺少或既有目的地都不得覆寫。
    $utf8 = New-Object Text.UTF8Encoding -ArgumentList $false
    $source = Join-Path $root 'binding.json'
    [IO.File]::WriteAllText($source, '{"schemaVersion":1}', $utf8)
    $copyRun = New-PrivateRunDirectory $root $owner
    Copy-PrivateSetting $source (Join-Path $copyRun 'binding.json')
    Assert-Test ([IO.File]::Exists((Join-Path $copyRun 'binding.json')) -and [IO.File]::Exists($source))
    $existing = Join-Path $copyRun 'existing.json'
    [IO.File]::WriteAllText($existing, '{}', $utf8)
    Assert-Rejected { Copy-PrivateSetting $source $existing }
    Assert-Test ([IO.File]::Exists($existing))
    Assert-Test ([IO.File]::ReadAllText($existing, $utf8) -ceq '{}')
    $large = Join-Path $root 'large.json'
    [IO.File]::WriteAllBytes($large, (New-Object byte[] 8193))
    Assert-Rejected { Copy-PrivateSetting $large (Join-Path $copyRun 'large.json') }
    Assert-Test (-not [IO.File]::Exists((Join-Path $copyRun 'large.json')))
    Assert-Rejected { Copy-PrivateSetting (Join-Path $root 'missing.json') (Join-Path $copyRun 'missing.json') }

    # 安全複製不得刪來源；單次啟動由Parent的exclusive claim保護，不消耗原始設定。
    $moveSource = Join-Path $root 'connection.json'
    [IO.File]::WriteAllText($moveSource, '{"schemaVersion":1}', $utf8)
    $moveRun = New-PrivateRunDirectory $root $owner
    Copy-PrivateSetting $moveSource (Join-Path $moveRun 'connection.json')
    Assert-Test ([IO.File]::Exists($moveSource) -and [IO.File]::Exists((Join-Path $moveRun 'connection.json')))
    Claim-ReceiverLaunch $moveRun
    Assert-Rejected { Claim-ReceiverLaunch $moveRun }
    Assert-Test ([IO.File]::Exists((Join-Path $moveRun 'launch-claim.json')))

    # reparse／UNC必須在啟動前拒絕；junction只刪連結，不動自有target。
    $target = New-PrivateRunDirectory $root $owner
    $junction = Join-Path $root 'public-link'
    [void](New-Item -ItemType Junction -Path $junction -Value $target)
    try { Assert-Rejected { Assert-HostPrivatePath $junction $true $owner } }
    finally { if ([IO.Directory]::Exists($junction)) { [IO.Directory]::Delete($junction) } }
    Assert-Rejected { Assert-LocalNtfsPath '\\server\share\rdweb-receiver' }
    Assert-Rejected { Assert-RegularFile (Join-Path $root 'missing-runtime.exe') }

    # fake child只寫公開marker並回指定exit；證明空格／Unicode參數與exit code傳遞。
    $fakeRun = New-PrivateRunDirectory $root $owner
    $fake = Join-Path $fakeRun 'public fake child.ps1'
    $fakeText = @'
param([string]$Marker, [int]$ExitCode = 0)
[IO.File]::WriteAllText($Marker, 'public_receiver_fake_child', (New-Object Text.UTF8Encoding -ArgumentList $false))
exit $ExitCode
'@
    [IO.File]::WriteAllText($fake, $fakeText, $utf8)
    $marker = Join-Path $fakeRun 'public marker 中文.txt'
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $code = Invoke-ReceiverChild $powershell @('-NoProfile', '-STA', '-NonInteractive', '-File', $fake, '-Marker', $marker, '-ExitCode', '0')
    Assert-Test ($code -eq 0 -and (Get-ReceiverExitCode $code) -eq 0)
    Assert-Test ([IO.File]::ReadAllText($marker, [Text.Encoding]::UTF8) -ceq 'public_receiver_fake_child')
    $code = Invoke-ReceiverChild $powershell @('-NoProfile', '-STA', '-NonInteractive', '-File', $fake, '-Marker', $marker, '-ExitCode', '2')
    Assert-Test ($code -eq 2 -and (Get-ReceiverExitCode $code) -eq 2)
    $code = Invoke-ReceiverChild $powershell @('-NoProfile', '-STA', '-NonInteractive', '-File', $fake, '-Marker', $marker, '-ExitCode', '7')
    Assert-Test ($code -eq 7 -and (Get-ReceiverExitCode $code) -eq 2)

    # PS5.1必須能解析新入口與沿用的唯讀guard；不在測試中執行真Node或網路。
    foreach ($name in @('start-windows-test-receiver.ps1', 'test-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1')) {
        $tokens = $null
        $errors = $null
        [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name), [ref]$tokens, [ref]$errors)
        Assert-Test ($errors.Count -eq 0)
    }
    $exitCode = 0
} catch {
    $exitCode = 2
} finally {
    if ($null -ne $root) {
        try { if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) } }
        catch { $exitCode = 2 }
    }
}

# 結果只含固定marker；Windows真Node／TTY／DACL仍由Task32另輪驗證。
if ($exitCode -eq 0) { [Console]::WriteLine('receiver_entry_contracts_observed,fakeChild=true,network=false,realNode=false') }
else { [Console]::WriteLine('receiver_entry_contracts_unavailable') }
exit $exitCode
