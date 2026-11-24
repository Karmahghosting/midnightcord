/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { FolderIcon, PlusIcon } from "@components/Icons";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { React, useEffect, useState } from "@webpack/common";

import { GifFolder, GifFolderBinding, gifFolders } from "./folders";
import { gifLabel, GifPreview, pausePreview, playPreview } from "./GifPreview";

export function useFoldersSnapshot() {
    return React.useSyncExternalStore(gifFolders.subscribe, gifFolders.getSnapshot);
}

function FolderEditor({ initialFolderId }: { initialFolderId?: string; }) {
    const snapshot = useFoldersSnapshot();
    const { folders, favorites, favoritesReady, bindings, ready, loading } = snapshot;
    const [selectedId, setSelectedId] = useState<string | null>(initialFolderId ?? null);
    const [initialized, setInitialized] = useState(false);
    const [name, setName] = useState("");
    const [urls, setUrls] = useState(new Set<string>());
    const [query, setQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(48);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const [pendingSelection, setPendingSelection] = useState<string | null | undefined>();
    const [deleting, setDeleting] = useState(false);
    const [detaching, setDetaching] = useState<GifFolderBinding | null>(null);
    const current = folders.find(folder => folder.id === selectedId);
    const linkedTeams = bindings.filter(binding => binding.folderId === selectedId);
    const linked = linkedTeams.length;
    const filtered = favorites.filter(gif => `${gifLabel(gif)} ${gif.url}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const selectedUrls = favorites.filter(gif => urls.has(gif.url)).map(gif => gif.url);

    function edit(folder?: GifFolder) {
        setSelectedId(folder?.id ?? null);
        setName(folder?.name ?? "");
        setUrls(new Set(folder?.urls ?? []));
        setQuery(""); setVisibleCount(48); setDirty(false); setSaved(false); setError(""); setDeleting(false); setDetaching(null);
    }
    useEffect(() => {
        if (ready && !initialized) {
            edit(folders.find(folder => folder.id === initialFolderId) ?? folders[0]);
            setInitialized(true);
        }
    }, [ready, initialized]);
    function choose(id: string | null) {
        if (saving || id === selectedId && id !== null) return;
        if (dirty) setPendingSelection(id);
        else edit(folders.find(folder => folder.id === id));
    }
    async function save() {
        if (!name.trim() || saving || !favoritesReady) return;
        setSaving(true); setError(""); setSaved(false);
        try {
            if (selectedId) await gifFolders.update(selectedId, { name: name.trim(), urls: selectedUrls });
            else setSelectedId(await gifFolders.create(name.trim(), selectedUrls));
            setDirty(false); setSaved(true);
        } catch (e) { setError(e instanceof Error ? e.message : "Impossible d’enregistrer le dossier."); }
        finally { setSaving(false); }
    }
    async function remove() {
        if (!current || linked || saving) return;
        setSaving(true); setError("");
        try {
            await gifFolders.remove(current.id);
            edit(gifFolders.getSnapshot().folders[0]);
        } catch (e) { setError(e instanceof Error ? e.message : "Impossible de supprimer le dossier."); }
        finally { setSaving(false); setDeleting(false); }
    }
    async function detach() {
        if (!detaching || saving) return;
        setSaving(true); setError("");
        try { await gifFolders.detachBinding(detaching.teamId, detaching.scope); setDetaching(null); }
        catch (e) { setError(e instanceof Error ? e.message : "Impossible d’arrêter le suivi."); }
        finally { setSaving(false); }
    }
    return <>
        <p className="vc-gif-folders-intro">Rangez vos favoris sans les déplacer ni les supprimer de Discord. Les dossiers restent sur cet appareil, pour ce compte Discord. Le Cloud n’est pas nécessaire.</p>
        {(error || snapshot.error) && <div className="vc-gif-teams-error" role="alert">{error || snapshot.error}<Button size="small" variant="secondary" onClick={() => void gifFolders.refresh()}>Réessayer</Button></div>}
        {!ready ? <p role="status">{loading ? "Chargement des dossiers…" : "Vos dossiers ne sont pas disponibles pour le moment."}</p> : <div className="vc-gif-teams-layout vc-gif-folders-layout">
            <aside className="vc-gif-teams-sidebar" aria-label="Mes dossiers GIF">
                <div className="vc-gif-teams-sidebar-title"><strong>Mes dossiers</strong><span>{folders.length}</span></div>
                <ul className="vc-gif-teams-list vc-gif-folders-list">{folders.map(folder => <li key={folder.id}><button type="button" disabled={saving} aria-current={folder.id === selectedId ? "true" : undefined} onClick={() => choose(folder.id)}><FolderIcon width={18} height={18} /><span><strong>{folder.name}</strong><small>{favorites.filter(gif => folder.urls.includes(gif.url)).length} GIF</small></span></button></li>)}</ul>
                <Button size="small" variant="secondary" disabled={saving} onClick={() => choose(null)}><PlusIcon width={16} height={16} />Nouveau dossier</Button>
            </aside>
            <section className="vc-gif-teams-main vc-gif-folders-editor" aria-label={current ? `Modifier ${current.name}` : "Créer un dossier"}>
                {pendingSelection !== undefined ? <div className="vc-gif-folders-confirm" role="alertdialog" aria-labelledby="vc-gif-folders-discard-title"><Heading tag="h3" id="vc-gif-folders-discard-title">Abandonner les modifications ?</Heading><p>Vos changements dans ce dossier n’ont pas encore été enregistrés.</p><div className="vc-gif-teams-actions"><Button size="small" autoFocus onClick={() => setPendingSelection(undefined)}>Continuer à modifier</Button><Button size="small" variant="secondary" onClick={() => { edit(folders.find(folder => folder.id === pendingSelection)); setPendingSelection(undefined); }}>Abandonner</Button></div></div>
                    : detaching ? <div className="vc-gif-folders-confirm" role="alertdialog" aria-labelledby="vc-gif-folders-detach-title"><Heading tag="h3" id="vc-gif-folders-detach-title">Arrêter le suivi pour « {detaching.teamName} » ?</Heading><p>Les futurs changements du dossier ne seront plus synchronisés avec cette team depuis cet appareil.</p><p><strong>Les GIF déjà partagés restent dans la team.</strong> Désactivez le partage depuis la team pour les retirer. Cette action est uniquement locale et ne nécessite pas d’accès à l’ancienne identité Cloud.</p><div className="vc-gif-teams-actions"><Button size="small" variant="secondary" disabled={saving} autoFocus onClick={() => setDetaching(null)}>Annuler</Button><Button size="small" variant="dangerPrimary" disabled={saving} onClick={() => void detach()}>Arrêter le suivi local</Button></div></div>
                        : deleting ? <div className="vc-gif-folders-confirm" role="alertdialog" aria-labelledby="vc-gif-folders-delete-title"><Heading tag="h3" id="vc-gif-folders-delete-title">Supprimer « {current?.name} » ?</Heading><p>Les GIF restent dans vos favoris Discord. Seul le dossier est supprimé.</p><div className="vc-gif-teams-actions"><Button size="small" variant="secondary" disabled={saving} autoFocus onClick={() => setDeleting(false)}>Annuler</Button><Button size="small" variant="dangerPrimary" disabled={saving} onClick={() => void remove()}>Supprimer le dossier</Button></div></div>
                        : <form onSubmit={event => { event.preventDefault(); void save(); }}>
                            <label>Nom du dossier<input className="vc-gif-folders-name" value={name} maxLength={64} placeholder="Réactions, animaux, soirées…" required disabled={saving} onChange={event => { setName(event.target.value); setDirty(true); setSaved(false); }} /></label>
                            <div className="vc-gif-teams-selection-header"><label>Choisir parmi mes favoris<input type="search" value={query} placeholder="Rechercher un GIF…" onChange={event => { setQuery(event.target.value); setVisibleCount(48); }} /></label><span>{selectedUrls.length} sélectionné{selectedUrls.length > 1 ? "s" : ""}</span></div>
                            {!favoritesReady ? <p role="status">Chargement de vos favoris…</p> : !filtered.length && <p className="vc-gif-teams-muted">{query ? "Aucun favori ne correspond à cette recherche." : "Ajoutez des GIF à vos favoris Discord pour les ranger ici."}</p>}
                            <div className="vc-gif-teams-grid vc-gif-teams-selection vc-gif-folders-selection">{filtered.slice(0, visibleCount).map(gif => <label className={`vc-gif-teams-tile${urls.has(gif.url) ? " vc-gif-teams-selected" : ""}`} key={gif.url}
                                onMouseEnter={event => playPreview(event.currentTarget)} onMouseLeave={event => pausePreview(event.currentTarget)} onFocus={event => playPreview(event.currentTarget)} onBlur={event => pausePreview(event.currentTarget)}>
                                <input type="checkbox" checked={urls.has(gif.url)} disabled={saving} aria-label={`Ranger ${gifLabel(gif)} dans ce dossier`} onChange={event => { const next = new Set(urls); if (event.target.checked) next.add(gif.url); else next.delete(gif.url); setUrls(next); setDirty(true); setSaved(false); }} /><GifPreview gif={gif} /><span className="vc-gif-teams-tile-title">{gifLabel(gif)}</span>
                            </label>)}</div>
                            {filtered.length > visibleCount && <Button type="button" variant="secondary" size="small" onClick={() => setVisibleCount(count => count + 48)}>Afficher les suivants</Button>}
                            {linked > 0 && <div className="vc-gif-folders-links"><p className="vc-gif-teams-muted">Ce dossier est lié à {linked} partage{linked > 1 ? "s" : ""} de team. Les changements enregistrés seront synchronisés depuis cet appareil. Pour supprimer le dossier, désactivez le partage dans les teams ou arrêtez le suivi local.</p><ul>{linkedTeams.map(binding => <li key={`${binding.scope}:${binding.teamId}`}><span><strong>{binding.teamName}</strong>{binding.paused && <small>En pause · {binding.paused}</small>}</span><Button size="small" type="button" variant="secondary" disabled={saving} onClick={() => setDetaching(binding)}>Arrêter le suivi</Button></li>)}</ul></div>}
                            <div className="vc-gif-teams-actions vc-gif-folders-actions"><Button size="small" type="submit" disabled={!dirty || !name.trim() || saving || !favoritesReady}>{saving ? "Enregistrement…" : current ? "Enregistrer" : "Créer le dossier"}</Button><Button size="small" type="button" variant="secondary" disabled={!dirty || saving} onClick={() => edit(current)}>Annuler les modifications</Button>{current && <Button size="small" type="button" variant="dangerSecondary" disabled={saving || linked > 0} onClick={() => setDeleting(true)}>Supprimer</Button>}{saved && <span role="status">Dossier enregistré.</span>}</div>
                            <p className="vc-gif-teams-muted">Créer un dossier ne partage aucun GIF. Dans Teams GIF → Mon partage, vous pouvez ensuite autoriser une team à voir ce dossier.</p>
                        </form>}
            </section>
        </div>}
    </>;
}

export default function FoldersModal(props: ModalProps & { initialFolderId?: string; }) {
    const { initialFolderId, ...modalProps } = props;
    const { userId } = useFoldersSnapshot();
    return <ModalRoot {...modalProps} size={ModalSize.LARGE} className="vc-gif-teams vc-gif-folders" aria-labelledby="vc-gif-folders-title">
        <ModalHeader className="vc-gif-teams-header"><div><Heading tag="h2" id="vc-gif-folders-title"><FolderIcon width={24} height={24} />Dossiers de GIF</Heading><p>Vos favoris, bien rangés.</p></div><ModalCloseButton onClick={props.onClose} /></ModalHeader>
        <ModalContent className="vc-gif-teams-body">{userId ? <FolderEditor key={userId} initialFolderId={initialFolderId} /> : <p className="vc-gif-teams-muted">Connectez-vous à Discord pour retrouver vos dossiers.</p>}</ModalContent>
    </ModalRoot>;
}
