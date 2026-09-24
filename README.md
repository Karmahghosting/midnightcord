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

Le projet dérive de Nightcord, Equicord, Vesktop et Vencord.

## Installation recommandée

Téléchargez **Midnightcord-Installer** pour votre système depuis les [releases GitHub](https://github.com/Karmahghosting/midnightcord/releases/latest).

- Windows x64 : ouvrez le `.exe` portable.
- macOS Intel ou Apple Silicon : extrayez le `.zip` et ouvrez **Midnightcord Installer.app**.
- Linux x64 ou ARM64 : installez le paquet `.deb` ou `.rpm`, puis ouvrez **Install Vencord** dans le menu des applications. L’AppImage et l’archive `.tar.gz` permettent aussi d’ouvrir l’injecteur.

L’injecteur graphique embarque Midnightcord et son runtime. Node.js, pnpm et une connexion Internet ne sont pas requis pour l’installation.

Fermez complètement Discord, cochez les installations souhaitées parmi **Stable, PTB, Canary et Development**, puis cliquez sur **Installer Midnightcord**. La même fenêtre permet de réparer ou de désinstaller Midnightcord. Aucune installation n’est cochée automatiquement.

Les archives **Midnightcord-Native** avec leurs scripts en ligne de commande restent disponibles.

Consultez [la documentation native](./docs/NATIVE.md) pour les options, la mise à jour et la restauration, ainsi que [la documentation de confidentialité](./docs/PRIVACY.md).

## Construire depuis les sources

Prérequis : Git, Node.js 20 ou plus récent et Corepack.

    git clone https://github.com/Karmahghosting/midnightcord.git
    cd midnightcord
    corepack pnpm install --frozen-lockfile
    corepack pnpm package:installer

L’injecteur du système courant est créé dans `release/installer/`. Utilisez `corepack pnpm package:native` pour produire l’archive en ligne de commande dans `release/native/`.

Pour un build de développement injecté directement depuis le dépôt :

    corepack pnpm build --standalone
    corepack pnpm run inject

## Plugins pratiques

BetterSessions ajoute la gestion des appareils et les alertes de nouvelles
sessions. MessageReminders permet de créer des rappels sur les messages.
AudioProfiles sauvegarde et restaure vos réglages audio. SecretGuard avertit
avant de publier un texte contenant un secret courant. LocalOCR extrait le texte
des images sur votre appareil ; ImageOptimizer crée une copie redimensionnée
avec aperçu et comparaison du poids. Les six plugins sont dans la catégorie
**Midnightcord**, désactivés par défaut. Consultez le
[guide d'activation et d'utilisation](./docs/UTILITY-PLUGINS.md).

Pour la musique, reliez votre compte Spotify dans les **Connexions** de Discord,
puis activez **DynamicIslande** et son option Spotify. L'île affiche le morceau
en cours, sa pochette et sa progression, avec les commandes de lecture.

## Paquets Linux

Les paquets AppImage, Debian, RPM et tar.gz contiennent uniquement l’injecteur graphite **Install Vencord**, qui installe Midnightcord dans Discord officiel. Le client autonome Linux est retiré. Les paquets embarquent le runtime et le build natif, avec le logo Midnightcord.

Construisez-les avec `corepack pnpm package:linux:x64` ou `corepack pnpm package:linux:arm64`. Consultez le [guide Linux](./docs/LINUX.md) pour l’installation et les formats portables.

## Performances

Les builds de production sont minifiés, sans obfuscation et sans source maps dans les archives. Le chargeur natif ajoute seulement Midnightcord au processus Discord existant, sans lancer une seconde application Electron.

## Midnightcord Cloud et confidentialité

Midnightcord Cloud synchronise, au choix, les réglages de plugins et QuickCSS. Il est désactivé par défaut. Chaque bloc est chiffré sur l’appareil avec AES-256-GCM ; le serveur ne reçoit ni la clé de récupération, ni la clé de déchiffrement, ni l’identité Discord. Les modes bidirectionnel, envoi, réception et manuel évitent les écrasements silencieux grâce aux versions et ETags.

À la première installation, une proposition permet d'ouvrir la configuration Cloud pour créer une clé de récupération ou importer une clé existante. « Pas maintenant » conserve le Cloud désactivé et la proposition ne revient pas. Les installations déjà configurées ne reçoivent pas cette proposition lors d'une mise à jour. L'adhésion au serveur communautaire reste facultative et nécessite une autorisation Discord distincte.

`NoTrack` bloque les Analytics, les métriques et Sentry de Discord. Les mises à jour viennent uniquement des releases GitHub Midnightcord et leur payload est vérifié par SHA256. Consultez [la documentation de confidentialité](./docs/PRIVACY.md) et la page [Midnightcord Cloud](https://midnightcord.fr/cloud) pour le détail.

## Crédits

Midnightcord dérive de [Nightcord](https://source.nightcord.st/nightcord/nightcord) [Equicord](https://github.com/Equicord/Equicord), [Vesktop](https://github.com/Vencord/Vesktop) et [Vencord](https://github.com/Vendicated/Vencord). Leurs auteurs et contributeurs conservent leurs crédits et droits respectifs.

## Avertissement

Midnightcord n’est pas affilié à Discord Inc. Les modifications du client peuvent enfreindre les conditions d’utilisation de Discord. Utilisez Midnightcord à vos propres risques.
