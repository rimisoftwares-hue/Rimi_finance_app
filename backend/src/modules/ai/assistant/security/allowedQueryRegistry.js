'use strict';

/**
 * Trusted Read-Only Tool Registry (`allowedQueryRegistry.js`).
 *
 * Defines the ONLY database operations the AutoFinex AI Voice Assistant is permitted
 * to invoke. Gemini selects a `toolName` and structured parameters; the backend
 * validates parameters, strips any untrusted tenant fields, checks role permissions,
 * and maps the call to pre-approved parameterized read-only SQL.
 */

const { getCurrentDateIST } = require('../../../accounting/reports/business.calculator');
const { sanitizeToolParameters } = require('./financeScopeValidator');
const { isDynamicSqlRoleReady } = require('./readOnlyDbPool');
const { validateAndNormalizeGetApiRequest } = require('./backendGetApiRegistry');
const {
  parseHplArgument,
  parseVehiclePlate,
  parsePhoneEntity,
  normalizeUnicodeDigits,
} = require('../services/entityNormalizer.service');

function createInvalidParamError(message) {
  const err = new Error(message);
  err.code = 'INVALID_TOOL_PARAMS';
  err.statusCode = 400;
  err.clientSafe = true;
  return err;
}

const ISO_DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function parseIsoDateOrNull(val) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const dt = new Date(`${trimmed}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : trimmed;
}

function resolvePeriodRange(rawParams = {}, todayIST = getCurrentDateIST()) {
  const period = String(rawParams.period || 'today').trim().toLowerCase();
  const [yStr, mStr] = todayIST.split('-');
  const year = Number(yStr);
  const month = Number(mStr);

  if (period === 'today') {
    return { period: 'today', startDate: todayIST, endDate: todayIST };
  }

  if (period === 'yesterday') {
    const d = new Date(`${todayIST}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const yest = d.toISOString().slice(0, 10);
    return { period: 'yesterday', startDate: yest, endDate: yest };
  }

  if (period === 'this_week' || period === 'last_7_days') {
    const d = new Date(`${todayIST}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return { period: 'last_7_days', startDate: d.toISOString().slice(0, 10), endDate: todayIST };
  }

  if (period === 'this_month' || period === 'current_month') {
    const start = `${yStr}-${mStr}-01`;
    return { period: 'this_month', startDate: start, endDate: todayIST };
  }

  if (period === 'last_month' || period === 'previous_month') {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const pmStr = String(prevMonth).padStart(2, '0');
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    return {
      period: 'last_month',
      startDate: `${prevYear}-${pmStr}-01`,
      endDate: `${prevYear}-${pmStr}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  // Custom date range (bounded to max 366 days)
  const customStart = parseIsoDateOrNull(rawParams.startDate);
  const customEnd = parseIsoDateOrNull(rawParams.endDate) || customStart || todayIST;
  if (customStart) {
    const startMs = Date.parse(`${customStart}T00:00:00Z`);
    const endMs = Date.parse(`${customEnd}T00:00:00Z`);
    if (endMs >= startMs && endMs - startMs <= 366 * 86400 * 1000) {
      return { period: 'custom', startDate: customStart, endDate: customEnd };
    }
  }

  return { period: 'today', startDate: todayIST, endDate: todayIST };
}

function clampLimit(val, fallback = 5, max = 10) {
  const n = Number.parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, n);
}

const ALLOWED_QUERY_TOOLS = Object.freeze({
  get_today_collection: {
    name: 'get_today_collection',
    cacheCategory: 'todayCollection',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      "Get today's total payment collection amount, payment count, yesterday's collection, and exact comparison delta for the authenticated finance company.",
    parametersSchema: {
      type: 'OBJECT',
      properties: {},
    },
    normalizeParams: () => ({ date: getCurrentDateIST() }),
  },

  get_collection_by_period: {
    name: 'get_collection_by_period',
    cacheCategory: 'periodCollection',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Get total collections, EMI amount, penalty, hand loan recovery, and payment receipt count for a period: today, yesterday, last_7_days, this_month, last_month, or custom startDate/endDate (YYYY-MM-DD).',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'One of: today, yesterday, last_7_days, this_month, last_month, custom',
        },
        startDate: {
          type: 'STRING',
          description: 'Optional YYYY-MM-DD start date when period is custom',
        },
        endDate: {
          type: 'STRING',
          description: 'Optional YYYY-MM-DD end date when period is custom',
        },
      },
    },
    normalizeParams: (raw) => resolvePeriodRange(raw, getCurrentDateIST()),
  },

  get_finance_overview: {
    name: 'get_finance_overview',
    cacheCategory: 'overview',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Get overall AutoFinex dashboard business summary: total customers, active loans, closed loans, seized vehicles, unpaid customer count, total pending dues, today collection, and cash-in-hand (for owner/admin).',
    parametersSchema: {
      type: 'OBJECT',
      properties: {},
    },
    normalizeParams: () => ({ asOfDate: getCurrentDateIST() }),
  },

  get_pending_and_overdue_summary: {
    name: 'get_pending_and_overdue_summary',
    cacheCategory: 'pendingSummary',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      "Get pending EMI dues total, unpaid customer count, today's due count, >30-day overdue count, high-risk alert count, and top overdue customer accounts.",
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        topLimit: {
          type: 'INTEGER',
          description: 'How many top overdue accounts to list (1 to 10, default 5)',
        },
      },
    },
    normalizeParams: (raw) => ({
      asOfDate: getCurrentDateIST(),
      topLimit: clampLimit(raw?.topLimit, 5, 10),
    }),
  },

  get_agent_collection_summary: {
    name: 'get_agent_collection_summary',
    cacheCategory: 'agentSummary',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Get collector / agent-wise payment collection leaderboard (who collected the most money and how many receipts) for today, yesterday, last_7_days, this_month, or last_month.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'One of: today, yesterday, last_7_days, this_month, last_month, custom',
        },
        startDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
        limit: { type: 'INTEGER', description: 'Max agents to return (1 to 10, default 5)' },
      },
    },
    normalizeParams: (raw) => ({
      ...resolvePeriodRange(raw, getCurrentDateIST()),
      limit: clampLimit(raw?.limit, 5, 10),
    }),
  },

  get_payment_mode_breakdown: {
    name: 'get_payment_mode_breakdown',
    cacheCategory: 'paymentModes',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Get payment collection breakdown by payment mode (cash, upi, bank, etc.) for today, yesterday, this_month, last_month, or custom dates.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'One of: today, yesterday, last_7_days, this_month, last_month, custom',
        },
        startDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
      },
    },
    normalizeParams: (raw) => resolvePeriodRange(raw, getCurrentDateIST()),
  },

  get_loan_disbursement_summary: {
    name: 'get_loan_disbursement_summary',
    cacheCategory: 'loanDisbursement',
    allowedRoles: ['owner', 'admin', 'staff'],
    description:
      'Get new loans disbursed count and total HP disbursement amount (excluding consulting deals) for today, this_month, last_month, or custom dates.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'One of: today, yesterday, last_7_days, this_month, last_month, custom',
        },
        startDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
      },
    },
    normalizeParams: (raw) => resolvePeriodRange(raw, getCurrentDateIST()),
  },

  get_expense_summary: {
    name: 'get_expense_summary',
    cacheCategory: 'expenseSummary',
    allowedRoles: ['owner', 'admin', 'staff'],
    description:
      'Get operational office expenses and vehicle expenses summary (plus top categories) for today, yesterday, this_month, last_month, or custom dates.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'One of: today, yesterday, last_7_days, this_month, last_month, custom',
        },
        startDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'Optional YYYY-MM-DD' },
      },
    },
    normalizeParams: (raw) => resolvePeriodRange(raw, getCurrentDateIST()),
  },

  search_customer_loan_status: {
    name: 'search_customer_loan_status',
    cacheCategory: 'customerLookup',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Look up a specific customer, loan, or vehicle by HPL loan number (pass digits e.g. 3 or 102 — "HP number N" or "Nth number customer" ALWAYS means hplno = N, NEVER the Nth row of a pending/overdue list), Indian vehicle registration plate (full plate e.g. "TN 39 AB 1234" or last 4 digits e.g. "1234"), customer phone number (full 10 digits or last 4 digits), or customer name.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        hplno: {
          type: 'INTEGER',
          description:
            'Optional integer HPL loan account number as digits (e.g. 3 or 102). Never confuse with a list row position.',
        },
        vehicleNumber: {
          type: 'STRING',
          description:
            'Optional Indian RTO / BH-series vehicle registration plate (e.g. "TN 39 AB 1234", "TN09A0005") or last 4 digits (e.g. "1234").',
        },
        customerName: {
          type: 'STRING',
          description: 'Optional customer name search term (max 60 characters).',
        },
        phone: {
          type: 'STRING',
          description: 'Optional customer phone/mobile number (full 10 digits or last 4 digits).',
        },
      },
    },
    normalizeParams: (raw) => {
      if (raw?.hplno !== undefined && raw?.hplno !== null) {
        if (typeof raw.hplno !== 'number' && typeof raw.hplno !== 'string') {
          throw createInvalidParamError('Parameter "hplno" must be an integer or numeric string.');
        }
        if (String(raw.hplno).length > 60) {
          throw createInvalidParamError('Parameter "hplno" exceeds maximum length.');
        }
      }

      if (raw?.vehicleNumber !== undefined && raw?.vehicleNumber !== null) {
        if (typeof raw.vehicleNumber !== 'string' && typeof raw.vehicleNumber !== 'number') {
          throw createInvalidParamError('Parameter "vehicleNumber" must be a string.');
        }
        if (String(raw.vehicleNumber).length > 120) {
          throw createInvalidParamError('Parameter "vehicleNumber" exceeds maximum length of 120 characters.');
        }
      }

      if (raw?.customerName !== undefined && raw?.customerName !== null) {
        if (typeof raw.customerName !== 'string') {
          throw createInvalidParamError('Parameter "customerName" must be a string.');
        }
        if (raw.customerName.length > 80) {
          throw createInvalidParamError('Parameter "customerName" exceeds maximum length of 80 characters.');
        }
      }

      if (raw?.phone !== undefined && raw?.phone !== null) {
        if (typeof raw.phone !== 'string' && typeof raw.phone !== 'number') {
          throw createInvalidParamError('Parameter "phone" must be a string.');
        }
        if (String(raw.phone).length > 40) {
          throw createInvalidParamError('Parameter "phone" exceeds maximum length of 40 characters.');
        }
      }

      const hplno = parseHplArgument(raw?.hplno);

      let vehicleNormalized = null;
      let vehicleDisplay = null;
      let vehicleVariants = [];
      let vehicleLast4 = '';

      if (raw?.vehicleNumber !== undefined && raw?.vehicleNumber !== null && String(raw.vehicleNumber).trim() !== '') {
        const rawVehStr = String(raw.vehicleNumber).trim();
        const parsedPlate = parseVehiclePlate(rawVehStr, { allowBareLast4: true });
        if (parsedPlate) {
          if (parsedPlate.normalized) {
            vehicleNormalized = parsedPlate.normalized;
            vehicleDisplay = parsedPlate.display;
            vehicleVariants = Array.isArray(parsedPlate.variants) && parsedPlate.variants.length > 0
              ? parsedPlate.variants.slice().sort()
              : [parsedPlate.normalized];
          } else if (parsedPlate.last4) {
            vehicleLast4 = parsedPlate.last4;
          }
        } else {
          const compactAlnum = normalizeUnicodeDigits(rawVehStr)
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
          if (/^\d{4}$/.test(compactAlnum)) {
            vehicleLast4 = compactAlnum;
          } else if (/^[A-Z0-9]{5,14}$/.test(compactAlnum)) {
            vehicleNormalized = compactAlnum;
            vehicleDisplay = compactAlnum;
            vehicleVariants = [compactAlnum];
          }
        }
      }

      let phoneFull = '';
      let phoneLast4 = '';
      if (raw?.phone !== undefined && raw?.phone !== null && String(raw.phone).trim() !== '') {
        const parsedPhone = parsePhoneEntity(String(raw.phone), { allowBarePhone: true });
        if (parsedPhone) {
          phoneFull = parsedPhone.full || '';
          phoneLast4 = parsedPhone.last4 || '';
        }
      }

      const customerName =
        typeof raw?.customerName === 'string'
          ? raw.customerName.replace(/[%_\\]/g, '').trim().slice(0, 60)
          : '';

      return {
        hplno: Number.isFinite(hplno) ? hplno : null,
        vehicleNormalized,
        vehicleDisplay,
        vehicleVariants,
        vehicleLast4,
        phoneFull,
        phoneLast4,
        customerName,
      };
    },
  },

  run_readonly_select_query: {
    name: 'run_readonly_select_query',
    cacheCategory: 'dynamicSelect',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Execute an audited, read-only PostgreSQL SELECT query against tenant-isolated `ai_ro.<view>` views for ANY AutoFinex business question not covered by the fast KPI summary tools (e.g. specific customer lists, village/city filters, insurance/FC expiry, broker/dealer stats, telecalling history, PTP records, seized vehicles, ledger/voucher breakdowns). Always prefix views with `ai_ro.`.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        sql: {
          type: 'STRING',
          description:
            'Single read-only PostgreSQL SELECT or WITH ... SELECT statement referencing ONLY `ai_ro.<view>` views (max 50 rows).',
        },
        reason: {
          type: 'STRING',
          description: 'Brief explanation of what business question this SELECT query answers.',
        },
      },
      required: ['sql'],
    },
    normalizeParams: (raw) => {
      const sql = typeof raw?.sql === 'string' ? raw.sql.trim().slice(0, 4000) : '';
      const reason = typeof raw?.reason === 'string' ? raw.reason.trim().slice(0, 240) : '';
      return { sql, reason };
    },
  },

  call_backend_get_api: {
    name: 'call_backend_get_api',
    cacheCategory: 'backendGetApi',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Execute an authenticated, strictly read-only HTTP GET request to any approved AutoFinex backend `/api/...` endpoint for the current finance company (e.g. `/api/customers/105` for full customer address + customer/guardian phone numbers + loan/vehicle/payments, `/api/customers` with `searchFilter` to search by name/village/street/phone/plate, `/api/auth/allUsers` for total staff count & roles, `/api/agents/login-report` for staff logged in today, `/api/vehicles`, `/api/godowns`, `/api/godowns/seized-vehicles`, `/api/payments/report`, `/api/expenses`, `/api/ledger/list`, `/api/reports/pnl`, `/api/risk/alerts`, `/api/risk/locator`). Returns sanitized, count-accurate JSON.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        endpoint: {
          type: 'STRING',
          description:
            'Approved AutoFinex GET path (may include inline query string), e.g. "/api/customers/105", "/api/customers", "/api/auth/allUsers", or "/api/agents/login-report?dateFrom=2026-11-15&dateTo=2026-11-15".',
        },
        queryParams: {
          type: 'OBJECT',
          description: 'Optional query-string key/value filters for the GET endpoint.',
          properties: {
            search: { type: 'STRING', description: 'Search text filter' },
            q: { type: 'STRING', description: 'Search query string' },
            query: { type: 'STRING', description: 'Lookup value (HPL, vehicle plate, or contact)' },
            type: { type: 'STRING', description: 'Lookup or record type (e.g. "hpl", "vehicle", "contact")' },
            status: { type: 'STRING', description: 'Status filter' },
            date: { type: 'STRING', description: 'Single YYYY-MM-DD date' },
            startDate: { type: 'STRING', description: 'Start date YYYY-MM-DD' },
            endDate: { type: 'STRING', description: 'End date YYYY-MM-DD' },
            fromDate: { type: 'STRING', description: 'From date YYYY-MM-DD' },
            toDate: { type: 'STRING', description: 'To date YYYY-MM-DD' },
            dateFrom: { type: 'STRING', description: 'Login report start date YYYY-MM-DD' },
            dateTo: { type: 'STRING', description: 'Login report end date YYYY-MM-DD' },
            asOfDate: { type: 'STRING', description: 'Balance/report as-of date YYYY-MM-DD' },
            period: { type: 'STRING', description: 'Period filter (e.g. monthly, yearly)' },
            month: { type: 'STRING', description: 'Month number (1-12)' },
            year: { type: 'STRING', description: 'Four-digit year (e.g. 2026)' },
            financialYear: { type: 'STRING', description: 'Financial year label' },
            limit: { type: 'STRING', description: 'Row/page limit' },
            offset: { type: 'STRING', description: 'Pagination offset' },
            page: { type: 'STRING', description: 'Page number' },
            role: { type: 'STRING', description: 'Staff/user role filter (owner, admin, staff, agent)' },
            area: { type: 'STRING', description: 'Village/city/area filter' },
            agentId: { type: 'STRING', description: 'Agent user UUID' },
            godownId: { type: 'STRING', description: 'Godown UUID' },
            groupId: { type: 'STRING', description: 'Ledger group ID' },
            voucherType: { type: 'STRING', description: 'Accounting voucher type' },
            paymentMode: { type: 'STRING', description: 'Payment mode (cash, upi, bank)' },
            collectedBy: { type: 'STRING', description: 'Collector name or user ID' },
            category: { type: 'STRING', description: 'Expense category' },
            transaction_type: { type: 'STRING', description: 'Transaction type (Expense or Income)' },
            severity: { type: 'STRING', description: 'Risk alert severity' },
            riskLevel: { type: 'STRING', description: 'Risk level filter' },
            deal_type: { type: 'STRING', description: 'Vehicle deal type' },
            brand: { type: 'STRING', description: 'Vehicle brand' },
            vehicle_type: { type: 'STRING', description: 'Vehicle body/category type' },
            id: { type: 'STRING', description: 'Entity ID query parameter' },
            phone: { type: 'STRING', description: 'Phone number parameter' },
            vehicleNumber: { type: 'STRING', description: 'Vehicle registration number parameter' },
            billFrom: { type: 'STRING', description: 'Starting receipt/bill number' },
            billTo: { type: 'STRING', description: 'Ending receipt/bill number' },
          },
        },
        searchFilter: {
          type: 'STRING',
          description:
            'Optional case-insensitive filter matched across returned list items (e.g. customer name, village, street, phone number, HPL number, or vehicle number) before compacting.',
        },
        maxItems: {
          type: 'INTEGER',
          description:
            'Maximum array items to include in the response (1 to 50, default 25). Exact totalCount and matchedCount are always preserved.',
        },
      },
      required: ['endpoint'],
    },
    normalizeParams: (raw) => {
      if (typeof raw?.endpoint !== 'string' || !raw.endpoint.trim()) {
        throw createInvalidParamError('Parameter "endpoint" must be a non-empty GET API path string.');
      }
      if (
        raw?.queryParams !== undefined &&
        raw?.queryParams !== null &&
        (typeof raw.queryParams !== 'object' || Array.isArray(raw.queryParams))
      ) {
        throw createInvalidParamError('Parameter "queryParams" must be an object of key-value pairs.');
      }
      if (raw?.searchFilter !== undefined && raw?.searchFilter !== null && typeof raw.searchFilter !== 'string') {
        throw createInvalidParamError('Parameter "searchFilter" must be a string.');
      }

      const cleanQueryParams = {};
      if (raw?.queryParams && typeof raw.queryParams === 'object') {
        for (const [k, v] of Object.entries(raw.queryParams)) {
          if (v === undefined || v === null || v === '') continue;
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            cleanQueryParams[String(k).trim().slice(0, 64)] = String(v).trim().slice(0, 200);
          }
        }
      }

      return {
        endpoint: raw.endpoint.trim().slice(0, 500),
        queryParams: cleanQueryParams,
        searchFilter: typeof raw?.searchFilter === 'string' ? raw.searchFilter.trim().slice(0, 100) : '',
        maxItems: clampLimit(raw?.maxItems, 25, 50),
      };
    },
  },

  list_backend_get_apis: {
    name: 'list_backend_get_apis',
    cacheCategory: 'backendGetCatalog',
    allowedRoles: ['owner', 'admin', 'staff', 'agent'],
    description:
      'Search or browse the catalog of approved read-only AutoFinex Backend GET endpoints available to the current user role, including path templates, supported queryParams, and descriptions.',
    parametersSchema: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description:
            'Optional module category filter: customers, staff, dashboard, company, payments, vehicles, godowns, expenses, agents, accounting, reports, risk, or telecalling.',
        },
        keyword: {
          type: 'STRING',
          description: 'Optional search keyword (e.g. "address", "login", "godown", "ledger", "seizing").',
        },
      },
    },
    normalizeParams: (raw) => {
      if (raw?.category !== undefined && raw?.category !== null && typeof raw.category !== 'string') {
        throw createInvalidParamError('Parameter "category" must be a string.');
      }
      if (raw?.keyword !== undefined && raw?.keyword !== null && typeof raw.keyword !== 'string') {
        throw createInvalidParamError('Parameter "keyword" must be a string.');
      }
      return {
        category: typeof raw?.category === 'string' ? raw.category.trim().toLowerCase().slice(0, 40) : '',
        keyword: typeof raw?.keyword === 'string' ? raw.keyword.trim().slice(0, 80) : '',
      };
    },
  },
});

function getGeminiFunctionDeclarations(role = 'staff', options = {}) {
  const normRole = String(role || 'staff').toLowerCase();
  const dynamicReady =
    typeof options.dynamicSqlAvailable === 'boolean'
      ? options.dynamicSqlAvailable
      : isDynamicSqlRoleReady();

  return Object.values(ALLOWED_QUERY_TOOLS)
    .filter((tool) => {
      if (!tool.allowedRoles.includes(normRole)) return false;
      if (tool.name === 'run_readonly_select_query' && !dynamicReady) return false;
      return true;
    })
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    }));
}

function resolveAndValidateToolCall(scope, rawToolName, rawParameters) {
  const toolName = String(rawToolName || '').trim();
  const tool = ALLOWED_QUERY_TOOLS[toolName];
  if (!tool) {
    const err = new Error(`Unapproved AI data tool "${toolName}" rejected`);
    err.code = 'UNAPPROVED_TOOL';
    err.statusCode = 403;
    throw err;
  }

  const role = scope?.isOwner ? 'owner' : String(scope?.role || 'staff').toLowerCase();
  if (!tool.allowedRoles.includes(role)) {
    const err = new Error(`Role "${role}" is not permitted to invoke tool "${toolName}"`);
    err.code = 'TOOL_ROLE_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  if (rawParameters !== undefined && rawParameters !== null && (typeof rawParameters !== 'object' || Array.isArray(rawParameters))) {
    throw createInvalidParamError(`Parameters for tool "${toolName}" must be a JSON object.`);
  }

  const stripped = sanitizeToolParameters(rawParameters);
  const allowedPropKeys = new Set(Object.keys(tool.parametersSchema?.properties || {}));
  for (const key of Object.keys(stripped)) {
    if (!allowedPropKeys.has(key)) {
      throw createInvalidParamError(`Unknown parameter "${key}" is not permitted for tool "${toolName}".`);
    }
  }

  const normalizedParams = tool.normalizeParams(stripped);

  if (tool.name === 'call_backend_get_api') {
    const validatedApi = validateAndNormalizeGetApiRequest(scope, {
      endpoint: normalizedParams.endpoint,
      queryParams: normalizedParams.queryParams,
      method: 'GET',
    });
    return {
      tool,
      toolName: tool.name,
      parameters: {
        endpoint: validatedApi.pathname,
        queryParams: validatedApi.queryObject,
        searchFilter: normalizedParams.searchFilter,
        maxItems: normalizedParams.maxItems,
      },
    };
  }

  return {
    tool,
    toolName: tool.name,
    parameters: normalizedParams,
  };
}

module.exports = {
  ALLOWED_QUERY_TOOLS,
  resolvePeriodRange,
  getGeminiFunctionDeclarations,
  resolveAndValidateToolCall,
};

