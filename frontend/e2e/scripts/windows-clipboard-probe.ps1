# 只讀公開記事本與當前Windows剪貼簿；不注入按鍵、不選取、不寫入或輸出文字。
# 必須使用無profile／trace／transcript的Windows PowerShell 5.1；不繞過既有安全政策。

# 只在核准矩形與Notepad文字控制項內取選取，結果僅固定代碼與布林。
function Invoke-PublicClipboardProbe {
    $ErrorActionPreference = 'Stop'
    $VerbosePreference = 'SilentlyContinue'
    $DebugPreference = 'SilentlyContinue'
    $WarningPreference = 'SilentlyContinue'
    $InformationPreference = 'SilentlyContinue'
    $selected = $null
    $clipboardText = $null
    $checkText = $null
    $process = $null
    $code = 'native_probe_runtime_unavailable'
    $result = [ordered]@{
        code = $code
        scopeVerified = $false
        selectionReadable = $false
        selectionPublicPrefix = $false
        selectionLooksLikeExpectedSample = $false
        selectionCoversDocument = $false
        selectionStable = $false
        clipboardReadable = $false
        clipboardEmpty = $false
        clipboardMatchesSelection = $false
        clipboardTrimMatchesSelection = $false
        clipboardHasSelectionUuid = $false
    }
    try {
        if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or
            [System.Threading.Thread]::CurrentThread.GetApartmentState() -ne [System.Threading.ApartmentState]::STA) {
            throw 'probe_guard'
        }
        $code = 'native_probe_policy_unavailable'
        if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
            throw 'probe_guard'
        }
        $code = 'native_probe_capability_unavailable'
        Add-Type -AssemblyName WindowsBase -ErrorAction Stop
        Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
        Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop

        # 物理point沿原editor=(0,61,1398,894)，不掃描桌面或其他視窗。
        $code = 'native_probe_surface_unavailable'
        $point = New-Object System.Windows.Point -ArgumentList 20, 91
        $element = [System.Windows.Automation.AutomationElement]::FromPoint($point)
        if ($null -eq $element) { throw 'probe_guard' }
        $process = [System.Diagnostics.Process]::GetProcessById($element.Current.ProcessId)
        if (-not [string]::Equals($process.ProcessName, 'notepad', [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'probe_guard'
        }
        $rect = $element.Current.BoundingRectangle
        foreach ($number in @($rect.Left, $rect.Top, $rect.Width, $rect.Height, $rect.Right, $rect.Bottom)) {
            if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { throw 'probe_guard' }
        }
        if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0 -or
            $rect.Left -lt 0 -or $rect.Top -lt 61 -or $rect.Right -gt 1398 -or $rect.Bottom -gt 955 -or
            $element.Current.IsPassword) { throw 'probe_guard' }
        $control = $element.Current.ControlType
        if ($control -ne [System.Windows.Automation.ControlType]::Edit -and
            $control -ne [System.Windows.Automation.ControlType]::Document) { throw 'probe_guard' }
        $result.scopeVerified = $true

        $code = 'native_probe_text_pattern_unavailable'
        $pattern = $null
        if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
            throw 'probe_guard'
        }
        $code = 'native_probe_selection_unavailable'
        $ranges = $pattern.GetSelection()
        if ($null -eq $ranges -or $ranges.Length -ne 1) { throw 'probe_guard' }
        $range = $ranges[0]
        $code = 'native_probe_text_limit_unavailable'
        $selected = $range.GetText(32769)
        $utf8 = New-Object System.Text.UTF8Encoding -ArgumentList $false, $true
        if ($null -eq $selected -or $selected.Length -eq 0 -or
            $selected.Length -gt 32768 -or $utf8.GetByteCount($selected) -gt 32768) { throw 'probe_guard' }
        $result.selectionReadable = $true
        $code = 'native_probe_selection_not_public'
        $result.selectionPublicPrefix = $selected.StartsWith('Public ', [System.StringComparison]::Ordinal)
        if (-not $result.selectionPublicPrefix) { throw 'probe_guard' }
        $uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        $result.selectionLooksLikeExpectedSample = [regex]::IsMatch($selected, '\APublic \u4e2d\u6587 RdWeb ' + $uuidPattern + '\s*\z')
        $document = $pattern.DocumentRange
        $result.selectionCoversDocument = (
            $range.CompareEndpoints([System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start, $document,
                [System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start) -eq 0 -and
            $range.CompareEndpoints([System.Windows.Automation.Text.TextPatternRangeEndpoint]::End, $document,
                [System.Windows.Automation.Text.TextPatternRangeEndpoint]::End) -eq 0
        )

        # 明確讀UnicodeText；只留短命RAM，不印未知剪貼簿、長度、hash或原生例外。
        $code = 'native_probe_clipboard_unavailable'
        $clipboardText = Get-Clipboard -Format Text -TextFormatType UnicodeText -Raw -ErrorAction Stop
        if ($null -eq $clipboardText) { $clipboardText = '' }
        if ($clipboardText -isnot [string]) { throw 'probe_guard' }
        $code = 'native_probe_text_limit_unavailable'
        if ($utf8.GetByteCount($clipboardText) -gt 32768) { throw 'probe_guard' }
        $result.clipboardReadable = $true
        $result.clipboardEmpty = $clipboardText.Length -eq 0
        $result.clipboardMatchesSelection = [string]::Equals($clipboardText, $selected, [System.StringComparison]::Ordinal)
        $result.clipboardTrimMatchesSelection = [string]::Equals($clipboardText.Trim(), $selected.Trim(), [System.StringComparison]::Ordinal)
        $uuid = [regex]::Match($selected, $uuidPattern + '(?=\s*\z)')
        $result.clipboardHasSelectionUuid = $uuid.Success -and
            $clipboardText.IndexOf($uuid.Value, [System.StringComparison]::Ordinal) -ge 0

        # 再確認同一選取未變；不把稍後快照當成失敗當下的因果證明。
        $code = 'native_probe_selection_recheck_unavailable'
        $again = $pattern.GetSelection()
        if ($null -ne $again -and $again.Length -eq 1 -and $range.Compare($again[0])) {
            $checkText = $again[0].GetText(32769)
            $result.selectionStable = [string]::Equals($checkText, $selected, [System.StringComparison]::Ordinal)
        }
        $result.code = 'native_probe_observed'
        return $result
    }
    catch {
        # 只回目前固定stage，絕不輸出ErrorRecord／Message／stack或視窗資訊。
        $result.code = $code
        return $result
    }
    finally {
        # 清除本次引用；不可宣稱.NET immutable string可被可靠清零。
        $selected = $null
        $clipboardText = $null
        $checkText = $null
        $uuid = $null
        $ranges = $null
        $again = $null
        $range = $null
        $document = $null
        $pattern = $null
        $element = $null
        if ($null -ne $process) {
            try { $process.Dispose() }
            catch { # 清理失敗也不輸出原生例外或影響固定摘要。
            }
        }
    }
}

Invoke-PublicClipboardProbe | ConvertTo-Json -Compress
