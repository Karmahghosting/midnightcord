# ==============================================================================
#  Midnightcord — Désinstalleur utilisateur (PowerShell)
#  Supprime l'injection Midnightcord de Discord
#
#  Usage : Clic droit → "Exécuter avec PowerShell"
# ==============================================================================

$ErrorActionPreference = "Stop"

$InstallDir    = Join-Path $env:LOCALAPPDATA "Midnightcord-Client"
$DistDir       = Join-Path $InstallDir "dist\desktop"
$InstallerDir  = Join-Path $InstallDir "installer"
$EquilotlExe   = Join-Path $InstallerDir "EquilotlCli.exe"

Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║      MIDNIGHTCORD — Désinstalleur           ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $EquilotlExe)) {
    Write-Host "  [INFO] EquilotlCli.exe introuvable." -ForegroundColor Yellow
    Write-Host "         Téléchargement de l'outil de désinstallation..." -ForegroundColor Yellow
    Write-Host ""
    New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null
    $EquilotlUrl = "https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli.exe"
    Invoke-WebRequest -Uri $EquilotlUrl `
        -Headers @{ "User-Agent" = "Midnightcord-Installer/2.0" } `
        -OutFile $EquilotlExe -UseBasicParsing
}

Write-Host "  Lancement du désinstalleur graphique..." -ForegroundColor Yellow
Write-Host "  Une fenêtre va s'ouvrir pour choisir votre Discord cible." -ForegroundColor Yellow
Write-Host ""

$env:EQUICORD_USER_DATA_DIR = $InstallDir
$env:EQUICORD_DIRECTORY     = $DistDir
$env:EQUICORD_DEV_INSTALL   = "1"

try {
    & $EquilotlExe "--uninstall"
} catch {
    Write-Host "  [ERREUR] La désinstallation a échoué : $_" -ForegroundColor Red
    Write-Host "  Appuyez sur une touche pour quitter..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "  ┌──────────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  Midnightcord désinstallé avec succès !                 │" -ForegroundColor Green
Write-Host "  │  Redémarrez Discord pour appliquer les changements.  │" -ForegroundColor Green
Write-Host "  └──────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
