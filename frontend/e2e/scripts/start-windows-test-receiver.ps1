param([string]$Parent)
# 只允許本機NTFS固定磁碟、同目錄runtime與已驗私有設定；不修改政策或既有ACL。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = $DebugPreference = $WarningPreference = $InformationPreference = 'SilentlyContinue'

# 在載入任何同目錄模組前先拒絕UNC／network／非NTFS，避免從遠端讀入程式。
function Assert-LocalNtfsPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'receiver_unavailable' }
    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($full)
    if ([string]::IsNullOrEmpty($root) -or $root.StartsWith('\\', [StringComparison]::Ordinal)) { throw 'receiver_unavailable' }
    $drive = New-Object IO.DriveInfo -ArgumentList $root
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'receiver_unavailable' }
    return $full
}

# 只接受非reparse的普通非空檔案；symlink／junction／裝置檔都在啟動前拒絕。
function Assert-RegularFile([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -lt 1) { throw 'receiver_unavailable' }
    return $item
}

# 以owner-only DACL建立新目錄；沿用既有guard回讀，不改任何舊目錄權限。
function New-OwnerOnlyDirectory([string]$Path, [Security.Principal.SecurityIdentifier]$Owner) {
    if ([IO.Directory]::Exists($Path) -or [IO.File]::Exists($Path)) { throw 'receiver_unavailable' }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($Owner)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule -ArgumentList $Owner, ([Security.AccessControl.FileSystemRights]::FullControl), ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit), ([Security.AccessControl.PropagationFlags]::None), ([Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    [void][IO.Directory]::CreateDirectory($Path, $acl)
}

# 建立本輪唯一子目錄；名稱只用GUID，不沿用舊run或縮舊ACL。
function New-PrivateRunDirectory([string]$Parent, [Security.Principal.SecurityIdentifier]$Owner) {
    $path = Join-Path $Parent ('receiver-' + [Guid]::NewGuid().ToString('N'))
    if ($path.Length -gt 240) { throw 'receiver_unavailable' }
    New-OwnerOnlyDirectory $path $Owner
    Assert-HostPrivatePath $path $true $Owner
    return $path
}

# 以單一8193bytes buffer讀公開設定，先驗size再CreateNew，絕不覆寫既有檔。
function Copy-PrivateSetting([string]$Source, [string]$Destination) {
    $item = Assert-RegularFile $Source
    if ($item.Length -gt 8192) { throw 'receiver_unavailable' }
    $bytes = New-Object byte[] 8193
    $input = $null
    $output = $null
    try {
        $input = New-Object IO.FileStream -ArgumentList $Source, ([IO.FileMode]::Open), ([IO.FileAccess]::Read), ([IO.FileShare]::Read)
        if ($input.Length -gt 8192) { throw 'receiver_unavailable' }
        $offset = 0
        while ($offset -lt $input.Length) {
            $count = $input.Read($bytes, $offset, $bytes.Length - $offset)
            if ($count -le 0) { throw 'receiver_unavailable' }
            $offset += $count
        }
        $output = New-Object IO.FileStream -ArgumentList $Destination, ([IO.FileMode]::CreateNew), ([IO.FileAccess]::Write), ([IO.FileShare]::None)
        $output.Write($bytes, 0, $offset)
        $output.Flush()
    } catch {
        # 即使CreateNew失敗也不刪目的地；半成品與原檔均保留供操作者核對。
        throw 'receiver_unavailable'
    } finally {
        if ($null -ne $output) { $output.Dispose() }
        if ($null -ne $input) { $input.Dispose() }
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

# 在Parent只建立一次launch claim，失敗亦不恢復gate；不刪任何來源或舊檔。
function Claim-ReceiverLaunch([string]$Parent) {
    $claim = $null
    try {
        $claim = New-Object IO.FileStream -ArgumentList (Join-Path $Parent 'launch-claim.json'), ([IO.FileMode]::CreateNew), ([IO.FileAccess]::Write), ([IO.FileShare]::None)
        $bytes = [Text.Encoding]::ASCII.GetBytes('{"schemaVersion":1,"purpose":"rustdesk_test_receiver_v1"}' + "`n")
        try { $claim.Write($bytes, 0, $bytes.Length); $claim.Flush() }
        finally { [Array]::Clear($bytes, 0, $bytes.Length) }
    } finally { if ($null -ne $claim) { $claim.Dispose() } }
}

# 只用明確runtime路徑原生傳遞輸出；退出碼走獨立ref，不混進stdout或逐行重印。
function Invoke-ReceiverChild([string]$NodePath, [string[]]$Arguments, [ref]$ExitCode) {
    $ExitCode.Value = 2
    & $NodePath @Arguments
    $ExitCode.Value = Get-ReceiverExitCode $LASTEXITCODE
}

# CLI只允許0／1／2；其他原生結束碼一律收斂成安全exit 2。
function Get-ReceiverExitCode($Value) {
    if (($Value -is [int] -or $Value -is [long]) -and @(0, 1, 2) -contains [int]$Value) { return [int]$Value }
    return 2
}

# 先驗程式目錄再載入唯讀guard模組；測試dot-source時也使用同一份既有guard。
try {
    $receiverScriptRoot = Assert-LocalNtfsPath $PSScriptRoot
    $receiverSupervisor = Join-Path $receiverScriptRoot 'windows-host-observer-supervisor.ps1'
    [void](Assert-RegularFile $receiverSupervisor)
    . $receiverSupervisor
} catch {
    # 載入失敗使用獨立固定分類，與main拒絕分開；dot-source仍拋出例外。
    if ($MyInvocation.InvocationName -ne '.') { [Console]::Error.WriteLine('receiver_entry_load_unavailable'); exit 2 }
    throw
}

# main先驗私有來源再claim／copy／啟Node；輸出直通，ref退出碼在任何前置失敗時保守為2。
function Invoke-ReceiverStart([string]$Parent, [ref]$ExitCode) {
    $ExitCode.Value = 2
    $parentPath = Assert-LocalNtfsPath $Parent
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try { $owner = $identity.User } finally { $identity.Dispose() }
    Assert-HostPrivatePath $parentPath $true $owner
    if ([IO.File]::Exists((Join-Path $parentPath 'claim.json')) -or [IO.File]::Exists((Join-Path $parentPath 'result.json'))) { throw 'receiver_unavailable' }
    $nodePath = (Assert-RegularFile (Join-Path $receiverScriptRoot 'node.exe')).FullName
    $bundlePath = (Assert-RegularFile (Join-Path $receiverScriptRoot 'receiver.mjs')).FullName
    [void](Assert-RegularFile (Join-Path $receiverScriptRoot 'vp8.webm'))
    foreach ($name in @('binding.json', 'connection.json')) {
        [void](Assert-RegularFile (Join-Path $parentPath $name))
        Assert-HostPrivatePath (Join-Path $parentPath $name) $false $owner
    }
    Claim-ReceiverLaunch $parentPath
    $runPath = New-PrivateRunDirectory $parentPath $owner
    Copy-PrivateSetting (Join-Path $parentPath 'binding.json') (Join-Path $runPath 'binding.json')
    Copy-PrivateSetting (Join-Path $parentPath 'connection.json') (Join-Path $runPath 'connection.json')
    $env:RDWEB_RECEIVER_PRIVATE_ENTRY = '1'
    Invoke-ReceiverChild -NodePath $nodePath -Arguments @($bundlePath, 'run', '--directory', $runPath) -ExitCode $ExitCode
}

# dot-source只定義／載入函數；main不得賦值捕獲stdout，僅以ref取得正規化退出碼。
if ($MyInvocation.InvocationName -ne '.') {
    $code = 2
    try { Invoke-ReceiverStart -Parent $Parent -ExitCode ([ref]$code) }
    catch { [Console]::Error.WriteLine('receiver_unavailable'); $code = 2 }
    exit $code
}
