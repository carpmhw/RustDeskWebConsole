@echo off
setlocal EnableExtensions DisableDelayedExpansion
@REM 只允許同目錄node.exe與固定PowerShell入口，不從PATH或目前目錄尋找runtime。
set "NoDefaultCurrentDirectoryInExePath=1"
if not exist "%~dp0node.exe" exit /b 2
if not exist "%~dp0receiver.mjs" exit /b 2
if not exist "%~dp0vp8.webm" exit /b 2
if not exist "%~dp0start-windows-test-receiver.ps1" exit /b 2
@REM 不加入ExecutionPolicy例外；政策或SmartScreen阻擋時由PowerShell直接失敗。
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -File "%~dp0start-windows-test-receiver.ps1" -Parent "%~1"
exit /b %ERRORLEVEL%
