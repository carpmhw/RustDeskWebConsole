param()
# 僅供另行授權後驗證新版函數；不啟子程序、不建立或刪除fixture，不代表TTY／OS退出碼驗收。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 只輸出固定安全失敗分類，不回顯公開替身內容或原例外。
function Assert-ExitChannel([bool]$Condition) {
    if (-not $Condition) { throw 'receiver_exit_channel_unavailable' }
}

# 公開測試替身以無尾換行寫兩個Console串流；不是native executable或真密碼提示。
function Write-ExitChannelPublicStreams {
    [Console]::Out.Write('PUBLIC_PROMPT')
    [Console]::Error.Write('PUBLIC_ERROR')
}

# 固定公開例外用於確認先設保守2，不讀取ErrorRecord或沿用舊退出碼。
function Throw-ExitChannelPublicFailure {
    throw 'PUBLIC_FAILURE'
}

try {
    if ($env:OS -cne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or
        $PSVersionTable.PSVersion.Minor -ne 1 -or $PSVersionTable.PSEdition -cne 'Desktop' -or
        ([string]$ExecutionContext.SessionState.LanguageMode) -cne 'FullLanguage') {
        throw 'receiver_exit_channel_unavailable'
    }
    . (Join-Path $PSScriptRoot 'start-windows-test-receiver.ps1')

    # cmdlet不改LASTEXITCODE，因此只驗公開合成exit與管線，並非OS退出碼。
    foreach ($raw in @(0, 1, 2, 7)) {
        $expected = $raw
        if ($raw -eq 7) { $expected = 2 }
        $LASTEXITCODE = $raw
        $code = 99
        $output = @(Invoke-ReceiverChild -NodePath 'Microsoft.PowerShell.Core\Out-Null' -Arguments @() -ExitCode ([ref]$code))
        Assert-ExitChannel ($code -is [int] -and $code -eq $expected -and $output.Count -eq 0)

        $LASTEXITCODE = $raw
        $code = 99
        $output = @(Invoke-ReceiverChild -NodePath 'Microsoft.PowerShell.Utility\Write-Output' -Arguments @('PUBLIC') -ExitCode ([ref]$code))
        Assert-ExitChannel ($code -is [int] -and $code -eq $expected -and $output.Count -eq 1 -and $output[0] -ceq 'PUBLIC')

        $LASTEXITCODE = $raw
        $code = 99
        $output = @(Invoke-ReceiverChild -NodePath 'Microsoft.PowerShell.Utility\Write-Output' -Arguments @('PUBLIC_A', 'PUBLIC_中文') -ExitCode ([ref]$code))
        Assert-ExitChannel ($code -eq $expected -and $output.Count -eq 2 -and $output[0] -ceq 'PUBLIC_A' -and $output[1] -ceq 'PUBLIC_中文')
    }

    # 未知／陣列不能取最後一項冒充exit0；原分類白名單不變。
    foreach ($bad in @($null, '0', @(0), @('PUBLIC', 0))) {
        Assert-ExitChannel ((Get-ReceiverExitCode $bad) -eq 2)
    }

    $savedOut = [Console]::Out
    $savedError = [Console]::Error
    $publicOut = [IO.StringWriter]::new()
    $publicError = [IO.StringWriter]::new()
    try {
        [Console]::SetOut($publicOut)
        [Console]::SetError($publicError)
        $LASTEXITCODE = 0
        $code = 99
        $output = @(Invoke-ReceiverChild -NodePath 'Write-ExitChannelPublicStreams' -Arguments @() -ExitCode ([ref]$code))
        Assert-ExitChannel ($code -eq 0 -and $output.Count -eq 0)
        Assert-ExitChannel ($publicOut.ToString() -ceq 'PUBLIC_PROMPT' -and $publicError.ToString() -ceq 'PUBLIC_ERROR')
    } finally {
        [Console]::SetOut($savedOut)
        [Console]::SetError($savedError)
        $publicOut.Dispose()
        $publicError.Dispose()
    }

    $code = 0
    $LASTEXITCODE = 0
    $caught = $false
    try { Invoke-ReceiverChild -NodePath 'Throw-ExitChannelPublicFailure' -Arguments @() -ExitCode ([ref]$code) }
    catch { $caught = $true }
    Assert-ExitChannel ($caught -and $code -eq 2)
    [Console]::WriteLine('receiver_exit_channel_cases_observed,syntheticExit=True,nativeExecutable=False')
    exit 0
} catch {
    [Console]::Error.WriteLine('receiver_exit_channel_cases_unavailable')
    exit 2
}
