/**
 * assignmentHistory.service.js
 * 
 * PostgreSQL service for Agent Assignment History.
 * Implements batch aggregation, windowed collection attribution, seizure tracking,
 * and deterministic effective status computation.
 */

const { db } = require('../../config/database.config');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * Get local date string YYYY-MM-DD
 */
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 1. Fetch assignment history batches with KPIs for given date range and optional agent filter
 */
async function getAssignmentHistory(financeId, { dateFrom, dateTo, agentId = null }) {
  if (!isValidUuid(financeId)) {
    const err = new Error('Invalid finance id');
    err.statusCode = 400;
    throw err;
  }

  // Validate dates
  if (dateFrom && !isValidDate(dateFrom)) {
    const err = new Error('Invalid dateFrom format (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }

  if (dateTo && !isValidDate(dateTo)) {
    const err = new Error('Invalid dateTo format (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    const err = new Error('dateFrom cannot be after dateTo');
    err.statusCode = 400;
    throw err;
  }

  if (agentId && !isValidUuid(agentId)) {
    const err = new Error('Invalid agentId format');
    err.statusCode = 400;
    throw err;
  }

  const queryParams = [financeId];
  let whereClause = 'caa.finance_id = $1::uuid';

  if (dateFrom) {
    queryParams.push(dateFrom);
    whereClause += ` AND caa.assigned_at::date >= $${queryParams.length}::date`;
  }

  if (dateTo) {
    queryParams.push(dateTo);
    whereClause += ` AND caa.assigned_at::date <= $${queryParams.length}::date`;
  }

  if (agentId) {
    queryParams.push(agentId);
    whereClause += ` AND caa.agent_id = $${queryParams.length}::uuid`;
  }

  const sql = `
    WITH assign_base AS (
      SELECT 
        caa.id AS assignment_id,
        caa.agent_id,
        caa.customer_id,
        caa.assigned_at::date AS assigned_date,
        caa.target_date,
        caa.assigned_by,
        caa.status AS raw_status,
        caa.priority,
        caa.due_amount,
        EXISTS (
          SELECT 1 FROM seizing_vehicle sv
          WHERE sv.customer_id = caa.customer_id
            AND sv.finance_id = caa.finance_id
            AND sv.status IS DISTINCT FROM 'Cancelled'
            AND sv.seizing_date >= caa.assigned_at::date
        ) AS is_seized,
        COALESCE((
          SELECT SUM(p.amount)
          FROM payments p
          WHERE p.customer_id = caa.customer_id
            AND p.finance_id = caa.finance_id
            AND p.payment_status IS DISTINCT FROM 'cancelled'
            AND p.payment_date >= caa.assigned_at::date
            AND (
              (SELECT MIN(next_caa.assigned_at::date)
               FROM customer_agent_assignments next_caa
               WHERE next_caa.customer_id = caa.customer_id
                 AND next_caa.finance_id = caa.finance_id
                 AND next_caa.assigned_at::date > caa.assigned_at::date) IS NULL
              OR p.payment_date < (SELECT MIN(next_caa.assigned_at::date)
                                   FROM customer_agent_assignments next_caa
                                   WHERE next_caa.customer_id = caa.customer_id
                                     AND next_caa.finance_id = caa.finance_id
                                     AND next_caa.assigned_at::date > caa.assigned_at::date)
            )
        ), 0) AS collected_amount,
        COALESCE((
          SELECT SUM(p.penalty)
          FROM payments p
          WHERE p.customer_id = caa.customer_id
            AND p.finance_id = caa.finance_id
            AND p.payment_status IS DISTINCT FROM 'cancelled'
            AND p.payment_date >= caa.assigned_at::date
            AND (
              (SELECT MIN(next_caa.assigned_at::date)
               FROM customer_agent_assignments next_caa
               WHERE next_caa.customer_id = caa.customer_id
                 AND next_caa.finance_id = caa.finance_id
                 AND next_caa.assigned_at::date > caa.assigned_at::date) IS NULL
              OR p.payment_date < (SELECT MIN(next_caa.assigned_at::date)
                                   FROM customer_agent_assignments next_caa
                                   WHERE next_caa.customer_id = caa.customer_id
                                     AND next_caa.finance_id = caa.finance_id
                                     AND next_caa.assigned_at::date > caa.assigned_at::date)
            )
        ), 0) AS penalty_collected
      FROM customer_agent_assignments caa
      WHERE ${whereClause}
    ),
    assign_with_status AS (
      SELECT 
        ab.*,
        CASE
          WHEN ab.is_seized THEN 'seized'
          WHEN ab.raw_status = 'failed' THEN 'failed'
          WHEN ab.raw_status = 'reassigned' THEN 'reassigned'
          WHEN ab.raw_status = 'collected' OR (ab.due_amount > 0 AND ab.collected_amount >= ab.due_amount) THEN 'collected'
          WHEN ab.collected_amount > 0 AND ab.collected_amount < ab.due_amount THEN 'partial'
          WHEN ab.raw_status = 'visited' THEN 'visited'
          ELSE 'pending'
        END AS effective_status
      FROM assign_base ab
    )
    SELECT 
      aws.agent_id AS "agentId",
      TO_CHAR(aws.assigned_date, 'YYYY-MM-DD') AS "assignedDate",
      TO_CHAR(aws.target_date, 'YYYY-MM-DD') AS "targetDate",
      aws.assigned_by AS "assignedBy",
      COALESCE(ud_assigned.staff_name, u_assigned.username, o_assigned.username, 'Admin') AS "assignedByName",
      COALESCE(ud.staff_name, u.username) AS "agentName",
      COALESCE(u.phone_no, '') AS "agentPhone",
      COALESCE(
        (
          SELECT JSON_AGG(DISTINCT aaa.street_name ORDER BY aaa.street_name)
          FROM agent_area_allocations aaa
          WHERE aaa.user_id = u.id AND aaa.finance_id = $1::uuid
        ),
        '[]'::json
      ) AS "allocatedAreas",
      COUNT(*)::int AS "customerCount",
      COUNT(*) FILTER (WHERE aws.is_seized)::int AS "seizedCount",
      ROUND(SUM(aws.due_amount), 2)::float AS "targetDueAmount",
      ROUND(SUM(aws.collected_amount), 2)::float AS "collectedDueAmount",
      ROUND(SUM(aws.penalty_collected), 2)::float AS "penaltyCollected",
      CASE
        WHEN COUNT(DISTINCT aws.effective_status) = 1 THEN MIN(aws.effective_status)
        ELSE 'partial'
      END AS "batchStatus"
    FROM assign_with_status aws
    JOIN users u ON u.id = aws.agent_id
    LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
    LEFT JOIN users u_assigned ON u_assigned.id = aws.assigned_by
    LEFT JOIN users_details ud_assigned ON ud_assigned.user_id = u_assigned.id AND ud_assigned.finance_id = $1::uuid
    LEFT JOIN owner o_assigned ON o_assigned.id = aws.assigned_by
    GROUP BY 
      aws.agent_id, 
      aws.assigned_date, 
      aws.target_date, 
      aws.assigned_by,
      u.id, 
      u.username, 
      ud.staff_name, 
      u.phone_no,
      u_assigned.username,
      ud_assigned.staff_name,
      o_assigned.username
    ORDER BY aws.assigned_date DESC, "agentName" ASC
  `;

  // SQL for KPI totals
  const kpiSql = `
    WITH assign_base AS (
      SELECT 
        caa.id AS assignment_id,
        caa.status AS raw_status,
        caa.due_amount,
        EXISTS (
          SELECT 1 FROM seizing_vehicle sv
          WHERE sv.customer_id = caa.customer_id
            AND sv.finance_id = caa.finance_id
            AND sv.status IS DISTINCT FROM 'Cancelled'
            AND sv.seizing_date >= caa.assigned_at::date
        ) AS is_seized,
        COALESCE((
          SELECT SUM(p.amount)
          FROM payments p
          WHERE p.customer_id = caa.customer_id
            AND p.finance_id = caa.finance_id
            AND p.payment_status IS DISTINCT FROM 'cancelled'
            AND p.payment_date >= caa.assigned_at::date
            AND (
              (SELECT MIN(next_caa.assigned_at::date)
               FROM customer_agent_assignments next_caa
               WHERE next_caa.customer_id = caa.customer_id
                 AND next_caa.finance_id = caa.finance_id
                 AND next_caa.assigned_at::date > caa.assigned_at::date) IS NULL
              OR p.payment_date < (SELECT MIN(next_caa.assigned_at::date)
                                   FROM customer_agent_assignments next_caa
                                   WHERE next_caa.customer_id = caa.customer_id
                                     AND next_caa.finance_id = caa.finance_id
                                     AND next_caa.assigned_at::date > caa.assigned_at::date)
            )
        ), 0) AS collected_amount
      FROM customer_agent_assignments caa
      WHERE ${whereClause}
    ),
    assign_with_status AS (
      SELECT 
        CASE
          WHEN is_seized THEN 'seized'
          WHEN raw_status = 'failed' THEN 'failed'
          WHEN raw_status = 'reassigned' THEN 'reassigned'
          WHEN raw_status = 'collected' OR (due_amount > 0 AND collected_amount >= due_amount) THEN 'collected'
          WHEN collected_amount > 0 AND collected_amount < due_amount THEN 'partial'
          WHEN raw_status = 'visited' THEN 'visited'
          ELSE 'pending'
        END AS effective_status
      FROM assign_base
    )
    SELECT 
      COUNT(*)::int AS "totalAssignments",
      COUNT(*) FILTER (WHERE effective_status = 'pending')::int AS "pendingCount",
      COUNT(*) FILTER (WHERE effective_status = 'collected')::int AS "collectedCount",
      COUNT(*) FILTER (WHERE effective_status = 'seized')::int AS "seizedCount"
    FROM assign_with_status
  `;

  const [batchesRes, kpiRes] = await Promise.all([
    db.query(sql, queryParams),
    db.query(kpiSql, queryParams),
  ]);

  const kpis = kpiRes.rows[0] || {
    totalAssignments: 0,
    pendingCount: 0,
    collectedCount: 0,
    seizedCount: 0,
  };

  return {
    kpis: {
      totalAssignments: parseInt(kpis.totalAssignments, 10) || 0,
      pendingCount: parseInt(kpis.pendingCount, 10) || 0,
      collectedCount: parseInt(kpis.collectedCount, 10) || 0,
      seizedCount: parseInt(kpis.seizedCount, 10) || 0,
    },
    batches: batchesRes.rows.map((r) => ({
      ...r,
      allocatedAreas: Array.isArray(r.allocatedAreas) ? r.allocatedAreas : [],
      customerCount: parseInt(r.customerCount, 10) || 0,
      seizedCount: parseInt(r.seizedCount, 10) || 0,
      targetDueAmount: Number(r.targetDueAmount) || 0,
      collectedDueAmount: Number(r.collectedDueAmount) || 0,
      penaltyCollected: Number(r.penaltyCollected) || 0,
    })),
  };
}

/**
 * 2. Fetch detail view for a specific batch: (agentId, assignedDate, targetDate, assignedBy)
 */
async function getAssignmentBatchDetails(financeId, { agentId, date, targetDate = null, assignedBy = null }) {
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

  if (!date || !isValidDate(date)) {
    const err = new Error('Invalid or missing date parameter (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }

  // Normalize targetDate & assignedBy (support null, 'null', undefined)
  const normTargetDate = (targetDate && targetDate !== 'null' && targetDate !== 'undefined') ? targetDate : null;
  const normAssignedBy = (assignedBy && assignedBy !== 'null' && assignedBy !== 'undefined') ? assignedBy : null;

  if (normTargetDate && !isValidDate(normTargetDate)) {
    const err = new Error('Invalid targetDate format (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }

  if (normAssignedBy && !isValidUuid(normAssignedBy)) {
    const err = new Error('Invalid assignedBy UUID format');
    err.statusCode = 400;
    throw err;
  }

  // 1. Fetch agent details & allocated areas
  const agentRes = await db.query(
    `SELECT 
       u.id,
       COALESCE(ud.staff_name, u.username) AS name,
       COALESCE(u.phone_no, '') AS phone,
       COALESCE(
         (
           SELECT JSON_AGG(DISTINCT aaa.street_name ORDER BY aaa.street_name)
           FROM agent_area_allocations aaa
           WHERE aaa.user_id = u.id AND aaa.finance_id = $1::uuid
         ),
         '[]'::json
       ) AS "allocatedAreas"
     FROM users u
     LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
     WHERE u.id = $2::uuid
     LIMIT 1`,
    [financeId, agentId]
  );

  if (agentRes.rows.length === 0) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }

  const agent = {
    ...agentRes.rows[0],
    allocatedAreas: Array.isArray(agentRes.rows[0].allocatedAreas) ? agentRes.rows[0].allocatedAreas : [],
  };

  // 2. Fetch assignedBy name
  let assignedByName = 'Admin';
  if (normAssignedBy) {
    const assignedByRes = await db.query(
      `SELECT COALESCE(ud.staff_name, u.username, o.username, 'Admin') AS name
       FROM (SELECT $1::uuid AS id) req_id
       LEFT JOIN users u ON u.id = req_id.id
       LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $2::uuid
       LEFT JOIN owner o ON o.id = req_id.id
       LIMIT 1`,
      [normAssignedBy, financeId]
    );
    if (assignedByRes.rows.length > 0 && assignedByRes.rows[0].name) {
      assignedByName = assignedByRes.rows[0].name;
    }
  }

  // 3. Query assignment customer rows for this batch
  const sql = `
    WITH assign_base AS (
      SELECT 
        caa.id AS assignment_id,
        caa.agent_id,
        caa.customer_id,
        caa.assigned_at::date AS assigned_date,
        caa.target_date,
        caa.assigned_by,
        caa.status AS raw_status,
        caa.priority,
        caa.notes,
        caa.due_amount,
        sv.is_seized,
        sv.seizing_date,
        sv.seized_by,
        sv.seizing_charge,
        COALESCE((
          SELECT SUM(p.amount)
          FROM payments p
          WHERE p.customer_id = caa.customer_id
            AND p.finance_id = caa.finance_id
            AND p.payment_status IS DISTINCT FROM 'cancelled'
            AND p.payment_date >= caa.assigned_at::date
            AND (
              (SELECT MIN(next_caa.assigned_at::date)
               FROM customer_agent_assignments next_caa
               WHERE next_caa.customer_id = caa.customer_id
                 AND next_caa.finance_id = caa.finance_id
                 AND next_caa.assigned_at::date > caa.assigned_at::date) IS NULL
              OR p.payment_date < (SELECT MIN(next_caa.assigned_at::date)
                                   FROM customer_agent_assignments next_caa
                                   WHERE next_caa.customer_id = caa.customer_id
                                     AND next_caa.finance_id = caa.finance_id
                                     AND next_caa.assigned_at::date > caa.assigned_at::date)
            )
        ), 0) AS collected_amount,
        COALESCE((
          SELECT SUM(p.penalty)
          FROM payments p
          WHERE p.customer_id = caa.customer_id
            AND p.finance_id = caa.finance_id
            AND p.payment_status IS DISTINCT FROM 'cancelled'
            AND p.payment_date >= caa.assigned_at::date
            AND (
              (SELECT MIN(next_caa.assigned_at::date)
               FROM customer_agent_assignments next_caa
               WHERE next_caa.customer_id = caa.customer_id
                 AND next_caa.finance_id = caa.finance_id
                 AND next_caa.assigned_at::date > caa.assigned_at::date) IS NULL
              OR p.payment_date < (SELECT MIN(next_caa.assigned_at::date)
                                   FROM customer_agent_assignments next_caa
                                   WHERE next_caa.customer_id = caa.customer_id
                                     AND next_caa.finance_id = caa.finance_id
                                     AND next_caa.assigned_at::date > caa.assigned_at::date)
            )
        ), 0) AS penalty_collected,
        (
          SELECT TO_CHAR(MAX(p.payment_date), 'YYYY-MM-DD')
          FROM payments p
          WHERE p.customer_id = caa.customer_id
            AND p.finance_id = caa.finance_id
            AND p.payment_status IS DISTINCT FROM 'cancelled'
            AND p.payment_date >= caa.assigned_at::date
            AND (
              (SELECT MIN(next_caa.assigned_at::date)
               FROM customer_agent_assignments next_caa
               WHERE next_caa.customer_id = caa.customer_id
                 AND next_caa.finance_id = caa.finance_id
                 AND next_caa.assigned_at::date > caa.assigned_at::date) IS NULL
              OR p.payment_date < (SELECT MIN(next_caa.assigned_at::date)
                                   FROM customer_agent_assignments next_caa
                                   WHERE next_caa.customer_id = caa.customer_id
                                     AND next_caa.finance_id = caa.finance_id
                                     AND next_caa.assigned_at::date > caa.assigned_at::date)
            )
        ) AS last_payment_date
      FROM customer_agent_assignments caa
      LEFT JOIN LATERAL (
        SELECT 
          true AS is_seized,
          TO_CHAR(sv_sub.seizing_date, 'YYYY-MM-DD') AS seizing_date,
          sv_sub.seized_by,
          sv_sub.seizing_charge
        FROM seizing_vehicle sv_sub
        WHERE sv_sub.customer_id = caa.customer_id
          AND sv_sub.finance_id = caa.finance_id
          AND sv_sub.status IS DISTINCT FROM 'Cancelled'
          AND sv_sub.seizing_date >= caa.assigned_at::date
        ORDER BY sv_sub.seizing_date DESC, sv_sub.id DESC
        LIMIT 1
      ) sv ON true
      WHERE caa.finance_id = $1::uuid
        AND caa.agent_id = $2::uuid
        AND caa.assigned_at::date = $3::date
        AND caa.target_date IS NOT DISTINCT FROM $4::date
        AND caa.assigned_by IS NOT DISTINCT FROM $5::uuid
    ),
    assign_with_details AS (
      SELECT 
        ab.*,
        c.cname AS customer_name,
        c.hplno,
        COALESCE(ct.number, '') AS phone,
        CONCAT_WS(', ', NULLIF(TRIM(a.street_name), ''), NULLIF(TRIM(a.village), ''), NULLIF(TRIM(a.city), '')) AS customer_address,
        v.vehicle_number,
        TRIM(CONCAT_WS(' ', vi.brand, COALESCE(vi.model_name, v.vehicle_modal))) AS vehicle_model,
        CASE
          WHEN COALESCE(ab.is_seized, false) THEN 'seized'
          WHEN ab.raw_status = 'failed' THEN 'failed'
          WHEN ab.raw_status = 'reassigned' THEN 'reassigned'
          WHEN ab.raw_status = 'collected' OR (ab.due_amount > 0 AND ab.collected_amount >= ab.due_amount) THEN 'collected'
          WHEN ab.collected_amount > 0 AND ab.collected_amount < ab.due_amount THEN 'partial'
          WHEN ab.raw_status = 'visited' THEN 'visited'
          ELSE 'pending'
        END AS effective_status
      FROM assign_base ab
      JOIN customers c ON c.id = ab.customer_id
      JOIN LATERAL (
        SELECT l_sub.* 
        FROM loans l_sub 
        WHERE l_sub.customer_id = c.id AND l_sub.finance_id = $1::uuid
        ORDER BY l_sub.hp_date DESC, l_sub.id DESC 
        LIMIT 1
      ) l ON true
      LEFT JOIN vehicle_detail v ON v.id = COALESCE(l.vehicle_id, c.vehicle_id)
      LEFT JOIN vehicle_info vi ON vi.id = v.vehicle_info_id
      LEFT JOIN LATERAL (
        SELECT a_sub.* 
        FROM address_history ah 
        JOIN addresses a_sub ON a_sub.id = ah.address_id 
        WHERE ah.entity_id = c.id::text AND ah.entity_type = 'customer' 
        ORDER BY ah.is_current DESC, ah.changed_at DESC, ah.id DESC 
        LIMIT 1
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT ct_sub.number 
        FROM contacts ct_sub 
        WHERE ct_sub.customer_id = c.id 
          AND (ct_sub.finance_id = $1::uuid OR ct_sub.finance_id IS NULL)
        ORDER BY CASE WHEN ct_sub.type::text = 'mobile' THEN 1 ELSE 2 END, ct_sub.id ASC 
        LIMIT 1
      ) ct ON true
      ORDER BY c.cname ASC
    )
    SELECT * FROM assign_with_details
  `;

  const { rows } = await db.query(sql, [
    financeId,
    agentId,
    date,
    normTargetDate,
    normAssignedBy,
  ]);

  if (rows.length === 0) {
    const err = new Error('Batch assignment not found');
    err.statusCode = 404;
    throw err;
  }

  let totalTargetDue = 0;
  let totalCollected = 0;
  let totalPenalty = 0;
  let seizedCount = 0;

  const customers = rows.map((r) => {
    const targetDue = Number(r.due_amount) || 0;
    const collectedAmount = Number(r.collected_amount) || 0;
    const penaltyAmount = Number(r.penalty_collected) || 0;
    const isSeized = Boolean(r.is_seized);

    totalTargetDue += targetDue;
    totalCollected += collectedAmount;
    totalPenalty += penaltyAmount;
    if (isSeized) seizedCount++;

    return {
      assignmentId: r.assignment_id,
      customerId: r.customer_id,
      hplno: r.hplno,
      customerName: r.customer_name || '—',
      phone: r.phone || '—',
      customerAddress: r.customer_address || '—',
      vehicleNumber: r.vehicle_number || '—',
      vehicleModel: r.vehicle_model || '—',
      targetDue,
      collectedAmount,
      penaltyAmount,
      lastPaymentDate: r.last_payment_date || null,
      assignmentStatus: r.raw_status,
      effectiveStatus: r.effective_status,
      priority: r.priority || 'medium',
      notes: r.notes || '',
      isSeized,
      seizingDate: r.seizing_date || null,
      seizedBy: r.seized_by || null,
      seizingCharge: r.seizing_charge ? Number(r.seizing_charge) : null,
    };
  });

  return {
    agent,
    assignmentMeta: {
      assignedDate: date,
      targetDate: normTargetDate,
      assignedByName,
    },
    totals: {
      customerCount: customers.length,
      targetDue: Math.round(totalTargetDue * 100) / 100,
      collectedAmount: Math.round(totalCollected * 100) / 100,
      penaltyAmount: Math.round(totalPenalty * 100) / 100,
      seizedCount,
    },
    customers,
  };
}

module.exports = {
  isValidUuid,
  isValidDate,
  getLocalDateString,
  getAssignmentHistory,
  getAssignmentBatchDetails,
};

