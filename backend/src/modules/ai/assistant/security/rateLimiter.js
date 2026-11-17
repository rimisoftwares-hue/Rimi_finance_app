'use strict';

/**
 * In-memory abuse & cost limiter for the AI assistant (`rateLimiter.js`).
 *
 * Per backend process (single-instance deployment). Tracks:
 *   - sliding 60 s windows of turns per user and per finance company
 *   - a per-finance daily (IST date) turn cap
 *   - concurrent WebSocket sessions per user
 * Only counters and opaque ids are kept in memory; never message text.
 */

const { getAssistantConfig } = require('../config/assistant.config');

const minuteWindows = new Map(); // key -> number[] (timestamps)
const dailyCounters = new Map(); // `${financeId}:${yyyy-mm-dd}` -> count
const activeSessions = new Map(); // userKey -> count

class RateLimitError extends Error {
  constructor(code, message, retryAfterSec = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.code = code;
    this.statusCode = 429;
    this.retryAfterSec = retryAfterSec;
    this.clientSafe = true;
  }
}

function istDateKey(now = Date.now()) {
  return new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function userKeyOf(scope) {
  return `${scope?.financeId || 'none'}:${scope?.userId || scope?.username || 'anon'}`;
}

function hitWindow(key, limit, now) {
  const arr = (minuteWindows.get(key) || []).filter((t) => now - t < 60000);
  if (arr.length >= limit) {
    minuteWindows.set(key, arr);
    const retryAfterSec = Math.max(1, Math.ceil((60000 - (now - arr[0])) / 1000));
    return { allowed: false, retryAfterSec };
  }
  arr.push(now);
  minuteWindows.set(key, arr);
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Records one conversational turn for `scope` or throws `RateLimitError`.
 */
function consumeTurnBudget(scope, now = Date.now()) {
  const limits = getAssistantConfig().limits;
  const financeId = String(scope?.financeId || 'none');

  const dayKey = `${financeId}:${istDateKey(now)}`;
  const usedToday = dailyCounters.get(dayKey) || 0;
  if (usedToday >= limits.dailyTurnCapPerFinance) {
    throw new RateLimitError(
      'DAILY_LIMIT_REACHED',
      'Daily AI assistant limit reached for this company. Please try again tomorrow.',
      3600
    );
  }

  const userRes = hitWindow(`u:${userKeyOf(scope)}`, limits.turnsPerMinutePerUser, now);
  if (!userRes.allowed) {
    throw new RateLimitError(
      'RATE_LIMITED',
      'You are sending messages too quickly. Please wait a moment and try again.',
      userRes.retryAfterSec
    );
  }
  const finRes = hitWindow(`f:${financeId}`, limits.turnsPerMinutePerFinance, now);
  if (!finRes.allowed) {
    throw new RateLimitError(
      'RATE_LIMITED',
      'Too many AI requests from this company right now. Please wait a moment.',
      finRes.retryAfterSec
    );
  }

  dailyCounters.set(dayKey, usedToday + 1);
  // Prune stale daily keys (keep only today's)
  if (dailyCounters.size > 2000) {
    const today = istDateKey(now);
    for (const k of dailyCounters.keys()) {
      if (!k.endsWith(today)) dailyCounters.delete(k);
    }
  }
  return { usedToday: usedToday + 1 };
}

/**
 * Separate budget for direct HTTP voice endpoints (`/voice/transcribe`, `/voice/synthesize`)
 * so a looping client cannot burn Sarvam credits outside of chat turns.
 */
function consumeVoiceCallBudget(scope, now = Date.now()) {
  const limits = getAssistantConfig().limits;
  const res = hitWindow(`v:${userKeyOf(scope)}`, limits.turnsPerMinutePerUser * 2, now);
  if (!res.allowed) {
    throw new RateLimitError(
      'RATE_LIMITED',
      'Too many voice requests. Please wait a moment and try again.',
      res.retryAfterSec
    );
  }
}

function acquireSessionSlot(scope) {
  const limits = getAssistantConfig().limits;
  const key = userKeyOf(scope);
  const current = activeSessions.get(key) || 0;
  if (current >= limits.maxConcurrentSessionsPerUser) {
    return { ok: false, release: () => {} };
  }
  activeSessions.set(key, current + 1);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      const n = (activeSessions.get(key) || 1) - 1;
      if (n <= 0) activeSessions.delete(key);
      else activeSessions.set(key, n);
    },
  };
}

function resetRateLimiterForTest() {
  minuteWindows.clear();
  dailyCounters.clear();
  activeSessions.clear();
}

module.exports = {
  RateLimitError,
  consumeTurnBudget,
  consumeVoiceCallBudget,
  acquireSessionSlot,
  resetRateLimiterForTest,
};
