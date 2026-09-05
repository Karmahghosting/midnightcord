/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import { tPlugin as t } from "@api/pluginI18n";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { closeModal, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { filters, find } from "@webpack";
import { FluxDispatcher, MediaEngineStore, useEffect, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";

import { AUDIO_FIELDS, AudioField, AudioProfile, AudioSnapshot, isNameTaken, MAX_PROFILES, planRestore, profileName, readDevices, readProfiles, readSnapshot, RestoreEnvironment, validVolume } from "./profiles";

const fieldLabels: Record<AudioField, string> = {
    inputDevice: "Microphone",
    outputDevice: "Sortie audio",
    inputVolume: "Volume du microphone",
    outputVolume: "Volume de sortie",
    noiseSuppression: "Réduction du bruit standard",
    noiseCancellation: "Réduction du bruit Krisp"
};
const listeners = new Set<() => void>();
let enabled = false;
let epoch = 0;
let modalKey: string | undefined;
let activeAccount: string | undefined;

function changed() {
    for (const listener of listeners) listener();
}

function currentAccount() {
    return UserStore?.getCurrentUser()?.id;
}

function assertAccount(account: string, generation: number) {
    if (!enabled || generation !== epoch || currentAccount() !== account) throw new Error("account-changed");
}

function storageKey(account: string) {
    return `AudioProfiles:v1:${account}`;
}

function read(getter: () => unknown): unknown {
    try { return getter(); } catch { return undefined; }
}

function audioEnvironment() {
    const inputDevices = readDevices(read(() => MediaEngineStore.getInputDevices()));
    const outputDevices = readDevices(read(() => MediaEngineStore.getOutputDevices()));
    const audio: AudioSnapshot = {};
    const inputId = read(() => MediaEngineStore.getInputDeviceId());
    const outputId = read(() => MediaEngineStore.getOutputDeviceId());
    const input = inputDevices.find(device => device.id === inputId && !device.disabled);
    const output = outputDevices.find(device => device.id === outputId && !device.disabled);
    if (input) audio.inputDevice = { id: input.id, name: input.name };
    if (output) audio.outputDevice = { id: output.id, name: output.name };
    const inputVolume = read(() => MediaEngineStore.getInputVolume());
    const outputVolume = read(() => MediaEngineStore.getOutputVolume());
    if (validVolume(inputVolume, 100)) audio.inputVolume = inputVolume;
    if (validVolume(outputVolume, 200)) audio.outputVolume = outputVolume;

    // Use Discord's action creators: noise setters may coordinate both modes.
    const actions = find(filters.byProps("setNoiseCancellation", "setNoiseSuppression", "setInputDevice"), { isIndirect: true }) as {
        setNoiseCancellation?: (enabled: boolean) => void;
        setNoiseSuppression?: (enabled: boolean) => void;
    } | null;
    const noiseCancellation = read(() => MediaEngineStore.getNoiseCancellation());
    const noiseSuppression = read(() => MediaEngineStore.getNoiseSuppression());
    if (typeof noiseCancellation === "boolean" && typeof actions?.setNoiseCancellation === "function" && read(() => MediaEngineStore.isNoiseCancellationSupported()) === true) {
        audio.noiseCancellation = noiseCancellation;
    }
    if (typeof noiseSuppression === "boolean" && typeof actions?.setNoiseSuppression === "function" && read(() => MediaEngineStore.isNoiseSuppressionSupported()) === true) {
        audio.noiseSuppression = noiseSuppression;
    }
    const environment: RestoreEnvironment = { inputDevices, outputDevices, supported: {} };
    for (const field of AUDIO_FIELDS) environment.supported[field] = audio[field] !== undefined;
    return { audio, environment, actions };
}

async function mutateProfiles(account: string, transform: (profiles: AudioProfile[]) => AudioProfile[]) {
    const generation = epoch;
    assertAccount(account, generation);
    await DataStore.update<unknown>(storageKey(account), old => {
        assertAccount(account, generation);
        return transform(readProfiles(old));
    });
    assertAccount(account, generation);
    changed();
}

function checkedName(profiles: AudioProfile[], value: string, exceptId?: string) {
    const name = profileName(value);
    if (isNameTaken(profiles, name, exceptId)) throw new Error("duplicate-name");
    return name;
}

function capture() {
    const audio = readSnapshot(audioEnvironment().audio);
    if (!audio) throw new Error("audio-unavailable");
    return audio;
}

function restore(profile: AudioProfile, account: string) {
    const generation = epoch;
    assertAccount(account, generation);
    const { environment, actions } = audioEnvironment();
    const { audio } = profile;
    const plan = planRestore(audio, environment);
    const issues = plan.skipped.map(({ field, reason }) => `${t(fieldLabels[field])} : ${t(reason === "unavailable-device" ? "périphérique déconnecté ou désactivé" : "réglage non disponible")}`);
    const requested: AudioField[] = [];
    for (const field of plan.apply) {
        assertAccount(account, generation);
        try {
            switch (field) {
                case "inputDevice":
                    FluxDispatcher.dispatch({ type: "AUDIO_SET_INPUT_DEVICE", id: audio.inputDevice!.id });
                    break;
                case "outputDevice":
                    FluxDispatcher.dispatch({ type: "AUDIO_SET_OUTPUT_DEVICE", id: audio.outputDevice!.id });
                    break;
                case "inputVolume":
                    FluxDispatcher.dispatch({ type: "AUDIO_SET_INPUT_VOLUME", volume: audio.inputVolume! });
                    break;
                case "outputVolume":
                    FluxDispatcher.dispatch({ type: "AUDIO_SET_OUTPUT_VOLUME", volume: audio.outputVolume! });
                    break;
                case "noiseCancellation":
                    actions!.setNoiseCancellation!(audio.noiseCancellation!);
                    break;
                case "noiseSuppression":
                    actions!.setNoiseSuppression!(audio.noiseSuppression!);
                    break;
            }
            requested.push(field);
        } catch {
            issues.push(`${t(fieldLabels[field])} : ${t("échec de la modification")}`);
        }
    }
    const current = audioEnvironment().audio;
    let applied = 0;
    for (const field of requested) {
        const expected = audio[field];
        const actual = current[field];
        const matches = typeof expected === "object"
            ? typeof actual === "object" && expected.id === actual.id
            : expected === actual;
        if (matches) applied++;
        else issues.push(`${t(fieldLabels[field])} : ${t("modification non confirmée par Discord")}`);
    }
    return `${profile.name} — ${applied} ${t("réglage(s) appliqué(s).")}${issues.length ? ` ${t("Réglages ignorés ou non confirmés :")} ${issues.join(" ; ")}.` : ""}`;
}

function errorText(error: unknown) {
    switch (error instanceof Error ? error.message : "") {
        case "invalid-name": return t("Choisissez un nom de 1 à 60 caractères.");
        case "duplicate-name": return t("Un profil porte déjà ce nom.");
        case "audio-unavailable": return t("Les réglages audio ne sont pas encore disponibles. Ouvrez Voix et vidéo, puis réessayez.");
        case "account-changed": return t("Le compte a changé ou le plugin a été désactivé. Opération annulée.");
        case "missing-profile": return t("Ce profil a été supprimé. Actualisez la liste.");
        case "profile-limit": return t("La limite de 30 profils est atteinte.");
        default: return t("Impossible de lire ou enregistrer les profils locaux. Réessayez.");
    }
}

function SnapshotDetails({ audio }: { audio: AudioSnapshot; }) {
    return <dl className="vc-audio-profiles-details">
        {AUDIO_FIELDS.filter(field => audio[field] !== undefined).map(field => {
            const value = audio[field];
            const text = typeof value === "object" ? value.name : typeof value === "number" ? `${Math.round(value)} %` : t(value ? "Activée" : "Désactivée");
            return <div key={field}><dt>{t(fieldLabels[field])}</dt><dd>{text}</dd></div>;
        })}
    </dl>;
}

function AccountProfiles({ account }: { account: string; }) {
    const [profiles, setProfiles] = useState<AudioProfile[]>([]);
    const [name, setName] = useState("");
    const [editing, setEditing] = useState<string>();
    const [editName, setEditName] = useState("");
    const [deleting, setDeleting] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState(false);
    const [revision, setRevision] = useState(0);
    const mounted = useRef(true);
    const operation = useRef(false);

    useEffect(() => {
        mounted.current = true;
        const refresh = () => setRevision(value => value + 1);
        listeners.add(refresh);
        return () => { mounted.current = false; listeners.delete(refresh); };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const generation = epoch;
        setLoading(true);
        void DataStore.get<unknown>(storageKey(account)).then(saved => {
            assertAccount(account, generation);
            if (!cancelled) setProfiles(readProfiles(saved));
        }).catch(reason => {
            if (!cancelled) { setError(true); setMessage(errorText(reason)); }
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [account, revision]);

    async function run(action: () => Promise<string> | string) {
        if (operation.current) return;
        operation.current = true;
        setBusy(true);
        setMessage("");
        try {
            const result = await action();
            if (mounted.current && currentAccount() === account) { setError(false); setMessage(result); }
        } catch (reason) {
            if (mounted.current && currentAccount() === account) { setError(true); setMessage(errorText(reason)); }
        } finally {
            operation.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    const locked = busy || loading || !enabled;
    return <section className="vc-audio-profiles" aria-label={t("Profils audio")}>
        <p>{t("Enregistrez vos réglages actuels, puis retrouvez-les en un clic. Les profils sont stockés localement et séparés par compte.")}</p>
        <form className="vc-audio-profiles-create" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
                const audio = capture();
                await mutateProfiles(account, saved => {
                    if (saved.length >= MAX_PROFILES) throw new Error("profile-limit");
                    return [...saved, { id: crypto.randomUUID(), name: checkedName(saved, name), updatedAt: Date.now(), audio }];
                });
                if (mounted.current) setName("");
                return t("Profil créé à partir des réglages audio actuels.");
            });
        }}>
            <label>{t("Nom du nouveau profil")}
                <input value={name} maxLength={60} placeholder={t("Jeu, Réunion, Musique…")} disabled={locked} onChange={event => setName(event.target.value)} />
            </label>
            <Button type="submit" size="small" disabled={locked || !name.trim() || profiles.length >= MAX_PROFILES}>{t("Enregistrer les réglages actuels")}</Button>
        </form>
        <p className="vc-audio-profiles-hint">{t("Les périphériques absents et les options non prises en charge sont ignorés. Réduction du bruit standard et Krisp sont enregistrés uniquement si Discord les expose.")}</p>
        <div role={error ? "alert" : "status"} aria-live="polite" className={error ? "vc-audio-profiles-error" : "vc-audio-profiles-status"}>{message}</div>
        {loading && <p role="status">{t("Chargement des profils…")}</p>}
        {!loading && profiles.length === 0 && <p>{t("Aucun profil enregistré. Configurez votre audio dans Discord, puis créez votre premier profil.")}</p>}
        <div className="vc-audio-profiles-list">
            {profiles.map(profile => <article className="vc-audio-profiles-card" key={profile.id} aria-label={profile.name}>
                <div className="vc-audio-profiles-card-header">
                    <Heading tag="h3">{profile.name}</Heading>
                    <Button size="small" disabled={locked} onClick={() => void run(() => restore(profile, account))} aria-label={`${t("Appliquer le profil")} ${profile.name}`}>{t("Appliquer")}</Button>
                </div>
                <SnapshotDetails audio={profile.audio} />
                <div className="vc-audio-profiles-actions">
                    <Button size="small" variant="secondary" disabled={locked} title={t("Remplacer ce profil par vos réglages audio actuels")} onClick={() => void run(async () => {
                        const audio = capture();
                        await mutateProfiles(account, saved => {
                            if (!saved.some(item => item.id === profile.id)) throw new Error("missing-profile");
                            return saved.map(item => item.id === profile.id ? { ...item, audio, updatedAt: Date.now() } : item);
                        });
                        return t("Profil mis à jour avec les réglages actuels.");
                    })}>{t("Mettre à jour")}</Button>
                    <Button size="small" variant="secondary" disabled={locked} onClick={() => { setEditing(profile.id); setEditName(profile.name); setDeleting(undefined); }}>{t("Renommer")}</Button>
                    <Button size="small" variant="dangerSecondary" disabled={locked} onClick={() => { setDeleting(profile.id); setEditing(undefined); }}>{t("Supprimer")}</Button>
                </div>
                {editing === profile.id && <form className="vc-audio-profiles-actions" onSubmit={event => {
                    event.preventDefault();
                    void run(async () => {
                        await mutateProfiles(account, saved => {
                            if (!saved.some(item => item.id === profile.id)) throw new Error("missing-profile");
                            const name = checkedName(saved, editName, profile.id);
                            return saved.map(item => item.id === profile.id ? { ...item, name } : item);
                        });
                        if (mounted.current) setEditing(undefined);
                        return t("Profil renommé.");
                    });
                }}>
                    <label>{t("Nouveau nom")}<input autoFocus value={editName} maxLength={60} disabled={locked} onChange={event => setEditName(event.target.value)} /></label>
                    <Button type="submit" size="small" disabled={locked || !editName.trim()}>{t("Enregistrer")}</Button>
                    <Button type="button" size="small" variant="secondary" onClick={() => setEditing(undefined)}>{t("Annuler")}</Button>
                </form>}
                {deleting === profile.id && <div className="vc-audio-profiles-actions" role="group" aria-label={t("Confirmer la suppression du profil")}>
                    <span>{t("Supprimer ce profil ?")}</span>
                    <Button size="small" variant="dangerPrimary" disabled={locked} onClick={() => void run(async () => {
                        await mutateProfiles(account, saved => saved.filter(item => item.id !== profile.id));
                        if (mounted.current) setDeleting(undefined);
                        return t("Profil supprimé.");
                    })}>{t("Confirmer")}</Button>
                    <Button size="small" variant="secondary" onClick={() => setDeleting(undefined)}>{t("Annuler")}</Button>
                </div>}
            </article>)}
        </div>
    </section>;
}

function AudioProfilesPanel() {
    const account = useStateFromStores([UserStore], currentAccount);
    const [, refresh] = useState(0);
    useEffect(() => {
        const listener = () => refresh(value => value + 1);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);
    if (!enabled) return <p>{t("Activez AudioProfiles pour gérer vos profils audio.")}</p>;
    if (!account) return <p>{t("Connectez-vous à Discord pour retrouver vos profils audio.")}</p>;
    return <AccountProfiles key={account} account={account} />;
}

function openProfiles() {
    if (!enabled || modalKey) return;
    modalKey = openModal(props => <ModalRoot transitionState={props.transitionState} size={ModalSize.MEDIUM} aria-label={t("Profils audio")}>
        <ModalHeader><Heading tag="h2">{t("Profils audio")}</Heading><Button size="small" variant="secondary" onClick={props.onClose}>{t("Fermer")}</Button></ModalHeader>
        <ModalContent><ErrorBoundary><AudioProfilesPanel /></ErrorBoundary></ModalContent>
    </ModalRoot>, { onCloseCallback: () => { modalKey = undefined; } });
}

function accountChanged() {
    const account = currentAccount();
    if (account === activeAccount) return;
    activeAccount = account;
    epoch++;
    changed();
}

export default definePlugin({
    name: "AudioProfiles",
    description: "Save and switch local profiles for microphone, output device, volumes and supported noise reduction settings.",
    authors: [{ name: "Midnightcord contributors", id: 0n }],
    tags: ["Utility", "Voice"],
    settingsAboutComponent: () => <ErrorBoundary><AudioProfilesPanel /></ErrorBoundary>,
    toolboxActions: { "Profils audio": openProfiles },
    start() {
        enabled = true;
        epoch++;
        activeAccount = currentAccount();
        UserStore.addChangeListener(accountChanged);
        changed();
    },
    stop() {
        enabled = false;
        epoch++;
        activeAccount = undefined;
        UserStore.removeChangeListener(accountChanged);
        if (modalKey) { closeModal(modalKey); modalKey = undefined; }
        changed();
    }
});
