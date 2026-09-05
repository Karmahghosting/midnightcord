/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isNameTaken, planRestore, profileName, readProfiles, readSnapshot, type RestoreEnvironment } from "./profiles";

const environment: RestoreEnvironment = {
    inputDevices: [{ id: "mic-now", name: "USB microphone" }],
    outputDevices: [{ id: "headset", name: "Headset" }],
    supported: { inputDevice: true, outputDevice: true, inputVolume: true, outputVolume: true, noiseSuppression: true }
};

test("disconnected microphone is skipped without changing available output and volumes", () => {
    assert.deepEqual(planRestore({ inputDevice: { id: "old", name: "USB microphone" }, outputDevice: { id: "headset", name: "Headset" }, inputVolume: 65, outputVolume: 120 }, environment), {
        apply: ["outputDevice", "inputVolume", "outputVolume"],
        skipped: [{ field: "inputDevice", reason: "unavailable-device" }]
    });
});

test("disabled devices are not selected and duplicate display names are not fallback IDs", () => {
    const audio = { inputDevice: { id: "mic-now", name: "USB microphone" } };
    const result = planRestore(audio, { ...environment, inputDevices: [{ id: "mic-now", name: "USB microphone", disabled: true }, { id: "another", name: "USB microphone" }] });
    assert.equal(result.apply.length, 0);
    assert.equal(result.skipped[0].reason, "unavailable-device");
});

test("unsupported noise cancellation is skipped, false and zero values are restored", () => {
    assert.deepEqual(planRestore({ inputVolume: 0, noiseCancellation: true, noiseSuppression: false }, environment), {
        apply: ["inputVolume", "noiseSuppression"],
        skipped: [{ field: "noiseCancellation", reason: "unsupported" }]
    });
});

test("malformed snapshots and out of range volumes cannot be restored", () => {
    for (const audio of [{}, { inputVolume: NaN }, { outputVolume: Infinity }, { inputVolume: 101 }, { outputVolume: 201 }, { inputVolume: -1 }, { noiseSuppression: "false" }, { inputDevice: { id: "" } }]) {
        assert.equal(readSnapshot(audio), null);
    }
    assert.deepEqual(readSnapshot({ inputVolume: 0, outputVolume: 200, noiseSuppression: false, token: "ignored" }), { inputVolume: 0, outputVolume: 200, noiseSuppression: false });
});

test("profile names are validated and corrupt or duplicate saved entries are discarded", () => {
    const profile = { id: "one", name: " Jeu ", updatedAt: 123, audio: { inputVolume: 50 } };
    const profiles = readProfiles([null, profile, profile, { ...profile, id: "two", name: "jeu" }, { ...profile, id: "three", name: "\n", audio: {} }]);
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].name, "Jeu");
    assert.equal(isNameTaken(profiles, "JEU"), true);
    assert.equal(isNameTaken(profiles, "Jeu", "one"), false);
    assert.equal(profileName(" Réunion "), "Réunion");
    assert.throws(() => profileName(" "));
    assert.throws(() => profileName("a".repeat(61)));
    assert.throws(() => profileName("a\u0000b"));
});
