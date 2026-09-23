@echo off
setlocal
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is required. Install the root dependencies and build the client first.
    exit /b 1
)
node "%~dp0scripts\packageInstaller.mjs" %*
exit /b %ERRORLEVEL%
