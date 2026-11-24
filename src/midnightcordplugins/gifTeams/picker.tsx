/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { FolderIcon } from "@components/Icons";
import { React } from "@webpack/common";
import type { ReactNode } from "react";

import { publicGifUrl } from "./favorites";
import { gifFolders } from "./folders";

interface PickerInstance { state?: { resultType?: string; }; }
interface Selection { userId: string | null; folderId: string; }
const selections = new WeakMap<PickerInstance, Selection>();
const listeners = new WeakMap<PickerInstance, Set<() => void>>();

function usePickerFolder(picker: PickerInstance) {
    const folders = React.useSyncExternalStore(gifFolders.subscribe, gifFolders.getSnapshot);
    const subscribe = React.useCallback((listener: () => void) => {
        let set = listeners.get(picker);
        if (!set) listeners.set(picker, set = new Set());
        set.add(listener);
        return () => { set.delete(listener); };
    }, [picker]);
    const read = React.useCallback(() => selections.get(picker)?.folderId ?? "", [picker]);
    const selectedId = React.useSyncExternalStore(subscribe, read);
    const selected = selections.get(picker);
    const folder = folders.ready && selected?.userId === folders.userId
        ? folders.folders.find(item => item.id === selectedId) : undefined;
    return { folders, folder };
}

function selectFolder(picker: PickerInstance, folderId: string) {
    selections.set(picker, { userId: gifFolders.getSnapshot().userId, folderId });
    for (const listener of listeners.get(picker) ?? []) listener();
}

/** Keep Discord's native grid and click handlers; only narrow its visible data. */
export function filterPickerContent(original: ReactNode, urls: string[] | undefined, folderKey: string): ReactNode {
    if (!urls || !React.isValidElement<{ data?: unknown; }>(original) || !Array.isArray(original.props.data)) return original;
    const allowed = new Set(urls);
    const data = original.props.data.filter(item => {
        const url = publicGifUrl(item?.url);
        return url !== null && allowed.has(url);
    });
    return React.cloneElement(original, { data, key: `${original.key ?? "gif-favorites"}:${folderKey}` });
}

function PickerContent({ picker, original }: { picker: PickerInstance; original: ReactNode; }) {
    const { folders, folder } = usePickerFolder(picker);
    if (picker.state?.resultType !== "Favorites" || !folder || !folders.favoritesReady) return original;
    const favorites = new Set(folders.favorites.map(gif => gif.url));
    return filterPickerContent(original, folder.urls.filter(url => favorites.has(url)), `${folders.userId}:${folder.id}`);
}

function NativeContentFallback({ wrappedProps }: { wrappedProps: { original: ReactNode; }; }) {
    return <>{wrappedProps.original}</>;
}

export function renderFolderContent(picker: PickerInstance, original: ReactNode) {
    return <ErrorBoundary fallback={NativeContentFallback} wrappedProps={{ original }}>
        <PickerContent picker={picker} original={original} />
    </ErrorBoundary>;
}

export function PickerTools({ picker, onFolders }: { picker: PickerInstance; onFolders(): void; }) {
    const { folders, folder } = usePickerFolder(picker);
    return <div className="vc-gif-teams-picker-tools">
        {picker.state?.resultType === "Favorites" && folders.ready && folders.folders.length > 0
            ? <select className="vc-gif-teams-picker-folder" aria-label="Dossier de GIF favoris" value={folder?.id ?? ""}
                onChange={event => {
                    if (event.currentTarget.value === ":manage") onFolders();
                    else selectFolder(picker, event.currentTarget.value);
                }}>
                <option value="">Tous mes favoris</option>
                {folders.folders.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                <option value=":manage">Gérer les dossiers…</option>
            </select>
            : <Button size="small" variant="secondary" onClick={onFolders}><FolderIcon width={16} height={16} />Dossiers</Button>}
    </div>;
}
