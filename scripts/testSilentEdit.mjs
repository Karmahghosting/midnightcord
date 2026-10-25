/* SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = join(root, "src/midnightcordplugins/silentEdit.tsx");
const source = await readFile(file, "utf8");
const bundled = await build({ stdin: {
    contents: source + "\nexport { triggerSilentEdit };", loader: "tsx", resolveDir: dirname(file), sourcefile: file
}, bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "discord-stubs", setup(builder) {
    builder.onResolve({ filter: /^@utils\/silentMessageAttachments$/ }, () => ({ path: join(root, "src/utils/silentMessageAttachments.ts") }));
    builder.onResolve({ filter: /^@|autoTranslateMidnightcord$/ }, args => ({ path: args.path, external: true }));
} }] });

function attachment(id, filename = "image.png", text = "image-data", extras = {}) {
    return { id, filename, url: `https://cdn.discordapp.com/attachments/channel/${id}/${filename}?ex=123&hm=signed`,
        size: Buffer.byteLength(text), content_type: "image/png", data: text, ...extras };
}

function fixture(attachments = []) {
    const message = { id: "original", channel_id: "channel", author: { id: "me" }, content: "original text", flags: 0, attachments };
    const state = { message, userId: "me", posts: [], deletes: [], toasts: [], uploads: [], events: [], nativeEdits: [], calls: [], refreshes: 0 };
    let plugin;
    const originalEdit = function (...args) { state.nativeEdits.push({ args, self: this }); return Promise.resolve({ native: true }); };
    const actions = {
        editMessage: originalEdit,
        startEditMessage(channelId, messageId) { plugin.flux.MESSAGE_START_EDIT({ channelId, messageId }); },
        endEditMessage(channelId, response) { state.closed = response; plugin.flux.MESSAGE_END_EDIT({ channelId }); }
    };
    class CloudUploader extends EventEmitter {
        constructor(item, channelId) { super(); this.item = item; this.channelId = channelId; this.filename = item.file.name; this.status = "UPLOADING"; state.uploads.push(this); }
        async upload() {
            state.events.push("upload:" + this.filename);
            this.bytes = new Uint8Array(await this.item.file.arrayBuffer());
            if (state.uploadHold) await state.uploadHold(this);
            if (state.uploadError) { this.emit("error", new Error("Upload rejected")); return; }
            if (state.uploadReject) throw new Error("Upload promise rejected");
            this.status = state.uploadStatus ?? "COMPLETED";
            if (!state.missingUploadFilename) this.uploadedFilename = "uploaded/" + state.uploads.indexOf(this) + "/" + this.filename;
            this.emit("complete");
        }
        cancel() { this.status = "CANCELLED"; this.emit("complete"); }
    }
    const settings = { deleteOriginalMessage: true, deleteDelay: 0, suppressNotifications: true };
    const common = {
        React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
        CloudUploader, UserStore: { getCurrentUser: () => ({ id: state.userId }) },
        MessageStore: { getMessage: (channel, id) => channel === message.channel_id && id === message.id && !state.missingOriginal ? message : undefined },
        ChannelStore: { getChannel: id => ({ id }) }, Menu: { MenuItem: "MenuItem" },
        Constants: { Endpoints: { MESSAGES: channel => `/channels/${channel}/messages`, MESSAGE: (channel, id) => `/channels/${channel}/messages/${id}` } },
        showToast: (text, type) => state.toasts.push({ text, type }), Toasts: { Type: { FAILURE: "failure" } },
        RestAPI: {
            async get() { state.refreshes++; return { body: { ...message, attachments: message.attachments.map(a => ({ ...a, url: a.url + "&renewed=1" })) } }; },
            async post(request) {
                state.events.push("post"); state.posts.push(request);
                await state.postHold?.();
                if (state.postError) throw new Error("Message rejected");
                const body = { id: state.echoOriginalId ? message.id : "replacement", channel_id: message.channel_id, author: { id: "me" },
                    attachments: request.body.attachments.map(a => ({ ...a, id: "new-" + a.id, size: state.uploads[Number(a.id)].item.file.size })) };
                if (state.dropAttachment) body.attachments.pop();
                if (state.corruptAttachment) body.attachments[0].size++;
                return { ok: true, status: 200, body };
            },
            async del(request) { state.events.push("delete"); state.deletes.push(request); return { ok: !state.deleteFailure, status: state.deleteFailure ? 403 : 204 }; }
        }
    };
    const dependencies = {
        "@api/ContextMenu": { findGroupChildrenByChildId: (_id, children) => children },
        "@api/MessagePopover": { addMessagePopoverButton: () => {}, removeMessagePopoverButton: () => {} },
        "@api/Settings": { definePluginSettings: () => ({ store: settings }) },
        "@components/Icons": { PencilIcon: () => null },
        "@utils/types": { __esModule: true, default: value => value, OptionType: { BOOLEAN: 1, NUMBER: 2 } },
        "@webpack": { findByPropsLazy: () => actions }, "@webpack/common": common,
        "@vencord/discord-types/enums": { CloudUploadPlatform: { WEB: 0 } },
        "./autoTranslateMidnightcord": { t: value => value }
    };
    const module = { exports: {} };
    vm.runInNewContext(bundled.outputFiles[0].text, {
        module, exports: module.exports, require: name => { assert(name in dependencies, name); return dependencies[name]; },
        console: { error: () => {}, warn: () => {} }, URL, Error, AbortController, Blob, File, setTimeout, clearTimeout,
        fetch: async (url, options) => {
            state.calls.push({ url, options }); state.events.push("download");
            assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error"); assert.equal(options.headers, undefined);
            if (state.downloadHold) await state.downloadHold();
            options.signal.throwIfAborted();
            if (state.downloadError || (state.expired && !url.includes("renewed=1"))) return { ok: false, status: state.downloadError ? 500 : 403 };
            const att = attachments.find(a => url.startsWith(a.url)); assert(att, url);
            return { ok: true, blob: async () => new Blob([state.truncated ? "x" : att.data], { type: att.content_type }) };
        }
    });
    plugin = module.exports.default;
    return { state, actions, originalEdit, settings, plugin, start: () => module.exports.triggerSilentEdit(message),
        save: (content = "new text") => actions.editMessage(message.channel_id, message.id, { content }) };
}

const turn = () => new Promise(resolve => setImmediate(resolve));

test("silent edit reuploads every file byte-for-byte, preserving names, spoiler, descriptions and reply before deletion", async () => {
    const input = [attachment("1", "photo.png", "PNG bytes", { description: "An image" }), attachment("2", "archive.zip", "ZIP bytes", { content_type: "application/zip", spoiler: true })];
    const f = fixture(input); f.state.message.messageReference = { channel_id: "channel", message_id: "reply", guild_id: "guild" };
    f.start(); const result = await f.save();
    assert.equal(result.body.id, "replacement"); assert.equal(f.state.posts.length, 1); assert.equal(f.state.deletes.length, 1);
    assert.equal(f.state.events.at(-1), "delete");
    assert.deepEqual(f.state.uploads.map(u => Buffer.from(u.bytes).toString()), ["PNG bytes", "ZIP bytes"]);
    assert(f.state.uploads.every(u => u.allowOptimization === false));
    const sent = f.state.posts[0].body;
    assert.deepEqual(Array.from(sent.attachments, a => a.filename), ["photo.png", "SPOILER_archive.zip"]);
    assert.deepEqual(Array.from(sent.attachments, a => a.id), ["0", "1"]);
    assert(sent.attachments.every(a => a.uploaded_filename.startsWith("uploaded/")));
    assert.equal(sent.attachments[0].description, "An image"); assert.equal(sent.attachments[1].is_spoiler, true);
    assert.equal(sent.message_reference.message_id, "reply"); assert.equal(sent.allowed_mentions.parse.length, 0); assert.equal(sent.allowed_mentions.replied_user, false);
    assert.equal(f.actions.editMessage, f.originalEdit); assert.equal(f.state.closed, result);
    assert.equal(input[1].filename, "archive.zip", "Source metadata was not mutated");
});

test("attachment-only edits keep an empty content string and every file", async () => {
    const f = fixture([attachment("1")]); f.start(); await f.save("");
    assert.equal(f.state.posts[0].body.content, ""); assert.equal(f.state.posts[0].body.attachments.length, 1); assert.equal(f.state.deletes.length, 1);
});

test("text-only edits avoid all CDN and upload work, and the keep-original setting is honored", async () => {
    const f = fixture(); f.settings.deleteOriginalMessage = false; f.start(); await f.save();
    assert.equal(f.state.calls.length, 0); assert.equal(f.state.uploads.length, 0); assert.equal(f.state.posts.length, 1); assert.equal(f.state.deletes.length, 0);
});

test("failed downloads, truncated files, upload errors and rejected upload promises never send or delete", async () => {
    for (const flag of ["downloadError", "truncated", "uploadError", "uploadReject", "missingUploadFilename"]) {
        const f = fixture([attachment("1")]); f.state[flag] = true; f.start();
        await assert.rejects(f.save(), undefined, flag);
        assert.equal(f.state.posts.length, 0, flag); assert.equal(f.state.deletes.length, 0, flag); assert.equal(f.state.toasts.length, 1, flag);
        assert.equal(f.actions.editMessage, f.originalEdit);
    }
});

test("Discord send failure or incomplete confirmation always preserves the original", async () => {
    for (const flag of ["postError", "dropAttachment", "corruptAttachment", "echoOriginalId"]) {
        const f = fixture([attachment("1")]); f.state[flag] = true; f.start(); await assert.rejects(f.save());
        assert.equal(f.state.deletes.length, 0, flag); assert.equal(f.state.toasts.length, 1, flag);
    }
});

test("signed CDN URLs are retained and refreshed once if expired", async () => {
    const f = fixture([attachment("1")]); f.state.expired = true; f.start(); await f.save();
    assert.equal(f.state.refreshes, 2, "One URL refresh and one server-side original check"); assert.equal(f.state.calls.length, 2);
    assert(f.state.calls.every(call => call.url.includes("hm=signed"))); assert(f.state.calls[1].url.includes("renewed=1"));
    assert.equal(f.state.deletes.length, 1);
});

test("non-CDN attachment URLs are rejected without making a network request", async () => {
    const f = fixture([attachment("1", "x.png", "data", { url: "https://example.com/private" })]); f.start(); await assert.rejects(f.save());
    assert.equal(f.state.calls.length, 0); assert.equal(f.state.posts.length, 0); assert.equal(f.state.deletes.length, 0);
});

test("unrelated edits delegate without consuming the selected silent edit, and duplicates share one operation", async () => {
    const f = fixture([attachment("1")]); let release;
    f.state.uploadHold = () => new Promise(resolve => { release = resolve; }); f.start();
    const wrapper = f.actions.editMessage;
    await wrapper.call({ marker: true }, "another-channel", "original", { content: "ordinary" });
    assert.equal(f.state.nativeEdits.length, 1); assert.equal(f.actions.editMessage, wrapper);
    const first = f.save(); const second = f.save(); assert.equal(first, second);
    await turn(); release(); await first;
    assert.equal(f.state.posts.length, 1); assert.equal(f.state.deletes.length, 1);
});

test("cancelling, switching editors/channels or stopping restores the native edit action", async () => {
    for (const cancel of [f => f.plugin.flux.MESSAGE_END_EDIT({ channelId: "channel" }), f => f.plugin.flux.MESSAGE_START_EDIT({ channelId: "channel", messageId: "other" }),
        f => f.plugin.flux.CHANNEL_SELECT({ channelId: "other" }), f => f.plugin.stop()]) {
        const f = fixture(); f.start(); cancel(f); assert.equal(f.actions.editMessage, f.originalEdit);
        await f.save(); assert.equal(f.state.nativeEdits.length, 1); assert.equal(f.state.posts.length, 0);
    }
});

test("stop during upload ignores the uploader's misleading completion event and keeps the original", async () => {
    const f = fixture([attachment("1")]); let release; f.state.uploadHold = () => new Promise(resolve => { release = resolve; });
    f.start(); const saving = f.save(); const rejection = assert.rejects(saving); await turn(); f.plugin.stop(); release(); await rejection;
    assert.equal(f.state.posts.length, 0); assert.equal(f.state.deletes.length, 0); assert.equal(f.actions.editMessage, f.originalEdit);
});

test("account changes during upload or message changes during send prevent original deletion", async () => {
    const before = fixture([attachment("1")]); before.state.uploadHold = async () => { before.state.userId = "other"; };
    before.start(); await assert.rejects(before.save()); assert.equal(before.state.posts.length, 0); assert.equal(before.state.deletes.length, 0);
    const after = fixture([attachment("1")]); after.state.postHold = async () => { after.state.message.content = "a newer edit"; };
    after.start(); await assert.rejects(after.save()); assert.equal(after.state.posts.length, 1); assert.equal(after.state.deletes.length, 0);
    const switched = fixture([attachment("1")]); switched.state.postHold = async () => { switched.state.userId = "other"; };
    switched.start(); await assert.rejects(switched.save()); assert.equal(switched.state.deletes.length, 0);
});

test("native attachment removal before save is respected by reading the current message", async () => {
    const f = fixture([attachment("1"), attachment("2", "second.png")]); f.start(); f.state.message.attachments = [f.state.message.attachments[1]];
    await f.save(); assert.equal(f.state.posts[0].body.attachments.length, 1); assert.equal(f.state.posts[0].body.attachments[0].filename, "second.png");
});

test("a failed delete is reported and no successful editor close is fabricated", async () => {
    const f = fixture(); f.state.deleteFailure = true; f.start(); await assert.rejects(f.save());
    assert.equal(f.state.posts.length, 1); assert.equal(f.state.toasts.length, 1); assert.equal(f.state.closed, undefined);
});

test("spoiler attachment flags remain hidden even when the original filename has no prefix", async () => {
    const f = fixture([attachment("1", "hidden.png", "private image", { flags: 8 })]); f.start(); await f.save();
    assert.equal(f.state.uploads[0].spoiler, true); assert.equal(f.state.posts[0].body.attachments[0].filename, "SPOILER_hidden.png");
    assert.equal(f.state.posts[0].body.attachments[0].is_spoiler, true);
});

test("cancelled or removed native uploads cannot masquerade as successful completion", async () => {
    for (const status of ["CANCELED", "CANCELLED", "REMOVED_FROM_MSG_DRAFT", "ERROR"]) {
        const f = fixture([attachment("1")]); f.state.uploadStatus = status; f.start(); await assert.rejects(f.save());
        assert.equal(f.state.posts.length, 0, status); assert.equal(f.state.deletes.length, 0, status);
    }
});

test("Gateway nonce reconciliation may replace the local original before POST resolves without blocking safe deletion", async () => {
    const f = fixture([attachment("1")]); f.state.postHold = async () => { f.state.missingOriginal = true; };
    f.start(); await f.save();
    assert.equal(f.state.posts.length, 1); assert.equal(f.state.refreshes, 1); assert.equal(f.state.deletes.length, 1);
    assert.equal(f.state.toasts.length, 0);
});

test("fire-and-forget Discord callers get a visible error without an unhandled rejection", async () => {
    const f = fixture([attachment("1")]); f.state.uploadError = true; f.start();
    const saving = f.save();
    await turn(); await turn();
    assert.equal(f.state.toasts.length, 1); assert.equal(f.state.deletes.length, 0);
    await assert.rejects(saving, /Upload rejected/, "The returned promise must still report failure to awaiters");
});
