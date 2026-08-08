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

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { contextBridge, webFrame } from "electron/renderer";

import VencordNative, { invoke, sendSync } from "./VencordNative";

contextBridge.exposeInMainWorld("VencordNative", VencordNative);

// Discord
if (location.protocol !== "data:") {
    invoke(IpcEvents.INIT_FILE_WATCHERS);

    if (IS_DISCORD_DESKTOP) {
        // Intercepte les AbortError non catchées (ex: video.play() interrompue au scroll)
        // Ces erreurs uncaught peuvent crasher le renderer Electron au scroll rapide
        webFrame.executeJavaScript(`
            window.addEventListener('unhandledrejection', function(event) {
                const reason = event.reason;
                if (reason && (
                    (reason.name === 'AbortError') ||
                    (reason instanceof DOMException && reason.name === 'AbortError') ||
                    (typeof reason.message === 'string' && reason.message.includes('play() request was interrupted'))
                )) {
                    event.preventDefault();
                }
            });
        `);

        webFrame.executeJavaScript(sendSync<string>(IpcEvents.PRELOAD_GET_RENDERER_JS));
        // Not supported in sandboxed preload scripts but Discord doesn't support it either so who cares
        require(process.env.DISCORD_PRELOAD!);

        // Remplace "Discord" par "Midnightcord" dans le titre de la fenêtre (document.title)
        // Discord change le titre dynamiquement depuis le renderer — on intercepte ça ici
        webFrame.executeJavaScript(`
            (function() {
                function patchTitle(t) {
                    return t ? t.replace(/Discord/g, 'Midnightcord') : t;
                }
                // Patch initial
                if (document.title) document.title = patchTitle(document.title);
                // Observe les changements futurs
                const titleEl = document.querySelector('title');
                if (titleEl) {
                    new MutationObserver(() => {
                        const cur = document.title;
                        const patched = patchTitle(cur);
                        if (cur !== patched) document.title = patched;
                    }).observe(titleEl, { childList: true });
                } else {
                    // Si <title> n'existe pas encore, attend le DOM
                    new MutationObserver((_, obs) => {
                        const el = document.querySelector('title');
                        if (!el) return;
                        obs.disconnect();
                        if (document.title) document.title = patchTitle(document.title);
                        new MutationObserver(() => {
                            const cur = document.title;
                            const patched = patchTitle(cur);
                            if (cur !== patched) document.title = patched;
                        }).observe(el, { childList: true });
                    }).observe(document.documentElement || document, { childList: true, subtree: true });
                }
            })()
        `);
    }
} // Monaco popout
else {
    contextBridge.exposeInMainWorld("setCss", debounce(VencordNative.quickCss.set));
    contextBridge.exposeInMainWorld("getCurrentCss", VencordNative.quickCss.get);
    contextBridge.exposeInMainWorld("getTheme", VencordNative.quickCss.getEditorTheme);
}
