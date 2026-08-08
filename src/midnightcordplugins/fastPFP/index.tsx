/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu, RestAPI, Toasts } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

import { getMediaUrl } from "@plugins/fileUpload/utils/getMediaUrl";

const copyImage = async (url: string) => {
    try {
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (e) {
            urlObj = new URL(url, window.location.origin);
        }
        let fetchUrl = url;
        if (!urlObj.pathname.includes("/attachments/")) {
            urlObj.pathname = urlObj.pathname.replace(/\.(webp|webm|mp4|gif|jpg|jpeg)$/i, "") + ".png";
            urlObj.searchParams.set("size", "4096");
            fetchUrl = urlObj.toString();
        }
        
        let response;
        try {
            response = await fetch(fetchUrl);
        } catch (e) {
            response = null;
        }
        
        if (!response || !response.ok) {
            response = await fetch(url);
        }
        
        const buffer = await response.arrayBuffer();
        const win = window as any;
        if (win.DiscordNative?.clipboard?.copyImage) {
            win.DiscordNative.clipboard.copyImage(new Uint8Array(buffer), url);
            Toasts.show(Toasts.create(t("Image copied to clipboard!"), Toasts.Type.SUCCESS));
        } else if (win.VesktopNative?.clipboard?.copyImage) {
            win.VesktopNative.clipboard.copyImage(new Uint8Array(buffer), url);
            Toasts.show(Toasts.create(t("Image copied to clipboard!"), Toasts.Type.SUCCESS));
        } else {
            const blob = new Blob([buffer], { type: "image/png" });
            navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            Toasts.show(Toasts.create(t("Image copied to clipboard!"), Toasts.Type.SUCCESS));
        }
    } catch (e) {
        Toasts.show(Toasts.create(t("Failed to copy image"), Toasts.Type.FAILURE));
        console.error(e);
    }
};

const saveImage = async (originalUrl: string) => {
    try {
        let urlObj;
        try {
            urlObj = new URL(originalUrl);
        } catch (e) {
            urlObj = new URL(originalUrl, window.location.origin);
        }
        
        let pathname = urlObj.pathname;
        let isAnimated = pathname.includes(".gif") || pathname.includes("a_") || pathname.includes(".webm");
        
        let tryExts = isAnimated ? [".gif", ".png"] : [".png", ".gif"];
        let response;
        let finalExt = tryExts[0];
        
        if (!pathname.includes("/attachments/")) {
            pathname = pathname.replace(/\.(webp|webm|mp4|gif|png|jpg|jpeg)$/i, "");
            for (const ext of tryExts) {
                urlObj.pathname = pathname + ext;
                urlObj.searchParams.set("size", "4096");
                let fetchUrl = urlObj.toString();
                try {
                    response = await fetch(fetchUrl);
                } catch (e) {
                    response = null;
                }
                if (response && response.ok) {
                    finalExt = ext;
                    break;
                }
            }
        }
        
        if (!response || !response.ok) {
            response = await fetch(originalUrl);
            finalExt = "." + (originalUrl.split("?")[0].split(".").pop() || "png");
        }
        
        const buffer = await response.arrayBuffer();
        let filename = pathname.split('/').pop() || "image";
        filename += finalExt;
        
        const win = window as any;
        if (win.DiscordNative?.fileManager?.saveWithDialog) {
            win.DiscordNative.fileManager.saveWithDialog(new Uint8Array(buffer), filename);
        } else {
            const blob = new Blob([buffer]);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
        }
        Toasts.show(Toasts.create(t("Image saved successfully!"), Toasts.Type.SUCCESS));
    } catch (e) {
        Toasts.show(Toasts.create(t("Failed to save image"), Toasts.Type.FAILURE));
        console.error("FastPFP Error:", e);
    }
};

const openLink = (url: string) => {
    window.open(url, "_blank");
};

const uploadImageToProfile = async (url: string, type: "avatar" | "banner") => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result;
            try {
                await RestAPI.patch({
                    url: "/users/@me",
                    body: {
                        [type]: base64data
                    }
                });
                Toasts.show(Toasts.create(t(`Successfully updated your ${type}!`), Toasts.Type.SUCCESS));
            } catch (error) {
                Toasts.show(Toasts.create(t(`Failed to update ${type}.`), Toasts.Type.FAILURE));
                console.error("FastPFP Error:", error);
            }
        };
    } catch (err) {
        Toasts.show(Toasts.create(t(`Failed to download image.`), Toasts.Type.FAILURE));
        console.error("FastPFP Error:", err);
    }
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;

    const { itemSrc, itemHref, target } = props;
    const url = getMediaUrl({ src: itemSrc, href: itemHref, target });

    if (!url) return;

    const group = findGroupChildrenByChildId("open-native-link", children)
        ?? findGroupChildrenByChildId("copy-link", children);

    if (group && !group.some(child => child?.props?.id === "fastpfp-avatar")) {
        group.push(
            <Menu.MenuItem
                label={t("Add To PFP")}
                key="fastpfp-avatar"
                id="fastpfp-avatar"
                action={() => uploadImageToProfile(url, "avatar")}
            />
        );
        group.push(
            <Menu.MenuItem
                label={t("Add To Banner")}
                key="fastpfp-banner"
                id="fastpfp-banner"
                action={() => uploadImageToProfile(url, "banner")}
            />
        );

        group.push(
            <Menu.MenuSeparator />
        );
        group.push(
            <Menu.MenuItem
                label={t("Copy Image")}
                key="fastpfp-copy-image-msg"
                id="fastpfp-copy-image-msg"
                action={() => copyImage(url)}
            />
        );
        group.push(
            <Menu.MenuItem
                label={t("Save Image")}
                key="fastpfp-save-image-msg"
                id="fastpfp-save-image-msg"
                action={() => saveImage(url)}
            />
        );
        group.push(
            <Menu.MenuItem
                label={t("Open Link")}
                key="fastpfp-open-link-msg"
                id="fastpfp-open-link-msg"
                action={() => openLink(url)}
            />
        );
    }
};

const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;
    if ("href" in props && !props.src) return;

    const url = getMediaUrl(props);
    if (!url) return;

    if (children.some(child => child?.props?.id === "fastpfp-group")) return;

    children.push(
        <Menu.MenuGroup id="fastpfp-group">
            <Menu.MenuItem
                label={t("Add To PFP")}
                key="fastpfp-avatar"
                id="fastpfp-avatar"
                action={() => uploadImageToProfile(url, "avatar")}
            />
            <Menu.MenuItem
                label={t("Add To Banner")}
                key="fastpfp-banner"
                id="fastpfp-banner"
                action={() => uploadImageToProfile(url, "banner")}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem
                label={t("Copy Image")}
                key="fastpfp-copy-image"
                id="fastpfp-copy-image"
                action={() => copyImage(url)}
            />
            <Menu.MenuItem
                label={t("Save Image")}
                key="fastpfp-save-image"
                id="fastpfp-save-image"
                action={() => saveImage(url)}
            />
            <Menu.MenuItem
                label={t("Open Link")}
                key="fastpfp-open-link"
                id="fastpfp-open-link"
                action={() => openLink(url)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "FastPFP",
    enabledByDefault: true,
    description: "Allows you to quickly set any image as your profile picture or banner from the context menu.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    contextMenus: {
        "message": messageContextMenuPatch,
        "image-context": imageContextMenuPatch
    }
});
