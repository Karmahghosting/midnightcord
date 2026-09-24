import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(ROOT, "data");
const VALID_KEYS = new Set(["settings", "quickCss"]);
const TOKEN_PATTERN = /^mc1\.[A-Za-z0-9_-]{43}$/;
const CHECKSUM_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_ITEM_BYTES = 2 * 1024 * 1024;
const MAX_ACCOUNT_BYTES = 6 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_ITEM_BYTES + 1;
const MAX_HISTORY_VERSIONS = 5;
const COMMUNITY_STATE_TTL_MS = 10 * 60_000;
const COMMUNITY_REDIRECT_URI = "https://api.midnightcord.fr/v1/community/callback";
const ALLOWED_ORIGIN = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com$/i;

const locks = new Map();
const rateBuckets = new Map();

function baseHeaders(request) {
    const origin = request.headers.origin;
    return {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        ...(origin && ALLOWED_ORIGIN.test(origin) ? {
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin"
        } : {})
    };
}

function send(request, response, status, body, extraHeaders = {}) {
    const encoded = body == null
        ? null
        : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    response.writeHead(status, {
        ...baseHeaders(request),
        ...(encoded ? {
            "Content-Length": encoded.length,
            "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8"
        } : {}),
        ...extraHeaders
    });
    response.end(request.method === "HEAD" ? undefined : encoded ?? undefined);
}

function jsonError(request, response, status, code, message, extraHeaders = {}) {
    send(request, response, status, { error: code, message }, extraHeaders);
}

function sha256(data) {
    return createHash("sha256").update(data).digest("base64url");
}

function accountIdForToken(token) {
    return createHash("sha256").update(`midnightcord-cloud:${token}`).digest("hex");
}

function authenticate(request) {
    const header = request.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    if (!TOKEN_PATTERN.test(token)) return null;
    return { accountId: accountIdForToken(token) };
}

function clientAddress(request) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) return forwarded.split(",", 1)[0].trim();
    return request.socket.remoteAddress ?? "unknown";
}

function consumeRateLimit(id, now = Date.now()) {
    const windowMs = 60_000;
    const limit = 120;
    const previous = rateBuckets.get(id);
    if (!previous && rateBuckets.size >= 10_000) {
        for (const [key, value] of rateBuckets) {
            if (value.resetAt <= now) rateBuckets.delete(key);
        }
        if (rateBuckets.size >= 10_000) return false;
    }
    const bucket = !previous || previous.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : previous;
    bucket.count++;
    rateBuckets.set(id, bucket);
    return bucket.count <= limit;
}

function accountPaths(dataDir, accountId) {
    const directory = join(dataDir, "accounts", accountId);
    return {
        directory,
        manifest: join(directory, "manifest.json"),
        data: file => join(directory, file)
    };
}

async function readManifest(paths) {
    try {
        const parsed = JSON.parse(await readFile(paths.manifest, "utf8"));
        if (parsed?.schema !== 1 || typeof parsed.entries !== "object" || parsed.entries == null)
            throw new Error("invalid manifest");
        const isStoredEntry = (key, entry) => entry && typeof entry === "object"
            && Number.isSafeInteger(entry.version) && entry.version > 0
            && typeof entry.checksum === "string" && CHECKSUM_PATTERN.test(entry.checksum)
            && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= MAX_ITEM_BYTES
            && typeof entry.updatedAt === "string"
            && entry.etag === `\"${entry.version}-${entry.checksum}\"`
            && typeof entry.file === "string" && new RegExp(`^${key}-[1-9][0-9]*-[A-Za-z0-9_-]{12}\\.bin$`).test(entry.file);
        for (const [key, entry] of Object.entries(parsed.entries)) {
            if (!VALID_KEYS.has(key) || !isStoredEntry(key, entry))
                throw new Error("invalid manifest entry");
        }
        if (parsed.history !== undefined) {
            if (!parsed.history || typeof parsed.history !== "object" || Array.isArray(parsed.history)) throw new Error("invalid manifest history");
            for (const [key, entries] of Object.entries(parsed.history)) {
                if (!VALID_KEYS.has(key) || !Array.isArray(entries) || entries.length > MAX_HISTORY_VERSIONS || entries.some(entry => !isStoredEntry(key, entry)))
                    throw new Error("invalid manifest history entry");
            }
        }
        return parsed;
    } catch (error) {
        if (error?.code === "ENOENT") return { schema: 1, entries: {} };
        throw error;
    }
}

async function writeAtomic(path, data, mode = 0o600) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, data, { mode });
    await rename(temporary, path);
}

async function writeManifest(paths, manifest) {
    await writeAtomic(paths.manifest, `${JSON.stringify(manifest)}\n`);
}

function publicEntry(key, entry) {
    return {
        key,
        version: entry.version,
        checksum: entry.checksum,
        size: entry.size,
        updatedAt: entry.updatedAt,
        etag: entry.etag
    };
}

function withAccountLock(accountId, operation) {
    const previous = locks.get(accountId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    locks.set(accountId, current);
    return current.finally(() => {
        if (locks.get(accountId) === current) locks.delete(accountId);
    });
}

async function readBody(request, limit = MAX_REQUEST_BYTES) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) {
            const error = new Error("payload too large");
            error.code = "PAYLOAD_TOO_LARGE";
            throw error;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function accountSize(paths, manifest) {
    return Object.values(manifest.entries).reduce((sum, entry) => sum + (Number(entry.size) || 0), 0);
}

function parseRoute(pathname) {
    const match = pathname.match(/^\/v1\/cloud\/data\/([^/]+)$/);
    if (!match) return null;
    let key;
    try {
        key = decodeURIComponent(match[1]);
    } catch {
        return null;
    }
    return VALID_KEYS.has(key) ? key : null;
}

function parseHistoryRoute(pathname) {
    const match = pathname.match(/^\/v1\/cloud\/history\/([^/]+)(?:\/([1-9][0-9]*))?$/);
    if (!match) return null;
    let key;
    try {
        key = decodeURIComponent(match[1]);
    } catch {
        return null;
    }
    const version = match[2] ? Number(match[2]) : undefined;
    return VALID_KEYS.has(key) && (version === undefined || Number.isSafeInteger(version)) ? { key, version } : null;
}

function communityOAuthConfig(env) {
    const clientId = env.MIDNIGHTCORD_DISCORD_CLIENT_ID;
    const clientSecret = env.MIDNIGHTCORD_DISCORD_CLIENT_SECRET;
    const botToken = env.MIDNIGHTCORD_DISCORD_BOT_TOKEN;
    const guildId = env.MIDNIGHTCORD_COMMUNITY_GUILD_ID;
    if (!clientId || !clientSecret || !botToken || !/^\d{17,20}$/.test(guildId || "")) return null;
    return { clientId, clientSecret, botToken, guildId };
}

function readCookie(request, name) {
    for (const part of (request.headers.cookie || "").split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
    }
    return null;
}

function clearCommunityStateCookie() {
    return "midnightcord_community_oauth=; Path=/v1/community/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function sendCommunityPage(request, response, status, title, message) {
    const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main><h1>${title}</h1><p>${message}</p><p>Tu peux fermer cette fenêtre et revenir à Midnightcord.</p></main></html>`;
    response.writeHead(status, {
        ...baseHeaders(request),
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": clearCommunityStateCookie()
    });
    response.end(html);
}

async function fetchWithTimeout(fetchImpl, input, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

export function createCloudServer({ dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR, env = process.env, fetchImpl = fetch } = {}) {
    const communityFlows = new Map();
    return createServer(async (request, response) => {
        const url = new URL(request.url || "/", "http://localhost");

        if (request.method === "OPTIONS") {
            const origin = request.headers.origin;
            if (!origin || !ALLOWED_ORIGIN.test(origin)) {
                response.writeHead(403, baseHeaders(request));
                response.end();
                return;
            }
            response.writeHead(204, {
                ...baseHeaders(request),
                "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match, X-Midnightcord-Checksum, X-Midnightcord-Client, X-Midnightcord-Confirm",
                "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, PUT",
                "Access-Control-Max-Age": "600"
            });
            response.end();
            return;
        }

        if (url.pathname === "/v1/cloud/health" && (request.method === "GET" || request.method === "HEAD")) {
            send(request, response, 200, { ok: true, service: "midnightcord-cloud", schema: 1 });
            return;
        }

        if (url.pathname === "/v1/community/status" && (request.method === "GET" || request.method === "HEAD")) {
            send(request, response, 200, { enabled: Boolean(communityOAuthConfig(env)), name: "Midnightcord" });
            return;
        }

        if (url.pathname === "/v1/community/join") {
            const config = communityOAuthConfig(env);
            if (!config) {
                sendCommunityPage(request, response, 503, "Le serveur Midnightcord n’est pas encore configuré", "Cette option sera disponible lorsque le serveur communautaire et son application Discord seront prêts.");
                return;
            }
            if (request.method !== "GET") {
                jsonError(request, response, 405, "method_not_allowed", "This endpoint only accepts GET requests.", { Allow: "GET" });
                return;
            }

            const now = Date.now();
            for (const [state, expiresAt] of communityFlows) {
                if (expiresAt <= now) communityFlows.delete(state);
            }
            if (communityFlows.size >= 10_000) {
                sendCommunityPage(request, response, 429, "Réessaie dans quelques minutes", "Trop de demandes de connexion sont en cours. Réessaie plus tard.");
                return;
            }

            const state = randomBytes(32).toString("base64url");
            communityFlows.set(state, now + COMMUNITY_STATE_TTL_MS);
            const authorize = new URL("https://discord.com/oauth2/authorize");
            authorize.search = new URLSearchParams({
                client_id: config.clientId,
                response_type: "code",
                redirect_uri: COMMUNITY_REDIRECT_URI,
                scope: "identify guilds.join",
                state,
                prompt: "consent"
            }).toString();
            response.writeHead(302, {
                ...baseHeaders(request),
                "Cache-Control": "no-store",
                Location: authorize.toString(),
                "Set-Cookie": `midnightcord_community_oauth=${state}; Path=/v1/community/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
            });
            response.end();
            return;
        }

        if (url.pathname === "/v1/community/callback") {
            if (request.method !== "GET") {
                jsonError(request, response, 405, "method_not_allowed", "This endpoint only accepts GET requests.", { Allow: "GET" });
                return;
            }
            const config = communityOAuthConfig(env);
            const state = url.searchParams.get("state") || "";
            const cookie = readCookie(request, "midnightcord_community_oauth") || "";
            const expiresAt = communityFlows.get(state);
            communityFlows.delete(state);
            const stateBytes = Buffer.from(state);
            const cookieBytes = Buffer.from(cookie);
            const stateMatches = stateBytes.length > 0 && stateBytes.length === cookieBytes.length && timingSafeEqual(stateBytes, cookieBytes);
            if (!stateMatches || !expiresAt || expiresAt <= Date.now()) {
                sendCommunityPage(request, response, 400, "Demande expirée", "La demande Discord est invalide ou a expiré. Relance-la depuis les réglages Midnightcord.");
                return;
            }
            if (url.searchParams.has("error")) {
                sendCommunityPage(request, response, 200, "Adhésion annulée", "Aucun changement n’a été appliqué à ton compte Discord.");
                return;
            }
            if (!config) {
                sendCommunityPage(request, response, 503, "Service momentanément indisponible", "L’intégration Discord n’est pas configurée. Aucune donnée n’a été conservée.");
                return;
            }

            const code = url.searchParams.get("code");
            if (!code || code.length > 2048) {
                sendCommunityPage(request, response, 400, "Autorisation incomplète", "Discord n’a pas renvoyé une autorisation valide. Relance la demande depuis Midnightcord.");
                return;
            }

            try {
                const tokenResponse = await fetchWithTimeout(fetchImpl, "https://discord.com/api/v10/oauth2/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: config.clientId,
                        client_secret: config.clientSecret,
                        grant_type: "authorization_code",
                        code,
                        redirect_uri: COMMUNITY_REDIRECT_URI
                    })
                });
                if (!tokenResponse.ok) {
                    sendCommunityPage(request, response, 502, "Discord n’a pas validé l’autorisation", "Aucun jeton utilisateur n’a été conservé. Tu peux réessayer depuis Midnightcord.");
                    return;
                }
                const token = await tokenResponse.json();
                const scopes = typeof token.scope === "string" ? token.scope.split(" ") : [];
                if (typeof token.access_token !== "string" || !scopes.includes("identify") || !scopes.includes("guilds.join")) {
                    sendCommunityPage(request, response, 502, "Autorisation Discord incomplète", "Midnightcord a besoin de l’autorisation de rejoindre le serveur. Aucune donnée n’a été conservée.");
                    return;
                }

                const userResponse = await fetchWithTimeout(fetchImpl, "https://discord.com/api/v10/users/@me", {
                    headers: { Authorization: `Bearer ${token.access_token}` }
                });
                if (!userResponse.ok) {
                    sendCommunityPage(request, response, 502, "Impossible de vérifier ton compte Discord", "Aucun changement n’a été appliqué. Tu peux réessayer depuis Midnightcord.");
                    return;
                }
                const user = await userResponse.json();
                if (typeof user.id !== "string" || !/^\d{17,20}$/.test(user.id)) {
                    sendCommunityPage(request, response, 502, "Compte Discord invalide", "Aucun changement n’a été appliqué. Tu peux réessayer depuis Midnightcord.");
                    return;
                }

                const joinResponse = await fetchWithTimeout(fetchImpl, `https://discord.com/api/v10/guilds/${config.guildId}/members/${user.id}`, {
                    method: "PUT",
                    headers: {
                        Authorization: `Bot ${config.botToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ access_token: token.access_token })
                });
                if (joinResponse.status === 201) {
                    sendCommunityPage(request, response, 200, "Tu as rejoint Midnightcord", "Ton compte Discord a rejoint le serveur. Si la vérification du serveur est activée, termine les étapes affichées par Discord.");
                } else if (joinResponse.status === 204) {
                    sendCommunityPage(request, response, 200, "Tu es déjà membre", "Ton compte Discord est déjà dans le serveur Midnightcord.");
                } else {
                    sendCommunityPage(request, response, 502, "Adhésion impossible pour le moment", "Le serveur n’est peut-être pas encore disponible. Aucun jeton utilisateur n’a été conservé.");
                }
            } catch {
                sendCommunityPage(request, response, 502, "Connexion à Discord interrompue", "Aucun jeton utilisateur n’a été conservé. Réessaie depuis Midnightcord.");
            }
            return;
        }

        const auth = authenticate(request);
        if (!auth) {
            jsonError(request, response, 401, "unauthorized", "A valid Midnightcord Cloud credential is required.", {
                "WWW-Authenticate": "Bearer"
            });
            return;
        }

        if (!consumeRateLimit(`${auth.accountId}:${clientAddress(request)}`)) {
            jsonError(request, response, 429, "rate_limited", "Too many Cloud requests. Try again shortly.");
            return;
        }

        const paths = accountPaths(dataDir, auth.accountId);

        try {
            if (url.pathname === "/v1/cloud/manifest" && (request.method === "GET" || request.method === "HEAD")) {
                const manifest = await readManifest(paths);
                const entries = Object.entries(manifest.entries).map(([key, entry]) => publicEntry(key, entry));
                send(request, response, 200, { schema: 1, entries });
                return;
            }

            const historyRoute = parseHistoryRoute(url.pathname);
            if (historyRoute && (request.method === "GET" || request.method === "HEAD")) {
                const manifest = await readManifest(paths);
                if (historyRoute.version === undefined) {
                    const entries = (manifest.history?.[historyRoute.key] ?? []).map(entry => publicEntry(historyRoute.key, entry));
                    send(request, response, 200, { key: historyRoute.key, entries });
                    return;
                }
                const entry = (manifest.history?.[historyRoute.key] ?? []).find(item => item.version === historyRoute.version);
                if (!entry) {
                    jsonError(request, response, 404, "not_found", "This Cloud version is no longer available.");
                    return;
                }
                const body = await readFile(paths.data(entry.file));
                response.writeHead(200, {
                    ...baseHeaders(request),
                    "Content-Length": body.length,
                    "Content-Type": "application/octet-stream",
                    ETag: entry.etag,
                    "X-Midnightcord-Checksum": entry.checksum,
                    "X-Midnightcord-Version": String(entry.version)
                });
                response.end(request.method === "HEAD" ? undefined : body);
                return;
            }

            const key = parseRoute(url.pathname);
            if (key && (request.method === "GET" || request.method === "HEAD")) {
                const manifest = await readManifest(paths);
                const entry = manifest.entries[key];
                if (!entry) {
                    jsonError(request, response, 404, "not_found", "This Cloud item does not exist.");
                    return;
                }
                const body = await readFile(paths.data(entry.file));
                response.writeHead(200, {
                    ...baseHeaders(request),
                    "Content-Length": body.length,
                    "Content-Type": "application/octet-stream",
                    ETag: entry.etag,
                    "X-Midnightcord-Checksum": entry.checksum,
                    "X-Midnightcord-Version": String(entry.version)
                });
                response.end(request.method === "HEAD" ? undefined : body);
                return;
            }

            if (key && request.method === "PUT") {
                const checksum = request.headers["x-midnightcord-checksum"];
                if (typeof checksum !== "string" || !CHECKSUM_PATTERN.test(checksum)) {
                    jsonError(request, response, 400, "invalid_checksum", "A valid payload checksum is required.");
                    return;
                }
                const body = await readBody(request);
                if (!body.length || body.length > MAX_ITEM_BYTES) {
                    jsonError(request, response, 413, "payload_too_large", "Cloud items must be between 1 byte and 2 MiB.");
                    return;
                }
                if (sha256(body) !== checksum) {
                    jsonError(request, response, 422, "checksum_mismatch", "The encrypted payload checksum does not match.");
                    return;
                }

                await withAccountLock(auth.accountId, async () => {
                    const manifest = await readManifest(paths);
                    const previous = manifest.entries[key];
                    const condition = request.headers["if-match"];
                    if (!condition) {
                        jsonError(request, response, 428, "precondition_required", "If-Match is required for Cloud writes.");
                        return;
                    }
                    if ((previous && condition !== previous.etag) || (!previous && condition !== "*")) {
                        jsonError(request, response, 412, "version_conflict", "The Cloud item changed on another device.", previous ? { ETag: previous.etag } : {});
                        return;
                    }
                    const total = await accountSize(paths, manifest) - (previous?.size ?? 0) + body.length;
                    if (total > MAX_ACCOUNT_BYTES) {
                        jsonError(request, response, 413, "account_quota", "The 6 MiB Cloud account quota would be exceeded.");
                        return;
                    }

                    const version = (previous?.version ?? 0) + 1;
                    const etag = `\"${version}-${checksum}\"`;
                    const file = `${key}-${version}-${checksum.slice(0, 12)}.bin`;
                    const entry = { version, checksum, size: body.length, updatedAt: new Date().toISOString(), etag, file };
                    manifest.history ??= {};
                    const history = manifest.history[key] ??= [];
                    if (previous) history.unshift(previous);
                    const retired = history.splice(MAX_HISTORY_VERSIONS);
                    if (!history.length) delete manifest.history[key];
                    if (!Object.keys(manifest.history).length) delete manifest.history;
                    await writeAtomic(paths.data(file), body);
                    manifest.entries[key] = entry;
                    try {
                        await writeManifest(paths, manifest);
                    } catch (error) {
                        await rm(paths.data(file), { force: true });
                        throw error;
                    }
                    for (const old of retired) {
                        if (old.file !== file) await rm(paths.data(old.file), { force: true });
                    }
                    send(request, response, previous ? 200 : 201, publicEntry(key, entry), { ETag: etag });
                });
                return;
            }

            if (key && request.method === "DELETE") {
                await withAccountLock(auth.accountId, async () => {
                    const manifest = await readManifest(paths);
                    const entry = manifest.entries[key];
                    if (!entry) {
                        response.writeHead(204, baseHeaders(request));
                        response.end();
                        return;
                    }
                    if (request.headers["if-match"] !== entry.etag) {
                        jsonError(request, response, 412, "version_conflict", "The Cloud item changed on another device.", { ETag: entry.etag });
                        return;
                    }
                    delete manifest.entries[key];
                    const history = manifest.history?.[key] ?? [];
                    delete manifest.history?.[key];
                    if (manifest.history && !Object.keys(manifest.history).length) delete manifest.history;
                    await writeManifest(paths, manifest);
                    await rm(paths.data(entry.file), { force: true });
                    await Promise.all(history.map(item => rm(paths.data(item.file), { force: true })));
                    response.writeHead(204, baseHeaders(request));
                    response.end();
                });
                return;
            }

            if (url.pathname === "/v1/cloud/account" && request.method === "DELETE") {
                if (request.headers["x-midnightcord-confirm"] !== "delete-account") {
                    jsonError(request, response, 400, "confirmation_required", "Account deletion requires an explicit confirmation header.");
                    return;
                }
                await withAccountLock(auth.accountId, async () => {
                    await rm(paths.directory, { recursive: true, force: true });
                    response.writeHead(204, baseHeaders(request));
                    response.end();
                });
                return;
            }

            jsonError(request, response, 404, "not_found", "Unknown Midnightcord Cloud endpoint.");
        } catch (error) {
            if (error?.code === "PAYLOAD_TOO_LARGE") {
                if (!response.headersSent) jsonError(request, response, 413, "payload_too_large", "The encrypted payload is too large.");
                return;
            }
            console.error("[cloud-api] request failed", error);
            if (!response.headersSent) jsonError(request, response, 500, "internal_error", "Midnightcord Cloud could not complete this request.");
            else response.destroy();
        }
    });
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    const host = process.env.HOST || "127.0.0.1";
    const port = Number.parseInt(process.env.PORT || "4175", 10);
    const server = createCloudServer();
    server.listen(port, host, () => console.log(`Midnightcord Cloud listening on ${host}:${port}`));
}
