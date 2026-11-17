'use strict';

/**
 * Resilient Dual-Tier Query Result Cache (`aiCache.service.js`).
 *
 * Tier 1: Optional shared Redis client (only when `REDIS_URL` is configured and an
 *         compatible Redis client module is available).
 * Tier 2: Bounded, zero-dependency, Tenant-Scoped In-Memory LRU + TTL Map
 *         (`maxEntries` default 500) so `pkg` desktop (`backend.exe`) and local
 *         setups enjoy `<1ms` query caching even without an external Redis server.
 *
 * STRICT PRIVACY GUARANTEE:
 *   - NEVER stores chat messages, voice transcripts, audio buffers, or user prompts.
 *   - Explicitly throws if any caller attempts to write a conversation/transcript key.
 *   - Every cache key includes `financeId` + `roleScope` + `userScope` so tenants
 *     and permission tiers can NEVER share cached results.
 */

const crypto = require('crypto');
const { getAssistantConfig } = require('../config/assistant.config');
const { isValidUuid, FinanceScopeError } = require('../security/financeScopeValidator');

const FORBIDDEN_CACHE_CATEGORIES = /chat|conversation|transcript|message|audio|voice_turn|memory/i;

class BoundedLruTtlMap {
  constructor(maxEntries = 500) {
    this.maxEntries = Math.max(20, maxEntries);
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // Refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlSec) {
    const ttlMs = Math.max(1, Number(ttlSec) || 15) * 1000;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest entry (first key in Map iteration order)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear() {
    this.map.clear();
  }

  size() {
    return this.map.size;
  }

  keys() {
    return Array.from(this.map.keys());
  }
}

let memoryStore = null;
let redisClient = undefined; // undefined = uninitialized, null = unavailable
let injectedRedisForTest = null;

function getMemoryStore() {
  if (!memoryStore) {
    const cfg = getAssistantConfig();
    memoryStore = new BoundedLruTtlMap(cfg.cache.maxMemoryEntries);
  }
  return memoryStore;
}

function canonicalizeObject(val) {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.map(canonicalizeObject);
  if (typeof val === 'object') {
    const sorted = {};
    for (const k of Object.keys(val).sort()) {
      if (val[k] !== undefined) {
        sorted[k] = canonicalizeObject(val[k]);
      }
    }
    return sorted;
  }
  return val;
}

function buildQueryCacheKey(scope, toolName, parameters = {}) {
  if (!scope || !isValidUuid(scope.financeId)) {
    throw new FinanceScopeError('INVALID_FINANCE_ID', 'Cannot build AI cache key without valid financeId', 403);
  }
  const cleanTool = String(toolName || '').trim();
  if (!cleanTool || FORBIDDEN_CACHE_CATEGORIES.test(cleanTool)) {
    throw new Error(`Forbidden or invalid AI query cache tool category: "${cleanTool}"`);
  }

  const roleScope = scope.isOwner ? 'owner' : String(scope.role || 'staff').toLowerCase();
  // Agent-scoped queries isolate per userId so Agent A never sees Agent B's personal slice
  const userScope = roleScope === 'agent' && scope.userId ? String(scope.userId) : 'company';

  const canonicalJson = JSON.stringify(canonicalizeObject(parameters || {}));
  const paramsHash = crypto.createHash('sha256').update(canonicalJson).digest('hex').slice(0, 20);

  return `ai:v1:query:${scope.financeId}:${roleScope}:${userScope}:${cleanTool}:${paramsHash}`;
}

async function resolveRedisClient() {
  if (injectedRedisForTest !== null) {
    return injectedRedisForTest;
  }
  if (redisClient !== undefined) {
    return redisClient;
  }

  const cfg = getAssistantConfig();
  if (!cfg.cache.redisUrl) {
    redisClient = null;
    return null;
  }

  // Dynamically probe optional Redis package if installed without breaking `pkg` bundler
  try {
    const modName = ['io', 'redis'].join('');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const Redis = require(modName);
    const client = new Redis(cfg.cache.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      lazyConnect: true,
    });
    client.on('error', () => {
      // Handled gracefully per call; fallback memory cache takes over automatically
    });
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

async function getCachedQueryResult(scope, toolName, parameters = {}) {
  const key = buildQueryCacheKey(scope, toolName, parameters);

  const client = await resolveRedisClient();
  if (client) {
    try {
      const raw = await client.get(key);
      if (raw) {
        return { hit: true, tier: 'redis', key, data: JSON.parse(raw) };
      }
    } catch {
      // Graceful Redis degradation -> check memory tier
    }
  }

  const memRaw = getMemoryStore().get(key);
  if (memRaw !== null) {
    return { hit: true, tier: 'memory', key, data: JSON.parse(memRaw) };
  }

  return { hit: false, tier: client ? 'redis' : 'memory', key, data: null };
}

async function setCachedQueryResult(scope, toolName, parameters, data, ttlSec = 30) {
  const key = buildQueryCacheKey(scope, toolName, parameters);
  const serialized = JSON.stringify(data);
  const safeTtl = Math.max(5, Math.min(900, Math.round(Number(ttlSec) || 30)));

  // Always write to ultra-fast memory tier + Redis tier (if active)
  getMemoryStore().set(key, serialized, safeTtl);

  const client = await resolveRedisClient();
  if (client) {
    try {
      await client.set(key, serialized, 'EX', safeTtl);
    } catch {
      // Ignore Redis write error; memory tier remains valid
    }
  }

  return { key, ttlSec: safeTtl };
}

function getCacheModeStatus() {
  const cfg = getAssistantConfig();
  return {
    redisUrlConfigured: Boolean(cfg.cache.redisUrl),
    activeTier: injectedRedisForTest || redisClient ? 'redis+memory' : 'memory',
    memoryEntries: getMemoryStore().size(),
  };
}

function resetCacheForTest(mockRedis = null) {
  if (memoryStore) memoryStore.clear();
  injectedRedisForTest = mockRedis;
}

module.exports = {
  BoundedLruTtlMap,
  buildQueryCacheKey,
  getCachedQueryResult,
  setCachedQueryResult,
  getCacheModeStatus,
  resetCacheForTest,
  _getMemoryStoreForTest: getMemoryStore,
};

