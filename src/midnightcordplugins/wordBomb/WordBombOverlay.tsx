/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "../autoTranslateMidnightcord";
import { React, useState, useEffect, useRef, ReactDOM, createRoot } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { tPlugin as t } from "@api/pluginI18n";
import { getGroqKey } from "../midnightcordAI/groqManager";

const ComponentDispatch = findByPropsLazy("dispatchToLastSubscribed");

const DICT_URLS = [
    "https://raw.githubusercontent.com/words/an-array-of-french-words/master/index.json",
    "https://raw.githubusercontent.com/nightcordoff/dicofr/refs/heads/main/dico.txt"
];

const FALLBACK_WORDS = ["maison", "chat", "chien", "soleil", "pomme", "banane", "ordinateur", "clavier", "souris", "ecran", "table", "chaise", "fenetre", "porte", "voiture", "avion", "bateau", "train", "velo", "moto"];

let overlayRoot: any = null;
let overlayContainer: HTMLDivElement | null = null;

const memStorage: Record<string, string> = {};
function getSetting(key: string, def: string) {
    try { if (window.localStorage && window.localStorage.getItem(key) !== null) return window.localStorage.getItem(key)!; } catch {}
    return memStorage[key] !== undefined ? memStorage[key] : def;
}
function setSetting(key: string, val: string) {
    memStorage[key] = val;
    try { if (window.localStorage) window.localStorage.setItem(key, val); } catch {}
}

export async function toggleWordBombOverlay() {
    if (overlayContainer) {
        unmountOverlay();
    } else {
        mountOverlay();
    }
}

function mountOverlay() {
    if (document.getElementById("nc-wb-root")) return;
    overlayContainer = document.createElement("div");
    overlayContainer.id = "nc-wb-root";
    document.body.appendChild(overlayContainer);

    try {
        if (createRoot) {
            overlayRoot = createRoot(overlayContainer);
            overlayRoot.render(<WordBombOverlay />);
        } else if (ReactDOM?.render) {
            ReactDOM.render(<WordBombOverlay />, overlayContainer);
        } else {
            console.error("[WordBomb] Aucun renderer React disponible");
        }
    } catch (e) {
        console.error("[WordBomb] Erreur de montage:", e);
    }
}

function unmountOverlay() {
    try { overlayRoot?.unmount(); } catch {}
    overlayContainer?.remove();
    overlayContainer = null;
    overlayRoot = null;
}

export function WordBombOverlay() {
    const [alphabet, setAlphabet] = useState<string[]>("abcdefghijklmnopqrstuvwxyz".split(""));
    const [dictionary, setDictionary] = useState<string[]>(FALLBACK_WORDS);
    const [syllable, setSyllable] = useState("");
    const [status, setStatus] = useState(t("Ready!"));
    const [history, setHistory] = useState<{ alphabet: string[], word: string; }[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const isTypingRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [badWords, setBadWords] = useState<Set<string>>(new Set());
    const [definition, setDefinition] = useState("");
    const [pos, setPos] = useState({ x: 100, y: 100 });
    const dragOffset = useRef({ x: 0, y: 0 });
    const inputRef = useRef<HTMLInputElement>(null);

    const [lps, setLps] = useState(() => parseFloat(getSetting("wb_lps", "50")));
    const [humanChance, setHumanChance] = useState(() => parseInt(getSetting("wb_humanChance", "0")));
    const [safeMode, setSafeMode] = useState(() => getSetting("wb_safeMode", "true") === "true");
    const [theme, setTheme] = useState(() => getSetting("wb_theme", ""));
    const [themeWords, setThemeWords] = useState<Set<string>>(new Set());
    const [playMode, setPlayMode] = useState(() => getSetting("wb_playMode", "Normal"));
    const [noSpace, setNoSpace] = useState(() => getSetting("wb_noSpace", "false") === "true");

    // Load dictionary
    useEffect(() => {
        setStatus(t("Loading dictionaries..."));
        Promise.all(DICT_URLS.map(url => fetch(url).then(async res => {
            if (!res.ok) return [];
            if (url.endsWith(".json")) return await res.json();
            const text = await res.text();
            return text.split(/[\r\n]+/).map((line: string) => {
                const parts = line.trim().split(/\s+/);
                return parts[0];
            }).filter((w: string) => w.length > 0);
        }).catch(() => [])))
            .then(results => {
                const allWords = results.flat() as string[];
                const uniqueWords = Array.from(new Set(allWords))
                    .filter(w => {
                        if (w.length < 3 || w.length > 15) return false;
                        if (w[0] === w[0].toUpperCase()) return false;
                        if (w === w.toUpperCase() && w.length > 1) return false;
                        return /^[a-zœæéèêëàâäîïôöùûüç]+$/i.test(w);
                    })
                    .map(w => w.toLowerCase());

                const finalSet = Array.from(new Set(uniqueWords));
                if (finalSet.length > 0) {
                    setDictionary(finalSet);
                    setStatus(`Ready! (${finalSet.length} words)`);
                } else {
                    setDictionary(FALLBACK_WORDS);
                    setStatus(t("Dict. unavailable"));
                }
            })
            .catch(() => setStatus(t("Dict. error (fallback active)")));
    }, []);

    // Theme logic
    useEffect(() => {
        if (!theme.trim()) { setThemeWords(new Set()); return; }
        fetch(`https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${theme}&utf8=&format=json&srlimit=1`)
            .then(r => r.json())
            .then(d => {
                if (d.query?.search?.[0]?.pageid) {
                    const pageId = d.query.search[0].pageid;
                    return fetch(`https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=${pageId}&format=json`);
                }
                throw new Error("No page");
            })
            .then(r => r.json())
            .then(d => {
                const pages = d.query?.pages;
                if (pages) {
                    const text = Object.values(pages)[0] as any;
                    if (text?.extract) {
                        const words = text.extract.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñæœ]+/g) || [];
                        setThemeWords(new Set<string>(words.filter((w: string) => w.length > 3)));
                    }
                }
            }).catch(() => setThemeWords(new Set()));
    }, [theme]);

    // Drag logic
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    };

    useEffect(() => {
        let rafId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y }));
        };
        const handleMouseUp = () => { setIsDragging(false); if (rafId) cancelAnimationFrame(rafId); };
        if (isDragging) {
            window.addEventListener("mousemove", handleMouseMove, { passive: true });
            window.addEventListener("mouseup", handleMouseUp);
        }
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [isDragging]);

    const processSearch = (syl: string, isReroll = false) => {
        if (isTypingRef.current) return;
        const query = syl || syllable;
        if (!query || dictionary.length === 0) return;

        const sylLower = query.toLowerCase();
        let matches = dictionary.filter(w => {
            const low = w.toLowerCase();
            if (!low.includes(sylLower)) return false;
            if (badWords.has(low)) return false;
            if (noSpace && (low.includes(" ") || low.includes("-"))) return false;
            if (playMode === "Pro" && low.length < 13) return false;
            if (playMode === "Noob" && low.length > 7) return false;
            return true;
        });

        if (themeWords.size > 0) {
            const themeMatches = matches.filter(w => themeWords.has(w.toLowerCase()));
            if (themeMatches.length > 0) matches = themeMatches;
        }

        if (matches.length === 0) { setStatus(t("No words found")); return; }

        const computeScore = (w: string, currentMissing: string[], index: number) => {
            let score = 0;
            const found = new Set<string>();
            for (const char of w) {
                if (currentMissing.includes(char) && !found.has(char)) { score += 100; found.add(char); }
            }
            score += Math.max(0, 100 - index / 1000);
            if (playMode === "Pro") score += w.length * 5;
            else if (playMode === "Noob") score -= w.length * 10;
            if (themeWords.has(w)) score += 1000;
            return score;
        };

        let targetWord = "";
        let bestScore = -Infinity;
        for (let i = 0; i < matches.length; i++) {
            const s = computeScore(matches[i], alphabet, i);
            if (s > bestScore) { bestScore = s; targetWord = matches[i]; }
        }

        if (!isReroll) setHistory(prev => [...prev, { alphabet: [...alphabet], word: targetWord }]);
        const newAlphabet = alphabet.filter(l => !targetWord.toLowerCase().includes(l));
        setAlphabet(newAlphabet.length === 0 ? "abcdefghijklmnopqrstuvwxyz".split("") : newAlphabet);
        sendWord(targetWord);
        if (!isReroll) setSyllable("");
    };

    const handleReroll = () => {
        if (history.length === 0) return;
        const last = history[history.length - 1];
        setBadWords(prev => new Set(prev).add(last.word.toLowerCase()));
        setAlphabet(last.alphabet);
        setHistory(history.slice(0, -1));
        processSearch(syllable, true);
    };

    const sendWord = async (word: string) => {
        isTypingRef.current = true;
        setIsTyping(true);
        setStatus(`${t("Typing:")} ${word}...`);

        // AI definition in Safe Mode
        if (safeMode) {
            setDefinition(t("Generating AI definition..."));
            const groqKey = await getGroqKey().catch(() => "");
            if (!groqKey) {
                setDefinition(t("Error: Groq API key missing in MidnightcordAI."));
            } else {
                fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        temperature: 0.7,
                        max_tokens: 150,
                        messages: [{ role: "user", content: `Donne une très courte définition (1 phrase simple) pour le mot suivant, en expliquant ce que c'est concrètement, sans donner sa nature grammaticale. Fais-le obligatoirement en français. Mot: "${word}"` }],
                    }),
                })
                    .then(r => r.json())
                    .then(data => setDefinition(data.choices?.[0]?.message?.content?.trim() || "AI could not define this word."))
                    .catch(() => setDefinition(t("Network error (Groq API).")));
            }
        } else {
            setDefinition("");
        }

        const wbNative = (window as any).VencordNative?.wordBomb || (window as any).VencordNative?.worldBomb;

        try {
            if (wbNative?.sequence) {
                await wbNative.sequence(word, lps, humanChance, -1, -1);
            } else {
                // Fallback ComponentDispatch : tape lettre par lettre puis SUBMIT (Entrée)
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                const delay = Math.round(1000 / lps);
                for (const char of word) {
                    ComponentDispatch?.dispatchToLastSubscribed("INSERT_TEXT", { rawText: char, plainText: char });
                    await new Promise(r => setTimeout(r, delay));
                }
                // Entrée pour valider le mot
                await new Promise(r => setTimeout(r, 50));
                ComponentDispatch?.dispatchToLastSubscribed("SUBMIT", {});
            }
            setStatus(t("Ready!"));
        } catch (e) {
            console.error("[WordBomb] Erreur saisie:", e);
            setStatus(t("Input error"));
        } finally {
            isTypingRef.current = false;
            setIsTyping(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    return (
        <div
            className={`nc-wb-overlay${isDragging ? " dragging" : ""}`}
            style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 9999, userSelect: "none" }}
            onClick={e => e.stopPropagation()}
        >
            <div className="nc-wb-header" onMouseDown={handleMouseDown}>
                <h3 style={{ margin: 0, fontSize: "14px" }}>🎯 WordBomb Helper</h3>
                <div className="nc-wb-close" onClick={unmountOverlay}>✕</div>
            </div>

            <div className="nc-wb-content">
                {!isSettingsOpen ? (
                    <>
                        <div className="nc-wb-alphabet">
                            {alphabet.map((l, i) => (
                                <span key={i} className="nc-wb-letter">{l.toUpperCase()}</span>
                            ))}
                        </div>

                        <div className="nc-wb-input-container">
                            <input
                                ref={inputRef}
                                type="text"
                                className="nc-wb-input"
                                placeholder={t("Syllable...")}
                                value={syllable}
                                onChange={e => setSyllable(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && processSearch(syllable)}
                                style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "none", background: "#374151", color: "white", boxSizing: "border-box" }}
                            />
                        </div>

                        <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => processSearch(syllable)} style={{ flex: 1, padding: "10px", background: "#7c3aed", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>{t("FIND")}</button>
                            <button onClick={handleReroll} title={t("Reroll")} style={{ width: "45px", height: "45px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "12px", color: "#fff", cursor: "pointer", fontSize: "18px" }}>
                                🔄
                            </button>
                        </div>

                        {safeMode && definition && (
                            <div style={{ fontSize: "11px", color: "#d1d5db", fontStyle: "italic", background: "#374151", padding: "8px", borderRadius: "8px", maxHeight: "80px", overflowY: "auto" }}>
                                <strong style={{ color: "#60a5fa" }}>{t("Definition:")}</strong> {definition}
                            </div>
                        )}
                    </>
                ) : (
                    <div>
                        <div style={{ marginBottom: "10px" }}>
                            <label>{t("Speed (LPS):")} {lps}</label>
                            <input type="range" min="10" max="100" step="1" value={lps} onChange={e => { setLps(parseFloat(e.target.value)); setSetting("wb_lps", e.target.value); }} style={{ width: "100%" }} />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label>{t("Error (%):")} {humanChance}%</label>
                            <input type="range" min="0" max="100" step="1" value={humanChance} onChange={e => { setHumanChance(parseInt(e.target.value)); setSetting("wb_humanChance", e.target.value); }} style={{ width: "100%" }} />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#f472b6", fontWeight: "bold" }}>{t("Theme (Optional)")}</label>
                            <input type="text" placeholder={t("e.g. sex, love...")} value={theme} onChange={e => { setTheme(e.target.value.toLowerCase().trim()); setSetting("wb_theme", e.target.value.toLowerCase().trim()); }} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "none", background: "#374151", color: "white", marginTop: "5px" }} />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#fbbf24", fontWeight: "bold" }}>{t("Play Style")}</label>
                            <select value={playMode} onChange={e => { setPlayMode(e.target.value); setSetting("wb_playMode", e.target.value); }} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "none", background: "#374151", color: "white", marginTop: "5px", outline: "none" }}>
                                <option value="Normal">{t("Normal")}</option>
                                <option value="Pro">{t("Pro Mod (Long & Complex)")}</option>
                                <option value="Noob">{t("Noob Mod (Short & Simple)")}</option>
                            </select>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid #4b5563", paddingTop: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#ef4444", fontWeight: "bold" }}>{t("🚫 No Spaces or Dashes")}</label>
                            <input type="checkbox" checked={noSpace} onChange={e => { setNoSpace(e.target.checked); setSetting("wb_noSpace", String(e.target.checked)); }} style={{ transform: "scale(1.2)" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid #4b5563", paddingTop: "10px" }}>
                            <label style={{ fontSize: "13px", color: "#60a5fa", fontWeight: "bold" }}>{t("📚 Safe Mode (Def.)")}</label>
                            <input type="checkbox" checked={safeMode} onChange={e => { setSafeMode(e.target.checked); setSetting("wb_safeMode", String(e.target.checked)); }} style={{ transform: "scale(1.2)" }} />
                        </div>
                        <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "4px", marginBottom: "15px" }}>
                            {t("Displays the definition of the word the bot just typed to pretend you know it.")}
                        </div>
                        <button onClick={() => setIsSettingsOpen(false)} style={{ width: "100%", padding: "8px", background: "#4b5563", border: "none", borderRadius: "8px", color: "white", cursor: "pointer" }}>{t("BACK")}</button>
                    </div>
                )}
            </div>

            <div className="nc-wb-footer">
                <div className="nc-wb-settings-btn" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                    {isSettingsOpen ? "✕" : "⚙"}
                </div>
                <div className="nc-wb-status">
                    {status} | LPS: {lps} | Human: {humanChance}%
                </div>
            </div>
        </div>
    );
}
