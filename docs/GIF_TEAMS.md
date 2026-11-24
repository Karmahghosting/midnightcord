# Teams GIF

Active **GifTeams** dans les plugins de la catégorie **Midnightcord**. Les GIF reçus apparaissent directement dans les **Favoris** natifs de Discord. La gestion des teams reste accessible près de la zone de message, dans les réglages du plugin et dans la boîte à outils. Le sélecteur GIF n'ajoute plus de bouton Teams ; son raccourci **Dossiers** sert à ranger tes favoris.

## Commencer

1. Clique sur **Activer mes teams**. L'identité Cloud existante est utilisée, ou une clé locale est créée. Cela n'active pas la sauvegarde automatique des réglages.
2. Crée une team, ou colle le code reçu dans **Rejoindre une team**.
3. Dans **Mon partage**, choisis **Tous mes favoris**, **Ma sélection**, **Un dossier** ou **Ne rien partager**, puis enregistre. Rien n'est partagé à la création ou à l'arrivée dans une team.

Le mode automatique suit les ajouts et retraits de tes favoris Discord lorsque Midnightcord est ouvert et connecté. Le mode manuel ne publie que les GIF cochés ; retirer un GIF de tes favoris le retire aussi de cette sélection. Chaque team a son propre choix de partage. Les fichiers personnalisés de FavouriteAnything ne sont pas traités comme des GIF.

La galerie de gestion permet aussi de filtrer les GIF partagés par personne, parcourir les pages et rechercher dans la page affichée. Cliquer sur un GIF dans cette galerie l'ajoute au brouillon de la conversation actuelle ; valide ensuite son envoi dans Discord.

## Recevoir dans les favoris Discord

**Ajouter automatiquement les GIF partagés à mes favoris Discord** est activé par défaut. Les nouveaux GIF des autres membres sont ajoutés par petits lots au stockage natif de Discord, en conservant tes favoris existants et sans doublons. Tu les retrouves dans la grille et la recherche habituelles, sans ouvrir la galerie Teams. Une grande collection peut demander plusieurs passages de synchronisation.

L'option se désactive dans les réglages du plugin ou dans la fenêtre de gestion des teams. Les GIF déjà importés restent dans tes favoris lorsque tu désactives l'option ou quittes une team. Si tu retires volontairement un GIF reçu de tes favoris, l'historique local évite de le réimporter à chaque passage. Les GIF sans aperçu compatible ou au-delà de la capacité native de Discord ne remplacent jamais tes favoris existants.

Sur l'appareil qui les importe, les GIF reçus sont exclus du partage **Tous mes favoris** pour éviter de les republier automatiquement dans d'autres teams. Tu peux toutefois les partager volontairement via **Ma sélection** ou **Un dossier**. Discord peut synchroniser ses favoris sur tes autres appareils, tandis que cet historique d'origine reste local : vérifie le mode de partage de ces appareils, où **Tous mes favoris** peut inclure ces GIF.

## Dossiers de favoris

Ouvre **Dossiers** depuis le sélecteur GIF, la fenêtre Teams GIF ou les réglages du plugin. Crée un dossier, donne-lui un nom, coche les favoris à y ranger, puis enregistre. Un même GIF peut être dans plusieurs dossiers. Renommer ou supprimer un dossier ne supprime aucun favori de Discord. Le menu des dossiers dans les favoris du sélecteur GIF filtre la grille native, y compris ses résultats de recherche.

Les dossiers fonctionnent sans Cloud et sont propres au compte Discord sur cet appareil. Tu peux créer jusqu'à 100 dossiers de 1 000 GIF. Seuls les GIF déjà présents dans tes favoris peuvent y être rangés ; les fichiers FavouriteAnything sont exclus.

Pour n'en partager qu'un, choisis **Un dossier** dans **Mon partage**, sélectionne le dossier et enregistre. Les ajouts et retraits de ce dossier sont alors synchronisés avec cette team lorsque Midnightcord est ouvert sur cet appareil. Les autres dossiers restent privés. Sur un autre appareil, les GIF déjà partagés apparaissent comme une sélection manuelle ; les dossiers ne sont pas synchronisés automatiquement par le Cloud.

Si un autre appareil modifie ce partage, la synchronisation du dossier se met en pause. Vérifie le choix puis enregistre pour la reprendre. Pour supprimer un dossier lié, désactive d'abord son partage dans les teams concernées.

Le gestionnaire permet aussi de détacher un ancien lien local, par exemple après un changement de clé Cloud. Cela arrête le suivi, mais conserve les GIF déjà publiés dans la team : utilise **Ne rien partager** depuis l'identité concernée pour les retirer. Les sauvegardes manuelles du DataStore conservent les dossiers, sans leurs autorisations de suivi ; après restauration, choisis à nouveau les dossiers à partager.

## Invitations et accès

Le propriétaire génère un code dans **Membres**. Il est valable 24 heures, utilisable une fois et révocable. Générer un nouveau code invalide le précédent. Le propriétaire peut retirer des membres ou supprimer la team. Un membre peut la quitter. Ces opérations retirent aussi les GIF partagés de la personne concernée.

Une team accepte 25 membres ; un utilisateur peut rejoindre 10 teams et partager jusqu'à 1 000 GIF par team. Les aperçus proviennent de Tenor, Giphy, Discord, Imgur ou du service GIF de FxTwitter. Les images animées (dont WebP) et les vidéos utilisent le lecteur adapté à leur format. Les autres liens HTTPS publics peuvent être partagés sans aperçu.

## Plusieurs appareils et confidentialité

Utilise la même clé Cloud et le même compte Discord pour retrouver tes teams sur un autre appareil. Les réglages Cloud permettent d'exporter ou d'importer cette clé. Chaque compte Discord obtient une identité de partage distincte, même sur le même ordinateur. Les noms affichés ne constituent pas une vérification d'identité Discord.

Les liens partagés sont lisibles par l'API et par les membres autorisés. Ils sont séparés des sauvegardes Cloud chiffrées. Les aperçus se chargent auprès de leur fournisseur. Aucun jeton Discord, message ou fichier local n'est envoyé à l'API GIF.

**Ne rien partager** vide ta collection dans une team. **Mon espace GIF → Supprimer mon espace GIF** supprime toutes tes adhésions et les teams que tu possèdes. Désactiver le plugin arrête la synchronisation, mais ne retire pas ce qui a déjà été partagé. Les sauvegardes de sécurité sont conservées au maximum 14 jours.

Les modifications concurrentes sont refusées : si un autre appareil a changé ton partage, recharge la sélection avant de l'enregistrer. Une indisponibilité de Discord ou de l'API ne transforme jamais des favoris non chargés en collection vide.

## Déploiement

L'API Cloud doit annoncer `gif-teams-v1` dans `/v1/cloud/health`. Les routes privées sont sous `/v1/cloud/gif-teams`. Installer leur zone et leur bloc Nginx dédiés dans `services/cloud-api/deploy` : la limite historique des sauvegardes est trop basse pour la navigation d'une galerie. Déployer `services/cloud-api` avec son dossier `deploy` avant le client, conserver `/var/lib/midnightcord-cloud`, puis lancer `pnpm test:gif-teams`. Le service utilise un seul processus et des écritures atomiques ; les données GIF restent dans `DATA_DIR/gif-teams` et sont incluses dans la sauvegarde quotidienne.
