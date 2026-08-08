# Midnightcord sous Windows

## Installation

1. Installez Discord Desktop depuis discord.com.
2. Fermez Discord et son icône dans la zone de notification.
3. Téléchargez Midnightcord-Native pour Windows x64.
4. Extrayez complètement l’archive.
5. Double-cliquez sur Install-Midnightcord.cmd.
6. Relancez Discord depuis son raccourci habituel.

Le script ne demande pas de droits administrateur pour l’installation Discord utilisateur standard.

## Canaux Discord

Stable, PTB, Canary et Development sont pris en charge. Pour cibler Stable uniquement, ouvrez un terminal dans le dossier extrait puis lancez :

    Install-Midnightcord.cmd --channel stable

## Mise à jour

Après une mise à jour de Discord ou de Midnightcord, fermez Discord et relancez Install-Midnightcord.cmd.

## Désinstallation

Fermez Discord puis lancez Uninstall-Midnightcord.cmd. Le script restaure l’ASAR officiel et supprime les fichiers Midnightcord installés dans le profil utilisateur.

## Build depuis les sources

Dans PowerShell :

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:native

L’archive est créée dans release\native.
