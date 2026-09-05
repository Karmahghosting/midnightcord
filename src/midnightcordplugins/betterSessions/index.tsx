/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { tPlugin as t } from "@api/pluginI18n";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { React, SettingsRouter, UserStore } from "@webpack/common";

import { NewButton, RenameButton } from "./components/RenameButton";
import { checkIntervalMs } from "./monitor";
import { formatSessionTime, monitor, useSessions } from "./runtime";
import { Session, SessionInfo } from "./types";
import { cl, getDefaultName, GetOsColor, GetPlatformIcon } from "./utils";

const settings = definePluginSettings({
    backgroundCheck: {
        type: OptionType.BOOLEAN,
        description: "Vérifier périodiquement les nouvelles sessions et afficher une notification.",
        default: false,
        restartNeeded: true
    },
    checkInterval: {
        description: "Intervalle de vérification en minutes (minimum 5, maximum 1440).",
        type: OptionType.NUMBER,
        default: 20,
        restartNeeded: true
    }
});

let active = false;
let interval: ReturnType<typeof setInterval> | undefined;
let accountTimeout: ReturnType<typeof setTimeout> | undefined;
let viewedAccount: string | null = null;

function syncAccount() {
    if (!active) return;
    const accountId = UserStore.getCurrentUser()?.id ?? null;
    if (accountId !== monitor.getSnapshot().accountId) {
        viewedAccount = null;
        void monitor.activate(accountId);
    }
}

function scheduleAccountSync() {
    clearTimeout(accountTimeout);
    if (active) accountTimeout = setTimeout(syncAccount, 0);
}

function refresh() {
    if (!active) return;
    syncAccount();
    const snapshot = monitor.getSnapshot();
    if (!snapshot.ready && !snapshot.loading) void monitor.activate(UserStore.getCurrentUser()?.id ?? null);
    else void monitor.refresh();
}

function SessionName({ session }: SessionInfo) {
    const { accountId, saved } = useSessions();
    const savedSession = saved.get(session.id_hash);
    React.useEffect(() => { viewedAccount = accountId; }, [accountId]);
    return <>
        <Paragraph size="md" weight="semibold" color="text-strong">{savedSession?.name || getDefaultName(session.client_info)}</Paragraph>
        <div className={cl("footer-buttons")}>
            {savedSession?.isNew && <NewButton />}
            <RenameButton session={session} />
        </div>
    </>;
}

function SessionsPanel() {
    const snapshot = useSessions();
    return <section className={cl("panel")}>
        <Paragraph>{t("Les noms des appareils restent locaux à ce compte. Les vérifications interrogent uniquement Discord. Le premier relevé enregistre les appareils existants sans déclencher d'alerte.")}</Paragraph>
        <div className={cl("actions")}>
            <Button size="small" disabled={!active || snapshot.loading} onClick={refresh}>{snapshot.loading ? t("Vérification…") : t("Actualiser les sessions")}</Button>
            <Button size="small" variant="secondary" onClick={() => SettingsRouter?.openUserSettings("sessions_panel")}>{t("Ouvrir les appareils Discord")}</Button>
        </div>
        {!active && <Paragraph>{t("Activez BetterSessions pour charger vos appareils.")}</Paragraph>}
        {snapshot.error && <Paragraph color="text-danger" role="alert">{t(snapshot.error)}</Paragraph>}
        {snapshot.ready && !snapshot.loading && !snapshot.sessions.length && <Paragraph>{t("Aucune session disponible.")}</Paragraph>}
        {snapshot.sessions.map(session => <article key={`${snapshot.accountId}:${session.id_hash}`} className={cl("session")}>
            <div className={cl("session-header")}>
                <Heading tag="h4">{snapshot.saved.get(session.id_hash)?.name || getDefaultName(session.client_info)}</Heading>
                {snapshot.saved.get(session.id_hash)?.isNew && <NewButton />}
                <RenameButton session={session} />
            </div>
            <Paragraph>{getDefaultName(session.client_info)}{session.client_info.location ? ` · ${session.client_info.location}` : ""}</Paragraph>
            <Paragraph>{t("Dernière utilisation estimée :")} {formatSessionTime(session.approx_last_used_time)}</Paragraph>
        </article>)}
        {snapshot.accountId && snapshot.sessions.some(session => snapshot.saved.get(session.id_hash)?.isNew) && <Button size="small" variant="secondary" onClick={() => void monitor.markSeen(snapshot.accountId!)}>{t("Marquer les nouvelles sessions comme vues")}</Button>}
    </section>;
}

export default definePlugin({
    name: "BetterSessions",
    description: "Names devices, displays session timestamps and alerts you when a new Discord session is detected.",
    authors: [Devs.amia],
    tags: ["Notifications", "Customisation", "Utility"],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: SessionsPanel,
    toolboxActions: {
        "Vérifier les sessions": refresh,
        "Ouvrir les appareils Discord": () => SettingsRouter?.openUserSettings("sessions_panel")
    },
    patches: [
        {
            find: "#{intl::AUTH_SESSIONS_OS_UNKNOWN}",
            replacement: [
                {
                    match: /(#{intl::AUTH_SESSIONS_ACTIVE_RECENTLY}.{0,230}role:"listitem",children:\[.{0,15},\{icon:)\i/,
                    replace: "$1()=>$self.renderIcon(arguments[0])"
                },
                {
                    match: /("horizontal",gap:"xs",children:)\[.{0,250}"text-subtle",children:\i\}\)\]\}\),/,
                    replace: "$1$self.renderName(arguments[0])}),"
                },
                {
                    match: /("text-muted",children:)\i(?=\}\)\]\}\),.{0,120}\.client_info\?\.location)/,
                    replace: "$1$self.renderDescription(arguments[0])"
                },
                {
                    match: /:\i\(\i\.approx_last_used_time\).{0,40}\(0,\i\.jsxs?\)\(\i,\{/,
                    replace: "$&session:arguments[0]?.session,"
                }
            ]
        }
    ],
    renderName: ErrorBoundary.wrap(SessionName, { noop: true }),
    renderDescription: ErrorBoundary.wrap(({ session, description }: { session: Session; description: string; }) => (
        <span className={cl("description")} title={formatSessionTime(session.approx_last_used_time)}>{description} · {formatSessionTime(session.approx_last_used_time)}</span>
    ), { noop: true }),
    renderIcon: ErrorBoundary.wrap(({ session, icon: DeviceIcon }: { session: Session; icon: React.ComponentType<any>; }) => {
        const PlatformIcon = GetPlatformIcon(session.client_info.platform);
        return <div className={cl("icon")} style={{ backgroundColor: GetOsColor(session.client_info.os) }}>
            <DeviceIcon size="md" color="currentColor" />
            <PlatformIcon width={14} height={14} />
        </div>;
    }, { noop: true }),
    flux: {
        CONNECTION_OPEN: scheduleAccountSync,
        CURRENT_USER_UPDATE: scheduleAccountSync,
        LOGOUT() {
            clearTimeout(accountTimeout);
            viewedAccount = null;
            monitor.stop();
        },
        USER_SETTINGS_ACCOUNT_RESET_AND_CLOSE_FORM() {
            const { accountId } = monitor.getSnapshot();
            if (accountId && viewedAccount === accountId) void monitor.markSeen(accountId);
            viewedAccount = null;
        }
    },
    start() {
        active = true;
        syncAccount();
        if (settings.store.backgroundCheck) {
            interval = setInterval(() => { syncAccount(); void monitor.refresh(); }, checkIntervalMs(settings.store.checkInterval));
        }
    },
    stop() {
        active = false;
        clearInterval(interval);
        clearTimeout(accountTimeout);
        interval = undefined;
        accountTimeout = undefined;
        viewedAccount = null;
        monitor.stop();
    }
});
