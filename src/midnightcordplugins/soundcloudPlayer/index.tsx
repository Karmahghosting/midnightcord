/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { Switch } from "@components/Switch";
import { SafeDynamicIsland } from "@midnightcordplugins/DynamicIslande";
import { EquicordDevs } from "@utils/constants";
import { ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { IconComponent, OptionType, PluginNative } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { ApplicationAssetUtils, FluxDispatcher, MediaEngineStore, React, useEffect, useRef, UserStore, useState } from "@webpack/common";

import { getStoredToken } from "../../api/OAuth2";
import { getPublicPluginConfig, saveOwnPluginConfig } from "../../api/PluginSync";
import { t } from "../autoTranslateMidnightcord";

// ─── Native (IPC → main process) ─────────────────────────────────────────────

const Native = VencordNative.pluginHelpers.SoundCordPlayer as PluginNative<typeof import("./native")>;

// ─── SoundCord Icon ──────────────────────────────────────────────────────────

function SoundCloudIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="none" viewBox="0 0 24 24" {...props}>
            <path fill="currentColor" d="M8.65 1.51A2 2 0 0 0 6 3.41v9.88A3.98 3.98 0 0 0 4.5 13C2.57 13 1 14.34 1 16s1.57 3 3.5 3S8 17.66 8 16V5.4l11 3.81v7.08a3.98 3.98 0 0 0-1.5-.29c-1.93 0-3.5 1.34-3.5 3s1.57 3 3.5 3 3.5-1.34 3.5-3V7.03c0-.74-.47-1.4-1.18-1.65L8.65 1.51Z" />
        </svg>
    );
}

const SoundCloudIconComponent: IconComponent = props => <SoundCloudIcon {...props} />;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScTrack {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string;
    streamUrl: string;
    durationMs: number;
    /** true when SoundCloud only allows a 30s preview (label/Go+ restriction) */
    snipped?: boolean;
    /** Source platform of this track */
    source?: "soundcloud" | "deezer" | "spotify";
    /** true when this is a 30s preview (Deezer/Spotify fallback) */
    previewOnly?: boolean;
    /** Original external URL (Spotify/Deezer link) */
    externalUrl?: string;
}

// ─── DataStore keys ───────────────────────────────────────────────────────────

const SC_CLIENT_ID_KEY = "SoundCordPlayer_clientId";
const SC_FAVS_KEY = "SoundCordPlayer_favorites";

let cachedClientId: string | null = null;

async function loadCachedClientId(): Promise<string | null> {
    if (cachedClientId) return cachedClientId;
    try {
        const stored = await DataStore.get<string>(SC_CLIENT_ID_KEY);
        if (stored) cachedClientId = stored;
    } catch { }
    return cachedClientId;
}

async function saveClientId(id: string) {
    cachedClientId = id;
    try { await DataStore.set(SC_CLIENT_ID_KEY, id); } catch { }
}

// ─── Client ID Fetch via native (main process) ────────────────────────────

async function fetchClientId(): Promise<string | null> {
    const cached = await loadCachedClientId();
    if (cached) return cached;

    const FALLBACK = "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";

    try {
        let id = null;
        if (Native?.fetchSoundCloudClientId) {
            id = await Native.fetchSoundCloudClientId();
        }
        if (!id) id = FALLBACK;
        await saveClientId(id);
        return id;
    } catch (e: any) {
        console.error("[SoundCloudPlayer] fetchClientId:", e?.message);
        await saveClientId(FALLBACK);
        return FALLBACK;
    }
}

async function refreshClientId(): Promise<string | null> {
    cachedClientId = null;
    try { await DataStore.del(SC_CLIENT_ID_KEY); } catch { }
    return fetchClientId();
}

// ─── SoundCloud API via native ────────────────────────────────────────────────

function parseTracks(data: any): ScTrack[] {
    if (!data?.collection) return [];
    const tracks: ScTrack[] = [];
    for (const item of data.collection) {
        if (item.kind !== "track") continue;
        const transcodings = item.media?.transcodings ?? [];

        // Only use transcodings that are fully playable (not preview/blocked).
        // SoundCloud marks major-label tracks with access: "preview" which only
        // streams a 30-second snipped clip and whose URL resolves to an error.
        const playable = transcodings.filter((tc: any) =>
            tc.url && (!tc.access || tc.access === "playable")
        );

        // If nothing playable, mark as snipped but still include the track in results
        // so the user can see it (greyed out) rather than it silently disappearing.
        const snipped = playable.length === 0;
        const pool = snipped ? transcodings : playable;

        let streamUrl = "";

        // Priority 1: progressive (direct MP3)
        for (const tc of pool) {
            if (tc.format?.protocol === "progressive" && tc.url) {
                streamUrl = tc.url;
                break;
            }
        }

        // Priority 2: HLS (m3u8)
        if (!streamUrl) {
            for (const tc of pool) {
                if (tc.format?.protocol === "hls" && tc.url) {
                    streamUrl = tc.url;
                    break;
                }
            }
        }

        if (!streamUrl) continue;
        let artworkUrl = item.artwork_url || item.user?.avatar_url || "";
        if (artworkUrl) {
            artworkUrl = artworkUrl.replace(/-(large|t500x500|t300x300|t120x120|t200x200|t67x67)/, "-t500x500");
            if (!artworkUrl.includes("-t500x500")) artworkUrl = artworkUrl.replace(/\.jpg$/, "-t500x500.jpg");
        }
        tracks.push({
            id: String(item.id),
            title: item.title ?? "Unknown title",
            artist: item.user?.username ?? "Unknown artist",
            artworkUrl,
            streamUrl,
            durationMs: item.duration ?? 0,
            snipped,
        });
    }
    return tracks;
}

async function searchTracks(query: string, clientId: string): Promise<ScTrack[]> {
    // Include both playable and preview so users can see restricted tracks
    // (they'll be shown as unavailable). access=playable,preview excludes fully
    // blocked/hidden tracks from the results.
    const json = await Native.searchSoundCloud(query, clientId);
    if (!json) throw new Error("Empty response");
    return parseTracks(JSON.parse(json));
}

async function getStreamUrl(track: ScTrack, clientId: string): Promise<string> {
    const { streamUrl, snipped, source } = track;
    if (!streamUrl) throw new Error("Stream URL not found");

    // Deezer/Spotify previews are direct CDN MP3 URLs — play directly, no resolution needed
    if (source === "deezer" || source === "spotify") {
        return streamUrl;
    }

    if (snipped) {
        throw new Error("Label restricted — not available outside SoundCloud Go+");
    }

    // Already a resolved CDN URL, no need to call the resolve endpoint
    if (streamUrl.includes("cf-hls-media") || streamUrl.includes("cf-media")) {
        return streamUrl;
    }

    try {
        const url = await Native.resolveStreamUrl(streamUrl, clientId);
        if (!url) throw new Error("Stream URL not found (check region or Go+ status)");
        return url;
    } catch (e: any) {
        throw new Error(e?.message || "Stream URL not found");
    }
}

async function refreshTrackData(track: ScTrack, clientId: string): Promise<ScTrack> {
    // Deezer/Spotify preview URLs are static CDN links — no refresh needed
    if (track.source === "deezer" || track.source === "spotify") return track;
    try {
        const json = await Native.resolveTrack(track.id, clientId);
        if (!json) return track;
        const data = JSON.parse(json);

        const transcodings = data.media?.transcodings ?? [];

        // Apply the same access filter as parseTracks: only use playable streams.
        // Major-label tracks return access: "preview" which can't be resolved.
        const playable = transcodings.filter((tc: any) =>
            tc.url && (!tc.access || tc.access === "playable")
        );
        const snipped = playable.length === 0;
        const pool = snipped ? transcodings : playable;

        let streamUrl = "";

        // Priority 1: progressive (direct MP3) - most stable
        for (const tc of pool) {
            if (tc.format?.protocol === "progressive" && tc.url) {
                streamUrl = tc.url;
                break;
            }
        }

        // Priority 2: HLS (fallback)
        if (!streamUrl) {
            for (const tc of pool) {
                if (tc.format?.protocol === "hls" && tc.url) {
                    streamUrl = tc.url;
                    break;
                }
            }
        }

        if (streamUrl) {
            return { ...track, streamUrl, snipped };
        }
    } catch { }
    return track;
}

async function playTrackById(trackId: string, startParam?: string) {
    try {
        const p = playerState;
        const clientId = await fetchClientId();
        const json = await Native.resolveTrack(trackId, clientId);
        if (!json) throw new Error("Track not found");
        const tracks = parseTracks({ collection: [JSON.parse(json)] });
        if (tracks.length === 0) throw new Error("Invalid track data");

        let seekPos = 0;
        if (startParam) {
            const startTime = Number(startParam);
            if (!isNaN(startTime) && startTime > 0) {
                seekPos = (Date.now() - startTime) / 1000;
            }
        }

        playerPlayTrack(tracks[0], -1, seekPos);
    } catch (e: any) {
        playerState.status = `❌ Failed to load track: ${e.message}`;
        playerState.notify();
    }
}

// ─── Favorites ──────────────────────────────────────────────────────────────────

async function loadFavorites(): Promise<ScTrack[]> {
    try { return (await DataStore.get<ScTrack[]>(SC_FAVS_KEY)) ?? []; }
    catch { return []; }
}

async function saveFavorites(favs: ScTrack[]) {
    try { await DataStore.set(SC_FAVS_KEY, favs); } catch { }
}

// ─── Duration helper ─────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Player singleton (persiste après fermeture de la modal) ─────────────────

type PlayerListener = () => void;

export const playerState = {
    clientId: null as string | null,
    playing: null as ScTrack | null,
    isPlaying: false,
    progress: 0,
    position: 0,
    duration: 0,
    loop: false,
    volume: 80,
    favIndex: -1,
    favorites: [] as ScTrack[],
    status: "Connecting to SoundCloud…",
    audio: null as HTMLAudioElement | null,
    listeners: new Set<PlayerListener>(),

    notify() {
        this.listeners.forEach(l => l());
        try {
            FluxDispatcher.dispatch({
                type: "SOUNDCORD_STATE_UPDATE",
                state: {
                    playing: this.playing,
                    isPlaying: this.isPlaying,
                    favorites: this.favorites,
                    favIndex: this.favIndex,
                    volume: this.volume
                }
            });
        } catch { }
    },
    subscribe(l: PlayerListener) { this.listeners.add(l); },
    unsubscribe(l: PlayerListener) { this.listeners.delete(l); },
};

let playerInited = false;
async function initPlayer() {
    if (playerInited) return;
    playerInited = true;
    const id = await fetchClientId();
    if (id) {
        playerState.clientId = id;
        playerState.status = "Search for a title or an artist...";
    } else {
        playerState.status = "❌ Impossible to obtain client_id. Check your connection.";
    }
    playerState.favorites = await loadFavorites();
    playerState.notify();
}

async function getDiscordRealOutputDeviceId(): Promise<string> {
    try {
        const discordId = MediaEngineStore.getOutputDeviceId();
        if (!discordId || discordId === "default") return "";

        const devs = MediaEngineStore.getOutputDevices();
        const selected = devs[discordId];
        if (!selected || !selected.name) return "";

        let webDevs = await navigator.mediaDevices.enumerateDevices();
        if (webDevs.some(d => d.kind === "audiooutput" && !d.label)) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                webDevs = await navigator.mediaDevices.enumerateDevices();
            } catch { }
        }

        const match = webDevs.find(d =>
            d.kind === "audiooutput" &&
            d.label &&
            (d.label.includes(selected.name) || selected.name.includes(d.label) || d.label.toLowerCase() === selected.name.toLowerCase())
        );

        if (match) {
            return match.deviceId;
        }
    } catch { }
    return "";
}

async function playerPlayTrack(track: ScTrack, fromFavIdx = -1, seekPos = 0) {
    const s = playerState;
    if (!s.clientId) { s.status = "❌ Missing client_id"; s.notify(); return; }
    if (s.audio) { s.audio.pause(); s.audio.src = ""; s.audio = null; }

    s.status = "⏳ Refreshing track...";
    s.playing = track;
    s.favIndex = fromFavIdx;
    s.progress = 0; s.position = 0; s.isPlaying = false;
    s.notify();

    try {
        // Rafraîchir les données de la piste pour éviter les 404 (liens expirés)
        const freshTrack = await refreshTrackData(track, s.clientId);
        s.playing = freshTrack;

        const mp3Url = await getStreamUrl(freshTrack, s.clientId);
        const audio = new Audio();

        // Nettoyage de l'ancienne instance
        if (s.audio) {
            s.audio.pause();
            s.audio.src = "";
            s.audio.load();
        }

        // Error handling for the audio element itself
        audio.addEventListener("error", e => {
            const { error } = audio;
            console.error("[SoundCord] HTML5 Audio Error:", error?.code, error?.message);
            if (error?.code === 4 || error?.code === 3) {
                s.status = "❌ Stream error : No supported source found (Region lock?)";
            } else if (error?.code === 2) {
                s.status = "❌ Network error : Connection failed";
            } else {
                s.status = `❌ Audio playback error (${error?.code || "unknown"})`;
            }
            s.isPlaying = false;
            s.notify();
        });

        audio.src = mp3Url;
        if (seekPos > 0) {
            audio.currentTime = seekPos;
        }
        audio.crossOrigin = "anonymous";
        audio.volume = s.volume / 100;
        // Apply saved output device
        try {
            const savedOutput = await DataStore.get<string>("SoundCordPlayer_outputDevice");
            let targetDeviceId = "";
            if (savedOutput && savedOutput !== "default") {
                targetDeviceId = savedOutput;
            } else {
                targetDeviceId = await getDiscordRealOutputDeviceId();
            }
            if (targetDeviceId && (audio as any).setSinkId) {
                await (audio as any).setSinkId(targetDeviceId);
            }
        } catch { }
        s.audio = audio;
        audio.addEventListener("loadedmetadata", () => { s.duration = audio.duration; s.notify(); });
        audio.addEventListener("timeupdate", () => {
            s.position = audio.currentTime;
            s.progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
            s.listeners.forEach(l => l());
        });
        audio.addEventListener("ended", () => {
            s.isPlaying = false; s.progress = 0; s.position = 0;
            s.notify();
            if (s.loop) {
                setTimeout(() => {
                    if (s.audio) { s.audio.currentTime = 0; s.audio.play().catch(() => { }); s.isPlaying = true; s.notify(); }
                    else playerPlayTrack(track, fromFavIdx);
                }, 100);
            } else if (fromFavIdx >= 0 && s.favorites.length > 1) {
                playerPlayFavAt((fromFavIdx + 1) % s.favorites.length);
            }
        });
        audio.addEventListener("error", () => { s.status = "❌ Audio playback error"; s.isPlaying = false; s.notify(); });
        await audio.play();
        s.isPlaying = true;
        s.status = "▶ Now playing…";
        s.notify();
    } catch (e: any) {
        s.status = `❌ Stream error : ${e.message}`;
        s.isPlaying = false;
        s.notify();
    }
}

export function playerPlayFavAt(idx: number) {
    const favs = playerState.favorites;
    if (favs.length === 0) return;
    const i = ((idx % favs.length) + favs.length) % favs.length;
    playerPlayTrack(favs[i], i);
}

function playerStop() {
    const s = playerState;
    if (s.audio) { s.audio.pause(); s.audio.src = ""; s.audio = null; }
    s.playing = null; s.isPlaying = false; s.progress = 0; s.position = 0; s.favIndex = -1;
    s.status = "Search for a track or an artist...";
    s.notify();
}

// ─── Player Synchronization Hook ────────────────────────────────────────────────

function usePlayerState() {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        playerState.subscribe(listener);
        return () => playerState.unsubscribe(listener);
    }, []);
    return playerState;
}

// ─── Composant principal ──────────────────────────────────────────────────────

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconSearch() {
    return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8} /><line x1={21} y1={21} x2={16.65} y2={16.65} /></svg>;
}
function IconHeart({ filled }: { filled: boolean; }) {
    return <svg width={14} height={14} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function IconPlay({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z" /></svg>;
}
function IconPause({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x={6} y={4} width={4} height={16} rx={1} /><rect x={14} y={4} width={4} height={16} rx={1} /></svg>;
}
function IconPrev({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M11 12l9-7v14l-9-7zM2 12l9-7v14l-9-7z" /></svg>;
}
function IconNext({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M13 12l-9 7V5l9 7zM22 12l-9 7V5l9 7z" /></svg>;
}
function IconStop() {
    return <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><rect x={4} y={4} width={16} height={16} rx={2} /></svg>;
}
function IconRepeat({ active }: { active: boolean; }) {
    return <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ color: active ? "#c084fc" : undefined }}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
}
function IconVolume({ low }: { low: boolean; }) {
    return low
        ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1={15.54} y1={8.46} x2={15.54} y2={15.54} /></svg>
        : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>;
}
function IconClose() {
    return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} /></svg>;
}
function IconMusicNote() {
    return <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13" /><circle cx={6} cy={18} r={3} /><circle cx={18} cy={16} r={3} /></svg>;
}

// ─── Composant principal ──────────────────────────────────────────────────────

const SC_OUTPUT_KEY = "SoundCordPlayer_outputDevice";

function SoundCloudModal({ onClose }: { onClose: () => void; }) {
    const [tab, setTab] = useState<"search" | "favs">("search");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ScTrack[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedOutput, setSelectedOutput] = useState<string>("default");
    const p = usePlayerState();
    const progressRef = useRef<HTMLDivElement>(null);
    const enableIsland = settings.use(["enableDynamicIsland"]).enableDynamicIsland ?? false;

    useEffect(() => { initPlayer(); }, []);

    useEffect(() => {
        const load = async () => {
            try {
                // FIX: MediaEngineStore.getOutputDevices() retourne les IDs internes Discord,
                // PAS les vrais deviceId WebAudio requis par setSinkId().
                // On utilise navigator.mediaDevices.enumerateDevices() pour avoir les vrais deviceId.
                let devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter(d => d.kind === "audiooutput");

                // Si les labels sont vides (permission pas encore accordée), on essaie de les obtenir
                if (outputs.some(d => !d.label)) {
                    try {
                        // Demander accès micro déclenche la permission pour lister les outputs aussi
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        stream.getTracks().forEach(t => t.stop());
                        devices = await navigator.mediaDevices.enumerateDevices();
                    } catch { }
                }

                setOutputDevices(devices.filter(d => d.kind === "audiooutput"));
                const saved = await DataStore.get<string>(SC_OUTPUT_KEY);
                if (saved) setSelectedOutput(saved);
            } catch { }
        };
        load();
    }, []);

    async function applyOutputDevice(deviceId: string) {
        setSelectedOutput(deviceId);
        await DataStore.set(SC_OUTPUT_KEY, deviceId);
        // Apply to current audio if possible
        try {
            if (p.audio && (p.audio as any).setSinkId) {
                const realId = deviceId === "default"
                    ? await getDiscordRealOutputDeviceId()
                    : deviceId;
                await (p.audio as any).setSinkId(realId);
            }
        } catch { }
    }

    async function doSearch(isRetry = false) {
        if (!p.clientId || !query.trim()) return;
        p.status = "Searching..."; p.notify();
        try {
            const tracks = await searchTracks(query, p.clientId);
            setResults(tracks);
            p.status = tracks.length > 0 ? `${tracks.length} results` : "No results";
            p.notify();
        } catch (e: any) {
            if (!isRetry && (e.message?.includes("401") || e.message?.includes("403"))) {
                p.status = "Refreshing connection..."; p.notify();
                const newId = await refreshClientId();
                if (newId) {
                    p.clientId = newId;
                    return doSearch(true);
                }
                else { p.status = "Connection impossible"; p.notify(); }
            } else { p.status = `Error : ${e.message}`; p.notify(); }
        }
    }

    function togglePause() {
        if (!p.audio) return;
        if (p.isPlaying) { p.audio.pause(); p.isPlaying = false; p.notify(); }
        else { p.audio.play(); p.isPlaying = true; p.notify(); }
    }

    function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
        if (!p.audio || !progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        p.audio.currentTime = frac * (p.audio.duration || 0);
        p.progress = frac; p.notify();
    }

    function navFav(dir: 1 | -1) {
        const base = p.favIndex >= 0 ? p.favIndex : (dir > 0 ? -1 : p.favorites.length);
        playerPlayFavAt(((base + dir) % p.favorites.length + p.favorites.length) % p.favorites.length);
    }

    async function toggleFavorite(track: ScTrack) {
        const favs = [...p.favorites];
        const idx = favs.findIndex(f => f.id === track.id);
        if (idx >= 0) favs.splice(idx, 1); else favs.push(track);
        p.favorites = favs; p.notify();
        await saveFavorites(favs);
    }

    const isFav = (t: ScTrack) => p.favorites.some(f => f.id === t.id);
    const trackList: ScTrack[] = tab === "search" ? results : p.favorites;

    return (
        <div className="sc-player-root">

            {/* Header */}
            <div className="sc-header">
                <span className="sc-header-title">
                    <IconMusicNote />
                    SoundCord Player
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {/* Toggle Dynamic Island */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Dynamic Islande</span>
                        <Switch
                            checked={enableIsland}
                            onChange={(val: boolean) => settings.store.enableDynamicIsland = val}
                        />
                    </div>
                    {/* Bouton settings */}
                    <button
                        className="sc-close-btn"
                        title="Audio output"
                        onClick={() => setShowSettings(v => !v)}
                        style={{ color: showSettings ? "#c084fc" : undefined }}
                    >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx={12} cy={12} r={3} />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                    <button className="sc-close-btn" onClick={onClose}><IconClose /></button>
                </div>
            </div>

            {/* Panneau settings sortie audio */}
            {showSettings && (
                <div style={{
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.2)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    display: "flex", alignItems: "center", gap: 8
                }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>Audio output</span>
                    <div style={{ flex: 1 }}>
                        <SafeSearchableSelect
                            options={[
                                { value: "default", label: "Default" },
                                ...outputDevices.map(d => ({
                                    value: d.deviceId,
                                    label: d.label || d.deviceId.slice(0, 30)
                                }))
                            ]}
                            value={selectedOutput}
                            onChange={(v: string) => applyOutputDevice(v)}
                            closeOnSelect={true}
                        />
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="sc-search-row">
                <input className="sc-search-input" value={query}
                    onChange={e => setQuery(e.currentTarget.value)}
                    onKeyDown={e => e.key === "Enter" && doSearch(false)}
                    placeholder="Track or artist..." />
                <button className="sc-search-btn" onClick={() => doSearch(false)} disabled={!p.clientId}>{t("Search")}</button>
            </div>

            {/* Tabs */}
            <div className="sc-tabs">
                <button className={`sc-tab${tab === "search" ? " sc-tab-active" : ""}`} onClick={() => setTab("search")}>
                    {t("Results")}
                </button>
                <button className={`sc-tab${tab === "favs" ? " sc-tab-active" : ""}`} onClick={() => setTab("favs")}>
                    {t("Favorites")} {p.favorites.length > 0 && `(${p.favorites.length})`}
                </button>
            </div>

            <div className="sc-status">{p.status}</div>

            {/* Track list */}
            <div className="sc-tracklist">
                {trackList.length === 0 ? (
                    <div className="sc-empty">
                        {tab === "search" ? t("Start a search to see tracks") : t("No favorites saved")}
                    </div>
                ) : trackList.map((track, idx) => (
                    <div key={track.id}
                        className={`sc-track-row${p.playing?.id === track.id ? " sc-track-playing" : ""}${track.snipped ? " sc-track-snipped" : ""}`}
                        onClick={() => { if (!track.snipped) tab === "favs" ? playerPlayFavAt(idx) : playerPlayTrack(track); }}>
                        <img className="sc-artwork" src={track.artworkUrl || ""} alt=""
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <div className="sc-track-info">
                            <div className="sc-track-title">
                                {track.title}
                            </div>
                            <div className="sc-track-artist">{track.artist} · {fmtDuration(track.durationMs)}</div>
                        </div>
                        <button className="sc-play-btn"
                            disabled={!!track.snipped}
                            title={track.snipped ? "Label restricted" : track.previewOnly ? "Play 30s preview" : "Play"}
                            onClick={e => { e.stopPropagation(); if (!track.snipped) tab === "favs" ? playerPlayFavAt(idx) : playerPlayTrack(track); }}>
                            <IconPlay />
                        </button>
                        <button className={`sc-fav-btn${isFav(track) ? " sc-fav-active" : ""}`}
                            onClick={e => { e.stopPropagation(); toggleFavorite(track); }}
                            title={isFav(track) ? t("Remove from favorites") : t("Add to favorites")}>
                            <IconHeart filled={isFav(track)} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Now Playing */}
            {p.playing && (
                <div className="sc-now-playing">
                    <div className="sc-np-top">
                        <img className="sc-np-artwork" src={p.playing.artworkUrl || ""} alt=""
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <div className="sc-np-info">
                            <div className="sc-np-title">{p.playing.title}</div>
                            <div className="sc-np-artist">{p.playing.artist}</div>
                        </div>
                    </div>
                    <div ref={progressRef} className="sc-progress-bar" onClick={handleSeek}>
                        <div className="sc-progress-fill" style={{ width: `${p.progress * 100}%` }} />
                    </div>
                    <div className="sc-time-row">
                        <span>{fmtDuration(p.position * 1000)}</span>
                        <span>{fmtDuration(p.duration * 1000)}</span>
                    </div>
                    <div className="sc-controls">
                        <button className="sc-ctrl-btn" onClick={() => navFav(-1)} title="Previous"><IconPrev /></button>
                        <button className="sc-play-pause-btn" onClick={togglePause}>
                            {p.isPlaying ? <IconPause /> : <IconPlay size={16} />}
                        </button>
                        <button className="sc-ctrl-btn" onClick={() => navFav(+1)} title="Next"><IconNext /></button>
                        <button className="sc-ctrl-btn" onClick={playerStop} title="Stop"><IconStop /></button>
                        <button className={`sc-ctrl-btn${p.loop ? " sc-ctrl-active" : ""}`}
                            onClick={() => { p.loop = !p.loop; p.notify(); }} title="Loop">
                            <IconRepeat active={p.loop} />
                        </button>
                    </div>
                    <div className="sc-volume-row">
                        <IconVolume low={p.volume < 50} />
                        <input type="range" min={0} max={100} value={p.volume}
                            className="sc-volume-slider"
                            onChange={e => {
                                p.volume = Number(e.currentTarget.value);
                                if (p.audio) p.audio.volume = p.volume / 100;
                                p.notify();
                            }} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Thumbnail Toolbar Windows ──────────────────────────────────────────────

let thumbarListener: (() => void) | null = null;

function initThumbar() {
    try {
        const win = VencordNative?.window as any;
        if (!win?.setThumbarButtons || !win?.onThumbarClick) return;

        // Listen for taskbar clicks
        win.onThumbarClick((action: string) => {
            const s = playerState;
            try {
                if (action === "prev") {
                    if (s.favIndex >= 0) playerPlayFavAt(s.favIndex - 1);
                } else if (action === "next") {
                    if (s.favIndex >= 0) playerPlayFavAt(s.favIndex + 1);
                } else if (action === "play") {
                    if (s.audio) { s.audio.play().catch(() => { }); s.isPlaying = true; s.notify(); }
                } else if (action === "pause") {
                    if (s.audio) { s.audio.pause(); s.isPlaying = false; s.notify(); }
                }
            } catch { }
        });

        // Sync thumbar on every player state change
        thumbarListener = () => {
            try {
                const s = playerState;
                const state: "playing" | "paused" | "stopped" = !s.playing ? "stopped" : s.isPlaying ? "playing" : "paused";
                win.setThumbarButtons(state).catch(() => { });
            } catch { }
        };
        playerState.subscribe(thumbarListener);
    } catch { }
}

function cleanupThumbar() {
    try {
        const win = VencordNative?.window as any;
        if (win?.removeThumbarClickListener) win.removeThumbarClickListener();
        if (win?.setThumbarButtons) win.setThumbarButtons("stopped").catch(() => { });
        if (thumbarListener) {
            playerState.unsubscribe(thumbarListener);
            thumbarListener = null;
        }
    } catch { }
}

// ─── Bouton HeaderBar ─────────────────────────────────────────────────────────

function SCHeaderBarButton() {
    return (
        <HeaderBarButton
            tooltip="SoundCord Player"
            position="bottom"
            icon={SoundCloudIconComponent}
            onClick={() => openModal(props => (
                <ModalRoot {...props} size={ModalSize.SMALL}>
                    <SoundCloudModal onClose={props.onClose} />
                </ModalRoot>
            ))}
        />
    );
}

const UserStore = findStoreLazy("UserStore");

let lastSyncTime = 0;
let lastSyncTrackId = "";
let lastSyncIsPlaying = false;

async function syncPlayerStateToCloud() {
    try {
        const token = await getStoredToken();
        if (!token) return;

        const p = playerState;
        if (!p.playing) {
            await saveOwnPluginConfig("soundcloudPlayer", token, {
                private: false,
                trackId: null,
                isPlaying: false,
                start: 0,
                updatedAt: Date.now()
            });
            return;
        }

        const now = Date.now();
        const elapsed = Math.floor(p.position * 1000);
        const start = now - elapsed;

        const shouldSync =
            p.playing.id !== lastSyncTrackId ||
            p.isPlaying !== lastSyncIsPlaying ||
            Math.abs(now - lastSyncTime) > 10000;

        if (!shouldSync) return;

        lastSyncTime = now;
        lastSyncTrackId = p.playing.id;
        lastSyncIsPlaying = p.isPlaying;

        await saveOwnPluginConfig("soundcloudPlayer", token, {
            private: false,
            trackId: p.playing.id,
            isPlaying: p.isPlaying,
            start: start,
            updatedAt: now
        });
    } catch (e) {
        console.error("[SoundCord] Cloud sync failed:", e);
    }
}

// ─── Rich Presence ───────────────────────────────────────────────────────────────────

const RPC_SOCKET_ID = "SoundCordPlayer";
const RPC_APP_ID = "1108588077900898414"; // Shared Discord music app ID

let _rpcLastTitle = "";
let _rpcLastPlaying = false;
let _rpcThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function updateRichPresence() {
    const p = playerState;
    const nowTitle = p.playing?.title ?? "";
    const nowPlaying = !!p.playing && p.isPlaying;

    // Always react immediately to state changes (play/pause/stop/track switch)
    if (nowTitle !== _rpcLastTitle || nowPlaying !== _rpcLastPlaying) {
        if (_rpcThrottleTimer) { clearTimeout(_rpcThrottleTimer); _rpcThrottleTimer = null; }
        _doUpdateRichPresence();
        return;
    }

    // Throttle progress updates to avoid spamming Discord
    if (_rpcThrottleTimer) return;
    _rpcThrottleTimer = setTimeout(() => {
        _rpcThrottleTimer = null;
        _doUpdateRichPresence();
    }, 5000);
}

async function _doUpdateRichPresence() {
    try {
        if (!settings.store.richPresence) {
            clearRichPresence();
            _rpcLastTitle = ""; _rpcLastPlaying = false;
            return;
        }
        const p = playerState;
        if (!p.playing || !p.isPlaying) {
            clearRichPresence();
            _rpcLastTitle = ""; _rpcLastPlaying = false;
            return;
        }

        _rpcLastTitle = p.playing.title ?? "";
        _rpcLastPlaying = true;

        const now = Date.now();
        const elapsed = Math.floor(p.position * 1000);
        const start = now - elapsed;
        const duration = Math.floor(p.duration * 1000);
        const end = start + duration;

        const myUserId = UserStore?.getCurrentUser?.()?.id || "";

        let large_image: string | undefined;
        if (p.playing.artworkUrl) {
            try {
                large_image = (await ApplicationAssetUtils.fetchAssetIds(RPC_APP_ID, [p.playing.artworkUrl]))[0];
            } catch {
                large_image = undefined;
            }
            if (!large_image) {
                large_image = `mp:external/${encodeURIComponent(p.playing.artworkUrl).replace(/%2F/g, "/")}`;
            }
        }

        const assets = large_image ? {
            large_image,
            large_text: p.playing.title || undefined,
        } : undefined;

        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: RPC_SOCKET_ID,
            activity: {
                application_id: RPC_APP_ID,
                name: "SoundCord",
                details: p.playing.title || "Unknown track",
                state: p.playing.artist || undefined,
                type: 2, // LISTENING
                timestamps: duration > 0 ? { start, end } : { start },
                assets,
                buttons: ["Open on SoundCloud"],
                metadata: {
                    button_urls: [p.playing.externalUrl || "https://soundcloud.com"],
                },
                flags: 1,
            }
        });
    } catch { }
}

function clearRichPresence() {
    try {
        _rpcLastTitle = ""; _rpcLastPlaying = false;
        if (_rpcThrottleTimer) { clearTimeout(_rpcThrottleTimer); _rpcThrottleTimer = null; }
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: RPC_SOCKET_ID,
            activity: null,
        });
    } catch { }
}

let rpcListener: (() => void) | null = null;
let documentClickHandler: ((e: MouseEvent) => void) | null = null;

function findUrlInReactFiber(element: HTMLElement | null): string | null {
    let curr = element;
    while (curr) {
        const keys = Object.keys(curr);
        const key = keys.find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (key) {
            let fiber = (curr as any)[key];
            let depth = 0;
            while (fiber && depth < 40) {
                const props = fiber.memoizedProps;
                if (props) {
                    if (typeof props.href === "string") return props.href;
                    if (typeof props.url === "string") return props.url;
                    if (typeof props.button?.url === "string") return props.button.url;
                    // Check activity card button_urls (Discord RPC buttons)
                    if (Array.isArray(props.activity?.metadata?.button_urls)) {
                        for (const u of props.activity.metadata.button_urls) {
                            if (typeof u === "string" && u.includes("midnightcord://listen")) return u;
                        }
                    }
                }
                fiber = fiber.return;
                depth++;
            }
        }
        curr = curr.parentElement;
    }
    return null;
}

async function handleListeningTogether(scId: string, startParam: string, userIdParam?: string) {
    if (userIdParam) {
        try {
            const config = await getPublicPluginConfig("soundcloudPlayer", userIdParam);
            if (config?.settings) {
                const { trackId, start, isPlaying } = config.settings;
                if (trackId && isPlaying) {
                    playTrackById(trackId, String(start));
                    return;
                }
            }
        } catch (e) {
            console.error("[SoundCord] API sync failed:", e);
        }
    }
    // Fallback: play directly by scId if no user config or API failed
    if (scId) {
        playTrackById(scId, startParam);
    }
}

function handleListeningTogetherEvent(e: any) {
    const scId = e.detail?.scId;
    const start = e.detail?.start;
    const userId = e.detail?.userId;
    handleListeningTogether(scId, start, userId);
}

function handleSoundCordCommand(e: any) {
    if (e.type === "SOUNDCORD_REQUEST_STATE") {
        playerState.notify();
    } else if (e.type === "SOUNDCORD_COMMAND") {
        const cmd = e.command;
        if (cmd === "toggle") {
            if (!playerState.audio) return;
            if (playerState.isPlaying) { playerState.audio.pause(); playerState.isPlaying = false; }
            else { playerState.audio.play(); playerState.isPlaying = true; }
            playerState.notify();
        } else if (cmd === "prev") {
            const base = playerState.favIndex >= 0 ? playerState.favIndex : playerState.favorites.length;
            playerPlayFavAt((base - 1 + playerState.favorites.length) % playerState.favorites.length);
        } else if (cmd === "next") {
            const base = playerState.favIndex >= 0 ? playerState.favIndex : -1;
            playerPlayFavAt((base + 1) % playerState.favorites.length);
        } else if (cmd === "volume") {
            const vol = e.value;
            if (vol !== undefined) {
                playerState.volume = vol;
                if (playerState.audio) playerState.audio.volume = vol / 100;
                playerState.notify();
            }
        }
    }
}

function handleAccountSwitch() {
    playerStop();
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    richPresence: {
        type: OptionType.BOOLEAN,
        description: "Show listening activity status (like Spotify)",
        default: true,
    },
    enableDynamicIsland: {
        type: OptionType.BOOLEAN,
        description: "Enable Dynamic Island for SoundCord",
        default: false,
    },
    showSoundCordControls: {
        type: OptionType.BOOLEAN,
        description: "Show playback controls (Previous, Play/Pause, Next) in Dynamic Island",
        default: true,
    },
    showSoundCordVolume: {
        type: OptionType.BOOLEAN,
        description: "Show volume slider in Dynamic Island",
        default: true,
    },
});

export default definePlugin({

    name: "SoundCordPlayer",
    enabledByDefault: true,
    description: "Integrated SoundCord player. Client ID is automatically fetched via native Electron process — no account required.",
    authors: [EquicordDevs.nobody],
    settings,

    toolboxActions: {
        "Open SoundCord"() {
            openModal(props => (
                <ModalRoot {...props} size={ModalSize.SMALL}>
                    <SoundCloudModal onClose={props.onClose} />
                </ModalRoot>
            ));
        }
    },

    headerBarButton: {
        icon: SoundCloudIconComponent,
        render: props => {
            // DynamicIslande acts as the primary host. If it's disabled, we render our standalone version for SoundCord.
            const isFullIslandEnabled = isPluginEnabled("DynamicIslande");
            const enableIsland = settings.use(["enableDynamicIsland"]).enableDynamicIsland ?? true;
            return (
                <React.Fragment>
                    <SCHeaderBarButton {...props} />
                    {!isFullIslandEnabled && enableIsland && <SafeDynamicIsland onlySoundCord={true} />}
                </React.Fragment>
            );
        },
    },

    search: searchTracks,
    get clientId() { return playerState.clientId; },

    start() {
        Native.installListeningTogetherIntercept().catch(() => {});
        fetchClientId().catch(() => { });
        initThumbar();

        window.addEventListener("soundcord-listen-together", handleListeningTogetherEvent);

        documentClickHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // Try direct href on anchors first
            const anchor = target.closest("a") as HTMLAnchorElement | null;
            let href = anchor?.href || "";

            // Fallback to React fiber properties (for buttons)
            if (!href) {
                const fiberHref = findUrlInReactFiber(target);
                if (fiberHref) href = fiberHref;
            }

            if (href && href.includes("midnightcord://listen?")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                try {
                    const params = new URL(href).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    if (scId || userId) {
                        handleListeningTogether(scId, start, userId);
                    }
                } catch {}
            }
        };
        document.addEventListener("click", documentClickHandler, true);

        // Force clear any stuck activity from previous sessions on startup
        clearRichPresence();

        // Wire Rich Presence to player state changes
        rpcListener = () => {
            updateRichPresence();
            syncPlayerStateToCloud();
        };
        playerState.subscribe(rpcListener);

        FluxDispatcher.subscribe("LOGOUT", handleAccountSwitch);
        FluxDispatcher.subscribe("CONNECTION_OPEN", handleAccountSwitch);
        FluxDispatcher.subscribe("SOUNDCORD_REQUEST_STATE", handleSoundCordCommand);
        FluxDispatcher.subscribe("SOUNDCORD_COMMAND", handleSoundCordCommand);
    },

    stop() {
        window.removeEventListener("soundcord-listen-together", handleListeningTogetherEvent);
        if (documentClickHandler) {
            document.removeEventListener("click", documentClickHandler, true);
            documentClickHandler = null;
        }
        cleanupThumbar();
        playerStop();

        // Unsubscribe RPC listener and clear activity
        if (rpcListener) {
            playerState.unsubscribe(rpcListener);
            rpcListener = null;
        }
        clearRichPresence();
        FluxDispatcher.unsubscribe("LOGOUT", handleAccountSwitch);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", handleAccountSwitch);
        FluxDispatcher.unsubscribe("SOUNDCORD_REQUEST_STATE", handleSoundCordCommand);
        FluxDispatcher.unsubscribe("SOUNDCORD_COMMAND", handleSoundCordCommand);
        playerInited = false;
    },
});
