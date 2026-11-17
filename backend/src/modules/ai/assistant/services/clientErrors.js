'use strict';

/**
 * Maps internal errors to sanitized, user-readable client errors (`clientErrors.js`).
 *
 * Never forwards stack traces, SQL text, provider payloads or keys to the browser.
 * Only errors explicitly marked `clientSafe` (validation / rate-limit) keep their message.
 */

const { redactSecrets } = require('../config/assistant.config');

const SAFE_MESSAGES = Object.freeze({
  TURN_TIMEOUT: 'The AI took too long to answer. Please try again.',
  EMPTY_MESSAGE: 'Message cannot be empty.',
  MESSAGE_TOO_LONG: 'Your message is too long. Please shorten it.',
  STT_STREAM_ERROR: 'Voice recognition was interrupted. Please speak again.',
  STT_ERROR: 'Voice recognition failed. Please try again.',
});

const CATEGORY_MESSAGES = Object.freeze({
  quota: 'The AI service quota is exhausted right now. Please try again later.',
  auth: 'The AI service is not authorised (API key problem). Please contact your administrator.',
  model_not_found: 'The configured AI model is unavailable. Please contact your administrator.',
  network: 'The AI service is unreachable right now. Please try again.',
});

function toClientError(err, fallbackCode = 'ASSISTANT_TURN_ERROR') {
  const code = String(err?.code || fallbackCode).slice(0, 64);
  if (err?.clientSafe && err?.message) {
    return { code, message: redactSecrets(String(err.message)).slice(0, 300), category: err.category || null };
  }
  if (SAFE_MESSAGES[code]) {
    return { code, message: SAFE_MESSAGES[code], category: err?.category || null };
  }
  const category = err?.category || null;
  if (category && CATEGORY_MESSAGES[category]) {
    return { code, message: CATEGORY_MESSAGES[category], category };
  }
  return {
    code,
    message: 'Unable to process your AI request right now. Please try again.',
    category,
  };
}

module.exports = {
  toClientError,
};

