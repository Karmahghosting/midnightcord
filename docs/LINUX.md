# Midnightcord sous Linux

## Injection uniquement

Les paquets Linux contiennent uniquement l’injecteur graphite **Install Vencord**. Malgré ce nom de lanceur, il installe bien **Midnightcord** dans votre Discord officiel et conserve son moteur vocal. Le client autonome Linux est retiré.

Installez le paquet correspondant à votre architecture, puis ouvrez **Install Vencord** depuis le menu des applications :

```sh
sudo apt install ./Midnightcord-*-linux-x64.deb
# Ou, sur une distribution RPM :
sudo dnf install ./Midnightcord-*-linux-x64.rpm
```

Pour ARM64, remplacez `x64` par `arm64`. La commande `install-vencord` ouvre également l’injecteur. L’installation du paquet ne modifie aucun Discord : choisissez ensuite les installations dans la fenêtre.

La mise à niveau depuis l’ancien paquet `midnightcord` remplace le client autonome par l’injecteur. Les réglages utilisateur existants sont conservés.

Depuis une archive de release :

1. fermez complètement Discord ;
2. extrayez **Midnightcord-Installer** pour votre architecture ;
3. lancez `./midnightcord-installer`, cochez vos Discord et cliquez sur **Installer Midnightcord** ;
4. relancez Discord normalement.

L’onglet **Désinstallation** restaure les Discord cochés et conserve les réglages. Les archives **Midnightcord-Native** contenant `install-midnightcord.sh` restent disponibles pour la ligne de commande.

### Formats portables

Pour l’AppImage, rendez le fichier exécutable puis ouvrez-le :

```sh
chmod +x Midnightcord-*-linux-x64.AppImage
./Midnightcord-*-linux-x64.AppImage
```

Pour ajouter **Install Vencord** au menu, conservez l’AppImage à un emplacement permanent et lancez-la une fois avec `--register-installer`. Pour l’archive tar.gz, extrayez-la dans un dossier permanent, puis exécutez `./register-installer.sh` depuis ce dossier. Ce raccourci appartient à votre compte ; aucun accès administrateur n’est nécessaire pour l’enregistrer.

### Si le sandbox empêche l’ouverture de l’injecteur

Sur certaines distributions, notamment lorsque les espaces de noms utilisateur sont restreints, le lancement peut signaler que le helper SUID `chrome-sandbox` est mal configuré. Depuis le dossier extrait de l’archive officielle, configurez uniquement ce fichier :

```sh
sudo chown root:root ./chrome-sandbox
sudo chmod 4755 ./chrome-sandbox
./midnightcord-installer
```

L’injecteur se lance avec votre compte habituel, sans `sudo`. Le sandbox reste actif ; n’ajoutez pas `--no-sandbox`. Si le volume interdit SUID (`nosuid`), demandez à l’administrateur une configuration compatible. [Documentation du sandbox Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).

Une AppImage montée est en lecture seule : si votre système bloque son sandbox, utilisez de préférence le DEB/RPM ou l’archive tar.gz avec le réglage ci-dessus.

### Depuis les sources

Pour construire l’injecteur graphique :

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:installer

L’injecteur détecte Discord Stable, PTB, Canary et Development, notamment les versions utilisateur dans ~/.config/discord/app-*/resources.

Pour restaurer Discord :

    corepack pnpm run uninject:linux

## Paquets produits

La commande `corepack pnpm package:linux:x64` crée quatre formats de l’injecteur dans `release/` :

- AppImage ;
- paquet Debian ;
- paquet RPM pour Fedora, RHEL, Rocky Linux, AlmaLinux et openSUSE ;
- archive tar.gz.

L’équivalent ARM64 est produit avec `corepack pnpm package:linux:arm64`.

Tous contiennent le même injecteur, son runtime Electron et le build Midnightcord natif, avec OCR local. Ils nécessitent une installation Discord compatible à modifier ; aucun client autonome ni serveur arRPC n’est embarqué.

## Wayland et X11

Sur KDE Plasma, le script en ligne de commande installe un lanceur `midnightcord.desktop` et une icône locale. Le nom du fichier desktop, l’identifiant Wayland et la classe de fenêtre restent synchronisés afin d’éviter l’icône générique ou un second groupe dans la barre des tâches. Avec l’injecteur graphique, relancez votre Discord habituel.

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

Les mises à jour de l’injecteur se font en installant le nouveau DEB/RPM ou en remplaçant le fichier portable. Aucun dépôt APT ou DNF n’est configuré automatiquement. Le build Midnightcord injecté conserve sa propre mise à jour au prochain lancement de Discord.

Les paquets Flatpak et Snap sont isolés ou en lecture seule. Ils ne sont pas modifiés automatiquement.

## Build local

    corepack enable
    corepack pnpm install --frozen-lockfile
    corepack pnpm package:native

L’archive native est créée dans release/native/.
