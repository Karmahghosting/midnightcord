@echo off
title Midnightcord Installer - Build
cd /d "%~dp0"

echo.
echo  ====================================
echo   Midnightcord Installer - Build (Electron)
echo  ====================================
echo.

:: Verifie que node est disponible
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] Node.js introuvable. Installez Node.js depuis https://nodejs.org
    pause
    exit /b 1
)

:: Ferme toute instance de l'installeur en cours d'execution pour debloquer les fichiers
taskkill /F /IM Midnightcord.exe /IM Midnightcord-Installer.exe >nul 2>&1

:: Cree le dossier de sortie si besoin
if not exist "release\installer" mkdir "release\installer"

:: Entre dans installer-src
cd installer-src

:: Installe les dependances si node_modules absent
if not exist "node_modules" (
    echo  [1/3] Installation des dependances npm...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo  [ERREUR] npm install a echoue.
        cd ..
        pause
        exit /b 1
    )
    echo  [1/3] Dependances installees.
) else (
    echo  [1/3] Dependances deja presentes.
)

:: Compilation webpack
echo.
echo  [2/3] Compilation electron-webpack...
call npm run compile
if errorlevel 1 (
    echo  [ERREUR] Compilation webpack echouee.
    cd ..
    pause
    exit /b 1
)
echo  [2/3] Compilation webpack reussie.

:: Re-ferme toute instance de l'installeur avant le packaging
taskkill /F /IM Midnightcord.exe /IM Midnightcord-Installer.exe >nul 2>&1

:: Tente de nettoyer win-unpacked s'il existe
if exist "..\release\installer\win-unpacked" (
    rmdir /S /Q "..\release\installer\win-unpacked" >nul 2>&1
)

:: Packaging electron-builder -> Midnightcord-Installer.exe dans release/installer
echo.
echo  [3/3] Packaging electron-builder...
call npx electron-builder --win -p never
if errorlevel 1 (
    echo  [ERREUR] electron-builder a echoue.
    cd ..
    pause
    exit /b 1
)

cd ..

:: Verification
if not exist "release\installer\Midnightcord-Installer.exe" (
    echo.
    echo  [ERREUR] Midnightcord-Installer.exe introuvable apres compilation.
    pause
    exit /b 1
)

for %%F in ("release\installer\Midnightcord-Installer.exe") do (
    echo.
    echo  [OK] Build reussi !
    echo  Fichier : release\installer\Midnightcord-Installer.exe (%%~zF octets)
    echo.
)

:: Ouvre le dossier de sortie
explorer release\installer

pause
