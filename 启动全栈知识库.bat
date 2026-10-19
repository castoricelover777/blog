@echo off
rem ===========================================================================
rem  Personal knowledge base - FULL STACK version
rem  Frontend: Vue 3 (tools/blog-vue)  Backend: Spring Boot + MySQL
rem
rem  NOTE: this .bat is pure ASCII on purpose. cmd.exe reads .bat files using the
rem  system OEM code page, so non-ASCII comments could be mis-decoded and even
rem  executed as stray commands. Chinese output comes from Java/Spring, not here.
rem ===========================================================================
setlocal
chcp 65001 >nul
title Personal Knowledge Base - Full Stack (Vue + Spring Boot + MySQL)

cd /d "%~dp0"

rem ---- 1) locate the portable JDK / Maven next to this folder ----
set "PORTABLE=%~dp0..\Java"
if exist "%PORTABLE%\jdk-25\bin\java.exe" (
    set "JAVA_HOME=%PORTABLE%\jdk-25"
    set "PATH=%JAVA_HOME%\bin;%PATH%"
    echo [env] portable JDK: %JAVA_HOME%
) else (
    echo [env] portable JDK not found, using system JAVA_HOME
)
set "MVN=%PORTABLE%\apache-maven-3.9.16\bin\mvn.cmd"

rem ---- 2) build the backend jar on first run ----
if not exist "server\target\kb-server.jar" (
    echo.
    echo [build] first run: compiling backend, needs network for Maven deps...
    pushd server
    call "%MVN%" -B -DskipTests package
    if errorlevel 1 (
        echo.
        echo [ERROR] build failed. Check network / Maven.
        pause
        exit /b 1
    )
    popd
)

rem ---- 3) start ----
echo.
echo ============================================================
echo   Knowledge base starting...
echo   page : http://127.0.0.1:8080/
echo   api  : http://127.0.0.1:8080/api/health
echo   stop : close this window, or press Ctrl+C
echo ============================================================
echo.
echo [note] local MySQL must be running (127.0.0.1:3306, root/123456).

start "" http://127.0.0.1:8080/

cd server
"%JAVA_HOME%\bin\java.exe" -Dfile.encoding=UTF-8 -jar "target\kb-server.jar"

echo.
echo Server stopped. Press any key to close this window.
pause >nul
