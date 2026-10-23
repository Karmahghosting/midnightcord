/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { React, SelectedChannelStore, useEffect, UserStore, useState } from "@webpack/common";

import Plugins from "~plugins";

import { readComposer, SuggestionOverlay } from "./composer";
import { sameDraft, TypingController, TypingLanguage, TypingSuggestion } from "./controller";

type NativeApi = PluginNative<typeof import("./native")>;
type ModelStatus = Awaited<ReturnType<NativeApi["status"]>>;
function native(): NativeApi | undefined {
    return typeof VencordNative === "undefined" ? undefined : VencordNative.pluginHelpers.MidnightType as NativeApi;
}

let active = false;
let ready = false;
let composing = false;
let lastError = "";
let setupTask: Promise<void> | undefined;
let setupCancelled = false;
let displayed: TypingSuggestion | undefined;
const overlay = new SuggestionOverlay();

const settings = definePluginSettings({
    isActive: {
        type: OptionType.BOOLEAN,
        description: "Proposer la suite du message pendant la frappe (modèle local requis).",
        default: false,
        onChange: () => { void refresh(); }
    },
    language: {
        type: OptionType.SELECT,
        description: "Langue des suggestions.",
        options: [
            { label: "Automatique", value: "auto", default: true },
            { label: "Français", value: "fr" },
            { label: "English", value: "en" }
        ],
        onChange: () => controller.reset()
    },
    acceptMode: {
        type: OptionType.SELECT,
        description: "Texte ajouté quand vous appuyez sur Tab.",
        options: [
            { label: "Le mot suivant", value: "word", default: true },
            { label: "Toute la suggestion courte", value: "phrase" }
        ]
    },
    delay: {
        type: OptionType.SLIDER,
        description: "Pause avant une suggestion, en millisecondes. Une pause plus longue réduit le travail du processeur.",
        markers: [300, 500, 750, 1000, 1500],
        default: 500,
        stickToMarkers: true,
        onChange: () => controller.reset()
    }
});

function current() {
    if (!active || !ready || !settings.store.isActive || composing) return;
    const account = UserStore.getCurrentUser()?.id;
    const channel = SelectedChannelStore.getChannelId();
    if (!account || !channel) return;
    return readComposer(`${account}:${channel}`);
}

const controller = new TypingController({
    current,
    complete: async (id, prefix) => native()?.complete(id, prefix, settings.store.language as TypingLanguage) ?? "",
    cancel: id => { void native()?.cancel(id).catch(() => { }); },
    delay: () => settings.store.delay,
    changed: value => { displayed = value; paint(); },
    failed: () => {
        lastError = "Le moteur local n'a pas répondu. Ouvrez les réglages MidnightType pour vérifier son état.";
    }
});

function paint() {
    const draft = current();
    if (!displayed || !draft || !sameDraft(displayed.draft, draft)) { overlay.hide(); return; }
    overlay.show(draft, displayed.text);
}
function update() { controller.observe(); paint(); }
function clear() { controller.reset(); }
function release() { clear(); void native()?.release().catch(() => { }); }

async function refresh() {
    clear();
    if (!active || !settings.store.isActive) {
        ready = false;
        void native()?.release().catch(() => { });
        return;
    }
    try {
        const status = await native()?.status();
        ready = active && settings.store.isActive && status?.state === "ready";
        if (ready) update();
    } catch { ready = false; }
}

function onKey(event: KeyboardEvent) {
    if (event.isComposing || composing) return;
    if (event.key === "Escape") { controller.dismiss(); return; }
    if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !overlay.visible) return;
    const text = controller.take(settings.store.acceptMode === "word");
    if (!text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    insertTextIntoChatInputBox(text);
    // INSERT_TEXT updates Slate through Discord; observe only after that update.
    requestAnimationFrame(() => { if (active) update(); });
}

function onCompositionStart() { composing = true; clear(); }
function onCompositionEnd() { composing = false; update(); }
function onVisibility() {
    clear();
    if (document.visibilityState === "hidden" && !setupTask) void native()?.release().catch(() => { });
}

const events: [string, EventListener, boolean?][] = [
    ["input", update], ["selectionchange", update], ["focusin", update], ["focusout", clear],
    ["compositionstart", onCompositionStart], ["compositionend", onCompositionEnd],
    ["visibilitychange", onVisibility], ["keydown", onKey as EventListener, true],
    ["scroll", clear, true]
];

function ModelPanel() {
    const [status, setStatus] = useState<ModelStatus>();
    const [busy, setBusy] = useState(!!setupTask);
    const [error, setError] = useState(lastError);
    const { isActive } = settings.use(["isActive"]);
    useEffect(() => {
        let mounted = true;
        const poll = async () => {
            try {
                const state = await native()?.status();
                if (mounted) { setStatus(state); setBusy(!!setupTask || state?.state === "downloading"); setError(lastError); }
            } catch { if (mounted) setError("Impossible de contacter le moteur local. Redémarrez Midnightcord après sa mise à jour."); }
        };
        void poll();
        const interval = setInterval(() => { void poll(); }, 1000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    function setup() {
        const api = native();
        if (!api || setupTask) return;
        lastError = "";
        setupCancelled = false;
        setError(""); setBusy(true);
        setupTask = (async () => {
            try {
                const result = await api.setup();
                if (result.state !== "ready") throw new Error("setup-failed");
                if (active && !setupCancelled) { settings.store.isActive = true; await refresh(); }
            } catch {
                if (!setupCancelled) lastError = "Téléchargement ou préparation impossible. Vérifiez l'espace disque et la connexion, puis réessayez.";
            } finally { setupTask = undefined; }
        })();
    }

    async function apiCancel() {
        try { await native()?.release(); }
        catch { lastError = "L'annulation n'a pas abouti. Désactivez le plugin pour arrêter le moteur."; }
    }

    const installed = status?.state === "ready";
    const modelError = status?.state === "error" && status.supported
        ? "Le moteur local est indisponible. Utilisez Réessayer pour vérifier ou réparer son installation."
        : "";
    return <section className="mc-type-settings">
        <Heading tag="h3">MidnightType · saisie locale</Heading>
        <p>La suite de votre message apparaît en gris. <kbd>Tab</kbd> l'accepte ; <kbd>Échap</kbd> l'ignore. Les mentions, emojis et commandes Discord gardent la priorité. Aucun message n'est envoyé automatiquement.</p>
        <p>Le téléchargement initial du moteur et du modèle représente environ 520 Mo. Ensuite, le texte reste sur cet appareil : aucune clé API ni connexion Cloud requise. Le processeur travaille seulement après une pause dans la frappe et le moteur libère sa mémoire après une période d'inactivité.</p>
        {!native() ? <p role="status">Disponible dans la version bureau de Midnightcord. Redémarrez Discord après l'installation de cette mise à jour.</p>
            : status?.supported === false ? <p role="status">Ce système ou cette architecture n'est pas encore pris en charge par le moteur local.</p>
                : <>
                    <p role="status">{busy ? "Téléchargement et vérification des fichiers…" : installed ? "Modèle local installé." : "Modèle local à télécharger."}</p>
                    {busy && <progress aria-label="Téléchargement du modèle" max={100} value={Math.max(0, Math.min(100, (status?.progress ?? 0) * 100))} />}
                    <div className="mc-type-actions">
                        {busy && <Button variant="secondary" onClick={() => { setupCancelled = true; ready = false; settings.store.isActive = false; void apiCancel(); }}>Annuler le téléchargement</Button>}
                        {!installed && <Button disabled={busy || !active} onClick={setup}>{modelError ? "Réessayer" : "Télécharger et activer"}</Button>}
                        {installed && <Button disabled={!active} variant={isActive ? "secondary" : "primary"} onClick={() => { settings.store.isActive = !isActive; }}>{isActive ? "Mettre en pause" : "Activer les suggestions"}</Button>}
                        {error && <Button variant="secondary" onClick={() => { lastError = ""; setError(""); void refresh(); }}>Réessayer</Button>}
                    </div>
                </>}
        {!active && native() && <p>Activez d'abord le plugin MidnightType pour préparer le modèle.</p>}
        {(error || modelError) && <p className="mc-type-error" role="alert">{error || modelError}</p>}
        <p className="mc-type-hint">La première suggestion peut demander un peu plus de temps au chargement du modèle. La vitesse dépend du processeur ; seuls les derniers caractères du brouillon actif sont utilisés. Les suggestions sont suspendues pour les messages sur plusieurs lignes et lorsque plusieurs zones de saisie sont ouvertes.</p>
        <p className="mc-type-hint">Moteur <a href="https://github.com/ggml-org/llama.cpp" target="_blank" rel="noreferrer">llama.cpp (MIT)</a> · modèle <a href="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF" target="_blank" rel="noreferrer">Qwen2.5 0.5B (Apache 2.0)</a>.</p>
    </section>;
}

function TypeIcon() {
    return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* Lucide TextCursorInput, ISC license. */}
        <path d="M5 4h1a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5M13 4h-1a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h1M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7M9 7v10" />
    </svg>;
}
const TypeButton: ChatBarButtonFactory = ({ type }) => {
    const { isActive } = settings.use(["isActive"]);
    if (type.analyticsName !== "normal") return null;
    return <ChatBarButton tooltip={isActive ? "MidnightType · mettre en pause" : "MidnightType · suggestions locales"}
        onClick={() => {
            if (ready && isActive) settings.store.isActive = false;
            else openPluginModal(Plugins.MidnightType);
        }} onContextMenu={() => openPluginModal(Plugins.MidnightType)}><TypeIcon /></ChatBarButton>;
};

export default definePlugin({
    name: "MidnightType",
    description: "Suggestions locales pendant la frappe : Tab pour accepter, Échap pour ignorer. Modèle facultatif à télécharger sur la version bureau.",
    authors: [{ name: "Midnightcord", id: 0n }],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: ModelPanel,
    chatBarButton: { icon: TypeIcon, render: TypeButton },
    flux: { CHANNEL_SELECT: clear, LOGOUT: release },
    start() {
        active = true;
        for (const [event, listener, capture] of events) document.addEventListener(event, listener, capture);
        window.addEventListener("resize", clear);
        void refresh();
    },
    stop() {
        active = false; ready = false; composing = false; setupCancelled = true;
        for (const [event, listener, capture] of events) document.removeEventListener(event, listener, capture);
        window.removeEventListener("resize", clear);
        controller.reset(); overlay.destroy();
        void native()?.release().catch(() => { });
    }
});
