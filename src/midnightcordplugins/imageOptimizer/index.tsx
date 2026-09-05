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
import { closeModal, ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { saveFile } from "@utils/web";
import { ChannelStore, DraftType, Menu, SelectedChannelStore, UploadHandler, useEffect, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";

import { fetchDiscordImage, inspectFile, optimizeImage, OptimizeOptions } from "./engine";
import { discordImageUrl, ImageInfo, ImageMime, outputName } from "./helpers";

interface Session {
    id: string;
    account: string;
    channelId?: string;
    url?: string;
}
interface Source {
    file: File;
    info: ImageInfo;
    url: string;
    displayWidth?: number;
    displayHeight?: number;
}
type Result = Awaited<ReturnType<typeof optimizeImage>> & { url: string; name: string; };

const defaults: OptimizeOptions = { maximum: 1920, quality: 0.85, format: "image/webp", background: "#ffffff" };
let active = false;
let modalKey: string | undefined;
let currentSession: string | undefined;
let cancelCurrent: (() => void) | undefined;

function bytesLabel(value: number) {
    return `${value.toLocaleString()} ${t("octets")} (${(value / 1024 / 1024).toFixed(2)} ${t("Mio")})`;
}

function errorLabel(error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return t("Opération annulée ou téléchargement trop long.");
    switch (error instanceof Error ? error.message : "") {
        case "file-too-large": return t("Choisissez une image non vide de 20 Mio maximum.");
        case "image-too-large": return t("Cette image dépasse 16 mégapixels ou 16 384 pixels par côté.");
        case "animation-unsupported": return t("Les GIF, PNG/WebP animés et JPEG multi-images ne sont pas pris en charge. L'animation ne sera pas supprimée silencieusement.");
        case "unsupported-format": return t("Formats acceptés : JPEG, PNG et WebP statiques.");
        case "unsupported-url": return t("Seules les images du CDN Discord peuvent être ouvertes ici. Pour une autre source, choisissez un fichier local.");
        case "invalid-size": return t("La taille maximale doit être un entier entre 64 et 4096 pixels.");
        case "download-failed": return t("Impossible de charger cette image Discord. Le lien a peut-être expiré ; choisissez un fichier local.");
        case "encode-failed": return t("Le navigateur n'a pas pu encoder cette image.");
        case "account-changed": return t("Le compte a changé. Rouvrez l'optimiseur.");
        case "channel-changed": return t("Revenez dans la conversation d'origine pour préparer la pièce jointe.");
        default: return t("Impossible de traiter cette image. Vérifiez le fichier ou essayez un autre format.");
    }
}

function Optimizer({ session, ...props }: ModalProps & { session: Session; }) {
    const [source, setSource] = useState<Source>();
    const [result, setResult] = useState<Result>();
    const [options, setOptions] = useState(defaults);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const sourceRef = useRef<Source | undefined>(undefined);
    const resultRef = useRef<Result | undefined>(undefined);
    const controller = useRef(new AbortController());
    const locked = useRef(false);
    const account = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const selectedChannel = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId());
    const inChannel = !!session.channelId && selectedChannel === session.channelId;

    function valid() {
        if (!active || currentSession !== session.id || account !== session.account || UserStore.getCurrentUser()?.id !== session.account) throw new Error("account-changed");
        controller.current.signal.throwIfAborted();
    }

    function clearResult() {
        if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
        resultRef.current = undefined;
        setResult(undefined);
        setNotice("");
    }

    async function run(action: (signal: AbortSignal) => Promise<void>) {
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            valid();
            await action(controller.current.signal);
        } catch (reason) {
            if (!controller.current.signal.aborted) setError(errorLabel(reason));
        } finally {
            locked.current = false;
            if (!controller.current.signal.aborted) setBusy(false);
        }
    }

    async function load(file: File, signal: AbortSignal) {
        const info = await inspectFile(file, signal);
        valid();
        clearResult();
        if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
        const next = { file, info, url: URL.createObjectURL(file) };
        sourceRef.current = next;
        setSource(next);
    }

    useEffect(() => {
        const abort = () => controller.current.abort();
        const accountChanged = () => {
            if (UserStore.getCurrentUser()?.id !== session.account) { abort(); props.onClose(); }
        };
        if (currentSession === session.id) cancelCurrent = abort;
        UserStore.addChangeListener(accountChanged);
        if (session.url) void run(async signal => load(await fetchDiscordImage(session.url!, signal), signal));
        return () => {
            abort();
            UserStore.removeChangeListener(accountChanged);
            if (cancelCurrent === abort) cancelCurrent = undefined;
            if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
            if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
        };
    }, []);

    useEffect(() => {
        if (account !== session.account) { controller.current.abort(); props.onClose(); }
    }, [account]);

    function changeOptions(update: Partial<OptimizeOptions>) {
        clearResult();
        setOptions(previous => ({ ...previous, ...update }));
    }

    async function optimize() {
        const { current } = sourceRef;
        if (!current) return;
        await run(async signal => {
            clearResult();
            const optimized = await optimizeImage(current.file, { ...options }, signal);
            valid();
            const next = { ...optimized, name: outputName(current.file.name, optimized.mime), url: URL.createObjectURL(optimized.blob) };
            resultRef.current = next;
            setResult(next);
        });
    }

    function prepare() {
        try {
            valid();
            if (!session.channelId || SelectedChannelStore.getChannelId() !== session.channelId) throw new Error("channel-changed");
            const output = resultRef.current;
            const channel = ChannelStore.getChannel(session.channelId);
            if (!output || !channel || locked.current) return;
            UploadHandler.promptToUpload([new File([output.blob], output.name, { type: output.mime })], channel, DraftType.ChannelMessage);
            setNotice(t("Copie proposée à Discord comme pièce jointe. Vérifiez le brouillon avant d'envoyer votre message."));
        } catch (reason) { setError(errorLabel(reason)); }
    }

    return <ModalRoot transitionState={props.transitionState} size={ModalSize.LARGE} aria-label={t("Optimiser une image")}>
        <ModalHeader><Heading tag="h2">{t("Optimiser une image")}</Heading><ModalCloseButton onClick={props.onClose} /></ModalHeader>
        <ModalContent className="vc-image-optimizer">
            <p>{t("Créez une copie plus légère sur cet appareil. Le fichier original reste intact. Rien n'est joint à Discord avant votre clic sur Préparer la pièce jointe.")}</p>
            <label className="vc-image-optimizer-picker">{t("Choisir une image locale")}
                <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void run(signal => load(file, signal));
                }} />
            </label>
            <p className="vc-image-optimizer-hint">{t("JPEG, PNG et WebP statiques · 20 Mio · 16 mégapixels maximum.")}</p>
            <fieldset disabled={busy} className="vc-image-optimizer-controls">
                <legend>{t("Réglages de la copie")}</legend>
                <label>{t("Côté le plus long (pixels)")}<input type="number" min={64} max={4096} step={1} value={options.maximum} onChange={event => changeOptions({ maximum: Number(event.target.value) })} /></label>
                <label>{t("Format")}<select value={options.format} onChange={event => changeOptions({ format: event.target.value as ImageMime })}><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select></label>
                <label>{t("Qualité")} · {Math.round(options.quality * 100)} %<input type="range" min={10} max={100} step={1} value={Math.round(options.quality * 100)} disabled={options.format === "image/png"} onChange={event => changeOptions({ quality: Number(event.target.value) / 100 })} /></label>
                {options.format === "image/jpeg" && <label>{t("Fond des zones transparentes")}<select value={options.background} onChange={event => changeOptions({ background: event.target.value as OptimizeOptions["background"] })}><option value="#ffffff">{t("Blanc")}</option><option value="#000000">{t("Noir")}</option></select></label>}
            </fieldset>
            {options.format === "image/png" && <p className="vc-image-optimizer-hint">{t("PNG conserve les pixels sans compression destructive ; le curseur de qualité ne s'applique pas.")}</p>}
            {source?.info.alpha && options.format === "image/jpeg" && <p className="vc-image-optimizer-warning" role="status">{t("JPEG ne conserve pas la transparence : elle sera remplacée par le fond choisi.")}</p>}
            <p className="vc-image-optimizer-hint">{t("La copie est réencodée : les métadonnées EXIF/GPS de l'original ne sont pas recopiées. Le navigateur peut ajouter des informations d'encodage. L'orientation est appliquée et les couleurs peuvent légèrement varier. Les petites images ne sont jamais agrandies.")}</p>
            <div className="vc-image-optimizer-actions"><Button disabled={!source || busy} onClick={() => void optimize()}>{busy ? t("Traitement…") : t("Créer l'aperçu optimisé")}</Button></div>
            {busy && <p role="status" aria-live="polite">{t("Traitement en cours. Vous pouvez fermer cette fenêtre pour annuler.")}</p>}
            {error && <p role="alert" className="vc-image-optimizer-error">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            {source && <div className="vc-image-optimizer-previews">
                <figure><figcaption>{t("Original")}</figcaption><img src={source.url} alt={t("Aperçu de l'image originale")} onLoad={event => {
                    if (sourceRef.current?.file !== source.file || controller.current.signal.aborted) return;
                    const next = { ...sourceRef.current, displayWidth: event.currentTarget.naturalWidth, displayHeight: event.currentTarget.naturalHeight };
                    sourceRef.current = next;
                    setSource(next);
                }} /><p>{source.file.name}</p><p>{result ? `${result.originalWidth} × ${result.originalHeight}` : `${source.displayWidth ?? source.info.width} × ${source.displayHeight ?? source.info.height}`} px · {bytesLabel(source.file.size)}</p></figure>
                {result && <figure><figcaption>{t("Copie optimisée")} · {result.extension.toUpperCase()}</figcaption><img src={result.url} alt={t("Aperçu de la copie optimisée")} /><p>{result.name}</p><p>{result.width} × {result.height} px · {bytesLabel(result.blob.size)}</p><p className={result.blob.size >= source.file.size ? "vc-image-optimizer-warning" : ""}>{result.blob.size < source.file.size ? `${t("Réduction :")} ${((1 - result.blob.size / source.file.size) * 100).toFixed(1)} % · ${bytesLabel(source.file.size - result.blob.size)}` : `${t("La copie est aussi lourde ou plus lourde :")} +${bytesLabel(result.blob.size - source.file.size)}. ${t("Essayez une taille ou une qualité plus faible.")}`}</p></figure>}
            </div>}
            {result?.fallback && <p className="vc-image-optimizer-warning">{t("Ce navigateur n'a pas utilisé le format demandé. Le format réel de la copie est :")} {result.extension.toUpperCase()}.</p>}
            {result && <div className="vc-image-optimizer-actions">
                <Button disabled={busy || !inChannel} onClick={prepare}>{t("Préparer la pièce jointe")}</Button>
                <Button variant="secondary" disabled={busy} onClick={() => {
                    try { valid(); const output = resultRef.current; if (output) saveFile(new File([output.blob], output.name, { type: output.mime })); } catch (reason) { setError(errorLabel(reason)); }
                }}>{t("Télécharger la copie")}</Button>
            </div>}
            {result && !inChannel && <p className="vc-image-optimizer-hint">{session.channelId ? t("Revenez dans la conversation d'origine pour préparer la pièce jointe, ou téléchargez la copie.") : t("Aucune conversation n'était ouverte. Téléchargez la copie, ou rouvrez l'outil depuis une conversation.")}</p>}
        </ModalContent>
    </ModalRoot>;
}

function openOptimizer(url?: string, channelId = SelectedChannelStore.getChannelId()) {
    const account = UserStore.getCurrentUser()?.id;
    if (!active || !account || modalKey) return;
    const id = crypto.randomUUID();
    currentSession = id;
    modalKey = openModal(props => <ErrorBoundary><Optimizer {...props} session={{ id, account, channelId, url }} /></ErrorBoundary>, {
        onCloseCallback: () => {
            if (currentSession !== id) return;
            cancelCurrent?.(); cancelCurrent = undefined; modalKey = undefined; currentSession = undefined;
        }
    });
}

const imageMenu: NavContextMenuPatchCallback = (children, props) => {
    const url = [props?.itemHref, props?.src, props?.itemSrc, props?.href, props?.url].map(discordImageUrl).find((value): value is string => value !== null);
    if (!url || children.some(child => child?.props?.id === "image-optimizer")) return;
    children.push(<Menu.MenuItem key="image-optimizer" id="image-optimizer" label={t("Optimiser une copie de cette image")} action={() => openOptimizer(url)} />);
};

const uploadMenu: NavContextMenuPatchCallback = (children, props) => {
    if (children.some(child => child?.props?.id === "image-optimizer-file")) return;
    children.push(<Menu.MenuItem key="image-optimizer-file" id="image-optimizer-file" label={t("Optimiser une image avant de la joindre")} action={() => openOptimizer(undefined, props?.channel?.id)} />);
};

export default definePlugin({
    name: "ImageOptimizer",
    description: "Preview, resize and re-encode static images locally before preparing an optimized attachment or saving a copy.",
    authors: [{ name: "Midnightcord contributors", id: 0n }],
    enabledByDefault: false,
    tags: ["Utility", "Images"],
    settingsAboutComponent: () => <div className="vc-image-optimizer"><p>{t("Réduisez les dimensions et le poids d'une image locale ou d'une image Discord, avec aperçu avant de préparer la pièce jointe.")}</p><Button disabled={!active} onClick={() => openOptimizer()}>{t("Ouvrir l'optimiseur d'images")}</Button></div>,
    toolboxActions: { "Optimiser une image": () => openOptimizer() },
    contextMenus: {
        "channel-attach": uploadMenu,
        "image-context": imageMenu,
        message: (children, props) => { if (props?.reverseImageSearchType === "img") imageMenu(children, props); }
    },
    start() { active = true; },
    stop() {
        active = false;
        cancelCurrent?.();
        if (modalKey) closeModal(modalKey);
        modalKey = undefined;
        currentSession = undefined;
        cancelCurrent = undefined;
    }
});
