@echo off
rem ===========================================================================
rem  Publish local knowledge base -> static site (GitHub Pages)
rem
rem  What it does (see tools\publish-to-pages.ps1 for details):
rem    1. GET /api/export from the local Spring Boot backend
rem    2. compare with data\notes.json (semantic compare, ignores ordering)
rem    3. if changed, overwrite data\notes.json, then git commit + push
rem    4. GitHub Pages rebuilds automatically in 1-2 minutes
rem
rem  Requirements: backend running (double-click 启动全栈知识库.bat first).
rem  Optional arg: -DryRun  -> only compare, do not write/commit/push.
rem
rem  NOTE: this .bat is pure ASCII on purpose (cmd.exe reads .bat using the OEM
rem  code page). Chinese output comes from the .ps1 script instead.
rem ===========================================================================
setlocal
chcp 65001 >nul
title Publish knowledge base to GitHub Pages

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish-to-pages.ps1" %*

echo.
echo ------------------------------------------------------------
echo Done. Press any key to close this window.
pause >nul
