const { db } = require('../../../config/database.config');


// CREATE TABLE acc_group_master (
//     id                     INT           NOT NULL AUTO_INCREMENT,
//     group_name             VARCHAR(150)  NOT NULL,   -- mandatory
//     parent_id              INT           DEFAULT NULL, -- nullable (root groups)
//     nature                 ENUM('Assets','Liabilities','Income','Expenses') NOT NULL, -- mandatory
//     affects_gross_profit   TINYINT(1)    NOT NULL DEFAULT 0, -- optional to pass
//     behaves_like_subledger TINYINT(1)    NOT NULL DEFAULT 0, -- optional to pass
//     nett_balance_report    ENUM('Debit','Credit','Both') NOT NULL DEFAULT 'Both',
//     sequence_order         SMALLINT      NOT NULL DEFAULT 0, -- optional but seed it
//     is_active              TINYINT(1)    NOT NULL DEFAULT 1,
//     PRIMARY KEY (id),
//     UNIQUE KEY uk_master_group_name (group_name),
//     CONSTRAINT fk_agm_parent FOREIGN KEY (parent_id)
//         REFERENCES acc_group_master(id) ON DELETE RESTRICT
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

// CREATE TABLE acc_ledger_groups (
//     id                       INT             NOT NULL AUTO_INCREMENT,
//     finance_id               INT             NOT NULL,
//     group_name               VARCHAR(150)    COLLATE utf8mb4_unicode_ci NOT NULL,
//     alias                    VARCHAR(150)    COLLATE utf8mb4_unicode_ci DEFAULT NULL
//                                              COMMENT 'Alternative name',
//     alias_lang               JSON            DEFAULT NULL
//                                              COMMENT 'Language wise aliases e.g. {"ta":"முதலீடுகள்","hi":"निवेश"}',

//     system_parent_id         INT             DEFAULT NULL
//                                              COMMENT 'FK → acc_group_master.id (parent is a system group)',
//     custom_parent_id         INT             DEFAULT NULL
//                                              COMMENT 'FK → acc_ledger_groups.id (parent is another custom group)',
//     root_master_id           INT             DEFAULT NULL
//                                              COMMENT 'Top-level acc_group_master ancestor for fast reporting',

//     nature                   ENUM('Assets','Liabilities','Income','Expenses')
//                                              COLLATE utf8mb4_unicode_ci NOT NULL,
//     affects_gross_profit     TINYINT(1)      NOT NULL DEFAULT 0
//                                              COMMENT '1=Yes - For Income/Expense groups',
//     behaves_like_subledger   TINYINT(1)      NOT NULL DEFAULT 0
//                                              COMMENT '1=Yes - Hide ledgers in reports',
//     nett_balance_report      ENUM('Debit','Credit','Both')
//                                              COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Both',
//     used_for_calculation     TINYINT(1)      NOT NULL DEFAULT 0
//                                              COMMENT 'For tax/discount calculation',
//     allocation_method        ENUM('By Quantity','By Value','Not Applicable')
//                                              COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Not Applicable',

//     is_active                TINYINT(1)      NOT NULL DEFAULT 1,
//     created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
//                                              ON UPDATE CURRENT_TIMESTAMP,

//     PRIMARY KEY (id),

//     UNIQUE KEY uk_group_name_finance        (finance_id, group_name),

//     KEY idx_finance_id                      (finance_id),
//     KEY idx_nature                          (nature),
//     KEY idx_is_active                       (is_active),
//     KEY idx_finance_nature                  (finance_id, nature),
//     KEY idx_system_parent_id               (system_parent_id),
//     KEY idx_custom_parent_id               (custom_parent_id),
//     KEY idx_root_master_id                 (root_master_id),

//     -- ─── CHECK Constraint (MySQL 8.0.16+) ───────────────────────
//     -- Enforces exactly one parent is set, never both, never neither

//     -- CONSTRAINT chk_parent_exclusivity CHECK (
//     --     (system_parent_id IS NOT NULL AND custom_parent_id IS NULL)
//     --     OR
//     --     (system_parent_id IS NULL AND custom_parent_id IS NOT NULL)
//     -- ),

//     CONSTRAINT fk_alg_finance       FOREIGN KEY (finance_id)
//         REFERENCES finance_detail (id)      ON DELETE CASCADE,

//     CONSTRAINT fk_alg_sys_parent    FOREIGN KEY (system_parent_id)
//         REFERENCES acc_group_master (id)    ON DELETE RESTRICT,

//     CONSTRAINT fk_alg_custom_parent FOREIGN KEY (custom_parent_id)
//         REFERENCES acc_ledger_groups (id)   ON DELETE RESTRICT,

//     CONSTRAINT fk_alg_root_master   FOREIGN KEY (root_master_id)
//         REFERENCES acc_group_master (id)    ON DELETE RESTRICT

// ) ENGINE=InnoDB
//   DEFAULT CHARSET=utf8mb4
//   COLLATE=utf8mb4_unicode_ci
//   COMMENT='Chart of Accounts - Company custom group hierarchy (mirrors Tally Groups)';

// ─── Helper: resolve nature and root_master_id from parent ───────────────────
const resolveParentMeta = async (conn, system_parent_id, custom_parent_id) => {
    if (system_parent_id) {
        const [[row]] = await conn.query(
            `SELECT nature, 
                    COALESCE((
                        SELECT id FROM acc_group_master 
                        WHERE parent_id IS NULL 
                        AND id = (
                            WITH RECURSIVE cte AS (
                                SELECT id, parent_id FROM acc_group_master WHERE id = ?
                                UNION ALL
                                SELECT g.id, g.parent_id FROM acc_group_master g
                                INNER JOIN cte ON g.id = cte.parent_id
                            )
                            SELECT id FROM cte WHERE parent_id IS NULL LIMIT 1
                        )
                    ), ?) AS root_master_id
             FROM acc_group_master WHERE id = ?`,
            [system_parent_id, system_parent_id, system_parent_id]
        );
        if (!row) throw new Error(`System group id=${system_parent_id} not found`);
        return { nature: row.nature, root_master_id: row.root_master_id };
    }

    if (custom_parent_id) {
        const [[row]] = await conn.query(
            `SELECT nature, root_master_id FROM acc_ledger_groups WHERE id = ?`,
            [custom_parent_id]
        );
        if (!row) throw new Error(`Custom group id=${custom_parent_id} not found`);
        return { nature: row.nature, root_master_id: row.root_master_id };
    }

    throw new Error('Either system_parent_id or custom_parent_id is required');
};

// ─── GET: All groups for a company (system + custom unified) ─────────────────
exports.getGroups = async (finance_id) => {
    if (!finance_id) throw new Error('finance_id is required');

    // System groups (global master)
    const [systemGroups] = await db.query(
        `SELECT
            id,
            NULL          AS finance_id,
            group_name,
            NULL          AS alias_lang,
            parent_id     AS system_parent_id,
            NULL          AS custom_parent_id,
            nature,
            affects_gross_profit,
            behaves_like_subledger,
            nett_balance_report,
            'system'      AS source,
            sequence_order,
            is_active
         FROM acc_group_master
         WHERE is_active = 1
         ORDER BY sequence_order ASC, group_name ASC`
    );

    // Custom groups for this company
    const [customGroups] = await db.query(
        `SELECT
            id,
            finance_id,
            group_name,
            alias,
            alias_lang,
            system_parent_id,
            custom_parent_id,
            nature,
            affects_gross_profit,
            behaves_like_subledger,
            nett_balance_report,
            used_for_calculation,
            allocation_method,
            root_master_id,
            'custom'      AS source,
            is_active,
            created_at,
            updated_at
         FROM acc_ledger_groups
         WHERE finance_id = ? AND is_active = 1
         ORDER BY group_name ASC`,
        [finance_id]
    );

    return { systemGroups, customGroups };
};


// ─── GET: Unified "Under" dropdown list ──────────────────────────────────────
exports.getUnderDropdown = async (finance_id) => {
    if (!finance_id) throw new Error('finance_id is required');

    const [systemGroups] = await db.query(
        `SELECT 
            id,
            group_name,
            parent_id     AS system_parent_id,
            NULL          AS custom_parent_id,
            nature,
            sequence_order,
            'system'      AS source
         FROM acc_group_master
         WHERE is_active = 1
         ORDER BY sequence_order ASC, group_name ASC`
    );

    const [customGroups] = await db.query(
        `SELECT
            id,
            group_name,
            system_parent_id,
            custom_parent_id,
            nature,
            0             AS sequence_order,
            'custom'      AS source
         FROM acc_ledger_groups
         WHERE finance_id = ? AND is_active = 1
         ORDER BY group_name ASC`,
        [finance_id]
    );

    // Merge: system groups first, then custom groups
    return [...systemGroups, ...customGroups];
};

// ─── CREATE: Single custom group ─────────────────────────────────────────────
exports.createGroup = async (data) => {
    const {
        finance_id,
        group_name,
        alias = null,
        alias_lang = null,
        system_parent_id = null,
        custom_parent_id = null,
        affects_gross_profit = 0,
        behaves_like_subledger = 0,
        nett_balance_report = 'Both',
        used_for_calculation = 0,
        allocation_method = 'Not Applicable',
    } = data;

    // ── Validate required fields
    if (!finance_id) throw new Error('finance_id is required');
    if (!group_name?.trim()) throw new Error('group_name is required');
    if (!system_parent_id && !custom_parent_id)
        throw new Error('Either system_parent_id or custom_parent_id is required');
    if (system_parent_id && custom_parent_id)
        throw new Error('Provide only one of system_parent_id or custom_parent_id, not both');

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // ── Duplicate check
        const [[dup]] = await conn.query(
            `SELECT id FROM acc_ledger_groups
             WHERE finance_id = ? AND LOWER(group_name) = LOWER(?) LIMIT 1`,
            [finance_id, group_name.trim()]
        );
        if (dup) throw new Error(`Group "${group_name}" already exists for this company`);

        // ── Resolve nature + root_master_id from parent
        const { nature, root_master_id } = await resolveParentMeta(
            conn, system_parent_id, custom_parent_id
        );

        // ── Insert
        const [result] = await conn.query(
            `INSERT INTO acc_ledger_groups (
                finance_id,
                group_name,
                alias,
                alias_lang,
                system_parent_id,
                custom_parent_id,
                nature,
                root_master_id,
                affects_gross_profit,
                behaves_like_subledger,
                nett_balance_report,
                used_for_calculation,
                allocation_method,
                is_active
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
            [
                finance_id,
                group_name.trim(),
                alias || null,
                alias_lang ? JSON.stringify(alias_lang) : null,
                system_parent_id || null,
                custom_parent_id || null,
                nature,
                root_master_id,
                affects_gross_profit ? 1 : 0,
                behaves_like_subledger ? 1 : 0,
                nett_balance_report,
                used_for_calculation ? 1 : 0,
                allocation_method,
            ]
        );

        await conn.commit();
        return result.insertId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// ─── CREATE: Bulk create multiple custom groups ───────────────────────────────
exports.multiCreateGroup = async (finance_id, groups) => {
    if (!finance_id) throw new Error('finance_id is required');
    if (!Array.isArray(groups) || !groups.length) throw new Error('groups[] must be a non-empty array');

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const results = [];

        for (const [index, G] of groups.entries()) {
            const label = `Row ${index + 1}`;

            if (!G.group_name?.trim()) {
                throw new Error(`${label}: group_name is required`);
            }
            if (!G.system_parent_id && !G.custom_parent_id) {
                throw new Error(`${label} ("${G.group_name}"): Either system_parent_id or custom_parent_id is required`);
            }
            if (G.system_parent_id && G.custom_parent_id) {
                throw new Error(`${label} ("${G.group_name}"): Provide only one parent, not both`);
            }

            // ── Duplicate check per row
            const [[dup]] = await conn.query(
                `SELECT id FROM acc_ledger_groups
                 WHERE finance_id = ? AND LOWER(group_name) = LOWER(?) LIMIT 1`,
                [finance_id, G.group_name.trim()]
            );
            if (dup) throw new Error(`${label}: Group "${G.group_name}" already exists for this company`);

            // ── Resolve nature + root_master_id
            const { nature, root_master_id } = await resolveParentMeta(
                conn, G.system_parent_id || null, G.custom_parent_id || null
            );

            // ── Insert
            const [result] = await conn.query(
                `INSERT INTO acc_ledger_groups (
                    finance_id,
                    group_name,
                    alias,
                    alias_lang,
                    system_parent_id,
                    custom_parent_id,
                    nature,
                    root_master_id,
                    affects_gross_profit,
                    behaves_like_subledger,
                    nett_balance_report,
                    used_for_calculation,
                    allocation_method,
                    is_active
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
                [
                    finance_id,
                    G.group_name.trim(),
                    G.alias || null,
                    G.alias_lang ? JSON.stringify(G.alias_lang) : null,
                    G.system_parent_id || null,
                    G.custom_parent_id || null,
                    nature,
                    root_master_id,
                    G.affects_gross_profit ? 1 : 0,
                    G.behaves_like_subledger ? 1 : 0,
                    G.nett_balance_report || 'Both',
                    G.used_for_calculation ? 1 : 0,
                    G.allocation_method || 'Not Applicable',
                ]
            );

            results.push({
                index,
                group_name: G.group_name.trim(),
                id: result.insertId,
                nature,
                root_master_id
            });
        }

        await conn.commit();
        return results;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// ─── UPDATE: Bulk update multiple custom groups ───────────────────────────────
exports.multiUpdateGroup = async (finance_id, groups) => {
    if (!finance_id) throw new Error('finance_id is required');
    if (!Array.isArray(groups) || !groups.length) throw new Error('groups[] must be a non-empty array');

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        for (const [index, G] of groups.entries()) {
            const label = `Row ${index + 1}`;

            if (!G.id) {
                throw new Error(`${label}: group id is required for update`);
            }
            if (!G.group_name?.trim()) {
                throw new Error(`${label}: group_name is required`);
            }
            if (!G.system_parent_id && !G.custom_parent_id) {
                throw new Error(`${label} ("${G.group_name}"): Either system_parent_id or custom_parent_id is required`);
            }
            if (G.system_parent_id && G.custom_parent_id) {
                throw new Error(`${label} ("${G.group_name}"): Provide only one parent, not both`);
            }

            // Check if group exists and belongs to finance_id
            const [[existing]] = await conn.query(
                `SELECT id FROM acc_ledger_groups WHERE id = ? AND finance_id = ?`,
                [G.id, finance_id]
            );
            if (!existing) throw new Error(`${label}: Group with id ${G.id} not found`);

            // Duplicate check (excluding itself)
            const [[dup]] = await conn.query(
                `SELECT id FROM acc_ledger_groups
                 WHERE finance_id = ? AND LOWER(group_name) = LOWER(?) AND id != ? LIMIT 1`,
                [finance_id, G.group_name.trim(), G.id]
            );
            if (dup) throw new Error(`${label}: Group "${G.group_name}" already exists for this company`);

            // Resolve parent meta
            const { nature, root_master_id } = await resolveParentMeta(
                conn, G.system_parent_id || null, G.custom_parent_id || null
            );

            // Update
            await conn.query(
                `UPDATE acc_ledger_groups SET
                    group_name = ?,
                    alias = ?,
                    system_parent_id = ?,
                    custom_parent_id = ?,
                    nature = ?,
                    root_master_id = ?
                 WHERE id = ? AND finance_id = ?`,
                [
                    G.group_name.trim(),
                    G.alias || null,
                    G.system_parent_id || null,
                    G.custom_parent_id || null,
                    nature,
                    root_master_id,
                    G.id,
                    finance_id
                ]
            );
        }

        await conn.commit();
        return true;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};