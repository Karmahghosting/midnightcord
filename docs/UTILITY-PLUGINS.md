# Plugins pratiques

Ces six plugins sont désactivés par défaut et classés dans **Midnightcord**. Après avoir installé une version
qui les contient, ouvrez **Paramètres utilisateur → Midnightcord → Plugins**,
recherchez leur nom et activez-les.

## BetterSessions

- Consultez les appareils dans les options du plugin ou dans **Appareils** de Discord.
- Renommez chaque appareil ; un nom vide rétablit son nom d'origine.
- Activez **Vérifier périodiquement les nouvelles sessions** pour recevoir les alertes
  pendant que Discord est ouvert. L'intervalle par défaut est de 20 minutes,
  avec un minimum de 5 minutes.
- Le premier relevé enregistre les sessions existantes sans alerte. Les sessions
  découvertes ensuite sont signalées ; leur dernière utilisation reste une
  estimation fournie par Discord, affichée à la seconde dans le fuseau local.
- Les noms restent locaux et séparés par compte. Les vérifications utilisent
  uniquement l'API de sessions de Discord.

Un redémarrage est nécessaire pour appliquer les modifications à l'écran natif
**Appareils**. La liste présente dans les options du plugin permet également de
consulter et renommer les appareils.

## MessageReminders

Faites un clic droit sur un message, puis choisissez un rappel : dans une heure,
demain à 9 h ou à une date précise. Le gestionnaire est accessible dans les
options du plugin et dans la Toolbox.

À l'échéance, la fenêtre de rappels permet d'ouvrir le message, de reporter le
rappel ou de le supprimer. Les notifications bureau sont facultatives et
demandent l'autorisation du navigateur/client.

Discord doit rester ouvert pour afficher un rappel à l'heure prévue. Les rappels
manqués apparaissent au prochain démarrage du compte concerné. Les rappels sont
enregistrés localement avec un court aperçu du message ; aucun message Discord
n'est envoyé. Limites : 200 rappels et échéance dans les 366 prochains jours.

## AudioProfiles

1. Réglez votre audio dans Discord.
2. Ouvrez les options d'**AudioProfiles** ou son entrée dans la Toolbox.
3. Enregistrez les réglages actuels sous un nom, par exemple **Jeu**, **Réunion**
   ou **Musique**.
4. Utilisez **Appliquer** pour les restaurer, ou mettez à jour le profil après
   avoir ajusté vos réglages.

Un profil mémorise le microphone, la sortie, les volumes et les options de
réduction du bruit disponibles sur votre client. Un périphérique débranché est
signalé et ignoré ; les autres réglages peuvent être appliqués. Le plugin indique
les changements qu'il ne peut pas confirmer. Les profils restent locaux et
séparés par compte. Le plugin n'enregistre aucun son.

## SecretGuard — protection avant envoi

Activez le plugin pour vérifier le texte à l'envoi et à la modification. Une
alerte signale les formats courants de jetons Discord, clés API, clés privées
et mots de passe dans des variables ou URL. **Annuler et corriger** conserve le
brouillon. **Envoyer quand même** autorise seulement le texte de cette opération.
Les valeurs sont masquées dans l'alerte et ne sont pas enregistrées.

Les vérifications passent avant et après les transformations des autres plugins,
notamment la traduction. Elles ne couvrent pas tous les secrets, les pièces
jointes ni les plugins qui envoient directement via l'API. Au-delà de 32 000
caractères, l'opération est annulée : raccourcissez le texte pour le vérifier.

## LocalOCR — extraire le texte d'une image

Sur la version bureau, ouvrez **OCR local** dans les options du plugin ou la
Toolbox. Choisissez un fichier, la langue (français, anglais ou les deux), puis
**Extraire le texte**. Un clic droit sur une image du CDN Discord propose aussi
l'extraction. La récupération de cette image contacte uniquement son CDN ; le
moteur OCR travaille hors ligne avec les modèles inclus dans le paquet.

Le résultat peut être copié, sans historique ni envoi automatique. Relisez-le :
la reconnaissance peut se tromper. JPEG, PNG et WebP statiques sont acceptés,
jusqu'à 12 Mio et 12 mégapixels ; les grands côtés sont ramenés à 4096 pixels.
Une seule lecture s'exécute à la fois. Le moteur est chargé à la première lecture,
réutilisé puis arrêté après 60 secondes d'inactivité, à la fermeture de l'outil
ou à l'annulation. Une lecture expire au bout de 90 secondes.

Les modèles et le moteur ajoutent des fichiers au paquet, sans charger leurs
WASM au démarrage de Discord. Dans une installation ASAR, les fichiers OCR sont
extraits à la demande dans `ocr-runtime/<version>` du dossier de données
Midnightcord et vérifiés par SHA256. Aucune image ni résultat OCR n'y est écrit.
Il faut installer le paquet complet, y compris son dossier `ocr/` ; copier
uniquement `renderer.js` ne suffit pas. Moteur : Tesseract.js 7.0.0, modèles
français et anglais `4.0.0_best_int` (paquets 1.0.0).

## ImageOptimizer — optimiser une copie

Ouvrez l'optimiseur dans les options, la Toolbox, le menu des pièces jointes ou
le clic droit sur une image Discord. Choisissez la taille maximale, le format
WebP/JPEG/PNG et la qualité, puis **Créer l'aperçu optimisé**. L'outil compare
l'original et la copie : dimensions, octets et réduction réelle. Il indique
aussi si la copie est plus lourde.

Téléchargez la copie ou choisissez **Préparer la pièce jointe** pour l'ajouter
au brouillon de la conversation d'origine. Vérifiez puis envoyez vous-même.
L'original reste intact. La copie est réencodée sans recopier les métadonnées
EXIF/GPS ; l'orientation est appliquée. Pour JPEG, choisissez un fond blanc ou
noir à la place de la transparence. PNG conserve les pixels sans compression
destructive et n'utilise pas le curseur de qualité.

Limites : 20 Mio, 16 mégapixels, 16 384 pixels par côté à l'entrée, 4096 pixels
en sortie sans agrandir les petites images. Les animations sont refusées.
Un seul encodage s'exécute à la fois ; fermer la fenêtre annule le travail restant
et libère les aperçus. Le traitement ne nécessite aucun service externe.

## Construire et vérifier

Depuis le dépôt, avec les prérequis du README :

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build --standalone
corepack pnpm test:utilities
corepack pnpm test:images
```

Les tests navigateur nécessitent Chrome, Edge ou Chromium (`CHROME_PATH` permet
de préciser le binaire). Pour vérifier l'extraction du paquet ASAR avec le
binaire Electron de développement déjà installé : `node scripts/testLocalOcrAsar.mjs`.
Ce test n'ouvre aucune fenêtre et n'utilise pas le profil Discord.

Sur GitHub, **Utility plugins and native packages** vérifie les ajouts à `main`
et produit les archives Windows x64, macOS Intel/Apple Silicon et Linux x64/ARM64.
Les archives sont disponibles pendant sept jours dans les artefacts du workflow.
La publication d'une release reste gérée par le workflow de release existant.

Après installation, vérifiez sur votre client Discord : le renommage d'un appareil
après redémarrage, un rappel à une minute et un rappel manqué après fermeture,
puis un profil audio avec un périphérique présent et avec un périphérique
débranché. Testez SecretGuard sur un secret factice, en envoi et en modification,
avec annulation et confirmation. Ouvrez une image locale et une image Discord
dans les deux outils ; vérifiez le texte extrait et le brouillon proposé par
l'optimiseur. Vérifiez également que les listes changent lorsque vous changez de
compte. Ces essais complètent les tests automatisés ; les modules internes de
Discord peuvent évoluer indépendamment de Midnightcord.
