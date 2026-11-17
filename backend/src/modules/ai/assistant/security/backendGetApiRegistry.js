'use strict';

/**
 * Tenant-Safe Backend `GET` API Catalog & Validator (`backendGetApiRegistry.js`).
 *
 * Grants the AutoFinex AI Assistant strictly read-only (`GET`-only) access to all
 * verified tenant-isolated AutoFinex Express endpoints while hard-blocking:
 *   - Non-GET HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`, etc.)
 *   - External URLs, SSRF schemes, and `..` path traversal
 *   - Recursive AI Assistant endpoints (`/api/ai/assistant/*`) and internal HMAC routes (`/api/internal/*`)
 *   - Legacy un-scoped routes lacking `WHERE finance_id = $1` (`/payments`, `/lastduedate`,
 *     `/api/lastduedate`, `/api/customers/search`, `/api/users/:userId/staff-details`)
 *   - Presigned S3 / media-mutation / token routes (`/api/customers/images/signed-url`,
 *     `/api/vehicles/:id/refresh-images`, `/api/ai/calls/:callId/recording-url`, `/api/auth/login*`)
 */

const { isValidUuid, FinanceScopeError } = require('./financeScopeValidator');

const ALL_ROLES = Object.freeze(['owner', 'admin', 'staff', 'agent']);
const STAFF_UP = Object.freeze(['owner', 'admin', 'staff']);
const ADMIN_UP = Object.freeze(['owner', 'admin']);
const OWNER_ONLY = Object.freeze(['owner']);

class BackendGetApiValidationError extends Error {
  constructor(code, message, statusCode = 403) {
    super(message);
    this.name = 'BackendGetApiValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.clientSafe = true;
  }
}

/**
 * Explicit blocklist evaluated BEFORE any dynamic `:param` route pattern can match.
 */
const EXPLICITLY_BLOCKED_PATH_RULES = Object.freeze([
  {
    pattern: /^\/api\/ai\/assistant(?:\/|$)/i,
    reason: 'Recursive AI Assistant endpoints are forbidden.',
  },
  {
    pattern: /^\/api\/internal(?:\/|$)/i,
    reason: 'Internal service-to-service endpoints are forbidden.',
  },
  {
    pattern: /^\/(?:api\/)?uploads(?:\/|$)/i,
    reason: 'Static upload file streams are forbidden.',
  },
  {
    pattern: /^\/payments\/?$/i,
    reason: 'Legacy un-scoped /payments endpoint is forbidden. Use /api/payments/report or /api/payments/details.',
  },
  {
    pattern: /^\/(?:api\/)?lastduedate\/?$/i,
    reason: 'Legacy un-scoped lastduedate endpoint is forbidden. Use /api/customers/pending-collections or /api/customers.',
  },
  {
    pattern: /^\/api\/customers\/search\/?$/i,
    reason:
      'Legacy un-scoped /api/customers/search is forbidden. Use /api/customers (with searchFilter), /api/customers/:hplno, or /api/payments/customers/search?type=hpl|vehicle|contact&query=...',
  },
  {
    pattern: /^\/api\/customers\/images\/signed-url\/?$/i,
    reason: 'Presigned S3 media URL endpoints are forbidden.',
  },
  {
    pattern: /^\/api\/vehicles\/[^/]+\/refresh-images\/?$/i,
    reason: 'Image refresh endpoints are forbidden.',
  },
  {
    pattern: /^\/api\/ai\/calls\/[^/]+\/recording-url\/?$/i,
    reason: 'Call recording signed URL endpoints are forbidden.',
  },
  {
    pattern: /^\/api\/users\/[^/]+\/staff-details\/?$/i,
    reason: 'Un-scoped staff-details route is forbidden. Use /api/auth/allUsers or /api/agents/login-report.',
  },
  {
    pattern: /^\/api\/auth\/(?:login|owner-login|finance-login|refresh|logout|owner-finances|finance-details|register)(?:\/|$)/i,
    reason: 'Authentication/token session endpoints are forbidden.',
  },
]);

function compilePathTemplate(pathTemplate) {
  const paramNames = [];
  const escaped = pathTemplate
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/?#]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return {
    regex: new RegExp(`^${escaped}\\/?$`, 'i'),
    paramNames,
  };
}

const RAW_CATALOG = [
  // ─── Customers, Addresses, Phone Numbers & Loans ───────────────────────────
  {
    id: 'customers.list',
    category: 'customers',
    pathTemplate: '/api/customers',
    minRoles: ALL_ROLES,
    queryHints: [],
    description:
      'List all customers in this finance company with HPL number (hplno), cname, loanStatus, full customer address (caddress), phone numbers (contacts_json, work_office_phone), profession, brokerName, and vehicle details. Combine with searchFilter to filter by name, village, city, address, phone, or plate.',
  },
  {
    id: 'customers.pending_collections',
    category: 'customers',
    pathTemplate: '/api/customers/pending-collections',
    minRoles: ALL_ROLES,
    queryHints: ['search', 'status', 'area', 'agentId'],
    description:
      'Detailed pending EMI collections list with overdue installments, overdue days, pending amounts, phone numbers, and addresses.',
  },
  {
    id: 'customers.unpaid',
    category: 'customers',
    pathTemplate: '/api/customers/unpaidcustomers',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'List unpaid/overdue customer loan accounts with ledger rollup balances and due details.',
  },
  {
    id: 'customers.kyc_pending',
    category: 'customers',
    pathTemplate: '/api/customers/kyc-pending',
    minRoles: STAFF_UP,
    queryHints: ['type', 'status', 'search'],
    description: 'Customers and staff with incomplete/pending KYC documents and summary counts.',
  },
  {
    id: 'customers.terminated',
    category: 'customers',
    pathTemplate: '/api/customers/terminated-accounts',
    minRoles: STAFF_UP,
    queryHints: ['status', 'search'],
    description: 'Closed, settled, or seized/terminated customer loan accounts and aggregates.',
  },
  {
    id: 'customers.next_hplno',
    category: 'customers',
    pathTemplate: '/api/customers/next-hplno',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Next available HPL loan number in the company.',
  },
  {
    id: 'customers.detail',
    category: 'customers',
    pathTemplate: '/api/customers/:customerId',
    minRoles: ALL_ROLES,
    queryHints: [],
    description:
      'Full profile for a single customer by HPL number (e.g. /api/customers/105) OR customer UUID: includes full_address (house_no, street, village, city, district, state, pincode), all customer & guardian phone numbers (contacts), guardian name & address, loan terms, vehicle details, and full payment history.',
  },
  {
    id: 'customers.payments',
    category: 'customers',
    pathTemplate: '/api/customers/:customerId/payments',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'All EMI payment receipts, due dates, payment dates, penalties, and bill numbers for a customer.',
  },
  {
    id: 'customers.history',
    category: 'customers',
    pathTemplate: '/api/customers/:customerId/history',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Complete activity, loan, and audit history for a specific customer.',
  },
  {
    id: 'customers.seizing',
    category: 'customers',
    pathTemplate: '/api/customers/:id/seizing',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Vehicle seizing status, seizing date, charges, godown, and release details for a customer.',
  },

  // ─── Staff, Users & Attendance ─────────────────────────────────────────────
  {
    id: 'staff.all_users',
    category: 'staff',
    pathTemplate: '/api/auth/allUsers',
    minRoles: ALL_ROLES,
    queryHints: [],
    description:
      'Total active staff/users in this finance company (`total` count + `users` list with username, role [owner/admin/staff/agent], phone_no, email, and last_accessed_at).',
  },
  {
    id: 'staff.login_report',
    category: 'staff',
    pathTemplate: '/api/agents/login-report',
    minRoles: ADMIN_UP,
    queryHints: ['dateFrom', 'dateTo', 'role', 'search', 'limit', 'offset'],
    description:
      'Staff attendance & login activity report (owner/admin): pass dateFrom=YYYY-MM-DD and dateTo=YYYY-MM-DD to see how many and which staff/agents logged in today or in a date range.',
  },
  {
    id: 'staff.dashboard_overview',
    category: 'staff',
    pathTemplate: '/api/dashboard/staff-overview',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Staff dashboard overview metrics and operational task counts.',
  },
  {
    id: 'staff.search_users',
    category: 'staff',
    pathTemplate: '/api/auth/users/search',
    minRoles: ADMIN_UP,
    queryHints: ['q'],
    description: 'Search users in the company by username or phone.',
  },
  {
    id: 'staff.invitations',
    category: 'staff',
    pathTemplate: '/api/invitations',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Pending and active staff invitations for this finance company.',
  },
  {
    id: 'staff.my_profile_overview',
    category: 'staff',
    pathTemplate: '/api/user/profile-overview',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Current authenticated user profile overview.',
  },

  // ─── Dashboard & Company Profile ───────────────────────────────────────────
  {
    id: 'dashboard.home_overview',
    category: 'dashboard',
    pathTemplate: '/api/dashboard/home-overview',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Complete AutoFinex home dashboard KPIs, portfolio health, collections, vehicles, and quick insights.',
  },
  {
    id: 'dashboard.stats',
    category: 'dashboard',
    pathTemplate: '/api/dashboard/stats',
    minRoles: ALL_ROLES,
    queryHints: ['period', 'year', 'month'],
    description: 'Dashboard financial & collection chart statistics.',
  },
  {
    id: 'dashboard.recent_history',
    category: 'dashboard',
    pathTemplate: '/api/dashboard/recent-history',
    minRoles: ALL_ROLES,
    queryHints: ['limit'],
    description: 'Recent payments, loans, and operational transactions.',
  },
  {
    id: 'dashboard.recent_activities',
    category: 'dashboard',
    pathTemplate: '/api/dashboard/recent-activities',
    minRoles: ALL_ROLES,
    queryHints: ['limit'],
    description: 'Recent system activity log entries in the company.',
  },
  {
    id: 'dashboard.monthly_income',
    category: 'dashboard',
    pathTemplate: '/api/dashboard/monthly-income-breakdown',
    minRoles: STAFF_UP,
    queryHints: ['month', 'year'],
    description: 'Monthly income breakdown (interest, principal, penalty, charges).',
  },
  {
    id: 'dashboard.monthly_outcome',
    category: 'dashboard',
    pathTemplate: '/api/dashboard/monthly-outcome-breakdown',
    minRoles: STAFF_UP,
    queryHints: ['month', 'year'],
    description: 'Monthly outflow/outcome breakdown (disbursements, office & vehicle expenses).',
  },
  {
    id: 'company.profile',
    category: 'company',
    pathTemplate: '/api/finance/profile',
    minRoles: ALL_ROLES,
    queryHints: [],
    description:
      'Current finance company profile: company name, owner name, phone numbers, address, total_customers, active_loans, total_loan_amount, and total_payments.',
  },
  {
    id: 'company.default_address',
    category: 'company',
    pathTemplate: '/api/finance/default-address',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Default city, district, and state of the finance company.',
  },
  {
    id: 'company.address',
    category: 'company',
    pathTemplate: '/api/finance/:id/address',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Full structured address of the current finance company.',
  },
  {
    id: 'company.banks',
    category: 'company',
    pathTemplate: '/api/finance/banks',
    minRoles: OWNER_ONLY,
    queryHints: [],
    description: 'Company bank accounts, IFSC, UPI IDs, and balances (Owner only).',
  },
  {
    id: 'company.allowed_finances',
    category: 'company',
    pathTemplate: '/api/finance/allowed-finances',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Finance companies accessible to the current authenticated user.',
  },

  // ─── Payments & Collection Reports ─────────────────────────────────────────
  {
    id: 'payments.report',
    category: 'payments',
    pathTemplate: '/api/payments/report',
    minRoles: ALL_ROLES,
    queryHints: ['startDate', 'endDate', 'paymentMode', 'collectedBy', 'search'],
    description: 'Filtered payment collection report across date range, collector, or payment mode.',
  },
  {
    id: 'payments.bill_report',
    category: 'payments',
    pathTemplate: '/api/payments/bill-report',
    minRoles: ALL_ROLES,
    queryHints: ['startDate', 'endDate', 'billFrom', 'billTo', 'paymentMode', 'collectedBy'],
    description: 'Receipt / bill-number-wise collection report with totals.',
  },
  {
    id: 'payments.details',
    category: 'payments',
    pathTemplate: '/api/payments/details',
    minRoles: ALL_ROLES,
    queryHints: ['date', 'startDate', 'endDate', 'page', 'limit'],
    description: 'Detailed payment entries with customer, vehicle, collector, and split payment modes.',
  },
  {
    id: 'payments.customer_search',
    category: 'payments',
    pathTemplate: '/api/payments/customers/search',
    minRoles: ALL_ROLES,
    queryHints: ['type', 'query'],
    description:
      'Tenant-isolated customer lookup by `type` ("hpl" | "vehicle" | "contact") and `query` value; returns customer, vehicle_number, contact_numbers, dueAmount, and lastDueDate.',
  },
  {
    id: 'payments.customer_payments',
    category: 'payments',
    pathTemplate: '/api/payments/customers/:customerId/payments',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Payment schedule and receipt list for a specific customer.',
  },

  // ─── Vehicles & Godowns ────────────────────────────────────────────────────
  {
    id: 'vehicles.list',
    category: 'vehicles',
    pathTemplate: '/api/vehicles',
    minRoles: ALL_ROLES,
    queryHints: ['status', 'deal_type', 'search'],
    description: 'Vehicle inventory & financed vehicles list with plate, brand, model, RC, FC, insurance expiry, and prices.',
  },
  {
    id: 'vehicles.availability',
    category: 'vehicles',
    pathTemplate: '/api/vehicles/availability',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Available / in-stock vehicles ready for sale or financing.',
  },
  {
    id: 'vehicles.catalog_info',
    category: 'vehicles',
    pathTemplate: '/api/vehicles/info',
    minRoles: ALL_ROLES,
    queryHints: ['brand', 'vehicle_type'],
    description: 'Master vehicle brand/model specifications catalog.',
  },
  {
    id: 'vehicles.search',
    category: 'vehicles',
    pathTemplate: '/api/vehicles/search/:query',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Search vehicles in this company by plate number, model, or chassis/engine substring.',
  },
  {
    id: 'vehicles.detail',
    category: 'vehicles',
    pathTemplate: '/api/vehicles/:id',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Full details of a single vehicle by vehicle UUID.',
  },
  {
    id: 'vehicles.expenses',
    category: 'vehicles',
    pathTemplate: '/api/vehicles/:id/expenses',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Refurbishment/maintenance expenses recorded for a specific vehicle.',
  },
  {
    id: 'godowns.list',
    category: 'godowns',
    pathTemplate: '/api/godowns',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'All godowns / yards in the company with address, contact person, contact number, and vehicle counts.',
  },
  {
    id: 'godowns.active',
    category: 'godowns',
    pathTemplate: '/api/godowns/active',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Active godowns list.',
  },
  {
    id: 'godowns.detail',
    category: 'godowns',
    pathTemplate: '/api/godowns/detail',
    minRoles: ALL_ROLES,
    queryHints: ['id'],
    description: 'Single godown detail by query parameter `id`.',
  },
  {
    id: 'godowns.seized_vehicles',
    category: 'godowns',
    pathTemplate: '/api/godowns/seized-vehicles',
    minRoles: ALL_ROLES,
    queryHints: ['godownId', 'status'],
    description: 'Seized vehicles currently parked in godowns with customer HPL, plate, seizing date, and charges.',
  },

  // ─── Office Expenses ───────────────────────────────────────────────────────
  {
    id: 'expenses.list',
    category: 'expenses',
    pathTemplate: '/api/expenses',
    minRoles: STAFF_UP,
    queryHints: ['startDate', 'endDate', 'category', 'transaction_type'],
    description: 'Office expenses and income entries with category, description, date, amount, and entered_by.',
  },
  {
    id: 'expenses.staff',
    category: 'expenses',
    pathTemplate: '/api/expenses/staff',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Staff list associated with office expense entries.',
  },

  // ─── Collection Agents, Run-Sheets & Area Allocations ──────────────────────
  {
    id: 'agents.assigned_customers',
    category: 'agents',
    pathTemplate: '/api/agent-assignments/customers',
    minRoles: ALL_ROLES,
    queryHints: ['agentId', 'status', 'search'],
    description: 'Customers assigned to collection agents with status, priority, and due amounts.',
  },
  {
    id: 'agents.list',
    category: 'agents',
    pathTemplate: '/api/agent-assignments/agents',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Active collection agents and their assigned customer workload counts.',
  },
  {
    id: 'agents.history',
    category: 'agents',
    pathTemplate: '/api/agent-assignments/history',
    minRoles: STAFF_UP,
    queryHints: ['startDate', 'endDate', 'agentId'],
    description: 'Agent collection assignment completion history.',
  },
  {
    id: 'agents.history_details',
    category: 'agents',
    pathTemplate: '/api/agent-assignments/history/:agentId/details',
    minRoles: ALL_ROLES,
    queryHints: ['startDate', 'endDate'],
    description: 'Detailed assignment history for a specific agent.',
  },
  {
    id: 'agents.run_sheet',
    category: 'agents',
    pathTemplate: '/api/agent-assignments/agents/:agentId/run-sheet',
    minRoles: ALL_ROLES,
    queryHints: ['date'],
    description: 'Daily collection run-sheet of customers assigned to a specific agent.',
  },
  {
    id: 'agents.area_allocations',
    category: 'agents',
    pathTemplate: '/api/agents/area-allocations',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Village/city/area allocations mapped to each collection agent.',
  },
  {
    id: 'agents.active_area_agents',
    category: 'agents',
    pathTemplate: '/api/agents/area-allocations/agents',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Active agents eligible for area allocation.',
  },
  {
    id: 'agents.available_areas',
    category: 'agents',
    pathTemplate: '/api/agents/area-allocations/available-areas',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Distinct customer villages/cities/areas in the company.',
  },

  // ─── Accounting: Ledgers, Vouchers, Daybook & Financial Reports ────────────
  {
    id: 'accounting.ledgers',
    category: 'accounting',
    pathTemplate: '/api/ledger/list',
    minRoles: ADMIN_UP,
    queryHints: ['groupId', 'search'],
    description: 'All accounting ledgers and closing Dr/Cr balances.',
  },
  {
    id: 'accounting.ledger_summary',
    category: 'accounting',
    pathTemplate: '/api/ledger/summary',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'High-level summary of accounting ledgers, cash, and bank balances.',
  },
  {
    id: 'accounting.ledger_groups',
    category: 'accounting',
    pathTemplate: '/api/ledger-groups/list',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Accounting ledger groups hierarchy (Assets, Liabilities, Income, Expenses).',
  },
  {
    id: 'accounting.ledger_statement',
    category: 'accounting',
    pathTemplate: '/api/ledger/:id/statement',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate'],
    description: 'Ledger account statement with opening balance, entries, and closing balance.',
  },
  {
    id: 'accounting.ledger_monthly',
    category: 'accounting',
    pathTemplate: '/api/ledger/:id/monthly',
    minRoles: ADMIN_UP,
    queryHints: ['financialYear'],
    description: 'Month-by-month debit/credit summary for a specific ledger.',
  },
  {
    id: 'accounting.ledger_details',
    category: 'accounting',
    pathTemplate: '/api/ledger/:ledgerId/details',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Metadata and balance details for a single ledger.',
  },
  {
    id: 'accounting.vouchers',
    category: 'accounting',
    pathTemplate: '/api/vouchers/list',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate', 'voucherType', 'search'],
    description: 'Accounting vouchers list (Receipt, Payment, Contra, Journal).',
  },
  {
    id: 'accounting.voucher_types',
    category: 'accounting',
    pathTemplate: '/api/vouchers/types',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Configured accounting voucher types.',
  },
  {
    id: 'accounting.daybook_transactions',
    category: 'accounting',
    pathTemplate: '/api/daybook/transactions',
    minRoles: ADMIN_UP,
    queryHints: ['date', 'fromDate', 'toDate', 'voucherType'],
    description: 'Daybook accounting transactions for a date or date range.',
  },
  {
    id: 'accounting.daybook_voucher',
    category: 'accounting',
    pathTemplate: '/api/daybook/voucher/:voucherNumber',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Single voucher Dr/Cr entries by voucher number.',
  },
  {
    id: 'reports.trial_balance',
    category: 'reports',
    pathTemplate: '/api/reports/trial-balance',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate', 'asOfDate'],
    description: 'Trial Balance accounting report.',
  },
  {
    id: 'reports.daybook',
    category: 'reports',
    pathTemplate: '/api/reports/daybook',
    minRoles: ADMIN_UP,
    queryHints: ['date', 'fromDate', 'toDate'],
    description: 'Accounting Day Book report.',
  },
  {
    id: 'reports.pnl',
    category: 'reports',
    pathTemplate: '/api/reports/pnl',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate'],
    description: 'Profit and Loss (P&L) statement for the company.',
  },
  {
    id: 'reports.balance_sheet',
    category: 'reports',
    pathTemplate: '/api/reports/balance-sheet',
    minRoles: ADMIN_UP,
    queryHints: ['asOfDate', 'toDate'],
    description: 'Balance Sheet (Assets & Liabilities) statement.',
  },
  {
    id: 'reports.cash_flow',
    category: 'reports',
    pathTemplate: '/api/reports/cash-flow',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate'],
    description: 'Cash Flow inflow/outflow summary report.',
  },
  {
    id: 'reports.balances',
    category: 'reports',
    pathTemplate: '/api/reports/balances',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Cash-in-hand and bank account closing balances.',
  },
  {
    id: 'reports.charges',
    category: 'reports',
    pathTemplate: '/api/reports/charges',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate'],
    description: 'Documentation charges, penalties, and fee income report.',
  },
  {
    id: 'reports.compliance',
    category: 'reports',
    pathTemplate: '/api/reports/compliance',
    minRoles: ADMIN_UP,
    queryHints: [],
    description: 'Audit & accounting compliance health report.',
  },
  {
    id: 'reports.demand',
    category: 'reports',
    pathTemplate: '/api/reports/demand',
    minRoles: STAFF_UP,
    queryHints: ['month', 'year', 'fromDate', 'toDate'],
    description: 'EMI Demand vs Collection efficiency report.',
  },
  {
    id: 'reports.business',
    category: 'reports',
    pathTemplate: '/api/reports/business',
    minRoles: ADMIN_UP,
    queryHints: ['fromDate', 'toDate'],
    description: 'Overall business performance & portfolio yield report.',
  },

  // ─── Risk, Alerts & Customer Locator ───────────────────────────────────────
  {
    id: 'risk.alerts',
    category: 'risk',
    pathTemplate: '/api/risk/alerts',
    minRoles: ALL_ROLES,
    queryHints: ['severity', 'search'],
    description: 'Customer overdue/default risk alerts list with risk level and due metrics.',
  },
  {
    id: 'risk.locator',
    category: 'risk',
    pathTemplate: '/api/risk/locator',
    minRoles: ALL_ROLES,
    queryHints: ['search', 'area', 'riskLevel'],
    description: 'Customer Locator track data with customer addresses, coordinates, areas, and overdue risk.',
  },
  {
    id: 'risk.customer_deep_view',
    category: 'risk',
    pathTemplate: '/api/risk/customers/:customerId/deep-view',
    minRoles: ALL_ROLES,
    queryHints: [],
    description: 'Deep credit/payment behavior & risk profile for a single customer.',
  },
  {
    id: 'risk.due_analysis',
    category: 'risk',
    pathTemplate: '/api/risk/due-analysis',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Portfolio aging buckets and due risk breakdown.',
  },
  {
    id: 'risk.credit_check',
    category: 'risk',
    pathTemplate: '/api/risk/credit-check',
    minRoles: STAFF_UP,
    queryHints: ['phone', 'aadhar', 'vehicleNumber'],
    description: 'Internal borrower/guarantor repeat-loan credit check.',
  },

  // ─── Voice AI Telecalling Analytics ────────────────────────────────────────
  {
    id: 'telecalling.dashboard',
    category: 'telecalling',
    pathTemplate: '/api/ai/dashboard',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Voice AI telecalling dashboard summary (calls made, connected, PTPs, outcomes).',
  },
  {
    id: 'telecalling.insights',
    category: 'telecalling',
    pathTemplate: '/api/ai/insights',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Telecalling AI insights and recovery analytics.',
  },
  {
    id: 'telecalling.logs',
    category: 'telecalling',
    pathTemplate: '/api/ai/logs',
    minRoles: STAFF_UP,
    queryHints: ['limit', 'status'],
    description: 'Recent AI telecalling call logs and dispositions.',
  },
  {
    id: 'telecalling.leads',
    category: 'telecalling',
    pathTemplate: '/api/ai/leads',
    minRoles: STAFF_UP,
    queryHints: ['status', 'search'],
    description: 'Telecalling overdue customer lead queue.',
  },
  {
    id: 'telecalling.active_queue',
    category: 'telecalling',
    pathTemplate: '/api/ai/calls/queue/active',
    minRoles: STAFF_UP,
    queryHints: [],
    description: 'Currently active/queued AI outbound calls.',
  },
];

const BACKEND_GET_API_CATALOG = Object.freeze(
  RAW_CATALOG.map((entry) => {
    const compiled = compilePathTemplate(entry.pathTemplate);
    return Object.freeze({
      ...entry,
      method: 'GET',
      regex: compiled.regex,
      paramNames: Object.freeze(compiled.paramNames),
    });
  })
);

const FORBIDDEN_QUERY_OVERRIDE_KEYS = new Set([
  'financeid',
  'finance_id',
  'ownerid',
  'owner_id',
  'companyid',
  'company_id',
  'token',
  'ownertoken',
  'accesstoken',
  'refreshtoken',
]);

/**
 * Validates and normalizes an LLM-requested `GET` API call against the allowlist,
 * role permissions, and tenant-isolation rules.
 */
function validateAndNormalizeGetApiRequest(scope, rawInput = {}) {
  if (!scope || !isValidUuid(scope.financeId)) {
    throw new FinanceScopeError(
      'INVALID_FINANCE_ID',
      'Authenticated financeId scope is required to invoke backend GET APIs.',
      403
    );
  }

  if (rawInput.method !== undefined && String(rawInput.method).trim().toUpperCase() !== 'GET') {
    throw new BackendGetApiValidationError(
      'FORBIDDEN_HTTP_METHOD',
      'Only read-only HTTP GET requests are permitted.',
      403
    );
  }

  const rawEndpoint = typeof rawInput.endpoint === 'string' ? rawInput.endpoint.trim() : '';
  if (!rawEndpoint) {
    throw new BackendGetApiValidationError(
      'MISSING_ENDPOINT',
      'Parameter "endpoint" is required (e.g. "/api/customers/105" or "/api/auth/allUsers").',
      400
    );
  }

  if (rawEndpoint.length > 500 || /[\0\r\n\\]/.test(rawEndpoint)) {
    throw new BackendGetApiValidationError('INVALID_ENDPOINT', 'Malformed API endpoint path.', 400);
  }

  // Block absolute/external URLs or protocol-relative URLs (SSRF prevention)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawEndpoint) || rawEndpoint.startsWith('//')) {
    throw new BackendGetApiValidationError(
      'EXTERNAL_URL_FORBIDDEN',
      'External URLs are forbidden; only internal AutoFinex "/api/..." GET paths are allowed.',
      403
    );
  }

  // Block raw or URL-encoded path traversal before URL normalization collapses segments
  let decodedCheck = rawEndpoint;
  try {
    decodedCheck = decodeURIComponent(rawEndpoint);
  } catch {
    throw new BackendGetApiValidationError('INVALID_ENDPOINT_ENCODING', 'Invalid URL encoding in endpoint.', 400);
  }
  if (/(?:^|\/)\.\.(?:\/|$|\?)/.test(rawEndpoint) || /(?:^|\/)\.\.(?:\/|$|\?)/.test(decodedCheck)) {
    throw new BackendGetApiValidationError('PATH_TRAVERSAL_FORBIDDEN', 'Path traversal ("..") is forbidden.', 403);
  }

  const withLeadingSlash = rawEndpoint.startsWith('/') ? rawEndpoint : `/${rawEndpoint}`;
  const parsed = new URL(withLeadingSlash, 'http://autofinex.internal');
  let pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Check explicit blocklist BEFORE auto-prefixing `/api` (catches `/payments`, `/lastduedate`, etc.)
  for (const rule of EXPLICITLY_BLOCKED_PATH_RULES) {
    if (rule.pattern.test(pathname)) {
      throw new BackendGetApiValidationError('FORBIDDEN_BACKEND_ENDPOINT', rule.reason, 403);
    }
  }

  // Tolerate harmless omission of `/api` prefix for valid catalog endpoints (e.g. `/customers/105`)
  if (!pathname.startsWith('/api/')) {
    pathname = `/api${pathname}`;
  }

  // Re-check explicit blocklist after `/api` normalization (catches `customers/search`, `ai/assistant/health`, etc.)
  for (const rule of EXPLICITLY_BLOCKED_PATH_RULES) {
    if (rule.pattern.test(pathname)) {
      throw new BackendGetApiValidationError('FORBIDDEN_BACKEND_ENDPOINT', rule.reason, 403);
    }
  }

  const matchedEntry = BACKEND_GET_API_CATALOG.find((entry) => entry.regex.test(pathname));
  if (!matchedEntry) {
    throw new BackendGetApiValidationError(
      'UNREGISTERED_GET_ENDPOINT',
      `Endpoint "${pathname}" is not an approved AutoFinex GET route. Call list_backend_get_apis to inspect valid endpoints.`,
      404
    );
  }

  const callerRole = scope.isOwner ? 'owner' : String(scope.role || 'staff').toLowerCase();
  if (!matchedEntry.minRoles.includes(callerRole)) {
    throw new BackendGetApiValidationError(
      'ENDPOINT_ROLE_FORBIDDEN',
      `Role "${callerRole}" does not have permission to read "${matchedEntry.pathTemplate}".`,
      403
    );
  }

  // Enforce tenant binding on `/api/finance/:id/address`
  if (matchedEntry.id === 'company.address') {
    pathname = `/api/finance/${encodeURIComponent(String(scope.financeId))}/address`;
  }

  // Merge inline URL query params + structured `queryParams`, stripping any tenant/token overrides
  const cleanSearchParams = new URLSearchParams();
  for (const [k, v] of parsed.searchParams.entries()) {
    if (!FORBIDDEN_QUERY_OVERRIDE_KEYS.has(k.toLowerCase()) && v !== undefined && v !== null && String(v) !== '') {
      cleanSearchParams.set(k, String(v).slice(0, 200));
    }
  }

  let extraQuery = rawInput.queryParams;
  if (typeof extraQuery === 'string' && extraQuery.trim().startsWith('{')) {
    try {
      extraQuery = JSON.parse(extraQuery);
    } catch {
      extraQuery = null;
    }
  }
  if (extraQuery && typeof extraQuery === 'object' && !Array.isArray(extraQuery)) {
    for (const [k, v] of Object.entries(extraQuery)) {
      if (!k || FORBIDDEN_QUERY_OVERRIDE_KEYS.has(k.toLowerCase())) continue;
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        cleanSearchParams.set(String(k).slice(0, 64), String(v).slice(0, 200));
      }
    }
  }

  const sortedQuery = new URLSearchParams(
    Array.from(cleanSearchParams.entries()).sort(([a], [b]) => a.localeCompare(b))
  );
  const queryString = sortedQuery.toString();
  const fullPathWithQuery = queryString ? `${pathname}?${queryString}` : pathname;

  return {
    entry: matchedEntry,
    method: 'GET',
    pathname,
    queryString,
    fullPathWithQuery,
    queryObject: Object.fromEntries(sortedQuery.entries()),
  };
}

/**
 * Searches the approved AutoFinex `GET` endpoint catalog by category and/or keyword,
 * filtered to endpoints the caller's role is permitted to access.
 */
function searchBackendGetApiCatalog(scope, { category = '', keyword = '' } = {}) {
  const callerRole = scope?.isOwner ? 'owner' : String(scope?.role || 'staff').toLowerCase();
  const normCategory = String(category || '').trim().toLowerCase();
  const normKeyword = String(keyword || '').trim().toLowerCase();

  const matches = BACKEND_GET_API_CATALOG.filter((entry) => {
    if (!entry.minRoles.includes(callerRole)) return false;
    if (normCategory && entry.category !== normCategory) return false;
    if (normKeyword) {
      const haystack = `${entry.id} ${entry.category} ${entry.pathTemplate} ${entry.description} ${entry.queryHints.join(' ')}`.toLowerCase();
      return normKeyword.split(/\s+/).every((tok) => haystack.includes(tok));
    }
    return true;
  }).map((entry) => ({
    endpoint: entry.pathTemplate,
    category: entry.category,
    queryParams: entry.queryHints,
    description: entry.description,
  }));

  return {
    totalEndpoints: matches.length,
    categories: Array.from(new Set(BACKEND_GET_API_CATALOG.filter((e) => e.minRoles.includes(callerRole)).map((e) => e.category))),
    endpoints: matches,
  };
}

/**
 * Compact cheat-sheet injected into the Gemini system instruction so 95% of questions
 * call the exact right `GET` endpoint in a single pass without needing discovery first.
 */
function buildBackendGetApiCheatSheet(role = 'staff', todayIST = '') {
  const normRole = String(role || 'staff').toLowerCase();
  const isOwnerOrAdmin = normRole === 'owner' || normRole === 'admin';
  const isStaffUp = isOwnerOrAdmin || normRole === 'staff';

  const lines = [
    'BACKEND READ-ONLY `GET` API ACCESS (`call_backend_get_api` & `list_backend_get_apis`):',
    '- You have authenticated read-only access to AutoFinex backend `GET` endpoints. Pass `endpoint` (and optional `queryParams` or `searchFilter`) to `call_backend_get_api`, read the returned JSON carefully (always check `total`, `totalCount`, `matchedCount`, or `summary` for exact counts!), and answer naturally.',
    '- KEY `GET` ENDPOINTS READY TO USE IMMEDIATELY:',
    '  * Customer Full Details, Address & Phone Numbers (by HPL no OR UUID): `GET /api/customers/:customerId` (e.g. `/api/customers/105` -> returns `full_address`, `contacts` [all phone numbers], `guardian` [guardian_phone & address], `loan`, `vehicle`, `payments`).',
    '  * Search / Filter All Customers (by name, village, street, phone, plate, broker): `GET /api/customers` with `searchFilter: "<name/village/phone/plate>"`.',
    '  * Fast Customer Lookup by HPL / Vehicle / Phone: `search_customer_loan_status` OR `GET /api/payments/customers/search` (`queryParams: { type: "hpl"|"vehicle"|"contact", query: "..." }`).',
    '  * Customer Payments / History / Seizing: `GET /api/customers/:customerId/payments`, `GET /api/customers/:customerId/history`, `GET /api/customers/:id/seizing`.',
    '  * Pending & Overdue EMI Lists: `GET /api/customers/pending-collections`, `GET /api/customers/unpaidcustomers`.',
    '  * Total Company Staff / Users & Roles: `GET /api/auth/allUsers` (returns `total` staff count + `users` array with `username`, `role`, `phone_no`, `last_accessed_at`).',
    '  * Staff Dashboard Overview: `GET /api/dashboard/staff-overview` & Home Overview: `GET /api/dashboard/home-overview`.',
    '  * Company Profile & Totals: `GET /api/finance/profile`.',
    '  * Vehicles & Godowns / Seized Vehicles: `GET /api/vehicles`, `GET /api/vehicles/availability`, `GET /api/vehicles/search/:query`, `GET /api/godowns`, `GET /api/godowns/seized-vehicles`.',
    '  * Payments & Bill Reports: `GET /api/payments/report` (`startDate`, `endDate`), `GET /api/payments/bill-report`, `GET /api/payments/details`.',
    '  * Agents, Run-Sheets & Area Allocations: `GET /api/agent-assignments/agents`, `GET /api/agent-assignments/customers`, `GET /api/agents/area-allocations`, `GET /api/agents/area-allocations/available-areas`.',
    '  * Risk Alerts & Customer Locator: `GET /api/risk/alerts`, `GET /api/risk/locator`, `GET /api/risk/customers/:customerId/deep-view`.',
  ];

  if (isStaffUp) {
    lines.push(
      '  * KYC Pending & Terminated Accounts: `GET /api/customers/kyc-pending`, `GET /api/customers/terminated-accounts`.',
      '  * Office Expenses & Demand Report: `GET /api/expenses` (`startDate`, `endDate`), `GET /api/reports/demand`.',
      '  * Voice AI Telecalling Stats & Leads: `GET /api/ai/dashboard`, `GET /api/ai/insights`, `GET /api/ai/leads`, `GET /api/ai/logs`.'
    );
  }

  if (isOwnerOrAdmin) {
    const dateExample = todayIST || 'YYYY-MM-DD';
    lines.push(
      `  * Staff Logged In / Active Today or Date Range: \`GET /api/agents/login-report\` with \`queryParams: { dateFrom: "${dateExample}", dateTo: "${dateExample}" }\`.`,
      '  * Accounting, Ledgers, Daybook & Financial Reports: `GET /api/ledger/list`, `GET /api/ledger/summary`, `GET /api/ledger/:id/statement`, `GET /api/vouchers/list`, `GET /api/daybook/transactions`, `GET /api/reports/pnl`, `GET /api/reports/balance-sheet`, `GET /api/reports/trial-balance`, `GET /api/reports/cash-flow`, `GET /api/reports/balances`, `GET /api/reports/business`.'
    );
  }

  if (normRole === 'owner') {
    lines.push('  * Company Bank Accounts (Owner): `GET /api/finance/banks`.');
  }

  lines.push(
    '- For any other module or endpoint parameter check, call `list_backend_get_apis` first and then `call_backend_get_api`.'
  );

  return lines.join('\n');
}

module.exports = {
  BACKEND_GET_API_CATALOG,
  EXPLICITLY_BLOCKED_PATH_RULES,
  BackendGetApiValidationError,
  validateAndNormalizeGetApiRequest,
  searchBackendGetApiCatalog,
  buildBackendGetApiCheatSheet,
};

