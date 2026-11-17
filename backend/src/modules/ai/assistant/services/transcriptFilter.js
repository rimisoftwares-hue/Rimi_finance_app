'use strict';

/**
 * Background-noise / filler guard for streaming STT transcripts (`transcriptFilter.js`).
 *
 * Prevents the always-on hands-free mic from triggering an AI reply for coughs, "hmm",
 * single letters or punctuation-only transcripts that Sarvam may return for background sound.
 */

const FILLER_TOKENS = new Set([
  'hmm', 'hm', 'mm', 'mmm', 'um', 'umm', 'uh', 'uhh', 'ah', 'aah', 'oh', 'eh', 'huh', 'ha',
  'ம்', 'ம்ம்', 'ஆ', 'ஓ', 'हम्म', 'हूं', 'अ', 'ആ', 'ಹ್ಮ್', 'హ్మ్',
]);

function isMeaningfulTranscript(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return false;
  const letters = text.match(/[\p{L}\p{M}\p{N}]/gu) || [];
  if (letters.length < 2) return false;
  const tokens = text
    .toLowerCase()
    .split(/[\s,.!?;:।॥'"()-]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return !tokens.every((t) => FILLER_TOKENS.has(t));
}

module.exports = {
  isMeaningfulTranscript,
};

