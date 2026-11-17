'use strict';

/**
 * Opt-in, non-sensitive diagnostics for the AI assistant (`AI_DEBUG=1`, OFF by default).
 *
 * Only event names, counts, byte sizes, timings, close codes and opaque ids may be logged.
 * NEVER pass transcripts, message text, SQL, tokens, API keys or customer data to `aiDebug()`.
 */

function isAiDebugEnabled(env = process.env) {
  const raw = String(env.AI_DEBUG || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function aiDebug(scopeLabel, fields = {}) {
  if (!isAiDebugEnabled()) return;
  const safe = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined) continue;
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      safe[k] = v;
    } else {
      // Truncate any string field defensively; callers must only pass ids / event names.
      safe[k] = String(v).slice(0, 64);
    }
  }
  console.info(`[AI-DEBUG] ${scopeLabel}`, JSON.stringify(safe));
}

module.exports = {
  isAiDebugEnabled,
  aiDebug,
};

