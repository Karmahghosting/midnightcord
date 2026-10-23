/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

// Domain-only adaptation of Vencord's AlwaysTrust:
// Original copyright (c) 2023 Vendicated and contributors, GPL-3.0-or-later.
// https://github.com/Vendicated/Vencord/blob/main/src/plugins/alwaysTrust/index.ts
export default definePlugin({
    name: "AlwaysTrust",
    description: "Ouvre les liens cliqués sans demander de confirmer la confiance dans le domaine.",
    tags: ["Utility"],
    authors: [Devs.zt, Devs.Trwy],
    enabledByDefault: false,
    patches: [{
        find: '="MaskedLinkStore",',
        replacement: {
            match: /(?<=isTrustedDomain\(\i\){)return \i\(\i\)/,
            replace: "return true"
        }
    }]
});
