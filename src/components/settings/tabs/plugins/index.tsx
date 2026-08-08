/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { isPluginEnabled, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Notice } from "@components/Notice";
import { Divider } from "@components/Divider";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings";
import { debounce } from "@shared/debounce";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { isTruthy } from "@utils/guards";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { relaunch, showItemInFolder } from "@utils/native";
import { useAwaiter } from "@utils/react";
import { Alerts, lodash, Parser, React, Select as DiscordSelect, TextInput, Toasts, Tooltip, useCallback, useMemo, useState } from "@webpack/common";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { JSX } from "react";
import { t } from "@api/i18n";

import Plugins, { ExcludedPlugins, PluginMeta } from "~plugins";
import { fetchPluginRatings, PluginRatings } from "@api/PluginLikes";
import { authorizeLikeSystem, LIKE_AUTH_EVENT } from "@api/PluginLikesAuth";
import { getStoredToken } from "@api/OAuth2";

import { PluginCard } from "./PluginCard";
import { openPluginModal, openResetDefaultsModal, openWarningModal } from "./PluginModal";
import { StockPluginsCard } from "./PluginStatCards";
import { TUTORIAL_PLUGIN_NAMES } from "./tutorialList";
import { UIElementsButton } from "./UIElements";

const MIDNIGHTCORD_TAB_ICON = "data:image/png;base64,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";
const VENCORD_EQUICORD_TAB_ICON = "data:image/png;base64,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";

function MidnightcordTabIcon() {
    return <img src={MIDNIGHTCORD_TAB_ICON} alt="Midnightcord" style={{ width: 18, height: 18, borderRadius: 4 }} />;
}

function VencordEquicordTabIcon() {
    return <img src={VENCORD_EQUICORD_TAB_ICON} alt="Vencord & Equicord" style={{ width: 18, height: 18, borderRadius: 4 }} />;
}

function UserPluginsTabIcon() {
    return <img src="https://equicord.org/assets/icons/misc/userplugin.png" alt={t("User Plugins")} style={{ width: 18, height: 18, borderRadius: 4 }} />;
}

function LikedPluginsTabIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="#fff" d="M12.47 21.73a.92.92 0 0 1-.94 0C9.43 20.48 1 15.09 1 8.75A5.75 5.75 0 0 1 6.75 3c2.34 0 3.88.9 5.25 2.26A6.98 6.98 0 0 1 17.25 3 5.75 5.75 0 0 1 23 8.75c0 6.34-8.42 11.73-10.53 12.98Z" />
        </svg>
    );
}

const makeCategoryOptions = (othersCount?: number) => [
    { label: "Vencord & Equicord", value: SearchStatus.OTHERS },
    { label: "Midnightcord", value: SearchStatus.MIDNIGHTCORD },
    { label: t("User Plugins"), value: SearchStatus.USER_PLUGINS },
    { label: t("Liked Plugins"), value: SearchStatus.LIKED_PLUGINS },
    { label: t("Community Plugins"), value: "community", disabled: true }
];
export const cl = classNameFactory("vc-plugins-");
export const logger = new Logger("PluginSettings", "#a6d189");

function showErrorToast(message: string) {
    Toasts.show({
        message,
        type: Toasts.Type.FAILURE,
        id: Toasts.genId(),
        options: {
            position: Toasts.Position.BOTTOM
        }
    });
}

function ReloadRequiredCard({ required, enabledPlugins, openWarningModal, resetCheckAndDo, applyDefaultConfigCheckAndDo }) {
    return (
        <Card className={classes(cl("info-card"), required && "vc-warning-card")}>
            {required ? (
                <>
                    <HeadingTertiary>{t("Restart required!")}</HeadingTertiary>
                    <Paragraph className={cl("dep-text")}>
                        {t("Restart now to apply new plugins and their settings")}
                    </Paragraph>
                    <Button variant="primary" className={cl("restart-button")} onClick={() => relaunch()}>
                        {t("Restart")}
                    </Button>
                </>
            ) : (
                <>
                    <HeadingTertiary>{t("Plugin Management")}</HeadingTertiary>
                    <Paragraph>{t("Press the cog wheel or info icon to get more info on a plugin")}</Paragraph>
                    <Paragraph>{t("Plugins with a cog wheel have settings you can modify!")}</Paragraph>
                </>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
                {enabledPlugins.length > 0 && !required && (
                    <Button
                        variant="secondary"
                        size="small"
                        className={"vc-plugins-disable-warning vc-modal-align-reset"}
                        onClick={() => {
                            return openWarningModal(null, undefined, false, enabledPlugins.length, resetCheckAndDo);
                        }}
                    >
                        {t("Disable All Plugins")}
                    </Button>
                )}
                {!required && (
                    <Button
                        variant="secondary"
                        size="small"
                        className={"vc-plugins-disable-warning vc-modal-align-reset"}
                        onClick={() => {
                            return openResetDefaultsModal(applyDefaultConfigCheckAndDo);
                        }}
                    >
                        {t("Apply Default Config")}
                    </Button>
                )}
            </div>
        </Card>
    );
}

export const ExcludedReasons: Record<"web" | "discordDesktop" | "vesktop" | "equibop" | "desktop" | "dev", string> = {
    desktop: "Discord Desktop app or Vesktop/Equibop",
    discordDesktop: "Discord Desktop app",
    vesktop: "Vesktop/Equibop apps",
    equibop: "Vesktop/Equibop apps",
    web: "Vesktop/Equibop apps & Discord web",
    dev: "Developer version of Midnightcord"
};

function ExcludedPluginsList({ search }: { search: string; }) {
    const matchingExcludedPlugins = search
        ? Object.entries(ExcludedPlugins)
            .filter(([name]) => name.toLowerCase().includes(search))
        : [];

    return (
        <Paragraph className={Margins.top16}>
            {matchingExcludedPlugins.length
                ? <>
                    <Paragraph>{t("Are you looking for:")}</Paragraph>
                    <ul>
                        {matchingExcludedPlugins.map(([name, reason]) => (
                            <li key={name}>
                                <b>{name}</b>: Only available on the {ExcludedReasons[reason]}
                            </li>
                        ))}
                    </ul>
                </>
                : t("No plugins meet the search criteria.")
            }
        </Paragraph>
    );
}

import { SearchStatus, TUTORIAL_CACHE } from "./components/Common";

// Fallback select natif si le composant Discord n'est pas trouvé
function NativeSelect({ options, select, isSelected }: any) {
    const currentVal = options.find((o: any) => isSelected(o.value))?.value ?? options.find((o: any) => o.default)?.value ?? options[0]?.value;
    return (
        <select
            style={{
                background: "var(--background-secondary)",
                color: "var(--text-normal)",
                border: "1px solid var(--background-modifier-accent)",
                borderRadius: 4,
                padding: "6px 10px",
                fontSize: 14,
                cursor: "pointer",
                outline: "none",
            }}
            value={currentVal}
            onChange={e => select(Number(e.target.value))}
        >
            {options.map((o: any) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}

const Select = DiscordSelect || NativeSelect;
interface PluginSettingsProps {
    premiumOnly?: boolean;
}

export default function PluginSettings({ premiumOnly = false }: PluginSettingsProps) {
    const settings = useSettings();
    const changes = React.useMemo(() => new ChangeList<string>(), []);

    // Expand Discord's content column to fill the full available width
    React.useEffect(() => {
        const col = document.querySelector<HTMLElement>('[class*="contentColumn"]');
        if (!col) return;
        const prevPaddingLeft = col.style.paddingLeft;
        const prevPaddingRight = col.style.paddingRight;
        const prevMaxWidth = col.style.maxWidth;
        col.style.paddingLeft = "16px";
        col.style.paddingRight = "16px";
        col.style.maxWidth = "none";
        return () => {
            col.style.paddingLeft = prevPaddingLeft;
            col.style.paddingRight = prevPaddingRight;
            col.style.maxWidth = prevMaxWidth;
        };
    }, []);

    // Static list — no fetch, no CORS issues.
    // Also populate TUTORIAL_CACHE so the SearchStatus.TUTORIAL filter works.
    const tutorialPlugins = useMemo(() => {
        for (const name of Object.values(Plugins).map(p => p.name).filter(Boolean)) {
            TUTORIAL_CACHE.set(name, TUTORIAL_PLUGIN_NAMES.has(name));
        }
        return TUTORIAL_PLUGIN_NAMES;
    }, []);

    React.useEffect(() => {
        return () => {
            if (!changes.hasChanges) return;

            const allChanges = [...changes.getChanges()];
            const pluginNames = [...new Set(allChanges.map(s => s.split(":")[0]))];
            const maxDisplay = 15;
            const displayed = pluginNames.slice(0, maxDisplay);
            const remainingCount = pluginNames.length - displayed.length;

            Alerts.show({
                title: "Restart required",
                body: (
                    <div>
                        {displayed.map((s, i) => (
                            <span key={i}>
                                {i > 0 && ", "}
                                {Parser.parse("`" + s + "`")}
                            </span>
                        ))}
                        {remainingCount > 0 && <span> and {remainingCount} more</span>}
                    </div>
                ),
                confirmText: "Restart now",
                cancelText: "Later!",
                onConfirm: () => relaunch()
            });
        };
    }, []);

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, []);

    const [ratings, setRatings] = React.useState<PluginRatings>({});
    React.useEffect(() => {
        fetchPluginRatings().then(setRatings).catch(() => {});
    }, []);

    const [isLikeLoggedIn, setIsLikeLoggedIn] = React.useState(true);
    const [likeLoginLoading, setLikeLoginLoading] = React.useState(false);
    React.useEffect(() => {
        let cancelled = false;
        const refresh = () => getStoredToken().then(token => { if (!cancelled) setIsLikeLoggedIn(!!token); });
        refresh();
        window.addEventListener(LIKE_AUTH_EVENT, refresh);
        return () => {
            cancelled = true;
            window.removeEventListener(LIKE_AUTH_EVENT, refresh);
        };
    }, []);

    const handleLikeLogin = useCallback(async () => {
        if (likeLoginLoading) return;
        setLikeLoginLoading(true);
        try {
            const token = await authorizeLikeSystem();
            if (token) {
                setIsLikeLoggedIn(true);
                fetchPluginRatings(true).then(setRatings).catch(() => {});
            }
        } finally {
            setLikeLoginLoading(false);
        }
    }, [likeLoginLoading]);

    const sortedPlugins = useMemo(() => Object.values(Plugins)
        .filter(p => typeof p.name === "string")
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")), []);

    const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), []);

    const [searchValue, setSearchValue] = useState({ value: "", status: SearchStatus.MIDNIGHTCORD });
    const [searchInput, setSearchInput] = useState("");

    const debouncedSetSearch = useMemo(
        () => debounce((query: string) => setSearchValue(prev => ({ ...prev, value: query })), 150),
        []
    );

    const search = searchValue.value.toLowerCase();
    const onSearch = useCallback((query: string) => {
        setSearchInput(query);
        debouncedSetSearch(query);
    }, [debouncedSetSearch]);

    const BATCH_SIZE = 40;
    const [visibleCount, setVisibleCount] = React.useState(BATCH_SIZE);

    const observer = React.useRef<IntersectionObserver>();
    const sentinelRef = React.useCallback((node: HTMLDivElement | null) => {
        if (observer.current) observer.current.disconnect();
        if (node) {
            observer.current = new IntersectionObserver(
                entries => {
                    if (entries[0].isIntersecting) {
                        const total = allDataLengthRef.current;
                        React.startTransition(() => {
                            setVisibleCount(v => Math.min(v + BATCH_SIZE, total));
                        });
                    }
                },
                { rootMargin: "400px" } // trigger loading before it comes into view
            );
            observer.current.observe(node);
        }
    }, []);

    const onStatusChange = useCallback((status: SearchStatus) => {
        setVisibleCount(BATCH_SIZE);
        React.startTransition(() => {
            setSearchValue(prev => ({ ...prev, status }));
        });
    }, []);

    const pluginFilter = useCallback((plugin: typeof Plugins[keyof typeof Plugins], newPluginsSet: Set<string> | null) => {
        // Filter by premium status first
        const isPremiumPlugin = !!plugin.premium;
        if (premiumOnly) {
            if (!isPremiumPlugin) return false;
        } else {
            if (isPremiumPlugin) return false;
        }

        const { status } = searchValue;
        const enabled = isPluginEnabled(plugin.name);

        const pluginMeta = PluginMeta[plugin.name];

        switch (status) {
            case SearchStatus.DISABLED:
                if (enabled) return false;
                break;
            case SearchStatus.ENABLED:
                if (!enabled) return false;
                break;
            case SearchStatus.MIDNIGHTCORD:
                if (!pluginMeta?.folderName?.startsWith("src/midnightcordplugins/")) return false;
                break;
            case SearchStatus.OTHERS:
                if (pluginMeta?.folderName?.startsWith("src/midnightcordplugins/") || pluginMeta?.folderName?.startsWith("src/plugins/_")) return false;
                if (!pluginMeta?.folderName?.startsWith("src/plugins/")) return false;
                break;
            case SearchStatus.VENCORD:
                if (!pluginMeta?.folderName?.startsWith("src/plugins/")) return false;
                break;
            case SearchStatus.NEW:
                if (!newPluginsSet?.has(plugin.name)) return false;
                break;
            case SearchStatus.USER_PLUGINS:
                if (!pluginMeta?.userPlugin) return false;
                break;
            case SearchStatus.API_PLUGINS:
                if (!plugin.name.endsWith("API")) return false;
                break;
            case SearchStatus.TUTORIAL:
                if (!TUTORIAL_CACHE.get(plugin.name)) return false;
                break;
            case SearchStatus.LIKED_PLUGINS:
                if (!pluginMeta?.folderName?.startsWith("src/midnightcordplugins/")) return false;
                if (!ratings[plugin.name]?.likedByMe) return false;
                break;
        }

        if (!search.length) return true;

        const isIllegalcordPartner = (
            plugin.name === "DynamicIslande" ||
            plugin.name === "StereoInstaller" ||
            plugin.name === "ClientDiagnostics" ||
            plugin.name === "SecureBookmarks" ||
            plugin.name === "StatusCycler" ||
            plugin.name === "MutualScanner"
        );

        if ((search.includes("illegalcord") || search.includes("illegal")) && isIllegalcordPartner) {
            return true;
        }

        return (
            plugin.name.toLowerCase().includes(search.replace(/\s+/g, "")) ||
            plugin.description.toLowerCase().includes(search) ||
            plugin.tags?.some(t => t.toLowerCase().includes(search))
        );
    }, [searchValue, search, ratings]);

    const [newPluginsSet] = useAwaiter(() => DataStore.get("Vencord_existingPlugins").then((cachedPlugins: Record<string, number> | undefined) => {
        const now = Date.now() / 1000;
        const existingTimestamps: Record<string, number> = {};
        const sortedPluginNames = Object.values(sortedPlugins).map(plugin => plugin.name);

        const newPlugins: string[] = [];
        for (const { name: p } of sortedPlugins) {
            const time = existingTimestamps[p] = cachedPlugins?.[p] ?? now;
            if ((time + 60 * 60 * 24 * 2) > now) {
                newPlugins.push(p);
            }
        }
        DataStore.set("Vencord_existingPlugins", existingTimestamps);

        return lodash.isEqual(newPlugins, sortedPluginNames) ? null : new Set(newPlugins);
    }));

    const handleRestartNeeded = useCallback((name: string, key: string) => changes.handleChange(`${name}:${key}`), [changes]);

    // Only filter/categorize plugin DATA here — no JSX created yet
        const { midnightcordData, othersData, requiredData } = useMemo(() => {
        const midnightcordData: typeof sortedPlugins = [];
        const othersData: typeof sortedPlugins = [];
        const requiredData: typeof sortedPlugins = [];

        const showApi = searchValue.status === SearchStatus.API_PLUGINS;
        for (const p of sortedPlugins) {
            if (p.hidden || (!p.settings?.def && p.name.endsWith("API") && !showApi))
                continue;

            if (!pluginFilter(p, newPluginsSet)) continue;

            const isRequired = p.required || p.isDependency || depMap[p.name]?.some(d => isPluginEnabled(d));

            if (isRequired) {
                requiredData.push(p);
            } else {
                const folderName = PluginMeta[p.name]?.folderName ?? "";
                if (folderName.startsWith("src/midnightcordplugins/")) {
                    midnightcordData.push(p);
                } else {
                    othersData.push(p);
                }
            }
        }
        // Toujours trier par nombre de likes décroissant, mais forcer AutoCallRecorder en premier
        const byLikes = (a: typeof sortedPlugins[number], b: typeof sortedPlugins[number]) => {
            if (a.name === "AutoCallRecorder") return -1;
            if (b.name === "AutoCallRecorder") return 1;
            return (ratings[b.name]?.likes ?? 0) - (ratings[a.name]?.likes ?? 0);
        };
        midnightcordData.sort(byLikes);
        othersData.sort(byLikes);

        return { midnightcordData, othersData, requiredData };
    }, [sortedPlugins, searchValue, newPluginsSet, depMap, pluginFilter, ratings]);

    const allDataLength = midnightcordData.length + othersData.length;
    const hasMore = visibleCount < allDataLength;

    // Store allDataLength in a ref so the observer callback always sees the latest value
    // without needing it as a dependency (which would cause reconnect loops).
    const allDataLengthRef = React.useRef(allDataLength);
    allDataLengthRef.current = allDataLength;

    // Sentinel ref and observer are now defined using a callback ref above.

    function resetCheckAndDo() {
        let restartNeeded = false;

        for (const plugin of enabledPlugins) {
            const pluginSettings = settings.plugins[plugin];

            if (Plugins[plugin].patches?.length) {
                pluginSettings.enabled = false;
                changes.handleChange(plugin);
                restartNeeded = true;
                continue;
            }

            const result = stopPlugin(Plugins[plugin]);

            if (!result) {
                logger.error(`Error while stopping plugin ${plugin}`);
                showErrorToast(`Error while stopping plugin ${plugin}`);
                continue;
            }

            pluginSettings.enabled = false;
        }

        if (restartNeeded) {
            Alerts.show({
                title: "Restart Required",
                body: (
                    <>
                        <p style={{ textAlign: "center" }}>Some plugins require a restart to fully disable.</p>
                        <p style={{ textAlign: "center" }}>Would you like to restart now?</p>
                    </>
                ),
                confirmText: "Restart Now",
                cancelText: "Later",
                onConfirm: () => relaunch()
            });
        }
    }

    function applyDefaultConfigCheckAndDo() {
        try {
            let restartNeeded = false;
            let modifiedCount = 0;

            for (const pluginName in Plugins) {
                const plugin = Plugins[pluginName];

                // Les plugins APIs ne peuvent pas être configurés directement
                if (pluginName.endsWith("API")) continue;

                const shouldBeEnabled = Boolean(plugin.required) || Boolean(plugin.enabledByDefault);
                const currentlyEnabled = isPluginEnabled(pluginName);

                if (currentlyEnabled !== shouldBeEnabled) {
                    const pluginSettings = settings.plugins[pluginName];

                    if (plugin.patches?.length) {
                        pluginSettings.enabled = shouldBeEnabled;
                        changes.handleChange(pluginName);
                        restartNeeded = true;
                        modifiedCount++;
                        continue;
                    }

                    if (shouldBeEnabled) {
                        const result = startPlugin(plugin);
                        if (!result) {
                            logger.error(`Error while starting plugin ${pluginName}`);
                            showErrorToast(`Error while starting plugin ${pluginName}`);
                        } else {
                            pluginSettings.enabled = true;
                            modifiedCount++;
                        }
                    } else {
                        const result = stopPlugin(plugin);
                        if (!result) {
                            logger.error(`Error while stopping plugin ${pluginName}`);
                            showErrorToast(`Error while stopping plugin ${pluginName}`);
                        } else {
                            pluginSettings.enabled = false;
                            modifiedCount++;
                        }
                    }
                }
            }

            if (restartNeeded) {
                Alerts.show({
                    title: "Restart Required",
                    body: (
                        <>
                            <p style={{ textAlign: "center" }}>Some plugins require a restart to apply their default configuration.</p>
                            <p style={{ textAlign: "center" }}>Would you like to restart now?</p>
                        </>
                    ),
                    confirmText: "Restart Now",
                    cancelText: "Later",
                    onConfirm: () => relaunch()
                });
            } else {
                Toasts.show({
                    message: `Default config applied. ${modifiedCount} plugin(s) modified.`,
                    type: Toasts.Type.SUCCESS,
                    id: Toasts.genId(),
                    options: { position: Toasts.Position.BOTTOM }
                });
            }
        } catch (err: any) {
            Toasts.show({
                message: `Failed: ${err?.message ?? err}`,
                type: Toasts.Type.FAILURE,
                id: Toasts.genId(),
                options: { position: Toasts.Position.BOTTOM }
            });
            logger.error("Apply Default Config crashed:", err);
        }
    }

    // Code directly taken from supportHelper.tsx
    const { totalStockPlugins, totalUserPlugins, enabledStockPlugins, enabledUserPlugins, enabledPlugins } = useMemo(() => {
        const isApiPlugin = (plugin: string) => plugin.endsWith("API") || Plugins[plugin].required;

        const totalPlugins = Object.keys(Plugins).filter(p => !isApiPlugin(p));
        const enabledPlugins = Object.keys(Plugins).filter(p => isPluginEnabled(p) && !isApiPlugin(p));

        const totalStockPlugins = totalPlugins.filter(p => !PluginMeta[p].userPlugin && !Plugins[p].hidden).length;
        const totalUserPlugins = totalPlugins.filter(p => PluginMeta[p].userPlugin).length;
        const enabledStockPlugins = enabledPlugins.filter(p => !PluginMeta[p].userPlugin).length;
        const enabledUserPlugins = enabledPlugins.filter(p => PluginMeta[p].userPlugin).length;
        return { totalStockPlugins, totalUserPlugins, enabledStockPlugins, enabledUserPlugins, enabledPlugins };
    }, [settings.plugins]);

    // Slice DATA first, then create JSX only for visible items
    const midnightcordVisibleData = midnightcordData.slice(0, Math.min(visibleCount, midnightcordData.length));
    const othersVisibleData = othersData.slice(0, Math.max(0, visibleCount - midnightcordData.length));

    const makeCard = (p: typeof sortedPlugins[number]) => (
        <ErrorBoundary fallback={<div style={{ color: "red", padding: 8 }}>Failed to render {p.name}.</div>} key={p.name}>
            <PluginCard
                onRestartNeeded={handleRestartNeeded}
                disabled={false}
                plugin={p}
                isNew={newPluginsSet?.has(p.name)}
                hasTutorial={tutorialPlugins.has(p.name)}
            />
        </ErrorBoundary>
    );

    const makeRequiredCard = (p: typeof sortedPlugins[number]) => {
        const tooltipText = p.required || !depMap[p.name]
            ? "This plugin is required for Midnightcord to function."
            : <PluginDependencyList deps={depMap[p.name]?.filter(d => isPluginEnabled(d))} />;
        return (
            <ErrorBoundary fallback={<div style={{ color: "red", padding: 8 }}>Failed to render {p.name}.</div>} key={p.name}>
                <Tooltip text={tooltipText}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={handleRestartNeeded}
                            disabled={true}
                            plugin={p}
                            hasTutorial={tutorialPlugins.has(p.name)}
                        />
                    )}
                </Tooltip>
            </ErrorBoundary>
        );
    };

    const midnightcordPlugins = midnightcordVisibleData.map(makeCard);
    const othersVisible = othersVisibleData.map(makeCard);
    const requiredPlugins = requiredData.map(makeRequiredCard);

    const totalMidnightcordPlugins = React.useMemo(() => {
        return Object.values(Plugins).filter(p => PluginMeta[p.name]?.folderName?.startsWith("src/midnightcordplugins/")).length;
    }, []);

    const totalOtherPlugins = React.useMemo(() => {
        const isMidnightcordPlugin = (p: string) => PluginMeta[p]?.folderName?.startsWith("src/midnightcordplugins/");
        const isCorePlugin = (p: string) => PluginMeta[p]?.folderName?.startsWith("src/plugins/_");
        return Object.values(Plugins).filter(p => !isMidnightcordPlugin(p.name) && !isCorePlugin(p.name)).length;
    }, []);

    // Category-aware stats for the "ENABLED PLUGINS" card: reflects whichever tab
    // (MIDNIGHTCORD / OTHERS / all) is currently selected, instead of always being global.
    const categoryStats = useMemo(() => {
        const isApiPlugin = (plugin: string) => plugin.endsWith("API") || Plugins[plugin].required;
        const isMidnightcordPlugin = (p: string) => PluginMeta[p]?.folderName?.startsWith("src/midnightcordplugins/");
        const isUserPlugin = (p: string) => PluginMeta[p]?.userPlugin === true;

        let plugins = Object.keys(Plugins).filter(p => !isApiPlugin(p) && !Plugins[p].hidden);

        if (searchValue.status === SearchStatus.MIDNIGHTCORD) {
            plugins = plugins.filter(isMidnightcordPlugin);
        } else if (searchValue.status === SearchStatus.OTHERS) {
            plugins = plugins.filter(p => !isMidnightcordPlugin(p));
        } else if (searchValue.status === SearchStatus.USER_PLUGINS) {
            plugins = plugins.filter(isUserPlugin);
        } else if (searchValue.status === SearchStatus.LIKED_PLUGINS) {
            plugins = plugins.filter(p => isMidnightcordPlugin(p) && ratings[p]?.likedByMe);
        }

        const total = plugins.length;
        const enabled = plugins.filter(p => isPluginEnabled(p)).length;
        return { total, enabled };
    }, [settings.plugins, searchValue.status, ratings]);

    const percent = categoryStats.total > 0 ? Math.round((categoryStats.enabled / categoryStats.total) * 100) : 0;
    const strokeDashoffset = 62.83 - (62.83 * percent / 100);

    return (
        <SettingsTab>
            <div className="vc-plugins-full-width-container">
                {!premiumOnly && (
                    <div className={cl("ecosystem-banner")}>
                        <div className={cl("ecosystem-banner-text")}>
                            <HeadingTertiary>{t("Plugin Ecosystem Management")}</HeadingTertiary>
                            <Paragraph>{t("Manage your Midnightcord and community plugins here. Enable, disable, and configure them to your liking.")}</Paragraph>
                        </div>
                        <div className={cl("ecosystem-banner-buttons")}>
                            {!isLikeLoggedIn && (
                                <Button
                                    variant="primary"
                                    size="small"
                                    disabled={likeLoginLoading}
                                    onClick={handleLikeLogin}
                                >
                                    {t("Log in to like")}
                                </Button>
                            )}
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => openWarningModal(null, undefined, false, enabledPlugins.length, resetCheckAndDo)}
                            >
                                {t("DISABLE ALL PLUGINS")}
                            </Button>
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => openResetDefaultsModal(applyDefaultConfigCheckAndDo)}
                            >
                                {t("APPLY DEFAULT CONFIG")}
                            </Button>
                        </div>
                    </div>
                )}

                {!premiumOnly && (
                    <div className={cl("stats-banner")}>
                        <div className={cl("stat-item")}>
                            <div className={cl("stat-title")}>{t("TOTAL PLUGINS")}</div>
                            <div className={cl("stat-value")}>{totalStockPlugins + totalUserPlugins}</div>
                        </div>
                        <div className={cl("stat-item")}>
                            <div className={cl("stat-title")}>{t("ENABLED PLUGINS")}</div>
                            <div className={cl("stat-value")}>
                                {categoryStats.enabled} <span className={cl("stat-percent")}>({percent}%)</span>
                                <div className={cl("stat-chart")}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
                                        <circle cx="12" cy="12" r="10" fill="transparent" stroke="var(--background-modifier-active)" strokeWidth="4" />
                                        <circle cx="12" cy="12" r="10" fill="transparent" stroke="var(--text-link)" strokeWidth="4" strokeDasharray="62.83" strokeDashoffset={strokeDashoffset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div 
                            className={cl("stat-item")} 
                            style={searchValue.status === SearchStatus.USER_PLUGINS ? { cursor: "pointer", transition: "0.2s" } : {}}
                            onClick={() => {
                                if (searchValue.status !== SearchStatus.USER_PLUGINS) return;
                                const native = (window as any).DiscordNative || (window as any).VesktopNative;
                                if (native?.process?.env) {
                                    const home = native.process.env.USERPROFILE || native.process.env.HOME;
                                    if (home) {
                                        const isWindows = !!native.process.env.USERPROFILE;
                                        const folderPath = isWindows ? `${home}\\Documents\\Midnightcord\\userplugins` : `${home}/Documents/Midnightcord/userplugins`;
                                        // Open the directory itself (will open its parent and highlight it)
                                        showItemInFolder(folderPath);
                                    }
                                }
                            }}
                            title={searchValue.status === SearchStatus.USER_PLUGINS ? "Click to open folder" : ""}
                        >
                            <div className={cl("stat-title")}>
                                {searchValue.status === SearchStatus.USER_PLUGINS ? t("USER PLUGINS") : 
                                 searchValue.status === SearchStatus.OTHERS ? t("VENCORD & EQUICORD PLUGINS") : 
                                 searchValue.status === SearchStatus.LIKED_PLUGINS ? t("LIKED PLUGINS") :
                                 t("MIDNIGHTCORD PLUGINS")}
                            </div>
                            <div className={cl("stat-value")}>
                                {searchValue.status === SearchStatus.USER_PLUGINS ? totalUserPlugins : 
                                 searchValue.status === SearchStatus.OTHERS ? totalOtherPlugins : 
                                 searchValue.status === SearchStatus.LIKED_PLUGINS ? categoryStats.total :
                                 totalMidnightcordPlugins}
                            </div>
                        </div>
                    </div>
                )}

                <div className={classes(Margins.bottom20, cl("filter-controls"))}>
                    <ErrorBoundary noop>
                        <TextInput autoFocus value={searchInput} placeholder={t("Find a plugin, tag, or author...")} onChange={onSearch} />
                    </ErrorBoundary>
                    <div className={cl("filter-buttons")} style={{ minWidth: 220 }}>
                        <SafeSearchableSelect
                            options={makeCategoryOptions(totalOtherPlugins)}
                            value={makeCategoryOptions(totalOtherPlugins).find(o => o.value === searchValue.status)?.value ?? SearchStatus.MIDNIGHTCORD}
                            onChange={(v: any) => {
                                if (v === "community") return;
                                onStatusChange(v);
                            }}
                            closeOnSelect={true}
                            renderOptionPrefix={(o: any) => {
                                if (o?.value === SearchStatus.MIDNIGHTCORD) return <MidnightcordTabIcon />;
                                if (o?.value === SearchStatus.OTHERS) return <VencordEquicordTabIcon />;
                                if (o?.value === SearchStatus.USER_PLUGINS) return <UserPluginsTabIcon />;
                                if (o?.value === SearchStatus.LIKED_PLUGINS) return <LikedPluginsTabIcon />;
                                return null;
                            }}
                        />
                    </div>
                </div>

            {premiumOnly ? (
                <>
                    <HeadingTertiary className={Margins.top20}>Premium Plugins</HeadingTertiary>
                    {midnightcordData.length || othersData.length
                        ? (
                            <div className={cl("grid")}>
                                {[...midnightcordPlugins, ...othersVisible].length
                                    ? [...midnightcordPlugins, ...othersVisible]
                                    : <Paragraph>{t("No plugins meet the search criteria.")}</Paragraph>
                                }
                            </div>
                        )
                        : <ExcludedPluginsList search={search} />
                    }
                </>
            ) : (
                <>
                    {midnightcordData.length > 0 && searchValue.status === SearchStatus.MIDNIGHTCORD && (
                        <div className={cl("grid")}>
                            {midnightcordPlugins}
                        </div>
                    )}
                    


                    {othersData.length > 0 && searchValue.status === SearchStatus.OTHERS && (
                        <div className={cl("grid")}>
                            {othersVisible}
                        </div>
                    )}

                    {searchValue.status === SearchStatus.USER_PLUGINS && (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "8px 0" }}>
                                <UserPluginsTabIcon />
                                <span style={{ color: "var(--header-primary)", fontWeight: 600, fontSize: 14 }}>
                                    {t("User Plugins — from your local folder")}
                                </span>
                            </div>
                            <div style={{
                                background: "rgba(88, 101, 242, 0.08)",
                                border: "1px solid rgba(88, 101, 242, 0.25)",
                                borderRadius: 8,
                                padding: "10px 14px",
                                marginBottom: 16,
                                fontSize: 13,
                                color: "var(--text-normal)",
                                display: "flex",
                                alignItems: "center",
                                gap: 10
                            }}>
                                <span style={{ fontSize: 18 }}>ℹ️</span>
                                <div>
                                    {t("Note: User plugins require installing the client via a local build, not from the website installer.")}
                                </div>
                            </div>
                            {midnightcordPlugins.length > 0 || othersVisible.length > 0 ? (
                                <div className={cl("grid")}>
                                    {[...midnightcordPlugins, ...othersVisible]}
                                </div>
                            ) : (
                                <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)" }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
                                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{t("No user plugins found")}</div>
                                    <div style={{ fontSize: 13 }}>{t("Add .tsx files to your")} <code>Documents/Midnightcord/userplugins/</code> {t("folder and rebuild with a local build.")}</div>
                                </div>
                            )}
                        </>
                    )}

                    {(searchValue.status !== SearchStatus.MIDNIGHTCORD && searchValue.status !== SearchStatus.OTHERS && searchValue.status !== SearchStatus.USER_PLUGINS) && (
                        <div className={cl("grid")}>
                            {midnightcordPlugins}
                            {othersVisible}
                        </div>
                    )}

                    {midnightcordData.length === 0 && othersData.length === 0 && searchValue.status === SearchStatus.LIKED_PLUGINS && (
                        <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)" }}>
                            <div style={{ fontSize: 32, marginBottom: 12 }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto" }}>
                                    <path fill="currentColor" fillRule="evenodd" d="M12 8.07 10.6 6.7A5 5 0 0 0 6.75 5 3.75 3.75 0 0 0 3 8.75c0 2.32 1.59 4.76 3.87 6.96A31.87 31.87 0 0 0 12 19.67c1.2-.74 3.26-2.14 5.13-3.96 2.28-2.2 3.87-4.64 3.87-6.96A3.75 3.75 0 0 0 17.25 5a5 5 0 0 0-3.85 1.69L12 8.07Zm0-2.8A6.98 6.98 0 0 0 6.75 3 5.75 5.75 0 0 0 1 8.75c0 6.34 8.42 11.73 10.53 12.98.29.17.65.17.94 0C14.57 20.48 23 15.09 23 8.75A5.75 5.75 0 0 0 17.25 3c-2.34 0-3.88.9-5.25 2.26Z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{t("No liked plugins yet")}</div>
                            <div style={{ fontSize: 13 }}>{t("Like a Midnightcord plugin from its card to see it here.")}</div>
                        </div>
                    )}

                    {midnightcordData.length === 0 && othersData.length === 0 && searchValue.status !== SearchStatus.USER_PLUGINS && searchValue.status !== SearchStatus.LIKED_PLUGINS && (
                        <ExcludedPluginsList search={search} />
                    )}

                    {/* Sentinel: only rendered when there are more items to load */}
                    {hasMore && (
                        <div
                            ref={sentinelRef}
                            style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}
                        >
                            {t("Loading more plugins…")}
                        </div>
                    )}
                </>
            )}

            {!premiumOnly && requiredPlugins.length > 0 && (
                <>
                    <Divider className={Margins.top20} />

                    <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                        {t("Required Plugins")}
                    </HeadingTertiary>
                    <div className={cl("grid")}>
                        {requiredPlugins.length
                            ? requiredPlugins
                            : <Paragraph>{t("No plugins meet the search criteria.")}</Paragraph>
                        }
                    </div>
                </>
            )}
            </div>
        </SettingsTab>
    );
}

export function PluginDependencyList({ deps }: { deps: string[]; }) {
    return (
        <>
            <Paragraph>{t("This plugin is required by:")}</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}
