# build-installer.ps1 — Build Midnightcord-Installer.exe (Electron Portable)
# Usage: .\build-installer.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$InstallerSrc = Join-Path $Root "installer-src"
$OutDir = Join-Path $Root "release\installer"
$OutExe = Join-Path $OutDir "Midnightcord-Installer.exe"

Write-Host ""
Write-Host "  [Midnightcord] Building Electron installer..." -ForegroundColor Cyan

# ── Fermeture des processus verrouilles ─────────────────────────────────────────
try { Stop-Process -Name "Midnightcord", "Midnightcord-Installer" -Force -ErrorAction SilentlyContinue } catch {}

# ── Dossier de sortie ────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Set-Location $InstallerSrc

# ── Check dependencies ───────────────────────────────────────────────────────
if (-not (Test-Path "node_modules")) {
    Write-Host "  [1/3] npm install..." -ForegroundColor DarkGray
    & npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# ── Compilation webpack ──────────────────────────────────────────────────────
Write-Host "  [2/3] npm run compile (electron-webpack)..." -ForegroundColor DarkGray
& npm run compile
if ($LASTEXITCODE -ne 0) { exit 1 }

# ── Packaging electron-builder ───────────────────────────────────────────────
try { Stop-Process -Name "Midnightcord", "Midnightcord-Installer" -Force -ErrorAction SilentlyContinue } catch {}
$unpacked = Join-Path $OutDir "win-unpacked"
if (Test-Path $unpacked) { Remove-Item -Recurse -Force $unpacked -ErrorAction SilentlyContinue }

Write-Host "  [3/3] npx electron-builder..." -ForegroundColor DarkGray
& npx electron-builder --win -p never
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location $Root

# ── Verification ─────────────────────────────────────────────────────────────
if (Test-Path $OutExe) {
    $size = [math]::Round((Get-Item $OutExe).Length / 1MB, 2)
    Write-Host ""
    Write-Host "  OK  Midnightcord-Installer.exe compile ($size MB)" -ForegroundColor Green
    Write-Host "    -> $OutExe" -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host "  [ERREUR] Midnightcord-Installer.exe introuvable apres compilation." -ForegroundColor Red
    exit 1
}
