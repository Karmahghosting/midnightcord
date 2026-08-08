/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * forceServerListRerender
 *
 * After calling addServerListElement / removeServerListElement the guild-list
 * component won't repaint by itself because React doesn't know the underlying
 * Set changed.  This helper walks up the React fiber tree from the guild-list
 * DOM node and calls forceUpdate() on the first class-component ancestor it
 * finds, OR triggers a re-render on function-component ancestors by dispatching
 * a harmless state update through their hook queue.
 *
 * Falls back silently if anything goes wrong so it never breaks plugin load.
 */
export function forceServerListRerender(): void {
    // Small timeout so the Set mutation has already settled before we paint.
    setTimeout(() => {
        try {
            // Discord renders the guild/server list inside an element whose
            // data-list-id attribute is "guildsnav".  Fall back to a class
            // name query if the attribute isn't present (Discord update-safe).
            const el: Element | null =
                document.querySelector("[data-list-id=\"guildsnav\"]") ??
                document.querySelector("[class*=\"guilds_\"]");

            if (!el) return;

            // Grab the React internal fiber attached to the DOM node.
            const fiberKey = Object.keys(el).find(
                k => k.startsWith("__reactFiber") ||
                    k.startsWith("__reactInternalInstance")
            );
            if (!fiberKey) return;

            let node: any = (el as any)[fiberKey];

            while (node) {
                // Class component → use forceUpdate()
                if (node.stateNode?.forceUpdate) {
                    node.stateNode.forceUpdate();
                    return;
                }

                // Function component with useState/useReducer → dispatch a
                // no-op action through the first hook queue we find.
                const hooks = node.memoizedState;
                if (hooks?.queue?.dispatch) {
                    // dispatch(undefined) is a no-op for reducers but triggers
                    // a re-render pass for the function component.
                    hooks.queue.dispatch(undefined);
                    return;
                }

                node = node.return;
            }
        } catch {
            // Never surface errors — the guild list will pick up changes on its
            // next natural re-render anyway.
        }
    }, 0);
}
