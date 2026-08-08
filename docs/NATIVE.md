# Installation native

Le mode natif injecte Midnightcord dans Discord Desktop et conserve les modules officiels, notamment le moteur vocal. Il est recommandé sur Windows, macOS et Linux.

## Archives de release

Chaque archive contient :

- le build Midnightcord minifié ;
- un runtime Node adapté au système et à l’architecture ;
- un script d’installation ;
- un script de désinstallation ;
- une somme SHA256.

Aucune installation de Node.js ou pnpm n’est nécessaire.

## Installation

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

Téléchargez une nouvelle archive et relancez son script d’installation. Le build installé et le chargeur sont remplacés proprement.

Une mise à jour de Discord peut créer un nouveau dossier de version. Relancez simplement l’installation Midnightcord après la mise à jour.

## Désinstallation

Lancez le script de désinstallation inclus. Il supprime uniquement un chargeur identifié comme Midnightcord, restaure app.asar et retire le build installé du profil utilisateur.

## Build depuis les sources

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:native

Le paquet du système courant est écrit dans release/native/.

## Limites

Les installations Flatpak et Snap de Discord sont généralement en lecture seule ou isolées. Elles ne sont pas modifiées automatiquement par l’injecteur. Utilisez de préférence le paquet Discord officiel ou une installation utilisateur compatible.
