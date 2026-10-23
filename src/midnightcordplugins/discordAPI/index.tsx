/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { copyWithToast } from "@utils/discord";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { React, SelectedChannelStore, SelectedGuildStore, useEffect, UserStore, useState } from "@webpack/common";

import { canAccessChannel, handleDiscordRequest, serializeMessage } from "./api";
import { BridgeLifecycle } from "./lifecycle";

type NativeApi = PluginNative<typeof import("./native")>;
type Status = Awaited<ReturnType<NativeApi["getStatus"]>>;
function native(): NativeApi | undefined {
    return typeof VencordNative === "undefined" ? undefined : VencordNative.pluginHelpers.DiscordBridge as NativeApi;
}

function ids(value: string) { return [...new Set((typeof value === "string" ? value : "").split(/[\s,;]+/).filter(id => /^\d{17,20}$/.test(id)))].slice(0, 200); }
function changed() { if (bridge.enabled) void bridge.refresh(); }

const settings = definePluginSettings({
    port: {
        type: OptionType.NUMBER,
        description: "Port local (1024 à 65535). Discord doit rester ouvert pour utiliser l'API et MCP.",
        default: 3737,
        onChange: changed
    },
    allowAllGuilds: {
        type: OptionType.BOOLEAN,
        description: "Autoriser tous vos serveurs, y compris ceux rejoints plus tard. Les messages privés restent exclus sans autorisation individuelle.",
        default: false,
        onChange: changed
    },
    allowedGuildIds: {
        type: OptionType.STRING,
        description: "Identifiants des serveurs autorisés, séparés par une virgule ou un espace (200 maximum). Vide : aucun serveur autorisé.",
        default: "",
        onChange: changed
    },
    allowedChannelIds: {
        type: OptionType.STRING,
        description: "Identifiants des salons ou MP autorisés individuellement (200 maximum). Les permissions Discord restent obligatoires.",
        default: "",
        onChange: changed
    },
    allowWrites: {
        type: OptionType.BOOLEAN,
        description: "Autoriser l'envoi de messages en votre nom dans les salons autorisés. Désactivé : lecture seule. Les mentions ne notifient personne.",
        default: false,
        onChange: changed
    }
}, {
    port: { isValid: value => Number.isInteger(Number(value)) && Number(value) >= 1024 && Number(value) <= 65535 || "Choisissez un port entier de 1024 à 65535." }
});

const bridge = new BridgeLifecycle({
    native,
    account: () => UserStore.getCurrentUser()?.id ?? "",
    config: () => ({
        port: settings.store.port,
        policy: {
            accountId: UserStore.getCurrentUser()?.id ?? "",
            allowAllGuilds: settings.store.allowAllGuilds,
            allowedGuildIds: ids(settings.store.allowedGuildIds),
            allowedChannelIds: ids(settings.store.allowedChannelIds),
            allowWrites: settings.store.allowWrites
        }
    }),
    execute: handleDiscordRequest
});

function emit(type: string, channelId: unknown, data: unknown, history = false) {
    const { policy } = bridge;
    if (!bridge.running || !policy || typeof channelId !== "string" || !canAccessChannel(channelId, policy, history)) return;
    void native()?.pushEvent(type, data).catch(() => { });
}
function messageEvent(type: string, event: { message: unknown; }) {
    const message = serializeMessage(event.message);
    if (message) emit(type, message.channel_id, { message }, true);
}

function BridgePanel() {
    const [status, setStatus] = useState<Status>();
    const [error, setError] = useState("");
    const [serviceError, setServiceError] = useState("");
    const [busy, setBusy] = useState(false);
    const [connection, setConnection] = useState("");
    const scope = settings.use(["allowAllGuilds", "allowedGuildIds", "allowedChannelIds", "allowWrites"]);
    useEffect(() => {
        let mounted = true;
        let pending = false;
        const poll = async () => {
            if (pending) return;
            pending = true;
            try {
                const result = await native()?.getStatus();
                if (mounted) { setStatus(result); setServiceError(bridge.error); }
            } catch { if (mounted) setServiceError("Le service local est indisponible dans cette fenêtre."); }
            finally { pending = false; }
        };
        void poll();
        const timer = setInterval(() => { void poll(); }, 1000);
        return () => { mounted = false; clearInterval(timer); };
    }, []);

    async function action(fn: (api: NativeApi) => Promise<unknown>) {
        const api = native();
        if (!api || busy) return;
        setBusy(true); setError("");
        try { await fn(api); setStatus(await api.getStatus()); }
        catch { setError("L'opération n'a pas abouti. Vérifiez que le pont est démarré dans cette fenêtre."); }
        finally { setBusy(false); }
    }
    function grant(kind: "allowedGuildIds" | "allowedChannelIds") {
        const id = kind === "allowedGuildIds" ? SelectedGuildStore.getGuildId() : SelectedChannelStore.getChannelId();
        if (!id) { setError("Ouvrez d'abord le serveur ou le salon à autoriser."); return; }
        const values = ids(settings.store[kind]);
        if (!values.includes(id)) {
            if (values.length >= 200) { setError("La liste contient déjà 200 autorisations."); return; }
            settings.store[kind] = [...values, id].join(", ");
        }
    }
    const running = status?.running && bridge.running;
    return <section className="mc-discord-api">
        <Heading tag="h3">DiscordBridge · connexion aux IA</Heading>
        <p>Connectez Claude ou un autre client MCP à votre session Midnightcord. Consultez vos salons, recherchez des messages et utilisez les événements en direct dans vos automatisations.</p>
        <p>Vous choisissez les espaces accessibles ci-dessous. Le pont reste sur cet ordinateur ; les contenus consultés peuvent être transmis au fournisseur de votre IA par le client que vous utilisez.</p>
        {!native() ? <p role="status">La version bureau de Midnightcord est nécessaire. Redémarrez Discord après l'installation d'une mise à jour.</p> : <>
            <div className="mc-discord-api-status" role="status">
                <strong>{running ? "Pont local démarré" : status?.preparing ? "Démarrage…" : "Pont local arrêté"}</strong>
                <span>{scope.allowWrites ? "Lecture et envoi de messages" : "Lecture seule"}</span>
            </div>
            <p>{scope.allowAllGuilds ? "Tous les serveurs autorisés" : `${ids(scope.allowedGuildIds).length} serveur(s) autorisé(s)`} · {ids(scope.allowedChannelIds).length} salon(s) ou MP autorisé(s) individuellement.</p>
            <div className="mc-discord-api-actions">
                <Button disabled={busy || !bridge.enabled} onClick={() => { void action(() => running ? bridge.pause() : bridge.resume()); }}>{running ? "Mettre en pause" : "Démarrer le pont"}</Button>
                <Button variant="secondary" disabled={busy} onClick={() => grant("allowedGuildIds")}>Autoriser ce serveur</Button>
                <Button variant="secondary" disabled={busy} onClick={() => grant("allowedChannelIds")}>Autoriser ce salon / MP</Button>
            </div>
            {!bridge.enabled && <p>Activez le plugin pour démarrer le pont.</p>}
            <Heading tag="h4">Connecter un client MCP</Heading>
            <p>Installez Node.js 18 ou plus récent, puis ajoutez la configuration copiée à celle de votre client (par exemple Claude Desktop). Le fichier local de connexion est lu automatiquement ; aucune clé Discord n'est communiquée.</p>
            <div className="mc-discord-api-actions">
                <Button variant="secondary" disabled={!running || busy} onClick={() => { void action(async api => {
                    const config = JSON.stringify((await api.getConnection()).mcpConfig, null, 2);
                    setConnection(config); copyWithToast(config, "Configuration MCP copiée");
                }); }}>Copier la configuration MCP</Button>
                <Button variant="secondary" disabled={!running || busy} onClick={() => { void action(async api => { copyWithToast((await api.getConnection()).apiKey, "Clé API copiée"); }); }}>Copier la clé API</Button>
                <Button variant="secondary" disabled={!running || busy} onClick={() => { void action(async api => { await api.rotateKey(); }); }}>Renouveler la clé</Button>
            </div>
            {connection && <pre aria-label="Configuration MCP">{connection}</pre>}
            {running && <dl><dt>API HTTP</dt><dd><code>http://127.0.0.1:{status.port}/api/status</code></dd><dt>MCP HTTP</dt><dd><code>http://127.0.0.1:{status.port}/mcp</code></dd><dt>Événements SSE</dt><dd><code>http://127.0.0.1:{status.port}/api/events</code></dd></dl>}
            <p className="mc-discord-api-hint">Les appels HTTP utilisent Authorization: Bearer suivi de la clé API. La clé change à chaque démarrage. Le client MCP relit sa configuration locale ; un script utilisant une copie de la clé doit être mis à jour. Une déconnexion ou un changement de compte met le pont en pause.</p>
        </>}
        {(error || serviceError) && <p className="mc-discord-api-error" role="alert">{error || serviceError}</p>}
    </section>;
}

export default definePlugin({
    name: "DiscordBridge",
    description: "API locale et MCP pour connecter vos IA à Discord : lecture, recherche, événements et envoi facultatif dans les salons autorisés.",
    authors: [{ name: "Midnightcord", id: 0n }],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: BridgePanel,
    flux: {
        CONNECTION_OPEN: () => { void bridge.observeAccount(); },
        CURRENT_USER_UPDATE: () => { void bridge.observeAccount(); },
        LOGOUT: () => { void bridge.pause(); },
        MESSAGE_CREATE: event => { if (!event.optimistic) messageEvent("MESSAGE_CREATE", event); },
        MESSAGE_UPDATE: event => messageEvent("MESSAGE_UPDATE", event),
        MESSAGE_DELETE: event => {
            if (typeof event.id === "string" && /^\d{17,20}$/.test(event.id)) emit("MESSAGE_DELETE", event.channelId, { channel_id: event.channelId, id: event.id }, true);
        },
        CHANNEL_SELECT: event => emit("CHANNEL_SELECT", event.channelId, { channel_id: event.channelId })
    },
    start: () => { void bridge.start(); },
    stop: () => { void bridge.stop(); }
});
