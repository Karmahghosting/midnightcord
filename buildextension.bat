@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo BUILDER EXTENSION FIREFOX MIDNIGHTCORD
echo ========================================================
echo.
echo Liste des plugins ignores lue depuis blacklist.txt
echo.
echo Entrez la nouvelle version (ex: 1.20.0) :
set /p NEW_VERSION=

if "!NEW_VERSION!"=="" (
    echo Version invalide, annulation.
    pause
    exit /b
)

echo.
echo Mise a jour de package.json vers la version !NEW_VERSION!...
powershell -Command "(Get-Content package.json) -replace '\"version\": \".*\"', '\"version\": \"!NEW_VERSION!\"' | Set-Content package.json"

echo.
echo Construction de l'extension Firefox (cela peut prendre quelques instants)...
call pnpm buildWeb

echo.
echo ========================================================
echo TERMINE ! L'extension est prete dans :
echo   dist\browser\firefox-unpacked  (extension non packagée)
echo   dist\extension-firefox.zip     (zip pour publication)
echo ========================================================
pause
