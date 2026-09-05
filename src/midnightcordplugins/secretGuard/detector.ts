/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MAX_TEXT_LENGTH = 32_000;
export const MAX_MATCHES_PER_KIND = 20;

export type SecretKind = "discord" | "apiKey" | "privateKey" | "assignment" | "credentialUrl";
export interface SecretFinding {
    kind: SecretKind;
    count: number;
}
export interface ScanResult {
    findings: SecretFinding[];
    tooLong: boolean;
}

const DISCORD_TOKEN = /\b([A-Za-z0-9_-]{20,40})\.[A-Za-z0-9_-]{6,8}\.[A-Za-z0-9_-]{25,110}\b/g;
const MFA_TOKEN = /\bmfa\.[A-Za-z0-9_-]{60,110}\b/g;
const API_KEY = /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{40,255}|glpat-[A-Za-z0-9_-]{20,255}|npm_[A-Za-z0-9]{30,100}|hf_[A-Za-z0-9]{20,100}|gsk_[A-Za-z0-9]{30,255}|sk_(?:live|test)_[A-Za-z0-9]{16,200}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,255}|xox[baprs]-[A-Za-z0-9-]{20,200}|AIza[A-Za-z0-9_-]{30,50})\b/g;
const PRIVATE_KEY_HEADER = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\t \r\n]*/g;
const ASSIGNMENT = /\b(?:api[_-]?key|api[_-]?token|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|password|passwd|pwd|token|secret)["']?[ \t]{0,12}[=:][ \t]{0,12}["']?([^\s"'`;<>]{10,512})/gi;
const CREDENTIAL_URL = /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/([^\s/@:]{1,128}):([^\s/@]{8,256})@[^\s/?#]{1,253}/gi;
const PLACEHOLDER = /^(?:\$\{|\{\{|\$[A-Z_]|process\.env\.|os\.environ|env\.|getenv\(|<)|(?:your[_-]?(?:api[_-]?)?(?:key|token|secret|password)|placeholder|redacted|changeme|replace[_-]?me|example[_-]?(?:key|token|secret|password)|dummy[_-]?(?:key|token|secret|password))/i;
const REPEATED = /^(.)\1+$/;

function plausibleValue(value: string) {
    const trimmed = value.replace(/[,\]}]+$/, "");
    if (trimmed.length < 10 || PLACEHOLDER.test(trimmed) || REPEATED.test(trimmed) || /^[.*xX_#-]+$/.test(trimmed)) return false;
    return new Set(trimmed).size >= 6;
}

function discordUserSegment(value: string) {
    try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
        return /^\d{16,22}$/.test(atob(padded));
    } catch { return false; }
}

export function scanSecrets(text: string): ScanResult {
    if (typeof text !== "string") throw new TypeError("Invalid outgoing text");
    if (text.length > MAX_TEXT_LENGTH) return { findings: [], tooLong: true };
    const counts = new Map<SecretKind, number>();
    const add = (kind: SecretKind) => counts.set(kind, Math.min(MAX_MATCHES_PER_KIND, (counts.get(kind) ?? 0) + 1));
    const scan = (pattern: RegExp, kind: SecretKind, accept: (match: RegExpExecArray) => boolean) => {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            if (accept(match)) add(kind);
            if ((counts.get(kind) ?? 0) >= MAX_MATCHES_PER_KIND) break;
        }
        pattern.lastIndex = 0;
    };
    scan(DISCORD_TOKEN, "discord", match => discordUserSegment(match[1]) && plausibleValue(match[0]));
    scan(MFA_TOKEN, "discord", match => plausibleValue(match[0].slice(4)));
    scan(API_KEY, "apiKey", match => plausibleValue(match[0]));
    scan(PRIVATE_KEY_HEADER, "privateKey", match => {
        const body = text.slice(match.index + match[0].length, match.index + match[0].length + 1024);
        const firstBlock = /^[A-Za-z0-9+/=\r\n]+/.exec(body)?.[0].replace(/[\r\n]/g, "") ?? "";
        return firstBlock.length >= 32;
    });
    scan(ASSIGNMENT, "assignment", match => plausibleValue(match[1])
        && (match[1].length >= 20 || /[A-Za-z]/.test(match[1]) && /[\d+/=_!@#$%^&*()-]/.test(match[1]))
        && !/^(?:https?:\/\/|[a-z]+\(\))/.test(match[1]));
    scan(CREDENTIAL_URL, "credentialUrl", match => plausibleValue(match[2]));
    return { findings: [...counts].map(([kind, count]) => ({ kind, count })), tooLong: false };
}
