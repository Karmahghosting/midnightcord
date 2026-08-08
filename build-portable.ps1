$ErrorActionPreference = "Stop"
$DISCORD = "C:\Users\zzafi\AppData\Local\Discord\app-1.0.9228"
$OUT = "C:\Users\zzafi\Desktop\equicord\release\win-unpacked"
$RES = "$OUT\resources"

Write-Host "=== ETAPE 1 : Build ===" -ForegroundColor Cyan
Set-Location "C:\Users\zzafi\Desktop\equicord"
npx electron-builder --config electron-builder.config.cjs --win dir --x64

Write-Host "=== ETAPE 2 : Copie _app.asar ===" -ForegroundColor Cyan
Copy-Item "$DISCORD\resources\_app.asar" "$RES\_app.asar" -Force
Write-Host "_app.asar OK"

Write-Host "=== ETAPE 3 : standalone_modules ===" -ForegroundColor Cyan
$MOD_SRC = "$DISCORD\modules"
$MOD_DST = "$RES\standalone_modules"
New-Item -ItemType Directory -Path $MOD_DST -Force | Out-Null

$modules = Get-ChildItem -Path $MOD_SRC -Directory
foreach ($mod in $modules) {
    $cleanName = $mod.Name -replace '-\d+$', ''
    $innerSrc = Join-Path $mod.FullName $cleanName
    $dst = Join-Path $MOD_DST $cleanName
    if (Test-Path $innerSrc) {
        Copy-Item -Recurse -Force -Path $innerSrc -Destination $dst
        Write-Host "  $cleanName OK"
    }
}

Write-Host "=== ETAPE 4 : build_info.json ===" -ForegroundColor Cyan
$buildInfo = '{"newUpdater":false,"releaseChannel":"stable","version":"1.0.9228","standaloneModules":true}'
Set-Content -Path "$RES\build_info.json" -Value $buildInfo -Encoding UTF8
Write-Host "build_info.json OK"

Write-Host "=== ETAPE 5 : app/dist/_app.asar ===" -ForegroundColor Cyan
$APP_DIST = "$RES\app\dist"
New-Item -ItemType Directory -Path $APP_DIST -Force | Out-Null
Copy-Item "$DISCORD\resources\_app.asar" "$APP_DIST\_app.asar" -Force
Write-Host "app/dist/_app.asar OK"

Write-Host "=== ETAPE 6 : Creation portable exe ===" -ForegroundColor Cyan
npx electron-builder --config electron-builder.config.cjs --win portable --x64 --prepackaged release\win-unpacked

Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Fichier : release\Midnightcord-1.14.5-portable.exe" -ForegroundColor Green
