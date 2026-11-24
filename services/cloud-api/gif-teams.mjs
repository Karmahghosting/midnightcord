import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";

const BASE = "/v1/cloud/gif-teams";
const TEAM_ID = /^[A-Za-z0-9_-]{22}$/;
const ACCOUNT_ID = /^[a-f0-9]{64}$/;
const MODES = new Set(["off", "manual", "auto"]);
const MAX_BODY = 2 * 1024 * 1024;
const MAX_TOTAL_TEAMS = 1000;
const MAX_PENDING_WRITES = 4;
const INVITE_TTL = 24 * 60 * 60_000;
const LIMITS = Object.freeze({ maxTeams: 10, maxMembers: 25, maxGifs: 1000 });
const PREVIEW_HOSTS = new Set(["media.tenor.com", "c.tenor.com", "giphy.com", "cdn.discordapp.com", "media.discordapp.net", "i.imgur.com"]);

class GifTeamsError extends Error {
    constructor(status, code, message, headers = {}) {
        super(message);
        Object.assign(this, { status, code, headers });
    }
}

function fail(status, code, message, headers) { throw new GifTeamsError(status, code, message, headers); }
function missing() { fail(404, "not_found", "Cette team ou cette invitation n’est plus disponible."); }
function hash(value) { return createHash("sha256").update(value).digest("base64url"); }
function memberId(accountId) { return hash(`midnightcord-gif-teams:${accountId}`).slice(0, 24); }

function text(value, maximum, label) {
    if (typeof value !== "string") fail(400, "invalid_input", `${label} est requis.`);
    const clean = value.trim().normalize("NFC");
    if (!clean || clean.length > maximum || /[\u0000-\u001f\u007f]/.test(clean))
        fail(400, "invalid_input", `${label} doit contenir entre 1 et ${maximum} caractères.`);
    return clean;
}

function publicUrl(value) {
    if (typeof value !== "string" || !value || value.length > 2048) return null;
    let parsed;
    try { parsed = new URL(value); } catch { return null; }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
        || !host.includes(".") || isIP(host) || host.startsWith("[")
        || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)
        || host.endsWith(".home.arpa")) return null;
    parsed.hash = "";
    return parsed.href;
}

function previewUrl(value) {
    const url = publicUrl(value);
    if (!url) return "";
    const host = new URL(url).hostname.toLowerCase();
    return PREVIEW_HOSTS.has(host) || host.endsWith(".giphy.com") ? url : "";
}

function gifsFromInput(input) {
    if (!Array.isArray(input) || input.length > LIMITS.maxGifs)
        fail(400, "invalid_gifs", `Une collection peut contenir au maximum ${LIMITS.maxGifs} GIF.`);
    const seen = new Set();
    const gifs = [];
    for (const item of input) {
        if (!item || typeof item !== "object" || Array.isArray(item)) fail(400, "invalid_gifs", "GIF invalide.");
        const url = publicUrl(item.url);
        if (!url) fail(400, "invalid_gif_url", "Les GIF doivent utiliser une adresse HTTPS publique.");
        if (seen.has(url)) continue;
        seen.add(url);
        const dimension = value => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 16384 ? Math.round(value) : 0;
        const title = typeof item.title === "string" ? item.title.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "";
        gifs.push({ id: hash(url), url, src: previewUrl(item.src), width: dimension(item.width), height: dimension(item.height), title, format: item.format === 2 ? 2 : 1 });
    }
    return gifs;
}

function validMetadata(team) {
    return team?.schema === 1 && TEAM_ID.test(team.id) && typeof team.name === "string"
        && ACCOUNT_ID.test(team.owner) && typeof team.updatedAt === "string"
        && Array.isArray(team.members) && team.members.length > 0 && team.members.length <= LIMITS.maxMembers
        && team.members.some(member => member.accountId === team.owner)
        && new Set(team.members.map(member => member.accountId)).size === team.members.length
        && team.members.every(member => ACCOUNT_ID.test(member.accountId) && typeof member.displayName === "string"
            && MODES.has(member.mode) && Number.isSafeInteger(member.revision) && member.revision >= 0
            && Number.isSafeInteger(member.gifCount) && member.gifCount >= 0 && member.gifCount <= LIMITS.maxGifs
            && typeof member.updatedAt === "string"
            && (member.file === null ? member.gifCount === 0 : member.gifCount > 0 && new RegExp(`^share-${memberId(member.accountId)}-${member.revision}-[a-f0-9]{12}\\.json$`).test(member.file))
            && (member.mode !== "off" || member.gifCount === 0))
        && (!team.invite || (typeof team.invite.hash === "string" && /^[A-Za-z0-9_-]{43}$/.test(team.invite.hash) && Number.isSafeInteger(team.invite.expiresAt)));
}

/** One process owns the data directory, matching the Cloud systemd service. */
export function createGifTeams({ dataDir, now, writeAtomic, readBody, send, jsonError, isAllowedOrigin, clientAddress }) {
    const directory = join(dataDir, "gif-teams", "teams");
    const teams = new Map();
    const memberships = new Map();
    const rateBuckets = new Map();
    let pendingWrites = 0;
    let initialization;
    let initializationFailedAt = 0;
    let pending = Promise.resolve();

    const teamDirectory = id => join(directory, id);
    const stamp = () => new Date(now()).toISOString();
    function consumeRateLimit(address) {
        const timestamp = now();
        let bucket = rateBuckets.get(address);
        if (!bucket && rateBuckets.size >= 10_000) {
            for (const [key, value] of rateBuckets) if (value.resetAt <= timestamp) rateBuckets.delete(key);
            if (rateBuckets.size >= 10_000) return false;
        }
        if (!bucket || bucket.resetAt <= timestamp) {
            bucket = { count: 0, resetAt: timestamp + 60_000 };
            rateBuckets.set(address, bucket);
        }
        return ++bucket.count <= 120;
    }
    function index(team) {
        const previous = teams.get(team.id);
        for (const member of previous?.members ?? []) {
            const set = memberships.get(member.accountId);
            set?.delete(team.id);
            if (!set?.size) memberships.delete(member.accountId);
        }
        if (team.deleted) { teams.delete(team.id); return; }
        teams.set(team.id, team);
        for (const member of team.members) {
            if (!memberships.has(member.accountId)) memberships.set(member.accountId, new Set());
            memberships.get(member.accountId).add(team.id);
        }
    }

    async function initialize() {
        if (!initialization || initializationFailedAt && now() - initializationFailedAt >= 60_000) {
            initializationFailedAt = 0;
            initialization = (async () => {
                // A missing root may mean an unmounted persistent volume; do not invent an empty service.
                if (!(await stat(dataDir)).isDirectory()) throw new Error("GIF team data directory unavailable");
                await mkdir(directory, { recursive: true, mode: 0o700 });
                const loaded = [];
                for (const entry of await readdir(directory, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    if (/^\.deleted-[A-Za-z0-9_-]{22}-[a-f0-9]{12}$/.test(entry.name)) {
                        await rm(join(directory, entry.name), { recursive: true, force: true });
                        continue;
                    }
                    if (!TEAM_ID.test(entry.name)) continue;
                    let source;
                    try { source = await readFile(join(directory, entry.name, "team.json"), "utf8"); }
                    catch (error) {
                        if (error?.code !== "ENOENT") throw error;
                        // A crashed initial write never committed this team.
                        await rm(join(directory, entry.name), { recursive: true, force: true });
                        continue;
                    }
                    const team = JSON.parse(source);
                    if (!validMetadata(team) || team.id !== entry.name) throw new Error("Invalid GIF team metadata");
                    const referenced = new Set(team.members.map(member => member.file).filter(Boolean));
                    for (const file of await readdir(join(directory, entry.name), { withFileTypes: true })) {
                        if (file.isFile() && /^share-[A-Za-z0-9_-]{24}-[0-9]+-[a-f0-9]{12}\.json$/.test(file.name) && !referenced.has(file.name))
                            await rm(join(directory, entry.name, file.name), { force: true });
                    }
                    loaded.push(team);
                }
                teams.clear();
                memberships.clear();
                for (const team of loaded) index(team);
            })().catch(error => { initializationFailedAt = now(); throw error; });
        }
        try { await initialization; } catch { fail(503, "gif_teams_unavailable", "Les teams GIF sont momentanément indisponibles."); }
    }

    function locked(operation) {
        const result = pending.catch(() => undefined).then(async () => { await initialize(); return operation(); });
        pending = result;
        return result;
    }

    function getTeam(id, accountId) {
        const stored = TEAM_ID.test(id) && teams.get(id);
        if (!stored || !stored.members.some(member => member.accountId === accountId)) missing();
        // Mutations must not leak through the read index before the atomic metadata commit.
        return structuredClone(stored);
    }

    function ownerOnly(team, accountId) {
        if (team.owner !== accountId) fail(403, "owner_required", "Seul le propriétaire peut effectuer cette action.");
    }

    function checkTeamQuota(accountId) {
        if ((memberships.get(accountId)?.size ?? 0) >= LIMITS.maxTeams)
            fail(409, "team_limit", `Tu peux rejoindre au maximum ${LIMITS.maxTeams} teams.`);
    }

    function summary(team, accountId) {
        const self = team.members.find(member => member.accountId === accountId);
        return {
            id: team.id, name: team.name, role: team.owner === accountId ? "owner" : "member",
            memberCount: team.members.length, gifCount: team.members.reduce((sum, member) => sum + member.gifCount, 0), updatedAt: team.updatedAt,
            mode: self.mode, sharingRevision: self.revision
        };
    }

    function detail(team, accountId) {
        return {
            ...summary(team, accountId), ownerId: memberId(team.owner),
            members: team.members.map(member => ({
                id: memberId(member.accountId), displayName: member.displayName,
                role: member.accountId === team.owner ? "owner" : "member", mode: member.mode,
                gifCount: member.gifCount, updatedAt: member.updatedAt
            }))
        };
    }

    async function save(team) {
        await writeAtomic(join(teamDirectory(team.id), "team.json"), `${JSON.stringify(team)}\n`);
        index(team);
    }

    function newMember(accountId, displayName) {
        return { accountId, displayName, mode: "off", revision: 0, gifCount: 0, file: null, updatedAt: stamp() };
    }

    async function collection(team, member) {
        if (!member.file) return [];
        const gifs = JSON.parse(await readFile(join(teamDirectory(team.id), member.file), "utf8"));
        if (!Array.isArray(gifs) || gifs.length !== member.gifCount) throw new Error("Invalid GIF collection");
        return gifs;
    }

    async function removeMember(team, accountId) {
        const removed = team.members.find(member => member.accountId === accountId);
        team.members = team.members.filter(member => member.accountId !== accountId);
        team.updatedAt = stamp();
        await save(team);
        if (removed?.file) await rm(join(teamDirectory(team.id), removed.file), { force: true });
    }

    async function removeTeam(team) {
        const retired = join(directory, `.deleted-${team.id}-${randomBytes(6).toString("hex")}`);
        await rename(teamDirectory(team.id), retired);
        index({ ...team, deleted: true });
        await rm(retired, { recursive: true, force: true });
    }

    async function eraseAccount(accountId) {
        return locked(async () => {
            for (const id of [...memberships.get(accountId) ?? []]) {
                const team = getTeam(id, accountId);
                if (team.owner === accountId) await removeTeam(team);
                else await removeMember(team, accountId);
            }
        });
    }

    async function input(request) {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? ""))
            fail(415, "content_type_required", "Le corps de la demande doit être du JSON.");
        let body;
        try { body = JSON.parse((await readBody(request, MAX_BODY)).toString("utf8")); }
        catch (error) {
            if (error?.code === "PAYLOAD_TOO_LARGE") fail(413, "payload_too_large", "La collection dépasse la limite de 2 Mio.");
            fail(400, "invalid_json", "JSON invalide.");
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "invalid_json", "Un objet JSON est requis.");
        return body;
    }

    function method(request, allowed) {
        if (!allowed.includes(request.method)) fail(405, "method_not_allowed", "Méthode non autorisée.", { Allow: allowed.join(", ") });
    }

    async function handle(request, response, url, accountId) {
        if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
        let reservedWrite = false;
        try {
            if (!consumeRateLimit(clientAddress(request)))
                fail(429, "rate_limited", "Trop de demandes. Réessaie dans une minute.", { "Retry-After": "60" });
            if (request.headers.origin && !isAllowedOrigin(request.headers.origin))
                fail(403, "origin_not_allowed", "Cette origine n’est pas autorisée.");
            const tail = url.pathname.slice(BASE.length);
            if (tail === "/account") {
                method(request, ["DELETE"]);
                await eraseAccount(accountId);
                send(request, response, 204);
                return true;
            }
            const needsBody = (request.method === "POST" || request.method === "PUT")
                && (!tail || tail === "/join" || tail.endsWith("/sharing"));
            if (needsBody) {
                if (pendingWrites >= MAX_PENDING_WRITES)
                    fail(429, "gif_teams_busy", "Le service traite déjà plusieurs collections. Réessaie dans un instant.", { "Retry-After": "2" });
                pendingWrites++;
                reservedWrite = true;
            }
            const body = needsBody ? await input(request) : null;
            const result = await locked(async () => {
                if (!tail) {
                    method(request, ["GET", "HEAD", "POST"]);
                    if (request.method !== "POST") return { status: 200, body: {
                        viewerId: memberId(accountId), limits: LIMITS,
                        teams: [...memberships.get(accountId) ?? []].map(id => summary(teams.get(id), accountId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                    } };
                    checkTeamQuota(accountId);
                    if (teams.size >= MAX_TOTAL_TEAMS)
                        fail(503, "team_capacity", "La capacité du service est atteinte. Les teams existantes restent disponibles.");
                    const team = {
                        schema: 1, id: randomBytes(16).toString("base64url"), name: text(body.name, 64, "Le nom de la team"),
                        owner: accountId, updatedAt: stamp(), members: [newMember(accountId, text(body.displayName, 80, "Le nom affiché"))], invite: null
                    };
                    await save(team);
                    return { status: 201, body: detail(team, accountId) };
                }
                if (tail === "/join") {
                    method(request, ["POST"]);
                    const match = typeof body.code === "string" && /^mgt1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(body.code);
                    if (!match) missing();
                    const stored = teams.get(match[1]);
                    if (!stored?.invite || stored.invite.expiresAt <= now() || stored.invite.hash !== hash(body.code)) missing();
                    if (stored.members.some(member => member.accountId === accountId))
                        return { status: 200, body: detail(stored, accountId) };
                    checkTeamQuota(accountId);
                    if (stored.members.length >= LIMITS.maxMembers) fail(409, "member_limit", "Cette team a atteint sa limite de membres.");
                    const team = structuredClone(stored);
                    team.members.push(newMember(accountId, text(body.displayName, 80, "Le nom affiché")));
                    team.invite = null;
                    team.updatedAt = stamp();
                    await save(team);
                    return { status: 200, body: detail(team, accountId) };
                }
                const match = /^\/([A-Za-z0-9_-]{22})(?:\/(sharing|gifs|invites|membership|members\/[A-Za-z0-9_-]{24}))?$/.exec(tail);
                if (!match) missing();
                const team = getTeam(match[1], accountId);
                const action = match[2];
                const self = team.members.find(member => member.accountId === accountId);
                if (!action) {
                    method(request, ["GET", "HEAD", "DELETE"]);
                    if (request.method === "DELETE") {
                        ownerOnly(team, accountId);
                        await removeTeam(team);
                        return { status: 204 };
                    }
                    return { status: 200, body: detail(team, accountId) };
                }
                if (action === "sharing") {
                    method(request, ["GET", "HEAD", "PUT"]);
                    if (request.method !== "PUT") return { status: 200, body: { mode: self.mode, gifs: await collection(team, self), revision: self.revision } };
                    if (!MODES.has(body.mode)) fail(400, "invalid_mode", "Choisis le partage automatique, manuel ou désactivé.");
                    if (!Number.isSafeInteger(body.revision) || body.revision !== self.revision)
                        fail(409, "version_conflict", "Ta collection a changé sur un autre appareil. Recharge-la avant de réessayer.");
                    const gifs = gifsFromInput(body.gifs);
                    if (body.mode === "off" && gifs.length) fail(400, "invalid_gifs", "Le partage désactivé doit contenir une collection vide.");
                    const previousFile = self.file;
                    self.displayName = text(body.displayName, 80, "Le nom affiché");
                    self.mode = body.mode;
                    self.revision++;
                    self.gifCount = gifs.length;
                    self.updatedAt = stamp();
                    self.file = gifs.length ? `share-${memberId(accountId)}-${self.revision}-${randomBytes(6).toString("hex")}.json` : null;
                    if (self.file) await writeAtomic(join(teamDirectory(team.id), self.file), `${JSON.stringify(gifs)}\n`);
                    team.updatedAt = stamp();
                    try { await save(team); }
                    catch (error) {
                        if (self.file) await rm(join(teamDirectory(team.id), self.file), { force: true }).catch(() => {});
                        throw error;
                    }
                    if (previousFile) await rm(join(teamDirectory(team.id), previousFile), { force: true });
                    return { status: 200, body: { mode: self.mode, gifs, revision: self.revision } };
                }
                if (action === "gifs") {
                    method(request, ["GET", "HEAD"]);
                    const number = (key, fallback, maximum) => {
                        const value = url.searchParams.get(key);
                        if (value === null) return fallback;
                        if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum)
                            fail(400, "invalid_page", "Pagination invalide.");
                        return Number(value);
                    };
                    const offset = number("offset", 0, LIMITS.maxMembers * LIMITS.maxGifs);
                    const limit = number("limit", 60, 100);
                    if (!limit) fail(400, "invalid_page", "La taille de page doit être positive.");
                    const filter = url.searchParams.get("member");
                    if (filter && !team.members.some(member => memberId(member.accountId) === filter)) missing();
                    const members = team.members.filter(member => member.mode !== "off" && (!filter || memberId(member.accountId) === filter));
                    const total = members.reduce((sum, member) => sum + member.gifCount, 0);
                    const items = [];
                    let skipped = 0;
                    for (const member of members) {
                        if (skipped + member.gifCount <= offset) { skipped += member.gifCount; continue; }
                        if (items.length >= limit) break;
                        const gifs = await collection(team, member);
                        const start = Math.max(0, offset - skipped);
                        items.push(...gifs.slice(start, start + limit - items.length).map(gif => ({ ...gif, memberId: memberId(member.accountId), displayName: member.displayName })));
                        skipped += member.gifCount;
                    }
                    return { status: 200, body: { items, total, offset, nextOffset: offset + items.length < total ? offset + items.length : null } };
                }
                if (action === "invites") {
                    method(request, ["POST", "DELETE"]);
                    ownerOnly(team, accountId);
                    if (request.method === "DELETE") {
                        team.invite = null;
                        await save(team);
                        return { status: 204 };
                    }
                    const code = `mgt1.${team.id}.${randomBytes(32).toString("base64url")}`;
                    team.invite = { hash: hash(code), expiresAt: now() + INVITE_TTL };
                    await save(team);
                    return { status: 201, body: { code, expiresAt: new Date(team.invite.expiresAt).toISOString() } };
                }
                if (action === "membership") {
                    method(request, ["DELETE"]);
                    if (team.owner === accountId) fail(409, "owner_cannot_leave", "Supprime la team pour la quitter en tant que propriétaire.");
                    await removeMember(team, accountId);
                    return { status: 204 };
                }
                if (action.startsWith("members/")) {
                    method(request, ["DELETE"]);
                    ownerOnly(team, accountId);
                    const removed = team.members.find(member => memberId(member.accountId) === action.slice(8));
                    if (!removed) missing();
                    if (removed.accountId === team.owner) fail(409, "owner_cannot_leave", "Le propriétaire ne peut pas être retiré.");
                    await removeMember(team, removed.accountId);
                    return { status: 204 };
                }
                missing();
            });
            send(request, response, result.status, result.body);
        } catch (error) {
            if (error instanceof GifTeamsError) jsonError(request, response, error.status, error.code, error.message, error.headers);
            else {
                // Do not log request payloads, invitation codes, URLs or credentials.
                console.error("[gif-teams] storage operation failed", error?.code ?? error?.name ?? "Error");
                jsonError(request, response, 503, "gif_teams_unavailable", "Les teams GIF sont momentanément indisponibles.");
            }
        } finally {
            if (reservedWrite) pendingWrites--;
        }
        return true;
    }
    return { handle, eraseAccount };
}
