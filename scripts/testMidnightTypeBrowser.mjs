/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const executablePath = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
].find(path => path && existsSync(path));
assert(executablePath, "Chrome/Edge/Chromium missing. Set CHROME_PATH to its executable.");
const { outputFiles } = await build({
    entryPoints: [join(root, "src/midnightcordplugins/midnightType/composer.ts")],
    bundle: true, format: "iife", globalName: "ComposerTest", platform: "browser", write: false
});
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"] });
try {
    const page = await browser.newPage();
    const network = [];
    await page.setRequestInterception(true);
    page.on("request", request => { network.push(request.url()); void request.abort(); });
    await page.setViewport({ width: 1000, height: 500 });
    await page.setContent(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>MidnightType composer fixture</title>
      <style>body{background:#202024;color:#f5f5f7;font:16px Arial;padding:50px;--text-muted:#a8a8b4}
      .channelTextArea_fixture{margin:15px 0;padding:16px;background:#303036;border-radius:8px}
      [contenteditable]{outline:none;min-height:24px;line-height:24px;white-space:pre-wrap}</style>
      <p>MidnightType · composer test fixture</p>
      <div class="channelTextArea_fixture"><div id="editor" data-slate-editor="true" contenteditable="true"><span data-slate-string="true">Je te souhaite une</span></div></div>
      <div id="other" contenteditable="true" data-slate-editor="true">Search field</div>
      <div id="popup" role="listbox" style="display:none">Native completion</div>
      <button id="outside">Outside chat</button></html>`);
    await page.addStyleTag({ content: await readFile(join(root, "src/midnightcordplugins/midnightType/style.css"), "utf8") });
    await page.addScriptTag({ content: outputFiles[0].text });
    const results = await page.evaluate(() => {
        const { readComposer, SuggestionOverlay } = globalThis.ComposerTest;
        const editor = document.getElementById("editor"), popup = document.getElementById("popup");
        const results = [];
        const check = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
        const select = (element, offset, end = offset) => {
            element.focus();
            const text = element.querySelector("span")?.firstChild || element.firstChild;
            const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, end);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        };
        const end = () => select(editor, editor.textContent.length);
        end();
        const draft = readComposer("account:channel");
        check(draft?.text === "Je te souhaite une", "reads only the current chat draft");
        check(readComposer("other:channel").identity !== draft.identity, "account changes produce distinct identities");
        const snapshot = editor.innerHTML;
        const overlay = new SuggestionOverlay(); overlay.show(draft, " bonne journée !");
        const ghost = document.querySelector(".mc-type-suggestion");
        check(overlay.visible && ghost.textContent === " bonne journée !", "draws ghost suggestion");
        check(editor.innerHTML === snapshot && !editor.contains(ghost), "never mutates Slate DOM");
        check(ghost.getAttribute("aria-hidden") === "true" && getComputedStyle(ghost).pointerEvents === "none", "ghost does not steal input or screen reader focus");
        const bounds = ghost.getBoundingClientRect();
        check(bounds.left >= editor.getBoundingClientRect().left && bounds.right <= editor.getBoundingClientRect().right + 1, "ghost remains inside composer width");
        select(editor, 3); check(!readComposer("account:channel"), "does not predict mid-message");
        select(editor, 0, 5); check(!readComposer("account:channel"), "does not predict over a selection");
        select(document.getElementById("other"), 12); check(!readComposer("account:channel"), "ignores unrelated contenteditables");
        end(); editor.closest("div.channelTextArea_fixture").setAttribute("role", "dialog");
        check(!readComposer("account:channel"), "ignores modal composers");
        editor.parentElement.removeAttribute("role");
        popup.style.display = "block"; check(!readComposer("account:channel"), "native autocomplete has priority");
        popup.style.display = "none";
        editor.setAttribute("aria-expanded", "true"); check(!readComposer("account:channel"), "ARIA autocomplete has priority");
        editor.removeAttribute("aria-expanded");
        editor.setAttribute("aria-activedescendant", "native-option"); check(!readComposer("account:channel"), "active native option has priority");
        editor.removeAttribute("aria-activedescendant");
        popup.style.display = "block"; popup.setAttribute("aria-hidden", "true");
        check(!!readComposer("account:channel"), "hidden native popup does not block typing");
        popup.style.display = "none";
        const sidebar = editor.parentElement.cloneNode(true);
        document.body.appendChild(sidebar);
        check(!readComposer("account:channel"), "suspends when another chat composer could receive INSERT_TEXT");
        sidebar.remove();
        check(!!readComposer("account:channel"), "resumes after the second composer closes");
        editor.innerHTML = '<div data-slate-node="element"><span>Je te souhaite une</span></div><div data-slate-node="element"><span>bonne journée</span></div>';
        check(!readComposer("account:channel"), "does not concatenate multiline Slate paragraphs");
        editor.innerHTML = '<span>Je te souhaite une<br>bonne journée</span>';
        check(!readComposer("account:channel"), "does not concatenate soft line breaks");
        editor.innerHTML = snapshot; end();
        const oldWidth = editor.style.width;
        editor.style.width = `${readComposer("account:channel").caret.getBoundingClientRect().right - editor.getBoundingClientRect().left + 8}px`;
        overlay.show(readComposer("account:channel"), " bonne journée !");
        check(!overlay.visible, "hides clipped suggestion so Tab can keep native behavior");
        editor.style.width = oldWidth;
        end(); overlay.show(readComposer("account:channel"), " bonne journée !");
        overlay.hide(); check(!overlay.visible, "dismiss hides overlay");
        overlay.destroy(); check(!document.querySelector(".mc-type-suggestion"), "disable removes overlay");
        document.getElementById("outside").focus(); check(!readComposer("account:channel"), "blur cancels composer context");
        return results;
    });
    assert.equal(network.length, 0, "Composer must not make network requests");
    for (const result of results) console.log(`PASS ${result}`);
    console.log(`${results.length} browser composer checks passed; local fixture only, not live Discord.`);
} finally { await browser.close(); }
