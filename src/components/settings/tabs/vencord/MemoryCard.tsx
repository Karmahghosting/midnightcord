/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { React } from "@webpack/common";

const cl = classNameFactory("vc-vencord-tab-");

interface MemoryProcess {
    pid: number;
    type: string;
    name?: string;
    workingSetSize: number;
}

interface MemoryInfo {
    system: {
        total: number;
        free: number;
        swapTotal: number;
        swapFree: number;
    };
    processes: MemoryProcess[];
}

function format(kb: number) {
    return `${Math.round(kb / 1024)} Mo`;
}

export function MemoryCard() {
    const [info, setInfo] = React.useState<MemoryInfo | null>(null);
    const [busy, setBusy] = React.useState(false);
    const bridge = typeof VesktopNative !== "undefined" ? VesktopNative.memory : undefined;

    const refresh = React.useCallback(async () => {
        if (!bridge) return;
        try {
            const next = await bridge.info() as MemoryInfo;
            if (next?.system) setInfo(next);
        } catch { }
    }, [bridge]);

    React.useEffect(() => {
        void refresh();
        const timer = setInterval(refresh, 3000);
        return () => clearInterval(timer);
    }, [refresh]);

    async function freeMemory() {
        setBusy(true);
        try {
            if (bridge) {
                const next = await bridge.free() as MemoryInfo;
                if (next?.system) setInfo(next);
            } else {
                (globalThis as any).gc?.();
            }
        } catch { }
        setBusy(false);
    }

    const total = info ? info.system.total - info.system.free : 0;
    const midnightcord = info ? info.processes.reduce((sum, process) => sum + process.workingSetSize, 0) : 0;
    const swap = info ? info.system.swapTotal - info.system.swapFree : 0;
    const top = info
        ? [...info.processes].sort((a, b) => b.workingSetSize - a.workingSetSize).slice(0, 4)
        : [];

    if (!bridge) {
        const heap = (performance as any).memory;
        return (
            <div className={cl("memory")}>
                <div className={cl("memory-grid")}>
                    <div className={cl("memory-stat")}>
                        <span className={cl("memory-label")}>{t("JS heap")}</span>
                        <strong>{heap ? format(heap.usedJSHeapSize / 1024) : "—"}</strong>
                        <span className={cl("memory-sub")}>{t("Renderer only")}</span>
                    </div>
                </div>
                <span className={cl("memory-sub")}>
                    {t("Detailed system metrics are only available in the standalone Midnightcord app.")}
                </span>
                <div className={cl("memory-actions")}>
                    <Button size="small" onClick={freeMemory} disabled={busy}>
                        {busy ? t("Freeing…") : t("Free memory")}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={cl("memory")}>
            <div className={cl("memory-grid")}>
                <div className={cl("memory-stat")}>
                    <span className={cl("memory-label")}>{t("System")}</span>
                    <strong>{info ? format(total) : "…"}</strong>
                    <span className={cl("memory-sub")}>{t("Used")}</span>
                </div>
                <div className={cl("memory-stat")}>
                    <span className={cl("memory-label")}>{t("Midnightcord")}</span>
                    <strong>{info ? format(midnightcord) : "…"}</strong>
                    <span className={cl("memory-sub")}>{t("Resident memory")}</span>
                </div>
                <div className={cl("memory-stat")}>
                    <span className={cl("memory-label")}>{t("Swap")}</span>
                    <strong>{info ? format(swap) : "…"}</strong>
                    <span className={cl("memory-sub")}>{t("Used")}</span>
                </div>
            </div>

            {top.length > 0 && (
                <>
                    <span className={cl("memory-label")}>{t("Top processes")}</span>
                    <div className={cl("memory-processes")}>
                        {top.map(process => (
                            <div key={process.pid} className={cl("memory-process")}>
                                <span>{process.name ?? process.type}</span>
                                <span className={cl("memory-sub")}>{format(process.workingSetSize)}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className={cl("memory-actions")}>
                <Button size="small" onClick={freeMemory} disabled={busy}>
                    {busy ? t("Freeing…") : t("Free memory")}
                </Button>
                <span className={cl("memory-sub")}>{t("Runs garbage collection and clears the HTTP cache.")}</span>
            </div>
        </div>
    );
}
