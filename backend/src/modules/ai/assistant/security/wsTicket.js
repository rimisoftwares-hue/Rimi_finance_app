'use strict';

/**
 * Short-lived, single-use WebSocket tickets (`wsTicket.js`).
 *
 * Browsers cannot send `Authorization` headers on a WebSocket handshake. Instead of
 * putting the long-lived JWT in the `/ws/ai-assistant` URL (where proxies/tunnels may log
 * it), the frontend first calls the authenticated `POST /api/ai/assistant/ws-ticket`
 * (normal `enhancedCheckFinance` auth) and receives an opaque random ticket that:
 *   - is valid for 60 s,
 *   - can be used exactly once,
 *   - maps to the already server-verified scope (finance, user, role).
 *
 * In-memory: valid for a single backend process (the current deployment model).
 */

const crypto = require('crypto');
const { getAssistantConfig } = require('../config/assistant.config');

const INTERNAL_AUTH_SYMBOL = Symbol.for('autofinex.assistant.internalAuth');
const tickets = new Map(); // ticket -> { scope, expiresAt }

function cloneScopePreservingInternalAuth(scope) {
  const cloned = { ...scope };
  if (scope && scope[INTERNAL_AUTH_SYMBOL]) {
    Object.defineProperty(cloned, INTERNAL_AUTH_SYMBOL, {
      value: scope[INTERNAL_AUTH_SYMBOL],
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(cloned);
}

function pruneExpired(now = Date.now()) {
  for (const [k, v] of tickets) {
    if (v.expiresAt <= now) tickets.delete(k);
  }
}

function issueWsTicket(scope, now = Date.now()) {
  if (!scope || !scope.financeId) {
    throw new Error('Verified scope required to issue a WebSocket ticket');
  }
  pruneExpired(now);
  const ttlMs = getAssistantConfig().limits.wsTicketTtlMs;
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { scope: cloneScopePreservingInternalAuth(scope), expiresAt: now + ttlMs });
  return { ticket, expiresInSec: Math.round(ttlMs / 1000) };
}

/** Returns the scope for a valid ticket and deletes it (single use), else `null`. */
function consumeWsTicket(ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 100) return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  if (entry.expiresAt <= now) return null;
  return entry.scope;
}

function resetWsTicketsForTest() {
  tickets.clear();
}

module.exports = {
  issueWsTicket,
  consumeWsTicket,
  resetWsTicketsForTest,
};

