/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { tPlugin as t } from "@api/pluginI18n";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Logger } from "@utils/Logger";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, Menu, NavigationRouter, showToast, Toasts, useEffect, UserStore, useState } from "@webpack/common";
import type { ReactElement } from "react";

import { deliverReminderNotice } from "./notification";
import { localDateTime, MAX_REMINDERS, ReminderService, ReminderSource, tomorrowMorning } from "./state";

const logger = new Logger("MessageReminders");
const USAGE = "Discord doit rester ouvert pour recevoir les rappels. Les rappels manqués apparaissent au prochain démarrage de ce compte.";
const HOUR = 60 * 60 * 1000;
let running = false;
let session = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let managerKey: string | undefined;
const modalKeys = new Set<string>();
const notifications = new Set<Notification>();
const currentAccount = () => UserStore.getCurrentUser()?.id ?? null;

const service = new ReminderService(DataStore, currentAccount, (reminders, account) => {
    if (!running || currentAccount() !== account) return;
    deliverReminderNotice(openManager, () => {
        if (!document.hasFocus() && typeof Notification !== "undefined" && Notification.permission === "granted") {
            const currentSession = session;
            const notification = new Notification(t("Rappel de message"), {
                body: reminders.length === 1 ? t("Un message vous attend. Cliquez pour le retrouver.") : `${reminders.length} ${t("rappels à traiter dans Discord.")}`,
                tag: "midnightcord-message-reminders"
            });
            notifications.add(notification);
            notification.onclose = () => notifications.delete(notification);
            notification.onclick = () => {
                notification.close();
                notifications.delete(notification);
                if (!running || session !== currentSession || currentAccount() !== account) return;
                window.focus();
                if (reminders.length === 1) jumpTo(reminders[0]);
                openManager();
            };
        }
    }, error => logger.warn("Desktop notification unavailable; reminder shown in Discord", error));
});

function handleError(error: unknown, expectedSession = session) {
    logger.error("Reminder operation failed", error);
    if (running && session === expectedSession)
        showToast(t(error instanceof Error ? error.message : "Impossible de sauvegarder les rappels."), Toasts.Type.FAILURE);
}

function clearSurfaces() {
    for (const key of modalKeys) closeModal(key);
    modalKeys.clear();
    managerKey = undefined;
    for (const notification of notifications) {
        notification.onclick = null;
        notification.close();
    }
    notifications.clear();
}

function jumpTo(reminder: ReminderSource) {
    if (!running || service.accountId !== currentAccount()) return;
    NavigationRouter.transitionTo(`/channels/${reminder.guildId ?? "@me"}/${reminder.channelId}/${reminder.messageId}`);
}

function ReminderList({ rootProps, close }: { rootProps: ModalProps; close: () => void; }) {
    const [records, setRecords] = useState(service.snapshot);
    const [ready, setReady] = useState(service.ready);
    const [loadError, setLoadError] = useState(service.loadError);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        const update = () => { setRecords(service.snapshot); setReady(service.ready); setLoadError(service.loadError); };
        const unsubscribe = service.subscribe(update);
        update();
        return unsubscribe;
    }, []);

    const act = async (operation: () => Promise<void>) => {
        setBusy(true);
        setError("");
        try { await operation(); } catch (error) {
            setError(t(error instanceof Error ? error.message : "Impossible de sauvegarder les rappels."));
        } finally { setBusy(false); }
    };

    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM} aria-label={t("Mes rappels de messages")}>
            <ModalHeader className="mc-reminders-header"><Heading tag="h2">{t("Mes rappels de messages")}</Heading><ModalCloseButton onClick={close} /></ModalHeader>
            <ModalContent className="mc-reminders">
                <p className="mc-reminders-notice">{t(USAGE)}</p>
                <p className="mc-reminders-notice">{t("Rappels conservés sur cet appareil, séparément pour chaque compte.")}</p>
                {error && <p role="alert" className="mc-reminders-error">{error}</p>}
                {!ready ? loadError ? (
                    <>
                        <p role="alert" className="mc-reminders-error">{t(loadError)}</p>
                        <Button disabled={busy} onClick={() => void act(async () => { await service.activate(currentAccount()); checkDue(); })}>{t("Réessayer")}</Button>
                    </>
                ) : <p>{t("Chargement des rappels…")}</p> : !records.length ? <p>{t("Aucun rappel. Faites un clic droit sur un message pour en créer un.")}</p> : (
                    <>
                        <p>{records.length} / {MAX_REMINDERS} {t("rappels")}</p>
                        <div className="mc-reminders-list">
                            {records.map(reminder => (
                                <article className="mc-reminders-card" key={reminder.id}>
                                    <div className="mc-reminders-meta">
                                        <strong>{reminder.author || t("Message")}</strong>
                                        <span>{reminder.dueAt <= Date.now() ? t("À traiter") : t("Prévu")} · {new Date(reminder.dueAt).toLocaleString()}</span>
                                    </div>
                                    <p className="mc-reminders-preview">{reminder.preview || t("Message avec pièce jointe ou contenu intégré")}</p>
                                    <div className="mc-reminders-actions">
                                        <Button size="small" onClick={() => { jumpTo(reminder); close(); }}>{t("Voir le message")}</Button>
                                        <Button size="small" variant="secondary" disabled={busy} onClick={() => void act(() => service.snooze(reminder.id, Date.now() + HOUR))}>{t("Reporter de 1 h")}</Button>
                                        <Button size="small" variant="secondary" disabled={busy} onClick={() => void act(() => service.snooze(reminder.id, tomorrowMorning(Date.now())))}>{t("Demain à 9 h")}</Button>
                                        <Button size="small" variant="dangerSecondary" disabled={busy} onClick={() => void act(() => service.dismiss(reminder.id))}>{t("Supprimer")}</Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </ModalContent>
            <ModalFooter><Button variant="secondary" onClick={close}>{t("Fermer")}</Button></ModalFooter>
        </ModalRoot>
    );
}

const SafeReminderList = ErrorBoundary.wrap(ReminderList, { noop: false });

function openManager() {
    if (!running || !currentAccount()) return;
    if (managerKey) closeModal(managerKey);
    const key = openModal(props => <SafeReminderList rootProps={props} close={() => closeModal(key)} />, {
        onCloseCallback: () => {
            modalKeys.delete(key);
            if (managerKey === key) managerKey = undefined;
        }
    });
    modalKeys.add(key);
    managerKey = key;
}

async function saveReminder(source: ReminderSource, dueAt: number, expectedSession: number) {
    if (!running || session !== expectedSession) throw new Error("Le compte actif a changé.");
    await service.add(source, dueAt);
    if (running && session === expectedSession) showToast(t("Rappel enregistré."), Toasts.Type.SUCCESS);
}

function DatePicker({ rootProps, close, source, expectedSession }: {
    rootProps: ModalProps; close: () => void; source: ReminderSource; expectedSession: number;
}) {
    const [value, setValue] = useState(localDateTime(Date.now() + HOUR));
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        setError("");
        try {
            await saveReminder(source, new Date(value).getTime(), expectedSession);
            close();
        } catch (error) { setError(t(error instanceof Error ? error.message : "Impossible de sauvegarder les rappels.")); }
        finally { setBusy(false); }
    };
    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL} aria-label={t("Créer un rappel")}>
            <ModalHeader className="mc-reminders-header"><Heading tag="h2">{t("Créer un rappel")}</Heading><ModalCloseButton onClick={close} /></ModalHeader>
            <ModalContent className="mc-reminders">
                <p className="mc-reminders-notice">{t(USAGE)}</p>
                <label className="mc-reminders-field">
                    {t("Date et heure locales")}
                    <input type="datetime-local" value={value} disabled={busy} min={localDateTime(Date.now())} onChange={event => setValue(event.target.value)} />
                </label>
                {error && <p role="alert" className="mc-reminders-error">{error}</p>}
            </ModalContent>
            <ModalFooter className="mc-reminders-actions">
                <Button disabled={busy || !value} onClick={() => void save()}>{busy ? t("Enregistrement…") : t("Créer le rappel")}</Button>
                <Button variant="secondary" onClick={close}>{t("Annuler")}</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function openDatePicker(source: ReminderSource, expectedSession: number) {
    if (!running || session !== expectedSession) return;
    const key = openModal(props => <DatePicker rootProps={props} close={() => closeModal(key)} source={source} expectedSession={expectedSession} />, {
        onCloseCallback: () => modalKeys.delete(key)
    });
    modalKeys.add(key);
}

function messageMenu(children: Array<ReactElement | null>, { message }: { message?: Message; }) {
    if (!message?.id || !message.channel_id || !running || !service.ready) return;
    const source: ReminderSource = {
        messageId: message.id, channelId: message.channel_id,
        guildId: ChannelStore.getChannel(message.channel_id)?.guild_id ?? null,
        preview: (message.content ?? "").slice(0, 300),
        author: (message.author?.globalName || message.author?.username || "").slice(0, 80)
    };
    const expectedSession = session;
    const schedule = (dueAt: number) => void saveReminder(source, dueAt, expectedSession).catch(error => handleError(error, expectedSession));
    children.push(
        <Menu.MenuGroup key="mc-message-reminders">
            <Menu.MenuItem id="mc-message-reminder" label={t("Me rappeler ce message")}>
                <Menu.MenuItem id="mc-reminder-hour" label={t("Dans 1 h")} action={() => schedule(Date.now() + HOUR)} />
                <Menu.MenuItem id="mc-reminder-tomorrow" label={t("Demain à 9 h")} action={() => schedule(tomorrowMorning(Date.now()))} />
                <Menu.MenuItem id="mc-reminder-custom" label={t("Choisir une date…")} action={() => openDatePicker(source, expectedSession)} />
                <Menu.MenuItem id="mc-reminder-list" label={t("Mes rappels")} action={openManager} />
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
}

function checkDue() {
    if (!running) return;
    const expectedSession = session;
    if (currentAccount() !== service.accountId) {
        onAccountChange();
        return;
    }
    void service.tick().catch(error => handleError(error, expectedSession));
}

function poll() {
    if (!running) return;
    checkDue();
    pollTimer = setTimeout(poll, 15_000);
}

function onAccountChange() {
    if (!running || currentAccount() === service.accountId) return;
    session++;
    const expectedSession = session;
    clearSurfaces();
    void service.activate(currentAccount()).then(() => {
        if (running && session === expectedSession) checkDue();
    }).catch(error => handleError(error, expectedSession));
}

function ReminderSettings() {
    const [permission, setPermission] = useState(typeof Notification === "undefined" ? "unavailable" : Notification.permission);
    return (
        <div className="mc-reminders">
            <p>{t(USAGE)}</p>
            <p className="mc-reminders-notice">{t("Le rappel s'ouvre dans Discord. Les notifications bureau sont facultatives et masquent le contenu du message.")}</p>
            <div className="mc-reminders-actions">
                <Button onClick={openManager}>{t("Gérer mes rappels")}</Button>
                {permission === "default" && <Button variant="secondary" onClick={() => {
                    void Notification.requestPermission().then(setPermission).catch(error => handleError(error));
                }}>{t("Activer les notifications bureau")}</Button>}
            </div>
        </div>
    );
}

export default definePlugin({
    name: "MessageReminders",
    description: "Rappels personnels sur les messages, avec report et récupération au démarrage.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "Midnightcord", id: 0n }],
    settingsAboutComponent: ReminderSettings,
    contextMenus: { message: messageMenu },
    toolboxActions: { [t("Mes rappels de messages")]: openManager },
    start() {
        running = true;
        UserStore.addChangeListener(onAccountChange);
        window.addEventListener("focus", checkDue);
        document.addEventListener("visibilitychange", checkDue);
        onAccountChange();
        poll();
    },
    stop() {
        running = false;
        session++;
        clearTimeout(pollTimer);
        pollTimer = undefined;
        UserStore.removeChangeListener(onAccountChange);
        window.removeEventListener("focus", checkDue);
        document.removeEventListener("visibilitychange", checkDue);
        service.stop();
        clearSurfaces();
    }
});
