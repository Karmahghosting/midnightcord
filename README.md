<div align="center">
  <img src="./static/icon.png" width="96" height="96" alt="Midnightcord Logo">

# Midnightcord

**Un mod Discord rapide avec voix native pour Windows, macOS et Linux.**

[![License](https://img.shields.io/badge/license-GPL%20v3-a855f7)](./LICENSE)
[![Windows](https://img.shields.io/badge/Windows-0078D4?logo=windows)](./docs/WINDOWS.md)
[![macOS](https://img.shields.io/badge/macOS-000000?logo=apple)](./docs/MACOS.md)
[![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black)](./docs/LINUX.md)

</div>

Midnightcord injecte son interface et ses plugins dans l’application Discord officielle. Le moteur vocal natif de Discord reste actif, ce qui évite le blocage DTLS observé avec certains clients Electron autonomes.

Le projet dérive de [Nightcord](https://source.nightcord.st/nightcord/nightcord), Equicord, Vesktop et Vencord.

## Installation recommandée

Téléchargez l’archive correspondant à votre système depuis les releases GitHub, extrayez-la puis lancez le programme d’installation inclus.

- Windows x64 : Install-Midnightcord.cmd
- macOS Intel ou Apple Silicon : Install Midnightcord.command
- Linux x64 ou ARM64 : ./install-midnightcord.sh

Les archives embarquent leur propre runtime. Node.js et pnpm ne sont pas requis pour l’installation.

Discord Stable, PTB, Canary et Development sont détectés automatiquement. Fermez complètement Discord avant l’installation.

Consultez [la documentation native](./docs/NATIVE.md) pour les options, la mise à jour et la restauration, ainsi que [la documentation de confidentialité](./docs/PRIVACY.md).

## Construire depuis les sources

Prérequis : Git, Node.js 20 ou plus récent et Corepack.

    git clone https://github.com/Karmahghosting/midnightcord.git
    cd midnightcord
    corepack pnpm install --frozen-lockfile
    corepack pnpm package:native

Le paquet natif du système courant est créé dans release/native/.

Pour un build de développement injecté directement depuis le dépôt :

    corepack pnpm build --standalone --disable-updater
    corepack pnpm run inject

## Paquets Linux autonomes

Les sorties AppImage, Debian et tar.gz restent disponibles avec corepack pnpm package:linux:x64. Elles utilisent WebRTC au lieu du moteur vocal Discord. Le mode natif est recommandé pour la voix.

## Performances

Les builds de production sont minifiés, sans obfuscation et sans source maps dans les archives. Le chargeur natif ajoute seulement Midnightcord au processus Discord existant, sans lancer une seconde application Electron.

## Confidentialité

Les releases natives ne contiennent ni synchronisation cloud Midnightcord, ni Mellowtel, ni interrogation automatique du fil Midnightcord. Les profils, badges et préférences restent locaux. `NoTrack` bloque les Analytics, les métriques et Sentry de Discord.

Les plugins optionnels qui utilisent un service externe restent sous le contrôle de l’utilisateur. Consultez [la documentation de confidentialité](./docs/PRIVACY.md) pour le détail.

## Crédits

Midnightcord dérive de [Nightcord](https://source.nightcord.st/nightcord/nightcord), [Equicord](https://github.com/Equicord/Equicord), [Vesktop](https://github.com/Vencord/Vesktop) et [Vencord](https://github.com/Vendicated/Vencord). Leurs auteurs et contributeurs conservent leurs crédits et droits respectifs.

## Avertissement

Midnightcord n’est pas affilié à Discord Inc. Les modifications du client peuvent enfreindre les conditions d’utilisation de Discord. Utilisez Midnightcord à vos propres risques.
