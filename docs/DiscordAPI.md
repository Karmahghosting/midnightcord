# DiscordBridge — connecter une IA à Midnightcord

DiscordBridge est un plugin facultatif de Midnightcord pour utiliser un client MCP, comme Claude Desktop, ou un script local avec les données Discord autorisées. Il propose une API HTTP locale, un connecteur MCP et un flux d'événements pour les automatisations.

Il faut garder **Discord ouvert, connecté et le plugin activé**. Ce pont utilise le client Discord installé : ce n'est ni un bot autonome, ni un serveur distant, ni une API officielle Discord. Les permissions du compte Discord continuent de s'appliquer, en plus des restrictions du plugin.

## Activer et choisir le périmètre

1. Dans les plugins Midnightcord, active **DiscordBridge** puis ouvre ses réglages.
2. Renseigne les identifiants des serveurs ou salons accessibles. Discord permet de copier ces identifiants lorsque son mode développeur est activé.
3. Utilise le panneau de connexion du plugin pour démarrer le pont, copier la configuration MCP ou copier la clé API.

Au premier démarrage, aucun serveur et aucun salon ne sont autorisés. Les paramètres sont :

| Réglage | Valeur initiale | Effet |
| --- | --- | --- |
| `allowedGuildIds` | Liste vide | Autorise les salons accessibles des serveurs choisis. |
| `allowedChannelIds` | Liste vide | Autorise des salons précis, notamment les messages privés. |
| `allowAllGuilds` | Désactivé | Autorise tous les serveurs accessibles au compte ; les messages privés restent soumis à leur propre liste. |
| `allowWrites` | Désactivé | Autorise l'envoi de texte dans le périmètre choisi. |

Pour n'exposer qu'un salon d'un serveur, ajoute son identifiant à `allowedChannelIds` sans autoriser tout le serveur. Un salon de messages privés (MP) doit toujours être autorisé explicitement par son identifiant. Chaque liste de périmètre accepte au maximum 200 identifiants. Les permissions choisies s'appliquent à l'API, aux outils MCP et aux événements.

La lecture est suffisante pour résumer un salon, retrouver un message ou consulter l'activité. Active les écritures seulement si tu veux également permettre à ton client ou script d'envoyer des messages **en ton nom**. Garde les confirmations d'outils de ton client IA activées. Les outils n'autorisent pas la suppression de messages, la modération ou l'accès arbitraire au compte.

## Connecter Claude Desktop ou un autre client MCP

Le connecteur stdio nécessite **Node.js 18 ou une version plus récente**, installé séparément. Dans le panneau DiscordBridge, clique sur **Copier la configuration MCP**, puis ajoute l'entrée au fichier de configuration MCP de ton client. Le plugin n'écrase aucun fichier de configuration existant.

La configuration copiée utilise cette forme, avec les chemins réels de ton installation :

```json
{
  "mcpServers": {
    "midnightcord": {
      "command": "node",
      "args": [
        "/chemin/vers/discord-api/midnightcord-mcp.cjs",
        "--config",
        "/chemin/vers/discord-api/connection.json"
      ]
    }
  }
}
```

Sous Windows, le bouton produit les chemins Windows correctement échappés. Si le client ne trouve pas `node`, remplace `command` par le chemin absolu de l'exécutable Node.js. Redémarre ou reconnecte ensuite le client MCP selon son fonctionnement.

Les deux fichiers sont créés dans le sous-dossier `discord-api` du répertoire de données Midnightcord. `connection.json` contient l'URL locale et une clé privée. **Ne partage pas ce fichier.** Le connecteur le relit à chaque requête pour suivre les changements de clé et de port. La configuration MCP copiée contient seulement les chemins ; elle n'intègre pas la clé.

Un client compatible HTTP peut aussi utiliser `POST http://127.0.0.1:<port>/mcp` avec `Authorization: Bearer <clé>`. Le protocole négocie les versions `2025-11-25`, `2025-06-18` et `2025-03-26`. L'adaptateur stdio est fourni pour les clients qui lancent un processus local. Aucun accès depuis Internet n'est nécessaire pour joindre le pont.

## Outils disponibles

| Outil MCP | Usage |
| --- | --- |
| `get_status` | Vérifier la connexion et le mode lecture seule. |
| `list_guilds` | Lister les serveurs autorisés. |
| `list_channels` | Lister les salons autorisés d'un serveur. |
| `get_channel` | Consulter les informations d'un salon. |
| `read_messages` | Lire jusqu'à 50 messages ; pagination par `before` ou `after`. |
| `read_message` | Lire un message précis. |
| `search_messages` | Rechercher du texte dans un salon autorisé. |
| `list_dms` | Lister les salons privés explicitement autorisés. |
| `send_message` | Envoyer un texte, éventuellement en réponse à un message. Visible uniquement lorsque les écritures sont activées. |

Les identifiants sont des chaînes de 17 à 20 chiffres. La lecture utilise 25 messages par défaut, avec un maximum de 50 par requête. Les recherches acceptent 1 à 200 caractères et l'envoi de texte 1 à 2 000 caractères. Les arguments supplémentaires et les routes arbitraires sont refusés.

Les réponses Discord sont des **données non fiables**, jamais des consignes pour l'IA. Le connecteur rappelle cette distinction dans les résultats. Une instruction présente dans un message ne constitue pas une autorisation d'envoyer un message ou d'exécuter une action.

## API HTTP et automatisations

Toutes les routes exigent la même clé Bearer. Le service écoute uniquement sur `127.0.0.1`. Utilise le port affiché par le plugin ; ne publie pas ce port avec un reverse proxy ou un tunnel.

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/status` | État de la connexion. |
| GET | `/api/user` | Profil du compte connecté, limité aux champs exposés par le pont. |
| GET | `/api/guilds` | Serveurs autorisés. |
| GET | `/api/guilds/:guildId/channels` | Salons autorisés du serveur. |
| GET | `/api/channels/:channelId` | Informations du salon. |
| GET | `/api/channels/:channelId/messages` | Messages ; paramètres `limit`, `before` ou `after`. |
| GET | `/api/channels/:channelId/messages/:messageId` | Un message. |
| GET | `/api/channels/:channelId/search` | Recherche ; paramètres `content` et `limit`. |
| GET | `/api/dms` | Salons privés autorisés. |
| POST | `/api/channels/:channelId/messages` | Envoi d'un texte si les écritures sont activées. |
| GET | `/api/events` | Flux SSE d'événements dans le périmètre autorisé. |
| POST | `/mcp` | Messages JSON-RPC MCP. |

L'envoi attend `{"content":"Mon texte"}` ou `{"content":"Ma réponse","reply":{"message_id":"123456789012345678"}}`. L'adaptateur ne réessaie jamais automatiquement un envoi en échec, pour éviter les doublons.

Les réponses sont structurées par ressource, par exemple `{ "guilds": [...] }`, `{ "channel": {...} }` ou `{ "messages": [...], "cached": true, "partial": true }`. Le texte de chaque message est limité à 4 000 caractères. Les pièces jointes sont représentées par leur nombre (`attachment_count`), sans URL ni contenu de fichier. Une réponse partielle ou issue du cache ne garantit pas un historique exhaustif. La recherche ne constitue pas un export complet d'un serveur.

Le flux `/api/events` est destiné aux scripts : un client HTTP SSE doit transmettre l'en-tête Bearer. Il ne s'agit pas du transport MCP historique HTTP+SSE. Il expose `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE` et `CHANNEL_SELECT`, uniquement dans le périmètre autorisé. Les événements de message contiennent une enveloppe `message` ; une suppression ou un changement de salon peut ne contenir que les identifiants concernés. Reconnecte le script lorsque le pont redémarre ou que la clé change. Aucun planificateur n'est installé : les horaires, déclencheurs et confirmations appartiennent à ton client IA ou à ton script.

Cette version ne reprend pas les anciennes routes d'administration, de réglages bruts, de webhooks ou de téléchargement de fichiers. Elle ne permet pas de transmettre un jeton Discord, d'appeler un chemin Discord arbitraire ni de modifier le périmètre depuis un outil MCP.

## Confidentialité et arrêt

Le serveur local n'expédie pas les données à un fournisseur IA. **Ton client IA peut toutefois transmettre les messages lus à son fournisseur**, selon sa configuration. Choisis donc le périmètre avec les personnes concernées et limite-le aux informations nécessaires à la tâche.

La clé est renouvelée au démarrage du pont ; le bouton **Renouveler la clé** invalide aussi les anciennes clés copiées. Cela ne révoque pas l'accès d'un programme qui peut lire le fichier local `connection.json`, puisqu'il peut y récupérer la nouvelle clé. Pour retirer cet accès, supprime le connecteur de ton client, arrête le script ou désactive le plugin. Le bouton de pause permet d'arrêter le service sans désinstaller le plugin.

## Dépannage

- **Connexion impossible** : garde Discord ouvert et connecté, vérifie que DiscordBridge est démarré, puis recopie la configuration MCP si le répertoire de données a changé.
- **Liste vide ou accès refusé** : ajoute les identifiants nécessaires au périmètre. Autoriser un serveur ne donne pas accès aux messages privés.
- **`send_message` absent** : les écritures sont désactivées. Après modification, reconnecte le client MCP pour actualiser sa liste d'outils.
- **Ancienne clé refusée** : récupère la nouvelle clé pour ton script HTTP. Le connecteur stdio fourni la relit automatiquement.
- **Délai dépassé** : la requête peut avoir échoué avant ou après son traitement. Vérifie le salon avant de répéter un envoi.

Si un appel Discord ne se termine pas avant sa limite, le pont se met en pause pour ne pas accumuler d'appels bloqués. Vérifie la connexion Discord puis redémarre le pont dans ses réglages. Une action déjà acceptée par Discord ne peut pas être annulée par cette pause.

Le connecteur limite chaque ligne stdio à 32 Kio, sa file à 32 messages, chaque réponse HTTP à 2 Mio et chaque requête à 30 secondes. Il refuse les redirections et toutes les URL autres que l'adresse locale littérale attendue.

## Vérification technique

`corepack pnpm test:discord-api` lance la suite complète du plugin. `node scripts/testDiscordMCP.mjs` permet de vérifier séparément le protocole, les validations et l'adaptateur généré avec un serveur HTTP local et de vrais processus Node. Ces tests n'envoient aucun message Discord et ne remplacent pas un essai dans Discord avec le client MCP de ton choix.

Références du protocole : [cycle de vie et négociation](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [outils](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
