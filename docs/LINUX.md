# Midnightcord sous Linux

## Mode natif recommandé

Le mode natif conserve le moteur vocal officiel de Discord. Il évite le blocage de négociation DTLS rencontré avec le client Electron autonome sur certains serveurs.

Depuis une archive de release :

1. fermez complètement Discord ;
2. extrayez Midnightcord-Native pour votre architecture ;
3. lancez ./install-midnightcord.sh ;
4. relancez Discord normalement.

Depuis les sources :

    corepack pnpm install --frozen-lockfile
    corepack pnpm run buildDesktop
    corepack pnpm run inject:linux

L’injecteur détecte Discord Stable, PTB, Canary et Development, notamment les versions utilisateur dans ~/.config/discord/app-*/resources.

Pour restaurer Discord :

    corepack pnpm run uninject:linux

## Paquets produits

La commande corepack pnpm package:linux:x64 crée quatre formats autonomes dans release/ :

- AppImage ;
- paquet Debian ;
- paquet RPM pour Fedora, RHEL, Rocky Linux, AlmaLinux et openSUSE ;
- archive tar.gz.

L’équivalent ARM64 est produit avec corepack pnpm package:linux:arm64.

Ces paquets autonomes utilisent WebRTC. Ils restent utiles sans installation Discord séparée, mais le mode natif est préférable pour la voix.

## Wayland et X11

Sur KDE Plasma, l’injecteur installe un lanceur `midnightcord.desktop` et une icône locale. Le nom du fichier desktop, l’identifiant Wayland et la classe de fenêtre restent synchronisés afin d’éviter l’icône générique ou un second groupe dans la barre des tâches.

Electron sélectionne automatiquement Wayland dans une session Wayland et X11 dans une session X11. Le lanceur utilise `--ozone-platform=auto` et conserve l’accélération GPU.

Discord sélectionne normalement le backend disponible. Les options Chromium habituelles restent utilisables avec l’application native.

Pour forcer Wayland :

    discord --ozone-platform=wayland

Pour forcer X11 :

    discord --ozone-platform=x11

## Profil de performance

Le build de production Midnightcord :

- est minifié avec élimination du code mort ;
- ne contient ni sources TypeScript ni source maps dans les archives ;
- conserve l’accélération GPU de Discord ;
- réutilise le processus Electron officiel au lieu de lancer un second client ;
- garde les modules vocaux natifs de Discord.

## Mises à jour

Midnightcord vérifie les releases GitHub après le démarrage. Une nouvelle version est téléchargée en arrière-plan, vérifiée par SHA256 et préparée sans modifier les fichiers en cours d’utilisation. Elle est appliquée au lancement suivant.

Après une mise à jour de Discord qui crée un nouveau dossier `app-*`, relancez l’injecteur afin de placer le chargeur dans cette nouvelle version.

L’AppImage autonome prend en charge l’auto-update Electron. Les paquets DEB et RPM restent gérés manuellement par le gestionnaire de paquets tant qu’aucun dépôt APT ou DNF n’est configuré.

Les paquets Flatpak et Snap sont isolés ou en lecture seule. Ils ne sont pas modifiés automatiquement.

## Build local

    corepack enable
    corepack pnpm install --frozen-lockfile
    corepack pnpm package:native

L’archive native est créée dans release/native/.
