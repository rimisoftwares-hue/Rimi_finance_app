'use strict';

/**
 * Multi-Rule Read-Only SQL Safety Validator (`sqlValidator.js`).
 *
 * Provides two defense-in-depth validators:
 *   1. `assertSafeSelectSql(rawSql)` — validates internal parameterized fast KPI queries
 *      executed via `autofinex_voice_ro`.
 *   2. `validateDynamicSelectSql(rawSql, role, options)` — validates LLM-generated
 *      `SELECT` / `WITH ... SELECT` queries for `run_readonly_select_query` executed via
 *      `autofinex_ai_sql_ro` against `ai_ro.*` security-barrier views ONLY, enforcing:
 *        - Single statement, zero comments, zero dollar-quotes, zero locking clauses
 *        - Explicit FUNCTION ALLOWLIST (blocks `set_config`, `current_setting`, `pg_sleep`,
 *          `dblink`, `lo_*`, `pg_read_*`, `pg_ls_*`, and any unlisted or schema-qualified function)
 *        - Schema lock to `ai_ro` ONLY (blocks `public.*`, `pg_catalog.*`, `information_schema.*`, etc.)
 *        - Role-based view guard (`staff` & `agent` cannot read `acc_*`, `office_expenses`, or `vehicle_expenses`)
 *        - Cross-tenant literal guard + hard `LIMIT 50` wrapper
 */

const APPROVED_READONLY_TABLES = Object.freeze(
  new Set([
    'finance_detail',
    'customers',
    'contacts',
    'vehicle_detail',
    'vehicle_info',
    'loans',
    'payments',
    'sub_due',
    'penalties',
    'promise_to_pay',
    'seizing_vehicle',
    'office_expenses',
    'vehicle_expenses',
    'customer_agent_assignments',
    'addresses',
    'address_history',
    'users',
    'users_details',
    'user_allowed_companies',
    'acc_group_master',
    'acc_ledger_groups',
    'acc_ledgers',
    'acc_vouchers',
    'acc_voucher_entries',
  ])
);

const AI_RO_OPERATIONAL_VIEWS = Object.freeze(
  new Set([
    'finance_detail',
    'customers',
    'contacts',
    'guardians',
    'addresses',
    'address_history',
    'loans',
    'payments',
    'sub_due',
    'penalties',
    'promise_to_pay',
    'customer_agent_assignments',
    'vehicle_detail',
    'vehicle_info',
    'seizing_vehicle',
    'godowns',
    'staff_members',
    'ai_telecalling_leads',
    'ai_telecalling_call_logs',
    'voice_callbacks',
    'voice_call_summaries',
    'voice_customer_memory',
  ])
);

const AI_RO_OWNER_ADMIN_ONLY_VIEWS = Object.freeze(
  new Set([
    'office_expenses',
    'vehicle_expenses',
    'acc_group_master',
    'acc_ledger_groups',
    'acc_ledgers',
    'acc_ledger_balances',
    'acc_voucher_types',
    'acc_voucher_groups',
    'acc_vouchers',
    'acc_voucher_entries',
    'acc_financial_years',
    'acc_bill_references',
    'acc_cost_centres',
  ])
);

const AI_RO_ALL_VIEWS = Object.freeze(
  new Set([...AI_RO_OPERATIONAL_VIEWS, ...AI_RO_OWNER_ADMIN_ONLY_VIEWS])
);

const DYNAMIC_SQL_ALLOWED_FUNCTIONS = Object.freeze(
  new Set([
    // Aggregates
    'COUNT',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
    'STRING_AGG',
    'ARRAY_AGG',
    'BOOL_OR',
    'BOOL_AND',
    // Conditional / null scalars
    'COALESCE',
    'NULLIF',
    'GREATEST',
    'LEAST',
    // Math
    'ROUND',
    'FLOOR',
    'CEIL',
    'CEILING',
    'ABS',
    'TRUNC',
    'MOD',
    'POWER',
    'SQRT',
    'SIGN',
    // String
    'LOWER',
    'UPPER',
    'INITCAP',
    'TRIM',
    'BTRIM',
    'LTRIM',
    'RTRIM',
    'LENGTH',
    'CHAR_LENGTH',
    'SUBSTRING',
    'SUBSTR',
    'LEFT',
    'RIGHT',
    'REPLACE',
    'CONCAT',
    'CONCAT_WS',
    'SPLIT_PART',
    'LPAD',
    'RPAD',
    'POSITION',
    'STRPOS',
    // Date / formatting
    'TO_CHAR',
    'TO_DATE',
    'TO_TIMESTAMP',
    'TO_NUMBER',
    'DATE_TRUNC',
    'DATE_PART',
    'EXTRACT',
    'AGE',
    'NOW',
    'CURRENT_DATE',
    'CURRENT_TIMESTAMP',
    'LOCALTIMESTAMP',
    'MAKE_DATE',
    'JUSTIFY_DAYS',
    'JUSTIFY_INTERVAL',
    // Conversion & safe window functions
    'CAST',
    'ROW_NUMBER',
    'RANK',
    'DENSE_RANK',
    'LAG',
    'LEAD',
    'FIRST_VALUE',
    'LAST_VALUE',
  ])
);

// SQL grammar keywords that can legitimately precede `(` without being function calls
const SQL_SYNTAX_PARENS_KEYWORDS = Object.freeze(
  new Set([
    'SELECT',
    'FROM',
    'JOIN',
    'ON',
    'USING',
    'WHERE',
    'AND',
    'OR',
    'NOT',
    'IN',
    'EXISTS',
    'ANY',
    'ALL',
    'SOME',
    'BETWEEN',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'AS',
    'WITH',
    'OVER',
    'FILTER',
    'PARTITION',
    'BY',
    'HAVING',
    'ORDER',
    'GROUP',
    'DISTINCT',
    'UNION',
    'INTERSECT',
    'EXCEPT',
  ])
);

const FORBIDDEN_SQL_KEYWORDS = Object.freeze([
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'MERGE',
  'CALL',
  'EXECUTE',
  'COPY',
  'VACUUM',
  'REINDEX',
  'CLUSTER',
  'LOCK',
  'INTO',
  'PREPARE',
  'DEALLOCATE',
  'LISTEN',
  'NOTIFY',
  'UNLISTEN',
  'DISCARD',
  'COMMENT',
  'SECURITY',
  'DO',
  'SET',
  'RESET',
  'SHOW',
  'EXPLAIN',
  'ANALYZE',
  'DECLARE',
  'FETCH',
  'MOVE',
  'CLOSE',
  'IMPORT',
  'REFRESH',
]);

const FORBIDDEN_IDENTIFIERS = Object.freeze([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_temp',
  'pg_shadow',
  'pg_authid',
  'pg_roles',
  'pg_user',
  'pg_stat_activity',
  'pg_settings',
  'pg_sleep',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'lo_import',
  'lo_export',
  'lo_get',
  'lo_put',
  'lo_from_bytea',
  'lo_creat',
  'lo_create',
  'lo_unlink',
  'dblink',
  'dblink_exec',
  'dblink_connect',
  'set_config',
  'current_setting',
  // Secret / auth / PII columns & tables never permitted in AI assistant queries
  'refresh_tokens',
  'otp_verifications',
  'kyc_documents',
  'qr_login_sessions',
  'ai_conversations',
  'ai_messages',
  'password',
  'password_hash',
  'pass_hash',
  'reset_token',
  'refresh_token',
  'aadhar_id',
  'other_govt_id_number',
  'pan_number',
  'bank_account_number',
  'pf_number',
  'esi_number',
  'idempotency_key',
  // Write-side stored functions
  'fn_complete_voice_call',
  'fn_claim_due_voice_leads',
  'fn_reconcile_customer_voice_state',
  'fn_refresh_daily_overdue_leads',
  'fn_record_telecall_outcome',
  'fn_expire_broken_ptps',
]);

const INTERNAL_FORBIDDEN_KEYWORDS = FORBIDDEN_SQL_KEYWORDS.filter(
  (kw) => kw !== 'SET' && kw !== 'RESET' && kw !== 'SHOW'
);

const INTERNAL_KEYWORD_REGEX = new RegExp(`\\b(?:${INTERNAL_FORBIDDEN_KEYWORDS.join('|')})\\b`, 'i');
const DYNAMIC_KEYWORD_REGEX = new RegExp(`\\b(?:${FORBIDDEN_SQL_KEYWORDS.join('|')})\\b`, 'i');
const INTERNAL_IDENTIFIER_REGEX = new RegExp(
  `\\b(?:${FORBIDDEN_IDENTIFIERS.filter((id) => id !== 'current_setting').join('|')})\\b`,
  'i'
);
const DYNAMIC_IDENTIFIER_REGEX = new RegExp(
  `\\b(?:${FORBIDDEN_IDENTIFIERS.join('|')}|lo_[a-z0-9_]*|pg_read_[a-z0-9_]*|pg_ls_[a-z0-9_]*)\\b`,
  'i'
);
const FOR_LOCKING_REGEX = /\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i;

class SqlValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SqlValidationError';
    this.code = code;
    this.statusCode = 403;
  }
}

/**
 * Strips SQL comments (`-- ...` and `/* ... *\/`) when `allowComments` is true, and
 * replaces single-quoted string literals (`'...'`) with `'__STR__'` (while optionally
 * collecting extracted literal values for cross-tenant inspection).
 */
function stripCommentsAndStrings(rawSql, { allowComments = true, literalsOut = null } = {}) {
  let out = '';
  let i = 0;
  const len = rawSql.length;

  while (i < len) {
    const ch = rawSql[i];
    const next = i + 1 < len ? rawSql[i + 1] : '';

    // Line comment
    if (ch === '-' && next === '-') {
      if (!allowComments) {
        throw new SqlValidationError('SQL_COMMENTS_FORBIDDEN', 'SQL comments are forbidden in dynamic queries');
      }
      i += 2;
      while (i < len && rawSql[i] !== '\n') i += 1;
      out += ' ';
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      if (!allowComments) {
        throw new SqlValidationError('SQL_COMMENTS_FORBIDDEN', 'SQL block comments are forbidden in dynamic queries');
      }
      i += 2;
      let closed = false;
      while (i + 1 < len) {
        if (rawSql[i] === '*' && rawSql[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) {
        throw new SqlValidationError('SQL_UNCLOSED_COMMENT', 'Unclosed SQL block comment rejected');
      }
      out += ' ';
      continue;
    }

    // Dollar-quoted strings ($tag$...$tag$) are forbidden in AI read-only queries
    if (ch === '$' && (next === '$' || /[a-zA-Z_]/.test(next))) {
      throw new SqlValidationError('SQL_DOLLAR_QUOTE_FORBIDDEN', 'Dollar-quoted SQL literals are forbidden');
    }

    // Single-quoted literal
    if (ch === "'") {
      i += 1;
      let closed = false;
      let litVal = '';
      while (i < len) {
        if (rawSql[i] === "'") {
          if (i + 1 < len && rawSql[i + 1] === "'") {
            litVal += "'";
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        litVal += rawSql[i];
        i += 1;
      }
      if (!closed) {
        throw new SqlValidationError('SQL_UNCLOSED_LITERAL', 'Unclosed SQL string literal rejected');
      }
      if (Array.isArray(literalsOut)) {
        literalsOut.push(litVal);
        out += `'__STR_${literalsOut.length - 1}__'`;
      } else {
        out += "'__STR__'";
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function extractCteNames(sanitizedSql) {
  const ctes = new Set();
  const ctePattern =
    /(?:(?:\bWITH(?:\s+RECURSIVE)?)|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\([^)]*\))?\s+AS\s*(?:(?:NOT\s+)?MATERIALIZED\s*)?\(/gi;
  let m;
  while ((m = ctePattern.exec(sanitizedSql)) !== null) {
    ctes.add(m[1].toLowerCase());
  }
  return ctes;
}

function assertApprovedTablesOnly(sanitizedSql) {
  const ctes = extractCteNames(sanitizedSql);
  const tableRefRegex = /\b(?:FROM|JOIN)\s+(?!\()([a-zA-Z_"][a-zA-Z0-9_"]*(?:\.[a-zA-Z_"][a-zA-Z0-9_"]*)?)/gi;

  let match;
  while ((match = tableRefRegex.exec(sanitizedSql)) !== null) {
    const prefix = sanitizedSql.slice(Math.max(0, match.index - 60), match.index);
    if (/\b(?:EXTRACT|TRIM|BTRIM|LTRIM|RTRIM|SUBSTRING)\s*\([^()]*$/i.test(prefix) || /\bDISTINCT\s*$/i.test(prefix)) {
      continue;
    }

    const rawRef = match[1].replace(/"/g, '').toLowerCase();
    if (rawRef === 'unnest' || rawRef === 'lateral' || rawRef === 'generate_series') {
      continue;
    }

    let schema = 'public';
    let table = rawRef;
    if (rawRef.includes('.')) {
      const parts = rawRef.split('.');
      if (parts.length !== 2) {
        throw new SqlValidationError('SQL_INVALID_TABLE_REF', `Invalid table reference: ${rawRef}`);
      }
      schema = parts[0];
      table = parts[1];
    }

    if (schema !== 'public') {
      throw new SqlValidationError('SQL_FORBIDDEN_SCHEMA', `Schema "${schema}" is not permitted`);
    }

    if (ctes.has(table)) {
      continue;
    }

    if (!APPROVED_READONLY_TABLES.has(table)) {
      throw new SqlValidationError('SQL_UNAPPROVED_TABLE', `Table "${table}" is not in the approved read-only registry`);
    }
  }
}

function assertSafeSelectSql(rawSql) {
  if (typeof rawSql !== 'string' || !rawSql.trim()) {
    throw new SqlValidationError('SQL_EMPTY', 'SQL query must be a non-empty string');
  }

  const sanitized = stripCommentsAndStrings(rawSql, { allowComments: true }).trim();
  if (!sanitized) {
    throw new SqlValidationError('SQL_EMPTY', 'SQL query contained no executable statement');
  }

  if (sanitized.includes(';')) {
    throw new SqlValidationError('SQL_MULTI_STATEMENT', 'Multiple SQL statements or semicolons are forbidden');
  }

  if (!/^(?:SELECT|WITH)\b/i.test(sanitized)) {
    throw new SqlValidationError('SQL_NOT_SELECT', 'Only read-only SELECT queries are permitted');
  }

  const kwMatch = sanitized.match(INTERNAL_KEYWORD_REGEX);
  if (kwMatch) {
    throw new SqlValidationError(
      'SQL_FORBIDDEN_KEYWORD',
      `Forbidden SQL keyword "${kwMatch[0].toUpperCase()}" is not permitted`
    );
  }

  if (FOR_LOCKING_REGEX.test(sanitized)) {
    throw new SqlValidationError('SQL_FORBIDDEN_LOCK', 'Row-locking FOR UPDATE/SHARE clauses are forbidden');
  }

  const idMatch = sanitized.match(INTERNAL_IDENTIFIER_REGEX);
  if (idMatch) {
    throw new SqlValidationError(
      'SQL_FORBIDDEN_IDENTIFIER',
      `Access to restricted identifier "${idMatch[0].toLowerCase()}" is forbidden`
    );
  }

  assertApprovedTablesOnly(sanitized);

  return true;
}

/**
 * Enforces an explicit function allowlist on dynamic SQL.
 * Rejects any schema-qualified function call (`pg_catalog.set_config(...)`) and any
 * function name not in `DYNAMIC_SQL_ALLOWED_FUNCTIONS`.
 */
function assertDynamicAllowedFunctionsOnly(sanitizedSql, cteNames) {
  // 1. Reject any schema-qualified function call (`schema.fn(...)`)
  const schemaFnRe = /\b([a-zA-Z_"][a-zA-Z0-9_"]*)\s*\.\s*([a-zA-Z_"][a-zA-Z0-9_"]*)\s*\(/g;
  const schemaFnMatch = schemaFnRe.exec(sanitizedSql);
  if (schemaFnMatch) {
    const fnFull = `${schemaFnMatch[1]}.${schemaFnMatch[2]}`.replace(/"/g, '');
    throw new SqlValidationError(
      'SQL_FORBIDDEN_FUNCTION',
      `Schema-qualified function call "${fnFull}()" is forbidden`
    );
  }

  // 2. Check every `identifier(` token
  const fnCallRe = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let m;
  while ((m = fnCallRe.exec(sanitizedSql)) !== null) {
    const rawName = m[1];
    const upper = rawName.toUpperCase();
    const lower = rawName.toLowerCase();

    if (SQL_SYNTAX_PARENS_KEYWORDS.has(upper)) {
      continue;
    }

    // Allow `WITH cte_name (col1, col2) AS (...)` column-list syntax if preceded by WITH or comma
    if (cteNames.has(lower)) {
      const before = sanitizedSql.slice(Math.max(0, m.index - 25), m.index);
      if (/(?:(?:\bWITH(?:\s+RECURSIVE)?)|,)\s*$/i.test(before)) {
        continue;
      }
    }

    if (!DYNAMIC_SQL_ALLOWED_FUNCTIONS.has(upper)) {
      throw new SqlValidationError(
        'SQL_FORBIDDEN_FUNCTION',
        `Function "${rawName}()" is not in the dynamic SQL function allowlist`
      );
    }
  }
}

/**
 * Enforces `ai_ro` schema isolation and role-based view restrictions (`owner`/`admin` vs `staff`/`agent`).
 */
function assertDynamicAiRoSchemaAndRole(sanitizedSql, role, cteNames) {
  const normRole = String(role || 'staff').toLowerCase();
  const isOwnerOrAdmin = normRole === 'owner' || normRole === 'admin';

  // 1. Block any explicit reference to forbidden schemas anywhere in the query
  const badSchemaRe = /\b(public|pg_catalog|information_schema|pg_toast|pg_temp)\s*\./i;
  const badSchemaMatch = sanitizedSql.match(badSchemaRe);
  if (badSchemaMatch) {
    throw new SqlValidationError(
      'SQL_FORBIDDEN_SCHEMA',
      `Schema "${badSchemaMatch[1].toLowerCase()}" is strictly forbidden; query only ai_ro views`
    );
  }

  // 2. Block any 3-part identifier (`schema.table.col`) unless schema === 'ai_ro' and table is approved
  const threePartRe =
    /\b([a-zA-Z_"][a-zA-Z0-9_"]*)\s*\.\s*([a-zA-Z_"][a-zA-Z0-9_"]*)\s*\.\s*([a-zA-Z_"][a-zA-Z0-9_"]*)/g;
  let m3;
  while ((m3 = threePartRe.exec(sanitizedSql)) !== null) {
    const sName = m3[1].replace(/"/g, '').toLowerCase();
    const tName = m3[2].replace(/"/g, '').toLowerCase();
    if (sName !== 'ai_ro') {
      throw new SqlValidationError('SQL_FORBIDDEN_SCHEMA', `Schema "${sName}" is not permitted`);
    }
    if (!AI_RO_ALL_VIEWS.has(tName)) {
      throw new SqlValidationError('SQL_UNAPPROVED_VIEW', `View "ai_ro.${tName}" is not approved`);
    }
    if (!isOwnerOrAdmin && (AI_RO_OWNER_ADMIN_ONLY_VIEWS.has(tName) || tName.startsWith('acc_'))) {
      throw new SqlValidationError(
        'SQL_ROLE_TABLE_FORBIDDEN',
        `Role "${normRole}" is not permitted to query view "ai_ro.${tName}"`
      );
    }
  }

  // 3. Validate every relation in FROM / JOIN across main query, CTEs, subqueries, and UNIONs
  const tableRefRegex = /\b(?:FROM|JOIN)\s+(?!\()([a-zA-Z_"][a-zA-Z0-9_"]*(?:\s*\.\s*[a-zA-Z_"][a-zA-Z0-9_"]*)?)/gi;
  const referencedViews = [];
  let match;

  while ((match = tableRefRegex.exec(sanitizedSql)) !== null) {
    const prefix = sanitizedSql.slice(Math.max(0, match.index - 60), match.index);
    if (
      /\b(?:EXTRACT|TRIM|BTRIM|LTRIM|RTRIM|SUBSTRING)\s*\([^()]*$/i.test(prefix) ||
      /\bDISTINCT\s*$/i.test(prefix)
    ) {
      continue;
    }

    const rawRef = match[1].replace(/["\s]/g, '').toLowerCase();
    if (rawRef === 'lateral') {
      continue;
    }

    let schema = 'ai_ro';
    let viewName = rawRef;
    if (rawRef.includes('.')) {
      const parts = rawRef.split('.');
      if (parts.length !== 2) {
        throw new SqlValidationError('SQL_INVALID_TABLE_REF', `Invalid view reference: ${rawRef}`);
      }
      schema = parts[0];
      viewName = parts[1];
    }

    if (schema !== 'ai_ro') {
      throw new SqlValidationError(
        'SQL_FORBIDDEN_SCHEMA',
        `Schema "${schema}" is not permitted; only "ai_ro" views are allowed`
      );
    }

    if (!rawRef.includes('.') && cteNames.has(viewName)) {
      continue;
    }

    if (!AI_RO_ALL_VIEWS.has(viewName)) {
      throw new SqlValidationError(
        'SQL_UNAPPROVED_VIEW',
        `View "${viewName}" is not in the approved ai_ro view registry`
      );
    }

    if (!isOwnerOrAdmin && (AI_RO_OWNER_ADMIN_ONLY_VIEWS.has(viewName) || viewName.startsWith('acc_'))) {
      throw new SqlValidationError(
        'SQL_ROLE_TABLE_FORBIDDEN',
        `Role "${normRole}" is not permitted to read financial/accounting view "ai_ro.${viewName}"`
      );
    }

    referencedViews.push(viewName);
  }

  return referencedViews;
}

/**
 * Defense-in-depth check rejecting any explicit foreign `finance_id` UUID filter or
 * cross-tenant tautology/negation (`finance_id !=`, `finance_id <>`, `finance_id IS NOT NULL` tricks).
 */
function assertNoCrossTenantFilterAttempt(sanitizedSql, literals, expectedFinanceId) {
  if (/\bfinance_id\s*(?:!=|<>)/i.test(sanitizedSql)) {
    throw new SqlValidationError(
      'SQL_CROSS_TENANT_ATTEMPT',
      'Cross-tenant finance_id negation filter is forbidden'
    );
  }

  if (!expectedFinanceId) return;
  const normExpected = String(expectedFinanceId).trim().toLowerCase();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Check any string literal compared near `finance_id`
  const finCompareRe = /\bfinance_id\b[^;]{0,40}'__STR_(\d+)__'/gi;
  let m;
  while ((m = finCompareRe.exec(sanitizedSql)) !== null) {
    const idx = Number.parseInt(m[1], 10);
    const lit = String(literals[idx] || '').trim().toLowerCase();
    if (uuidRe.test(lit) && lit !== normExpected) {
      throw new SqlValidationError(
        'SQL_CROSS_TENANT_ATTEMPT',
        'Cross-tenant finance_id filter attempt is forbidden'
      );
    }
  }
}

/**
 * Validates a dynamic LLM-generated SELECT query and wraps it in a bounded `LIMIT` subquery.
 *
 * @param {string} rawSql
 * @param {string} [role='staff']
 * @param {{ maxRows?: number, financeId?: string }} [options={}]
 * @returns {{ wrappedSql: string, cleanedSql: string, referencedViews: string[] }}
 */
function validateDynamicSelectSql(rawSql, role = 'staff', options = {}) {
  if (typeof rawSql !== 'string' || !rawSql.trim()) {
    throw new SqlValidationError('SQL_EMPTY', 'Dynamic SQL query must be a non-empty string');
  }

  if (rawSql.length > 4000) {
    throw new SqlValidationError('SQL_TOO_LONG', 'Dynamic SQL query exceeds 4000 character limit');
  }

  // Strip a single optional trailing semicolon ONLY at the very end of the query
  const trimmedSql = rawSql.trim().replace(/;\s*$/, '').trim();
  if (!trimmedSql) {
    throw new SqlValidationError('SQL_EMPTY', 'Dynamic SQL query contained no executable statement');
  }

  const literals = [];
  const sanitized = stripCommentsAndStrings(trimmedSql, {
    allowComments: false,
    literalsOut: literals,
  }).trim();

  if (sanitized.includes(';')) {
    throw new SqlValidationError('SQL_MULTI_STATEMENT', 'Multiple SQL statements are forbidden');
  }

  if (!/^(?:SELECT|WITH)\b/i.test(sanitized)) {
    throw new SqlValidationError('SQL_NOT_SELECT', 'Only SELECT or WITH ... SELECT queries are permitted');
  }

  if (/^WITH\b/i.test(sanitized) && !/\bSELECT\b/i.test(sanitized)) {
    throw new SqlValidationError('SQL_NOT_SELECT', 'CTE query must contain a SELECT statement');
  }

  const kwMatch = sanitized.match(DYNAMIC_KEYWORD_REGEX);
  if (kwMatch) {
    throw new SqlValidationError(
      'SQL_FORBIDDEN_KEYWORD',
      `Forbidden SQL keyword "${kwMatch[0].toUpperCase()}" is not permitted`
    );
  }

  if (FOR_LOCKING_REGEX.test(sanitized)) {
    throw new SqlValidationError('SQL_FORBIDDEN_LOCK', 'Row-locking FOR UPDATE/SHARE clauses are forbidden');
  }

  const idMatch = sanitized.match(DYNAMIC_IDENTIFIER_REGEX);
  if (idMatch) {
    throw new SqlValidationError(
      'SQL_FORBIDDEN_IDENTIFIER',
      `Access to restricted identifier "${idMatch[0].toLowerCase()}" is forbidden`
    );
  }

  const cteNames = extractCteNames(sanitized);
  assertDynamicAllowedFunctionsOnly(sanitized, cteNames);
  const referencedViews = assertDynamicAiRoSchemaAndRole(sanitized, role, cteNames);
  assertNoCrossTenantFilterAttempt(sanitized, literals, options.financeId);

  const maxRows = Math.max(1, Math.min(50, Number.parseInt(String(options.maxRows || 50), 10) || 50));
  const wrappedSql = `SELECT * FROM (${trimmedSql}) AS _ai_q LIMIT ${maxRows}`;

  return {
    wrappedSql,
    cleanedSql: trimmedSql,
    referencedViews,
  };
}

module.exports = {
  APPROVED_READONLY_TABLES,
  AI_RO_OPERATIONAL_VIEWS,
  AI_RO_OWNER_ADMIN_ONLY_VIEWS,
  AI_RO_ALL_VIEWS,
  DYNAMIC_SQL_ALLOWED_FUNCTIONS,
  FORBIDDEN_SQL_KEYWORDS,
  FORBIDDEN_IDENTIFIERS,
  SqlValidationError,
  assertSafeSelectSql,
  validateDynamicSelectSql,
};
