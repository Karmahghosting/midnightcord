/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { findByPropsLazy } from "@webpack";
import definePlugin from "@utils/types";
import { ChannelStore, ContextMenuApi, FluxDispatcher, Menu, React, SelectedChannelStore, VoiceActions, MediaEngineStore, UserStore } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

let isGhostActive = false;
let configFakeMute = true;
let configFakeDeafen = true;

// Discord Gateway socket module
const GatewaySocket = findByPropsLazy("getSocket");

/**
 * Send op:4 (Voice State Update) directly through the Gateway socket
 * with the calculated mute/deafen values.
 */
function sendFakeVoiceState() {
    try {
        const channelId = SelectedChannelStore?.getVoiceChannelId?.();
        if (!channelId) return;

        const socket = GatewaySocket?.getSocket?.();
        if (!socket) return;

        const channel = ChannelStore?.getChannel?.(channelId);

        // If active, use our fake states. If inactive, restore the real Discord states.
        const muteState = isGhostActive ? configFakeMute : MediaEngineStore.isSelfMute();
        const deafState = isGhostActive ? configFakeDeafen : MediaEngineStore.isSelfDeaf();

        socket.send(4, {
            guild_id: channel?.guild_id ?? null,
            channel_id: channelId,
            self_mute: muteState,
            self_deaf: deafState,
            self_video: false,
        });
    } catch (e) {
        console.error("[FakeVoice] sendFakeVoiceState error:", e);
    }
}

/**
 * Instantly override the Gateway packet with our target state.
 */
const syncState = () => {
    if (!SelectedChannelStore?.getVoiceChannelId?.()) return;
    lastSyncTime = Date.now();
    sendFakeVoiceState();
};

let lastSyncTime = 0;

/**
 * Called when Discord itself toggles mute/deafen — re-assert our fake state immediately.
 */
function onVoiceStateChange(event: any) {
    if (!isGhostActive) return;

    // Prevent infinite loops: if we just sent a sync < 1000ms ago, ignore the server's echo
    if (Date.now() - lastSyncTime < 1000) return;

    // Prevent spam: only re-assert if the voice state update is actually for OUR user
    if (event?.type === "VOICE_STATE_UPDATES") {
        const myId = UserStore.getCurrentUser()?.id;
        const myUpdate = event.voiceStates?.find((v: any) => v.userId === myId);
        if (!myUpdate) return;
    }

    lastSyncTime = Date.now();
    // Send it on the next tick so Discord's internal packet goes first
    setTimeout(sendFakeVoiceState, 0);
}

function FakeDeafenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C7.58 2 4 5.58 4 10V19C4 20.66 5.34 22 7 22C8.66 22 10 20.66 10 19C10 20.66 11.34 22 13 22C14.66 22 16 20.66 16 19C16 20.66 17.34 22 19 22C20.66 22 22 20.66 22 19V10C22 5.58 18.42 2 14 2H10H12Z" fill="currentColor" />
            <circle cx="8.5" cy="10" r="1.5" fill={isGhostActive ? "#121212" : "black"} fillOpacity="0.6" />
            <circle cx="15.5" cy="10" r="1.5" fill={isGhostActive ? "#121212" : "black"} fillOpacity="0.6" />
            {isGhostActive && (
                <path d="M2 2L22 22" stroke="#ed4245" strokeWidth="2.5" strokeLinecap="round" />
            )}
        </svg>
    );
}

function GhostContextMenu() {
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    return (
        <Menu.Menu navId="fake-voice-menu" aria-label="Fake Voice Configuration" onClose={ContextMenuApi.closeContextMenu}>
            <Menu.MenuGroup label={t("Ghost Options")}>
                <Menu.MenuCheckboxItem
                    id="opt-both"
                    label={t("Fake Mute & Deafen")}
                    checked={configFakeMute && configFakeDeafen}
                    action={() => {
                        const nextState = !(configFakeMute && configFakeDeafen);
                        configFakeMute = nextState;
                        configFakeDeafen = nextState;
                        forceUpdate();
                        if (isGhostActive) sendFakeVoiceState();
                    }}
                />
                <Menu.MenuSeparator />
                <Menu.MenuCheckboxItem
                    id="opt-mute"
                    label={t("Fake Mute")}
                    checked={configFakeMute}
                    action={() => {
                        configFakeMute = !configFakeMute;
                        forceUpdate();
                        if (isGhostActive) sendFakeVoiceState();
                    }}
                />
                <Menu.MenuCheckboxItem
                    id="opt-deafen"
                    label={t("Fake Deafen")}
                    checked={configFakeDeafen}
                    action={() => {
                        configFakeDeafen = !configFakeDeafen;
                        forceUpdate();
                        if (isGhostActive) sendFakeVoiceState();
                    }}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

function FakeDeafenUserButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps & { hideTooltips?: boolean }) {
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    return (
        <UserAreaButton
            onClick={() => {
                isGhostActive = !isGhostActive;
                syncState();
                forceUpdate();
            }}
            onContextMenu={(e: React.MouseEvent) => ContextMenuApi.openContextMenu(e, () => <GhostContextMenu />)}
            tooltipText={hideTooltips ? undefined : isGhostActive ? t("Disable Fake Voice") : t("Enable Fake Voice (Right: Config)")}
            icon={<FakeDeafenIcon className={iconForeground} />}
            role="switch"
            aria-checked={isGhostActive}
            redGlow={false}
            plated={nameplate != null}
        />
    );
}

export default definePlugin({
    name: "FakeVoice",
    enabledByDefault: true,
    description: "Appear muted or deaf while listening. By mushzi.",
    authors: [{ name: "mushzi",
     id: 449282863582412850n }],
    dependencies: ["CommandsAPI", "UserAreaAPI"],

    start() {
        // Re-assert our fake state whenever Discord internally updates voice state
        FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_MUTE", onVoiceStateChange);
        FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_DEAF", onVoiceStateChange);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateChange);
    },

    stop() {
        FluxDispatcher.unsubscribe("AUDIO_TOGGLE_SELF_MUTE", onVoiceStateChange);
        FluxDispatcher.unsubscribe("AUDIO_TOGGLE_SELF_DEAF", onVoiceStateChange);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateChange);
        isGhostActive = false;
    },

    userAreaButton: {
        icon: FakeDeafenIcon,
        render: FakeDeafenUserButton
    },

    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakemute",
            description: "Toggle Fake Mute",
            execute: async (_, ctx) => {
                configFakeMute = !configFakeMute;
                isGhostActive = configFakeMute;
                syncState();
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Mute** is ${isGhostActive ? t("enabled") : t("disabled")}.` });
            },
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakedeafen",
            description: "Toggle Fake Deafen",
            execute: async (_, ctx) => {
                configFakeDeafen = !configFakeDeafen;
                isGhostActive = configFakeDeafen;
                syncState();
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Deafen** is ${isGhostActive ? t("enabled") : t("disabled")}.` });
            },
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakedeafen_mute",
            description: "Toggle Fake Deafen & Mute simultaneously",
            execute: async (_, ctx) => {
                const next = !(configFakeMute && configFakeDeafen);
                configFakeMute = next;
                configFakeDeafen = next;
                isGhostActive = next;
                syncState();
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Deafen & Mute** are ${isGhostActive ? t("enabled") : t("disabled")}.` });
            },
        },
    ]
});
