/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { FORCE_DISABLED_DEFAULT_PLUGIN_KEYS, PlainSettings, SettingsStore } from "@api/Settings";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { OptionType, type PluginNative } from "@utils/types";
import { useEffect, useRef, useState } from "@webpack/common";

import plugins from "~plugins";

import { defaultOptions, type MigrationOptions, type OptionSchema, type Registry } from "./engine";

type Native = PluginNative<typeof import("./native")>;
type Source = NonNullable<Awaited<ReturnType<Native["chooseExport"]>>>;
type Preview = Awaited<ReturnType<Native["preview"]>>;
function native(): Native | undefined { return typeof VencordNative === "undefined" ? undefined : VencordNative.pluginHelpers.VencordMigration as Native; }

export function createMigrationRegistry(): Registry {
    return Object.fromEntries(Object.entries(plugins).map(([key, plugin]) => {
        const options: Record<string, OptionSchema> = {};
        for (const [key, option] of Object.entries(plugin.settings?.def ?? plugin.options ?? {})) {
            switch (option.type) {
                case OptionType.BOOLEAN: options[key] = { type: "boolean" }; break;
                case OptionType.STRING: options[key] = { type: "string" }; break;
                case OptionType.NUMBER: options[key] = { type: "number" }; break;
                case OptionType.SELECT: options[key] = { type: "select", values: option.options.map(value => value.value) }; break;
                case OptionType.SLIDER: options[key] = option.stickToMarkers ? { type: "select", values: option.markers } : { type: "slider", min: Math.min(...option.markers), max: Math.max(...option.markers) }; break;
                // Custom structures, component state and bigint serialization are deliberately not imported.
            }
        }
        return [plugin.name, { required: plugin.required || plugin.hidden || plugin.isDependency
            || FORCE_DISABLED_DEFAULT_PLUGIN_KEYS.has(key.toLowerCase()) || FORCE_DISABLED_DEFAULT_PLUGIN_KEYS.has(plugin.name.toLowerCase()), options }];
    }));
}
const choices: { key: keyof Omit<MigrationOptions, "replace">; title: string; description: string; }[] = [
    { key: "plugins", title: "Plugins compatibles", description: "État activé/désactivé et réglages simples reconnus par Midnightcord." },
    { key: "preferences", title: "Préférences d'affichage", description: "Fenêtre et notifications compatibles." },
    { key: "quickCss", title: "QuickCSS", description: "Le code CSS personnel peut charger des ressources externes." },
    { key: "themes", title: "Thèmes CSS locaux", description: "Copie des fichiers détectés. Vencord reste intact." },
    { key: "onlineThemes", title: "Liens de thèmes en ligne", description: "Liens HTTPS sans identifiant ni paramètre. Ils contacteront leur hébergeur une fois activés." }
];

export function VencordMigrationPanel() {
    const [opened, setOpened] = useState(false);
    const [sources, setSources] = useState<Source[]>([]);
    const [selected, setSelected] = useState("");
    const [options, setOptions] = useState<MigrationOptions>({ ...defaultOptions });
    const [preview, setPreview] = useState<Preview>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [hint, setHint] = useState("");
    const [result, setResult] = useState<Awaited<ReturnType<Native["apply"]>>>();
    const mounted = useRef(true);
    const pending = useRef(false);
    const api = native();
    const source = sources.find(item => item.id === selected);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; void native()?.forget().catch(() => { }); };
    }, []);
    async function run(action: () => Promise<void>) {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError("");
        try { await action(); } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "La migration a échoué."); }
        finally { pending.current = false; if (mounted.current) setBusy(false); }
    }
    function reset() { setPreview(undefined); setResult(undefined); setHint(""); }
    async function search() {
        if (!api) return;
        setOpened(true); reset();
        const found = await api.discover();
        if (!mounted.current) return;
        setSources(found.sources); setSelected(found.sources[0]?.id ?? "");
        setHint(found.warnings.join(" ") || (found.sources.length ? "Choisissez ce que vous souhaitez récupérer, puis consultez l'aperçu." : "Aucune installation standard détectée. Exportez vos réglages depuis Vencord → Backup & Restore, puis choisissez le fichier JSON."));
    }
    async function choose() {
        if (!api) return;
        const picked = await api.chooseExport();
        if (!mounted.current || !picked) return;
        setOpened(true); reset(); setSources([picked]); setSelected(picked.id);
    }

    return <section className="vc-vencord-migration" aria-label="Migration depuis Vencord">
        <Heading>Migrer depuis Vencord</Heading>
        <Paragraph>Récupérez vos plugins compatibles, thèmes et QuickCSS. Un aperçu précède chaque import et une sauvegarde locale de Midnightcord est créée avant toute modification.</Paragraph>
        <Paragraph>Les comptes, mots de passe, clés API, jetons, connexions Cloud et historiques sont exclus. Vos fichiers Vencord ne sont jamais modifiés.</Paragraph>
        {!api && <Notice>La migration nécessite Midnightcord sur ordinateur. Utilisez une version bureau récente et redémarrez Discord après la mise à jour.</Notice>}
        <div className="vc-vencord-migration-actions">
            <Button disabled={!api || busy} onClick={() => void run(search)}>Rechercher Vencord</Button>
            <Button disabled={!api || busy} variant="secondary" onClick={() => void run(choose)}>Choisir un export JSON</Button>
        </div>
        {hint && <Paragraph>{hint}</Paragraph>}
        {opened && source && <>
            <label className="vc-vencord-migration-source">Installation ou export
                <select disabled={busy} value={selected} onChange={event => { setSelected(event.currentTarget.value); reset(); }}>
                    {sources.map(item => <option value={item.id} key={item.id}>{item.label} · {item.themes} thème(s)</option>)}
                </select>
            </label>
            {source.warnings.map((warning, index) => <Paragraph key={index}>{warning}</Paragraph>)}
            <div className="vc-vencord-migration-options">
                {choices.map(choice => <div className="vc-vencord-migration-option" key={choice.key}>
                    <div id={`vc-migration-${choice.key}`}><strong>{choice.title}</strong><p>{choice.description}</p></div>
                    <Switch checked={options[choice.key]} disabled={busy || (choice.key === "themes" && source.themes === 0) || (choice.key === "quickCss" && !source.quickCss)} aria-labelledby={`vc-migration-${choice.key}`} onChange={value => { setOptions({ ...options, [choice.key]: value }); reset(); }} />
                </div>)}
            </div>
            <div className="vc-vencord-migration-option">
                <div id="vc-migration-replace"><strong>Remplacer les valeurs déjà présentes</strong><p>Désactivé : les réglages Midnightcord existants et les thèmes portant le même nom sont conservés.</p></div>
                <Switch checked={options.replace} disabled={busy} aria-labelledby="vc-migration-replace" onChange={value => { setOptions({ ...options, replace: value }); reset(); }} />
            </div>
            {options.replace && <Notice.Warning>Les valeurs compatibles sélectionnées pourront remplacer vos réglages actuels. La sauvegarde préalable permet de revenir en arrière.</Notice.Warning>}
            <div className="vc-vencord-migration-actions"><Button disabled={busy || !!result} variant="secondary" onClick={() => void run(async () => { const value = await api!.preview(selected, createMigrationRegistry(), options); if (mounted.current) setPreview(value); })}>Prévisualiser la migration</Button></div>
            {preview && !result && <div aria-live="polite">
                <Heading>Aperçu</Heading>
                <Paragraph>{preview.imported} modification(s) prévue(s) · {preview.conflicts} valeur(s) conservée(s) · {preview.skippedPlugins.length} plugin(s) non importé(s) · {preview.skippedFields} champ(s) ignoré(s).</Paragraph>
                {!!preview.conflicts && !options.replace && <Notice>Midnightcord initialise déjà des valeurs par défaut, même sur une nouvelle installation. Elles sont conservées ici. Pour reprendre les valeurs compatibles de Vencord, activez « Remplacer les valeurs déjà présentes », puis générez un nouvel aperçu.</Notice>}
                {preview.rows.length > 0 && <div className="vc-vencord-migration-table"><table><thead><tr><th>Plugin Vencord</th><th>État source</th><th>Champs importés</th><th>Conservés</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.enabled === undefined ? "Non précisé" : row.enabled ? "Activé" : "Désactivé"}</td><td>{row.imported}</td><td>{row.conflicts}</td></tr>)}</tbody></table></div>}
                {!!preview.skippedPlugins.length && <Paragraph>Plugins absents, internes ou exclus : {preview.skippedPlugins.join(", ")}</Paragraph>}
                <Paragraph>{preview.themes.length} thème(s) local(aux) à copier{preview.themes.length ? ` : ${preview.themes.join(", ")}` : ""}. QuickCSS : {preview.quickCss ? "à importer" : "conservé"}.</Paragraph>
                <Button disabled={busy || !preview.imported} onClick={() => void run(async () => {
                    const applied = await api!.apply(preview.id);
                    // Keep the original Settings/PlainSettings references until the requested restart.
                    Object.assign(PlainSettings, VencordNative.settings.get());
                    SettingsStore.markAsChanged();
                    if (mounted.current) setResult(applied);
                })}>Sauvegarder et migrer</Button>
            </div>}
        </>}
        {busy && <Paragraph role="status">Traitement en cours…</Paragraph>}
        {error && <Notice.Danger role="alert">{error}</Notice.Danger>}
        {result && <Notice.Positive><p>{result.imported} modification(s) appliquée(s). Redémarrez Discord pour activer les plugins et thèmes importés.</p><p>Sauvegarde : {result.backup}. Pour revenir exactement à la configuration précédente, ouvrez ce dossier, fermez complètement Discord et suivez README.txt. Il indique les fichiers à remplacer et les thèmes ajoutés à retirer. L'import classique des réglages ne suffit pas à annuler une migration.</p></Notice.Positive>}
        {api && <div className="vc-vencord-migration-actions"><Button variant="link" size="small" disabled={busy} onClick={() => void run(() => api.openBackups())}>Ouvrir les sauvegardes de migration</Button></div>}
    </section>;
}
