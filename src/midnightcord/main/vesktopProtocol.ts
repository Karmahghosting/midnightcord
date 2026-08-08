/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, protocol } from "electron";

import { handleVesktopAssetsProtocol } from "./userAssets";
import { handleVesktopStaticProtocol } from "./vesktopStatic";

app.whenReady().then(() => {
    protocol.handle("midnightcord", async req => {
        const url = new URL(req.url);

        switch (url.hostname) {
            case "assets":
                return handleVesktopAssetsProtocol(url.pathname, req);
            case "static":
                return handleVesktopStaticProtocol(url.pathname, req);
            default:
                return new Response(null, { status: 404 });
        }
    });
});
