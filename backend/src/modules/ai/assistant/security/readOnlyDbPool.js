'use strict';

/**
 * Read-Only PostgreSQL Pools & Transaction Executors (`readOnlyDbPool.js`).
 *
 * Maintains TWO strictly separated read-only pools:
 *   1. `sharedRoPool` (`autofinex_voice_ro` via `VOICE_RO_DB_USER` / `VOICE_RO_DB_PASSWORD`):
 *      Used ONLY by pre-approved parameterized fast KPI queries (`executeReadOnlyQuery`).
 *   2. `sharedDynamicSqlRoPool` (`autofinex_ai_sql_ro` via `AI_SQL_RO_DB_USER` / `AI_SQL_RO_DB_PASSWORD`):
 *      Used ONLY by `executeDynamicReadOnlySql` (`run_readonly_select_query`).
 *      - Connects strictly as `autofinex_ai_sql_ro` (NEVER falls back to `DB_USER` or `autofinex_voice_ro`).
 *      - Enforces `SET LOCAL search_path = ai_ro`, `BEGIN TRANSACTION READ ONLY`,
 *        `SET LOCAL statement_timeout = '3000ms'`, and `app.current_finance_id`.
 *      - Audit-logs every generated SQL query (financeId, userId, role, sql, durationMs, rowCount, error)
 *        with secrets redacted.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { assertSafeTestDbTarget, isLocalDbHost } = require('../../../../config/database.config');
const { getAssistantConfig, redactSecrets } = require('../config/assistant.config');
const { assertSafeSelectSql, validateDynamicSelectSql } = require('./sqlValidator');
const { isValidUuid, FinanceScopeError } = require('./financeScopeValidator');

const AUDIT_LOG_DIR = path.resolve(__dirname, '../../../../../logs');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'ai_sql_audit.jsonl');

let sharedRoPool = null;
let sharedDynamicSqlRoPool = null;
let injectedTestRunner = null;
let injectedDynamicSqlTestRunner = null;
let customAuditSinkForTest = null;

function appendDynamicSqlAuditLog(entry) {
  const safeEntry = {
    timestamp: new Date().toISOString(),
    financeId: entry.financeId || null,
    userId: entry.userId || null,
    role: entry.role || null,
    reason: entry.reason ? redactSecrets(String(entry.reason).slice(0, 300)) : null,
    sql: redactSecrets(String(entry.sql || '').slice(0, 4000)),
    durationMs: Number(entry.durationMs || 0),
    rowCount: Number(entry.rowCount || 0),
    error: entry.error ? redactSecrets(String(entry.error).slice(0, 500)) : null,
  };

  if (typeof customAuditSinkForTest === 'function') {
    customAuditSinkForTest(safeEntry);
  }

  // Unit tests must never pollute the real audit trail
  if (String(process.env.NODE_ENV || '').trim() === 'test') {
    return;
  }

  try {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    // Retention: this JSONL file is gitignored; rotate it with logrotate (e.g. daily, keep 30) on servers.
    fs.appendFileSync(AUDIT_LOG_FILE, `${JSON.stringify(safeEntry)}\n`, 'utf8');
  } catch (fsErr) {
    console.warn(
      '[AI-SQL-Audit] Could not append audit file:',
      redactSecrets(fsErr?.message || 'FS_ERR')
    );
  }
}

function createReadOnlyPool() {
  const cfg = getAssistantConfig();
  const blockedAtInit =
    String(process.env.NODE_ENV || '').trim() === 'test' &&
    String(process.env.ALLOW_REMOTE_DB_IN_TESTS || '').trim().toLowerCase() !== 'true' &&
    !isLocalDbHost(cfg.dbReadOnly.host);

  const useDedicatedRole = cfg.dbReadOnly.dedicatedRoleConfigured;
  if (!useDedicatedRole && process.env.NODE_ENV !== 'test') {
    console.warn(
      '[AI-Assistant] VOICE_RO_DB_USER not configured; enforcing strict BEGIN TRANSACTION READ ONLY + SQL AST guard on fallback pool.'
    );
  }

  const pool = new Pool({
    host: blockedAtInit ? '127.0.0.1' : cfg.dbReadOnly.host,
    user: blockedAtInit
      ? 'blocked_test_user'
      : useDedicatedRole
        ? cfg.dbReadOnly.user
        : process.env.DB_USER,
    password: blockedAtInit
      ? ''
      : useDedicatedRole
        ? cfg.dbReadOnly.password
        : process.env.DB_PASSWORD,
    database: blockedAtInit ? 'blocked_test_db' : cfg.dbReadOnly.database,
    port: blockedAtInit ? 1 : cfg.dbReadOnly.port,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: !blockedAtInit && cfg.dbReadOnly.sslMode === 'require' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    console.error('[AI-Assistant] Read-only PG pool idle error:', err?.code || 'PG_IDLE_ERR');
  });

  return pool;
}

function createDynamicSqlReadOnlyPool() {
  const cfg = getAssistantConfig();
  if (!cfg.dbDynamicSqlReadOnly.dedicatedRoleConfigured) {
    const err = new Error(
      'Dynamic SQL read-only role is not configured (set AI_SQL_RO_DB_USER and AI_SQL_RO_DB_PASSWORD).'
    );
    err.code = 'DYNAMIC_SQL_ROLE_NOT_CONFIGURED';
    err.statusCode = 503;
    throw err;
  }

  const blockedAtInit =
    String(process.env.NODE_ENV || '').trim() === 'test' &&
    String(process.env.ALLOW_REMOTE_DB_IN_TESTS || '').trim().toLowerCase() !== 'true' &&
    !isLocalDbHost(cfg.dbDynamicSqlReadOnly.host);

  const pool = new Pool({
    host: blockedAtInit ? '127.0.0.1' : cfg.dbDynamicSqlReadOnly.host,
    user: blockedAtInit ? 'blocked_test_user' : cfg.dbDynamicSqlReadOnly.user,
    password: blockedAtInit ? '' : cfg.dbDynamicSqlReadOnly.password,
    database: blockedAtInit ? 'blocked_test_db' : cfg.dbDynamicSqlReadOnly.database,
    port: blockedAtInit ? 1 : cfg.dbDynamicSqlReadOnly.port,
    max: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl:
      !blockedAtInit && cfg.dbDynamicSqlReadOnly.sslMode === 'require'
        ? { rejectUnauthorized: false }
        : false,
  });

  pool.on('error', (err) => {
    console.error('[AI-Assistant] Dynamic SQL PG pool idle error:', err?.code || 'PG_IDLE_ERR');
  });

  return pool;
}

function getReadOnlyPool() {
  if (!sharedRoPool) {
    sharedRoPool = createReadOnlyPool();
  }
  return sharedRoPool;
}

function getDynamicSqlReadOnlyPool() {
  if (!sharedDynamicSqlRoPool) {
    sharedDynamicSqlRoPool = createDynamicSqlReadOnlyPool();
  }
  return sharedDynamicSqlRoPool;
}

function setReadOnlyRunnerForTest(runner) {
  injectedTestRunner = runner;
}

function setDynamicSqlRunnerForTest(runner) {
  injectedDynamicSqlTestRunner = runner;
}

function setDynamicSqlAuditSinkForTest(sink) {
  customAuditSinkForTest = sink;
}

function isDynamicSqlRoleReady() {
  if (injectedDynamicSqlTestRunner) return true;
  return Boolean(getAssistantConfig().dbDynamicSqlReadOnly.dedicatedRoleConfigured);
}

/**
 * Executes a pre-approved parameterized read-only query via `autofinex_voice_ro`.
 */
async function executeReadOnlyQuery(scope, sql, params = [], options = {}) {
  if (!scope || !isValidUuid(scope.financeId)) {
    throw new FinanceScopeError(
      'INVALID_FINANCE_ID',
      'Valid authenticated financeId required for read-only query',
      403
    );
  }

  assertSafeSelectSql(sql);

  if (options.signal && options.signal.aborted) {
    const abortErr = new Error('Query aborted');
    abortErr.code = 'CLIENT_ABORTED';
    throw abortErr;
  }

  if (injectedTestRunner) {
    return injectedTestRunner(scope, sql, params, options);
  }

  assertSafeTestDbTarget(process.env);

  const cfg = getAssistantConfig();
  const timeoutMs = Math.max(
    300,
    Math.min(8000, Number(options.timeoutMs) || cfg.dbReadOnly.statementTimeoutMs)
  );
  const lockTimeoutMs = cfg.dbReadOnly.lockTimeoutMs;

  const pool = getReadOnlyPool();
  const client = await pool.connect();

  let abortedDuringQuery = false;
  const onAbort = () => {
    abortedDuringQuery = true;
  };
  if (options.signal) {
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
    await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '3000ms'`);
    await client.query(`SELECT set_config('app.current_finance_id', $1, true)`, [
      String(scope.financeId),
    ]);

    const result = await client.query(sql, params);
    await client.query('COMMIT');

    if (abortedDuringQuery) {
      const abortErr = new Error('Query aborted');
      abortErr.code = 'CLIENT_ABORTED';
      throw abortErr;
    }

    return {
      rows: Array.isArray(result?.rows) ? result.rows : [],
      rowCount: Number(result?.rowCount || 0),
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors on severed connection
    }
    throw err;
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
    client.release(abortedDuringQuery ? true : false);
  }
}

/**
 * Executes a validated LLM-generated SELECT query via `autofinex_ai_sql_ro` against
 * `ai_ro` security-barrier views ONLY, with mandatory audit logging.
 */
async function executeDynamicReadOnlySql(scope, rawSql, options = {}) {
  const startedAt = Date.now();
  const role = scope?.isOwner ? 'owner' : String(scope?.role || 'staff').toLowerCase();

  if (!scope || !isValidUuid(scope.financeId)) {
    const scopeErr = new FinanceScopeError(
      'INVALID_FINANCE_ID',
      'Valid authenticated financeId required for dynamic read-only query',
      403
    );
    appendDynamicSqlAuditLog({
      financeId: scope?.financeId || null,
      userId: scope?.userId || null,
      role,
      reason: options.reason,
      sql: rawSql,
      durationMs: Date.now() - startedAt,
      rowCount: 0,
      error: `${scopeErr.code}: ${scopeErr.message}`,
    });
    throw scopeErr;
  }

  const cfg = getAssistantConfig();
  let validated;
  try {
    validated = validateDynamicSelectSql(rawSql, role, {
      maxRows: cfg.dbDynamicSqlReadOnly.maxRows,
      financeId: scope.financeId,
    });
  } catch (valErr) {
    appendDynamicSqlAuditLog({
      financeId: scope.financeId,
      userId: scope.userId || null,
      role,
      reason: options.reason,
      sql: rawSql,
      durationMs: Date.now() - startedAt,
      rowCount: 0,
      error: `${valErr.code || 'SQL_VALIDATION_ERROR'}: ${valErr.message}`,
    });
    throw valErr;
  }

  if (options.signal && options.signal.aborted) {
    const abortErr = new Error('Query aborted');
    abortErr.code = 'CLIENT_ABORTED';
    throw abortErr;
  }

  if (injectedDynamicSqlTestRunner) {
    try {
      const testRes = await injectedDynamicSqlTestRunner(scope, validated.wrappedSql, {
        ...options,
        cleanedSql: validated.cleanedSql,
        referencedViews: validated.referencedViews,
      });
      const rows = Array.isArray(testRes?.rows) ? testRes.rows : [];
      appendDynamicSqlAuditLog({
        financeId: scope.financeId,
        userId: scope.userId || null,
        role,
        reason: options.reason,
        sql: validated.cleanedSql,
        durationMs: Date.now() - startedAt,
        rowCount: rows.length,
        error: null,
      });
      return {
        rows,
        rowCount: rows.length,
        referencedViews: validated.referencedViews,
      };
    } catch (runnerErr) {
      appendDynamicSqlAuditLog({
        financeId: scope.financeId,
        userId: scope.userId || null,
        role,
        reason: options.reason,
        sql: validated.cleanedSql,
        durationMs: Date.now() - startedAt,
        rowCount: 0,
        error: `${runnerErr?.code || 'DB_ERROR'}: ${runnerErr?.message || 'Query failed'}`,
      });
      throw runnerErr;
    }
  }

  assertSafeTestDbTarget(process.env);

  let client = null;
  let abortedDuringQuery = false;
  const onAbort = () => {
    abortedDuringQuery = true;
  };
  if (options.signal) {
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const pool = getDynamicSqlReadOnlyPool();
    client = await pool.connect();

    const timeoutMs = Math.max(
      300,
      Math.min(5000, Number(options.timeoutMs) || cfg.dbDynamicSqlReadOnly.statementTimeoutMs)
    );
    const lockTimeoutMs = cfg.dbDynamicSqlReadOnly.lockTimeoutMs;

    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
    await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '3000ms'`);
    await client.query(`SET LOCAL search_path = ai_ro`);
    await client.query(`SELECT set_config('app.current_finance_id', $1, true)`, [
      String(scope.financeId),
    ]);

    const result = await client.query(validated.wrappedSql);
    await client.query('COMMIT');

    if (abortedDuringQuery) {
      const abortErr = new Error('Query aborted');
      abortErr.code = 'CLIENT_ABORTED';
      throw abortErr;
    }

    const rows = Array.isArray(result?.rows) ? result.rows : [];
    appendDynamicSqlAuditLog({
      financeId: scope.financeId,
      userId: scope.userId || null,
      role,
      reason: options.reason,
      sql: validated.cleanedSql,
      durationMs: Date.now() - startedAt,
      rowCount: rows.length,
      error: null,
    });

    return {
      rows,
      rowCount: rows.length,
      referencedViews: validated.referencedViews,
    };
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    appendDynamicSqlAuditLog({
      financeId: scope.financeId,
      userId: scope.userId || null,
      role,
      reason: options.reason,
      sql: validated.cleanedSql,
      durationMs: Date.now() - startedAt,
      rowCount: 0,
      error: `${err?.code || 'DB_ERROR'}: ${err?.message || 'Dynamic query failed'}`,
    });
    throw err;
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
    if (client) {
      client.release(abortedDuringQuery ? true : false);
    }
  }
}

async function checkReadOnlyDbHealth() {
  const cfg = getAssistantConfig();
  if (injectedTestRunner) {
    return {
      ok: true,
      category: null,
      dedicatedRoleConfigured: cfg.dbReadOnly.dedicatedRoleConfigured,
      dynamicSqlRoleConfigured: isDynamicSqlRoleReady(),
      message: 'Read-only DB runner healthy (test)',
    };
  }
  if (
    String(process.env.NODE_ENV || '').trim() === 'test' &&
    String(process.env.ALLOW_REMOTE_DB_IN_TESTS || '').trim().toLowerCase() !== 'true' &&
    !isLocalDbHost(cfg.dbReadOnly.host)
  ) {
    return {
      ok: true,
      category: null,
      dedicatedRoleConfigured: cfg.dbReadOnly.dedicatedRoleConfigured,
      dynamicSqlRoleConfigured: isDynamicSqlRoleReady(),
      message: 'Remote DB health check skipped in isolated test mode',
    };
  }

  let client;
  try {
    const pool = getReadOnlyPool();
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '2500ms'`);
    const res = await client.query(
      "SELECT current_user AS role_name, current_setting('transaction_read_only') AS read_only"
    );
    await client.query('COMMIT');
    const row = res?.rows?.[0] || {};
    return {
      ok: row.read_only === 'on',
      category: row.read_only === 'on' ? null : 'permission',
      dedicatedRoleConfigured: cfg.dbReadOnly.dedicatedRoleConfigured,
      dynamicSqlRoleConfigured: isDynamicSqlRoleReady(),
      message:
        row.read_only === 'on'
          ? 'Read-only database connection verified'
          : 'Database connection did not enforce read-only mode',
    };
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    const rawMsg = String(err?.message || '');
    const pgCode = String(err?.code || '');
    let category = 'network';
    if (
      pgCode === '28P01' ||
      pgCode === '28000' ||
      /password authentication|authentication failed/i.test(rawMsg)
    ) {
      category = 'auth';
    } else if (pgCode === '42501' || /permission denied/i.test(rawMsg)) {
      category = 'permission';
    }
    return {
      ok: false,
      category,
      dedicatedRoleConfigured: cfg.dbReadOnly.dedicatedRoleConfigured,
      dynamicSqlRoleConfigured: isDynamicSqlRoleReady(),
      message: redactSecrets(rawMsg || 'Database read-only pool unreachable'),
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

module.exports = {
  AUDIT_LOG_FILE,
  getReadOnlyPool,
  getDynamicSqlReadOnlyPool,
  executeReadOnlyQuery,
  executeDynamicReadOnlySql,
  checkReadOnlyDbHealth,
  isDynamicSqlRoleReady,
  setReadOnlyRunnerForTest,
  setDynamicSqlRunnerForTest,
  setDynamicSqlAuditSinkForTest,
};
