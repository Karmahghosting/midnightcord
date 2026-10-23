/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TypingDraft } from "./controller";

export interface ComposerDraft extends TypingDraft { editor: HTMLElement; caret: Range; }
const editorIds = new WeakMap<HTMLElement, number>();
let nextEditorId = 0;

export function hasNativeAutocomplete(editor: HTMLElement) {
    if (editor.getAttribute("aria-expanded") === "true" || editor.getAttribute("aria-activedescendant")) return true;
    return Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"], [class*="autocomplete_"], [class*="autocompleteInner_"]'))
        .some(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden"
            && !element.closest('[aria-hidden="true"]'));
}

export function readComposer(identity: string): ComposerDraft | undefined {
    if (!identity || document.visibilityState === "hidden") return;
    const editor = document.activeElement?.closest<HTMLElement>('[data-slate-editor="true"][contenteditable="true"]');
    // Exclude search, profile fields, dialogs and unrelated contenteditables.
    if (!editor?.closest('[class*="channelTextArea_"]') || editor.closest('[role="dialog"]') || hasNativeAutocomplete(editor)) return;
    // Discord's INSERT_TEXT targets the last subscribed composer. Do not guess
    // which subscriber owns a draft when a thread/sidebar opens a second editor.
    const composers = Array.from(document.querySelectorAll<HTMLElement>('[data-slate-editor="true"][contenteditable="true"]'))
        .filter(element => element.closest('[class*="channelTextArea_"]') && element.getClientRects().length > 0
            && getComputedStyle(element).visibility !== "hidden" && !element.closest('[aria-hidden="true"]'));
    if (composers.length !== 1 || composers[0] !== editor) return;
    // Range.toString concatenates separate Slate blocks. Until multiline
    // insertion is supported, never predict from a lossy representation.
    if (editor.innerText.includes("\n") || editor.querySelector("br")) return;
    const selection = window.getSelection();
    if (!selection?.isCollapsed || selection.rangeCount !== 1 || !selection.anchorNode || !editor.contains(selection.anchorNode)) return;
    const caret = selection.getRangeAt(0).cloneRange();
    const after = document.createRange();
    after.selectNodeContents(editor);
    after.setStart(caret.endContainer, caret.endOffset);
    if (after.toString().replace(/[\u200b\ufeff]/g, "").length > 0) return;
    const before = document.createRange();
    before.selectNodeContents(editor);
    before.setEnd(caret.startContainer, caret.startOffset);
    const text = before.toString().replace(/[\u200b\ufeff]/g, "");
    if (!editorIds.has(editor)) editorIds.set(editor, ++nextEditorId);
    return { identity: `${identity}:${editorIds.get(editor)}`, text, editor, caret };
}

/** Paint outside Slate's DOM: React/Slate never receives a synthetic text node. */
export class SuggestionOverlay {
    private element?: HTMLDivElement;

    get visible() { return !!this.element && !this.element.hidden; }

    hide() { if (this.element) this.element.hidden = true; }
    destroy() { this.element?.remove(); this.element = undefined; }

    show(draft: ComposerDraft, text: string) {
        let rect = draft.caret.getBoundingClientRect();
        if (!rect.height) {
            const node = draft.caret.startContainer;
            if (node.nodeType !== Node.TEXT_NODE || !draft.caret.startOffset) { this.hide(); return; }
            const previous = draft.caret.cloneRange();
            previous.setStart(node, draft.caret.startOffset - 1);
            rect = previous.getBoundingClientRect();
        }
        const bounds = draft.editor.getBoundingClientRect();
        const left = rect.right;
        const available = Math.min(bounds.right, window.innerWidth - 12) - left;
        if (!rect.height || available < 32 || rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2) { this.hide(); return; }
        if (!this.element) {
            this.element = document.createElement("div");
            this.element.className = "mc-type-suggestion";
            this.element.setAttribute("aria-hidden", "true");
            document.body.appendChild(this.element);
        }
        const style = getComputedStyle(draft.editor);
        Object.assign(this.element.style, {
            left: `${left}px`, top: `${rect.top}px`, maxWidth: `${available}px`, height: `${rect.height}px`,
            fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing, lineHeight: `${rect.height}px`
        });
        this.element.textContent = text;
        this.element.hidden = false;
    }
}
