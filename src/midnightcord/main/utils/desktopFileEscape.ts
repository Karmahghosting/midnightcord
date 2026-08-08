/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// https://specifications.freedesktop.org/desktop-entry-spec/latest/exec-variables.html

// "If an argument contains a reserved character the argument must be quoted."
const desktopFileReservedChars = new Set([
    " ",
    "\t",
    "\n",
    '"',
    "'",
    "\\",
    ">",
    "<",
    "~",
    "|",
    "&",
    ";",
    "$",
    "*",
    "?",
    "#",
    "(",
    ")",
    "`"
]);

export function escapeDesktopFileArgument(arg: string) {
    let needsQuoting = false;
    let out = "";

    for (const c of arg) {
        if (desktopFileReservedChars.has(c)) {
            // "Quoting must be done by enclosing the argument between double quotes"
            needsQuoting = true;
            // "and escaping the double quote character, backtick character ("`"), dollar sign ("$")
            // and backslash character ("\") by preceding it with an additional backslash character"
            if (c === '"' || c === "`" || c === "$" || c === "\\") {
                out += "\\";
            }
        }

        // "Literal percentage characters must be escaped as %%"
        if (c === "%") {
            out += "%%";
        } else {
            out += c;
        }
    }

    return needsQuoting ? `"${out}"` : out;
}
