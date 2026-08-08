# ==============================================================================
#  Midnightcord — Script d'injection Post-Installation
#  Utilisé par l'installateur Inno Setup pour injecter Midnightcord dans Discord.
# ==============================================================================

param(
    [string]$AppDir = $PSScriptRoot
)

$ErrorActionPreference = "Continue"

# 1. Localiser Discord Stable
$DiscordPath = Join-Path $env:LOCALAPPDATA "Discord"
if (-not (Test-Path $DiscordPath)) {
    exit 0
}

# Trouver la version la plus récente (app-*)
$LatestApp = Get-ChildItem $DiscordPath -Filter "app-*" | Sort-Object Name -Descending | Select-Object -First 1
if (-not $LatestApp) {
    exit 0
}

$CoreDir = Join-Path $LatestApp.FullName "resources"
$InjectDir = Join-Path $CoreDir "app"

# 2. Créer l'injection
if (-not (Test-Path $InjectDir)) {
    New-Item -ItemType Directory -Path $InjectDir -Force | Out-Null
}

# Générer le package.json d'injection
$PackageJson = @{
    name = "discord"
    main = "index.js"
} | ConvertTo-Json

Set-Content -Path (Join-Path $InjectDir "package.json") -Value $PackageJson

# Générer le index.js d'injection
# On pointe vers le patcher.js dans le dossier d'installation de Midnightcord
$MidnightcordPatcher = Join-Path $AppDir "dist\desktop\patcher.js"
$MidnightcordPatcher = $MidnightcordPatcher.Replace("\", "\\")

$IndexJs = @"
\"use strict\";
const path = require(\"path\");
const fs = require(\"fs\");

// Injection Midnightcord
try {
    require(\"$MidnightcordPatcher\");
} catch (e) {
    console.error(\"Midnightcord injection failed:\", e);
    // Fallback sur Discord original si possible
    const originalAsar = path.join(__dirname, \"..\", \"_app.asar\");
    if (fs.existsSync(originalAsar)) {
        require(originalAsar);
    }
}
"@

Set-Content -Path (Join-Path $InjectDir "index.js") -Value $IndexJs

exit 0
