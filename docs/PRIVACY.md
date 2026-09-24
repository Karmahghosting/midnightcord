# Confidentialité

Midnightcord fonctionne sans compte Midnightcord. La synchronisation Cloud est facultative et désactivée par défaut.

## Midnightcord Cloud

Si vous activez Midnightcord Cloud, le client crée une clé de récupération sur votre appareil. Cette clé produit deux secrets distincts : un identifiant d'accès pseudonyme et une clé AES-256-GCM. Les réglages sont chiffrés localement avant leur envoi à `api.midnightcord.fr`. La clé de récupération et la clé de déchiffrement ne sont jamais envoyées au serveur.

Vous choisissez séparément de synchroniser :

- les préférences Midnightcord et les réglages de plugins ;
- le contenu QuickCSS.

Les jetons Discord, les identifiants de compte Discord, les mots de passe, les messages, les appels et les fichiers locaux ne font pas partie du Cloud. Les secrets locaux Midnightcord et l'état technique de synchronisation sont également exclus des exports.

Le serveur conserve uniquement les blocs chiffrés et les métadonnées nécessaires au service : type d'élément, taille, numéro de version, date de modification, empreinte du bloc chiffré et identifiant de compte dérivé du secret d'accès. Il garde au plus cinq anciennes versions chiffrées par élément ; elles sont supprimées quand elles sortent de la rétention ou quand l'élément est effacé. Il limite temporairement les requêtes par identifiant et adresse réseau pour prévenir les abus. Il ne peut pas lire le contenu synchronisé ni récupérer une clé perdue.

Les commandes de Midnightcord permettent de supprimer les éléments Cloud, d'effacer entièrement le compte Cloud ou de dissocier seulement l'appareil. La suppression d'un élément ou du compte retire immédiatement ses versions actives et historiques. Une copie chiffrée peut rester au maximum 14 jours dans les sauvegardes de sécurité avant expiration.

## Mode calme

Le mode calme filtre localement les notifications entrantes pendant les heures choisies et laisse passer les identifiants VIP configurés. Son récapitulatif conserve uniquement un compteur local par compte ; le contenu des messages n'est ni stocké ni envoyé.

## Bouclier de confidentialité

Le Bouclier de confidentialité s'active lorsque vous partagez votre écran depuis Discord. Il peut flouter les identités, le contenu des messages, la liste des messages privés et les aperçus de notifications dans l'interface Discord. Il filtre aussi localement les alertes de messages entrants pendant le partage et ne conserve qu'un compteur en mémoire, affiché à la fin. Aucun contenu masqué ou message n'est enregistré ni transmis par cette extension. Elle ne contrôle pas les notifications du système d'exploitation ni les autres applications, et ne masque pas les éléments situés hors des zones Discord ciblées.

### Rejoindre le serveur communautaire

Quand Cloud est activé, Midnightcord peut afficher une action distincte pour rejoindre le serveur officiel. Rien ne se passe sans clic et autorisation OAuth Discord. Cette autorisation demande uniquement `identify` et `guilds.join`, puis le serveur Cloud transmet la demande d'adhésion au bot Midnightcord. Le jeton OAuth sert à cette opération ponctuelle, reste en mémoire le temps de l'appel, n'est ni écrit sur disque ni inclus dans les données Cloud, et n'est pas conservé pour une adhésion future. Le serveur Cloud reçoit temporairement l'identifiant Discord du compte autorisé afin d'effectuer l'ajout. L'utilisateur peut refuser l'autorisation ou la retirer dans les paramètres des applications autorisées Discord.

Le serveur communautaire et le bot doivent déjà exister et être configurés. Si le serveur n'est pas encore disponible, l'utilisateur devra relancer l'action après son ouverture ; Midnightcord ne met pas les comptes en attente et ne stocke pas de jetons pour les ajouter ultérieurement.

## Mises à jour GitHub

L'auto-update natif contacte uniquement `api.github.com` et `github.com/Karmahghosting/midnightcord`. La requête contient un User-Agent avec la version Midnightcord. Aucun réglage, compte Discord, message, salon ou identifiant utilisateur n'est envoyé.

Le payload est limité au build compilé, contrôlé par SHA256, extrait avec protection contre les traversées de chemins puis appliqué atomiquement au lancement suivant. L'option `disableAutoUpdate` permet de désactiver la vérification.

Un dépôt privé nécessite la variable locale `MIDNIGHTCORD_GITHUB_TOKEN`. Le token n'est jamais embarqué dans les builds ni enregistré par Midnightcord.

## Badges

Les préférences d'affichage des badges restent locales. Lorsqu'un profil est affiché, le plugin de badges peut envoyer uniquement l'identifiant Discord de ce profil à `api.midnightcord.fr/v1/badge` pour récupérer son badge public. Midnightcord ne télécharge jamais la liste complète des badges.

## Télémétrie Discord

Le plugin interne `NoTrack` est obligatoire. Il bloque les événements Analytics, les métriques et le rapport de crash Sentry de Discord. Le test de release vérifie que ce blocage reste activé.

Discord doit toujours communiquer avec ses propres services pour la connexion, les messages, les salons vocaux et les autres fonctions normales du client. Midnightcord ne peut pas supprimer ces communications sans rendre Discord inutilisable.

## Plugins réseau

Certains plugins optionnels ont besoin d'un service choisi par l'utilisateur, par exemple la traduction, une API d'intelligence artificielle, un lecteur multimédia ou un hébergeur de fichiers. Ces appels ne font pas partie du Cloud Midnightcord. Désactivez les plugins concernés si vous ne souhaitez pas utiliser leurs services externes.

Lorsque son option Spotify est active, DynamicIslande utilise la connexion Spotify déjà gérée par Discord pour consulter `api.spotify.com/v1/me/player` et envoyer les commandes choisies dans le lecteur. Aucun identifiant Spotify supplémentaire n'est demandé ni stocké par ce plugin.

## Vérification

Après la compilation, exécutez :

    corepack pnpm test:privacy
    corepack pnpm test:cloud

Ces tests contrôlent les limites de données, le chiffrement, l'isolation des comptes, la suppression et l'absence des anciens services Nightcord.
