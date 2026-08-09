/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VencordTab.css";

import { isCompactModeEnabled, isStealthModeEnabled, toggleCompactMode, toggleStealthMode } from "@api/HeaderBar";
import { t } from "@api/i18n";
import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { plugins } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { GithubIcon, HeartIcon, PaintbrushIcon, RestartIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { openPluginModal, SettingsTab, wrapTab } from "@components/settings";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { React } from "@webpack/common";

import { openNotificationSettingsModal } from "./NotificationSettings";

const cl = classNameFactory("vc-vencord-tab-");

function openExternal(url: string) {
    if (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) {
        VencordNative.native.openExternal(url);
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

function QuickActionsSection() {
    return (
        <QuickActionCard>
            <QuickAction
                Icon={GithubIcon}
                text="Source Code"
                action={() => openExternal("https://github.com/Karmahghosting/midnightcord")}
            />
            <QuickAction
                Icon={PaintbrushIcon}
                text="Edit QuickCSS"
                action={() => typeof VencordNative !== "undefined" && VencordNative?.quickCss?.openEditor?.()}
            />
            {!IS_WEB && (
                <QuickAction
                    Icon={RestartIcon}
                    text="Relaunch Discord"
                    action={relaunch}
                />
            )}
            <QuickAction
                Icon={HeartIcon}
                text="Ko-fi"
                action={() => openExternal("https://ko-fi.com/midnightcord")}
            />
        </QuickActionCard>
    );
}

type KeysOfType<Object, Type> = {
    [K in keyof Object]: Object[K] extends Type ? K : never;
}[keyof Object];

function useCompactActive() {
    const [active, setActive] = React.useState(isCompactModeEnabled);
    React.useEffect(() => {
        const handler = () => setActive(isCompactModeEnabled());
        window.addEventListener("midnightcord-compact-change", handler);
        return () => window.removeEventListener("midnightcord-compact-change", handler);
    }, []);
    return active;
}

function useStealthActive() {
    const [active, setActive] = React.useState(isStealthModeEnabled);
    React.useEffect(() => {
        const handler = () => setActive(isStealthModeEnabled());
        window.addEventListener("midnightcord-stealth-change", handler);
        return () => window.removeEventListener("midnightcord-stealth-change", handler);
    }, []);
    return active;
}

function StealthModeSection() {
    const enabled = useStealthActive();

    return (
        <>
            <Heading className={Margins.top20}>{t("Stealth Mode")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {enabled
                    ? "Stealth mode is enabled â€” all Midnightcord visual elements are hidden. Shortcut: Ctrl+Shift+H"
                    : t("Hides all Midnightcord visual elements without disabling plugins. Shortcut: Ctrl+Shift+H")}
            </Paragraph>
            <Button
                onClick={toggleStealthMode}
                variant={enabled ? "secondary" : "primary"}
            >
                {enabled ? t("Disable Stealth Mode") : t("Enable Stealth Mode")}
            </Button>
        </>
    );
}

function StealthModeButton() {
    const enabled = useStealthActive();

    return (
        <Button
            onClick={toggleStealthMode}
            variant={enabled ? "dangerPrimary" : "primary"}
        >
            {enabled ? t("✓ Stealth Mode Enabled — Click to disable") : t("Enable Stealth Mode")}
        </Button>
    );
}

function EquicordSettings() {
    const settings = useSettings();
    const stealthActive = useStealthActive();
    const compactActive = useCompactActive();

    const needsVibrancySettings = IS_DISCORD_DESKTOP && IS_MAC;

    const Switches: Array<false | {
        key: KeysOfType<typeof settings, boolean>;
        title: string;
        description?: string;
        restartRequired?: boolean;
        warning: { enabled: boolean; message?: string; };
    }>
        = [

            {
                key: "useQuickCss",
                title: t("Enable Custom CSS"),
                description: t("Load custom CSS from the QuickCSS editor. This allows you to customize Discord's appearance with your own styles."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB && {
                key: "enableReactDevtools",
                title: t("Enable React Developer Tools"),
                description: t("Enable the React Developer Tools extension for debugging Discord's React components. Useful for plugin development."),
                restartRequired: true,
                warning: { enabled: false },
            },
            (!IS_WEB && !IS_DISCORD_DESKTOP || !IS_WINDOWS) && {
                key: "mainWindowFrameless",
                title: t("Disable the Main Window Frame"),
                description: t("Remove the native window frame for a cleaner look. You can still move the window by dragging the title bar area."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB &&
            (!IS_DISCORD_DESKTOP || !IS_WINDOWS
                ? {
                    key: "frameless",
                    title: t("Disable All Window Frames"),
                    description: t("Remove the native window frame for a cleaner look. You can still move the window by dragging the title bar area."),
                    restartRequired: true,
                    warning: { enabled: false },
                }
                : {
                    key: "winNativeTitleBar",
                    title: t("Use Windows' native title bar instead of Discord's custom one"),
                    description: t("Replace Discord's custom title bar with the standard Windows title bar. This may improve compatibility with some window management tools."),
                    restartRequired: true,
                    warning: { enabled: false },
                }
            ),

            !IS_WEB && {
                key: "transparent",
                title: t("Enable Window Transparency"),
                description: t("Make the Discord window transparent. A theme that supports transparency is required or this will do nothing."),
                restartRequired: true,
                warning: {
                    enabled: true,
                    message: IS_WINDOWS
                        ? t("This will stop the window from being resizable and prevents you from snapping the window to screen edges.")
                        : t("This will stop the window from being resizable."),
                },
            },
            IS_DISCORD_DESKTOP && {
                key: "disableMinSize",
                title: t("Disable Minimum Window Size"),
                description: t("Allow the Discord window to be resized smaller than its default minimum size. Useful for tiling window managers or small screens."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB &&
            IS_WINDOWS && {
                key: "winCtrlQ",
                title: t("Register Ctrl+Q as shortcut to close Discord"),
                description: t("Add Ctrl+Q as a keyboard shortcut to close Discord. This provides an alternative to Alt+F4 for quickly closing the application."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB && {
                key: "streamProof",
                title: t("Enable StreamProof"),
                description: t("Hide the entire Discord window from streams, screen recordings, and screenshots. Shortcut: Ctrl+Shift+G. When enabled, capturing software will see a black window."),
                restartRequired: false,
                warning: { enabled: false },
            },
            !IS_WEB && {
                key: "disableAutoUpdate",
                title: t("Disable Automatic Updates"),
                description: t("Prevent Midnightcord from automatically checking, downloading, or prompting for updates on startup. You can still update manually in the \"Updater\" settings tab."),
                restartRequired: false,
                warning: { enabled: false },
            },
        ];

    return (
        <SettingsTab>

            {!stealthActive && (<>

                <Divider className={Margins.top20} />

                <Heading className={Margins.top16}>{t("Quick Actions")}</Heading>
                <Paragraph className={Margins.bottom16}>
                    {t("Common actions you might want to perform. These shortcuts give you quick access to frequently used features without navigating through menus.")}
                </Paragraph>

                <QuickActionsSection />

                <Divider className={Margins.top20} />

                <Heading className={Margins.top20}>{t("Client Settings")}</Heading>
                <Paragraph className={Margins.bottom16}>
                    {t("Configure how Midnightcord behaves and integrates with Discord. These settings affect the Discord client's appearance and behavior.")}
                </Paragraph>
                <Notice.Info className={Margins.bottom20} style={{ width: "100%" }}>
                    {t("You can customize where this settings section appears in Discord's settings menu by configuring the")} {" "}
                    <a
                        role="button"
                        onClick={() => openPluginModal(plugins.Settings)}
                        style={{ cursor: "pointer", color: "var(--text-link)" }}
                    >
                        {t("Settings Plugin")}
                    </a>.
                </Notice.Info>

                {Switches.filter((s): s is Exclude<typeof s, false> => !!s).map(
                    s => (
                        <FormSwitch
                            key={s.key}
                            value={settings[s.key]}
                             onChange={v => {
                                 settings[s.key] = v;
                                 if (s.key === "streamProof" && typeof VencordNative !== "undefined") {
                                     VencordNative?.setContentProtection?.(v);
                                 }
                             }}
                            title={s.title}
                            description={
                                s.warning.enabled ? (
                                    <>
                                        {s.description}
                                        <Notice.Warning className={Margins.top8} style={{ width: "100%" }}>
                                            {s.warning.message}
                                        </Notice.Warning>
                                    </>
                                ) : (
                                    s.description
                                )
                            }
                            hideBorder
                        />
                    ),
                )}

                {needsVibrancySettings && (
                    <>
                        <Divider className={Margins.top20} />

                        <Heading className={Margins.top20}>Window Vibrancy</Heading>
                        <Paragraph className={Margins.bottom16}>
                            Customize the macOS window vibrancy effect. This controls the blur and transparency style of the Discord window. Changes require a restart to take effect.
                        </Paragraph>
                        <select
                            className={Margins.bottom20}
                            aria-label="Window vibrancy style"
                            value={settings.macosVibrancyStyle ?? ""}
                            onChange={event => (settings.macosVibrancyStyle = (event.currentTarget.value || undefined) as typeof settings.macosVibrancyStyle)}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                borderRadius: 4,
                                background: "var(--background-tertiary)",
                                color: "var(--text-normal)",
                                border: "1px solid var(--background-modifier-accent)"
                            }}
                        >
                            <option value="">No vibrancy</option>
                            <option value="under-page">Under Page (window tinting)</option>
                            <option value="content">Content</option>
                            <option value="window">Window</option>
                            <option value="selection">Selection</option>
                            <option value="titlebar">Titlebar</option>
                            <option value="header">Header</option>
                            <option value="sidebar">Sidebar</option>
                            <option value="tooltip">Tooltip</option>
                            <option value="menu">Menu</option>
                            <option value="popover">Popover</option>
                            <option value="fullscreen-ui">Fullscreen UI</option>
                            <option value="hud">HUD</option>
                        </select>
                    </>
                )}

                <Divider className={Margins.top20} />

                <Heading className={Margins.top20}>{t("Notifications")}</Heading>
                <Paragraph className={Margins.bottom16}>
                    {t("Configure how Midnightcord handles notifications. You can customize when and how you receive alerts, or view a history of past notifications.")}
                </Paragraph>

                <Flex gap="16px">
                    <Button onClick={openNotificationSettingsModal}>
                        {t("Notification Settings")}
                    </Button>
                    <Button variant="secondary" onClick={openNotificationLogModal}>
                        {t("View Notification Log")}
                    </Button>
                </Flex>

            </>)}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Compact Mode")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Replaces all Midnightcord buttons with a single compact toggle icon. Click the icon in the header bar, channel toolbar, or chat bar to restore all buttons.")}
            </Paragraph>
            <Button
                onClick={toggleCompactMode}
                variant={compactActive ? "dangerPrimary" : "primary"}
            >
                {compactActive ? t("✓ Compact Mode Enabled — Click to disable") : t("Enable Compact Mode")}
            </Button>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Stealth Mode")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Hides all Midnightcord visual elements without disabling plugins. Shortcut: Ctrl+Shift+H")}
            </Paragraph>
            <StealthModeButton />

        </SettingsTab>
    );
}

export default wrapTab(EquicordSettings, "Midnightcord Settings");
