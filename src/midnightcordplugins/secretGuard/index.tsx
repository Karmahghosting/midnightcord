/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import {
    addMessagePreEditValidator,
    addMessagePreSendValidator,
    MessageEditValidator,
    MessageObject,
    MessageSendValidator,
    MessageValidationContext,
    removeMessagePreEditValidator,
    removeMessagePreSendValidator
} from "@api/MessageEvents";
import { tPlugin as t } from "@api/pluginI18n";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { DraftStore, FluxDispatcher, MessageStore, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

import { MAX_TEXT_LENGTH, ScanResult, SecretKind } from "./detector";
import { SecretGate } from "./gate";

const labels: Record<SecretKind, string> = {
    discord: "Jeton Discord potentiel",
    apiKey: "Clé API potentielle",
    privateKey: "Clé privée",
    assignment: "Identifiant ou secret dans une variable",
    credentialUrl: "Mot de passe dans une URL"
};
const gate = new SecretGate();
let running = false;
let revision = 0;
let lastIdentity = "";
const pending = new Set<{ cancel(): void; check(): void; }>();

function accountId() { return UserStore.getCurrentUser()?.id ?? ""; }
function identity() { return `${accountId()}:${SelectedChannelStore.getChannelId() ?? ""}`; }

function cancelPending() {
    for (const request of [...pending]) request.cancel();
}

function invalidate() {
    revision++;
    gate.invalidate();
    cancelPending();
}

function identityChanged() {
    const next = identity();
    if (next !== lastIdentity) {
        lastIdentity = next;
        invalidate();
    }
}

function checkPending() {
    for (const request of [...pending]) request.check();
}

function showFailure() {
    try { showToast(t("Vérification impossible. Envoi annulé ; votre brouillon est conservé."), Toasts.Type.FAILURE); } catch { }
}

function WarningModal({ rootProps, result, action, finish }: {
    rootProps: ModalProps; result: ScanResult; action: "send" | "edit"; finish(accepted: boolean): void;
}) {
    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL} aria-label={t("Vérifier avant de publier")}>
            <ModalHeader className="mc-secret-guard-header">
                <Heading tag="h2">{t("Vérifier avant de publier")}</Heading>
                <ModalCloseButton onClick={() => finish(false)} />
            </ModalHeader>
            <ModalContent className="mc-secret-guard">
                {result.tooLong ? (
                    <p role="alert">{t("Ce texte dépasse la limite de vérification locale.")} {MAX_TEXT_LENGTH.toLocaleString()} {t("caractères maximum. Raccourcissez-le avant de réessayer.")}</p>
                ) : (
                    <>
                        <p>{t("Ce message semble contenir des informations sensibles. Leurs valeurs restent masquées ici.")}</p>
                        <ul className="mc-secret-guard-findings">
                            {result.findings.map(finding => <li key={finding.kind}>
                                <strong>{t(labels[finding.kind])}</strong>
                                <span>{finding.count} × <code>{t("[valeur masquée]")}</code></span>
                            </li>)}
                        </ul>
                        <p>{t("Annulez pour corriger le texte, ou autorisez uniquement cette publication exacte.")}</p>
                    </>
                )}
                <p className="mc-secret-guard-note">{t("Analyse locale du texte uniquement. Aucune valeur détectée n'est enregistrée. Les pièces jointes ne sont pas analysées.")}</p>
            </ModalContent>
            <ModalFooter className="mc-secret-guard-actions">
                {!result.tooLong && <Button variant="dangerSecondary" onClick={() => finish(true)}>{t(action === "edit" ? "Modifier quand même" : "Envoyer quand même")}</Button>}
                <Button autoFocus onClick={() => finish(false)}>{t("Annuler et corriger")}</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function confirm(result: ScanResult, action: "send" | "edit", isCurrent: () => boolean): Promise<boolean> {
    cancelPending();
    return new Promise(resolve => {
        let settled = false;
        let key: string | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const finish = (accepted: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            pending.delete(request);
            let valid = false;
            try { valid = accepted && running && isCurrent(); } catch { }
            if (key) {
                try { closeModal(key); } catch { valid = false; }
            }
            resolve(valid);
        };
        const request = {
            cancel: () => finish(false),
            check: () => {
                try { if (!isCurrent()) finish(false); } catch { finish(false); }
            }
        };
        pending.add(request);
        try {
            if (!running || !isCurrent()) { finish(false); return; }
            key = openModal(props => (
                <ErrorBoundary noop onError={() => { finish(false); showFailure(); }}>
                    <WarningModal rootProps={props} result={result} action={action} finish={finish} />
                </ErrorBoundary>
            ), { onCloseCallback: () => finish(false) });
            if (settled) {
                closeModal(key);
                return;
            }
            timeout = setTimeout(() => finish(false), 60_000);
        } catch {
            finish(false);
            showFailure();
        }
    });
}

function contextKey(channelId: string, action: "send" | "edit", messageId: string) {
    const edited = action === "edit" ? MessageStore.getMessage(channelId, messageId) : undefined;
    const editVersion = action === "edit" ? edited ? String(edited.editedTimestamp ?? "original") : "missing" : "";
    return `${revision}:${identity()}:${channelId}:${action}:${messageId}:${editVersion}`;
}

async function validate(channelId: string, message: MessageObject, action: "send" | "edit", messageId: string, validation: MessageValidationContext) {
    try {
        const context = contextKey(channelId, action, messageId);
        const isCurrent = () => running && !!accountId() && SelectedChannelStore.getChannelId() === channelId
            && contextKey(channelId, action, messageId) === context;
        return await gate.validate({
            operation: validation.operation,
            phase: validation.phase,
            context,
            getContent: () => message.content,
            contextIsCurrent: isCurrent,
            confirm: result => confirm(result, action, isCurrent)
        });
    } catch {
        showFailure();
        return { cancel: true } as const;
    }
}

const validateSend: MessageSendValidator = (channelId, message, _options, context) => validate(channelId, message, "send", "", context);
const validateEdit: MessageEditValidator = (channelId, messageId, message, context) => validate(channelId, message, "edit", messageId, context);

function About() {
    return <div className="mc-secret-guard">
        <p>{t("SecretGuard vérifie le texte avant et après les transformations des autres plugins, à l'envoi et à la modification.")}</p>
        <p>{t("Il signale les formats courants de jetons, clés privées, clés API et identifiants. Cette détection ne reconnaît pas tous les secrets.")}</p>
        <p className="mc-secret-guard-note">{t("Aucun service distant, aucun historique des textes ou des valeurs détectées. Les pièces jointes et les envois directs par des plugins externes ne passent pas par cette vérification.")}</p>
    </div>;
}

export default definePlugin({
    name: "SecretGuard",
    description: "Warn locally before sending or editing text containing common secrets, tokens or private keys.",
    enabledByDefault: false,
    tags: ["Chat", "Privacy", "Utility"],
    dependencies: ["MessageEventsAPI"],
    authors: [{ name: "Midnightcord", id: 0n }],
    settingsAboutComponent: About,
    start() {
        running = true;
        gate.start();
        lastIdentity = identity();
        UserStore.addChangeListener(identityChanged);
        SelectedChannelStore.addChangeListener(identityChanged);
        DraftStore.addChangeListener(invalidate);
        MessageStore.addChangeListener(checkPending);
        FluxDispatcher.subscribe("MESSAGE_START_EDIT", invalidate);
        FluxDispatcher.subscribe("MESSAGE_END_EDIT", invalidate);
        addMessagePreSendValidator(validateSend);
        addMessagePreEditValidator(validateEdit);
    },
    stop() {
        running = false;
        revision++;
        gate.stop();
        cancelPending();
        removeMessagePreSendValidator(validateSend);
        removeMessagePreEditValidator(validateEdit);
        UserStore.removeChangeListener(identityChanged);
        SelectedChannelStore.removeChangeListener(identityChanged);
        DraftStore.removeChangeListener(invalidate);
        MessageStore.removeChangeListener(checkPending);
        FluxDispatcher.unsubscribe("MESSAGE_START_EDIT", invalidate);
        FluxDispatcher.unsubscribe("MESSAGE_END_EDIT", invalidate);
    }
});
