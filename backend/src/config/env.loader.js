'use strict';

/**
 * Single-Bootstrap Environment Loader (`env.loader.js`).
 *
 * Loads `backend/.env` followed by `backend/.env.local` with `override: false`
 * at most ONCE per Node.js process, regardless of whether the process starts via
 * `src/server.js` or imports `src/app.js` directly in tests.
 *
 * Security rule: NEVER logs, prints, or includes environment variable VALUES in
 * warnings or errors — only variable NAMES.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ENV_FILES = Object.freeze([
  path.join(BACKEND_ROOT, '.env'),
  path.join(BACKEND_ROOT, '.env.local'),
]);

const REQUIRED_AI_ENV_NAMES = Object.freeze(['GEMINI_API_KEY', 'SARVAM_API_KEY']);

let hasLoadedProcessEnv = false;
let loadedFileNames = [];

/**
 * Loads `.env` then `.env.local` with `override: false` (so explicit shell env
 * variables take precedence over `.env`, and `.env` takes precedence over `.env.local`
 * while missing keys in `.env` — such as `SARVAM_API_KEY` — are filled from `.env.local`).
 */
function loadBackendEnv(options = {}) {
  const targetEnv = options.processEnv || process.env;
  const envFiles = Array.isArray(options.envFiles) ? options.envFiles : DEFAULT_ENV_FILES;
  const forceReload = Boolean(options.forceReload);

  if (targetEnv === process.env && hasLoadedProcessEnv && !forceReload) {
    return {
      alreadyLoaded: true,
      loadedFiles: [...loadedFileNames],
    };
  }

  const loadedNow = [];
  for (const filePath of envFiles) {
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({
      path: filePath,
      processEnv: targetEnv,
      override: false,
      quiet: true,
    });
    loadedNow.push(path.basename(filePath));
  }

  if (targetEnv === process.env) {
    hasLoadedProcessEnv = true;
    loadedFileNames = loadedNow;
  }

  return {
    alreadyLoaded: false,
    loadedFiles: loadedNow,
  };
}

/**
 * Inspects required AI provider environment variables by NAME only (never values).
 */
function checkRequiredAiEnv(env = process.env) {
  const missing = [];
  const present = [];

  for (const varName of REQUIRED_AI_ENV_NAMES) {
    const raw = env[varName];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      present.push(varName);
    } else {
      missing.push(varName);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Validates that required AI keys exist at server boot, failing fast with a clear
 * message listing ONLY the missing variable names (never values).
 * Skipped automatically in `NODE_ENV=test` unless `strict: true` is passed.
 */
function assertRequiredAiEnvOnBoot(env = process.env, options = {}) {
  const isTestEnv = String(env.NODE_ENV || '').trim().toLowerCase() === 'test';
  const allowMissing = String(env.ALLOW_MISSING_AI_KEYS_ON_BOOT || '').trim().toLowerCase() === 'true';
  const strict = typeof options.strict === 'boolean' ? options.strict : !isTestEnv && !allowMissing;

  const status = checkRequiredAiEnv(env);
  if (!status.ok) {
    const message =
      `[EnvLoader] Missing required AI environment variable(s): ${status.missing.join(', ')}. ` +
      `Set them in backend/.env or backend/.env.local before starting the server.`;
    if (strict) {
      const err = new Error(message);
      err.code = 'MISSING_AI_ENV_KEYS';
      err.missingKeys = status.missing;
      throw err;
    }
    if (!isTestEnv) {
      console.warn(message);
    }
  }

  return status;
}

module.exports = {
  REQUIRED_AI_ENV_NAMES,
  loadBackendEnv,
  checkRequiredAiEnv,
  assertRequiredAiEnvOnBoot,
};

