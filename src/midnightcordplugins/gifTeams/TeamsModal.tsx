/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { CopyIcon, GifIcon, OwnerCrownIcon, PlusIcon, UserIcon } from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { React, useEffect, useState } from "@webpack/common";

import { gifTeams } from "./controller";
import { insertGif } from "./favorites";
import type { GifInput, Sharing, SharingMode, TeamsSnapshot } from "./types";

type View = "gifs" | "sharing" | "members";
interface Confirmation { title: string; description: string; label: string; action: () => Promise<void>; }

export function useTeamsSnapshot(): TeamsSnapshot {
    return React.useSyncExternalStore(gifTeams.subscribe, gifTeams.getSnapshot);
}

function gifLabel(gif: GifInput): string {
    if (gif.title) return gif.title;
    try {
        const url = new URL(gif.url);
        return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || url.hostname)
            .replace(/[-_]/g, " ").replace(/\.(gif|mp4|webm|webp)$/i, "");
    } catch {
        return "GIF";
    }
}

function GifPreview({ gif }: { gif: GifInput; }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [gif.src]);
    if (!gif.src || failed) return <span className="vc-gif-teams-preview vc-gif-teams-placeholder"><GifIcon /><span>Aperçu indisponible</span></span>;
    return <span className="vc-gif-teams-preview">
        {gif.format === 2
            ? <video src={gif.src} muted loop playsInline preload="none" onError={() => setFailed(true)} aria-hidden="true" />
            : <img src={gif.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
        {gif.format === 2 && <span className="vc-gif-teams-video-label">GIF vidéo</span>}
    </span>;
}

function playPreview(target: HTMLElement) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    void target.querySelector("video")?.play().catch(() => { });
}

function pausePreview(target: HTMLElement) { target.querySelector("video")?.pause(); }

function TeamForms({ busy }: { busy: boolean; }) {
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    return <div className="vc-gif-teams-forms">
        <details>
            <summary><PlusIcon width={16} height={16} />Créer une team</summary>
            <form onSubmit={event => {
                event.preventDefault();
                if (name.trim() && !busy) void gifTeams.createTeam(name.trim()).then(() => {
                    if (!gifTeams.getSnapshot().error) setName("");
                });
            }}>
                <label>Nom de la team<input value={name} onChange={event => setName(event.target.value)} maxLength={64} placeholder="Les GIF du vendredi" required disabled={busy} /></label>
                <Button size="small" type="submit" disabled={busy || !name.trim()}>Créer</Button>
            </form>
        </details>
        <details>
            <summary><UserIcon width={16} height={16} />Rejoindre une team</summary>
            <form onSubmit={event => {
                event.preventDefault();
                if (code.trim() && !busy) void gifTeams.joinTeam(code.trim()).then(() => {
                    if (!gifTeams.getSnapshot().error) setCode("");
                });
            }}>
                <label>Code d’invitation<input value={code} onChange={event => setCode(event.target.value)} maxLength={256} autoComplete="off" spellCheck={false} placeholder="Collez le code reçu" required disabled={busy} /></label>
                <Button size="small" type="submit" disabled={busy || !code.trim()}>Rejoindre</Button>
                <p>Vous choisissez ensuite ce que vous partagez. Aucun favori n’est publié en rejoignant une team.</p>
            </form>
        </details>
    </div>;
}

function SharedGifs({ snapshot, onInsert }: { snapshot: TeamsSnapshot; onInsert: (url: string) => void; }) {
    const [query, setQuery] = useState("");
    const { page, team, filterMember, busy, loading } = snapshot;
    useEffect(() => setQuery(""), [team?.id, page?.offset, filterMember]);
    const needle = query.trim().toLocaleLowerCase();
    const items = page?.items.filter(gif => !needle || `${gifLabel(gif)} ${gif.displayName} ${gif.url}`.toLocaleLowerCase().includes(needle)) ?? [];
    return <>
        <div className="vc-gif-teams-filters">
            <label>Rechercher dans cette page<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Un GIF, un membre…" type="search" /></label>
            <label>Membre<select value={filterMember ?? ""} disabled={busy || loading} onChange={event => void gifTeams.loadPage(event.target.value || undefined, 0)}>
                <option value="">Tous les membres</option>
                {team?.members.map(member => <option key={member.id} value={member.id}>{member.displayName} · {member.gifCount} GIF</option>)}
            </select></label>
        </div>
        {loading && <p role="status" className="vc-gif-teams-muted">Chargement des GIF…</p>}
        {!loading && !items.length && <div className="vc-gif-teams-empty"><GifIcon width={32} height={32} /><p>{needle ? "Aucun résultat sur cette page." : "Aucun GIF partagé pour le moment."}</p><span>{needle ? "Essayez une autre recherche ou une autre page." : "Chaque membre choisit son mode dans « Mon partage »."}</span></div>}
        <div className="vc-gif-teams-grid">
            {items.map(gif => <button type="button" className="vc-gif-teams-tile" key={`${gif.memberId}:${gif.id}`} disabled={busy || loading}
                aria-label={`Ajouter au brouillon : ${gifLabel(gif)}, partagé par ${gif.displayName}`} title={gifLabel(gif)}
                onMouseEnter={event => playPreview(event.currentTarget)} onMouseLeave={event => pausePreview(event.currentTarget)}
                onFocus={event => playPreview(event.currentTarget)} onBlur={event => pausePreview(event.currentTarget)}
                onClick={() => onInsert(gif.url)}>
                <GifPreview gif={gif} /><span className="vc-gif-teams-tile-title">{gifLabel(gif)}</span><small>{gif.displayName}</small>
            </button>)}
        </div>
        {page && page.total > 0 && <div className="vc-gif-teams-pagination">
            <span>{page.offset + 1}–{page.offset + page.items.length} sur {page.total} GIF</span>
            <div><Button variant="secondary" size="small" disabled={busy || loading || page.offset === 0} onClick={() => void gifTeams.loadPage(filterMember, Math.max(0, page.offset - 60))}>Précédent</Button>
                <Button variant="secondary" size="small" disabled={busy || loading || page.nextOffset === null} onClick={() => { if (page.nextOffset !== null) void gifTeams.loadPage(filterMember, page.nextOffset); }}>Suivant</Button></div>
        </div>}
        <p className="vc-gif-teams-muted">Un clic ajoute le GIF au brouillon. Aucun message n’est envoyé automatiquement.</p>
    </>;
}

function SharingEditor({ snapshot, sharing }: { snapshot: TeamsSnapshot; sharing: Sharing; }) {
    const [mode, setMode] = useState<SharingMode>(sharing.mode);
    const [selected, setSelected] = useState(() => new Set(sharing.gifs.map(gif => gif.url)));
    const [confirmed, setConfirmed] = useState(sharing.mode === "auto");
    const [editingRevision, setEditingRevision] = useState(sharing.revision);
    const [dirty, setDirty] = useState(false);
    const [query, setQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(48);
    const [saved, setSaved] = useState(false);
    const { favorites, favoritesReady, busy, loading } = snapshot;
    useEffect(() => {
        if (dirty) return;
        setMode(sharing.mode);
        setSelected(new Set(sharing.gifs.map(gif => gif.url)));
        setConfirmed(sharing.mode === "auto");
        setEditingRevision(sharing.revision);
    }, [sharing.revision, dirty]);
    const filtered = favorites.filter(gif => `${gifLabel(gif)} ${gif.url}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const selectedCount = favorites.filter(gif => selected.has(gif.url)).length;
    const conflict = dirty && editingRevision !== sharing.revision;
    const canSave = dirty && !conflict && !busy && !loading && (mode === "off" || favoritesReady) && (mode !== "auto" || confirmed);
    async function save() {
        if (!canSave) return;
        await gifTeams.setSharing(mode, mode === "manual" ? [...selected] : undefined, editingRevision);
        if (!gifTeams.getSnapshot().error) { setDirty(false); setSaved(true); }
    }
    function chooseMode(next: SharingMode) {
        setMode(next); setDirty(true); setSaved(false);
        if (next === "auto" && sharing.mode !== "auto") setConfirmed(false);
    }
    return <div className="vc-gif-teams-sharing">
        <Heading tag="h3">Ce que cette team peut voir</Heading>
        <p>Votre choix s’applique uniquement à cette team. Vous pouvez le changer à tout moment.</p>
        {conflict && <div className="vc-gif-teams-error" role="alert"><p>Ce partage a changé depuis un autre appareil. Rechargez la sélection avant de la modifier.</p><Button variant="secondary" size="small" onClick={() => { setDirty(false); setSaved(false); }}>Recharger la sélection</Button></div>}
        <fieldset className="vc-gif-teams-modes" disabled={busy || loading}>
            <legend>Mode de partage</legend>
            <label><input type="radio" name="gif-team-sharing-mode" value="auto" checked={mode === "auto"} onChange={() => chooseMode("auto")} /><span><strong>Tous mes favoris</strong><small>Les ajouts et retraits suivent vos favoris Discord.</small></span></label>
            <label><input type="radio" name="gif-team-sharing-mode" value="manual" checked={mode === "manual"} onChange={() => chooseMode("manual")} /><span><strong>Ma sélection</strong><small>Seuls les GIF cochés sont partagés.</small></span></label>
            <label><input type="radio" name="gif-team-sharing-mode" value="off" checked={mode === "off"} onChange={() => chooseMode("off")} /><span><strong>Ne rien partager</strong><small>Vos GIF sont retirés de cette team.</small></span></label>
        </fieldset>
        {mode === "auto" && <label className="vc-gif-teams-consent"><input type="checkbox" checked={confirmed} disabled={busy || loading} onChange={event => { setConfirmed(event.target.checked); setDirty(true); setSaved(false); }} />Je partage tous mes GIF favoris avec cette team, y compris ceux que j’ajouterai ensuite.</label>}
        {mode === "manual" && <>
            <div className="vc-gif-teams-selection-header"><label>Mes favoris<input type="search" value={query} placeholder="Rechercher un favori…" onChange={event => { setQuery(event.target.value); setVisibleCount(48); }} /></label><span>{selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}</span></div>
            {!favoritesReady && <p role="status">Chargement de vos favoris Discord…</p>}
            {favoritesReady && !filtered.length && <p className="vc-gif-teams-muted">{query ? "Aucun favori ne correspond à cette recherche." : "Ajoutez d’abord des GIF à vos favoris Discord."}</p>}
            <div className="vc-gif-teams-grid vc-gif-teams-selection">
                {filtered.slice(0, visibleCount).map(gif => <label className={`vc-gif-teams-tile${selected.has(gif.url) ? " vc-gif-teams-selected" : ""}`} key={gif.url}
                    onMouseEnter={event => playPreview(event.currentTarget)} onMouseLeave={event => pausePreview(event.currentTarget)}
                    onFocus={event => playPreview(event.currentTarget)} onBlur={event => pausePreview(event.currentTarget)}>
                    <input type="checkbox" checked={selected.has(gif.url)} disabled={busy || loading} aria-label={`Partager ${gifLabel(gif)}`} onChange={event => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(gif.url); else next.delete(gif.url);
                        setSelected(next); setDirty(true); setSaved(false);
                    }} /><GifPreview gif={gif} /><span className="vc-gif-teams-tile-title">{gifLabel(gif)}</span>
                </label>)}
            </div>
            {filtered.length > visibleCount && <Button variant="secondary" size="small" onClick={() => setVisibleCount(count => count + 48)}>Afficher les suivants</Button>}
        </>}
        {mode === "auto" && <p className="vc-gif-teams-muted">{favoritesReady ? `${favorites.length} GIF favoris disponibles. La synchronisation s’effectue lorsque Midnightcord est ouvert et connecté.` : "Chargement de vos favoris Discord…"}</p>}
        <p className="vc-gif-teams-privacy">Les liens et aperçus partagés sont stockés par l’API et visibles par les membres de la team. Ils ne sont pas chiffrés comme vos sauvegardes Cloud.</p>
        <div className="vc-gif-teams-actions"><Button disabled={!canSave} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer mon partage"}</Button>{saved && <span role="status">Partage enregistré.</span>}{dirty && !saved && <span className="vc-gif-teams-muted">Modifications non enregistrées</span>}</div>
    </div>;
}

function Members({ snapshot, ask }: { snapshot: TeamsSnapshot; ask: (confirmation: Confirmation) => void; }) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const { team, viewerId, invite, busy, loading } = snapshot;
    useEffect(() => { setCopied(false); setCopyError(false); }, [invite?.code]);
    if (!team) return null;
    const owner = team.role === "owner";
    function teamAction(action: () => Promise<void>): () => Promise<void> {
        return async () => { if (gifTeams.getSnapshot().team?.id === team!.id) await action(); };
    }
    return <>
        {owner && <section className="vc-gif-teams-invite">
            <Heading tag="h3">Inviter dans {team.name}</Heading>
            <p>Transmettez le code aux personnes de votre choix. Elles pourront rejoindre la team depuis Midnightcord.</p>
            {invite && <><label>Code d’invitation<input readOnly value={invite.code} onFocus={event => event.target.select()} aria-label="Code d’invitation de la team" /></label><small>Expire le {new Date(invite.expiresAt).toLocaleString("fr-FR")}. Révoquer le code n’exclut pas les membres déjà présents.</small></>}
            <div className="vc-gif-teams-actions">
                <Button size="small" disabled={busy || loading} onClick={() => void gifTeams.createInvite()}>{invite ? "Renouveler le code" : "Créer une invitation"}</Button>
                {invite && <><Button variant="secondary" size="small" onClick={async () => {
                    try { await copyToClipboard(invite.code); setCopied(true); setCopyError(false); } catch { setCopyError(true); }
                }}><CopyIcon width={16} height={16} />{copied ? "Copié" : "Copier"}</Button>
                    <Button variant="dangerSecondary" size="small" disabled={busy || loading} onClick={() => ask({ title: "Révoquer cette invitation ?", description: "Ce code ne permettra plus de rejoindre la team. Les membres actuels gardent leur accès.", label: "Révoquer", action: teamAction(() => gifTeams.revokeInvite()) })}>Révoquer</Button></>}
            </div>
            {copyError && <p role="alert">La copie a échoué. Vous pouvez sélectionner le code et le copier manuellement.</p>}
        </section>}
        <Heading tag="h3">{team.memberCount} membre{team.memberCount > 1 ? "s" : ""}</Heading>
        <ul className="vc-gif-teams-members">
            {team.members.map(member => <li key={member.id}>
                <span className="vc-gif-teams-member-mark" aria-hidden="true">{member.role === "owner" ? <OwnerCrownIcon width={20} height={20} /> : <UserIcon width={20} height={20} />}</span>
                <div><strong>{member.displayName}{member.id === viewerId ? " (vous)" : ""}</strong><small>{member.role === "owner" ? "Propriétaire · " : ""}{member.gifCount} GIF · {member.mode === "auto" ? "Tous les favoris" : member.mode === "manual" ? "Sélection manuelle" : "Partage désactivé"}</small></div>
                {owner && member.id !== viewerId && <Button variant="dangerSecondary" size="small" disabled={busy || loading} onClick={() => ask({ title: `Retirer ${member.displayName} ?`, description: "Cette personne perdra l’accès à la team et ses GIF partagés en seront retirés.", label: "Retirer de la team", action: teamAction(() => gifTeams.removeMember(member.id)) })}>Retirer</Button>}
            </li>)}
        </ul>
        <div className="vc-gif-teams-danger-zone"><Button variant="dangerSecondary" size="small" disabled={busy || loading} onClick={() => ask(owner
            ? { title: `Supprimer ${team.name} ?`, description: "Tous les membres perdront l’accès et les collections partagées de cette team seront supprimées. Vos favoris Discord restent dans Discord.", label: "Supprimer la team", action: teamAction(() => gifTeams.deleteTeam()) }
            : { title: `Quitter ${team.name} ?`, description: "Vos GIF seront retirés de cette team et vous perdrez l’accès à ses collections. Une invitation sera nécessaire pour revenir.", label: "Quitter la team", action: teamAction(() => gifTeams.leaveTeam()) })}>{owner ? "Supprimer cette team" : "Quitter cette team"}</Button></div>
    </>;
}

export default function TeamsModal(props: ModalProps) {
    const snapshot = useTeamsSnapshot();
    const [view, setView] = useState<View>("gifs");
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [localError, setLocalError] = useState("");
    const { connected, loading, busy, error, teams, team, sharing, viewerId } = snapshot;
    useEffect(() => { setView("gifs"); setConfirmation(null); setLocalError(""); }, [team?.id, viewerId]);
    useEffect(() => { if (connected) void gifTeams.refresh(); }, [connected]);
    function insert(url: string) {
        try { insertGif(url); props.onClose(); } catch { setLocalError("Impossible d’ajouter ce GIF au brouillon. Réessayez depuis une conversation ouverte."); }
    }
    return <ModalRoot {...props} size={ModalSize.LARGE} className="vc-gif-teams" aria-labelledby="vc-gif-teams-title">
        <ModalHeader className="vc-gif-teams-header"><div><Heading tag="h2" id="vc-gif-teams-title"><GifIcon width={24} height={24} />Teams GIF</Heading><p>Vos favoris, entre vous.</p></div><ModalCloseButton onClick={props.onClose} /></ModalHeader>
        <ModalContent className="vc-gif-teams-body">
            {(error || localError) && <div className="vc-gif-teams-error" role="alert">{localError || error}</div>}
            {confirmation ? <div className="vc-gif-teams-confirm" role="alertdialog" aria-labelledby="vc-gif-teams-confirm-title" aria-describedby="vc-gif-teams-confirm-description"><Heading tag="h3" id="vc-gif-teams-confirm-title">{confirmation.title}</Heading><p id="vc-gif-teams-confirm-description">{confirmation.description}</p><div className="vc-gif-teams-actions"><Button variant="secondary" autoFocus disabled={busy} onClick={() => setConfirmation(null)}>Annuler</Button><Button variant="dangerPrimary" disabled={busy} onClick={() => {
                if (busy) return;
                void confirmation.action().then(() => { if (!gifTeams.getSnapshot().error) setConfirmation(null); });
            }}>{busy ? "En cours…" : confirmation.label}</Button></div></div>
                : !connected ? <div className="vc-gif-teams-onboarding"><GifIcon width={40} height={40} /><Heading tag="h3">Un espace pour vos GIF favoris</Heading><p>Créez une team privée ou rejoignez vos proches avec un code. Pour chaque team, partagez tous vos favoris automatiquement, une sélection, ou rien du tout.</p><Button disabled={loading || busy} onClick={() => void gifTeams.initializeConnection()}>{loading || busy ? "Connexion…" : "Activer mes teams"}</Button><p className="vc-gif-teams-muted">Votre identité Cloud permet de retrouver vos teams. Cette activation ne lance pas de sauvegarde. Sur un autre appareil, restaurez votre clé Cloud dans les réglages Midnightcord.</p></div>
                    : <div className="vc-gif-teams-layout">
                        <aside className="vc-gif-teams-sidebar" aria-label="Mes teams"><div className="vc-gif-teams-sidebar-title"><strong>Mes teams</strong><Button size="small" variant="secondary" disabled={busy || loading} onClick={() => void gifTeams.refresh()}>Actualiser</Button></div>
                            {loading && !teams.length && <p role="status">Chargement…</p>}
                            <ul className="vc-gif-teams-list">{teams.map(item => <li key={item.id}><button type="button" disabled={busy || loading} aria-current={item.id === team?.id ? "true" : undefined} onClick={() => void gifTeams.selectTeam(item.id)}><strong>{item.name}</strong><small>{item.memberCount} membre{item.memberCount > 1 ? "s" : ""} · {item.gifCount} GIF</small></button></li>)}</ul>
                            <TeamForms busy={busy || loading} />
                            <details className="vc-gif-teams-account"><summary>Mon espace GIF</summary><p>Supprimer cet espace efface vos partages, vos adhésions et les teams dont vous êtes propriétaire. Vos sauvegardes Cloud ne sont pas supprimées.</p><Button size="small" variant="dangerSecondary" disabled={busy || loading} onClick={() => setConfirmation({ title: "Supprimer votre espace GIF ?", description: "Vos teams, vos adhésions et tous vos GIF partagés seront supprimés. Les favoris Discord et les sauvegardes Cloud sont conservés.", label: "Supprimer mon espace GIF", action: () => gifTeams.deleteAccount() })}>Supprimer mon espace GIF</Button></details>
                        </aside>
                        <main className="vc-gif-teams-main" aria-busy={loading}>
                            {team ? <><div className="vc-gif-teams-team-heading"><Heading tag="h3">{team.name}</Heading><span>{team.memberCount} membre{team.memberCount > 1 ? "s" : ""}</span></div><div className="vc-gif-teams-tabs" role="group" aria-label="Sections de la team">{([["gifs", "GIF partagés"], ["sharing", "Mon partage"], ["members", "Membres"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
                                {view === "gifs" && <SharedGifs snapshot={snapshot} onInsert={insert} />}
                                {view === "sharing" && (sharing ? <SharingEditor key={team.id} snapshot={snapshot} sharing={sharing} /> : <p role="status">Chargement de votre partage…</p>)}
                                {view === "members" && <Members snapshot={snapshot} ask={setConfirmation} />}
                            </> : <div className="vc-gif-teams-empty"><UserIcon width={34} height={34} /><Heading tag="h3">Votre prochaine team commence ici</Heading><p>Créez une team ou utilisez un code d’invitation dans le panneau à côté.</p></div>}
                        </main>
                    </div>}
        </ModalContent>
    </ModalRoot>;
}
