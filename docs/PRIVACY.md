# Confidentialité

La version native de Midnightcord fonctionne sans compte cloud Midnightcord et sans synchronisation distante des réglages.

## Fonctions retirées

- Synchronisation des réglages avec Midnightcord Cloud, Equicord Cloud ou Vencord Cloud
- Authentification OAuth et stockage distant des profils, badges et votes de plugins
- Mellowtel et tout partage de bande passante
- Fil Midnightcord distant interrogé en arrière-plan
- Recherche et téléchargement automatiques des mises à jour dans les archives natives

Les réglages de badges sont conservés uniquement dans le stockage local de Discord. Le transfert entre machines passe par l’export et l’import manuels dans `Backup & Restore`.

## Télémétrie Discord

Le plugin interne `NoTrack` est obligatoire. Il bloque les événements Analytics, les métriques et le rapport de crash Sentry de Discord. Le test de release vérifie que ce blocage reste activé.

Discord doit toujours communiquer avec ses propres services pour la connexion, les messages, les salons vocaux et les autres fonctions normales du client. Midnightcord ne peut pas supprimer ces communications sans rendre Discord inutilisable.

## Plugins réseau

Certains plugins optionnels ont besoin d’un service choisi par l’utilisateur, par exemple la traduction, une API d’intelligence artificielle, un lecteur multimédia ou un hébergeur de fichiers. Ces appels ne font pas partie du cloud Midnightcord. Désactivez les plugins concernés si vous ne souhaitez pas utiliser leurs services externes.

## Vérification

Après la compilation, exécutez :

    corepack pnpm test:privacy

Ce test échoue si une API cloud Midnightcord, Mellowtel ou une ancienne clé de synchronisation réapparaît dans le code source ou dans le build natif.
