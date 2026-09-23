# Midnightcord sous macOS

Des archives séparées sont produites pour les Mac Intel x64 et Apple Silicon ARM64.

## Installation

1. Installez Discord dans le dossier Applications ou dans votre dossier Applications utilisateur.
2. Quittez complètement Discord avec Cmd Q.
3. Téléchargez et extrayez **Midnightcord-Installer** pour votre processeur.
4. Ouvrez **Midnightcord Installer.app**, cochez vos Discord puis cliquez sur **Installer Midnightcord**.
5. Relancez Discord normalement.

Les archives **Midnightcord-Native** et leurs scripts `.command` restent disponibles pour une installation en ligne de commande.

L’injecteur cherche Discord Stable, PTB, Canary et Development dans /Applications et dans ~/Applications.

### Première ouverture et Gatekeeper

L’injecteur porte une signature ad hoc, sans certificat Developer ID ni notarisation Apple. macOS peut donc bloquer sa première ouverture après téléchargement.

Après avoir vérifié la provenance de l’archive et son fichier SHA256, essayez d’ouvrir **Midnightcord Installer.app**. Si macOS indique que le développeur ne peut pas être vérifié, ouvrez **Réglages système → Confidentialité et sécurité → Ouvrir quand même**, puis confirmez l’ouverture. Cette exception s’applique à cette application et conserve Gatekeeper actif. Suivez la [procédure officielle Apple](https://support.apple.com/fr-fr/102445).

## Mise à jour

Après une mise à jour de Discord, quittez Discord et sélectionnez l’installation à réparer dans l’injecteur.

## Désinstallation

Quittez Discord puis utilisez l’onglet **Désinstallation** de l’injecteur. Seules les installations cochées sont restaurées ; les réglages et le build partagé sont conservés.

Le script `Uninstall Midnightcord.command` de l’archive en ligne de commande restaure également la sauvegarde officielle, puis supprime le build utilisateur partagé.

## Permissions

Une application Discord installée par un autre compte ou appartenant à root peut être en lecture seule. Dans ce cas, placez Discord dans ~/Applications afin de conserver une installation entièrement utilisateur.

## Build depuis les sources

    corepack pnpm install --frozen-lockfile
    corepack pnpm run package:installer

La CI produit les deux architectures sur des runners macOS natifs.
