param()
# 觀察版仍經原PS5.1函數執行七案，僅輸出封閉分類，不是修復版。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = $DebugPreference = $WarningPreference = $InformationPreference = 'SilentlyContinue'
$cases = New-Object 'Collections.Generic.List[string]'
$reason = 'guard_rejected'
$policy = 'unknown'
$resources = 'not_acquired'
$policyChecked = $false
$policyTouched = $false
$cleanupFailed = $false
$identity = $null
$comparison = '"firstProblemCase":"unknown","invocation":"unknown","refType":"unknown","refValue":"unknown","rawType":"unknown","rawValue":"unknown","outputShape":"unknown","publicOutputMatched":null'

# 只檢固定來源的基本形狀與完整bytes；原生身份／單link／ACL／持有由parent guard負責。
function Assert-ProbeSource([string]$Path, [string]$Pin, [long]$Maximum) {
    $attributes = [IO.File]::GetAttributes($Path)
    if (($attributes -band ([IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint)) -ne 0) { throw 'probe_guard_rejected' }
    $stream = $null
    $hash = $null
    try {
        $stream = New-Object IO.FileStream -ArgumentList $Path, ([IO.FileMode]::Open), ([IO.FileAccess]::Read), ([IO.FileShare]::Read)
        if ($stream.Length -le 0 -or $stream.Length -gt $Maximum) { throw 'probe_guard_rejected' }
        $hash = [Security.Cryptography.SHA256]::Create()
        $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
        if ($actual -cne $Pin) { throw 'probe_guard_rejected' }
    } finally {
        if ($null -ne $hash) {
            try { $hash.Dispose() } catch { $script:cleanupFailed = $true }
        }
        if ($null -ne $stream) {
            try { $stream.Dispose() } catch { $script:cleanupFailed = $true }
        }
    }
}

# 五個scope均須Undefined，另讀effective；不將某個scope或歷史政策當effective。
function Test-ProbeRestricted {
    foreach ($scope in @('MachinePolicy', 'UserPolicy', 'Process', 'CurrentUser', 'LocalMachine')) {
        if (([string](Get-ExecutionPolicy -Scope $scope -ErrorAction Stop)) -cne 'Undefined') { return $false }
    }
    return (([string](Get-ExecutionPolicy -ErrorAction Stop)) -ceq 'Restricted')
}

# 只分類私有RAM中的首問題；throw的raw／output保持未知，不讀LASTEXITCODE。
function Save-BaselineComparison([string]$Case, [string]$Invocation, $Ref, $Raw, $Output, $Matched) {
    $refType = 'other'; $refValue = 'unknown'
    if ($Ref -is [int]) {
        $refType = 'int32'; $refValue = 'other'
        if (@(0, 1, 2) -contains $Ref) { $refValue = [string]$Ref }
    }
    $rawType = 'unknown'; $rawValue = 'unknown'; $shape = 'unknown'; $public = 'null'
    if ($Invocation -ceq 'returned') {
        $rawType = 'other'
        if ($Raw -is [int]) {
            $rawType = 'int32'; $rawValue = 'other'
            if (@(0, 1, 2, 7) -contains $Raw) { $rawValue = [string]$Raw }
        }
        $shape = 'other'
        if ($Output.Count -eq 0) { $shape = 'empty' }
        elseif ($Output.Count -eq 1 -and $Output[0] -is [string]) { $shape = 'one_string' }
        elseif ($Output.Count -eq 1 -and $Output[0] -is [Management.Automation.ErrorRecord]) { $shape = 'one_error_record' }
        if ($Matched) { $public = 'true' } else { $public = 'false' }
    }
    $script:comparison = '"firstProblemCase":"' + $Case + '","invocation":"' + $Invocation + '","refType":"' + $refType +
        '","refValue":"' + $refValue + '","rawType":"' + $rawType + '","rawValue":"' + $rawValue +
        '","outputShape":"' + $shape + '","publicOutputMatched":' + $public
}

try {
    if ($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'probe_guard_rejected' }
    if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
        $PSVersionTable.PSEdition -cne 'Desktop' -or -not [Environment]::Is64BitProcess -or
        ([string]$ExecutionContext.SessionState.LanguageMode) -cne 'FullLanguage' -or
        ([string][Threading.Thread]::CurrentThread.ApartmentState) -cne 'STA') { throw 'probe_guard_rejected' }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $resources = 'unconfirmed'
    $principal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'probe_guard_rejected' }
    if (-not (Test-ProbeRestricted)) { throw 'probe_guard_rejected' }
    $policyChecked = $true

    $root = $env:RDWEB_NATIVE_PROBE_ROOT
    if ([string]::IsNullOrWhiteSpace($root) -or $root.Length -gt 240 -or $root.StartsWith('\') -or
        $root.Length -lt 3 -or $root[1] -ne ':' -or $root[2] -ne '\' -or $root.Substring(2).Contains(':') -or
        [IO.Path]::GetFullPath($root).TrimEnd('\') -cne $root.TrimEnd('\')) { throw 'probe_guard_rejected' }
    $drive = New-Object IO.DriveInfo -ArgumentList ([IO.Path]::GetPathRoot($root))
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'probe_guard_rejected' }
    $directory = New-Object IO.DirectoryInfo -ArgumentList $root
    while ($null -ne $directory) {
        if (-not $directory.Exists -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'probe_guard_rejected' }
        $directory = $directory.Parent
    }
    $fixtureDirectory = Join-Path $root 'PUBLIC 空格 繁體'
    if (([IO.File]::GetAttributes($fixtureDirectory) -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        -not [IO.Directory]::Exists($fixtureDirectory)) { throw 'probe_guard_rejected' }
    $entry = Join-Path $root 'start-windows-test-receiver.ps1'
    $supervisor = Join-Path $root 'windows-host-observer-supervisor.ps1'
    $nodePath = Join-Path $root 'node.exe'
    $fixturePath = Join-Path $fixtureDirectory 'receiver-native-case.mjs'
    Assert-ProbeSource $entry 'b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19' 65536
    Assert-ProbeSource $supervisor '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2' 65536
    Assert-ProbeSource $nodePath 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5' 134217728
    Assert-ProbeSource $fixturePath '846af281f23a2c5ab7ebc6c54fd6f6725406f9a4da73036ad4fd9cb3a10c512b' 8192
    if ($cleanupFailed) { throw 'probe_guard_rejected' }

    # 只准另行授權的child自身Process例外，不修改父終端或持久scope。
    $policyTouched = $true
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
    if (([string](Get-ExecutionPolicy -Scope Process)) -cne 'RemoteSigned' -or
        ([string](Get-ExecutionPolicy)) -cne 'RemoteSigned') { throw 'probe_guard_rejected' }
    . $entry
    if ($ErrorActionPreference -cne 'Stop') { throw 'probe_guard_rejected' }

    $names = @('E0', 'E1', 'E2', 'E7', 'O', 'R', 'A')
    $expectedRef = @(0, 1, 2, 2, 0, 0, 0)
    $expectedRaw = @(0, 1, 2, 7, 0, 0, 0)
    $reason = 'io_failed'
    for ($index = 0; $index -lt 7; $index++) {
        $code = 99
        $global:LASTEXITCODE = 99
        $caseArgs = @($fixturePath, $names[$index])
        if ($index -eq 6) { $caseArgs += @('PUBLIC SPACE', 'PUBLIC_繁體中文') }
        try {
            # R案局部Continue以安全捕獲native stderr，finally恢復Stop。
            if ($index -eq 5) { $ErrorActionPreference = 'Continue' }
            try {
                # 原invoke與raw讀取順序不變，禁止為觀察再invoke或讀取raw。
                $output = @(Invoke-ReceiverChild -NodePath $nodePath -Arguments $caseArgs -ExitCode ([ref]$code) 2>&1)
                $raw = $global:LASTEXITCODE
            } finally {
                if ($index -eq 5) { $ErrorActionPreference = 'Stop' }
            }
        } catch {
            # 先封存當次未知raw／output，原公開R錯誤辨認保持。
            Save-BaselineComparison $names[$index] 'threw' $code $null $null $null
            if ($index -eq 5 -and $_.FullyQualifiedErrorId -ceq 'NativeCommandError' -and
                $_.Exception.Message -ceq 'PUBLIC_STDERR' -and $code -is [int] -and $code -eq 2) {
                $cases.Add('false')
                $reason = 'native_stderr_interrupted'
            }
            break
        }
        $matches = $code -is [int] -and $raw -is [int] -and $code -eq $expectedRef[$index] -and $raw -eq $expectedRaw[$index]
        if ($index -eq 4) {
            $publicMatched = $output.Count -eq 1 -and $output[0] -is [string] -and $output[0] -ceq 'PUBLIC_STDOUT'
        } elseif ($index -eq 5) {
            $publicMatched = $output.Count -eq 1 -and $output[0] -is [Management.Automation.ErrorRecord] -and
                $output[0].FullyQualifiedErrorId -ceq 'NativeCommandError' -and $output[0].Exception.Message -ceq 'PUBLIC_STDERR'
        } else {
            $publicMatched = $output.Count -eq 0
        }
        $matches = $matches -and $publicMatched
        if (-not $matches) {
            Save-BaselineComparison $names[$index] 'returned' $code $raw $output $publicMatched
            $cases.Add('false')
            $reason = 'case_mismatch'
            break
        }
        $cases.Add('true')
        if ($index -eq 6) {
            $reason = 'none'
            $comparison = $comparison.Replace('"firstProblemCase":"unknown"', '"firstProblemCase":"none"')
        }
    }
} catch {
    # 首reason與首問題保持，不回顯ErrorRecord／Exception或路徑。
} finally {
    if ($policyChecked) {
        try {
            if ($policyTouched) { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined -Force -ErrorAction Stop }
            if (Test-ProbeRestricted) { $policy = 'confirmed' } else { $policy = 'unconfirmed' }
        } catch { $policy = 'unconfirmed' }
    }
    if ($null -ne $identity) {
        try { $identity.Dispose(); $resources = 'confirmed' } catch { $cleanupFailed = $true }
    }
    if ($cleanupFailed) { $resources = 'unconfirmed' }
}

if ($reason -ceq 'none' -and ($policy -cne 'confirmed' -or $resources -cne 'confirmed')) { $reason = 'cleanup_unconfirmed' }
$exitCode = 2
if (@('none', 'case_mismatch', 'native_stderr_interrupted') -ccontains $reason -and
    $policy -ceq 'confirmed' -and $resources -ceq 'confirmed') { $exitCode = 0 }
# 獨立七鍵frame，只使用封閉token；單次輸出失敗不重送。
$frame = 'receiver_native_baseline_child_frame,{"version":1,"purpose":"receiver_native_baseline_child_v1","reason":"' +
    $reason + '","cases":[' + [string]::Join(',', $cases) + '],"childPolicyRestore":"' + $policy +
    '","childResourcesClose":"' + $resources + '","comparison":{' + $comparison + '}}' + "`n"
try { [Console]::Out.Write($frame); [Console]::Out.Flush() } catch { exit 2 }
exit $exitCode
