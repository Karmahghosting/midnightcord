import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

const bundled = await build({
    entryPoints: ["src/midnightcordplugins/quietHours/quietHours.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    write: false
});
const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
const quietHours = await import(`data:text/javascript;base64,${source}`);

test("quiet hours handle ordinary and overnight local schedules at their boundaries", () => {
    const localTime = (hour, minute = 0) => new Date(2026, 8, 24, hour, minute);

    assert.equal(quietHours.isWithinQuietHours(localTime(22), "22:00", "08:00"), true);
    assert.equal(quietHours.isWithinQuietHours(localTime(3, 15), "22:00", "08:00"), true);
    assert.equal(quietHours.isWithinQuietHours(localTime(8), "22:00", "08:00"), false);
    assert.equal(quietHours.isWithinQuietHours(localTime(14), "22:00", "08:00"), false);

    assert.equal(quietHours.isWithinQuietHours(localTime(9), "09:00", "17:00"), true);
    assert.equal(quietHours.isWithinQuietHours(localTime(16, 59), "09:00", "17:00"), true);
    assert.equal(quietHours.isWithinQuietHours(localTime(17), "09:00", "17:00"), false);
    assert.equal(quietHours.isWithinQuietHours(localTime(12), "09:00", "09:00"), false);
});

test("clock values and VIP lists reject malformed entries", () => {
    assert.equal(quietHours.parseClock("23:59"), 1439);
    assert.equal(quietHours.parseClock("24:00"), null);
    assert.equal(quietHours.parseClock("8:00"), null);
    assert.deepEqual(
        [...quietHours.parseVipUserIds("12345678901234567, not-an-id; 98765432109876543210")],
        ["12345678901234567", "98765432109876543210"]
    );
});
