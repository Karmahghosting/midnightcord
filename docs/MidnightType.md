# MidnightType

MidnightType propose une courte suite à votre message dans le champ de saisie Discord.
Il est facultatif et désactivé par défaut, dans la catégorie **Midnightcord**.

## Activation

1. Activez **MidnightType** dans les réglages des plugins.
2. Ouvrez ses réglages, puis **Télécharger et activer**.
3. Le moteur et son modèle représentent environ **520 Mo** de téléchargement. Prévoyez au moins **1,5 Go d'espace disque libre** pour les fichiers temporaires et leur extraction.
4. Après une pause dans la frappe, la suggestion apparaît en gris. **Tab** accepte le mot suivant, **Échap** ignore la suggestion. Une option permet d'accepter toute la suggestion courte.

Le téléchargement peut être annulé. Le bouton du champ de saisie permet de mettre les suggestions en pause ; ses réglages permettent de les réactiver. Aucun message n'est envoyé automatiquement.

## Confidentialité et fonctionnement

- Le modèle fonctionne sur le **processeur de votre ordinateur**, sans clé API ni abonnement Cloud.
- Le téléchargement initial contacte GitHub et Hugging Face. Les versions et empreintes SHA-256 sont figées et vérifiées.
- La génération utilise uniquement une connexion locale `127.0.0.1` protégée par une clé temporaire. Les brouillons ne partent pas vers ces hébergeurs.
- Seuls les 1 024 derniers caractères du brouillon actif sont fournis au modèle. Les conversations précédentes et l'historique des autres utilisateurs ne sont pas lus.
- Aucun journal des brouillons n'est conservé. Le moteur s'arrête après une minute d'inactivité, à la désactivation ou à la fermeture du client.
- Quatre threads CPU au maximum ; contexte et longueur des réponses limités. Le premier appel après l'arrêt du moteur est plus lent.

## Limites de cette première version

Le petit modèle peut produire une suggestion maladroite : relisez-la avant de l'accepter. Il complète le texte ; il ne remplace pas automatiquement la grammaire de votre message.

Les suggestions sont suspendues pendant une composition IME, dans les commandes, les blocs de code, les URL, l'autocomplétion native, les messages sur plusieurs lignes et quand plusieurs zones de saisie sont ouvertes. Le curseur doit être à la fin du message. Tab conserve son comportement habituel en l'absence de suggestion visible.

Des moteurs CPU sont prévus pour Windows, macOS et Linux en x64/arm64. La génération réelle a été vérifiée sur Windows x64 ; les autres plateformes nécessitent une validation d'exécution. Les performances dépendent du processeur et de la mémoire disponible.

## Composants tiers

- [llama.cpp](https://github.com/ggml-org/llama.cpp), licence MIT, version b11840.
- [Qwen2.5-0.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF), licence Apache 2.0, quantification Q4_K_M.

Les notices accompagnent le cache local. Le modèle n'est pas inclus dans les archives d'installation de Midnightcord.

## Vérification

`pnpm test:midnight-type` vérifie le contrôleur, les téléchargements, le moteur et l'IPC avec des fixtures. `pnpm test:midnight-type-browser` vérifie le compositeur dans Chrome/Edge. Ces fixtures ne remplacent pas un essai dans Discord.

Le test facultatif `node scripts/testMidnightTypeNative.mjs --smoke <dossier-cache>` télécharge le vrai modèle et exécute une génération locale.
