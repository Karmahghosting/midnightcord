import { createHash, randomBytes } from "node:crypto";
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
        for (const [key, entry] of Object.entries(parsed.entries)) {
            if (!VALID_KEYS.has(key) || !entry || typeof entry !== "object" || !new RegExp(`^${key}-[1-9][0-9]*-[A-Za-z0-9_-]{12}\\.bin$`).test(entry.file))
                throw new Error("invalid manifest entry");
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

export function createCloudServer({ dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR } = {}) {
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
                    await writeAtomic(paths.data(file), body);
                    manifest.entries[key] = entry;
                    try {
                        await writeManifest(paths, manifest);
                    } catch (error) {
                        await rm(paths.data(file), { force: true });
                        throw error;
                    }
                    if (previous?.file && previous.file !== file) await rm(paths.data(previous.file), { force: true });
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
                    await writeManifest(paths, manifest);
                    await rm(paths.data(entry.file), { force: true });
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
