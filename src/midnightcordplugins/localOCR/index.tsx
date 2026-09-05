/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { tPlugin as t } from "@api/pluginI18n";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { copyToClipboard } from "@utils/clipboard";
import { closeModal, ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { PluginNative } from "@utils/types";
import { Menu, useEffect, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";

import { fetchDiscordImage, inspectFile } from "../imageOptimizer/engine";
import { discordImageUrl } from "../imageOptimizer/helpers";
import { prepareImage } from "./prepare";
import type { Language, OcrResult } from "./runtime";

type NativeApi = PluginNative<typeof import("./native")>;
function native(): NativeApi | undefined {
    return typeof VencordNative === "undefined" ? undefined : VencordNative.pluginHelpers.LocalOCR as NativeApi;
}

let active = false;
let modalKey: string | undefined;
let currentSession: string | undefined;
let cancelCurrent: (() => void) | undefined;

function errorLabel(error: unknown) {
    switch (error instanceof Error ? error.message : error) {
        case "cancelled": return t("Lecture annulée.");
        case "busy": return t("Une lecture est déjà en cours. Attendez sa fin ou annulez-la.");
        case "timeout": return t("La lecture a dépassé 90 secondes. Essayez une image plus petite.");
        case "ocr-image-limit":
        case "invalid-image": return t("L'OCR accepte au maximum 12 Mio et 12 mégapixels. Réduisez l'image avec l'optimiseur si nécessaire.");
        case "unsupported-format":
        case "animation-unsupported": return t("Choisissez une image JPEG, PNG ou WebP statique.");
        case "native-unavailable": return t("Le moteur OCR nécessite la version bureau de Midnightcord et ses fichiers OCR. Reconstruisez puis redémarrez le client après cette mise à jour.");
        default: return t("Impossible de lire cette image. Vérifiez le fichier et la présence des modèles OCR dans votre installation.");
    }
}

function OcrModal({ account, session, url, ...props }: ModalProps & { account: string; session: string; url?: string; }) {
    const [file, setFile] = useState<File>();
    const [language, setLanguage] = useState<Language>("fra+eng");
    const [result, setResult] = useState<Extract<OcrResult, { ok: true; }>>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const accountId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const job = useRef<{ id: string; controller: AbortController; } | undefined>(undefined);
    const mounted = useRef(true);

    function valid() { return mounted.current && active && currentSession === session && UserStore.getCurrentUser()?.id === account; }
    function abort() {
        const { current } = job;
        if (!current) return;
        current.controller.abort();
        void native()?.cancel(session, current.id).catch(() => { });
    }

    async function run(action: (signal: AbortSignal, id: string) => Promise<void>) {
        if (job.current || !valid()) return;
        const current = { id: crypto.randomUUID(), controller: new AbortController() };
        job.current = current;
        setBusy(true); setError(""); setCopied(false);
        try {
            await action(current.controller.signal, current.id);
        } catch (reason) {
            if (valid()) setError(current.controller.signal.aborted ? t("Lecture annulée.") : errorLabel(reason));
        } finally {
            if (job.current === current) job.current = undefined;
            if (valid()) setBusy(false);
        }
    }

    async function load(source: File, signal: AbortSignal) {
        const info = await inspectFile(source, signal);
        if (source.size > 12 * 1024 * 1024 || info.width * info.height > 12_000_000) throw new Error("ocr-image-limit");
        signal.throwIfAborted();
        if (valid()) { setFile(source); setResult(undefined); }
    }

    useEffect(() => {
        mounted.current = true;
        if (currentSession === session) cancelCurrent = abort;
        if (url) void run(async signal => load(await fetchDiscordImage(url, signal), signal));
        return () => {
            mounted.current = false;
            abort();
            void native()?.release(session).catch(() => { });
            if (cancelCurrent === abort) cancelCurrent = undefined;
        };
    }, []);
    useEffect(() => { if (accountId !== account) { abort(); props.onClose(); } }, [accountId]);

    async function recognize() {
        if (!file) return;
        setResult(undefined);
        await run(async (signal, id) => {
            const api = native();
            if (!api?.recognize) throw new Error("native-unavailable");
            const bytes = await prepareImage(file, signal);
            signal.throwIfAborted();
            if (!valid()) return;
            let output: OcrResult;
            try { output = await api.recognize(session, id, bytes, language); }
            finally { bytes.fill(0); }
            signal.throwIfAborted();
            if (!valid()) return;
            if (!output.ok) throw new Error(output.error);
            setResult(output);
        });
    }

    return <ModalRoot transitionState={props.transitionState} size={ModalSize.LARGE} aria-label={t("Extraire le texte d'une image")}>
        <ModalHeader><Heading tag="h2">{t("OCR local")}</Heading><ModalCloseButton onClick={props.onClose} /></ModalHeader>
        <ModalContent className="vc-local-ocr">
            <p>{t("Extrayez du texte français ou anglais sur cet appareil. Le moteur et ses modèles sont inclus ; aucune image n'est envoyée à un service OCR. Une image Discord est téléchargée uniquement à votre demande.")}</p>
            <label>{t("Choisir une image locale")}<input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={event => {
                const source = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (source) void run(signal => load(source, signal));
            }} /></label>
            <p className="vc-local-ocr-hint">{t("Images statiques · 12 Mio · 12 mégapixels maximum. Les grands côtés sont ramenés à 4096 pixels.")}</p>
            {file && <p>{file.name} · {(file.size / 1024).toFixed(0)} Kio</p>}
            <label>{t("Langue du texte")}<select disabled={busy} value={language} onChange={event => { setLanguage(event.target.value as Language); setResult(undefined); }}>
                <option value="fra+eng">{t("Français et anglais")}</option><option value="fra">{t("Français")}</option><option value="eng">{t("Anglais")}</option>
            </select></label>
            <div className="vc-local-ocr-actions"><Button disabled={!file || busy} onClick={() => void recognize()}>{busy ? t("Lecture en cours…") : t("Extraire le texte")}</Button>
                {busy && <Button variant="secondary" onClick={abort}>{t("Annuler la lecture")}</Button>}
            </div>
            {busy && <p role="status">{t("Le premier chargement peut prendre quelques secondes. Une seule lecture est exécutée à la fois.")}</p>}
            {error && <p role="alert" className="vc-local-ocr-error">{error}</p>}
            {result && <>
                <label>{t("Texte reconnu")}<textarea readOnly value={result.text} rows={12} spellCheck={false} /></label>
                <p>{(result.elapsed / 1000).toFixed(1)} s · {t("Confiance estimée :")} {Math.round(result.confidence)} %</p>
                {!result.text.trim() && <p>{t("Aucun texte lisible détecté. Essayez une image plus nette ou recadrée.")}</p>}
                {result.truncated && <p>{t("Résultat limité aux 100 000 premiers caractères.")}</p>}
                <Button disabled={!result.text} onClick={() => {
                    if (valid()) void copyToClipboard(result.text).then(() => { if (valid()) setCopied(true); }).catch(() => { if (valid()) setError(t("Impossible de copier. Sélectionnez le texte manuellement.")); });
                }}>{copied ? t("Texte copié") : t("Copier le texte")}</Button>
                <p className="vc-local-ocr-hint">{t("Vérifiez le résultat : la reconnaissance peut contenir des erreurs. Le texte reste dans cette fenêtre et n'est pas conservé dans un historique.")}</p>
            </>}
        </ModalContent>
    </ModalRoot>;
}

function openOcr(url?: string) {
    const account = UserStore.getCurrentUser()?.id;
    if (!active || !account || modalKey) return;
    const session = crypto.randomUUID();
    currentSession = session;
    modalKey = openModal(props => <ErrorBoundary><OcrModal {...props} account={account} session={session} url={url} /></ErrorBoundary>, {
        onCloseCallback: () => {
            if (currentSession === session) { cancelCurrent?.(); cancelCurrent = undefined; modalKey = undefined; currentSession = undefined; }
            void native()?.release(session).catch(() => { });
        }
    });
}

const imageMenu: NavContextMenuPatchCallback = (children, props) => {
    const url = [props?.itemHref, props?.src, props?.itemSrc, props?.href, props?.url].map(discordImageUrl).find((value): value is string => value !== null);
    if (url && !children.some(child => child?.props?.id === "local-ocr")) children.push(<Menu.MenuItem key="local-ocr" id="local-ocr" label={t("Extraire le texte de cette image (local)")} action={() => openOcr(url)} />);
};

export default definePlugin({
    name: "LocalOCR",
    description: "Extract French and English text from images locally with an on-demand desktop OCR worker and bundled offline models.",
    authors: [{ name: "Midnightcord contributors", id: 0n }],
    enabledByDefault: false,
    tags: ["Utility", "Images"],
    settingsAboutComponent: () => <div className="vc-local-ocr"><p>{t("OCR local sur la version bureau : français et anglais, depuis un fichier ou le menu d'une image Discord. Le moteur démarre à la première lecture et libère sa mémoire après 60 secondes d'inactivité ou à la fermeture de l'outil.")}</p><Button disabled={!active} onClick={() => openOcr()}>{t("Ouvrir l'OCR local")}</Button></div>,
    toolboxActions: { "OCR local": () => openOcr() },
    contextMenus: { "image-context": imageMenu, message: (children, props) => { if (props?.reverseImageSearchType === "img") imageMenu(children, props); } },
    start() { active = true; },
    stop() {
        const session = currentSession;
        active = false;
        cancelCurrent?.();
        if (modalKey) closeModal(modalKey);
        modalKey = undefined;
        currentSession = undefined;
        cancelCurrent = undefined;
        if (session) void native()?.release(session).catch(() => { });
    }
});
