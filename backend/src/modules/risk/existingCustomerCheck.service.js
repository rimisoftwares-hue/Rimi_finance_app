/**
 * existingCustomerCheck.service.js
 *
 * Real-time tenant-scoped duplicate / existing borrower & guarantor identity check
 * for loan entry Step 1 (Customer) and Step 3 (Guardian).
 *
 * Hard rules enforced:
 *  - PostgreSQL only, parameterized ($1 = financeId::uuid).
 *  - ZERO literal question marks anywhere in SQL strings or comments (database.config.js
 *    rewrites literal question marks into positional parameters).
 *  - Work/office phones (contacts.type = 'work') are strictly excluded.
 *  - Aadhaar is ALWAYS returned masked (last 4 digits only).
 *  - Read-only warning lookup; never mutates data and never logs PII.
 */

'use strict';

const crypto = require('node:crypto');
const { db } = require('../../config/database.config');
const {
  computeCreditScore,
  creditBand,
  todayIso,
} = require('./risk.scoring');
const {
  buildCustomerRiskSql,
  scoreRow,
  formatAddress,
  humanize,
  round2,
} = require('./risk.service');

const UUID_ANY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_GOVT_ID_TYPES = new Set(['pan_card', 'voter_id', 'driving_license', 'other']);
const RISK_SEVERITY = { critical: 3, high: 2, warning: 1, safe: 0 };

const MAX_PHONES = 6;
const MAX_RETURNED_MATCHES = 10;
const CANDIDATE_FETCH_LIMIT = 50;
const CACHE_TTL_MS = 25 * 1000;
const CACHE_MAX_ENTRIES = 400;

/** @type {Map<string, { expiresAt: number, value: object }>} */
const resultCache = new Map();

function clearExistingCustomerCheckCache() {
  resultCache.clear();
}

function isValidUuidAny(value) {
  return typeof value === 'string' && UUID_ANY_REGEX.test(value.trim());
}

/**
 * Normalizes a raw phone string to a 10-digit Indian subscriber number:
 *  - strips non-digits
 *  - drops leading '91' on 12-digit numbers or leading '0' on 11-digit numbers
 *  - accepts only 10-digit numbers that are not all zeros
 */
function normalizeSinglePhone(raw) {
  if (raw === null || raw === undefined) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) {
    d = d.slice(2);
  } else if (d.length === 11 && d.startsWith('0')) {
    d = d.slice(1);
  }
  if (d.length !== 10) return null;
  if (/^0+$/.test(d)) return null;
  return d;
}

function normalizeAadhar(raw) {
  if (raw === null || raw === undefined) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 12) return null;
  if (/^0+$/.test(d)) return null;
  return d;
}

function normalizeGovtIdNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 40) return null;
  return cleaned;
}

function normalizeGovtIdType(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim().toLowerCase();
  if (!t) return null;
  return VALID_GOVT_ID_TYPES.has(t) ? t : null;
}

function maskAadhar(digits12) {
  if (!digits12) return null;
  const d = String(digits12).replace(/\D/g, '');
  if (d.length < 4) return 'XXXX-XXXX-XXXX';
  return `XXXX-XXXX-${d.slice(-4)}`;
}

function maskPhone(digits10) {
  if (!digits10) return 'XXXXXXXXXX';
  const d = String(digits10).replace(/\D/g, '');
  return `XXXXXX${d.slice(-4)}`;
}

function maskGovtId(alnum) {
  if (!alnum) return 'XXXXX';
  const s = String(alnum);
  const visible = s.slice(-4);
  const maskLen = Math.max(2, s.length - 4);
  return `${'X'.repeat(maskLen)}${visible}`;
}

function formatRelationLabel(unit, value) {
  const u = unit ? String(unit).trim() : '';
  const v = value ? String(value).trim() : '';
  if (u && v) return `${u} ${v}`;
  return v || null;
}

/**
 * Normalizes and validates identity lookup input.
 * Never throws on user-typed partial values; invalid identifiers are simply omitted.
 */
function normalizeIdentityCheckInput(input = {}) {
  const rawPhones = Array.isArray(input?.phones) ? input.phones : [];
  const seenPhones = new Set();
  const phones = [];

  for (const item of rawPhones) {
    if (phones.length >= MAX_PHONES) break;
    const norm = normalizeSinglePhone(item);
    if (norm && !seenPhones.has(norm)) {
      seenPhones.add(norm);
      phones.push(norm);
    }
  }

  const aadhar = normalizeAadhar(input?.aadhar);
  const otherGovtIdNumber = normalizeGovtIdNumber(input?.otherGovtIdNumber);
  const otherGovtIdType = otherGovtIdNumber ? normalizeGovtIdType(input?.otherGovtIdType) : null;
  const excludeCustomerId = isValidUuidAny(input?.excludeCustomerId)
    ? String(input.excludeCustomerId).trim()
    : null;

  const hasValidInput = Boolean(phones.length > 0 || aadhar || otherGovtIdNumber);

  return {
    phones,
    aadhar,
    otherGovtIdType,
    otherGovtIdNumber,
    excludeCustomerId,
    hasValidInput,
  };
}

function makeCacheKey(financeId, norm) {
  const rawSig = JSON.stringify({
    f: String(financeId),
    p: norm.phones,
    a: norm.aadhar,
    gt: norm.otherGovtIdType,
    gn: norm.otherGovtIdNumber,
    ex: norm.excludeCustomerId,
  });
  return crypto.createHash('sha256').update(rawSig).digest('hex');
}

function getCachedResult(key, now = Date.now()) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    resultCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedResult(key, value, now = Date.now()) {
  if (resultCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey !== undefined) resultCache.delete(oldestKey);
  }
  resultCache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    value,
  });
}

/**
 * Builds the parameterized candidate lookup SQL.
 * IMPORTANT: Never include a literal question mark anywhere in this SQL text.
 */
function buildIdentityCandidateQuery(financeId, norm) {
  const params = [financeId];
  const orPredicates = [];

  if (norm.phones.length > 0) {
    params.push(norm.phones);
    const pIdx = params.length;
    orPredicates.push(`EXISTS (
        SELECT 1
        FROM contacts ctm
        WHERE ctm.customer_id = c.id
          AND (ctm.finance_id = $1::uuid OR ctm.finance_id IS NULL)
          AND ctm.type::text <> 'work'
          AND RIGHT(regexp_replace(ctm.number, '[^0-9]', '', 'g'), 10) = ANY($${pIdx}::text[])
      )`);
  }

  if (norm.aadhar) {
    params.push(norm.aadhar);
    const aIdx = params.length;
    orPredicates.push(`(
        regexp_replace(COALESCE(c.aadhar_id, ''), '[^0-9]', '', 'g') = $${aIdx}
        OR EXISTS (
          SELECT 1
          FROM guardians gm_a
          WHERE gm_a.customer_id = c.id
            AND (gm_a.finance_id = $1::uuid OR gm_a.finance_id IS NULL)
            AND regexp_replace(COALESCE(gm_a.aadhar_id, ''), '[^0-9]', '', 'g') = $${aIdx}
        )
      )`);
  }

  if (norm.otherGovtIdNumber) {
    params.push(norm.otherGovtIdNumber);
    const gnIdx = params.length;

    if (norm.otherGovtIdType) {
      params.push(norm.otherGovtIdType);
      const gtIdx = params.length;
      orPredicates.push(`(
          (
            LOWER(COALESCE(c.other_govt_id_type::text, '')) = $${gtIdx}
            AND UPPER(regexp_replace(COALESCE(c.other_govt_id_number, ''), '[^a-zA-Z0-9]', '', 'g')) = $${gnIdx}
          )
          OR EXISTS (
            SELECT 1
            FROM guardians gm_g
            WHERE gm_g.customer_id = c.id
              AND (gm_g.finance_id = $1::uuid OR gm_g.finance_id IS NULL)
              AND LOWER(COALESCE(gm_g.other_govt_id_type::text, '')) = $${gtIdx}
              AND UPPER(regexp_replace(COALESCE(gm_g.other_govt_id_number, ''), '[^a-zA-Z0-9]', '', 'g')) = $${gnIdx}
          )
        )`);
    } else {
      orPredicates.push(`(
          UPPER(regexp_replace(COALESCE(c.other_govt_id_number, ''), '[^a-zA-Z0-9]', '', 'g')) = $${gnIdx}
          OR EXISTS (
            SELECT 1
            FROM guardians gm_g
            WHERE gm_g.customer_id = c.id
              AND (gm_g.finance_id = $1::uuid OR gm_g.finance_id IS NULL)
              AND UPPER(regexp_replace(COALESCE(gm_g.other_govt_id_number, ''), '[^a-zA-Z0-9]', '', 'g')) = $${gnIdx}
          )
        )`);
    }
  }

  let excludeClause = '';
  if (norm.excludeCustomerId) {
    params.push(norm.excludeCustomerId);
    excludeClause = `AND c.id <> $${params.length}::uuid`;
  }

  const sql = `
    SELECT
      c.id AS customer_id,
      c.hplno,
      c.cname,
      c.cfname_unit,
      c.cfname_value,
      c.aadhar_id,
      c.other_govt_id_type::text AS other_govt_id_type,
      c.other_govt_id_number,
      c.loan_status::text AS loan_status,
      COALESCE(ct_agg.contacts, '[]'::json) AS contacts,
      COALESCE(g_agg.guardians, '[]'::json) AS guardians,
      COUNT(*) OVER ()::int AS total_match_count
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object(
                 'number', ct.number,
                 'type', ct.type::text,
                 'contact_type', ct.contact_type::text
               )
               ORDER BY
                 CASE WHEN ct.contact_type::text = 'customer' THEN 0 ELSE 1 END,
                 CASE WHEN ct.type::text = 'mobile' THEN 0 ELSE 1 END,
                 ct.id
             ) AS contacts
      FROM contacts ct
      WHERE ct.customer_id = c.id
        AND (ct.finance_id = $1::uuid OR ct.finance_id IS NULL)
        AND ct.type::text <> 'work'
    ) ct_agg ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object(
                 'id', g.id,
                 'gname', g.gname,
                 'gfname_unit', g.gfname_unit,
                 'gfname_value', g.gfname_value,
                 'aadhar_id', g.aadhar_id,
                 'other_govt_id_type', g.other_govt_id_type::text,
                 'other_govt_id_number', g.other_govt_id_number
               )
               ORDER BY g.id
             ) AS guardians
      FROM guardians g
      WHERE g.customer_id = c.id
        AND (g.finance_id = $1::uuid OR g.finance_id IS NULL)
    ) g_agg ON true
    WHERE c.finance_id = $1::uuid
      ${excludeClause}
      AND (
        ${orPredicates.join('\n        OR ')}
      )
    ORDER BY
      CASE WHEN c.loan_status::text IN ('seized', 'active') THEN 1 ELSE 0 END DESC,
      CASE WHEN c.loan_status::text = 'seized' THEN 1 ELSE 0 END DESC,
      c.hplno DESC NULLS LAST,
      c.id DESC
    LIMIT ${CANDIDATE_FETCH_LIMIT}
  `;

  return { sql, params };
}

function computeMatchedFieldsForCandidate(cand, norm) {
  const matchedFields = [];
  const seenKeys = new Set();

  const pushMatch = (entry) => {
    const dedupKey = `${entry.field}|${entry.entityRole}|${entry.maskedValue}`;
    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);
    matchedFields.push(entry);
  };

  const guardians = Array.isArray(cand.guardians) ? cand.guardians : [];
  const contacts = Array.isArray(cand.contacts) ? cand.contacts : [];
  const primaryGuardian = guardians[0] || null;

  // 1. Aadhaar (strong)
  if (norm.aadhar) {
    const custAadhar = normalizeAadhar(cand.aadhar_id);
    if (custAadhar && custAadhar === norm.aadhar) {
      pushMatch({
        field: 'aadhar',
        maskedValue: maskAadhar(custAadhar),
        entityRole: 'customer',
        entityName: cand.cname || null,
        strength: 'strong',
      });
    }
    for (const g of guardians) {
      const gAadhar = normalizeAadhar(g?.aadhar_id);
      if (gAadhar && gAadhar === norm.aadhar) {
        pushMatch({
          field: 'aadhar',
          maskedValue: maskAadhar(gAadhar),
          entityRole: 'guardian',
          entityName: g?.gname || null,
          strength: 'strong',
        });
      }
    }
  }

  // 2. Other Govt ID (strong)
  if (norm.otherGovtIdNumber) {
    const custGid = normalizeGovtIdNumber(cand.other_govt_id_number);
    const custGtype = normalizeGovtIdType(cand.other_govt_id_type);
    const custTypeMatches = !norm.otherGovtIdType || custGtype === norm.otherGovtIdType;
    if (custGid && custGid === norm.otherGovtIdNumber && custTypeMatches) {
      pushMatch({
        field: 'other_govt_id',
        maskedValue: maskGovtId(custGid),
        entityRole: 'customer',
        entityName: cand.cname || null,
        strength: 'strong',
        govtIdType: custGtype,
      });
    }

    for (const g of guardians) {
      const gGid = normalizeGovtIdNumber(g?.other_govt_id_number);
      const gGtype = normalizeGovtIdType(g?.other_govt_id_type);
      const gTypeMatches = !norm.otherGovtIdType || gGtype === norm.otherGovtIdType;
      if (gGid && gGid === norm.otherGovtIdNumber && gTypeMatches) {
        pushMatch({
          field: 'other_govt_id',
          maskedValue: maskGovtId(gGid),
          entityRole: 'guardian',
          entityName: g?.gname || null,
          strength: 'strong',
          govtIdType: gGtype,
        });
      }
    }
  }

  // 3. Personal phones (possible — work phones strictly excluded)
  if (norm.phones.length > 0) {
    for (const ct of contacts) {
      if (!ct || String(ct.type || '').toLowerCase() === 'work') continue;
      const cPhone = normalizeSinglePhone(ct.number);
      if (!cPhone) continue;
      const matchedInputIndex = norm.phones.indexOf(cPhone);
      if (matchedInputIndex === -1) continue;

      const entityRole = String(ct.contact_type || '').toLowerCase() === 'guardian'
        ? 'guardian'
        : 'customer';
      const entityName = entityRole === 'guardian'
        ? (primaryGuardian?.gname || null)
        : (cand.cname || null);

      pushMatch({
        field: 'phone',
        maskedValue: maskPhone(cPhone),
        entityRole,
        entityName,
        strength: 'possible',
        matchedInputIndex,
      });
    }
  }

  return matchedFields;
}

function buildGuardianSummary(guardians) {
  const list = Array.isArray(guardians) ? guardians : [];
  const g = list[0];
  if (!g || (!g.id && !g.gname)) return null;
  const gAadhar = normalizeAadhar(g.aadhar_id);
  return {
    id: g.id || null,
    name: g.gname || null,
    relationLabel: formatRelationLabel(g.gfname_unit, g.gfname_value),
    maskedAadhar: gAadhar ? maskAadhar(gAadhar) : null,
  };
}

/**
 * Checks whether any existing customer or guardian in `financeId` matches the
 * supplied personal phone(s), Aadhaar, or other government ID.
 *
 * @param {string} financeId  Verified tenant UUID from req.financeId (NEVER from client body)
 * @param {object} input      { phones, aadhar, otherGovtIdType, otherGovtIdNumber, excludeCustomerId }
 * @param {object} [deps]     Optional test overrides ({ dbClient, useCache })
 */
async function checkExistingCustomerIdentity(financeId, input = {}, deps = {}) {
  if (!isValidUuidAny(financeId)) {
    const err = new Error('Invalid finance context');
    err.statusCode = 400;
    throw err;
  }

  const norm = normalizeIdentityCheckInput(input);
  if (!norm.hasValidInput) {
    return {
      found: false,
      matchCount: 0,
      matches: [],
    };
  }

  const dbClient = deps.dbClient || db;
  const shouldUseCache = deps.useCache !== undefined ? Boolean(deps.useCache) : !deps.dbClient;
  const cacheKey = shouldUseCache ? makeCacheKey(financeId, norm) : null;

  if (cacheKey) {
    const cached = getCachedResult(cacheKey);
    if (cached) return cached;
  }

  const { sql: candidateSql, params: candidateParams } = buildIdentityCandidateQuery(financeId, norm);
  const candidateResult = await dbClient.query(candidateSql, candidateParams);
  const candidateRows = Array.isArray(candidateResult?.rows) ? candidateResult.rows : [];

  if (candidateRows.length === 0) {
    const emptyResponse = {
      found: false,
      matchCount: 0,
      matches: [],
    };
    if (cacheKey) setCachedResult(cacheKey, emptyResponse);
    return emptyResponse;
  }

  const verifiedCandidates = [];
  for (const cand of candidateRows) {
    const matchedFields = computeMatchedFieldsForCandidate(cand, norm);
    if (matchedFields.length > 0) {
      verifiedCandidates.push({ cand, matchedFields });
    }
  }

  if (verifiedCandidates.length === 0) {
    const emptyResponse = {
      found: false,
      matchCount: 0,
      matches: [],
    };
    if (cacheKey) setCachedResult(cacheKey, emptyResponse);
    return emptyResponse;
  }

  const rawTotalCount = Number(candidateRows[0]?.total_match_count) || verifiedCandidates.length;
  const droppedInVerification = candidateRows.length - verifiedCandidates.length;
  const trueMatchCount = Math.max(verifiedCandidates.length, rawTotalCount - droppedInVerification);

  const matchedIds = verifiedCandidates.map((v) => v.cand.customer_id);
  const riskSql = buildCustomerRiskSql('c.id = ANY($2::uuid[])', { requireLoan: false });
  const riskResult = await dbClient.query(riskSql, [financeId, matchedIds]);
  const riskRowsById = new Map(
    (Array.isArray(riskResult?.rows) ? riskResult.rows : []).map((r) => [String(r.customer_id), r])
  );

  const asOfDate = typeof input?.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)
    ? input.asOfDate
    : todayIso();

  const scoredLoanRows = [];

  const enrichedMatches = verifiedCandidates.map(({ cand, matchedFields }) => {
    const r = riskRowsById.get(String(cand.customer_id)) || null;
    const hasLoan = Boolean(r && r.loan_id);
    const s = r ? scoreRow(r, asOfDate) : null;

    if (hasLoan && s) {
      scoredLoanRows.push(s);
    }

    const matchedRoles = [];
    if (matchedFields.some((f) => f.entityRole === 'customer')) matchedRoles.push('customer');
    if (matchedFields.some((f) => f.entityRole === 'guardian')) matchedRoles.push('guardian');

    const addrObj = r
      ? {
        house_no: r.curr_house_no,
        street: r.curr_street,
        street_name: r.curr_street_name,
        village: r.curr_village,
        address: r.curr_address,
        city: r.curr_city,
        district: r.curr_district,
        state: r.curr_state,
        pincode: r.curr_pincode,
      }
      : null;

    const formattedAddress = r ? (formatAddress(addrObj) || r.legacy_home_address || null) : null;

    const nonWorkCustomerPhones = Array.isArray(cand.contacts)
      ? cand.contacts.filter(
        (p) =>
          p &&
          p.number &&
          String(p.type || '').toLowerCase() !== 'work' &&
          String(p.contact_type || '').toLowerCase() === 'customer'
      )
      : [];
    const fallbackPhone = Array.isArray(cand.contacts)
      ? cand.contacts.find((p) => p && p.number && String(p.type || '').toLowerCase() !== 'work')
      : null;
    const primaryPhone = nonWorkCustomerPhones[0]?.number || fallbackPhone?.number || null;

    const loanStatus = (r && r.loan_status) || cand.loan_status || null;

    const loanSummary = hasLoan && s
      ? {
        hpAmount: round2(r.hp_amount),
        totalLoan: s.metrics.totalLoan,
        paidAmount: s.metrics.totalPaid,
        pendingAmount: s.metrics.pendingAmount,
        overdueAmount: s.metrics.overdueAmount,
        overdueDays: s.metrics.overdueDays,
        hasSeizure: r.has_seizure === true,
      }
      : null;

    const risk = hasLoan && s
      ? {
        creditScore: s.credit.creditScore,
        creditBand: s.credit.creditBand,
        dueRiskScore: s.due.dueRiskScore,
        riskLevel: s.riskLevel,
      }
      : null;

    return {
      customerId: String(cand.customer_id),
      hplno: cand.hplno !== undefined ? cand.hplno : (r ? r.hplno : null),
      customerName: cand.cname || (r ? r.cname : ''),
      borrowerName: cand.cname || (r ? r.cname : ''),
      relationLabel: formatRelationLabel(cand.cfname_unit, cand.cfname_value),
      loanStatus,
      hasLoan,
      loanType: hasLoan && r?.loan_type ? humanize(r.loan_type) : null,
      vehicleNumber: r?.vehicle_number || null,
      vehicleName: s?.vehicleName || null,
      primaryPhone,
      address: formattedAddress,
      matchedRoles,
      matchedFields,
      guardianSummary: buildGuardianSummary(cand.guardians),
      loanSummary,
      risk,
    };
  });

  // Order: seized/active (open) first, highest due risk, seized tie-breaker, then newest HPL
  enrichedMatches.sort((a, b) => {
    const aOpen = a.loanStatus === 'seized' || a.loanStatus === 'active' ? 1 : 0;
    const bOpen = b.loanStatus === 'seized' || b.loanStatus === 'active' ? 1 : 0;
    if (bOpen !== aOpen) return bOpen - aOpen;

    const aHasRisk = a.risk ? 1 : 0;
    const bHasRisk = b.risk ? 1 : 0;
    if (bHasRisk !== aHasRisk) return bHasRisk - aHasRisk;

    const aDue = a.risk ? Number(a.risk.dueRiskScore || 0) : -1;
    const bDue = b.risk ? Number(b.risk.dueRiskScore || 0) : -1;
    if (bDue !== aDue) return bDue - aDue;

    const aSeized = a.loanStatus === 'seized' ? 1 : 0;
    const bSeized = b.loanStatus === 'seized' ? 1 : 0;
    if (bSeized !== aSeized) return bSeized - aSeized;

    const aHpl = a.hplno !== null && a.hplno !== undefined ? Number(a.hplno) : -1;
    const bHpl = b.hplno !== null && b.hplno !== undefined ? Number(b.hplno) : -1;
    if (bHpl !== aHpl) return bHpl - aHpl;

    return String(a.customerId).localeCompare(String(b.customerId));
  });

  const limitedMatches = enrichedMatches.slice(0, MAX_RETURNED_MATCHES);

  let highestRiskLevel = null;
  for (const m of enrichedMatches) {
    if (!m.risk?.riskLevel) continue;
    if (
      highestRiskLevel === null ||
      RISK_SEVERITY[m.risk.riskLevel] > RISK_SEVERITY[highestRiskLevel]
    ) {
      highestRiskLevel = m.risk.riskLevel;
    }
  }

  let overallCreditScore = null;
  let overallCreditBand = null;
  if (scoredLoanRows.length > 0) {
    const sumOf = (key) => scoredLoanRows.reduce((sum, s) => sum + (Number(s.row[key]) || 0), 0);
    const maxOverdueDays = scoredLoanRows.reduce(
      (max, s) => Math.max(max, Number(s.metrics.overdueDays) || 0),
      0
    );
    const hasSeizure = scoredLoanRows.some((s) => s.row.has_seizure === true);
    const overall = computeCreditScore({
      totalPayments: sumOf('payment_count'),
      onTimePayments: sumOf('on_time_count'),
      late15to30: sumOf('late_15_30'),
      late31to60: sumOf('late_31_60'),
      lateOver60: sumOf('late_over_60'),
      overdueDays: maxOverdueDays,
      brokenPtpCount: sumOf('broken_ptp_count'),
      hasSeizure,
    });
    overallCreditScore = overall.creditScore;
    overallCreditBand = creditBand(overall.creditScore);
  }

  const response = {
    found: true,
    matchCount: trueMatchCount,
    highestRiskLevel,
    ...(overallCreditScore !== null
      ? { overallCreditScore, overallCreditBand }
      : {}),
    matches: limitedMatches,
  };

  if (cacheKey) {
    setCachedResult(cacheKey, response);
  }

  return response;
}

module.exports = {
  checkExistingCustomerIdentity,
  normalizeIdentityCheckInput,
  normalizeSinglePhone,
  normalizeAadhar,
  normalizeGovtIdNumber,
  maskAadhar,
  maskPhone,
  maskGovtId,
  buildIdentityCandidateQuery,
  clearExistingCustomerCheckCache,
};
