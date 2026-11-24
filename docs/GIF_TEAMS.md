# Teams GIF

Active **GifTeams** dans les plugins de la catégorie **Midnightcord**. Le bouton Teams GIF près de la zone de message ouvre ton espace ; un raccourci Teams est aussi ajouté à l'en-tête du sélecteur GIF compatible. Le bouton dans les réglages du plugin reste disponible si Discord change son sélecteur.

## Commencer

1. Clique sur **Activer mes teams**. L'identité Cloud existante est utilisée, ou une clé locale est créée. Cela n'active pas la sauvegarde automatique des réglages.
2. Crée une team, ou colle le code reçu dans **Rejoindre une team**.
3. Dans **Mon partage**, choisis **Tous mes favoris**, **Ma sélection** ou **Ne rien partager**, puis enregistre. Rien n'est partagé à la création ou à l'arrivée dans une team.

Le mode automatique suit les ajouts et retraits de tes favoris Discord lorsque Midnightcord est ouvert et connecté. Le mode manuel ne publie que les GIF cochés ; retirer un GIF de tes favoris le retire aussi de cette sélection. Chaque team a son propre choix de partage. Les fichiers personnalisés de FavouriteAnything ne sont pas traités comme des GIF.

Les membres peuvent filtrer les GIF partagés par personne, parcourir les pages et rechercher dans la page affichée. Cliquer sur un GIF l'ajoute au brouillon de la conversation actuelle ; valide ensuite son envoi dans Discord.

## Invitations et accès

Le propriétaire génère un code dans **Membres**. Il est valable 24 heures, utilisable une fois et révocable. Générer un nouveau code invalide le précédent. Le propriétaire peut retirer des membres ou supprimer la team. Un membre peut la quitter. Ces opérations retirent aussi les GIF partagés de la personne concernée.

Une team accepte 25 membres ; un utilisateur peut rejoindre 10 teams et partager jusqu'à 1 000 GIF par team. Les aperçus proviennent de Tenor, Giphy, Discord ou Imgur. Les autres liens HTTPS publics peuvent être partagés sans aperçu.

## Plusieurs appareils et confidentialité

Utilise la même clé Cloud et le même compte Discord pour retrouver tes teams sur un autre appareil. Les réglages Cloud permettent d'exporter ou d'importer cette clé. Chaque compte Discord obtient une identité de partage distincte, même sur le même ordinateur. Les noms affichés ne constituent pas une vérification d'identité Discord.

Les liens partagés sont lisibles par l'API et par les membres autorisés. Ils sont séparés des sauvegardes Cloud chiffrées. Les aperçus se chargent auprès de leur fournisseur. Aucun jeton Discord, message ou fichier local n'est envoyé à l'API GIF.

**Ne rien partager** vide ta collection dans une team. **Mon espace GIF → Supprimer mon espace GIF** supprime toutes tes adhésions et les teams que tu possèdes. Désactiver le plugin arrête la synchronisation, mais ne retire pas ce qui a déjà été partagé. Les sauvegardes de sécurité sont conservées au maximum 14 jours.

Les modifications concurrentes sont refusées : si un autre appareil a changé ton partage, recharge la sélection avant de l'enregistrer. Une indisponibilité de Discord ou de l'API ne transforme jamais des favoris non chargés en collection vide.

## Déploiement

L'API Cloud doit annoncer `gif-teams-v1` dans `/v1/cloud/health`. Les routes privées sont sous `/v1/cloud/gif-teams`. Installer leur zone et leur bloc Nginx dédiés dans `services/cloud-api/deploy` : la limite historique des sauvegardes est trop basse pour la navigation d'une galerie. Déployer `services/cloud-api` avec son dossier `deploy` avant le client, conserver `/var/lib/midnightcord-cloud`, puis lancer `pnpm test:gif-teams`. Le service utilise un seul processus et des écritures atomiques ; les données GIF restent dans `DATA_DIR/gif-teams` et sont incluses dans la sauvegarde quotidienne.
