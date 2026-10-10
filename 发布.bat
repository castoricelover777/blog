@echo off
rem ===========================================================================
rem  publish.bat - one double-click to publish local notes to GitHub Pages.
rem  (The file name itself is Chinese: "fa bu" = publish. This comment block is
rem   pure ASCII on purpose - see the note further down.)
rem
rem  What it does, step by step:
rem    1) checks that this folder is a git repository
rem    2) checks that the "origin" remote is configured
rem    3) stages every change with git add -A
rem    4) shows you exactly what will be published, and asks you to confirm
rem    5) commits with a message you type
rem    6) pushes to GitHub
rem
rem  NOTE: this .bat is pure ASCII on purpose. cmd.exe reads a .bat using the
rem  system OEM code page, so Chinese characters here would be decoded wrongly
rem  and could even be executed as stray commands. That is why all the text
rem  below is in English. The Chinese commit message you type in is fine,
rem  because it is passed to git as a command line argument, not parsed here.
rem ===========================================================================
setlocal
chcp 65001 >nul
title Publish JavaBlog to GitHub
cd /d "%~dp0"

echo.
echo  ==================================================
echo   Publish personal knowledge base to GitHub Pages
echo  ==================================================
echo.

rem ---- Step 1: is this a git repository? ----
git rev-parse --is-inside-work-tree >nul 2>nul
if not %errorlevel%==0 (
  echo  [X] This folder is not a git repository.
  echo      Run "git init -b main" here first.
  goto :end
)

rem ---- Step 2: is the remote configured? ----
for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set REMOTE=%%u
if "%REMOTE%"=="" (
  echo  [X] No "origin" remote configured.
  echo      Run: git remote add origin https://github.com/castoricelover777/blog.git
  goto :end
)
echo  Remote : %REMOTE%

rem ---- Step 3: show what changed ----
echo.
echo  --- Changes found (empty means nothing to publish) ---
git status --short
echo  ------------------------------------------------------

for /f "delims=" %%s in ('git status --porcelain') do set DIRTY=1
if "%DIRTY%"=="" (
  echo.
  echo  Nothing has changed since the last publish. Nothing to do.
  goto :end
)

rem ---- Step 4: confirm before touching anything ----
echo.
set /p OK="Publish these changes? (y/n) "
if /i not "%OK%"=="y" (
  echo  Cancelled. Nothing was changed.
  goto :end
)

rem ---- Step 5: stage and commit ----
git add -A
echo.
echo  Type a short message describing what you added today.
echo  Example: add: 2026-10-10 data structures stack and queue
echo.
set /p MSG="Message: "
if "%MSG%"=="" set MSG=update: notes %DATE% %TIME%

git commit -m "%MSG%"
if not %errorlevel%==0 (
  echo.
  echo  [X] Commit failed. Nothing was pushed.
  goto :end
)

rem ---- Step 6: push ----
echo.
echo  Pushing to GitHub...
git push
if not %errorlevel%==0 (
  echo.
  echo  [X] Push failed. Your commit is safe locally, just not uploaded yet.
  echo      Common causes:
  echo        - no internet
  echo        - the repository does not exist on GitHub yet
  echo        - you are not signed in to GitHub
  echo      Fix it, then run this file again.
  goto :end
)

echo.
echo  [OK] Done. Your notes are on GitHub.
echo       Website: https://castoricelover777.github.io/blog/
echo       It can take 1-2 minutes to show up. Refresh to check.

:end
echo.
pause >nul
