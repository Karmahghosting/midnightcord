# Installation native

Le mode natif injecte Midnightcord dans Discord Desktop et conserve les modules officiels, notamment le moteur vocal. Il est recommandé sur Windows, macOS et Linux.

## Injecteur graphique recommandé

Les releases proposent **Midnightcord-Installer** : un `.exe` portable pour Windows x64, un `.zip` contenant l’application macOS Intel ou Apple Silicon, et un `.tar.gz` pour Linux x64 ou ARM64.

Sous Linux, les paquets DEB/RPM ajoutent **Install Vencord** au menu des applications ; ce lanceur ouvre l’injecteur graphite Midnightcord. Les formats AppImage et tar.gz contiennent aussi uniquement l’injecteur. Le client autonome Linux a été retiré ; voir le [guide Linux](./LINUX.md).

1. Fermez Discord complètement, y compris son icône dans la zone de notification.
2. Ouvrez l’injecteur (après extraction sur macOS et Linux).
3. Cochez les installations Discord souhaitées et cliquez sur **Installer Midnightcord**.
4. Relancez votre Discord habituel.

L’écran de chargement recherche Stable, PTB, Canary et Development. Chaque installation affiche son emplacement ; aucune n’est présélectionnée. Un Discord encore ouvert bloque l’opération : fermez-le puis cliquez sur **Actualiser**. L’injecteur ne termine pas vos processus.

Pour réparer une installation déjà équipée, sélectionnez-la et utilisez **Réparer Midnightcord**. L’onglet **Désinstallation** restaure uniquement les Discord cochés. Vos réglages et le build partagé restent dans le profil, afin de conserver les autres installations Midnightcord.

Le build et le runtime sont inclus ; l’injecteur n’effectue aucun téléchargement. Les permissions insuffisantes et les chargeurs d’autres mods sont signalés avant l’installation.

## Archives en ligne de commande

Chaque archive contient :

- le build Midnightcord minifié ;
- un runtime Node adapté au système et à l’architecture ;
- un script d’installation ;
- un script de désinstallation ;
- une somme SHA256.

Aucune installation de Node.js ou pnpm n’est nécessaire.

### Installation en ligne de commande

1. Fermez Discord complètement, y compris son icône de zone de notification.
2. Extrayez l’archive.
3. Lancez le script d’installation du système.
4. Relancez Discord normalement.

Le script détecte Discord Stable, PTB, Canary et Development. Il sélectionne uniquement la version complète la plus récente de chaque canal.

Pour cibler un canal précis :

    Install-Midnightcord.cmd --channel stable

ou sur macOS et Linux :

    ./install-midnightcord.sh --channel stable

Les canaux acceptés sont stable, ptb, canary et development.

## Fonctionnement

L’installation effectue les opérations suivantes :

1. copie le build dans le profil utilisateur ;
2. renomme app.asar en _app.asar ;
3. crée un chargeur Midnightcord dans le dossier app ;
4. conserve la sauvegarde officielle pour la restauration.

Si un autre chargeur est détecté, l’installation s’arrête sans l’écraser. Si Discord verrouille un fichier, fermez tous ses processus puis recommencez.

## Mise à jour

Le build natif vérifie automatiquement la dernière release GitHub. Lorsqu’une version plus récente existe, il télécharge le payload compilé et sa somme SHA256. L’archive est vérifiée, extraite dans un dossier temporaire puis appliquée atomiquement au prochain lancement de Discord avec rollback en cas d’échec.

La mise à jour ne coupe pas la vocal active. Elle attend le prochain redémarrage normal. L’option `disableAutoUpdate` désactive cette fonction.

Une mise à jour de Discord peut créer un nouveau dossier de version. Relancez le script d’installation afin d’injecter le chargeur dans ce nouveau dossier.

## Désinstallation en ligne de commande

Lancez le script de désinstallation inclus. Il supprime uniquement un chargeur identifié comme Midnightcord, restaure app.asar et retire le build installé du profil utilisateur.

## Build depuis les sources

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:installer

L’injecteur graphique est écrit dans `release/installer/`. Après un build `corepack pnpm build --standalone`, `corepack pnpm installer` ouvre l’interface de développement, et `node scripts/packageInstaller.mjs --dir` produit une application non archivée. Les scripts `build-installer.ps1`, `.bat` et `.sh` emballent ce même build déjà compilé.

Pour l’archive en ligne de commande :

    corepack pnpm run package:native

Le paquet du système courant est écrit dans release/native/.

Les tests `corepack pnpm test:installer` et `corepack pnpm test:installer-electron` utilisent des installations temporaires isolées. Ils n’injectent pas le Discord de l’utilisateur. Sous Linux sans écran, lancez le second via `xvfb-run -a`.

## Limites

Les installations Flatpak et Snap de Discord sont généralement en lecture seule ou isolées. Elles ne sont pas modifiées automatiquement par l’injecteur. Utilisez de préférence le paquet Discord officiel ou une installation utilisateur compatible.
