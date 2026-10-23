/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MAX_JSON_BYTES = 8 * 1024 * 1024;
export const MAX_CSS_BYTES = 2 * 1024 * 1024;
export const MAX_THEMES = 100;
export type JsonObject = Record<string, any>;
export interface MigrationSource { id: string; label: string; settings: JsonObject; quickCss: string; themes: { name: string; content: string; }[]; warnings: string[]; }
export interface OptionSchema { type: "boolean" | "string" | "number" | "select" | "slider"; values?: (string | number | boolean)[]; min?: number; max?: number; }
export interface PluginSchema { required?: boolean; options: Record<string, OptionSchema>; }
export type Registry = Record<string, PluginSchema>;
export interface MigrationOptions { plugins: boolean; preferences: boolean; quickCss: boolean; themes: boolean; onlineThemes: boolean; replace: boolean; }
export const defaultOptions: MigrationOptions = { plugins: true, preferences: true, quickCss: false, themes: false, onlineThemes: false, replace: false };
const dangerous = new Set(["__proto__", "prototype", "constructor"]);
const privateKey = /token|secret|password|credential|authorization|api.?key|cookie|webhook|account|session|cloud|history|message.?log|login|customUploader/i;
const privatePlugin = /token|account|session|cloud|history|message.?log|auth/i;
const privateValue = /(?:mfa\.[\w-]{20,}|[MN][A-Za-z\d_-]{20,}\.[\w-]{5,}\.[\w-]{20,}|(?:gh[opusr]_|sk-|gsk_)[\w-]{20,}|https?:\/\/[^/\s]+:[^/\s]+@|[?&](?:token|key|api.?key|secret|password)=)/i;

export function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function assertSafeTree(value: unknown) {
    let nodes = 0;
    function visit(item: unknown, depth: number) {
        if (++nodes > 60000 || depth > 20) throw new Error("Le fichier dépasse les limites de complexité.");
        if (typeof item === "string" && item.length > MAX_CSS_BYTES) throw new Error("Une valeur du fichier est trop volumineuse.");
        if (item !== null && typeof item === "object") {
            if (Array.isArray(item) && item.length > 10000) throw new Error("Une liste du fichier est trop volumineuse.");
            for (const [key, child] of Object.entries(item)) {
                if (dangerous.has(key)) throw new Error("Le fichier contient une clé interdite.");
                visit(child, depth + 1);
            }
        }
    }
    visit(value, 0);
}

export function parseBackup(text: string): { settings: JsonObject; quickCss: string; } {
    if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new Error("Le fichier JSON dépasse 8 Mio.");
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error("Le fichier JSON est invalide."); }
    assertSafeTree(data);
    if (!isObject(data)) throw new Error("Sauvegarde Vencord invalide.");
    // Official Vencord export: { settings, quickCss }. Also accepts settings/settings.json.
    const settings = Object.hasOwn(data, "settings") ? data.settings : data;
    if (!isObject(settings) || !isObject(settings.plugins)) throw new Error("Cette sauvegarde ne contient pas de réglages Vencord.");
    if (data.quickCss !== undefined && typeof data.quickCss !== "string") throw new Error("QuickCSS invalide.");
    return { settings, quickCss: data.quickCss ?? "" };
}

export function safeThemeName(name: unknown): name is string {
    return typeof name === "string" && name.length <= 180 && !/[\x00-\x1f<>:"/\\|?*]/.test(name) && !name.startsWith(".") && /\.css$/i.test(name) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
export function safeThemeUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2048 || privateValue.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
}
function validOption(value: unknown, schema: OptionSchema) {
    if (typeof value === "string" && (value.length > 4096 || privateValue.test(value))) return false;
    switch (schema.type) {
        case "boolean": return typeof value === "boolean";
        case "string": return typeof value === "string";
        case "number": return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e9;
        case "select": return schema.values?.includes(value as never) ?? false;
        case "slider": return typeof value === "number" && Number.isFinite(value) && value >= (schema.min ?? 0) && value <= (schema.max ?? 100);
        default: return false;
    }
}
const own = (value: JsonObject, key: string) => Object.hasOwn(value, key);
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

export function planMigration(source: MigrationSource, current: JsonObject, currentCss: string, existingThemes: string[], registry: Registry, options: MigrationOptions) {
    assertSafeTree(source.settings);
    assertSafeTree(registry);
    if (!isObject(source.settings.plugins) || !isObject(registry)) throw new Error("Réglages de migration invalides.");
    const settings = clone(current);
    const rows: { name: string; enabled?: boolean; imported: number; conflicts: number; }[] = [];
    const skippedPlugins: string[] = [];
    let imported = 0;
    let conflicts = 0;
    let skippedFields = 0;
    function assign(target: JsonObject, key: string, value: any) {
        if (own(target, key) && JSON.stringify(target[key]) === JSON.stringify(value)) return false;
        if (!options.replace && own(target, key)) { conflicts++; return false; }
        target[key] = clone(value);
        imported++;
        return true;
    }
    if (options.plugins) {
        settings.plugins ??= {};
        for (const [name, incoming] of Object.entries(source.settings.plugins)) {
            if (!own(registry, name) || privatePlugin.test(name) || !isObject(incoming) || registry[name].required) { skippedPlugins.push(name); continue; }
            const target = settings.plugins[name] ?? {};
            const before = imported;
            const beforeConflicts = conflicts;
            for (const [key, value] of Object.entries(incoming)) {
                const schema = key === "enabled" ? { type: "boolean" as const } : registry[name].options[key];
                if (privateKey.test(key) || !schema || !validOption(value, schema)) { skippedFields++; continue; }
                assign(target, key, value);
            }
            if (imported > before) settings.plugins[name] = target;
            rows.push({ name, enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : undefined, imported: imported - before, conflicts: conflicts - beforeConflicts });
        }
    }
    if (options.preferences) {
        for (const key of ["frameless", "transparent", "winCtrlQ", "disableMinSize", "winNativeTitleBar"]) {
            if (typeof source.settings[key] === "boolean") assign(settings, key, source.settings[key]);
        }
        const { notifications } = source.settings;
        if (isObject(notifications)) {
            settings.notifications ??= {};
            const schemas: Record<string, OptionSchema> = {
                timeout: { type: "slider", min: 1000, max: 60000 }, position: { type: "select", values: ["top-right", "bottom-right"] },
                useNative: { type: "select", values: ["always", "never", "not-focused"] }, missed: { type: "boolean" }, logLimit: { type: "slider", min: 0, max: 1000 }
            };
            for (const [key, schema] of Object.entries(schemas)) if (validOption(notifications[key], schema)) assign(settings.notifications, key, notifications[key]);
        }
    }
    let quickCss: string | undefined;
    if (options.quickCss && typeof source.settings.useQuickCss === "boolean") assign(settings, "useQuickCss", source.settings.useQuickCss);
    if (options.quickCss && source.quickCss && source.quickCss !== currentCss) {
        if (new TextEncoder().encode(source.quickCss).length > MAX_CSS_BYTES) throw new Error("QuickCSS dépasse 2 Mio.");
        if (currentCss.trim() && !options.replace) conflicts++;
        else { quickCss = source.quickCss; imported++; }
    }
    const themes = options.themes ? source.themes.filter(theme => {
        if (!safeThemeName(theme.name) || new TextEncoder().encode(theme.content).length > MAX_CSS_BYTES) { skippedFields++; return false; }
        if (existingThemes.some(name => name.toLowerCase() === theme.name.toLowerCase()) && !options.replace) { conflicts++; return false; }
        return true;
    }).slice(0, MAX_THEMES) : [];
    const copiedNames = new Set(themes.map(theme => theme.name));
    if (themes.length) {
        const enabled = Array.isArray(source.settings.enabledThemes) ? source.settings.enabledThemes.filter((name: unknown) => safeThemeName(name) && copiedNames.has(name)) : [];
        // Existing enabled themes stay enabled. Only the selected source files can be newly enabled.
        settings.enabledThemes = [...new Set([...(Array.isArray(settings.enabledThemes) ? settings.enabledThemes : []), ...enabled])];
    }
    if (options.onlineThemes && Array.isArray(source.settings.themeLinks)) {
        const links = source.settings.themeLinks.filter(safeThemeUrl).slice(0, 100);
        skippedFields += source.settings.themeLinks.length - links.length;
        settings.themeLinks = [...new Set([...(Array.isArray(settings.themeLinks) ? settings.themeLinks : []), ...links])];
        const enabled = Array.isArray(source.settings.enabledThemeLinks) ? source.settings.enabledThemeLinks.filter((link: unknown) => typeof link === "string" && links.includes(link)) : links;
        settings.enabledThemeLinks = [...new Set([...(Array.isArray(settings.enabledThemeLinks) ? settings.enabledThemeLinks : []), ...enabled])];
        // Preserve names only for accepted HTTPS URLs; no private CSS variables or arbitrary keys.
        if (isObject(source.settings.themeNames)) {
            settings.themeNames ??= {};
            for (const link of links) if (typeof source.settings.themeNames[link] === "string" && source.settings.themeNames[link].length <= 120) assign(settings.themeNames, link, source.settings.themeNames[link]);
        }
        imported += links.filter((link: string) => !current.themeLinks?.includes(link)).length;
    }
    return { settings, quickCss, themes, rows, skippedPlugins, skippedFields, conflicts, imported: imported + themes.length };
}
