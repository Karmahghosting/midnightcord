@echo off
title Midnightcord — Dev Rebuild + Inject
cd /d "%~dp0"

echo.
echo  [1/4] Fermeture de Discord...
taskkill /F /IM Discord.exe /T >nul 2>&1
taskkill /F /IM DiscordPTB.exe /T >nul 2>&1
taskkill /F /IM DiscordCanary.exe /T >nul 2>&1
taskkill /F /IM Update.exe /T >nul 2>&1
ping 127.0.0.1 -n 4 >nul
:waitloop
tasklist /FI "IMAGENAME eq Discord.exe" 2>nul | find /i "Discord.exe" >nul
if not errorlevel 1 (
    ping 127.0.0.1 -n 2 >nul
    goto :waitloop
)
echo        Discord ferme.

echo.
echo  [2/4] Build en cours...
call pnpm build
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] pnpm build a echoue. Arret.
    pause
    exit /b 1
)
echo        Build termine.

echo.
echo  [3/4] Injection...
call pnpm inject
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] pnpm inject a echoue. Arret.
    pause
    exit /b 1
)
echo        Injection terminee.

echo.
echo  [4/4] Relancement de Discord...
set "DISCORD_PATH=%LOCALAPPDATA%\Discord"
if exist "%DISCORD_PATH%\Update.exe" (
    start "" "%DISCORD_PATH%\Update.exe" --processStart Discord.exe
    echo        Discord relance via Update.exe.
) else (
    for /f "delims=" %%i in ('dir /b /ad /o-n "%DISCORD_PATH%\app-*" 2^>nul') do (
        set "LATEST_APP=%%i"
        goto :found
    )
    :found
    if defined LATEST_APP (
        start "" "%DISCORD_PATH%\%LATEST_APP%\Discord.exe"
        echo        Discord relance via app direct.
    ) else (
        echo  [WARN] Discord introuvable dans %DISCORD_PATH%, relancement manuel requis.
    )
)

echo.
echo  ================================================
echo   Midnightcord mis a jour et injecte avec succes !
echo  ================================================
echo.
timeout /t 3 /nobreak >nul
