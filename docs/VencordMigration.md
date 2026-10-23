# Passer de Vencord à Midnightcord

La migration comporte deux étapes : remplacer le chargeur, puis importer les réglages souhaités. Les fichiers et réglages Vencord sont conservés.

## 1. Remplacer le chargeur

Fermez complètement Discord, y compris son icône dans la zone de notification. Dans l'injecteur Midnightcord, choisissez **Depuis Vencord**, sélectionnez vos installations, puis **Migrer depuis Vencord**.

L'injecteur reconnaît les chargeurs officiels Vencord au format ASAR et ancien format dossier. Il vérifie la présence du démarrage Discord d'origine, sauvegarde le chargeur Vencord et installe Midnightcord. En cas d'échec, il tente de restaurer l'installation initiale. L'interface indique le dossier de récupération, qui contient aussi ses instructions.

Si votre chargeur est personnalisé ou non reconnu, utilisez le désinstalleur Vencord, puis installez Midnightcord. L'injecteur ne remplace pas automatiquement un autre mod inconnu.

## 2. Importer ses préférences

Après avoir relancé Discord, ouvrez **Midnightcord → Backup & Restore → Migrer depuis Vencord**. Le plugin **VencordMigration** donne également accès à cet assistant.

1. **Rechercher Vencord** détecte les dossiers habituels sur Windows, macOS et Linux. Vous pouvez aussi choisir un export JSON créé dans le Backup & Restore de Vencord.
2. Sélectionnez les catégories : plugins compatibles et préférences, puis éventuellement QuickCSS, thèmes locaux et liens HTTPS.
3. Consultez **Prévisualiser la migration**. L'aperçu distingue les modifications, valeurs conservées et plugins ignorés.
4. Cliquez sur **Sauvegarder et migrer**, puis redémarrez Discord.

Par défaut, les valeurs déjà présentes dans Midnightcord sont conservées, y compris ses valeurs par défaut déjà enregistrées. Activez explicitement **Remplacer les valeurs déjà présentes** pour reprendre les valeurs Vencord à leur place ; vérifiez alors l'aperçu.

Seuls les plugins présents dans Midnightcord et leurs options simples reconnues sont importés. Les extensions requises/internes, comptes, connexions Cloud, clés, jetons et historiques sont exclus. Les exports JSON Vencord n'incluent pas les fichiers de thèmes locaux. Le CSS peut contacter des ressources externes une fois activé.

## Sauvegarde et récupération

Une sauvegarde est créée avant toute écriture dans le dossier `migration-backups` des données Midnightcord. Le bouton **Ouvrir les sauvegardes de migration** et le résultat de l'import donnent accès à ce dossier.

La restauration d'un état exact nécessite de fermer Discord et de replacer les fichiers d'origine selon les instructions de la sauvegarde ; un import ordinaire des réglages fusionne des valeurs et ne constitue pas un retour arrière complet. Conservez votre sauvegarde jusqu'à avoir vérifié les plugins et thèmes après redémarrage.

`pnpm test:vencord-migration` couvre la détection, le filtrage, les aperçus, les conflits, les sauvegardes, les écritures interrompues et le remplacement du chargeur sur des installations fictives. Aucune installation Discord réelle n'est modifiée par ces tests.
