# Midnightcord sous macOS

Des archives séparées sont produites pour les Mac Intel x64 et Apple Silicon ARM64.

## Installation

1. Installez Discord dans le dossier Applications ou dans votre dossier Applications utilisateur.
2. Quittez complètement Discord avec Cmd Q.
3. Téléchargez et extrayez l’archive correspondant à votre processeur.
4. Ouvrez Install Midnightcord.command.
5. Relancez Discord normalement.

Si macOS refuse le premier lancement du script, faites un clic droit sur le fichier, choisissez Ouvrir puis confirmez.

L’injecteur cherche Discord Stable, PTB, Canary et Development dans /Applications et dans ~/Applications.

## Mise à jour

Après une mise à jour de Discord ou de Midnightcord, quittez Discord puis relancez Install Midnightcord.command.

## Désinstallation

Quittez Discord puis ouvrez Uninstall Midnightcord.command. La sauvegarde officielle est restaurée avant la suppression du build utilisateur.

## Permissions

Une application Discord installée par un autre compte ou appartenant à root peut être en lecture seule. Dans ce cas, placez Discord dans ~/Applications afin de conserver une installation entièrement utilisateur.

## Build depuis les sources

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:native

La CI produit les deux architectures sur des runners macOS natifs.
