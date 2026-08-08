/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NativeSettings } from "@main/settings";
import { session } from "electron";

type PolicyMap = Record<string, string[]>;

export const ConnectSrc = ["connect-src"];
export const ImageSrc = [...ConnectSrc, "img-src"];
export const CssSrc = ["style-src", "font-src"];
export const ImageAndCssSrc = [...ImageSrc, ...CssSrc];
export const ImageScriptsAndCssSrc = [...ImageAndCssSrc, "script-src", "worker-src"];
export const CSPSrc = ["style-src", "connect-src", "img-src", "frame-src", "font-src", "media-src", "worker-src"];

export const CspPolicies: PolicyMap = {
    "http://localhost:*": ImageAndCssSrc,
    "http://127.0.0.1:*": ImageAndCssSrc,
    "localhost:*": ImageAndCssSrc,
    "127.0.0.1:*": ImageAndCssSrc,

    "*.github.io": ImageAndCssSrc,
    "github.com": ImageAndCssSrc,
    "raw.githubusercontent.com": ImageAndCssSrc,
    "*.raw.githubusercontent.com": ImageAndCssSrc,
    "github-production-user-asset-6210df.s3.amazonaws.com": CSPSrc,
    "*.gitlab.io": ImageAndCssSrc,
    "gitlab.com": ImageAndCssSrc,
    "*.codeberg.page": ImageAndCssSrc,
    "codeberg.org": ImageAndCssSrc,

    "*.githack.com": ImageAndCssSrc,
    "jsdelivr.net": ImageAndCssSrc,

    "fonts.googleapis.com": CssSrc,

    "i.imgur.com": ImageSrc,
    "i.ibb.co": ImageSrc,
    "i.pinimg.com": ImageSrc,
    "*.tenor.com": ImageSrc,
    "files.catbox.moe": ImageAndCssSrc,

    "cdn.discordapp.com": ImageAndCssSrc,
    "media.discordapp.net": ImageSrc,

    "cdnjs.cloudflare.com": ImageScriptsAndCssSrc,
    "cdn.jsdelivr.net": ImageScriptsAndCssSrc,

    "api.groq.com": ConnectSrc,
    "*.speech.googleapis.com": ConnectSrc,
    "speech.googleapis.com": ConnectSrc,
    "www.google.com": ConnectSrc,
    "*.google.com": ConnectSrc,

    "api.github.com": ConnectSrc,
    "ws.audioscrobbler.com": ConnectSrc,
    "translate-pa.googleapis.com": ConnectSrc,
    "*.vencord.dev": ImageSrc,
    "manti.vendicated.dev": ImageSrc,
    "decor.fieryflames.dev": ConnectSrc,
    "ugc.decor.fieryflames.dev": ImageSrc,
    "sponsor.ajay.app": ConnectSrc,
    "dearrow-thumb.ajay.app": ImageSrc,
    "usrbg.is-hardly.online": ImageSrc,
    "icons.duckduckgo.com": ImageSrc,

    "*.sndcdn.com": CSPSrc,
    "soundcloud.com": CSPSrc,
    "*.soundcloud.com": CSPSrc,

    // hCaptcha (Discord captcha system)
    "hcaptcha.com": ImageScriptsAndCssSrc,
    "*.hcaptcha.com": ImageScriptsAndCssSrc,
    "newassets.hcaptcha.com": ImageScriptsAndCssSrc,
    "imgs.hcaptcha.com": ImageScriptsAndCssSrc,
    "api2.hcaptcha.com": ImageScriptsAndCssSrc,

    // Cloudflare Turnstile / cdn-cgi captcha
    "challenges.cloudflare.com": ImageScriptsAndCssSrc,
    "*.cloudflare.com": ImageScriptsAndCssSrc,
};

const findHeader = (headers: PolicyMap, headerName: Lowercase<string>) => {
    return Object.keys(headers).find(h => h.toLowerCase() === headerName);
};

const parsePolicy = (policy: string): PolicyMap => {
    const result: PolicyMap = {};
    policy.split(";").forEach(directive => {
        const [directiveKey, ...directiveValue] = directive.trim().split(/\s+/g);
        if (directiveKey && !Object.prototype.hasOwnProperty.call(result, directiveKey)) {
            result[directiveKey] = directiveValue;
        }
    });

    return result;
};

const stringifyPolicy = (policy: PolicyMap): string =>
    Object.entries(policy)
        .filter(([, values]) => values?.length)
        .map(directive => directive.flat().join(" "))
        .join("; ");

const patchCsp = (headers: PolicyMap) => {
    const reportOnlyHeader = findHeader(headers, "content-security-policy-report-only");
    if (reportOnlyHeader)
        delete headers[reportOnlyHeader];

    const permissionsPolicyHeader = findHeader(headers, "permissions-policy");
    if (permissionsPolicyHeader) delete headers[permissionsPolicyHeader];

    const permissionsPolicyReportOnlyHeader = findHeader(headers, "permissions-policy-report-only");
    if (permissionsPolicyReportOnlyHeader) delete headers[permissionsPolicyReportOnlyHeader];

    const featurePolicyHeader = findHeader(headers, "feature-policy");
    if (featurePolicyHeader) delete headers[featurePolicyHeader];

    const featurePolicyReportOnlyHeader = findHeader(headers, "feature-policy-report-only");
    if (featurePolicyReportOnlyHeader) delete headers[featurePolicyReportOnlyHeader];

    const header = findHeader(headers, "content-security-policy");

    if (header) {
        const csp = parsePolicy(headers[header][0]);

        const pushDirective = (directive: string, ...values: string[]) => {
            csp[directive] ??= [...(csp["default-src"] ?? [])];
            csp[directive].push(...values);
        };

        pushDirective("style-src", "'unsafe-inline'");
        pushDirective("script-src", "'unsafe-inline'", "'unsafe-eval'");

        for (const directive of ["style-src", "connect-src", "img-src", "font-src", "media-src", "worker-src"]) {
            pushDirective(directive, "blob:", "data:", "vencord:", "vesktop:", "equicord:", "equibop:", "https://*.githubusercontent.com", "https://*.amazonaws.com");
        }

        for (const [host, directives] of Object.entries(NativeSettings.store.customCspRules)) {
            for (const directive of directives) {
                pushDirective(directive, host);
            }
        }

        for (const [host, directives] of Object.entries(CspPolicies)) {
            for (const directive of directives) {
                pushDirective(directive, host);
            }
        }

        headers[header] = [stringifyPolicy(csp)];
    }
};

export function initCsp() {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        const responseHeaders = details.responseHeaders || {};
        try {
            const url = (details.url || "").toLowerCase();
            const { resourceType } = details;
            const isSubFrame = resourceType === "subFrame";
            const isYouTube = url.includes("youtube.com") || url.includes("googlevideo.com") || url.includes("youtube-nocookie.com");
            const isTikTok = url.includes("tiktok.com") || url.includes("tiktokcdn.com");

            if (isSubFrame) {
                const cookieHeader = findHeader(responseHeaders, "set-cookie");
                if (cookieHeader && Array.isArray(responseHeaders[cookieHeader])) {
                    responseHeaders[cookieHeader] = responseHeaders[cookieHeader].map((cookie: string) => {
                        let newCookie = cookie.replace(/; SameSite=(Lax|Strict)/gi, "");
                        if (!newCookie.toLowerCase().includes("samesite=none")) {
                            newCookie += "; SameSite=None";
                        }
                        if (!newCookie.toLowerCase().includes("secure")) {
                            newCookie += "; Secure";
                        }
                        return newCookie;
                    });
                }

                const cspHeader = findHeader(responseHeaders, "content-security-policy");
                if (cspHeader) delete responseHeaders[cspHeader];

                if (!isYouTube && !isTikTok) {
                    const privateBrowserSettings = NativeSettings?.store?.plugins?.PrivateBrowser;
                    const saveData = privateBrowserSettings?.saveData ?? false;
                    if (!saveData) {
                        const setCookieHeader = findHeader(responseHeaders, "set-cookie");
                        if (setCookieHeader) delete responseHeaders[setCookieHeader];
                    }
                }
            }

            if (resourceType === "mainFrame") {
                patchCsp(responseHeaders);
            } else if (isSubFrame) {
                patchCsp(responseHeaders);
            }

            if (resourceType === "stylesheet") {
                const header = findHeader(responseHeaders, "content-type");
                if (header) responseHeaders[header] = ["text/css"];
            }

            const xFrameOptions = findHeader(responseHeaders, "x-frame-options");
            if (xFrameOptions) delete responseHeaders[xFrameOptions];

            const permissionsPolicyHeader = findHeader(responseHeaders, "permissions-policy");
            if (permissionsPolicyHeader) delete responseHeaders[permissionsPolicyHeader];

            const featurePolicyHeader = findHeader(responseHeaders, "feature-policy");
            if (featurePolicyHeader) delete responseHeaders[featurePolicyHeader];

        } catch (e) {
            console.error(e);
        } finally {
            cb({ cancel: false, responseHeaders });
        }
    });
}
