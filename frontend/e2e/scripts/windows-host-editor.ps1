# 共用真正UIA讀取path；只供已驗source／scope的child，載入本模組不讀桌面或文字。
# 固定point定位、先重驗身份／bounds／type再取得TextPattern，禁止搜尋其他視窗或讀Name。
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
        $script:editorStage='editor_identity'
        $runtimeId=$element.GetRuntimeId()
        if ($null -eq $runtimeId -or $runtimeId.Length -eq 0) { throw 'scope' }
        $identity=($runtimeId -join ',')+':'+$process.Id+':'+$process.StartTime.Ticks+':'+$element.Current.NativeWindowHandle+':'+$rect.X+':'+$rect.Y+':'+$rect.Width+':'+$rect.Height
        if ($null -ne $script:editorIdentity -and $identity -cne $script:editorIdentity) { throw 'scope' }
        $script:editorStage='editor_type'
        $control=$element.Current.ControlType
        if ($control -ne [System.Windows.Automation.ControlType]::Edit -and $control -ne [System.Windows.Automation.ControlType]::Document) { throw 'scope' }
        $script:editorStage='editor_pattern'
        $pattern=$null
        if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { throw 'scope' }
        $script:editorIdentity=$identity;$script:editorPid=$process.Id
        return $pattern
    } finally { $process.Dispose() }
}

# 全文只在child RAM；固定有界sentinel及原Unicode／UTF8 guard，絕不trim或讀selection。
function Read-HostEditorText($Editor) {
    $pattern=Get-HostEditorPattern $Editor
    $script:editorStage='editor_text_read'
    $script:editorTextCalls++
    $text=$pattern.DocumentRange.GetText(32769)
    $script:editorStage='editor_text_validate'
    if (-not [HostObserverNative]::IsSafeText($text,32768)) { throw 'text' }
    return $text
}
