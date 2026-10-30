const { db } = require('../../../config/database.config');

// ─── Enums & Constants ────────────────────────────────────────────────────────
const VALID_NATURES = ['Assets', 'Liabilities', 'Income', 'Expenses'];
const VALID_ALLOCATION_METHODS = ['By Quantity', 'By Value', 'Not Applicable'];
const VALID_NETT_REPORT = ['Debit', 'Credit', 'Both'];

/**
 * Normalizes nature string to canonical DB enum ('Assets', 'Liabilities', 'Income', 'Expenses')
 */
function normalizeNature(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^expense/i.test(s)) return 'Expenses';
  if (/^asset/i.test(s)) return 'Assets';
  if (/^liabilit/i.test(s)) return 'Liabilities';
  if (/^income/i.test(s)) return 'Income';
  return s;
}

/**
 * Ensures all 28 TallyPrime system groups exist for the given finance_id in acc_ledger_groups.
 * Fully concurrent-safe and idempotent (ON CONFLICT DO NOTHING).
 */
async function ensureSystemGroups(finance_id, client = null) {
  if (!finance_id) return;
  const runner = client || db;

  // 1. Root System Groups (15 top-level groups)
  await runner.query(
    `INSERT INTO acc_ledger_groups (
        finance_id, group_name, parent_group_id, system_parent_id, custom_parent_id, root_master_id,
        nature, affects_gross_profit, behaves_like_subledger, nett_balance_report,
        used_for_calculation, allocation_method, is_system, system_group_type, is_active
    )
    SELECT
        $1,
        v.group_name,
        NULL,
        m.id,
        NULL,
        m.id,
        v.nature::acc_group_nature_enum,
        v.affects_gross_profit,
        FALSE,
        'Both'::acc_nett_balance_report_enum,
        FALSE,
        'Not Applicable'::acc_allocation_method_enum,
        TRUE,
        v.system_group_type::acc_system_group_type_enum,
        TRUE
    FROM (
        VALUES
            ('Capital Account',        'Liabilities', 'Primary',           FALSE),
            ('Loans (Liability)',      'Liabilities', 'Primary',           FALSE),
            ('Current Liabilities',    'Liabilities', 'Primary',           FALSE),
            ('Branch / Divisions',     'Liabilities', 'Primary',           FALSE),
            ('Fixed Assets',           'Assets',      'Primary',           FALSE),
            ('Investments',            'Assets',      'Primary',           FALSE),
            ('Current Assets',         'Assets',      'Primary',           FALSE),
            ('Misc. Expenses (Asset)', 'Assets',      'Primary',           FALSE),
            ('Suspense A/c',           'Assets',      'Primary',           FALSE),
            ('Sales Accounts',         'Income',      'Sales Accounts',    TRUE),
            ('Direct Incomes',         'Income',      'Direct Income',     TRUE),
            ('Indirect Incomes',       'Income',      'Indirect Income',   FALSE),
            ('Purchase Accounts',      'Expenses',    'Purchase Accounts', TRUE),
            ('Direct Expenses',        'Expenses',    'Direct Expenses',   TRUE),
            ('Indirect Expenses',      'Expenses',    'Indirect Expenses', FALSE)
    ) AS v(group_name, nature, system_group_type, affects_gross_profit)
    JOIN acc_group_master m ON m.group_name = v.group_name
    ON CONFLICT (finance_id, group_name) DO NOTHING`,
    [finance_id]
  );

  // 2. Child System Groups (13 secondary groups)
  await runner.query(
    `INSERT INTO acc_ledger_groups (
        finance_id, group_name, parent_group_id, system_parent_id, custom_parent_id, root_master_id,
        nature, affects_gross_profit, behaves_like_subledger, nett_balance_report,
        used_for_calculation, allocation_method, is_system, system_group_type, is_active
    )
    SELECT
        $1,
        v.group_name,
        p.id,
        m.id,
        NULL,
        p.root_master_id,
        v.nature::acc_group_nature_enum,
        v.affects_gross_profit,
        FALSE,
        'Both'::acc_nett_balance_report_enum,
        FALSE,
        'Not Applicable'::acc_allocation_method_enum,
        TRUE,
        v.system_group_type::acc_system_group_type_enum,
        TRUE
    FROM (
        VALUES
            ('Reserves & Surplus',       'Capital Account',     'Liabilities', 'Primary',          FALSE),
            ('Secured Loans',            'Loans (Liability)',   'Liabilities', 'Primary',          FALSE),
            ('Unsecured Loans',          'Loans (Liability)',   'Liabilities', 'Primary',          FALSE),
            ('Bank OD A/c',              'Loans (Liability)',   'Liabilities', 'Primary',          FALSE),
            ('Sundry Creditors',         'Current Liabilities', 'Liabilities', 'Sundry Creditors', FALSE),
            ('Duties & Taxes',           'Current Liabilities', 'Liabilities', 'Primary',          FALSE),
            ('Provisions',               'Current Liabilities', 'Liabilities', 'Primary',          FALSE),
            ('Sundry Debtors',           'Current Assets',      'Assets',      'Sundry Debtors',   FALSE),
            ('Cash-in-hand',             'Current Assets',      'Assets',      'Cash in Hand',     FALSE),
            ('Bank Accounts',            'Current Assets',      'Assets',      'Bank Accounts',    FALSE),
            ('Stock-in-hand',            'Current Assets',      'Assets',      'Stock in Hand',    FALSE),
            ('Deposits (Asset)',         'Current Assets',      'Assets',      'Primary',          FALSE),
            ('Loans & Advances (Asset)', 'Current Assets',      'Assets',      'Primary',          FALSE)
    ) AS v(group_name, parent_name, nature, system_group_type, affects_gross_profit)
    JOIN acc_ledger_groups p
        ON p.finance_id = $1 AND p.group_name = v.parent_name
    JOIN acc_group_master m
        ON m.group_name = v.group_name
    ON CONFLICT (finance_id, group_name) DO NOTHING`,
    [finance_id]
  );

  // 3. Backfill root_master_id for any existing rows where root_master_id is NULL
  await runner.query(
    `UPDATE acc_ledger_groups g
     SET root_master_id = m.id
     FROM acc_group_master m
     WHERE g.finance_id = $1 AND g.root_master_id IS NULL AND g.parent_group_id IS NULL AND g.group_name = m.group_name`,
    [finance_id]
  );

  await runner.query(
    `UPDATE acc_ledger_groups g
     SET root_master_id = p.root_master_id
     FROM acc_ledger_groups p
     WHERE g.finance_id = $1 AND g.root_master_id IS NULL AND g.parent_group_id = p.id`,
    [finance_id]
  );
}

/**
 * Resolves parent group references, nature inheritance, and root_master_id
 */
async function resolveParentMeta(runner, finance_id, { system_parent_id, custom_parent_id, parent_group_id, nature }) {
  const targetParentId = parent_group_id || custom_parent_id || system_parent_id;

  // Case 1: Primary group (no parent)
  if (!targetParentId || targetParentId === '__none__') {
    const normNature = normalizeNature(nature);
    if (!normNature || !VALID_NATURES.includes(normNature)) {
      const err = new Error('Nature is required for Primary groups and must be Assets, Liabilities, Income, or Expenses');
      err.statusCode = 400;
      throw err;
    }
    return {
      parent_group_id: null,
      system_parent_id: null,
      custom_parent_id: null,
      root_master_id: null,
      nature: normNature,
    };
  }

  // Case 2: Parent is in acc_ledger_groups for this finance
  const localRes = await runner.query(
    `SELECT id, group_name, nature, is_system, system_parent_id, root_master_id
     FROM acc_ledger_groups
     WHERE finance_id = $1 AND (id = $2 OR system_parent_id = $2) AND is_active = true
     LIMIT 1`,
    [finance_id, targetParentId]
  );

  if (localRes.rows.length > 0) {
    const parentRow = localRes.rows[0];
    const normNature = normalizeNature(nature);
    const resolvedNature = (normNature && VALID_NATURES.includes(normNature)) ? normNature : parentRow.nature;

    return {
      parent_group_id: parentRow.id,
      system_parent_id: parentRow.is_system ? parentRow.system_parent_id : null,
      custom_parent_id: parentRow.is_system ? null : parentRow.id,
      root_master_id: parentRow.root_master_id,
      nature: resolvedNature,
    };
  }

  // Case 3: Parent is in acc_group_master directly
  const masterRes = await runner.query(
    `SELECT id, group_name, nature FROM acc_group_master WHERE id = $1 AND is_active = true LIMIT 1`,
    [targetParentId]
  );

  if (masterRes.rows.length > 0) {
    const masterRow = masterRes.rows[0];
    // Find the corresponding seeded row in acc_ledger_groups
    const sysRowRes = await runner.query(
      `SELECT id, root_master_id, nature FROM acc_ledger_groups WHERE finance_id = $1 AND group_name = $2 LIMIT 1`,
      [finance_id, masterRow.group_name]
    );
    const sysRow = sysRowRes.rows[0];
    const normNature = normalizeNature(nature);
    const resolvedNature = (normNature && VALID_NATURES.includes(normNature)) ? normNature : masterRow.nature;

    return {
      parent_group_id: sysRow ? sysRow.id : null,
      system_parent_id: masterRow.id,
      custom_parent_id: null,
      root_master_id: sysRow ? sysRow.root_master_id : masterRow.id,
      nature: resolvedNature,
    };
  }

  const err = new Error('Parent group not found or belongs to another company');
  err.statusCode = 400;
  throw err;
}

// ─── GET /ledger-groups/list ──────────────────────────────────────────────────
exports.getGroups = async (finance_id) => {
  if (!finance_id) throw new Error('finance_id is required');

  // Lazy safety call to ensure system groups exist
  await ensureSystemGroups(finance_id);

  const res = await db.query(
    `SELECT
        id,
        finance_id,
        group_name,
        alias,
        alias_lang,
        parent_group_id,
        system_parent_id,
        custom_parent_id,
        root_master_id,
        nature,
        affects_gross_profit,
        behaves_like_subledger,
        nett_balance_report,
        used_for_calculation,
        allocation_method,
        is_system,
        system_group_type,
        is_active,
        created_at,
        updated_at
     FROM acc_ledger_groups
     WHERE finance_id = $1 AND is_active = true
     ORDER BY is_system DESC, group_name ASC`,
    [finance_id]
  );

  const systemGroups = res.rows.filter(r => r.is_system);
  const customGroups = res.rows.filter(r => !r.is_system);

  return { systemGroups, customGroups };
};

// ─── GET /ledger-groups/under-dropdown ────────────────────────────────────────
exports.getUnderDropdown = async (finance_id) => {
  if (!finance_id) throw new Error('finance_id is required');

  await ensureSystemGroups(finance_id);

  const res = await db.query(
    `SELECT
        g.id,
        g.group_name,
        COALESCE(g.parent_group_id, g.custom_parent_id) AS parent_group_id,
        p.group_name AS parent_name,
        g.nature,
        CASE WHEN g.is_system THEN 'system' ELSE 'custom' END AS source,
        g.affects_gross_profit,
        g.behaves_like_subledger,
        g.nett_balance_report,
        g.used_for_calculation,
        g.allocation_method
     FROM acc_ledger_groups g
     LEFT JOIN acc_ledger_groups p ON p.id = COALESCE(g.parent_group_id, g.custom_parent_id)
     WHERE g.finance_id = $1 AND g.is_active = true
     ORDER BY g.is_system DESC, g.group_name ASC`,
    [finance_id]
  );

  return res.rows;
};

// ─── POST /ledger-groups/create ──────────────────────────────────────────────
exports.createGroup = async (data) => {
  const { finance_id, group_name, alias, alias_lang } = data;
  if (!finance_id) throw new Error('finance_id is required');
  if (!group_name?.trim()) throw new Error('group_name is required');

  const trimmedName = group_name.trim();

  // Duplicate name check within finance (case-insensitive)
  const dupCheck = await db.query(
    `SELECT id FROM acc_ledger_groups WHERE finance_id = $1 AND LOWER(group_name) = LOWER($2) LIMIT 1`,
    [finance_id, trimmedName]
  );
  if (dupCheck.rows.length > 0) {
    const err = new Error(`Group "${trimmedName}" already exists for this company`);
    err.statusCode = 409;
    throw err;
  }

  // Resolve parent meta, nature, and root_master_id
  const meta = await resolveParentMeta(db, finance_id, {
    system_parent_id: data.system_parent_id,
    custom_parent_id: data.custom_parent_id,
    parent_group_id: data.parent_group_id,
    nature: data.nature,
  });

  const affects_gross_profit = Boolean(data.affects_gross_profit);
  const behaves_like_subledger = Boolean(data.behaves_like_subledger);
  const nett_balance_report = VALID_NETT_REPORT.includes(data.nett_balance_report) ? data.nett_balance_report : 'Both';
  const used_for_calculation = Boolean(data.used_for_calculation);
  const allocation_method = VALID_ALLOCATION_METHODS.includes(data.allocation_method) ? data.allocation_method : 'Not Applicable';

  try {
    const res = await db.query(
      `INSERT INTO acc_ledger_groups (
          finance_id, group_name, alias, alias_lang,
          parent_group_id, system_parent_id, custom_parent_id, root_master_id,
          nature, affects_gross_profit, behaves_like_subledger,
          nett_balance_report, used_for_calculation, allocation_method,
          is_system, system_group_type, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, 'Custom', true)
      RETURNING id`,
      [
        finance_id,
        trimmedName,
        alias ? alias.trim() : null,
        alias_lang ? JSON.stringify(alias_lang) : null,
        meta.parent_group_id,
        meta.system_parent_id,
        meta.custom_parent_id,
        meta.root_master_id,
        meta.nature,
        affects_gross_profit,
        behaves_like_subledger,
        nett_balance_report,
        used_for_calculation,
        allocation_method,
      ]
    );

    return res.rows[0].id;
  } catch (err) {
    if (err.code === '23505') {
      const customErr = new Error(`Group "${trimmedName}" already exists for this company`);
      customErr.statusCode = 409;
      throw customErr;
    }
    throw err;
  }
};

// ─── PUT /ledger-groups/update/:id ───────────────────────────────────────────
exports.updateGroup = async (id, finance_id, data) => {
  if (!id) throw new Error('group id is required');
  if (!finance_id) throw new Error('finance_id is required');

  const existingRes = await db.query(
    `SELECT id, is_system, group_name, alias, alias_lang, parent_group_id, system_parent_id, custom_parent_id, root_master_id, nature
     FROM acc_ledger_groups WHERE id = $1 AND finance_id = $2`,
    [id, finance_id]
  );
  if (existingRes.rows.length === 0) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }

  const existing = existingRes.rows[0];
  if (existing.is_system) {
    const err = new Error('System groups cannot be altered, deactivated or deleted');
    err.statusCode = 400;
    throw err;
  }

  const trimmedName = data.group_name ? data.group_name.trim() : existing.group_name;

  // Duplicate name check
  const dupCheck = await db.query(
    `SELECT id FROM acc_ledger_groups WHERE finance_id = $1 AND LOWER(group_name) = LOWER($2) AND id != $3 LIMIT 1`,
    [finance_id, trimmedName, id]
  );
  if (dupCheck.rows.length > 0) {
    const err = new Error(`Group "${trimmedName}" already exists for this company`);
    err.statusCode = 409;
    throw err;
  }

  // Prevent cycle if parent is changing
  const hasParentChange = data.parent_group_id !== undefined || data.custom_parent_id !== undefined || data.system_parent_id !== undefined;
  const targetParent = data.parent_group_id || data.custom_parent_id || data.system_parent_id;

  if (hasParentChange && targetParent && targetParent !== '__none__') {
    if (targetParent === id) {
      const err = new Error('A group cannot be its own parent');
      err.statusCode = 400;
      throw err;
    }

    const cycleCheck = await db.query(
      `WITH RECURSIVE descendants AS (
          SELECT id FROM acc_ledger_groups WHERE parent_group_id = $1 AND finance_id = $2
          UNION ALL
          SELECT g.id FROM acc_ledger_groups g
          JOIN descendants d ON g.parent_group_id = d.id
          WHERE g.finance_id = $2
      )
      SELECT id FROM descendants WHERE id = $3`,
      [id, finance_id, targetParent]
    );

    if (cycleCheck.rows.length > 0) {
      const err = new Error('Cannot set parent to a descendant group (cycle detected)');
      err.statusCode = 400;
      throw err;
    }
  }

  // Resolve parent meta
  let meta;
  if (!hasParentChange) {
    const normNature = normalizeNature(data.nature);
    meta = {
      parent_group_id: existing.parent_group_id,
      system_parent_id: existing.system_parent_id,
      custom_parent_id: existing.custom_parent_id,
      root_master_id: existing.root_master_id,
      nature: (normNature && VALID_NATURES.includes(normNature)) ? normNature : existing.nature,
    };
  } else {
    meta = await resolveParentMeta(db, finance_id, {
      system_parent_id: data.system_parent_id,
      custom_parent_id: data.custom_parent_id,
      parent_group_id: data.parent_group_id,
      nature: data.nature,
    });
  }

  const affects_gross_profit = data.affects_gross_profit !== undefined ? Boolean(data.affects_gross_profit) : undefined;
  const behaves_like_subledger = data.behaves_like_subledger !== undefined ? Boolean(data.behaves_like_subledger) : undefined;
  const nett_balance_report = VALID_NETT_REPORT.includes(data.nett_balance_report) ? data.nett_balance_report : undefined;
  const used_for_calculation = data.used_for_calculation !== undefined ? Boolean(data.used_for_calculation) : undefined;
  const allocation_method = VALID_ALLOCATION_METHODS.includes(data.allocation_method) ? data.allocation_method : undefined;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE acc_ledger_groups SET
          group_name = $1,
          alias = $2,
          alias_lang = $3,
          parent_group_id = $4,
          system_parent_id = $5,
          custom_parent_id = $6,
          root_master_id = $7,
          nature = $8,
          affects_gross_profit = COALESCE($9, affects_gross_profit),
          behaves_like_subledger = COALESCE($10, behaves_like_subledger),
          nett_balance_report = COALESCE($11, nett_balance_report),
          used_for_calculation = COALESCE($12, used_for_calculation),
          allocation_method = COALESCE($13, allocation_method),
          updated_at = CURRENT_TIMESTAMP
       WHERE id = $14 AND finance_id = $15`,
      [
        trimmedName,
        data.alias !== undefined ? (data.alias ? data.alias.trim() : null) : existing.alias,
        data.alias_lang !== undefined ? (data.alias_lang ? JSON.stringify(data.alias_lang) : null) : existing.alias_lang,
        meta.parent_group_id,
        meta.system_parent_id,
        meta.custom_parent_id,
        meta.root_master_id,
        meta.nature,
        affects_gross_profit,
        behaves_like_subledger,
        nett_balance_report,
        used_for_calculation,
        allocation_method,
        id,
        finance_id,
      ]
    );

    // Cascade nature and root_master_id updates to descendants
    await client.query(
      `WITH RECURSIVE descendants AS (
          SELECT id FROM acc_ledger_groups WHERE parent_group_id = $1 AND finance_id = $2
          UNION ALL
          SELECT g.id FROM acc_ledger_groups g
          JOIN descendants d ON g.parent_group_id = d.id
          WHERE g.finance_id = $2
      )
      UPDATE acc_ledger_groups
      SET nature = $3, root_master_id = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (SELECT id FROM descendants)`,
      [id, finance_id, meta.nature, meta.root_master_id]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const customErr = new Error(`Group "${trimmedName}" already exists for this company`);
      customErr.statusCode = 409;
      throw customErr;
    }
    throw err;
  } finally {
    client.release();
  }
};

// ─── DELETE /ledger-groups/:id ───────────────────────────────────────────────
exports.deleteGroup = async (id, finance_id) => {
  if (!id) throw new Error('group id is required');
  if (!finance_id) throw new Error('finance_id is required');

  const existingRes = await db.query(
    `SELECT id, is_system, group_name FROM acc_ledger_groups WHERE id = $1 AND finance_id = $2`,
    [id, finance_id]
  );
  if (existingRes.rows.length === 0) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }

  const existing = existingRes.rows[0];
  if (existing.is_system) {
    const err = new Error('System groups cannot be altered, deactivated or deleted');
    err.statusCode = 400;
    throw err;
  }

  // Check child groups
  const childCheck = await db.query(
    `SELECT count(*) FROM acc_ledger_groups WHERE parent_group_id = $1 AND is_active = true`,
    [id]
  );
  if (parseInt(childCheck.rows[0].count, 10) > 0) {
    const err = new Error(`Cannot delete group "${existing.group_name}": it has child groups`);
    err.statusCode = 409;
    throw err;
  }

  // Check referencing ledgers
  const ledgerCheck = await db.query(
    `SELECT count(*) FROM acc_ledgers WHERE group_id = $1 AND is_active = true`,
    [id]
  );
  if (parseInt(ledgerCheck.rows[0].count, 10) > 0) {
    const err = new Error(`Cannot delete group "${existing.group_name}": it is used by active ledgers`);
    err.statusCode = 409;
    throw err;
  }

  try {
    await db.query(`DELETE FROM acc_ledger_groups WHERE id = $1 AND finance_id = $2`, [id, finance_id]);
    return true;
  } catch (err) {
    if (err.code === '23503') {
      const customErr = new Error(`Cannot delete group "${existing.group_name}": referenced by child records`);
      customErr.statusCode = 409;
      throw customErr;
    }
    throw err;
  }
};

// ─── POST /ledger-groups/multi-create ────────────────────────────────────────
exports.multiCreateGroup = async (finance_id, groups) => {
  if (!finance_id) throw new Error('finance_id is required');
  if (!Array.isArray(groups) || !groups.length) throw new Error('groups[] must be a non-empty array');

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const results = [];

    for (const [index, G] of groups.entries()) {
      const label = `Row ${index + 1}`;
      if (!G.group_name?.trim()) throw new Error(`${label}: group_name is required`);

      const trimmedName = G.group_name.trim();

      // Check duplicates
      const dup = await client.query(
        `SELECT id FROM acc_ledger_groups WHERE finance_id = $1 AND LOWER(group_name) = LOWER($2) LIMIT 1`,
        [finance_id, trimmedName]
      );
      if (dup.rows.length > 0) {
        throw new Error(`${label}: Group "${trimmedName}" already exists for this company`);
      }

      const meta = await resolveParentMeta(client, finance_id, {
        system_parent_id: G.system_parent_id,
        custom_parent_id: G.custom_parent_id,
        parent_group_id: G.parent_group_id,
        nature: G.nature,
      });

      const res = await client.query(
        `INSERT INTO acc_ledger_groups (
            finance_id, group_name, alias, alias_lang,
            parent_group_id, system_parent_id, custom_parent_id, root_master_id,
            nature, affects_gross_profit, behaves_like_subledger,
            nett_balance_report, used_for_calculation, allocation_method,
            is_system, system_group_type, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, 'Custom', true)
        RETURNING id`,
        [
          finance_id,
          trimmedName,
          G.alias ? G.alias.trim() : null,
          G.alias_lang ? JSON.stringify(G.alias_lang) : null,
          meta.parent_group_id,
          meta.system_parent_id,
          meta.custom_parent_id,
          meta.root_master_id,
          meta.nature,
          Boolean(G.affects_gross_profit),
          Boolean(G.behaves_like_subledger),
          VALID_NETT_REPORT.includes(G.nett_balance_report) ? G.nett_balance_report : 'Both',
          Boolean(G.used_for_calculation),
          VALID_ALLOCATION_METHODS.includes(G.allocation_method) ? G.allocation_method : 'Not Applicable',
        ]
      );

      results.push({
        index,
        group_name: trimmedName,
        id: res.rows[0].id,
        nature: meta.nature,
        root_master_id: meta.root_master_id,
      });
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── POST /ledger-groups/multi-update ────────────────────────────────────────
exports.multiUpdateGroup = async (finance_id, groups) => {
  if (!finance_id) throw new Error('finance_id is required');
  if (!Array.isArray(groups) || !groups.length) throw new Error('groups[] must be a non-empty array');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (const [index, G] of groups.entries()) {
      const label = `Row ${index + 1}`;
      if (!G.id) throw new Error(`${label}: group id is required`);
      if (!G.group_name?.trim()) throw new Error(`${label}: group_name is required`);

      const trimmedName = G.group_name.trim();

      const existingRes = await client.query(
        `SELECT id, is_system FROM acc_ledger_groups WHERE id = $1 AND finance_id = $2`,
        [G.id, finance_id]
      );
      if (existingRes.rows.length === 0) throw new Error(`${label}: Group with id ${G.id} not found`);
      if (existingRes.rows[0].is_system) {
        throw new Error(`${label}: System group "${trimmedName}" cannot be altered`);
      }

      const dup = await client.query(
        `SELECT id FROM acc_ledger_groups WHERE finance_id = $1 AND LOWER(group_name) = LOWER($2) AND id != $3 LIMIT 1`,
        [finance_id, trimmedName, G.id]
      );
      if (dup.rows.length > 0) {
        throw new Error(`${label}: Group "${trimmedName}" already exists for this company`);
      }

      const meta = await resolveParentMeta(client, finance_id, {
        system_parent_id: G.system_parent_id,
        custom_parent_id: G.custom_parent_id,
        parent_group_id: G.parent_group_id,
        nature: G.nature,
      });

      await client.query(
        `UPDATE acc_ledger_groups SET
            group_name = $1,
            alias = $2,
            parent_group_id = $3,
            system_parent_id = $4,
            custom_parent_id = $5,
            nature = $6,
            root_master_id = $7,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = $8 AND finance_id = $9`,
        [
          trimmedName,
          G.alias ? G.alias.trim() : null,
          meta.parent_group_id,
          meta.system_parent_id,
          meta.custom_parent_id,
          meta.nature,
          meta.root_master_id,
          G.id,
          finance_id,
        ]
      );

      // Cascade update to descendants
      await client.query(
        `WITH RECURSIVE descendants AS (
            SELECT id FROM acc_ledger_groups WHERE parent_group_id = $1 AND finance_id = $2
            UNION ALL
            SELECT g.id FROM acc_ledger_groups g
            JOIN descendants d ON g.parent_group_id = d.id
            WHERE g.finance_id = $2
        )
        UPDATE acc_ledger_groups
        SET nature = $3, root_master_id = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT id FROM descendants)`,
        [G.id, finance_id, meta.nature, meta.root_master_id]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.ensureSystemGroups = ensureSystemGroups;
