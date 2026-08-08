# ==============================================================================
#  Midnightcord — Installeur utilisateur (PowerShell autonome)
#  
#  Ce script fait TOUT automatiquement :
#  1. Télécharge EquilotlCli.exe (outil d'injection graphique)
#  2. Télécharge les fichiers Midnightcord compilés depuis GitHub
#  3. Lance l'interface graphique pour choisir votre Discord cible
#  4. Injecte Midnightcord dans Discord
#
#  Aucun Node.js, aucun pnpm, aucun code source requis.
#  Usage : Clic droit → "Exécuter avec PowerShell"
# ==============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

# ── Configuration ─────────────────────────────────────────────────────────────
$MidnightcordRepo   = "midnightcordfr/midnightcord"
$EquilotlUrl     = "https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli.exe"
$InstallDir      = Join-Path $env:LOCALAPPDATA "Midnightcord"
$DistDir         = Join-Path $InstallDir "dist"
$InstallerDir    = Join-Path $InstallDir "installer"
$EquilotlExe     = Join-Path $InstallerDir "EquilotlCli.exe"

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║          MIDNIGHTCORD  INSTALLER            ║" -ForegroundColor Cyan
    Write-Host "  ║  Injection rapide dans Discord Desktop   ║" -ForegroundColor DarkCyan
    Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($n, $total, $msg) {
    Write-Host "  [$n/$total] " -NoNewline -ForegroundColor Yellow
    Write-Host $msg
}

function Write-OK($msg) {
    Write-Host "          ✓ " -NoNewline -ForegroundColor Green
    Write-Host $msg
}

function Write-Fail($msg) {
    Write-Host ""
    Write-Host "  [ERREUR] $msg" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Appuyez sur une touche pour quitter..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# ── Démarrage ─────────────────────────────────────────────────────────────────
Write-Banner

# Créer les dossiers
New-Item -ItemType Directory -Force -Path $InstallDir  | Out-Null
New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null
New-Item -ItemType Directory -Force -Path $DistDir      | Out-Null

# ── [1/3] Télécharger / Mettre à jour EquilotlCli.exe ────────────────────────
Write-Step 1 3 "Vérification de l'outil d'installation..."

$needDownload = $true
if (Test-Path $EquilotlExe) {
    # Vérifier si une mise à jour est disponible via HEAD
    try {
        $head = Invoke-WebRequest -Uri $EquilotlUrl -Method Head -UseBasicParsing `
            -Headers @{ "User-Agent" = "Midnightcord-Installer/2.0" }
        $remoteSize = [long]($head.Headers["Content-Length"] ?? 0)
        $localSize  = (Get-Item $EquilotlExe).Length
        if ($remoteSize -gt 0 -and $remoteSize -eq $localSize) {
            $needDownload = $false
            Write-OK "EquilotlCli.exe déjà à jour."
        }
    } catch { }
}

if ($needDownload) {
    Write-Host "          Téléchargement de EquilotlCli.exe..." -ForegroundColor DarkGray
    try {
        Invoke-WebRequest -Uri $EquilotlUrl -OutFile $EquilotlExe -UseBasicParsing `
            -Headers @{ "User-Agent" = "Midnightcord-Installer/2.0" }
        Write-OK "EquilotlCli.exe téléchargé !"
    } catch {
        Write-Fail "Impossible de télécharger EquilotlCli.exe.`n           Vérifiez votre connexion internet.`n           Détail : $_"
    }
}

# ── [2/3] Télécharger les fichiers Midnightcord ──────────────────────────────────
Write-Step 2 3 "Téléchargement des fichiers Midnightcord depuis GitHub..."

try {
    $apiUrl   = "https://api.github.com/repos/$MidnightcordRepo/releases/latest"
    $release  = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing `
        -Headers @{ "User-Agent" = "Midnightcord-Installer/2.0"; "Accept" = "application/vnd.github.v3+json" }

    $version  = $release.tag_name
    $distAsset = $release.assets | Where-Object { $_.name -eq "midnightcord-dist.zip" } | Select-Object -First 1

    if (-not $distAsset) {
        Write-Fail "Fichier 'midnightcord-dist.zip' introuvable dans la release $version.`n           Contactez le support Midnightcord."
    }

    Write-Host "          Version : $version" -ForegroundColor DarkGray
    Write-Host "          Téléchargement en cours..." -ForegroundColor DarkGray

    $zipPath = Join-Path $InstallDir "midnightcord-dist.zip"
    Invoke-WebRequest -Uri $distAsset.browser_download_url -OutFile $zipPath -UseBasicParsing `
        -Headers @{ "User-Agent" = "Midnightcord-Installer/2.0" }

    # Extraire proprement (supprimer l'ancien dist d'abord)
    if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $DistDir -Force
    Remove-Item $zipPath -Force

    # Sauvegarder la version installée
    Set-Content -Path (Join-Path $InstallDir "version.txt") -Value $version

    Write-OK "Midnightcord $version prêt à être injecté !"
} catch {
    Write-Fail "Échec du téléchargement Midnightcord.`n           Détail : $_"
}

# ── [3/3] Injection via EquilotlCli ───────────────────────────────────────────
Write-Step 3 3 "Lancement de l'interface d'injection..."
Write-Host ""
Write-Host "          ┌─────────────────────────────────────────────────┐" -ForegroundColor DarkCyan
Write-Host "          │  Une fenêtre va s'ouvrir.                       │" -ForegroundColor DarkCyan
Write-Host "          │  Sélectionnez le Discord où injecter Midnightcord. │" -ForegroundColor DarkCyan
Write-Host "          └─────────────────────────────────────────────────┘" -ForegroundColor DarkCyan
Write-Host ""

# Ces variables d'environnement indiquent à EquilotlCli où trouver les fichiers
$env:EQUICORD_USER_DATA_DIR = $InstallDir
$env:EQUICORD_DIRECTORY     = $DistDir
$env:EQUICORD_DEV_INSTALL   = "1"

try {
    & $EquilotlExe "--install"
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "EquilotlCli a retourné une erreur (code $LASTEXITCODE)."
    }
} catch {
    Write-Fail "Impossible de lancer l'installeur.`n           Détail : $_"
}

# ── Succès ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  Midnightcord installé avec succès !                    ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║  → Redémarrez Discord pour appliquer Midnightcord.      ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Pour désinstaller : exécutez midnightcord-uninstall.bat" -ForegroundColor DarkGray
Write-Host ""
Start-Sleep -Seconds 4
