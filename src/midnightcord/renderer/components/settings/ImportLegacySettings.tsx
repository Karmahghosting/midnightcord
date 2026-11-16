/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@Midnightcord/types/components";
import { React, useRef,useState } from "@webpack/common";

function detectSource(json: any): "equicord" | "vencord" | "midnightcord" | "unknown" {
    // Heuristiques basées sur les clés présentes dans le JSON
    if (!json || typeof json !== "object") return "unknown";

    const { settings } = json;
    if (!settings) return "unknown";

    const plugins = settings.plugins || {};
    const pluginNames = Object.keys(plugins);

    // Plugins spécifiques à Equicord
    if (pluginNames.some(p => ["EquicordHelper", "EquicordCSS"].includes(p))) return "equicord";
    // Plugins spécifiques à Midnightcord
    if (pluginNames.some(p => ["MidnightcordHelper", "equicordHelper"].includes(p))) return "midnightcord";
    // Fallback : si le fichier contient des clés Vencord communes
    if (pluginNames.length > 0) return "vencord";

    return "unknown";
}

function cleanForMidnightcord(json: any): any {
    if (!json || typeof json !== "object") return json;

    const cleaned = JSON.parse(JSON.stringify(json));
    const { settings } = cleaned;

    if (!settings?.plugins) return cleaned;

    // Supprimer les plugins propres à Equicord/Vencord qui n'existent pas dans Midnightcord
    const legacyOnlyPlugins = ["EquicordHelper", "EquicordCSS", "VencordHelper"];
    for (const name of legacyOnlyPlugins) {
        delete settings.plugins[name];
    }

    return cleaned;
}

export function ImportLegacySettingsButton({ settings }: { settings: any; }) {
    const [dragging, setDragging] = useState(false);
    const [status, setStatus] = useState<null | "success" | "error" | "loading">(null);
    const [message, setMessage] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    async function processFile(file: File) {
        setStatus("loading");
        setMessage("Reading file…");

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const source = detectSource(json);

            const sourceLabel =
                source === "equicord" ? "Equicord" :
                source === "vencord" ? "Vencord" :
                source === "midnightcord" ? "Midnightcord" : "unknown";

            const cleaned = cleanForMidnightcord(json);

            // Envoie au main process via IPC pour écrire les settings
            await VencordNative.settings.set(cleaned.settings ?? {});

            if (cleaned.quickCss) {
                await VencordNative.quickCss.set(cleaned.quickCss);
            }

            setStatus("success");
            setMessage(`✅ ${sourceLabel} settings imported successfully. Restart Midnightcord to apply them.`);
        } catch (err: any) {
            setStatus("error");
            setMessage(`❌ Error: ${err?.message ?? String(err)}`);
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }

    function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }

    return (
        <div>
            <BaseText size="sm" style={{ marginBottom: "12px", opacity: 0.7 }}>
                Drag & drop your Equicord or Vencord backup JSON file here to import your settings into Midnightcord.
                Plugin-specific settings that don't exist in Midnightcord will be automatically removed.
            </BaseText>

            <div
                role="button"
                tabIndex={0}
                aria-label="Choose a settings backup file to import"
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        inputRef.current?.click();
                    }
                }}
                style={{
                    border: `2px dashed ${dragging ? "var(--brand-experiment, #5865f2)" : "var(--background-modifier-accent)"}`,
                    borderRadius: "8px",
                    padding: "28px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: dragging ? "var(--background-modifier-selected)" : "var(--background-modifier-hover)",
                    transition: "all 0.15s ease",
                    marginBottom: "12px"
                }}
            >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>📂</div>
                <BaseText size="sm" style={{ opacity: 0.6 }}>
                    {dragging
                        ? "Drop the file to import…"
                        : "Drag & drop your JSON file here, or click to browse"}
                </BaseText>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={handleFileInput}
                />
            </div>

            {status && (
                <BaseText
                    size="sm"
                    style={{
                        padding: "10px 14px",
                        borderRadius: "6px",
                        background: status === "success" ? "var(--background-feedback-positive)" :
                            status === "error" ? "var(--background-feedback-critical)" :
                                "var(--background-feedback-info)",
                        color: status === "success" ? "var(--text-feedback-positive)" :
                            status === "error" ? "var(--text-feedback-critical)" : "var(--text-feedback-info)",
                        marginTop: "4px"
                    }}
                >
                    {message}
                </BaseText>
            )}
        </div>
    );
}
