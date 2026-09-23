# Package the graphical installer from the already-built root project.
# Usage: .\build-installer.ps1 [--x64 | --arm64] [--dir]
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required. Install the root dependencies and build the client first."
}
& node (Join-Path $PSScriptRoot "scripts/packageInstaller.mjs") @args
exit $LASTEXITCODE
