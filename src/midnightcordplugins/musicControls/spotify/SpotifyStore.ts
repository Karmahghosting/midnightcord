/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Midnightcord, a modification for Discord's desktop app
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

import { isPluginEnabled } from "@api/PluginManager";
import OpenInAppPlugin from "@plugins/openInApp";
import type { FluxStore } from "@vencord/discord-types";
import { findByProps, findByPropsLazy, findStoreLazy, proxyLazyWebpack } from "@webpack";
import { Flux, FluxDispatcher, UserStore } from "@webpack/common";

import { settings } from "../settings";

export interface Track {
    id: string;
    name: string;
    duration: number;
    isLocal: boolean;
    album: {
        id: string;
        name: string;
        image: { height: number; width: number; url: string; };
    };
    artists: { id: string; href: string; name: string; type: string; uri: string; }[];
}

interface Device { id: string; is_active: boolean; is_restricted?: boolean; volume_percent?: number; }
interface Session { socket: { accountId: string; accessToken: string; }; device?: Device; }
interface PlayerState {
    accountId: string;
    track: Track | null;
    isPlaying: boolean;
    position?: number;
    device?: Device;
    volumePercent?: number;
    actual_repeat?: Repeat;
    repeat?: boolean;
    shuffle?: boolean;
}
type Repeat = "off" | "track" | "context";
const API_BASE = "https://api.spotify.com/v1/me/player";
const POLL_DELAY = 30_000;
const finite = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const repeat = (value: unknown): Repeat => value === "track" || value === "context" ? value : "off";

function normalizeTrack(value: any, api = false): Track | null {
    if (!value || typeof value.name !== "string" || api && !["track", "episode"].includes(value.type)) return null;
    const album = (api && value.type === "episode" ? value.show : value.album) ?? {};
    const image = (api ? album.images?.[0] : album.image) ?? {};
    return {
        id: String(value.linked_from?.id ?? value.id ?? value.uri ?? value.name),
        name: value.name,
        duration: Math.max(0, finite(api ? value.duration_ms : value.duration)),
        isLocal: !!(api ? value.is_local : value.isLocal),
        album: { id: album.id ?? "", name: album.name ?? "", image: { height: finite(image.height), width: finite(image.width), url: image.url ?? "" } },
        artists: Array.isArray(value.artists) ? value.artists.filter(a => typeof a?.name === "string").map(a => ({ id: a.id ?? "", name: a.name, href: a.href ?? "", type: a.type ?? "artist", uri: a.uri ?? "" })) : []
    };
}

export const SpotifyStore = proxyLazyWebpack(() => {
    const { Store } = Flux;
    const SpotifySocket = findByProps("getActiveSocketAndDevice");
    const SpotifyAPI = findByPropsLazy("vcSpotifyMarker");
    const ConnectedAccountsStore = findStoreLazy("ConnectedAccountsStore") as FluxStore & { getAccounts(): { id: string; type: string; revoked?: boolean; }[]; };

    class SpotifyStore extends Store {
        public mPosition = 0;
        public _start = 0;
        public track: Track | null = null;
        public device: Device | null = null;
        public isPlaying = false;
        public repeat: Repeat = "off";
        public shuffle = false;
        public volume = 0;
        public isSettingPosition = false;
        public lastError: string | null = null;
        private leases = 0;
        private generation = 0;
        private revision = 0;
        private accountId: string | null = null;
        private userId: string | null = null;
        private loggedOut = false;
        private revoked = new Set<string>();
        private timer: ReturnType<typeof setTimeout> | undefined;
        private pending: Promise<void> | null = null;
        private queuedCommand = false;
        private retryAt = 0;

        initialize() { this.waitFor(SpotifySocket, ConnectedAccountsStore); }

        public get position() {
            return Math.min(this.track?.duration ?? Infinity, Math.max(0, this.mPosition + (this.isPlaying ? Date.now() - this._start : 0)));
        }

        public set position(value: number) {
            this.mPosition = Math.max(0, finite(value));
            this._start = Date.now();
        }

        private session(): Session | null {
            if (this.loggedOut || !UserStore.getCurrentUser()?.id) return null;
            try {
                const active = SpotifySocket.getActiveSocketAndDevice?.();
                const session = active && this.hasAccount(active.socket.accountId) ? active
                    : SpotifySocket.getPlayableComputerDevices?.()?.find((s: Session) => this.hasAccount(s.socket.accountId));
                return session?.socket?.accountId && session.socket.accessToken ? session : null;
            } catch { return null; }
        }

        private hasAccount(accountId: string) {
            return !this.revoked.has(accountId) && ConnectedAccountsStore.getAccounts().some(account => account.type === "spotify" && account.id === accountId && !account.revoked);
        }

        private reconcile() {
            const session = this.session();
            const userId = UserStore.getCurrentUser()?.id ?? null;
            const keepAccount = userId === this.userId && !this.loggedOut && this.accountId && this.hasAccount(this.accountId);
            const accountId = session?.socket.accountId ?? (keepAccount ? this.accountId : null);
            if (userId !== this.userId || accountId !== this.accountId) {
                this.reset();
                this.userId = userId;
                this.accountId = accountId;
            }
            return session;
        }

        private reset() {
            this.generation++;
            this.revision++;
            this.track = this.device = null;
            this.isPlaying = this.isSettingPosition = this.shuffle = false;
            this.repeat = "off";
            this.volume = this.position = 0;
            this.lastError = null;
            this.retryAt = 0;
            this.emitChange();
        }

        public get canControl() {
            const session = this.session();
            return !this.pending && Date.now() >= this.retryAt && !!session && session.socket.accountId === this.accountId
                && UserStore.getCurrentUser()?.id === this.userId && !!this.device?.is_active && !this.device.is_restricted;
        }

        private hydrate() {
            const session = this.reconcile();
            if (!session) return;
            const state = SpotifySocket.getPlayerState?.(session.socket.accountId);
            this.device = session.device ?? this.device;
            // Discord only retains this snapshot while playback is active; sharing activity is independent.
            if (!this.track && state?.track) {
                this.track = normalizeTrack(state.track);
                this.isPlaying = !!this.track;
                this.position = Math.max(0, Date.now() - finite(state.startTime, Date.now()));
                this.repeat = state.repeat ? "context" : "off";
                this.volume = finite(session.device?.volume_percent);
            }
            this.emitChange();
        }

        private schedule(delay = POLL_DELAY) {
            clearTimeout(this.timer);
            this.timer = undefined;
            if (!this.leases || this.loggedOut) return;
            this.timer = setTimeout(() => { this.timer = undefined; void this.refreshPlayback(); }, Math.max(delay, this.retryAt - Date.now()));
        }

        private wake = () => { this.hydrate(); void this.refreshPlayback(); };

        public retainSync(): () => void {
            if (++this.leases === 1) {
                this.generation++;
                this.hydrate();
                window.addEventListener("focus", this.wake);
                window.addEventListener("online", this.wake);
                void this.refreshPlayback();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                if (--this.leases) return;
                this.generation++;
                this.isSettingPosition = false;
                clearTimeout(this.timer);
                this.timer = undefined;
                window.removeEventListener("focus", this.wake);
                window.removeEventListener("online", this.wake);
            };
        }

        private guard(session: Session) {
            const { generation } = this;
            const { userId } = this;
            return () => generation === this.generation && !this.loggedOut && userId === UserStore.getCurrentUser()?.id
                && this.session()?.socket.accountId === session.socket.accountId;
        }

        private fail(error: any) {
            const status = error?.status;
            if (status === 429) {
                const header = error.headers?.["retry-after"] ?? error.headers?.get?.("retry-after");
                const seconds = Number(header);
                const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
                this.retryAt = Date.now() + Math.max(POLL_DELAY, Number.isFinite(delay) ? delay : POLL_DELAY);
                this.lastError = "Spotify is temporarily limiting requests. Please try again later.";
            } else if (status === 401 || status === 403) {
                this.retryAt = Date.now() + (status === 403 ? 300_000 : 60_000);
                this.lastError = "Spotify could not authorize this action. Check your Spotify connection in Discord settings.";
            } else {
                this.retryAt = Date.now() + POLL_DELAY;
                this.lastError = "Spotify is unavailable. Playback will synchronize when the connection returns.";
            }
            this.schedule();
            this.emitChange();
        }

        public async _req(method: "post" | "get" | "put", route: string, data: any = {}, session = this.session()) {
            if (!session) throw new Error("No connected Spotify session");
            const query = { ...data.query };
            if (method !== "get" && this.device?.is_active) query.device_id = this.device.id;
            const response = await SpotifyAPI[method](session.socket.accountId, session.socket.accessToken, {
                url: API_BASE + route, ...data, query, onlyRetryOnAuthorizationErrors: true
            });
            if (response?.status >= 400) throw response;
            return response;
        }

        private run(operation: () => Promise<void>) {
            const { generation } = this;
            const pending = operation().finally(() => {
                if (this.pending !== pending) return;
                this.pending = null;
                if (this.timer === undefined) this.schedule(generation === this.generation ? POLL_DELAY : 0);
                this.emitChange();
            });
            this.pending = pending;
            this.emitChange();
            return pending;
        }

        public refreshPlayback(): Promise<void> {
            if (this.pending) return this.pending;
            if (!this.leases) return Promise.resolve();
            const session = this.reconcile();
            if (!session || Date.now() < this.retryAt) { this.schedule(); return Promise.resolve(); }
            const valid = this.guard(session);
            const { revision } = this;
            return this.run(async () => {
                try {
                    const response = await this._req("get", "", { query: { additional_types: "track,episode" } }, session);
                    if (!valid() || revision !== this.revision) return;
                    const data = response.body;
                    if (response.status === 204 || !data) {
                        this.track = this.device = null;
                        this.isPlaying = false;
                        this.position = 0;
                    } else {
                        this.track = normalizeTrack(data.item, true);
                        this.device = data.device ?? session.device ?? null;
                        this.isPlaying = !!this.track && data.is_playing === true;
                        this.position = finite(data.progress_ms);
                        this.volume = finite(data.device?.volume_percent);
                        this.repeat = repeat(data.repeat_state);
                        this.shuffle = data.shuffle_state === true;
                    }
                    this.lastError = null;
                    this.retryAt = 0;
                    this.emitChange();
                } catch (error) { if (valid() && revision === this.revision) this.fail(error); }
            });
        }

        private async command(method: "put" | "post", route: string, query?: Record<string, unknown>, confirmed?: () => void): Promise<void> {
            this.reconcile();
            if (this.pending) {
                if (this.queuedCommand) return;
                const { generation, userId, accountId } = this;
                this.queuedCommand = true;
                try { await this.pending; }
                finally { this.queuedCommand = false; }
                if (generation !== this.generation || userId !== UserStore.getCurrentUser()?.id || accountId !== this.session()?.socket.accountId) return;
                this.reconcile();
            }
            if (!this.canControl) return Promise.resolve();
            const session = this.session()!;
            const valid = this.guard(session);
            const revision = ++this.revision;
            if (route === "/seek") this.isSettingPosition = true;
            return this.run(async () => {
                try {
                    await this._req(method, route, { query }, session);
                    if (!valid()) return;
                    if (revision === this.revision) confirmed?.();
                    this.lastError = null;
                    this.schedule(350);
                } catch (error) { if (valid()) this.fail(error); }
                finally { if (valid()) this.isSettingPosition = false; }
            });
        }

        public prev() { return this.command("post", "/previous"); }
        public next() { return this.command("post", "/next"); }
        public setPlaying(playing: boolean) { return this.command("put", playing ? "/play" : "/pause"); }
        public setRepeat(state: Repeat) { return this.command("put", "/repeat", { state: repeat(state) }); }
        public setShuffle(state: boolean) { return this.command("put", "/shuffle", { state }, () => { this.shuffle = state; }); }
        public setVolume(percent: number) {
            if (!Number.isFinite(percent)) return Promise.resolve();
            const volume = Math.round(Math.max(0, Math.min(100, finite(percent))));
            return this.command("put", "/volume", { volume_percent: volume }, () => { this.volume = volume; });
        }
        public seek(ms: number) {
            if (!Number.isFinite(ms) || !this.track) return Promise.resolve();
            const position = Math.round(Math.min(this.track.duration, Math.max(0, ms)));
            return this.command("put", "/seek", { position_ms: position }, () => { this.position = position; });
        }
        public openExternal(path: string) {
            const url = settings.store.useSpotifyUris || isPluginEnabled(OpenInAppPlugin.name)
                ? "spotify:" + path.replaceAll("/", (_, idx) => idx === 0 ? "" : ":") : "https://open.spotify.com" + path;
            VencordNative.native.openExternal(url);
        }

        public accept(accountId: string) {
            const session = this.reconcile();
            if (session) return session.socket.accountId === accountId;
            if (this.loggedOut || !this.userId || !this.hasAccount(accountId)) return false;
            if (this.accountId === accountId) return true;
            if (!this.accountId && SpotifySocket.getPlayerState?.(accountId)?.track) {
                this.accountId = accountId;
                return true;
            }
            return false;
        }
        public playerState(event: PlayerState) {
            if (!this.accept(event.accountId)) return;
            this.revision++;
            this.track = normalizeTrack(event.track);
            const nativeDevice = this.session()?.device;
            this.device = event.device ?? (nativeDevice?.is_active ? nativeDevice : this.device ?? nativeDevice) ?? null;
            this.isPlaying = !!this.track && event.isPlaying === true;
            this.position = finite(event.position);
            this.volume = finite(event.volumePercent, this.volume);
            this.repeat = event.actual_repeat ? repeat(event.actual_repeat) : event.repeat ? "context" : "off";
            this.shuffle = event.shuffle ?? this.shuffle;
            this.isSettingPosition = false;
            if (Date.now() >= this.retryAt) this.lastError = null;
            this.schedule();
            this.emitChange();
        }
        public devices(accountId: string, devices?: Device[]) {
            if (!this.accept(accountId)) return;
            this.revision++;
            this.device = devices ? devices.find(d => d.is_active) ?? null : this.session()?.device ?? null;
            this.schedule();
            this.emitChange();
        }
        public connection(event: "open" | "logout" | "update" | "revoke" | "token", accountId?: string) {
            if (event === "logout") { this.loggedOut = true; this.revoked.clear(); this.accountId = null; this.reset(); this.schedule(); return; }
            if (event === "revoke" && accountId) this.revoked.add(accountId);
            if (event === "token" && accountId) this.revoked.delete(accountId);
            if (event === "open") { this.loggedOut = false; this.revoked.clear(); this.accountId = null; this.reset(); }
            this.hydrate();
            this.schedule(0);
        }
    }

    const store = new SpotifyStore(FluxDispatcher, {
        SPOTIFY_PLAYER_STATE: (event: PlayerState) => store.playerState(event),
        SPOTIFY_SET_DEVICES: ({ accountId, devices }: { accountId: string; devices: Device[]; }) => store.devices(accountId, devices),
        SPOTIFY_SET_ACTIVE_DEVICE: ({ accountId }: { accountId: string; }) => store.devices(accountId),
        SPOTIFY_ACCOUNT_ACCESS_TOKEN: ({ accountId }: { accountId: string; }) => store.connection("token", accountId),
        SPOTIFY_ACCOUNT_ACCESS_TOKEN_REVOKE: ({ accountId }: { accountId: string; }) => store.connection("revoke", accountId),
        CONNECTION_OPEN: () => store.connection("open"),
        USER_CONNECTIONS_UPDATE: () => store.connection("update"),
        LOGOUT: () => store.connection("logout")
    });
    return store;
});
