/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findCssClassesLazy } from "@webpack";

const cssClasses = findCssClassesLazy("iconForeground", "accountPopoutButtonWrapper");

export default definePlugin({
    name: "UserAreaAPI",
    description: "API to add buttons to the user area panel.",
    authors: [Devs.prism],

    patches: [
        {
            // Inject directly into the native buttons container (rv in minified code)
            // This ensures our custom buttons share the exact same spacing and flex layout
            // as the Microphone, Deafen, and Settings buttons, preventing wrapping bugs.
            find: "shouldShowSpeakingWhileMutedTooltip",
            replacement: [
                {
                    match: /(children:\[)(?=\(0,\i\.jsx\)\(\i\.\i,\{targetElementRef:\i,renderPopout:)/,
                    replace: "$1...$self.renderButtons(arguments[0]),"
                }
            ]
        }
    ],

    renderButtons(props: { nameplate?: any; }) {
        return Vencord.Api?.UserArea?._renderButtons?.({
            nameplate: props?.nameplate,
            iconForeground: props?.nameplate != null ? cssClasses?.iconForeground : void 0,
            hideTooltips: false
        }) ?? [];
    }
});
