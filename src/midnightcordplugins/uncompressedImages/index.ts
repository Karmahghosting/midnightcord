/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

const urlCache = new Map<string, string>();
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "av1", "mkv", "avi", "wmv", "m4v"]);

function isVideoExtension(url: string): boolean {
    try {
        const u = new URL(url, location.href);
        const filename = u.pathname.split("/").pop()?.toLowerCase() ?? "";
        const ext = filename.split(".").pop() ?? "";
        return VIDEO_EXTENSIONS.has(ext);
    } catch {
        return false;
    }
}

function transformUrl(raw: string): string {
    if (!raw || typeof raw !== "string") return raw;
    if (!raw.includes("media.discordapp.net") && !raw.includes("/attachments/")) return raw;
    if (isVideoExtension(raw)) {
        urlCache.set(raw, "__VIDEO__");
        return raw;
    }

    try {
        const u = new URL(raw, location.href);
        if (u.hostname === "media.discordapp.net" && u.pathname.startsWith("/attachments/")) {
            u.hostname = "cdn.discordapp.com";
            u.searchParams.delete("format");
            return u.toString();
        }
    } catch {
        if (raw.includes("media.discordapp.net/attachments/")) {
            let s = raw.replace("media.discordapp.net", "cdn.discordapp.com");
            s = s.replace(/[?&]format=webp/gi, "");
            s = s.replace("?&", "?").replace("&&", "&");
            s = s.replace(/[?&]$/, "");
            return s;
        }
    }
    return raw;
}

function transformSrcset(srcset: string): string {
    if (!srcset || typeof srcset !== "string") return srcset;
    if (isVideoExtension(srcset) || urlCache.get(srcset) === "__VIDEO__") return srcset;

    return srcset.split(",").map(part => {
        const trimmed = part.trim();
        if (!trimmed) return trimmed;
        const spaceIndex = trimmed.search(/\s/);
        if (spaceIndex === -1) return transformUrl(trimmed);
        const urlPart = trimmed.slice(0, spaceIndex);
        const rest = trimmed.slice(spaceIndex);
        if (isVideoExtension(urlPart) || urlCache.get(urlPart) === "__VIDEO__") return trimmed;
        return transformUrl(urlPart) + rest;
    }).join(", ");
}

let origSrcDesc: PropertyDescriptor | undefined;
let origSrcsetDesc: PropertyDescriptor | undefined;
let origSetAttribute: typeof Element.prototype.setAttribute;
let origGetAttribute: typeof Element.prototype.getAttribute;

export default definePlugin({
    name: "UncompressedImages",
    description: "Hijacks client media caching to load full lossless images directly from CDN instead of compressed low-res thumbnails.",
    authors: [{ name: "Knew", id: 332116671294734336n }],
    enabledByDefault: true,

    start() {
        const imgProto = HTMLImageElement.prototype;
        origSrcDesc = Object.getOwnPropertyDescriptor(imgProto, "src");
        origSrcsetDesc = Object.getOwnPropertyDescriptor(imgProto, "srcset");
        origSetAttribute = Element.prototype.setAttribute;
        origGetAttribute = Element.prototype.getAttribute;

        function setAttributeWrapper(this: Element, name: string, value: any) {
            try {
                const lower = String(name).toLowerCase();
                if (lower === "src" && this instanceof HTMLImageElement) {
                    const s = String(value);
                    if (isVideoExtension(s) || urlCache.get(s) === "__VIDEO__") {
                        return origSetAttribute.call(this, name, value);
                    }
                    const transformed = urlCache.has(s) ? urlCache.get(s)! : transformUrl(s);
                    urlCache.set(s, transformed);
                    if (transformed !== s) {
                        return origSetAttribute.call(this, "src", transformed);
                    }
                }
                if (lower === "srcset" && this instanceof HTMLImageElement) {
                    const s = String(value);
                    if (isVideoExtension(s) || urlCache.get(s) === "__VIDEO__") {
                        return origSetAttribute.call(this, name, value);
                    }
                    const transformed = transformSrcset(s);
                    if (transformed !== s) {
                        return origSetAttribute.call(this, "srcset", transformed);
                    }
                }
            } catch {}
            return origSetAttribute.call(this, name, value);
        }

        function getAttributeWrapper(this: Element, name: string) {
            try {
                const lower = String(name).toLowerCase();
                if (lower === "src" && this instanceof HTMLImageElement) {
                    const val = origGetAttribute.call(this, "src") || "";
                    if (isVideoExtension(val) || urlCache.get(val) === "__VIDEO__") return val;
                    return urlCache.get(val) || transformUrl(val);
                }
                if (lower === "srcset" && this instanceof HTMLImageElement) {
                    const val = origGetAttribute.call(this, "srcset") || "";
                    if (isVideoExtension(val) || urlCache.get(val) === "__VIDEO__") return val;
                    return transformSrcset(val);
                }
            } catch {}
            return origGetAttribute.call(this, name);
        }

        Element.prototype.setAttribute = setAttributeWrapper;
        Element.prototype.getAttribute = getAttributeWrapper;

        if (origSrcDesc && typeof origSrcDesc.set === "function") {
            Object.defineProperty(imgProto, "src", {
                configurable: true,
                enumerable: true,
                get() {
                    if (this.dataset && this.dataset.knewestUncompressedImagesCdn) {
                        return this.dataset.knewestUncompressedImagesCdn;
                    }
                    return origSrcDesc!.get!.call(this);
                },
                set(val: string) {
                    try {
                        const s = String(val || "");
                        if (isVideoExtension(s) || urlCache.get(s) === "__VIDEO__") {
                            return origSrcDesc!.set!.call(this, val);
                        }
                        if (!s.includes("media.discordapp.net") || !s.includes("/attachments/")) {
                            return origSrcDesc!.set!.call(this, val);
                        }
                        const transformed = urlCache.get(s) || transformUrl(s);
                        urlCache.set(s, transformed);
                        if (this.dataset) {
                            this.dataset.knewestUncompressedImagesCdn = transformed;
                        }
                        return origSrcDesc!.set!.call(this, transformed);
                    } catch {}
                    return origSrcDesc!.set!.call(this, val);
                }
            });
        }

        if (origSrcsetDesc && typeof origSrcsetDesc.set === "function") {
            Object.defineProperty(imgProto, "srcset", {
                configurable: true,
                enumerable: true,
                get() {
                    return origSrcsetDesc!.get!.call(this);
                },
                set(val: string) {
                    try {
                        const s = String(val || "");
                        if (isVideoExtension(s) || urlCache.get(s) === "__VIDEO__") {
                            return origSrcsetDesc!.set!.call(this, val);
                        }
                        const transformed = transformSrcset(s);
                        if (transformed !== s) {
                            return origSrcsetDesc!.set!.call(this, transformed);
                        }
                    } catch {}
                    return origSrcsetDesc!.set!.call(this, val);
                }
            });
        }

        try {
            const imgs = document.getElementsByTagName("img");
            for (const img of Array.from(imgs)) {
                if (img.src && img.src.includes("media.discordapp.net") && img.src.includes("/attachments/")) {
                    const transformed = transformUrl(img.src);
                    if (transformed !== img.src) {
                        img.src = transformed;
                    }
                }
            }
        } catch {}
    },

    stop() {
        if (origSrcDesc) {
            Object.defineProperty(HTMLImageElement.prototype, "src", origSrcDesc);
        }
        if (origSrcsetDesc) {
            Object.defineProperty(HTMLImageElement.prototype, "srcset", origSrcsetDesc);
        }
        if (origSetAttribute) {
            Element.prototype.setAttribute = origSetAttribute;
        }
        if (origGetAttribute) {
            Element.prototype.getAttribute = origGetAttribute;
        }
        urlCache.clear();
    }
});
