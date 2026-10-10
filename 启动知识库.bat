@echo off
rem ===========================================================================
rem  Personal knowledge base - start the local server, then open the browser.
rem  Just double-click this file. Close the console window to stop the server.
rem
rem  NOTE: this .bat is pure ASCII on purpose. cmd.exe reads a .bat using the
rem  system OEM code page, so Chinese characters here would be decoded wrongly
rem  and could even be executed as stray commands. That is why the comments
rem  below are in English - the Chinese text you see in the running window
rem  comes from server.ps1 / app.js, not from here.
rem ===========================================================================
setlocal
rem  chcp 65001 switches the console to UTF-8, so Chinese output from
rem  PowerShell is displayed correctly instead of turning into garbage.
chcp 65001 >nul
title Personal knowledge base - local server
rem  %~dp0 is the folder this .bat lives in, so the script works no matter
rem  which drive letter the USB stick gets (F:, G:, H: ...).
cd /d "%~dp0"

rem  Prefer the newer PowerShell 7+ (pwsh) when available, otherwise fall back
rem  to the built-in Windows PowerShell 5.1. Either one can run server.ps1.
where pwsh >nul 2>nul
if %errorlevel%==0 goto :usepwsh

rem  -ExecutionPolicy Bypass: lets this script run even if the machine's policy
rem  forbids running .ps1 files (a fresh Windows often does).
rem  -NoProfile: skips the user's PowerShell profile, for a clean start.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1"
goto :stopped

:usepwsh
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1"

:stopped
rem  Reached when the server window is closed - pause so the user can read the
rem  last messages before the window disappears.
echo.
echo Server stopped. Press any key to close this window.
pause >nul
