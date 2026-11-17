'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-user-profile-principal-jwt-secret-2026';
process.env.JWT_REFRESH_SECRET = 'test-user-profile-principal-refresh-secret-2026';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const bcrypt = require('bcryptjs');

const { db } = require('../../config/database.config');
const {
  issueOwnerLicenseToken,
  issueUserAccessToken,
} = require('../auth/sessionSecurity.service');
const userProfileRoutes = require('./userProfile.routes');
const {
  getUserProfileOverview,
  getIstDateString,
} = require('./userProfile.service');

const FIXED_NOW = new Date('2026-11-17T06:00:00.000Z');

const IDS = {
  owner1: '11111111-1111-4111-8111-111111111111',
  finance1A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  finance1B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',

  // Distinct UUIDs from owner1 to prove users.id !== owner.id resolution
  ownerRoleUser: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  adminUser: '22222222-2222-4222-8222-222222222222',
  staffUser: '33333333-3333-4333-8333-333333333333',
  agentUser: '44444444-4444-4444-8444-444444444444',
  multiCoUser: '55555555-5555-4555-8555-555555555555',
  nullFinUdUser: '66666666-6666-4666-8666-666666666666',
  legacyStaffUser: '77777777-7777-4777-8777-777777777777',

  udOwnerRole: '80000001-0000-4000-8000-000000000001',
  udAdmin: '80000002-0000-4000-8000-000000000002',
  udStaff: '80000003-0000-4000-8000-000000000003',
  udAgent: '80000004-0000-4000-8000-000000000004',
  udMultiCoB: '80000005-0000-4000-8000-000000000005',
  udMultiCoA: '80000006-0000-4000-8000-000000000006',
  udNullFin: '80000007-0000-4000-8000-000000000007',

  cust1: '90000001-0000-4000-8000-000000000001',
  loan1: '91000001-0000-4000-8000-000000000001',
};

function toIstDateOrNull(isoStr) {
  if (!isoStr) return null;
  return getIstDateString(new Date(isoStr));
}

function createFixtureState(hashes) {
  return {
    capturedQueries: [],
    owners: new Map([
      [
        IDS.owner1,
        {
          id: IDS.owner1,
          username: 'RIMI-LIC-001',
          password: hashes.ownerPass,
          is_active: 1,
          created_at: '2024-01-10T05:00:00.000Z',
          password_changed_at: '2026-01-05T05:00:00.000Z',
        },
      ],
    ]),
    finances: new Map([
      [
        IDS.finance1A,
        {
          id: IDS.finance1A,
          finance_name: 'Rimi Alpha Finance',
          owner_id: IDS.owner1,
          is_active: 1,
          created_at: '2024-01-10T05:00:00.000Z',
        },
      ],
      [
        IDS.finance1B,
        {
          id: IDS.finance1B,
          finance_name: 'Rimi Beta Motors',
          owner_id: IDS.owner1,
          is_active: 1,
          created_at: '2024-02-15T05:00:00.000Z',
        },
      ],
    ]),
    users: new Map([
      [
        IDS.ownerRoleUser,
        {
          id: IDS.ownerRoleUser,
          username: 'rajesh_owner',
          email: 'rajesh@rimi.in',
          phone_no: '9998887771',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2025-03-01T05:00:00.000Z',
          password_changed_at: '2026-10-15T05:00:00.000Z',
        },
      ],
      [
        IDS.adminUser,
        {
          id: IDS.adminUser,
          username: 'priya_admin',
          email: 'priya@rimi.in',
          phone_no: '9998887772',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2025-04-01T05:00:00.000Z',
          password_changed_at: '2026-09-10T05:00:00.000Z',
        },
      ],
      [
        IDS.staffUser,
        {
          id: IDS.staffUser,
          username: 'arun_staff',
          email: 'arun@rimi.in',
          phone_no: '9998887773',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2025-05-01T05:00:00.000Z',
          password_changed_at: null,
        },
      ],
      [
        IDS.agentUser,
        {
          id: IDS.agentUser,
          username: 'kumar_agent',
          email: 'kumar@rimi.in',
          phone_no: '9998887774',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2025-06-01T05:00:00.000Z',
          password_changed_at: null,
        },
      ],
      [
        IDS.multiCoUser,
        {
          id: IDS.multiCoUser,
          username: 'meena_multi',
          email: 'meena@rimi.in',
          phone_no: '9998887775',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2025-07-01T05:00:00.000Z',
          password_changed_at: null,
        },
      ],
      [
        IDS.nullFinUdUser,
        {
          id: IDS.nullFinUdUser,
          username: 'karthik_nullfin',
          email: 'karthik@rimi.in',
          phone_no: '9998887776',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2025-08-01T05:00:00.000Z',
          password_changed_at: null,
        },
      ],
      [
        IDS.legacyStaffUser,
        {
          id: IDS.legacyStaffUser,
          username: 'senthil_legacy',
          email: 'senthil@rimi.in',
          phone_no: '9998887777',
          password: hashes.userPass,
          is_active: 1,
          created_at: '2024-06-01T05:00:00.000Z',
          password_changed_at: null,
        },
      ],
    ]),
    memberships: [
      {
        user_id: IDS.ownerRoleUser,
        finance_id: IDS.finance1A,
        role: 'owner',
        is_active: 1,
        assigned_at: '2025-03-01T05:00:00.000Z',
        created_at: '2025-03-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
      {
        user_id: IDS.adminUser,
        finance_id: IDS.finance1A,
        role: 'admin',
        is_active: 1,
        assigned_at: '2025-04-01T05:00:00.000Z',
        created_at: '2025-04-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
      {
        user_id: IDS.staffUser,
        finance_id: IDS.finance1A,
        role: 'staff',
        is_active: 1,
        assigned_at: '2025-05-01T05:00:00.000Z',
        created_at: '2025-05-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
      {
        user_id: IDS.agentUser,
        finance_id: IDS.finance1A,
        role: 'agent',
        is_active: 1,
        assigned_at: '2025-06-01T05:00:00.000Z',
        created_at: '2025-06-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
      {
        user_id: IDS.multiCoUser,
        finance_id: IDS.finance1A,
        role: 'staff',
        is_active: 1,
        assigned_at: '2025-07-01T05:00:00.000Z',
        created_at: '2025-07-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
      {
        user_id: IDS.multiCoUser,
        finance_id: IDS.finance1B,
        role: 'staff',
        is_active: 1,
        assigned_at: '2025-07-01T05:00:00.000Z',
        created_at: '2025-07-01T05:00:00.000Z',
        last_accessed_at: '2026-11-15T10:00:00.000Z',
      },
      {
        user_id: IDS.nullFinUdUser,
        finance_id: IDS.finance1A,
        role: 'agent',
        is_active: 1,
        assigned_at: '2025-08-01T05:00:00.000Z',
        created_at: '2025-08-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
      {
        user_id: IDS.legacyStaffUser,
        finance_id: IDS.finance1A,
        role: 'staff',
        is_active: 1,
        assigned_at: '2024-06-01T05:00:00.000Z',
        created_at: '2024-06-01T05:00:00.000Z',
        last_accessed_at: '2026-11-16T10:00:00.000Z',
      },
    ],
    userDetails: [
      {
        id: IDS.udOwnerRole,
        user_id: IDS.ownerRoleUser,
        finance_id: IDS.finance1A,
        staff_name: 'Rajesh Kumar',
        staff_code: 'OWN-01',
        joining_date: '2025-03-01',
        experience_years: 5,
        education_qualification: 'B.Com',
        photo: 'https://cdn.example.com/rajesh.jpg',
        created_at: '2025-03-01T05:00:00.000Z',
      },
      {
        id: IDS.udAdmin,
        user_id: IDS.adminUser,
        finance_id: IDS.finance1A,
        staff_name: 'Priya Shankar',
        staff_code: 'ADM-01',
        joining_date: '2025-04-01',
        experience_years: 3,
        education_qualification: 'MBA',
        photo: 'https://cdn.example.com/priya.jpg',
        created_at: '2025-04-01T05:00:00.000Z',
      },
      {
        id: IDS.udStaff,
        user_id: IDS.staffUser,
        finance_id: IDS.finance1A,
        staff_name: 'Arun Prakash',
        staff_code: 'STF-01',
        joining_date: '2025-05-01',
        experience_years: 2,
        education_qualification: 'BBA',
        photo: 'https://cdn.example.com/arun.jpg',
        created_at: '2025-05-01T05:00:00.000Z',
      },
      {
        id: IDS.udAgent,
        user_id: IDS.agentUser,
        finance_id: IDS.finance1A,
        staff_name: 'Kumaravel S',
        staff_code: 'AGT-01',
        joining_date: '2025-06-01',
        experience_years: 1,
        education_qualification: 'B.Sc',
        photo: 'https://cdn.example.com/kumar.jpg',
        created_at: '2025-06-01T05:00:00.000Z',
      },
      // Multi-company user: single users_details row created under finance1B (NOT finance1A)
      {
        id: IDS.udMultiCoB,
        user_id: IDS.multiCoUser,
        finance_id: IDS.finance1B,
        staff_name: 'Meena Sundaram',
        staff_code: 'STF-B9',
        joining_date: '2025-07-01',
        experience_years: 4,
        education_qualification: 'M.Com',
        photo: 'https://cdn.example.com/meena.jpg',
        created_at: '2025-07-01T05:00:00.000Z',
      },
      // User whose users_details row has finance_id = null
      {
        id: IDS.udNullFin,
        user_id: IDS.nullFinUdUser,
        finance_id: null,
        staff_name: 'Karthik Narayanan',
        staff_code: 'AGT-NF',
        joining_date: '2025-08-01',
        experience_years: 2,
        education_qualification: 'BCA',
        photo: 'https://cdn.example.com/karthik.jpg',
        created_at: '2025-08-01T05:00:00.000Z',
      },
      // Pre-migration legacy users_details row: user_id IS NULL and users_details.id === users.id
      {
        id: IDS.legacyStaffUser,
        user_id: null,
        finance_id: IDS.finance1A,
        staff_name: 'Senthil Legacy',
        staff_code: 'LEG-01',
        joining_date: '2024-06-01',
        experience_years: 6,
        education_qualification: 'BA',
        photo: 'https://cdn.example.com/senthil.jpg',
        created_at: '2024-06-01T05:00:00.000Z',
      },
    ],
  };
}

function createMockQueryExecutor(getState) {
  return async function mockQuery(rawSql, params = []) {
    const state = getState();
    const sql = String(rawSql || '').replace(/\s+/g, ' ').trim();

    // 1. validateOwnerPrincipal
    if (/SELECT id, username, password, is_active FROM owner WHERE id = \$1/i.test(sql)) {
      const owner = state.owners.get(String(params[0] || ''));
      return { rows: owner ? [owner] : [] };
    }

    // 2. enhancedCheckFinance Branch A finance lookup
    if (/SELECT id, owner_id, is_active FROM finance_detail WHERE id = \$1/i.test(sql)) {
      const fin = state.finances.get(String(params[0] || ''));
      return { rows: fin ? [fin] : [] };
    }

    // 3. validateUserPrincipal user lookup
    if (/SELECT id, username, email, phone_no, password, is_active, created_at FROM users WHERE id = \$1/i.test(sql)) {
      const user = state.users.get(String(params[0] || ''));
      return { rows: user ? [user] : [] };
    }

    // 4. validateUserPrincipal memberships lookup
    if (
      sql.includes('FROM user_allowed_companies uac') &&
      sql.includes('INNER JOIN finance_detail fd ON fd.id = uac.finance_id') &&
      sql.includes('INNER JOIN owner o ON o.id = fd.owner_id')
    ) {
      const userId = String(params[0] || '');
      const rows = state.memberships
        .filter((m) => m.user_id === userId && Number(m.is_active) === 1)
        .map((m) => {
          const fin = state.finances.get(m.finance_id);
          const own = fin ? state.owners.get(fin.owner_id) : null;
          return {
            finance_id: m.finance_id,
            role: m.role,
            login_time_from: null,
            login_time_to: null,
            last_accessed_at: m.last_accessed_at,
            finance_name: fin?.finance_name || null,
            owner_id: fin?.owner_id || null,
            finance_is_active: fin?.is_active ?? 0,
            owner_username: own?.username || null,
            owner_is_active: own?.is_active ?? 0,
          };
        });
      return { rows };
    }

    // 5. userProfile.service.js Section 1: fetchProfileSection
    if (
      sql.includes('FROM finance_detail fd') &&
      (sql.includes('user_last_password_change') || sql.includes('owner_last_password_change'))
    ) {
      const financeId = String(params[0] || '');
      const principalId = String(params[1] || '');
      state.capturedQueries.push({
        section: 'profile',
        financeId,
        principalId,
        params: [...params],
        sql,
      });

      const fin = state.finances.get(financeId);
      if (!fin) return { rows: [] };

      // Determine isOwnerToken parameter if parameterized in SQL
      let isOwnerParam = false;
      if (/\$4::boolean/i.test(sql)) {
        isOwnerParam = Boolean(params[3]);
      } else if (/\$3::boolean/i.test(sql)) {
        isOwnerParam = Boolean(params[2]);
      } else if (/\bJOIN\s+owner\s+o\b/i.test(sql) && !/\bJOIN\s+users\s+u\b/i.test(sql)) {
        isOwnerParam = true;
      }

      // Evaluate users join according to actual SQL predicate
      let matchedUser = null;
      if (/\bJOIN\s+users\s+u\b/i.test(sql)) {
        const hasLegacyOwnerUsernameBranch = /LOWER\(\s*u\.username\s*\)\s*=\s*LOWER\(/i.test(sql);
        const gatedOnNotOwner = /\$\d::boolean\s*=\s*false\s+AND\s+u\.id\s*=\s*\$2::uuid/i.test(sql);

        if (hasLegacyOwnerUsernameBranch && isOwnerParam) {
          const ownerUsernameParam = params[2] ? String(params[2]).toLowerCase() : null;
          matchedUser = state.users.get(principalId) || null;
          if (!matchedUser && ownerUsernameParam) {
            for (const candidate of state.users.values()) {
              const hasMembership = state.memberships.some(
                (m) => m.user_id === candidate.id && m.finance_id === financeId
              );
              if (candidate.username.toLowerCase() === ownerUsernameParam && hasMembership) {
                matchedUser = candidate;
                break;
              }
            }
          }
        } else if (gatedOnNotOwner) {
          matchedUser = !isOwnerParam ? state.users.get(principalId) || null : null;
        } else {
          matchedUser = state.users.get(principalId) || null;
        }
      }

      // Evaluate owner join according to actual SQL predicate
      let matchedOwner = null;
      if (/\bJOIN\s+owner\s+o\b/i.test(sql)) {
        const gatedOnOwner = /\$\d::boolean\s*=\s*true\s+AND\s+o\.id\s*=\s*\$2::uuid/i.test(sql);
        if (gatedOnOwner) {
          matchedOwner = isOwnerParam ? state.owners.get(principalId) || null : null;
        } else {
          matchedOwner = state.owners.get(principalId) || null;
        }
      }

      const matchedUac = matchedUser
        ? state.memberships.find(
            (m) => m.user_id === matchedUser.id && m.finance_id === financeId
          ) || null
        : null;

      // Evaluate users_details lateral subquery faithfully against actual SQL WHERE + ORDER BY
      let matchedUd = null;
      const udBlockMatch = sql.match(/FROM\s+users_details\s+ud_sub([\s\S]*?)LIMIT\s+1/i);
      if (matchedUser && udBlockMatch) {
        const udClause = udBlockMatch[1];
        const [wherePart = '', orderPart = ''] = udClause.split(/ORDER\s+BY/i);
        const requiresSameFinanceInWhere = /ud_sub\.finance_id\s*=\s*fd\.id/i.test(wherePart);
        const allowsLegacyIdMatch = /ud_sub\.id\s*=\s*u\.id/i.test(wherePart);
        const ordersByCurrentFinanceFirst = /ud_sub\.finance_id\s*=\s*fd\.id/i.test(orderPart);
        const ordersByUserIdMatch = /ud_sub\.user_id\s*=\s*u\.id/i.test(orderPart);

        const candidates = state.userDetails.filter((d) => {
          const userMatches =
            d.user_id === matchedUser.id || (allowsLegacyIdMatch && d.id === matchedUser.id);
          if (!userMatches) return false;
          if (requiresSameFinanceInWhere && d.finance_id !== financeId) return false;
          return true;
        });

        candidates.sort((a, b) => {
          if (ordersByCurrentFinanceFirst) {
            // PostgreSQL `(ud_sub.finance_id = fd.id) DESC NULLS LAST`: true (2) > false (1) > null (0)
            const rankFin = (row) => {
              if (row.finance_id === null || row.finance_id === undefined) return 0;
              return row.finance_id === financeId ? 2 : 1;
            };
            const diffFin = rankFin(b) - rankFin(a);
            if (diffFin !== 0) return diffFin;
          }
          if (ordersByUserIdMatch) {
            const diffUid =
              (b.user_id === matchedUser.id ? 1 : 0) - (a.user_id === matchedUser.id ? 1 : 0);
            if (diffUid !== 0) return diffUid;
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        matchedUd = candidates[0] || null;
      }

      return {
        rows: [
          {
            finance_id: fin.id,
            finance_name: fin.finance_name,
            user_id: matchedUser?.id || null,
            user_username: matchedUser?.username || null,
            user_email: matchedUser?.email || null,
            user_phone: matchedUser?.phone_no || null,
            user_is_active: matchedUser?.is_active ?? null,
            user_created_date: toIstDateOrNull(matchedUser?.created_at),
            user_last_password_change: toIstDateOrNull(matchedUser?.password_changed_at),
            owner_id: matchedOwner?.id || null,
            owner_username: matchedOwner?.username || null,
            owner_is_active: matchedOwner?.is_active ?? null,
            owner_created_date: toIstDateOrNull(matchedOwner?.created_at),
            owner_last_password_change: toIstDateOrNull(matchedOwner?.password_changed_at),
            company_role: matchedUac?.role || null,
            company_is_active: matchedUac?.is_active ?? null,
            company_assigned_date: toIstDateOrNull(matchedUac?.assigned_at),
            company_created_date: toIstDateOrNull(matchedUac?.created_at),
            staff_name: matchedUd?.staff_name || null,
            staff_code: matchedUd?.staff_code || null,
            ud_joining_date: matchedUd?.joining_date || null,
            experience_years: matchedUd?.experience_years ?? null,
            education_qualification: matchedUd?.education_qualification || null,
            photo: matchedUd?.photo || null,
            house_no: null,
            street: null,
            street_name: null,
            village: null,
            land_mark: null,
            raw_address: null,
            city: null,
            district: null,
            state: null,
            pincode: null,
            last_login_timestamptz: matchedUser ? '2026-11-17T04:00:00.000Z' : null,
          },
        ],
      };
    }

    // 6. Section 2: fetchPerformanceSection
    if (sql.includes('attributed_payments') && sql.includes('assign_evaluated')) {
      const financeId = String(params[0] || '');
      const userId = String(params[1] || '');
      state.capturedQueries.push({ section: 'performance', financeId, userId });
      return {
        rows: [
          {
            total_customers: 4,
            assigned_loans: 4,
            total_collections: 25000,
            monthly_performance: 75,
            recovery_rate: 80,
            collection_trend: [{ monthKey: '2026-11', month: 'Nov', amount: 25000 }],
            performance_monthly: [{ monthKey: '2026-11', month: 'Nov', rate: 75 }],
          },
        ],
      };
    }

    // 7. Section 3: fetchActivityLogSection
    if (sql.includes('evaluated_sessions') && sql.includes('FROM agent_login_sessions als')) {
      const userId = String(params[0] || '');
      state.capturedQueries.push({ section: 'activityLog', userId });
      return {
        rows: [
          {
            date: '2026-11-17',
            day: 'Tue',
            first_login: '2026-11-17T04:00:00.000Z',
            last_logout: null,
            is_active_now: true,
            duration_minutes: 120,
            latest_device_raw: 'Linux Desktop Chrome',
            latest_ip: '127.0.0.1',
            sessions: 1,
          },
        ],
      };
    }

    // 8. Section 4: fetchAssignedDataSection
    if (sql.includes('areas_cte') && sql.includes('eligible_assignments')) {
      const financeId = String(params[0] || '');
      const userId = String(params[1] || '');
      state.capturedQueries.push({ section: 'assignedData', financeId, userId });
      return {
        rows: [
          {
            assigned_areas: ['Anna Nagar'],
            customer_count: 1,
            loan_count: 1,
            customers_json: [
              {
                customer_id: IDS.cust1,
                hplno: '101',
                customer_name: 'Murugan K',
                loan_status: 'active',
                assigned_at: '2026-11-10T05:00:00.000Z',
                loan_id: IDS.loan1,
                hp_amount: 50000,
                net_payable: 60000,
                total_installments: 12,
                installment_amount: 5000,
                hp_date: '2026-06-01',
                first_due_date: '2026-07-01',
                total_paid: 25000,
                installments_paid: 5,
              },
            ],
          },
        ],
      };
    }

    return { rows: [] };
  };
}

function httpGetJson(baseUrl, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let body = null;
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('UserProfile principal resolution & users_details scoping', () => {
  let origDbQuery;
  let passwordHashes;
  let state;
  let server;
  let baseUrl;

  before(async () => {
    passwordHashes = {
      ownerPass: await bcrypt.hash('OwnerSecret#123', 4),
      userPass: await bcrypt.hash('UserSecret#123', 4),
    };
    state = createFixtureState(passwordHashes);

    origDbQuery = db.query;
    db.query = createMockQueryExecutor(() => state);

    const app = express();
    app.use(express.json());
    app.use('/api/user', userProfileRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(() => {
    state = createFixtureState(passwordHashes);
  });

  after(async () => {
    db.query = origDbQuery;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('Case A: user with role="owner" (users.id !== owner.id, users.username !== owner.username) resolves users data and queries sections 2-4 with users.id', async () => {
    const ownerRoleUserRow = state.users.get(IDS.ownerRoleUser);
    const token = issueUserAccessToken({
      user: ownerRoleUserRow,
      role: 'owner',
      allowedCompanies: [IDS.finance1A],
      currentFinanceId: IDS.finance1A,
      financeName: 'Rimi Alpha Finance',
      authMode: 'direct_user',
    });

    const res = await httpGetJson(baseUrl, '/api/user/profile-overview', {
      Authorization: `Bearer ${token}`,
      'Finance-ID': IDS.finance1A,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const { profile, performance, activityLog, assignedData } = res.body;
    assert.equal(profile.id, IDS.ownerRoleUser, 'profile.id must be users.id, never owner.id');
    assert.notEqual(profile.id, IDS.owner1);
    assert.equal(profile.username, 'rajesh_owner', 'username must be users.username, never license username');
    assert.equal(profile.name, 'Rajesh Kumar');
    assert.equal(profile.email, 'rajesh@rimi.in');
    assert.equal(profile.phone, '9998887771');
    assert.equal(profile.role, 'Owner');
    assert.equal(profile.rawRole, 'owner');
    assert.equal(
      profile.lastPasswordChange,
      '2026-10-15',
      'lastPasswordChange must come from users.password_changed_at, never owner.password_changed_at'
    );

    // Verify performance, 7-day sessions, and assignments were queried with users.id
    const perfCall = state.capturedQueries.find((q) => q.section === 'performance');
    const actCall = state.capturedQueries.find((q) => q.section === 'activityLog');
    const assignCall = state.capturedQueries.find((q) => q.section === 'assignedData');

    assert.ok(perfCall, 'performance query must run for user with role=owner');
    assert.equal(perfCall.userId, IDS.ownerRoleUser);
    assert.ok(actCall, 'activityLog query must run for user with role=owner');
    assert.equal(actCall.userId, IDS.ownerRoleUser);
    assert.ok(assignCall, 'assignedData query must run for user with role=owner');
    assert.equal(assignCall.userId, IDS.ownerRoleUser);

    assert.equal(performance.totalCollections, 25000);
    assert.equal(activityLog.length, 1);
    assert.equal(assignedData.customerCount, 1);

    // Also verify safe fallback when req.principalType is undefined and both req.user & req.owner exist
    state.capturedQueries = [];
    const directOverview = await getUserProfileOverview(
      {
        financeId: IDS.finance1A,
        user: { id: IDS.ownerRoleUser, username: 'rajesh_owner', role: 'owner' },
        owner: { id: IDS.owner1, username: 'RIMI-LIC-001' },
        isOwner: true,
      },
      { queryable: db, now: FIXED_NOW }
    );
    assert.equal(directOverview.profile.id, IDS.ownerRoleUser);
    assert.equal(directOverview.profile.username, 'rajesh_owner');
  });

  it('Case B: admin, staff, and agent users each receive their own users + users_details data', async () => {
    const expectations = [
      {
        userId: IDS.adminUser,
        rawRole: 'admin',
        roleLabel: 'Admin',
        username: 'priya_admin',
        email: 'priya@rimi.in',
        phone: '9998887772',
        staffName: 'Priya Shankar',
        staffCode: 'ADM-01',
        qualification: 'MBA',
        photo: 'https://cdn.example.com/priya.jpg',
      },
      {
        userId: IDS.staffUser,
        rawRole: 'staff',
        roleLabel: 'Staff',
        username: 'arun_staff',
        email: 'arun@rimi.in',
        phone: '9998887773',
        staffName: 'Arun Prakash',
        staffCode: 'STF-01',
        qualification: 'BBA',
        photo: 'https://cdn.example.com/arun.jpg',
      },
      {
        userId: IDS.agentUser,
        rawRole: 'agent',
        roleLabel: 'Agent',
        username: 'kumar_agent',
        email: 'kumar@rimi.in',
        phone: '9998887774',
        staffName: 'Kumaravel S',
        staffCode: 'AGT-01',
        qualification: 'B.Sc',
        photo: 'https://cdn.example.com/kumar.jpg',
      },
    ];

    for (const exp of expectations) {
      state.capturedQueries = [];
      const userRow = state.users.get(exp.userId);
      const token = issueUserAccessToken({
        user: userRow,
        role: exp.rawRole,
        allowedCompanies: [IDS.finance1A],
        currentFinanceId: IDS.finance1A,
        financeName: 'Rimi Alpha Finance',
        authMode: 'direct_user',
      });

      const res = await httpGetJson(baseUrl, '/api/user/profile-overview', {
        Authorization: `Bearer ${token}`,
        'Finance-ID': IDS.finance1A,
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.profile.id, exp.userId);
      assert.equal(res.body.profile.username, exp.username);
      assert.equal(res.body.profile.name, exp.staffName);
      assert.equal(res.body.profile.email, exp.email);
      assert.equal(res.body.profile.phone, exp.phone);
      assert.equal(res.body.profile.role, exp.roleLabel);
      assert.equal(res.body.profile.rawRole, exp.rawRole);
      assert.equal(res.body.profile.staffCode, exp.staffCode);
      assert.equal(res.body.profile.qualification, exp.qualification);
      assert.equal(res.body.profile.photo, exp.photo);

      assert.equal(
        state.capturedQueries.find((q) => q.section === 'performance')?.userId,
        exp.userId
      );
      assert.equal(
        state.capturedQueries.find((q) => q.section === 'activityLog')?.userId,
        exp.userId
      );
      assert.equal(
        state.capturedQueries.find((q) => q.section === 'assignedData')?.userId,
        exp.userId
      );
    }
  });

  it('Case C: multi-company user whose users_details row has another finance_id or NULL resolves staff_name and photo, preferring current company when multiple exist', async () => {
    // 1. Single users_details row created under finance1B while viewing finance1A
    const multiUser = state.users.get(IDS.multiCoUser);
    const multiToken = issueUserAccessToken({
      user: multiUser,
      role: 'staff',
      allowedCompanies: [IDS.finance1A, IDS.finance1B],
      currentFinanceId: IDS.finance1A,
      financeName: 'Rimi Alpha Finance',
      authMode: 'direct_user',
    });

    const resCrossCompany = await httpGetJson(baseUrl, '/api/user/profile-overview', {
      Authorization: `Bearer ${multiToken}`,
      'Finance-ID': IDS.finance1A,
    });

    assert.equal(resCrossCompany.status, 200);
    assert.equal(resCrossCompany.body.profile.id, IDS.multiCoUser);
    assert.equal(resCrossCompany.body.profile.name, 'Meena Sundaram');
    assert.equal(resCrossCompany.body.profile.photo, 'https://cdn.example.com/meena.jpg');
    assert.equal(resCrossCompany.body.profile.qualification, 'M.Com');
    assert.equal(resCrossCompany.body.profile.experience, '5 Years');

    // 2. users_details row with finance_id = NULL still resolves staff_name & photo
    const nullFinUser = state.users.get(IDS.nullFinUdUser);
    const nullFinToken = issueUserAccessToken({
      user: nullFinUser,
      role: 'agent',
      allowedCompanies: [IDS.finance1A],
      currentFinanceId: IDS.finance1A,
      financeName: 'Rimi Alpha Finance',
      authMode: 'direct_user',
    });

    const resNullFin = await httpGetJson(baseUrl, '/api/user/profile-overview', {
      Authorization: `Bearer ${nullFinToken}`,
      'Finance-ID': IDS.finance1A,
    });

    assert.equal(resNullFin.status, 200);
    assert.equal(resNullFin.body.profile.id, IDS.nullFinUdUser);
    assert.equal(resNullFin.body.profile.name, 'Karthik Narayanan');
    assert.equal(resNullFin.body.profile.photo, 'https://cdn.example.com/karthik.jpg');

    // 3. When an older row exists for finance1A alongside a newer row in finance1B, current finance1A wins
    state.userDetails.push({
      id: IDS.udMultiCoA,
      user_id: IDS.multiCoUser,
      finance_id: IDS.finance1A,
      staff_name: 'Meena Alpha Branch',
      staff_code: 'STF-A1',
      joining_date: '2025-01-15',
      experience_years: 4,
      education_qualification: 'M.Com',
      photo: 'https://cdn.example.com/meena-alpha.jpg',
      created_at: '2025-01-15T05:00:00.000Z',
    });

    const resPreferCurrent = await httpGetJson(baseUrl, '/api/user/profile-overview', {
      Authorization: `Bearer ${multiToken}`,
      'Finance-ID': IDS.finance1A,
    });

    assert.equal(resPreferCurrent.status, 200);
    assert.equal(resPreferCurrent.body.profile.name, 'Meena Alpha Branch');
    assert.equal(resPreferCurrent.body.profile.staffCode, 'STF-A1');
    assert.equal(resPreferCurrent.body.profile.photo, 'https://cdn.example.com/meena-alpha.jpg');
  });

  it('Case D: pure License JWT token still returns owner data with empty stats/sessions/assignments (regression guard)', async () => {
    const ownerRow = state.owners.get(IDS.owner1);
    const licenseToken = issueOwnerLicenseToken(ownerRow);

    const res = await httpGetJson(baseUrl, '/api/user/profile-overview', {
      'Owner-Authorization': `Bearer ${licenseToken}`,
      'Finance-ID': IDS.finance1A,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const { profile, performance, activityLog, assignedData } = res.body;
    assert.equal(profile.id, IDS.owner1);
    assert.equal(profile.username, 'RIMI-LIC-001');
    assert.equal(profile.name, 'RIMI-LIC-001');
    assert.equal(profile.email, '-');
    assert.equal(profile.phone, '-');
    assert.equal(profile.role, 'Owner');
    assert.equal(profile.rawRole, 'owner');
    assert.equal(profile.lastPasswordChange, '2026-01-05');

    assert.equal(performance.totalCollections, 0);
    assert.equal(performance.totalCustomers, 0);
    assert.equal(activityLog.length, 7);
    assert.ok(activityLog.every((d) => d.sessions === 0));
    assert.equal(assignedData.customerCount, 0);

    // Pure owner without users row must not query user-scoped sections 2-4
    assert.equal(
      state.capturedQueries.some((q) => q.section !== 'profile'),
      false
    );
  });

  it('Case E: legacy users_details row (user_id IS NULL, users_details.id = users.id) resolves staff_name and photo', async () => {
    const legacyUser = state.users.get(IDS.legacyStaffUser);
    const token = issueUserAccessToken({
      user: legacyUser,
      role: 'staff',
      allowedCompanies: [IDS.finance1A],
      currentFinanceId: IDS.finance1A,
      financeName: 'Rimi Alpha Finance',
      authMode: 'direct_user',
    });

    const res = await httpGetJson(baseUrl, '/api/user/profile-overview', {
      Authorization: `Bearer ${token}`,
      'Finance-ID': IDS.finance1A,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.profile.id, IDS.legacyStaffUser);
    assert.equal(res.body.profile.name, 'Senthil Legacy');
    assert.equal(res.body.profile.staffCode, 'LEG-01');
    assert.equal(res.body.profile.photo, 'https://cdn.example.com/senthil.jpg');
  });
});
