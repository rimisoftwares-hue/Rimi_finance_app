/**
 * areaAllocation.service.js
 * 
 * PostgreSQL service for Agent Area Allocation.
 * Implements tenant-isolated area allocations, metrics computation, and transactional updates.
 */

const { db } = require('../../config/database.config');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * 1. Get all agents with their allocated areas and customer/unpaid metrics.
 */
async function getAllocatedAgents(financeId) {
  if (!isValidUuid(financeId)) {
    throw new Error('Invalid finance id');
  }

  // CTE to gather current customer addresses and their unpaid status
  const sql = `
    WITH cust_areas AS (
      SELECT 
        c.id AS customer_id,
        LOWER(TRIM(COALESCE(NULLIF(TRIM(a.city), ''), 'Unknown'))) AS city,
        LOWER(TRIM(COALESCE(NULLIF(TRIM(a.street_name), ''), NULLIF(TRIM(a.street), ''), 'N/A'))) AS street,
        CASE 
          WHEN GREATEST(0, (CASE WHEN l.net_payable > 0 THEN l.net_payable ELSE l.due_month * l.due_amount END) - COALESCE(p.total_paid, 0)) > 0 
          THEN 1 ELSE 0 
        END AS is_unpaid
      FROM customers c
      JOIN LATERAL (
        SELECT l_sub.net_payable, l_sub.due_month, l_sub.due_amount 
        FROM loans l_sub 
        WHERE l_sub.customer_id = c.id 
          AND l_sub.finance_id = $1::uuid
        ORDER BY l_sub.hp_date DESC, l_sub.id DESC 
        LIMIT 1
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT SUM(p_sub.amount) AS total_paid
        FROM payments p_sub 
        WHERE p_sub.customer_id = c.id 
          AND p_sub.finance_id = $1::uuid
          AND p_sub.payment_status IS DISTINCT FROM 'cancelled'
      ) p ON true
      LEFT JOIN LATERAL (
        SELECT a_sub.city, a_sub.street, a_sub.street_name 
        FROM address_history ah 
        JOIN addresses a_sub ON a_sub.id = ah.address_id 
        WHERE ah.entity_id = c.id::text 
          AND ah.entity_type = 'customer' 
        ORDER BY ah.is_current DESC, ah.changed_at DESC, ah.id DESC 
        LIMIT 1
      ) a ON true
      WHERE c.finance_id = $1::uuid
        AND (c.loan_status IS NULL OR c.loan_status <> 'close')
    )
    SELECT 
      u.id AS id,
      COALESCE(ud.staff_name, u.username) AS name,
      COALESCE(u.phone_no, '') AS phone,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', aaa.id,
          'city', aaa.city,
          'village', aaa.village,
          'street', aaa.street_name,
          'district', COALESCE(aaa.district, ''),
          'is_primary', aaa.is_primary
        ) ORDER BY aaa.street_name
      ) AS areas,
      COALESCE(COUNT(DISTINCT ca.customer_id), 0)::int AS total_customers,
      COALESCE(COUNT(DISTINCT ca.customer_id) FILTER (WHERE ca.is_unpaid = 1), 0)::int AS unpaid_customers
    FROM agent_area_allocations aaa
    JOIN users u ON u.id = aaa.user_id
    LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
    LEFT JOIN cust_areas ca ON 
      ca.city = LOWER(TRIM(aaa.city)) AND 
      ca.street = LOWER(TRIM(aaa.street_name))
    WHERE aaa.finance_id = $1::uuid
    GROUP BY u.id, u.username, ud.staff_name, u.phone_no
    ORDER BY name ASC
  `;

  const { rows } = await db.query(sql, [financeId]);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    areas: r.areas || [],
    totalCustomers: parseInt(r.total_customers, 10) || 0,
    activeAssignments: parseInt(r.unpaid_customers, 10) || 0, // matches frontend AreaAgent.activeAssignments
    unpaidCustomers: parseInt(r.unpaid_customers, 10) || 0,
  }));
}

/**
 * 2. Get active agents in the finance context (for allocation selector).
 */
async function getActiveAgents(financeId) {
  if (!isValidUuid(financeId)) {
    throw new Error('Invalid finance id');
  }

  const sql = `
    SELECT 
      u.id,
      COALESCE(ud.staff_name, u.username) AS name,
      COALESCE(u.phone_no, '') AS phone,
      u.email,
      COALESCE(ud.staff_code, '') AS staff_code
    FROM users u
    JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
    LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
    WHERE uac.role = 'agent'
      AND uac.is_active = 1
      AND u.is_active = 1
    ORDER BY name ASC
  `;

  const { rows } = await db.query(sql, [financeId]);
  return rows;
}

/**
 * 3. Get distinct customer areas + overlap information.
 */
async function getAvailableAreas(financeId) {
  if (!isValidUuid(financeId)) {
    throw new Error('Invalid finance id');
  }

  const sql = `
    WITH cust_areas AS (
      SELECT 
        c.id AS customer_id,
        COALESCE(NULLIF(TRIM(a.city), ''), 'Unknown') AS city,
        COALESCE(NULLIF(TRIM(a.district), ''), '') AS district,
        COALESCE(NULLIF(TRIM(a.village), ''), 'N/A') AS village,
        COALESCE(NULLIF(TRIM(a.street_name), ''), NULLIF(TRIM(a.street), ''), 'N/A') AS street,
        CASE 
          WHEN GREATEST(0, (CASE WHEN l.net_payable > 0 THEN l.net_payable ELSE l.due_month * l.due_amount END) - COALESCE(p.total_paid, 0)) > 0 
          THEN 1 ELSE 0 
        END AS is_unpaid
      FROM customers c
      JOIN LATERAL (
        SELECT l_sub.net_payable, l_sub.due_month, l_sub.due_amount 
        FROM loans l_sub 
        WHERE l_sub.customer_id = c.id 
          AND l_sub.finance_id = $1::uuid
        ORDER BY l_sub.hp_date DESC, l_sub.id DESC 
        LIMIT 1
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT SUM(p_sub.amount) AS total_paid
        FROM payments p_sub 
        WHERE p_sub.customer_id = c.id 
          AND p_sub.finance_id = $1::uuid
          AND p_sub.payment_status IS DISTINCT FROM 'cancelled'
      ) p ON true
      LEFT JOIN LATERAL (
        SELECT a_sub.city, a_sub.district, a_sub.village, a_sub.street, a_sub.street_name 
        FROM address_history ah 
        JOIN addresses a_sub ON a_sub.id = ah.address_id 
        WHERE ah.entity_id = c.id::text 
          AND ah.entity_type = 'customer' 
        ORDER BY ah.is_current DESC, ah.changed_at DESC, ah.id DESC 
        LIMIT 1
      ) a ON true
      WHERE c.finance_id = $1::uuid
        AND (c.loan_status IS NULL OR c.loan_status <> 'close')
    ),
    all_areas AS (
      SELECT city, district, village, street, customer_count, unpaid_count
      FROM (
        SELECT 
          city, district, village, street,
          COUNT(DISTINCT customer_id) AS customer_count,
          COUNT(DISTINCT customer_id) FILTER (WHERE is_unpaid = 1) AS unpaid_count
        FROM cust_areas
        GROUP BY city, district, village, street
      ) ca
      UNION
      SELECT 
        aaa.city,
        COALESCE(aaa.district, '') AS district,
        aaa.village,
        aaa.street_name AS street,
        0 AS customer_count,
        0 AS unpaid_count
      FROM agent_area_allocations aaa
      WHERE aaa.finance_id = $1::uuid
    ),
    grouped_areas AS (
      SELECT 
        city,
        MAX(district) AS district,
        MAX(village) AS village,
        street,
        SUM(customer_count)::int AS customer_count,
        SUM(unpaid_count)::int AS unpaid_count
      FROM all_areas
      GROUP BY city, street
    )
    SELECT 
      ga.city,
      ga.district,
      ga.village,
      ga.street,
      ga.customer_count AS "customerCount",
      ga.unpaid_count AS "unpaidCount",
      COALESCE(
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u.id, 
              'name', COALESCE(ud.staff_name, u.username)
            )
          )
          FROM agent_area_allocations aaa
          JOIN users u ON u.id = aaa.user_id
          LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
          WHERE aaa.finance_id = $1::uuid
            AND LOWER(TRIM(aaa.city)) = LOWER(TRIM(ga.city))
            AND LOWER(TRIM(aaa.street_name)) = LOWER(TRIM(ga.street))
        ),
        '[]'::json
      ) AS "allocatedAgents"
    FROM grouped_areas ga
    ORDER BY ga.city, ga.street
  `;

  const { rows } = await db.query(sql, [financeId]);
  return rows;
}

/**
 * 4. Save or replace area allocations for an agent in a single transaction.
 */
async function saveAgentAllocations(financeId, agentId, areas = [], currentUserId = null) {
  if (!isValidUuid(financeId)) {
    const err = new Error('Invalid finance id');
    err.statusCode = 400;
    throw err;
  }

  if (!isValidUuid(agentId)) {
    const err = new Error('Invalid agent id');
    err.statusCode = 400;
    throw err;
  }

  if (!Array.isArray(areas)) {
    const err = new Error('Areas must be an array');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify agent exists in finance
  const agentCheck = await db.query(
    `SELECT u.id 
     FROM users u
     JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
     WHERE u.id = $2::uuid AND uac.is_active = 1
     LIMIT 1`,
    [financeId, agentId]
  );

  if (agentCheck.rows.length === 0) {
    const err = new Error('Agent not found or inactive in this finance company');
    err.statusCode = 404;
    throw err;
  }

  // 2. Validate and deduplicate incoming areas by (city, street)
  const seenKeys = new Set();
  const sanitizedAreas = [];

  for (const item of areas) {
    const street = (item.street || item.street_name || '').trim();
    const city = (item.city || 'Unknown').trim();
    const village = (item.village || 'N/A').trim();
    const district = (item.district || '').trim();
    const isPrimary = Boolean(item.is_primary);

    if (!street) {
      const err = new Error('Street name is required for all allocated areas');
      err.statusCode = 400;
      throw err;
    }

    const key = `${city.toLowerCase()}|||${street.toLowerCase()}`;
    if (seenKeys.has(key)) {
      const err = new Error(`Duplicate area detected for this agent: "${street}" in "${city}"`);
      err.statusCode = 400;
      throw err;
    }
    seenKeys.add(key);

    sanitizedAreas.push({
      city,
      district,
      village,
      street,
      isPrimary,
    });
  }

  // 3. Resolve allocated_by user id against users table (foreign key constraint)
  let allocatedBy = null;
  if (currentUserId && isValidUuid(currentUserId)) {
    const userCheck = await db.query(`SELECT id FROM users WHERE id = $1::uuid LIMIT 1`, [currentUserId]);
    if (userCheck.rows.length > 0) {
      allocatedBy = currentUserId;
    }
  }

  // 4. Execute atomic replacement in a transaction
  const client = await db.getConnection();
  try {
    await client.query('BEGIN');

    // Remove existing allocations for this agent
    await client.query(
      `DELETE FROM agent_area_allocations 
       WHERE finance_id = $1::uuid AND user_id = $2::uuid`,
      [financeId, agentId]
    );

    // Insert new allocations
    for (const area of sanitizedAreas) {
      await client.query(
        `INSERT INTO agent_area_allocations (
          finance_id,
          user_id,
          city,
          district,
          village,
          street_name,
          is_primary,
          allocated_by,
          allocated_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          NULLIF($4, ''),
          $5,
          $6,
          $7,
          $8::uuid,
          CURRENT_TIMESTAMP
        )`,
        [
          financeId,
          agentId,
          area.city,
          area.district,
          area.village,
          area.street,
          area.isPrimary,
          allocatedBy,
        ]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      agentId,
      allocatedCount: sanitizedAreas.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const error = new Error('Area allocation conflict: this area is already assigned');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 5. Delete all area allocations for an agent.
 */
async function deleteAgentAllocations(financeId, agentId) {
  if (!isValidUuid(financeId)) {
    const err = new Error('Invalid finance id');
    err.statusCode = 400;
    throw err;
  }

  if (!isValidUuid(agentId)) {
    const err = new Error('Invalid agent id');
    err.statusCode = 400;
    throw err;
  }

  const result = await db.query(
    `DELETE FROM agent_area_allocations 
     WHERE finance_id = $1::uuid AND user_id = $2::uuid`,
    [financeId, agentId]
  );

  return {
    success: true,
    deletedCount: result.rowCount || 0,
  };
}

module.exports = {
  isValidUuid,
  getAllocatedAgents,
  getActiveAgents,
  getAvailableAreas,
  saveAgentAllocations,
  deleteAgentAllocations,
};

