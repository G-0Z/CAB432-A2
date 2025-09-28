// src/services/cache.service.js
import Memcached from "memcached";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 60 });

// If you set ElastiCache Memcached endpoint (e.g. mycache.xxxxx.cfg.apse2.cache.amazonaws.com:11211),
// we'll use it. Otherwise we fall back to a tiny in-memory cache (good for local dev).
const host = process.env.CACHE_HOST || "";

let mem = null;
function getMemcachedClient() {
    if (!host) return null;
    if (mem) return mem;
    mem = new Memcached(host, { retries: 1, timeout: 500, remove: true });
    return mem;
}

// --- In-memory fallback with TTL ---
const memFallback = new Map(); // key -> { value, expiresAt }
function nowSec() { return Math.floor(Date.now() / 1000); }

function fallbackGet(key) {
    const rec = memFallback.get(key);
    if (!rec) return null;
    if (rec.expiresAt && rec.expiresAt <= nowSec()) {
        memFallback.delete(key);
        return null;
    }
    return rec.value;
}

function fallbackSet(key, value, ttlSec) {
    const expiresAt = ttlSec ? nowSec() + ttlSec : null;
    memFallback.set(key, { value, expiresAt });
}

function fallbackDel(key) {
    memFallback.delete(key);
}

// --- Public API ---
async function get(key) {
    const c = getMemcachedClient();
    if (!c) return fallbackGet(key);
    return new Promise((resolve) => {
        c.get(key, (_err, data) => resolve(data ?? null));
    });
}

async function set(key, value, ttlSeconds = 60) {
    const c = getMemcachedClient();
    if (!c) return fallbackSet(key, value, ttlSeconds);
    return new Promise((resolve) => {
        c.set(key, value, ttlSeconds, () => resolve());
    });
}

// Note: Memcached has no wildcard delete; we keep cache TTLs short.
// For prefix patterns like "notes:list:user:*" this will no-op on Memcached
// and rely on short TTL. For exact keys it deletes normally.
async function del(keyOrPrefix) {
    const c = getMemcachedClient();
    if (!c) {
        if (keyOrPrefix.includes("*")) return; // no wildcard support in fallback either
        return fallbackDel(keyOrPrefix);
    }
    if (keyOrPrefix.includes("*")) return; // no wildcard support
    return new Promise((resolve) => {
        c.del(keyOrPrefix, () => resolve());
    });
}

export default {
    get,
    set,
    del,
};