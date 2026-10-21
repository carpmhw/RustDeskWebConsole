# 僅明確opt-in的race child使用；載入只定義函數，不讀桌面／文字／clipboard。
# 取得同一組身份metadata並細分失敗階段；所有原值及完整key只留child RAM。
function Get-HostEditorIdentitySnapshot($Element,$Process,$Rect) {
    $script:editorStage='editor_identity_runtime_get'
    $runtimeId=$Element.GetRuntimeId()
    $script:editorStage='editor_identity_runtime_empty'
    if ($null -eq $runtimeId -or $runtimeId.Length -eq 0) { throw 'scope' }
    $script:editorStage='editor_identity_runtime_get';$runtimePart=$runtimeId -join ','
    $script:editorStage='editor_identity_process_get';$processId=$Process.Id
    if ($null -eq $processId) { throw 'scope' };$processPart=''+$processId
    $script:editorStage='editor_identity_start_get';$startTicks=$Process.StartTime.Ticks
    if ($null -eq $startTicks) { throw 'scope' };$startPart=''+$startTicks
    $script:editorStage='editor_identity_window_get';$windowHandle=$Element.Current.NativeWindowHandle
    if ($null -eq $windowHandle) { throw 'scope' };$windowPart=''+$windowHandle
    $script:editorStage='editor_identity_bounds_get';$bx=$Rect.X;$by=$Rect.Y;$bw=$Rect.Width;$bh=$Rect.Height
    foreach ($part in @($bx,$by,$bw,$bh)) { if ($null -eq $part) { throw 'scope' } }
    $boundsPart=''+$bx+':'+$by+':'+$bw+':'+$bh
    $script:editorStage='editor_identity_compose'
    # 保持舊reader的串接順序／原轉字串語義，不normalize或另選identity。
    $key=$runtimePart+':'+$processId+':'+$startTicks+':'+$windowHandle+':'+$bx+':'+$by+':'+$bw+':'+$bh
    return @{Key=$key;Runtime=$runtimePart;Process=$processPart;Start=$startPart;Window=$windowPart;Bounds=$boundsPart}
}

# 以舊完整key不符為拒絕入口；component只分類第一個差異，不能改寫成功條件或重綁。
function Assert-HostEditorIdentitySnapshot($Current,$Expected,[string]$ExpectedKey) {
    $script:editorStage='editor_identity_baseline_missing'
    if ($null -eq $Expected -or $null -eq $Current -or [string]::IsNullOrEmpty($ExpectedKey)) { throw 'scope' }
    $script:editorStage='editor_identity_compare'
    if ($Current.Key -cne $ExpectedKey) {
        foreach ($case in @(
            @('Runtime','editor_identity_runtime_changed'),@('Process','editor_identity_process_changed'),
            @('Start','editor_identity_start_changed'),@('Window','editor_identity_window_changed'),
            @('Bounds','editor_identity_bounds_changed')
        )) {
            if ($Current[$case[0]] -cne $Expected[$case[0]]) { $script:editorStage=$case[1];throw 'scope' }
        }
        $script:editorStage='editor_identity_composite_changed';throw 'scope'
    }
}

# 沿原固定point／scope／type／pattern guard，不搜尋其他控制項、不等待選單消失或讀Name。
function Get-HostEditorPattern($Editor) {
    $script:editorStage='editor_point'
    $element=[System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point -ArgumentList ($Editor.x+20),($Editor.y+30)))
    if ($null -eq $element -or $element.Current.IsPassword) { throw 'scope' }
    $script:editorStage='editor_process'
    $process=[Diagnostics.Process]::GetProcessById($element.Current.ProcessId)
    try {
        if ($process.ProcessName -ine 'notepad' -or $process.SessionId -ne $script:sessionId -or $process.HasExited -or -not [HostObserverNative]::SameUser($process.Id)) { throw 'scope' }
        $script:editorStage='editor_bounds'
        $rect=$element.Current.BoundingRectangle
        if ($rect.IsEmpty) { throw [HostEditorBoundsException]::new() }
        [HostEditorCalibration]::ValidateScope($rect.X,$rect.Y,$rect.Width,$rect.Height,$Editor.x,$Editor.y,$Editor.width,$Editor.height)
        $snapshot=Get-HostEditorIdentitySnapshot $element $process $rect
        if ($null -ne $script:editorIdentity) { Assert-HostEditorIdentitySnapshot $snapshot $script:editorIdentitySnapshot $script:editorIdentity }
        $script:editorStage='editor_type'
        $control=$element.Current.ControlType
        if ($control -ne [System.Windows.Automation.ControlType]::Edit -and $control -ne [System.Windows.Automation.ControlType]::Document) { throw 'scope' }
        $script:editorStage='editor_pattern'
        $pattern=$null
        if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { throw 'scope' }
        $script:editorIdentity=$snapshot.Key;$script:editorIdentitySnapshot=$snapshot;$script:editorPid=$process.Id
        return $pattern
    } finally { $process.Dispose() }
}
