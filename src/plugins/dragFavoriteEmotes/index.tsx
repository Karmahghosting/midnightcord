/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
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

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { React, useCallback, useDrag, useDrop, useRef, UserSettingsActionCreators, useState } from "@webpack/common";

const UserSettingsDelay = findByPropsLazy("INFREQUENT_USER_ACTION");
const logger = new Logger("DragFavoriteEmotes");
const DRAG_TYPE = "MIDNIGHTCORD_FAVORITE_EMOJI";

type EmojiData = {
    uniqueName?: string;
    id?: string;
};

type EmojiDescriptor = {
    category?: string;
    emoji?: EmojiData;
};

interface EmojiButtonProps {
    Component: React.ElementType;
    originalRef?: React.Ref<HTMLElement>;
    descriptor?: EmojiDescriptor;
    [key: string]: any;
}

export function favoriteId(descriptor?: EmojiDescriptor): string | undefined {
    if (descriptor?.category !== "FAVORITES") return;
    return [descriptor.emoji?.uniqueName, descriptor.emoji?.id].find(value => typeof value === "string" && value.length > 0);
}

/** Missing/stale IDs must never become splice(-1), which would remove another favorite. */
export function reorderFavorites(settings: { emojis?: unknown; } | null | undefined, source: unknown, target: unknown, after = false): false | undefined {
    const emojis = settings?.emojis;
    if (!Array.isArray(emojis) || !emojis.every(id => typeof id === "string") || typeof source !== "string" || typeof target !== "string" || source === target) return false;
    const sourceIndex = emojis.indexOf(source);
    const targetIndex = emojis.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return false;
    const destination = targetIndex + Number(after) - Number(sourceIndex < targetIndex);
    if (sourceIndex === destination) return false;
    emojis.splice(sourceIndex, 1);
    emojis.splice(destination, 0, source);
}

function NativeButton({ Component, originalRef, descriptor: _descriptor, ...props }: EmojiButtonProps) {
    return <Component {...props} ref={originalRef} />;
}

function FavoriteButton({ Component, originalRef, descriptor, ...props }: EmojiButtonProps) {
    const id = favoriteId(descriptor);
    const node = useRef<HTMLElement | null>(null);
    const cleanupRef = useRef<(() => void) | undefined>(undefined);
    const [after, setAfter] = useState(false);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: DRAG_TYPE,
        item: { id },
        canDrag: () => !!id,
        collect: monitor => ({ isDragging: monitor.isDragging() })
    }), [id]);
    const isAfter = monitor => {
        const pointer = monitor.getClientOffset();
        const rect = node.current?.getBoundingClientRect();
        return !!(pointer && rect && pointer.x >= rect.left + rect.width / 2);
    };
    const [{ canDrop, isOver }, drop] = useDrop(() => ({
        accept: DRAG_TYPE,
        canDrop: item => !!id && typeof item?.id === "string" && item.id !== id,
        collect: monitor => ({ canDrop: monitor.canDrop(), isOver: monitor.isOver({ shallow: true }) }),
        hover: (_item, monitor) => setAfter(isAfter(monitor)),
        drop: (item, monitor) => {
            if (!id || typeof item?.id !== "string" || item.id === id || monitor.didDrop()) return;
            const insertAfter = isAfter(monitor);
            void (async () => {
                try {
                    await UserSettingsActionCreators.FrecencyUserSettingsActionCreators.updateAsync("favoriteEmojis",
                        values => reorderFavorites(values, item.id, id, insertAfter), UserSettingsDelay.INFREQUENT_USER_ACTION);
                } catch { logger.warn("Could not update favorite emoji order."); }
            })();
        }
    }), [id]);
    const connect = useCallback((element: HTMLElement | null) => {
        const previousCleanup = cleanupRef.current;
        cleanupRef.current = undefined;
        previousCleanup?.();
        node.current = element;
        drag(drop(element));
        if (typeof originalRef === "function") {
            // React 19 callback refs can return cleanup; also keep React 18 null callbacks working.
            if (element || !previousCleanup) {
                const cleanup = originalRef(element);
                if (typeof cleanup === "function") cleanupRef.current = cleanup;
            }
        } else if (originalRef) originalRef.current = element;
    }, [drag, drop, originalRef]);

    return <Component {...props} ref={connect}
        data-vc-favorite-emote-dragging={isDragging || undefined}
        data-vc-favorite-emote-drop={canDrop && isOver ? after ? "after" : "before" : undefined} />;
}

const GuardedFavoriteButton = ErrorBoundary.wrap(FavoriteButton, {
    fallback: ({ wrappedProps }) => <NativeButton {...wrappedProps} />
});

export default definePlugin({
    name: "DragFavoriteEmotes",
    authors: [EquicordDevs.PWall],
    description: "Adds the ability to change the order of your favourite emotes",
    tags: ["Customisation", "Chat", "Emotes"],
    patches: [{
        find: "#{intl::EMOJI_FAVORITE_TOOLTIP}",
        replacement: {
            // A single replacement keeps the native render valid if Discord changes the target.
            // Hooks belong to our own component, never to conditional tooltip branches.
            match: /(\(0,\i\.jsxs?\)\()(\i),\{ref:(\i),emoji:(\i),isFavorite:/,
            replace: "$1$self.EmojiButton,{Component:$2,descriptor:arguments[0]?.descriptor,originalRef:$3,emoji:$4,isFavorite:"
        }
    }],
    EmojiButton(props: EmojiButtonProps) {
        return favoriteId(props.descriptor) ? <GuardedFavoriteButton {...props} /> : <NativeButton {...props} />;
    }
});
