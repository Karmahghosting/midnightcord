# Midnightcord sous Linux

## Paquets produits

La commande `corepack pnpm package:linux:x64` crée trois formats dans `release/` :

- `Midnightcord-<version>-linux-x86_64.AppImage` : portable, compatible avec la plupart des distributions ;
- `Midnightcord-<version>-linux-amd64.deb` : Debian, Ubuntu et distributions dérivées ;
- `Midnightcord-<version>-linux-x64.tar.gz` : archive portable sans intégration système.

L’équivalent ARM64 est produit avec `corepack pnpm package:linux:arm64`.

## Mode natif recommandé pour la voix

Le paquet autonome utilise WebRTC. Sur certains serveurs Discord, ICE aboutit mais la négociation DTLS reste bloquée. Le mode natif conserve le moteur vocal officiel de Discord et injecte seulement Midnightcord.

Fermez Discord, construisez le mod puis injectez-le :

```bash
corepack pnpm run buildStandalone:linux
corepack pnpm run inject:linux
discord
```

Le script détecte aussi les versions installées dans `~/.config/discord/app-*/resources`. Il renomme `app.asar` en `_app.asar` avant de créer le chargeur Midnightcord. Pour restaurer Discord :

```bash
corepack pnpm run uninject:linux
```

## Installation

AppImage :

```bash
chmod +x Midnightcord-*.AppImage
./Midnightcord-*.AppImage
```

Debian/Ubuntu :

```bash
sudo apt install ./Midnightcord-*-linux-amd64.deb
```

L’application conserve ses données dans le répertoire Electron standard de l’utilisateur. Aucun mot de passe administrateur n’est requis pour l’AppImage ou l’archive portable.

## Wayland et X11

Electron sélectionne automatiquement le backend disponible. Pour forcer Wayland :

```bash
midnightcord --ozone-platform=wayland
```

Pour forcer X11/XWayland :

```bash
midnightcord --ozone-platform=x11
```

Si le partage d’écran ou l’accélération vidéo pose problème, commence par tester :

```bash
midnightcord --disable-gpu
```

## Profil de performance

La version de production :

- minifie et élimine le code mort sans obfuscation ;
- n’embarque ni fichiers TypeScript ni source maps ;
- regroupe l’application dans une archive ASAR ;
- laisse Chromium ralentir les fenêtres masquées afin de réduire CPU et batterie ;
- garde l’accélération GPU active par défaut.

L’ancien comportement qui maintient tous les timers actifs reste disponible pour les cas particuliers :

```bash
midnightcord --disable-background-throttling
```

Cette option augmente volontairement la consommation de ressources.

## Mises à jour

Les mises à jour automatiques sont désactivées par défaut : un fork ne doit jamais remplacer silencieusement Midnightcord par un binaire Nightcord. Un distributeur peut configurer un flux générique compatible avec `electron-updater` via `MIDNIGHTCORD_UPDATE_URL`, et une source de réparation ASAR via `MIDNIGHTCORD_ASAR_URL`.

## Build local rapide

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm package:dir
./release/linux-unpacked/midnightcord
```
