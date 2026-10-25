/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Devs } from "@utils/constants";
import { getGuildAcronym, hasGuildFeature } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModalLazy } from "@utils/modal";
import definePlugin from "@utils/types";
import { Guild, GuildSticker } from "@vencord/discord-types";
import { StickerFormatType } from "@vencord/discord-types/enums";
import { findByCodeLazy } from "@webpack";
import { Constants, EmojiStore, FluxDispatcher, GuildStore, IconUtils, Menu, PermissionsBits, PermissionStore, React, RestAPI, StickersStore, TextInput, Toasts, Tooltip, UserStore } from "@webpack/common";
import { Promisable } from "type-fest";

const uploadEmoji = findByCodeLazy(".GUILD_EMOJIS(", "EMOJI_UPLOAD_START");

function getGuildMaxEmojiSlots(guild: Guild) {
    const additional = guild.premiumFeatures?.additionalEmojiSlots;
    return Math.max(hasGuildFeature(guild, "MORE_EMOJI") ? 200 : 50,
        50 + (typeof additional === "number" && Number.isFinite(additional) ? Math.max(0, additional) : 0));
}

interface Sticker extends GuildSticker {
    t: "Sticker";
}

interface Emoji {
    t: "Emoji";
    id: string;
    name: string;
    isAnimated: boolean;
}

type Data = Emoji | Sticker;

const StickerExtMap = {
    [StickerFormatType.PNG]: "png",
    [StickerFormatType.APNG]: "png",
    [StickerFormatType.LOTTIE]: "json",
    [StickerFormatType.GIF]: "gif"
} as const;

const PremiumTierStickerLimitMap = {
    0: 5,
    1: 15,
    2: 30,
    3: 60
} as const;

const MAX_EMOJI_SIZE_BYTES = 256 * 1024;
const MAX_STICKER_SIZE_BYTES = 512 * 1024;

function getGuildMaxStickerSlots(guild: Guild) {
    if (hasGuildFeature(guild, "MORE_STICKERS") && guild.premiumTier === 3)
        return 120;

    return PremiumTierStickerLimitMap[guild.premiumTier] ?? PremiumTierStickerLimitMap[0];
}

function getUrl(data: Data, size: number) {
    if (data.t === "Emoji")
        return `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/emojis/${data.id}.webp?size=${size}&lossless=true&animated=true`;

    return `${window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT}/stickers/${data.id}.${StickerExtMap[data.format_type]}?size=${size}&lossless=true&animated=true`;
}

async function fetchSticker(id: string) {
    const cached = StickersStore.getStickerById(id);
    if (cached) return cached;

    const { body } = await RestAPI.get({
        url: Constants.Endpoints.STICKER(id)
    });

    FluxDispatcher.dispatch({
        type: "STICKER_FETCH_SUCCESS",
        sticker: body
    });

    return body as Sticker;
}

async function cloneSticker(guildId: string, sticker: Sticker) {
    const data = new FormData();
    data.append("name", sticker.name);
    data.append("tags", sticker.tags);
    data.append("description", sticker.description);
    data.append("file", await fetchBlob(sticker));

    if (!getGuildCandidates(sticker).guilds.some(guild => guild.id === guildId)) throw new Error("This server is no longer available for cloning");

    const { body } = await RestAPI.post({
        url: Constants.Endpoints.GUILD_STICKER_PACKS(guildId),
        body: data,
    });

    FluxDispatcher.dispatch({
        type: "GUILD_STICKERS_CREATE_SUCCESS",
        guildId,
        sticker: {
            ...body,
            user: UserStore.getCurrentUser()
        }
    });
}

async function cloneEmoji(guildId: string, emoji: Emoji) {
    const data = await fetchBlob(emoji);

    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read the emoji image"));
        reader.onabort = () => reject(new Error("Reading the emoji image was cancelled"));
        reader.readAsDataURL(data);
    });

    // Fetching the asset can take time; permissions or available slots may have changed.
    if (!getGuildCandidates(emoji).guilds.some(guild => guild.id === guildId)) throw new Error("This server is no longer available for cloning");

    return uploadEmoji({
        guildId,
        name: emoji.name.split("~")[0],
        image: dataUrl
    });
}

function getGuildCandidates(data: Data) {
    const meId = UserStore.getCurrentUser()?.id;
    let unavailable = false;
    const guilds: Guild[] = [];
    if (!meId) return { guilds, unavailable };

    for (const guild of Object.values(GuildStore.getGuilds())) {
        try {
            if (guild.ownerId !== meId && !PermissionStore.can(PermissionsBits.CREATE_GUILD_EXPRESSIONS, guild)) continue;

            if (data.t === "Sticker") {
                const stickers = StickersStore.getStickersByGuildId(guild.id);
                if (!stickers || stickers.length < getGuildMaxStickerSlots(guild)) guilds.push(guild);
                continue;
            }

            const emojis = EmojiStore.getGuildEmoji(guild.id) ?? [];
            const count = emojis.filter(emoji => Boolean(emoji.animated) === Boolean(data.isAnimated) && !emoji.managed).length;
            if (count < getGuildMaxEmojiSlots(guild)) guilds.push(guild);
        } catch {
            // One unloaded or outdated store entry must not prevent the modal from opening.
            unavailable = true;
        }
    }

    return { guilds: guilds.sort((a, b) => a.name.localeCompare(b.name)), unavailable };
}

async function fetchBlob(data: Data) {
    const MAX_SIZE = data.t === "Sticker"
        ? MAX_STICKER_SIZE_BYTES
        : MAX_EMOJI_SIZE_BYTES;

    for (let size = 4096; size >= 16; size /= 2) {
        const url = getUrl(data, size);
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Failed to fetch ${url} - ${res.status}`);

        const blob = await res.blob();
        if (blob.size <= MAX_SIZE)
            return blob;
    }

    throw new Error(`Failed to fetch ${data.t} within size limit of ${MAX_SIZE / 1000}kB`);
}

async function doClone(guildId: string, data: Sticker | Emoji) {
    try {
        const validation = validateName(data.t, data.name);
        if (validation !== true) throw new Error(validation);
        if (!getGuildCandidates(data).guilds.some(guild => guild.id === guildId)) throw new Error("This server is no longer available for cloning");
        if (data.t === "Sticker")
            await cloneSticker(guildId, data);
        else
            await cloneEmoji(guildId, data);

        Toasts.show({
            message: `Successfully cloned ${data.name} to ${GuildStore.getGuild(guildId)?.name ?? "your server"}!`,
            type: Toasts.Type.SUCCESS,
            id: Toasts.genId()
        });
    } catch (e: any) {
        let message = e instanceof Error ? e.message : "Something went wrong (check console!)";
        try {
            message = JSON.parse(e.text).message;
        } catch { }

        new Logger("ExpressionCloner").error("Failed to clone", data.name, "to", guildId, e);
        Toasts.show({
            message: "Failed to clone: " + message,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId()
        });
    }
}

const getFontSize = (s: string) => {
    // [18, 18, 16, 16, 14, 12, 10]
    const sizes = [20, 20, 18, 18, 16, 14, 12];
    return sizes[s.length] ?? 4;
};

const nameValidator = /^\w+$/i;

function validateName(type: Data["t"], name: string): true | string {
    if (type === "Emoji") return name.length >= 2 && name.length <= 32 && nameValidator.test(name)
        || "Emoji names must contain 2–32 letters, numbers or underscores.";
    return name.trim().length >= 2 && name.length <= 30 || "Sticker names must contain 2–30 characters.";
}

function CloneModal({ data }: { data: Sticker | Emoji; }) {
    const [isCloning, setIsCloning] = React.useState(false);
    const [name, setName] = React.useState(data.t === "Emoji" ? data.name.split("~")[0] : data.name);
    const cloning = React.useRef(false);

    const [x, invalidateMemo] = React.useReducer(x => x + 1, 0);

    const { guilds, unavailable } = React.useMemo(() => getGuildCandidates(data), [data.id, data.t, x]);
    const validation = validateName(data.t, name);
    const disabled = isCloning || validation !== true;

    return (
        <>
            <Heading tag="h5" id="vc-expression-cloner-name">Custom Name</Heading>
            <TextInput
                value={name}
                onChange={setName}
                error={validation === true ? undefined : validation}
                aria-labelledby="vc-expression-cloner-name"
                maxLength={data.t === "Emoji" ? 32 : 30}
            />
            <Paragraph>Choose a server below. You need permission to create expressions and a free slot of this type.</Paragraph>
            {unavailable && <Paragraph role="status">Some servers could not be loaded. Refresh the list or reopen this window.</Paragraph>}
            {guilds.length === 0 && <Paragraph role="status">No server is currently available. Check your Create Expressions permission and the server's remaining emoji or sticker slots.</Paragraph>}
            <Button variant="secondary" disabled={isCloning} onClick={() => invalidateMemo()}>Refresh servers</Button>
            <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1em",
                padding: "1em 0.5em",
                justifyContent: "center",
                alignItems: "center"
            }}>
                {guilds.map(g => (
                    <Tooltip key={g.id} text={g.name}>
                        {({ onMouseLeave, onMouseEnter }) => (
                            <button
                                type="button"
                                onMouseLeave={onMouseLeave}
                                onMouseEnter={onMouseEnter}
                                aria-label={"Clone to " + g.name}
                                disabled={disabled}
                                style={{
                                    borderRadius: "50%",
                                    backgroundColor: "var(--background-base-lower)",
                                    display: "inline-flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    width: "4em",
                                    height: "4em",
                                    border: "none",
                                    padding: 0,
                                    cursor: disabled ? "not-allowed" : "pointer",
                                    filter: disabled ? "brightness(50%)" : "none"
                                }}
                                onClick={async () => {
                                    if (cloning.current || disabled) return;
                                    cloning.current = true;
                                    setIsCloning(true);
                                    await doClone(g.id, { ...data, name }).finally(() => {
                                        cloning.current = false;
                                        invalidateMemo();
                                        setIsCloning(false);
                                    });
                                }}
                            >
                                {g.icon ? (
                                    <img
                                        aria-hidden
                                        style={{
                                            borderRadius: "50%",
                                            width: "100%",
                                            height: "100%",
                                        }}
                                        src={IconUtils.getGuildIconURL({
                                            id: g.id,
                                            icon: g.icon,
                                            canAnimate: true,
                                            size: 512
                                        })}
                                        alt={g.name}
                                    />
                                ) : (
                                    <Paragraph
                                        style={{
                                            fontSize: getFontSize(getGuildAcronym(g)),
                                            width: "100%",
                                            overflow: "hidden",
                                            whiteSpace: "nowrap",
                                            textAlign: "center",
                                            cursor: isCloning ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        {getGuildAcronym(g)}
                                    </Paragraph>
                                )}
                            </button>
                        )}
                    </Tooltip>
                ))}
            </div>
        </>
    );
}

function buildMenuItem(type: "Emoji" | "Sticker", fetchData: () => Promisable<Omit<Sticker | Emoji, "t">>) {
    return (
        <Menu.MenuItem
            id="emote-cloner"
            key="emote-cloner"
            label={`Clone ${type}`}
            action={() =>
                openModalLazy(async () => {
                    const res = await fetchData();
                    const data = { t: type, ...res } as Sticker | Emoji;
                    const url = getUrl(data, 128);

                    return modalProps => (
                        <ModalRoot transitionState={modalProps.transitionState} size={ModalSize.MEDIUM} aria-label={`Clone ${type}`}>
                            <ModalHeader>
                                <Flex gap="0.5em" alignItems="center">
                                    <img
                                        role="presentation"
                                        aria-hidden
                                        src={url}
                                        alt=""
                                        height={24}
                                        width={24}
                                    />
                                    <BaseText tag="h3" size="md" weight="medium">Clone {data.name}</BaseText>
                                </Flex>
                            </ModalHeader>
                            <ModalContent style={{ padding: "16px", maxHeight: "60vh" }}>
                                <CloneModal data={data} />
                            </ModalContent>
                            <ModalFooter><Button variant="secondary" onClick={modalProps.onClose}>Close</Button></ModalFooter>
                        </ModalRoot>
                    );
                })
            }
        />
    );
}

function isGifUrl(url: unknown) {
    if (typeof url !== "string" || !url) return false;
    try {
        const u = new URL(url, location.origin);
        return u.pathname.endsWith(".gif") || u.searchParams.get("animated") === "true";
    } catch { return false; }
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const { favoriteableId, itemHref, itemSrc, favoriteableType } = props ?? {};

    if (typeof favoriteableId !== "string" || !/^\d+$/.test(favoriteableId)) return;

    const menuItem = (() => {
        switch (favoriteableType) {
            case "emoji":
                const match = props.message?.content?.match(RegExp(`<a?:(\\w+)(?:~\\d+)?:${favoriteableId}>|https://cdn\\.discordapp\\.com/emojis/${favoriteableId}\\.`));
                const reaction = props.message?.reactions?.find(reaction => reaction.emoji.id === favoriteableId);
                if (!match && !reaction) return;
                const name = (match && match[1]) ?? reaction?.emoji.name ?? "FakeNitroEmoji";

                return buildMenuItem("Emoji", () => ({
                    id: favoriteableId,
                    name,
                    isAnimated: match?.[0]?.startsWith("<a:") || reaction?.emoji.animated === true || isGifUrl(itemHref ?? itemSrc)
                }));
            case "sticker":
                const sticker = props.message?.stickerItems?.find(s => s.id === favoriteableId);
                if (sticker?.format_type === 3 /* LOTTIE */) return;

                return buildMenuItem("Sticker", () => fetchSticker(favoriteableId));
        }
    })();

    if (menuItem)
        findGroupChildrenByChildId("copy-link", children)?.push(menuItem);
};

const expressionPickerPatch: NavContextMenuPatchCallback = (children, props: { target: HTMLElement; }) => {
    const target = props?.target?.closest?.<HTMLElement>("[data-id][data-type]") ?? props?.target;
    const { id, name, type } = target?.dataset ?? {};
    if (!id) return;

    if (type === "emoji" && name) {
        const image = target.querySelector?.("img");

        children.push(buildMenuItem("Emoji", () => ({
            id,
            name,
            isAnimated: isGifUrl(image?.src)
        })));
    } else if (type === "sticker" && !target.className?.includes("lottieCanvas")) {
        children.push(buildMenuItem("Sticker", () => fetchSticker(id)));
    }
};

migratePluginSettings("ExpressionCloner", "EmoteCloner");
export default definePlugin({
    name: "ExpressionCloner",
    description: "Allows you to clone Emotes & Stickers to your own server (right click them)",
    tags: ["Emotes", "Servers"],
    searchTerms: ["StickerCloner", "EmoteCloner", "EmojiCloner"],
    authors: [Devs.Ven, Devs.Nuckyz],
    contextMenus: {
        "message": messageContextMenuPatch,
        "expression-picker": expressionPickerPatch
    }
});
