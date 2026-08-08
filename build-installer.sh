#!/usr/bin/env bash
# ─── Midnightcord Installer — Build ─────────────────────────────────────────────
# Equivalent bash de build-installer.ps1 (converti depuis build-installer.bat)

set -euo pipefail

cd "$(dirname "$0")"

echo ""
echo " ================================"
echo "  Midnightcord Installer - Build"
echo " ================================"
echo ""

# ── Vérifie que node est disponible ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo " [ERREUR] Node.js introuvable. Installez Node.js depuis https://nodejs.org"
    exit 1
fi

# ── Crée le dossier de sortie si besoin ──────────────────────────────────────
mkdir -p "release/installer"

# ── Entre dans le dossier installer-src ──────────────────────────────────────
cd installer-src

# ── 1. Installe les dépendances si node_modules absent ───────────────────────
if [[ ! -d "node_modules" ]]; then
    echo " [1/3] Installation des dependances npm..."
    if ! npm install --legacy-peer-deps; then
        echo " [ERREUR] npm install a echoue."
        cd ..
        exit 1
    fi
    echo " [1/3] Dependances installees."
else
    echo " [1/3] Dependances deja presentes, on passe."
fi

# ── 2. Compile avec electron-webpack ─────────────────────────────────────────
echo ""
echo " [2/3] Compilation webpack (electron-webpack)..."

if ! npm run compile; then
    echo " [ERREUR] Compilation webpack echouee."
    cd ..
    exit 1
fi

echo " [2/3] Compilation webpack reussie."

# ── 3. Packaging electron-builder ────────────────────────────────────────────
echo ""
echo " [3/3] Packaging electron-builder..."

if ! npx electron-builder --win -p never; then
    echo " [ERREUR] electron-builder a echoue."
    cd ..
    exit 1
fi

cd ..

# ── Vérification ─────────────────────────────────────────────────────────────
if [[ ! -f "release/installer/Midnightcord-Installer.exe" ]]; then
    echo ""
    echo " [ERREUR] Midnightcord-Installer.exe introuvable apres build."
    exit 1
fi

SIZE=$(stat -c%s "release/installer/Midnightcord-Installer.exe" 2>/dev/null \
    || stat -f%z "release/installer/Midnightcord-Installer.exe")

echo ""
echo " [OK] Build reussi !"
echo " Fichier : release/installer/Midnightcord-Installer.exe  ($SIZE octets)"
echo ""