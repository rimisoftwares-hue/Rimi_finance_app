/**
 * agentAssignment.service.js
 * 
 * Business logic and database operations for customer-to-agent assignment,
 * agent workload management, and printable field run-sheets.
 * 
 * Adheres to loan and overdue calculation semantics established in:
 * backend/src/modules/customers/pendingCollectionsHelper.js
 */

const { db } = require('../../config/database.config');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

/**
 * Calculates installment due dates, overdue days, balance, and risk level.
 * Pure logic derived from pendingCollectionsHelper.js (LoanSummary / CustomerDetails formulas).
 *
 * @param {object} row Raw database row with loan, payments and customer fields
 * @param {string} asOfDateStr Evaluation date (YYYY-MM-DD)
 * @returns {object} Derived financials: totalDue, totalPaid, balance, overdueDays, riskLevel
 */
function calculateCustomerFinancials(row, asOfDateStr = new Date().toISOString().split('T')[0]) {
  const totalInstallments = Math.max(0, parseInt(row.total_installments, 10) || 0);
  const installmentAmount = Math.max(0, parseFloat(row.installment_amount) || 0);
  const netPayable = parseFloat(row.net_payable) || 0;

  // Contractual Total Due: net_payable > 0 ? net_payable : (totalInstallments * installmentAmount)
  const totalDue = netPayable > 0 ? netPayable : (totalInstallments * installmentAmount);
  const totalPaid = Math.max(0, parseFloat(row.total_paid) || 0);
  const balance = Math.max(0, totalDue - totalPaid);

  const rawPaidInstallments = parseInt(row.installments_paid, 10) || 0;
  const installmentsPaid = Math.min(totalInstallments, Math.max(0, rawPaidInstallments));

  if (balance <= 0 || row.loan_status === 'close') {
    return { totalDue, totalPaid, balance, overdueDays: 0, riskLevel: 'low' };
  }

  const firstDueDateStr = row.first_due_date || row.hp_date;
  if (!firstDueDateStr || totalInstallments <= 0) {
    return { totalDue, totalPaid, balance, overdueDays: 0, riskLevel: 'low' };
  }

  const str = typeof firstDueDateStr === 'string' ? firstDueDateStr.split('T')[0] : new Date(firstDueDateStr).toISOString().split('T')[0];
  const parts = str.split('-');
  const startYear = parseInt(parts[0], 10);
  const startMonth = parseInt(parts[1], 10);
  const startDay = parseInt(parts[2], 10);

  if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) {
    return { totalDue, totalPaid, balance, overdueDays: 0, riskLevel: 'low' };
  }

  const asOfParts = (typeof asOfDateStr === 'string' ? asOfDateStr.split('T')[0] : new Date(asOfDateStr).toISOString().split('T')[0]).split('-');
  const asOfYear = parseInt(asOfParts[0], 10);
  const asOfMonth = parseInt(asOfParts[1], 10);
  const asOfDay = parseInt(asOfParts[2], 10);
  const asOfVal = asOfYear * 10000 + asOfMonth * 100 + asOfDay;

  let dueSoFar = 0;
  const installmentDates = [];

  for (let i = 0; i < totalInstallments; i++) {
    let year = startYear;
    let month = startMonth + i;
    while (month > 12) {
      year += 1;
      month -= 12;
    }
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(startDay, daysInMonth);
    const dueDateVal = year * 10000 + month * 100 + day;
    const dueDateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    installmentDates.push({ year, month, day, dueDateVal, dueDateStr });

    if (dueDateVal <= asOfVal) {
      dueSoFar++;
    }
  }

  let overdueDays = 0;
  if (installmentsPaid < dueSoFar) {
    const oldestUnpaid = installmentDates[installmentsPaid];
    if (oldestUnpaid) {
      const dueUtc = Date.UTC(oldestUnpaid.year, oldestUnpaid.month - 1, oldestUnpaid.day);
      const asOfUtc = Date.UTC(asOfYear, asOfMonth - 1, asOfDay);
      overdueDays = Math.max(0, Math.floor((asOfUtc - dueUtc) / (1000 * 60 * 60 * 24)));
    }
  }

  let riskLevel = 'low';
  if (overdueDays > 60) {
    riskLevel = 'high';
  } else if (overdueDays > 30) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  return { totalDue, totalPaid, balance, overdueDays, riskLevel };
}

/**
 * 3.1 Fetch Assignable Customers
 */
async function getAssignableCustomers(financeId, filters = {}) {
  const {
    search,
    city,
    street,
    village,
    broker,
    vehicleType,
    hpDateFrom,
    hpDateTo,
    dueDaysMin,
    dueDaysMax,
    dueAmountMin,
    dueAmountMax,
    riskLevel,
    assignment = 'all',
    limit = 100,
    offset = 0,
    asOfDate = new Date().toISOString().split('T')[0],
  } = filters;

  const queryParams = [financeId];
  const whereClauses = ['c.finance_id = $1::uuid'];

  // Search filter across customer name, HPL no, vehicle number, brand/model, contact number
  if (search && String(search).trim()) {
    queryParams.push(`%${String(search).trim()}%`);
    const pIdx = queryParams.length;
    whereClauses.push(`(
      c.cname ILIKE $${pIdx} OR
      c.hplno::text ILIKE $${pIdx} OR
      v.vehicle_number ILIKE $${pIdx} OR
      vi.brand ILIKE $${pIdx} OR
      vi.model_name ILIKE $${pIdx} OR
      v.vehicle_modal ILIKE $${pIdx} OR
      ct.number ILIKE $${pIdx}
    )`);
  }

  // HP Date Range
  if (hpDateFrom && String(hpDateFrom).trim()) {
    queryParams.push(String(hpDateFrom).trim());
    whereClauses.push(`l.hp_date >= $${queryParams.length}::date`);
  }
  if (hpDateTo && String(hpDateTo).trim()) {
    queryParams.push(String(hpDateTo).trim());
    whereClauses.push(`l.hp_date <= $${queryParams.length}::date`);
  }

  // Broker filter
  if (broker && String(broker).trim()) {
    queryParams.push(`%${String(broker).trim()}%`);
    whereClauses.push(`(c.broker_name ILIKE $${queryParams.length} OR l.broker_name ILIKE $${queryParams.length})`);
  }

  // Vehicle Type filter
  if (vehicleType && String(vehicleType).trim() && String(vehicleType).toLowerCase() !== 'all types' && String(vehicleType).toLowerCase() !== 'all') {
    queryParams.push(`%${String(vehicleType).trim()}%`);
    whereClauses.push(`(vi.body_type::text ILIKE $${queryParams.length} OR l.loan_type::text ILIKE $${queryParams.length})`);
  }

  // Address filters
  if (street && String(street).trim()) {
    queryParams.push(`%${String(street).trim()}%`);
    whereClauses.push(`(a.street ILIKE $${queryParams.length} OR a.street_name ILIKE $${queryParams.length})`);
  }
  if (village && String(village).trim()) {
    queryParams.push(`%${String(village).trim()}%`);
    whereClauses.push(`a.village ILIKE $${queryParams.length}`);
  }
  if (city && String(city).trim()) {
    queryParams.push(`%${String(city).trim()}%`);
    whereClauses.push(`a.city ILIKE $${queryParams.length}`);
  }

  const sql = `
    SELECT 
      c.id AS customer_id,
      c.hplno,
      c.cname AS customer_name,
      COALESCE(c.broker_name, l.broker_name, '') AS broker_name,
      c.loan_status,
      l.id AS loan_id,
      l.loan_type AS deal_type,
      l.due_month AS total_installments,
      l.due_amount AS installment_amount,
      l.net_payable,
      l.hp_amount,
      TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
      TO_CHAR(l.due_date, 'YYYY-MM-DD') AS first_due_date,
      v.id AS vehicle_id,
      v.vehicle_number,
      COALESCE(vi.brand, '') AS brand,
      COALESCE(vi.model_name, v.vehicle_modal, '') AS model,
      a.street,
      a.street_name,
      a.village,
      a.city,
      COALESCE(ct.number, '') AS primary_phone,
      COALESCE((
        SELECT SUM(p.amount) 
        FROM payments p 
        WHERE p.customer_id = c.id 
          AND p.finance_id = $1::uuid
          AND p.payment_status IS DISTINCT FROM 'cancelled'
      ), 0) AS total_paid,
      COALESCE((
        SELECT COUNT(*) 
        FROM payments p 
        WHERE p.customer_id = c.id 
          AND p.finance_id = $1::uuid
          AND p.payment_status IS DISTINCT FROM 'cancelled' 
          AND p.status = 'paid'
      ), 0) AS installments_paid,
      caa.id AS assignment_id,
      caa.agent_id AS current_agent_id,
      caa.priority AS current_priority,
      caa.status AS assignment_status,
      COALESCE(ud.staff_name, u.username) AS current_agent_name
    FROM customers c
    JOIN LATERAL (
      SELECT l_sub.* 
      FROM loans l_sub 
      WHERE l_sub.customer_id = c.id 
        AND l_sub.finance_id = $1::uuid
      ORDER BY l_sub.hp_date DESC, l_sub.id DESC 
      LIMIT 1
    ) l ON true
    LEFT JOIN vehicle_detail v ON v.id = COALESCE(l.vehicle_id, c.vehicle_id)
    LEFT JOIN vehicle_info vi ON vi.id = v.vehicle_info_id
    LEFT JOIN LATERAL (
      SELECT a_sub.* 
      FROM address_history ah 
      JOIN addresses a_sub ON a_sub.id = ah.address_id 
      WHERE ah.entity_id = c.id::text 
        AND ah.entity_type = 'customer' 
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
    LEFT JOIN LATERAL (
      SELECT 
        caa_sub.id,
        caa_sub.agent_id,
        caa_sub.priority,
        caa_sub.status,
        caa_sub.finance_id
      FROM customer_agent_assignments caa_sub
      WHERE caa_sub.customer_id = c.id
        AND caa_sub.finance_id = $1::uuid
        AND caa_sub.status IN ('pending', 'visited')
      ORDER BY caa_sub.assigned_at DESC, caa_sub.id DESC
      LIMIT 1
    ) caa ON true
    LEFT JOIN users u ON u.id = caa.agent_id
    LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY c.hplno ASC
  `;

  const { rows } = await db.query(sql, queryParams);

  // Map and calculate financial metrics per customer row
  let records = rows.map((r) => {
    const fin = calculateCustomerFinancials(r, asOfDate);
    const streetPart = r.street || r.street_name || '';
    const villagePart = r.village || '';
    const cityPart = r.city || '';
    const areaParts = [streetPart, villagePart, cityPart].filter(Boolean);
    const area = areaParts.length > 0 ? areaParts.join(', ') : '—';
    const vehicleName = [r.brand, r.model].filter(Boolean).join(' ') || '—';

    return {
      customerId: r.customer_id,
      loanId: r.loan_id,
      hplNo: r.hplno ? `HPL ${r.hplno}` : '—',
      hplRaw: r.hplno,
      name: r.customer_name || '—',
      phone: r.primary_phone || '—',
      vehicleNumber: r.vehicle_number || '—',
      vehicleName,
      area,
      street: streetPart,
      village: villagePart,
      city: cityPart,
      broker: r.broker_name || '',
      hpDate: r.hp_date || '',
      balance: fin.balance,
      overdueDays: fin.overdueDays,
      riskLevel: fin.riskLevel,
      currentAgentId: r.current_agent_id || null,
      currentAgentName: r.current_agent_name || null,
      currentPriority: r.current_priority || null,
      assignmentStatus: r.assignment_status || null,
      loanStatus: r.loan_status,
    };
  });

  // Secondary filters on derived metrics (must happen BEFORE pagination for correct total)
  if (dueDaysMin !== undefined && dueDaysMin !== '' && !isNaN(Number(dueDaysMin))) {
    records = records.filter((r) => r.overdueDays >= Number(dueDaysMin));
  }
  if (dueDaysMax !== undefined && dueDaysMax !== '' && !isNaN(Number(dueDaysMax))) {
    records = records.filter((r) => r.overdueDays <= Number(dueDaysMax));
  }
  if (dueAmountMin !== undefined && dueAmountMin !== '' && !isNaN(Number(dueAmountMin))) {
    records = records.filter((r) => r.balance >= Number(dueAmountMin));
  }
  if (dueAmountMax !== undefined && dueAmountMax !== '' && !isNaN(Number(dueAmountMax))) {
    records = records.filter((r) => r.balance <= Number(dueAmountMax));
  }
  if (riskLevel && String(riskLevel).toLowerCase() !== 'all') {
    const rl = String(riskLevel).toLowerCase();
    records = records.filter((r) => r.riskLevel === rl);
  }

  // Assignment filter: all | assigned | unassigned
  if (assignment === 'assigned') {
    records = records.filter((r) => Boolean(r.currentAgentId));
  } else if (assignment === 'unassigned') {
    records = records.filter((r) => !r.currentAgentId);
  }

  const total = records.length;
  const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);
  const paginated = records.slice(parsedOffset, parsedOffset + parsedLimit);

  return {
    rows: paginated,
    total,
  };
}

/**
 * 3.2 Fetch Assignable Agents with Workload
 */
async function getAgentsWorkload(financeId) {
  const sql = `
    SELECT 
      u.id,
      COALESCE(ud.staff_name, u.username) AS name,
      COALESCE(u.phone_no, '') AS phone,
      COALESCE(
        (
          SELECT string_agg(
            DISTINCT 
            CASE 
              WHEN aaa.street_name IS NOT NULL AND aaa.street_name <> '' 
              THEN aaa.city || ' (' || aaa.street_name || ')'
              ELSE aaa.city
            END,
            ', '
          )
          FROM agent_area_allocations aaa
          WHERE aaa.user_id = u.id AND aaa.finance_id = $1::uuid
        ),
        'All Territories'
      ) AS area,
      COALESCE(workload.assigned_count, 0)::int AS "assignedCount",
      COALESCE(workload.pending_count, 0)::int AS "pendingCount"
    FROM users u
    JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
    LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
    LEFT JOIN (
      SELECT 
        caa.agent_id,
        COUNT(*) FILTER (WHERE caa.status IN ('pending', 'visited')) AS assigned_count,
        COUNT(*) FILTER (WHERE caa.status = 'pending') AS pending_count
      FROM customer_agent_assignments caa
      JOIN customers c ON c.id = caa.customer_id
      WHERE caa.finance_id = $1::uuid
        AND caa.status IN ('pending', 'visited')
        AND c.loan_status <> 'close'
      GROUP BY caa.agent_id
    ) workload ON workload.agent_id = u.id
    WHERE uac.role = 'agent'
      AND uac.is_active = 1
      AND u.is_active = 1
    ORDER BY name ASC
  `;

  const { rows } = await db.query(sql, [financeId]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    area: r.area,
    assignedCount: parseInt(r.assignedCount, 10) || 0,
    pendingCount: parseInt(r.pendingCount, 10) || 0,
  }));
}

/**
 * 3.3 Bulk Assign Customers to Agent
 */
async function assignCustomers(financeId, assignedByUserId, payload, existingClient = null) {
  const { customerIds, agentId, priority = 'medium', targetDate, notes } = payload;

  // Validation
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    const err = new Error('customerIds must be a non-empty array of UUIDs');
    err.statusCode = 400;
    throw err;
  }

  // Deduplicate customer IDs
  const uniqueCustomerIds = [...new Set(customerIds.map((id) => String(id).trim()))];
  if (uniqueCustomerIds.length > 500) {
    const err = new Error('Cannot assign more than 500 customers at once');
    err.statusCode = 400;
    throw err;
  }

  for (const cId of uniqueCustomerIds) {
    if (!isValidUuid(cId)) {
      const err = new Error(`Invalid customer ID: ${cId}`);
      err.statusCode = 400;
      throw err;
    }
  }

  if (!isValidUuid(agentId)) {
    const err = new Error('Invalid agentId UUID');
    err.statusCode = 400;
    throw err;
  }

  const normPriority = String(priority || 'medium').toLowerCase().trim();
  const validPriorities = ['low', 'medium', 'high', 'urgent'];
  if (!validPriorities.includes(normPriority)) {
    const err = new Error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  let formattedTargetDate = null;
  if (targetDate) {
    let tStr = String(targetDate).trim();
    if (tStr.includes('T')) {
      tStr = tStr.split('T')[0];
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tStr) || isNaN(Date.parse(tStr))) {
      const err = new Error('targetDate must be in YYYY-MM-DD format');
      err.statusCode = 400;
      throw err;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    if (tStr < todayStr) {
      const err = new Error('targetDate cannot be in the past');
      err.statusCode = 400;
      throw err;
    }
    formattedTargetDate = tStr;
  }

  const trimmedNotes = notes ? String(notes).trim().slice(0, 1000) : null;

  const queryExecutor = existingClient || db;

  // Resolve assignedBy to a valid users(id) referencing users table.
  // When an owner session is active, req.user.id is an owner.id from the owner table.
  // We resolve it to the owner user account in this finance or null (since assigned_by is nullable).
  let resolvedAssignedBy = null;
  if (assignedByUserId && isValidUuid(assignedByUserId)) {
    const userCheck = await queryExecutor.query(
      `SELECT id FROM users WHERE id = $1::uuid LIMIT 1`,
      [assignedByUserId]
    );
    if (userCheck.rows.length > 0) {
      resolvedAssignedBy = userCheck.rows[0].id;
    }
  }

  if (!resolvedAssignedBy) {
    const ownerUserCheck = await queryExecutor.query(
      `SELECT u.id 
       FROM users u
       JOIN user_allowed_companies uac ON uac.user_id = u.id 
       WHERE uac.finance_id = $1::uuid AND uac.role = 'owner' AND uac.is_active = 1
       ORDER BY u.created_at ASC 
       LIMIT 1`,
      [financeId]
    );
    if (ownerUserCheck.rows.length > 0) {
      resolvedAssignedBy = ownerUserCheck.rows[0].id;
    }
  }

  // Verify agent exists, has role 'agent', and is active in this finance
  const agentCheck = await queryExecutor.query(
    `SELECT u.id 
     FROM users u
     JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
     WHERE u.id = $2::uuid 
       AND uac.role = 'agent' 
       AND uac.is_active = 1 
       AND u.is_active = 1`,
    [financeId, agentId]
  );

  if (agentCheck.rows.length === 0) {
    const err = new Error('Agent not found, inactive, or not authorized for this finance');
    err.statusCode = 404;
    throw err;
  }

  // Scoping check: verify all customers belong to this finance
  const custCheck = await queryExecutor.query(
    `SELECT id FROM customers WHERE id = ANY($1::uuid[]) AND finance_id = $2::uuid`,
    [uniqueCustomerIds, financeId]
  );

  const foundIds = new Set(custCheck.rows.map((r) => r.id));
  const missingIds = uniqueCustomerIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    const err = new Error(`Customers not found in active finance: ${missingIds.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // Single transaction on pooled client
  const client = existingClient || await db.getConnection();
  const shouldManageTx = !existingClient;

  try {
    if (shouldManageTx) await client.query('BEGIN');

    // 1. Lock existing active assignments for the target customers
    const lockedAssignmentsRes = await client.query(
      `SELECT id, customer_id, agent_id, status 
       FROM customer_agent_assignments 
       WHERE finance_id = $1::uuid 
         AND customer_id = ANY($2::uuid[]) 
         AND status IN ('pending', 'visited')
       FOR UPDATE`,
      [financeId, uniqueCustomerIds]
    );

    const activeAssignmentMap = new Map();
    for (const a of lockedAssignmentsRes.rows) {
      activeAssignmentMap.set(a.customer_id, a);
    }

    // 2. Fetch loan & payment data to calculate server-side balance for each customer
    const custDataRes = await client.query(
      `SELECT 
         c.id AS customer_id,
         c.loan_status,
         l.due_month AS total_installments,
         l.due_amount AS installment_amount,
         l.net_payable,
         COALESCE((
           SELECT SUM(p.amount) 
           FROM payments p 
           WHERE p.customer_id = c.id 
             AND p.finance_id = $1::uuid
             AND p.payment_status IS DISTINCT FROM 'cancelled'
         ), 0) AS total_paid
       FROM customers c
       JOIN LATERAL (
         SELECT l_sub.* 
         FROM loans l_sub 
         WHERE l_sub.customer_id = c.id 
           AND l_sub.finance_id = $1::uuid
         ORDER BY l_sub.hp_date DESC, l_sub.id DESC 
         LIMIT 1
       ) l ON true
       WHERE c.id = ANY($2::uuid[]) AND c.finance_id = $1::uuid`,
      [financeId, uniqueCustomerIds]
    );

    const custFinancialMap = new Map();
    for (const row of custDataRes.rows) {
      const totalInstallments = Math.max(0, parseInt(row.total_installments, 10) || 0);
      const installmentAmount = Math.max(0, parseFloat(row.installment_amount) || 0);
      const netPayable = parseFloat(row.net_payable) || 0;
      const totalDue = netPayable > 0 ? netPayable : (totalInstallments * installmentAmount);
      const totalPaid = Math.max(0, parseFloat(row.total_paid) || 0);
      const balance = Math.max(0, totalDue - totalPaid);

      custFinancialMap.set(row.customer_id, {
        balance,
        loanStatus: row.loan_status,
      });
    }

    let assignedCount = 0;
    let reassignedFromOthers = 0;
    const skipped = [];

    for (const customerId of uniqueCustomerIds) {
      const financial = custFinancialMap.get(customerId);
      const balance = financial?.balance || 0;

      // Rule: skip if customer has no balance
      if (balance <= 0 || financial?.loanStatus === 'close') {
        skipped.push({
          customerId,
          reason: 'no outstanding balance',
        });
        continue;
      }

      const existingAssignment = activeAssignmentMap.get(customerId);

      // Rule: if already assigned to the SAME agent, skip
      if (existingAssignment && existingAssignment.agent_id === agentId) {
        skipped.push({
          customerId,
          reason: 'already assigned to this agent',
        });
        continue;
      }

      // If active assignment exists to a DIFFERENT agent, mark reassigned
      if (existingAssignment) {
        await client.query(
          `UPDATE customer_agent_assignments 
           SET status = 'reassigned'::assignment_status_enum, 
               unassigned_at = CURRENT_TIMESTAMP,
               assigned_by = $2::uuid
           WHERE id = $1::uuid`,
          [existingAssignment.id, resolvedAssignedBy]
        );
        reassignedFromOthers++;
      }

      // Insert new assignment row
      await client.query(
        `INSERT INTO customer_agent_assignments (
           finance_id, customer_id, agent_id, assigned_by, priority,
           status, due_amount, target_date, notes, assigned_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::assignment_priority_enum,
           'pending'::assignment_status_enum, $6, $7, $8, CURRENT_TIMESTAMP
         ) RETURNING id`,
        [
          financeId,
          customerId,
          agentId,
          resolvedAssignedBy,
          normPriority,
          balance,
          formattedTargetDate,
          trimmedNotes,
        ]
      );
      assignedCount++;
    }

    if (shouldManageTx) await client.query('COMMIT');

    return {
      success: true,
      assignedCount,
      skipped,
      reassignedFromOthers,
    };
  } catch (err) {
    if (shouldManageTx) await client.query('ROLLBACK');

    // PostgreSQL error code mapping
    if (err.code === '23505') {
      const error = new Error('Customer was assigned by someone else just now, refresh and retry');
      error.statusCode = 409;
      throw error;
    }
    if (err.code === '23503') {
      const error = new Error('Referenced entity does not exist');
      error.statusCode = 400;
      throw error;
    }
    if (err.code === '22P02') {
      const error = new Error('Invalid id or value format');
      error.statusCode = 400;
      throw error;
    }
    if (err.code === '23514') {
      const error = new Error('Check constraint violation');
      error.statusCode = 400;
      throw error;
    }

    throw err;
  } finally {
    if (shouldManageTx) client.release();
  }
}

/**
 * 3.4 Fetch Agent Run-Sheet Data
 */
async function getAgentRunSheet(financeId, agentId) {
  if (!isValidUuid(agentId)) {
    const err = new Error('Invalid agentId UUID');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify agent belongs to finance and is active
  const agentRes = await db.query(
    `SELECT 
       u.id, 
       COALESCE(ud.staff_name, u.username) AS name,
       COALESCE(u.phone_no, '') AS phone,
       COALESCE(
         (
           SELECT string_agg(
             DISTINCT 
             CASE 
               WHEN aaa.street_name IS NOT NULL AND aaa.street_name <> '' 
               THEN aaa.city || ' (' || aaa.street_name || ')'
               ELSE aaa.city
             END,
             ', '
           )
           FROM agent_area_allocations aaa
           WHERE aaa.user_id = u.id AND aaa.finance_id = $1::uuid
         ),
         'All Territories'
       ) AS area
     FROM users u
     JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid
     LEFT JOIN users_details ud ON ud.user_id = u.id AND ud.finance_id = $1::uuid
     WHERE u.id = $2::uuid
       AND uac.role = 'agent'
       AND uac.is_active = 1
       AND u.is_active = 1`,
    [financeId, agentId]
  );

  if (agentRes.rows.length === 0) {
    const err = new Error('Agent not found or inactive in this finance company');
    err.statusCode = 404;
    throw err;
  }

  const agent = agentRes.rows[0];

  // 2. Fetch Finance information
  const finRes = await db.query(
    `SELECT 
       fd.finance_name AS name,
       fd.phone_numbers,
       a.house_no,
       a.street,
       a.street_name,
       a.village,
       a.land_mark,
       a.city,
       a.district,
       a.state,
       a.pincode
     FROM finance_detail fd
     LEFT JOIN addresses a ON a.id = fd.address_id
     WHERE fd.id = $1::uuid`,
    [financeId]
  );

  const finRow = finRes.rows[0] || {};
  const finAddressParts = [
    finRow.house_no,
    finRow.street || finRow.street_name,
    finRow.village,
    finRow.land_mark,
    finRow.city,
    finRow.district,
    finRow.state,
    finRow.pincode,
  ].filter(Boolean);

  let phoneList = [];
  if (Array.isArray(finRow.phone_numbers)) {
    phoneList = finRow.phone_numbers;
  } else if (typeof finRow.phone_numbers === 'string') {
    try {
      const parsed = JSON.parse(finRow.phone_numbers);
      if (Array.isArray(parsed)) phoneList = parsed;
    } catch {
      phoneList = [finRow.phone_numbers];
    }
  }

  const finance = {
    name: finRow.name || 'Finance Company',
    address: finAddressParts.join(', ') || '—',
    phones: phoneList.filter(Boolean),
  };

  // 3. Fetch active assigned customer rows
  // Predicate strictly mirrors 3.2: caa.agent_id = $2 AND caa.finance_id = $1 AND caa.status IN ('pending', 'visited') AND c.loan_status <> 'close'
  const rowsRes = await db.query(
    `SELECT 
       c.id AS customer_id,
       c.hplno,
       c.cname AS customer_name,
       c.loan_status,
       caa.priority,
       caa.notes,
       TO_CHAR(caa.target_date, 'YYYY-MM-DD') AS target_date,
       l.due_month AS total_installments,
       l.due_amount AS installment_amount,
       l.net_payable,
       TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS hp_date,
       TO_CHAR(l.due_date, 'YYYY-MM-DD') AS first_due_date,
       v.vehicle_number,
       COALESCE(vi.brand, '') AS brand,
       COALESCE(vi.model_name, v.vehicle_modal, '') AS model,
       a.house_no,
       a.street,
       a.street_name,
       a.village,
       a.land_mark,
       a.city,
       a.district,
       a.state,
       a.pincode,
       COALESCE(ct.number, '') AS primary_phone,
       COALESCE((
         SELECT SUM(p.amount) 
         FROM payments p 
         WHERE p.customer_id = c.id 
           AND p.finance_id = $1::uuid
           AND p.payment_status IS DISTINCT FROM 'cancelled'
       ), 0) AS total_paid,
       COALESCE((
         SELECT COUNT(*) 
         FROM payments p 
         WHERE p.customer_id = c.id 
           AND p.finance_id = $1::uuid
           AND p.payment_status IS DISTINCT FROM 'cancelled' 
           AND p.status = 'paid'
       ), 0) AS installments_paid
     FROM customer_agent_assignments caa
     JOIN customers c ON c.id = caa.customer_id
     JOIN LATERAL (
       SELECT l_sub.* 
       FROM loans l_sub 
       WHERE l_sub.customer_id = c.id 
         AND l_sub.finance_id = $1::uuid
       ORDER BY l_sub.hp_date DESC, l_sub.id DESC 
       LIMIT 1
     ) l ON true
     LEFT JOIN vehicle_detail v ON v.id = COALESCE(l.vehicle_id, c.vehicle_id)
     LEFT JOIN vehicle_info vi ON vi.id = v.vehicle_info_id
     LEFT JOIN LATERAL (
       SELECT a_sub.* 
       FROM address_history ah 
       JOIN addresses a_sub ON a_sub.id = ah.address_id 
       WHERE ah.entity_id = c.id::text 
         AND ah.entity_type = 'customer' 
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
     WHERE caa.agent_id = $2::uuid
       AND caa.finance_id = $1::uuid
       AND caa.status IN ('pending', 'visited')
       AND c.loan_status <> 'close'
     ORDER BY caa.assigned_at DESC, caa.id DESC`,
    [financeId, agentId]
  );

  const asOfDate = new Date().toISOString().split('T')[0];

  const processedRows = rowsRes.rows.map((r) => {
    const fin = calculateCustomerFinancials(r, asOfDate);
    const addrParts = [
      r.house_no,
      r.street || r.street_name,
      r.village,
      r.land_mark,
      r.city,
      r.pincode,
    ].filter(Boolean);

    return {
      customerId: r.customer_id,
      hplNo: r.hplno ? `HPL ${r.hplno}` : '—',
      hplRaw: r.hplno,
      customerName: r.customer_name || '—',
      phone: r.primary_phone || '—',
      vehicleNumber: r.vehicle_number || '—',
      vehicleModel: [r.brand, r.model].filter(Boolean).join(' ') || '—',
      fullAddress: addrParts.join(', ') || '—',
      city: r.city || '',
      village: r.village || '',
      street: r.street || r.street_name || '',
      balance: fin.balance,
      overdueDays: fin.overdueDays,
      priority: r.priority || 'medium',
      targetDate: r.target_date || '',
      notes: r.notes || '',
    };
  });

  // Sort rows: city ASC, village ASC, street ASC, then overdueDays DESC
  processedRows.sort((a, b) => {
    const cityComp = (a.city || '').localeCompare(b.city || '');
    if (cityComp !== 0) return cityComp;
    const villageComp = (a.village || '').localeCompare(b.village || '');
    if (villageComp !== 0) return villageComp;
    const streetComp = (a.street || '').localeCompare(b.street || '');
    if (streetComp !== 0) return streetComp;
    return b.overdueDays - a.overdueDays;
  });

  const totals = {
    customersCount: processedRows.length,
    totalBalance: processedRows.reduce((sum, r) => sum + r.balance, 0),
  };

  const printedAt = new Date().toISOString();

  const numberedRows = processedRows.map((r, idx) => ({
    sNo: idx + 1,
    ...r,
  }));

  return {
    finance,
    agent: {
      id: agent.id,
      name: agent.name,
      phone: agent.phone,
      area: agent.area,
    },
    printedAt,
    totals,
    rows: numberedRows,
  };
}

module.exports = {
  isValidUuid,
  calculateCustomerFinancials,
  getAssignableCustomers,
  getAgentsWorkload,
  assignCustomers,
  getAgentRunSheet,
};
