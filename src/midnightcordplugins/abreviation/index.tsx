/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { DataStore } from "@api/index";
import { addMessagePreSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React, useEffect,useState } from "@webpack/common";

const DS_KEY = "abreviation_entries";

interface AbbrevEntry {
    abbrev: string;
    phrase: string;
}

// ── DataStore helpers ──────────────────────────────────────────────────────────

let cachedEntries: AbbrevEntry[] = [];

async function loadEntries(): Promise<AbbrevEntry[]> {
    const data = await DataStore.get(DS_KEY) as AbbrevEntry[] | undefined;
    cachedEntries = data ?? [];
    return cachedEntries;
}

async function saveEntries(entries: AbbrevEntry[]) {
    cachedEntries = entries;
    await DataStore.set(DS_KEY, entries);
}

// ── UI Component ───────────────────────────────────────────────────────────────

function AbbreviationManager() {
    const [entries, setEntries] = useState<AbbrevEntry[]>([]);
    const [newAbbrev, setNewAbbrev] = useState("");
    const [newPhrase, setNewPhrase] = useState("");

    useEffect(() => {
        loadEntries().then(setEntries);
    }, []);

    async function addEntry() {
        const abbrev = newAbbrev.trim().toLowerCase();
        const phrase = newPhrase.trim();
        if (!abbrev || !phrase) return;
        if (entries.find(e => e.abbrev === abbrev)) return;

        const updated = [...entries, { abbrev, phrase }];
        await saveEntries(updated);
        setEntries(updated);
        setNewAbbrev("");
        setNewPhrase("");
    }

    async function removeEntry(abbrev: string) {
        const updated = entries.filter(e => e.abbrev !== abbrev);
        await saveEntries(updated);
        setEntries(updated);
    }

    const inputStyle: React.CSSProperties = {
        background: "var(--background-secondary)",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: 4,
        color: "#fff",
        padding: "8px 10px",
        fontSize: 14,
        width: "100%",
        outline: "none",
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Add new */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                    <label style={{ color: "#fff", fontSize: 12, fontWeight: 600, marginBottom: 4, display: "block" }}>
                        Abbreviation
                    </label>
                    <input
                        style={inputStyle}
                        placeholder="lol"
                        value={newAbbrev}
                        onChange={e => setNewAbbrev(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addEntry(); }}
                    />
                </div>
                <div style={{ flex: 2 }}>
                    <label style={{ color: "#fff", fontSize: 12, fontWeight: 600, marginBottom: 4, display: "block" }}>
                        Replacement phrase
                    </label>
                    <input
                        style={inputStyle}
                        placeholder="laughing out loud"
                        value={newPhrase}
                        onChange={e => setNewPhrase(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addEntry(); }}
                    />
                </div>
                <button
                    onClick={addEntry}
                    style={{
                        background: "var(--brand-500)",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        padding: "8px 16px",
                        fontSize: 14,
                        cursor: "pointer",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                    }}
                >
                    + Add
                </button>
            </div>

            {/* List */}
            {entries.length === 0 ? null : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {entries.map(e => (
                        <div
                            key={e.abbrev}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                background: "var(--background-secondary)",
                                borderRadius: 4,
                                padding: "6px 10px",
                            }}
                        >
                            <span style={{ color: "#fff", fontWeight: 600, minWidth: 80 }}>
                                {e.abbrev}
                            </span>
                            <span style={{ color: "#b5bac1" }}>→</span>
                            <span style={{ color: "#fff", flex: 1 }}>
                                {e.phrase}
                            </span>
                            <button
                                onClick={() => removeEntry(e.abbrev)}
                                style={{
                                    background: "var(--status-danger)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: "4px 10px",
                                    fontSize: 12,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Settings ───────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    matchMode: {
        type: OptionType.SELECT,
        description: "",
        options: [
            { label: "Whole message only (e.g. 'mdr' alone)", value: "exact" },
            { label: "Every word in the message", value: "word" },
        ],
    },
    caseSensitive: {
        type: OptionType.BOOLEAN,
        description: "Case sensitive matching (if disabled, 'MDR' = 'mdr')",
        default: false,
    },
    abbreviations: {
        type: OptionType.COMPONENT,
        description: "",
        component: AbbreviationManager,
    },
});

// ── Pre-send listener ──────────────────────────────────────────────────────────

function onPreSend(_channelId: string, messageObj: { content: string; }) {
    if (!messageObj.content) return;

    const entries = cachedEntries;
    if (entries.length === 0) return;

    const mode = settings.store.matchMode ?? "word";
    const caseSensitive = settings.store.caseSensitive ?? false;

    if (mode === "exact") {
        // The entire message must match the abbreviation exactly
        const input = caseSensitive ? messageObj.content.trim() : messageObj.content.trim().toLowerCase();
        const match = entries.find(e => {
            const abbrev = caseSensitive ? e.abbrev : e.abbrev.toLowerCase();
            return input === abbrev;
        });
        if (match) {
            messageObj.content = match.phrase;
        }
    } else {
        // Replaces each word individually
        const words = messageObj.content.split(/(\s+)/); // keep whitespace
        const replaced = words.map(w => {
            const test = caseSensitive ? w : w.toLowerCase();
            const match = entries.find(e => {
                const abbrev = caseSensitive ? e.abbrev : e.abbrev.toLowerCase();
                return test === abbrev;
            });
            return match ? match.phrase : w;
        });
        messageObj.content = replaced.join("");
    }
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "Abbreviation",
    enabledByDefault: false,
    description: "Automatically replaces abbreviations with full sentences before sending the message.",
    authors: [{ name: "Midnightcord",
     id: 0n }],

    settings,

    async start() {
        await loadEntries();
        addMessagePreSendListener(onPreSend as any);
    },

    stop() {
        removeMessagePreSendListener(onPreSend as any);
    },
});
