@echo off
rem Pure ASCII on purpose (cmd.exe reads .bat with the OEM code page).
setlocal
chcp 65001 >nul
title blog-vue - local server (port 8099)
cd /d "%~dp0"
where pwsh >nul 2>nul
if %errorlevel%==0 goto :usepwsh
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
goto :stopped
:usepwsh
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
:stopped
echo.
echo Server stopped. Press any key to close.
pause >nul