# Midnightcord sous Windows

## Installation

1. Installez Discord Desktop depuis discord.com.
2. Fermez Discord et son icône dans la zone de notification.
3. Téléchargez **Midnightcord-Installer** pour Windows x64.
4. Ouvrez le `.exe` portable et cochez les Discord souhaités.
5. Cliquez sur **Installer Midnightcord**.
6. Relancez Discord depuis son raccourci habituel.

L’injecteur ne demande pas de droits administrateur pour l’installation Discord utilisateur standard. Les archives **Midnightcord-Native** et leur script `Install-Midnightcord.cmd` restent disponibles pour la ligne de commande.

## Canaux Discord

Stable, PTB, Canary et Development sont proposés dans la fenêtre. Pour cibler Stable uniquement avec l’archive en ligne de commande, ouvrez un terminal dans le dossier extrait puis lancez :

    Install-Midnightcord.cmd --channel stable

## Mise à jour

Après une mise à jour de Discord, fermez Discord, ouvrez l’injecteur et sélectionnez l’installation à réparer.

## Désinstallation

Fermez Discord puis ouvrez l’onglet **Désinstallation** de l’injecteur. Cochez les installations à restaurer. Vos réglages et les fichiers partagés avec vos autres Discord Midnightcord sont conservés.

Le script `Uninstall-Midnightcord.cmd` des archives en ligne de commande reste disponible ; il supprime également le build partagé du profil utilisateur.

## Build depuis les sources

Dans PowerShell :

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:installer

L’exécutable est créé dans `release/installer/`.
