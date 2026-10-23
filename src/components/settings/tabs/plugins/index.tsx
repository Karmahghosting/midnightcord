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
import { t } from "@api/i18n";
import { getStoredToken } from "@api/OAuth2";
import { fetchPluginRatings, PluginRatings } from "@api/PluginLikes";
import { authorizeLikeSystem, LIKE_AUTH_EVENT } from "@api/PluginLikesAuth";
import { isPluginEnabled, startPlugin, stopPlugin } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings";
import { debounce } from "@shared/debounce";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { relaunch, showItemInFolder } from "@utils/native";
import { useAwaiter } from "@utils/react";
import { Alerts, lodash, Parser, React, TextInput, Toasts, Tooltip, useCallback, useMemo, useState } from "@webpack/common";

import Plugins, { ExcludedPlugins, PluginMeta } from "~plugins";

import { PluginCard } from "./PluginCard";
import { openResetDefaultsModal, openWarningModal } from "./PluginModal";
import { TUTORIAL_PLUGIN_NAMES } from "./tutorialList";

const makeCategoryOptions = () => [
    { label: t("All categories"), value: SearchStatus.ALL },
    { label: "Vencord & Equicord", value: SearchStatus.OTHERS },
    { label: "Midnightcord", value: SearchStatus.MIDNIGHTCORD },
    { label: t("User Plugins"), value: SearchStatus.USER_PLUGINS },
    { label: t("Liked Plugins"), value: SearchStatus.LIKED_PLUGINS }
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
    const [stateFilter, setStateFilter] = useState<"all" | "enabled" | "disabled" | "new">("all");
    const [sortOrder, setSortOrder] = useState<"likes" | "name-asc" | "name-desc" | "enabled">("likes");

    // Settings is a stable proxy: depend on the actual switch values, not its identity.
    const enabledSnapshot = sortedPlugins.map(p => isPluginEnabled(p.name) ? "1" : "0").join("");

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

    React.useEffect(() => {
        setVisibleCount(BATCH_SIZE);
    }, [search, searchValue.status, stateFilter, sortOrder]);

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

    React.useEffect(() => () => observer.current?.disconnect(), []);

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

        if (stateFilter === "enabled" && !enabled) return false;
        if (stateFilter === "disabled" && enabled) return false;
        if (stateFilter === "new" && !newPluginsSet?.has(plugin.name)) return false;

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
    }, [searchValue, search, ratings, stateFilter, premiumOnly, enabledSnapshot]);

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
    const { filteredData, requiredData } = useMemo(() => {
        const filteredData: typeof sortedPlugins = [];
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
                filteredData.push(p);
            }
        }
        const compare = (a: typeof sortedPlugins[number], b: typeof sortedPlugins[number]) => {
            const byName = a.name.localeCompare(b.name);
            if (sortOrder === "name-desc") return -byName;
            if (sortOrder === "enabled") return Number(isPluginEnabled(b.name)) - Number(isPluginEnabled(a.name)) || byName;
            if (sortOrder === "likes") return (ratings[b.name]?.likes ?? 0) - (ratings[a.name]?.likes ?? 0) || byName;
            return byName;
        };
        filteredData.sort(compare);
        requiredData.sort(compare);

        return { filteredData, requiredData };
    }, [sortedPlugins, searchValue, newPluginsSet, depMap, pluginFilter, ratings, sortOrder, enabledSnapshot]);

    const allDataLength = filteredData.length;
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

        const totalPlugins = Object.keys(Plugins).filter(p => !isApiPlugin(p) && !Plugins[p].hidden && !Plugins[p].premium);
        const enabledPlugins = totalPlugins.filter(p => isPluginEnabled(p));

        const totalStockPlugins = totalPlugins.filter(p => !PluginMeta[p].userPlugin && !Plugins[p].hidden).length;
        const totalUserPlugins = totalPlugins.filter(p => PluginMeta[p].userPlugin).length;
        const enabledStockPlugins = enabledPlugins.filter(p => !PluginMeta[p].userPlugin).length;
        const enabledUserPlugins = enabledPlugins.filter(p => PluginMeta[p].userPlugin).length;
        return { totalStockPlugins, totalUserPlugins, enabledStockPlugins, enabledUserPlugins, enabledPlugins };
    }, [enabledSnapshot]);

    // Slice DATA first, then create JSX only for visible items
    const visibleData = filteredData.slice(0, visibleCount);

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

    const visiblePlugins = visibleData.map(makeCard);
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

        let plugins = Object.keys(Plugins).filter(p => !isApiPlugin(p) && !Plugins[p].hidden && !!Plugins[p].premium === premiumOnly);

        if (searchValue.status === SearchStatus.MIDNIGHTCORD) {
            plugins = plugins.filter(isMidnightcordPlugin);
        } else if (searchValue.status === SearchStatus.OTHERS) {
            plugins = plugins.filter(p => PluginMeta[p]?.folderName?.startsWith("src/plugins/") && !PluginMeta[p]?.folderName?.startsWith("src/plugins/_"));
        } else if (searchValue.status === SearchStatus.USER_PLUGINS) {
            plugins = plugins.filter(isUserPlugin);
        } else if (searchValue.status === SearchStatus.LIKED_PLUGINS) {
            plugins = plugins.filter(p => isMidnightcordPlugin(p) && ratings[p]?.likedByMe);
        }

        const total = plugins.length;
        const enabled = plugins.filter(p => isPluginEnabled(p)).length;
        return { total, enabled };
    }, [enabledSnapshot, searchValue.status, ratings, premiumOnly]);

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
                                 searchValue.status === SearchStatus.ALL ? t("All installed") : t("MIDNIGHTCORD PLUGINS")}
                            </div>
                            <div className={cl("stat-value")}>
                                {searchValue.status === SearchStatus.USER_PLUGINS ? totalUserPlugins :
                                 searchValue.status === SearchStatus.OTHERS ? totalOtherPlugins :
                                 searchValue.status === SearchStatus.LIKED_PLUGINS ? categoryStats.total :
                                 searchValue.status === SearchStatus.ALL ? categoryStats.total : totalMidnightcordPlugins}
                            </div>
                        </div>
                    </div>
                )}

                <div className={cl("filter-controls")}>
                    <div className={cl("filter-search")}>
                        <span className={cl("filter-label")}>{t("Search")}</span>
                        <ErrorBoundary noop>
                            <TextInput autoFocus value={searchInput} aria-label={t("Find a plugin, tag, or author...")} placeholder={t("Find a plugin, tag, or author...")} onChange={onSearch} />
                        </ErrorBoundary>
                    </div>
                    <label className={cl("filter-field")} htmlFor="vc-plugins-category">
                        <span className={cl("filter-label")}>{t("Category")}</span>
                        <select id="vc-plugins-category" value={searchValue.status} onChange={e => onStatusChange(Number(e.currentTarget.value) as SearchStatus)}>
                            {makeCategoryOptions().map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className={cl("filter-field")} htmlFor="vc-plugins-state">
                        <span className={cl("filter-label")}>{t("Plugin status")}</span>
                        <select id="vc-plugins-state" value={stateFilter} onChange={e => setStateFilter(e.currentTarget.value as typeof stateFilter)}>
                            <option value="all">{t("All installed")}</option>
                            <option value="enabled">{t("Enabled plugins")}</option>
                            <option value="disabled">{t("Disabled plugins")}</option>
                            <option value="new">{t("Recently added")}</option>
                        </select>
                    </label>
                    <label className={cl("filter-field")} htmlFor="vc-plugins-sort">
                        <span className={cl("filter-label")}>{t("Sort by")}</span>
                        <select id="vc-plugins-sort" value={sortOrder} onChange={e => setSortOrder(e.currentTarget.value as typeof sortOrder)}>
                            <option value="likes">{t("Most liked")}</option>
                            <option value="name-asc">{t("Name (A–Z)")}</option>
                            <option value="name-desc">{t("Name (Z–A)")}</option>
                            <option value="enabled">{t("Enabled first")}</option>
                        </select>
                    </label>
                </div>
                <div className={cl("results-count")} role="status" aria-live="polite">
                    {t("Matching plugins")}: {filteredData.length + (premiumOnly ? 0 : requiredData.length)}
                </div>

                {premiumOnly && <HeadingTertiary className={Margins.top20}>Premium Plugins</HeadingTertiary>}
                {searchValue.status === SearchStatus.USER_PLUGINS && (
                    <Paragraph>
                        {t("User Plugins — from your local folder")}. {t("Note: User plugins require installing the client via a local build, not from the website installer.")}
                        {totalUserPlugins === 0 && <> {t("Add .tsx files to your")} <code>Documents/Midnightcord/userplugins/</code> {t("folder and rebuild with a local build.")}</>}
                    </Paragraph>
                )}
                {visiblePlugins.length > 0 && <div className={cl("grid")}>{visiblePlugins}</div>}
                {filteredData.length === 0 && (premiumOnly || requiredData.length === 0) && (
                    <ExcludedPluginsList search={stateFilter === "all" && searchValue.status === SearchStatus.ALL ? search : ""} />
                )}
                {hasMore && (
                    <div ref={sentinelRef} className={cl("load-more")}>
                        {t("Loading more plugins…")}
                    </div>
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
