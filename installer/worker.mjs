/*
 * Midnightcord native installer
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parentPort, workerData } from "node:worker_threads";

// Discord's ASAR archives must remain opaque files during installation.
process.noAsar = true;
const { createInstaller } = await import("./core.mjs");

const installer = createInstaller({
    ...workerData,
    onProgress: progress => parentPort.postMessage({ type: "progress", progress })
});

parentPort.on("message", async ({ id, method, request }) => {
    try {
        if (!["getState", "scan", "perform"].includes(method)) throw new Error("Commande inconnue.");
        const result = await installer[method](request);
        parentPort.postMessage({ type: "result", id, result });
    } catch (error) { parentPort.postMessage({ type: "result", id, error: error.message || "L’opération a échoué." }); }
});
