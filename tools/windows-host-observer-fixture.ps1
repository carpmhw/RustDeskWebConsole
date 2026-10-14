param([ValidateSet('block','early-exit','malformed','closed-false','closed-true','query-block','round-trip')][string]$Mode)
# Test-only公開pipe producer；不呼native、讀檔、操作桌面／clipboard或更改policy。
switch ($Mode) {
    block { Start-Sleep -Seconds 30 }
    early-exit { exit 0 }
    malformed { [Console]::Out.WriteLine('{"ordinal":1,"raw":"Public denied"}');[Console]::Out.Flush() }
    closed-false { [Console]::Out.WriteLine('{"kind":"closed","resourcesClosed":false}');[Console]::Out.Flush() }
    closed-true { [Console]::Out.WriteLine('{"kind":"closed","resourcesClosed":true}');[Console]::Out.Flush() }
    # ready是LF分框的固定協定marker，不使用平台WriteLine的CRLF，也不放寬reader精確比較。
    query-block { [Console]::Out.Write("public_ready`n");[Console]::Out.Flush();[void][Console]::In.ReadLine();Start-Sleep -Seconds 30 }
    # 真讀到兩個固定command才回固定LF marker；不以預先輸出或時間等待冒充送達。
    round-trip {
        [Console]::Out.Write("public_ready`n");[Console]::Out.Flush()
        if ([Console]::In.ReadLine() -cne 'sample') { exit 2 }
        [Console]::Out.Write("public_sample_received`n");[Console]::Out.Flush()
        if ([Console]::In.ReadLine() -cne 'stop') { exit 2 }
        [Console]::Out.Write("public_stop_received`n");[Console]::Out.Flush();exit 0
    }
}
