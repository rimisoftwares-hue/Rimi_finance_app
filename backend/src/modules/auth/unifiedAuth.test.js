process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-unified-auth-jwt-secret-key-2026';
process.env.JWT_REFRESH_SECRET = 'test-unified-auth-refresh-secret-key-2026';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { db } = require('../../config/database.config');
const {
  enhancedCheckFinance,
  ownerOnly,
  ownerCheckFinance,
  resolveOwnerFromRequest,
} = require('../../middleware/auth.middleware');
const authRoutes = require('./auth.routes');
const financeRoutes = require('../finance/finance.routes');
const {
  changePasswordForPrincipal,
  resetChangePasswordRateLimiterForTests,
} = require('./changePassword.service');

// ─── Deterministic UUID Fixtures ─────────────────────────────────────────────
const IDS = {
  owner1: '11111111-1111-4111-8111-111111111111',
  owner2: '22222222-2222-4222-8222-222222222222',
  finance1A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  finance1B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  finance2C: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  // Intentionally distinct from owner1 to prove users.id !== owner.id resolution
  ownerRoleUser: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  agentUser: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  otherTenantUser: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};

function createInMemoryState(passwordHashes) {
  return {
    owners: new Map([
      [
        IDS.owner1,
        {
          id: IDS.owner1,
          username: 'RIMI-LIC-001',
          password: passwordHashes.ownerPass,
          is_active: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        IDS.owner2,
        {
          id: IDS.owner2,
          username: 'OTHER-LIC-002',
          password: passwordHashes.ownerPass,
          is_active: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
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
          phone_numbers: JSON.stringify(['9876543210']),
          emails: JSON.stringify(['alpha@rimi.in']),
          since: '2020',
          finance_photo: null,
          is_active: 1,
          office_lat: 13.0827,
          office_lng: 80.2707,
          office_geofence_m: 300,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        IDS.finance1B,
        {
          id: IDS.finance1B,
          finance_name: 'Rimi Beta Motors',
          owner_id: IDS.owner1,
          phone_numbers: JSON.stringify(['9876543211']),
          emails: JSON.stringify(['beta@rimi.in']),
          since: '2022',
          finance_photo: null,
          is_active: 1,
          office_lat: null,
          office_lng: null,
          office_geofence_m: 200,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      [
        IDS.finance2C,
        {
          id: IDS.finance2C,
          finance_name: 'External Tenant Finance',
          owner_id: IDS.owner2,
          phone_numbers: JSON.stringify(['9000000000']),
          emails: JSON.stringify(['ext@other.in']),
          since: '2021',
          finance_photo: null,
          is_active: 1,
          office_lat: null,
          office_lng: null,
          office_geofence_m: 200,
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
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
          password: passwordHashes.userPass,
          is_active: 1,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        IDS.agentUser,
        {
          id: IDS.agentUser,
          username: 'kumar_agent',
          email: 'kumar@rimi.in',
          phone_no: '9998887772',
          password: passwordHashes.userPass,
          is_active: 1,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        IDS.otherTenantUser,
        {
          id: IDS.otherTenantUser,
          username: 'ext_staff',
          email: 'ext_staff@other.in',
          phone_no: '9998887773',
          password: passwordHashes.userPass,
          is_active: 1,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]),
    memberships: [
      {
        id: 1,
        user_id: IDS.ownerRoleUser,
        finance_id: IDS.finance1A,
        role: 'owner',
        login_time_from: null,
        login_time_to: null,
        last_accessed_at: '2026-05-01T10:00:00.000Z',
        is_active: 1,
      },
      {
        id: 2,
        user_id: IDS.ownerRoleUser,
        finance_id: IDS.finance1B,
        role: 'owner',
        login_time_from: null,
        login_time_to: null,
        last_accessed_at: '2026-05-02T10:00:00.000Z',
        is_active: 1,
      },
      {
        id: 3,
        user_id: IDS.agentUser,
        finance_id: IDS.finance1A,
        role: 'agent',
        login_time_from: '00:00',
        login_time_to: '23:59',
        last_accessed_at: '2026-05-01T08:00:00.000Z',
        is_active: 1,
      },
      {
        id: 4,
        user_id: IDS.agentUser,
        finance_id: IDS.finance1B,
        role: 'staff',
        login_time_from: '00:00',
        login_time_to: '23:59',
        last_accessed_at: '2026-05-03T08:00:00.000Z',
        is_active: 1,
      },
      {
        id: 5,
        user_id: IDS.otherTenantUser,
        finance_id: IDS.finance2C,
        role: 'staff',
        login_time_from: null,
        login_time_to: null,
        last_accessed_at: '2026-05-01T08:00:00.000Z',
        is_active: 1,
      },
    ],
    sessions: new Map(),
  };
}

function createMockQueryExecutor(getState) {
  return async function mockQuery(rawSql, params = []) {
    const state = getState();
    const sql = String(rawSql || '').replace(/\s+/g, ' ').trim();
    const upper = sql.toUpperCase();

    // Transaction control commands
    if (
      upper === 'BEGIN' ||
      upper === 'COMMIT' ||
      upper === 'ROLLBACK' ||
      upper.startsWith('SAVEPOINT ') ||
      upper.startsWith('ROLLBACK TO SAVEPOINT ')
    ) {
      return { rows: [], rowCount: 0 };
    }

    // 1. owner lookups
    if (sql.includes('FROM owner WHERE username = $1')) {
      const username = params[0];
      const rows = Array.from(state.owners.values()).filter((o) => o.username === username);
      return { rows: rows.slice(0, 1), rowCount: rows.length ? 1 : 0 };
    }

    if (sql.includes('FROM owner WHERE id = $1')) {
      const owner = state.owners.get(String(params[0]));
      if (!owner) return { rows: [], rowCount: 0 };
      if (sql.includes('AND is_active = 1') && Number(owner.is_active) !== 1) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{ ...owner }], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE owner SET password = $1')) {
      const ownerId = String(params[1]);
      const owner = state.owners.get(ownerId);
      if (owner) {
        owner.password = params[0];
        owner.updated_at = new Date().toISOString();
      }
      return { rows: [{ last_password_change: '2026-11-14' }], rowCount: owner ? 1 : 0 };
    }

    // 2. users lookups & updates
    if (sql.includes('FROM users WHERE username = $1 OR phone_no = $1')) {
      const identifier = String(params[0]);
      const match = Array.from(state.users.values()).find(
        (u) => u.username === identifier || u.phone_no === identifier
      );
      return { rows: match ? [{ ...match }] : [], rowCount: match ? 1 : 0 };
    }

    if (sql.includes('FROM users WHERE id = $1')) {
      const u = state.users.get(String(params[0]));
      if (!u) return { rows: [], rowCount: 0 };
      if (sql.includes('AND is_active = 1') && Number(u.is_active) !== 1) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{ ...u }], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE users SET password = $1')) {
      const userId = String(params[1]);
      const u = state.users.get(userId);
      if (u) {
        u.password = params[0];
      }
      return { rows: [{ last_password_change: '2026-11-14' }], rowCount: u ? 1 : 0 };
    }

    if (sql.startsWith('UPDATE users SET is_active = 0')) {
      const u = state.users.get(String(params[0]));
      if (u) u.is_active = 0;
      return { rows: [], rowCount: u ? 1 : 0 };
    }

    // 3. resolveOwnerFromRequest owner-role lookup
    if (
      sql.includes('FROM users u') &&
      sql.includes("AND uac.role = 'owner'") &&
      sql.includes('INNER JOIN owner o')
    ) {
      const userId = String(params[0]);
      const scopedFinanceId = params[1] ? String(params[1]) : null;
      const u = state.users.get(userId);
      if (!u || Number(u.is_active) !== 1) return { rows: [], rowCount: 0 };

      const matches = state.memberships
        .filter((m) => {
          if (String(m.user_id) !== userId || Number(m.is_active) !== 1 || m.role !== 'owner') {
            return false;
          }
          if (scopedFinanceId && String(m.finance_id) !== scopedFinanceId) {
            return false;
          }
          const fin = state.finances.get(String(m.finance_id));
          if (!fin || Number(fin.is_active) !== 1) return false;
          const own = state.owners.get(String(fin.owner_id));
          if (!own || Number(own.is_active) !== 1) return false;
          return true;
        })
        .sort((a, b) => String(b.last_accessed_at || '').localeCompare(String(a.last_accessed_at || '')))
        .map((m) => {
          const fin = state.finances.get(String(m.finance_id));
          const own = state.owners.get(String(fin.owner_id));
          return {
            owner_id: own.id,
            owner_username: own.username,
            finance_id: fin.id,
          };
        });

      return { rows: matches.slice(0, 1), rowCount: matches.length ? 1 : 0 };
    }

    // 4. DELETE /users/:id tenant check (`FROM user_allowed_companies uac INNER JOIN finance_detail fd ... WHERE uac.user_id = $1 AND fd.owner_id = $2`)
    if (
      sql.includes('FROM user_allowed_companies uac') &&
      sql.includes('INNER JOIN finance_detail fd ON fd.id = uac.finance_id') &&
      sql.includes('WHERE uac.user_id = $1') &&
      sql.includes('AND fd.owner_id = $2') &&
      !sql.includes('uac.role')
    ) {
      const targetUserId = String(params[0]);
      const ownerId = String(params[1]);
      const rows = state.memberships.filter((m) => {
        const fin = state.finances.get(String(m.finance_id));
        return String(m.user_id) === targetUserId && fin && String(fin.owner_id) === ownerId;
      });
      return { rows, rowCount: rows.length };
    }

    // 5. /user-login membership check (`WHERE uac.user_id = $1 AND uac.is_active = 1 AND fd.is_active = 1 AND fd.owner_id = $2`)
    if (
      sql.includes('FROM user_allowed_companies uac') &&
      sql.includes('WHERE uac.user_id = $1') &&
      sql.includes('AND fd.owner_id = $2') &&
      sql.includes('uac.role')
    ) {
      const userId = String(params[0]);
      const ownerId = String(params[1]);
      const rows = state.memberships.filter((m) => {
        const fin = state.finances.get(String(m.finance_id));
        return (
          String(m.user_id) === userId &&
          Number(m.is_active) === 1 &&
          fin &&
          Number(fin.is_active) === 1 &&
          String(fin.owner_id) === ownerId
        );
      });
      return { rows, rowCount: rows.length };
    }

    // 6. Direct user / validateUserPrincipal / switch allowed companies join
    if (
      sql.includes('FROM user_allowed_companies uac') &&
      sql.includes('INNER JOIN finance_detail fd ON fd.id = uac.finance_id') &&
      sql.includes('INNER JOIN owner o ON o.id = fd.owner_id')
    ) {
      const userId = String(params[0]);
      let rows = state.memberships
        .filter((m) => String(m.user_id) === userId && Number(m.is_active) === 1)
        .map((m) => {
          const fin = state.finances.get(String(m.finance_id));
          const own = fin ? state.owners.get(String(fin.owner_id)) : null;
          if (!fin || !own) return null;
          return {
            ...m,
            finance_name: fin.finance_name,
            owner_id: fin.owner_id,
            phone_numbers: fin.phone_numbers,
            emails: fin.emails,
            since: fin.since,
            finance_photo: fin.finance_photo,
            finance_is_active: fin.is_active,
            created_at: fin.created_at,
            owner_username: own.username,
            owner_is_active: own.is_active,
            address: '10 Anna Salai',
            city: 'Chennai',
            district: 'Chennai',
            state: 'Tamil Nadu',
            pincode: '600002',
          };
        })
        .filter(Boolean);

      if (sql.includes('AND fd.is_active = 1 AND o.is_active = 1')) {
        rows = rows.filter(
          (r) => Number(r.finance_is_active) === 1 && Number(r.owner_is_active) === 1
        );
      }

      rows.sort((a, b) => {
        const la = a.last_accessed_at || '';
        const lb = b.last_accessed_at || '';
        if (la !== lb) return lb.localeCompare(la);
        return String(a.finance_name).localeCompare(String(b.finance_name));
      });

      return { rows, rowCount: rows.length };
    }

    // 7. Single user_allowed_companies lookup on /finance/switch
    if (
      sql.includes('FROM user_allowed_companies') &&
      sql.includes('WHERE user_id = $1 AND finance_id = $2 AND is_active = 1')
    ) {
      const userId = String(params[0]);
      const financeId = String(params[1]);
      const rows = state.memberships.filter(
        (m) =>
          String(m.user_id) === userId &&
          String(m.finance_id) === financeId &&
          Number(m.is_active) === 1
      );
      return { rows: rows.slice(0, 1), rowCount: rows.length ? 1 : 0 };
    }

    if (sql.startsWith('UPDATE user_allowed_companies SET last_accessed_at = NOW()')) {
      const userId = String(params[0]);
      const financeId = String(params[1]);
      const match = state.memberships.find(
        (m) => String(m.user_id) === userId && String(m.finance_id) === financeId
      );
      if (match) {
        match.last_accessed_at = new Date().toISOString();
      }
      return { rows: [], rowCount: match ? 1 : 0 };
    }

    // 8. finance_detail queries
    if (sql.includes('FROM finance_detail') && sql.includes('WHERE owner_id = $1')) {
      const ownerId = String(params[0]);
      const rows = Array.from(state.finances.values())
        .filter((f) => String(f.owner_id) === ownerId && Number(f.is_active) === 1)
        .sort((a, b) => a.finance_name.localeCompare(b.finance_name))
        .map((f) => ({
          ...f,
          name: f.finance_name,
        }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM finance_detail fd') && sql.includes('WHERE fd.owner_id = $1')) {
      const ownerId = String(params[0]);
      const rows = Array.from(state.finances.values())
        .filter((f) => String(f.owner_id) === ownerId && Number(f.is_active) === 1)
        .sort((a, b) => a.finance_name.localeCompare(b.finance_name))
        .map((f) => ({
          ...f,
          name: f.finance_name,
          address: '10 Anna Salai',
          city: 'Chennai',
          district: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600002',
        }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM finance_detail WHERE id = $1 AND owner_id = $2')) {
      const fin = state.finances.get(String(params[0]));
      if (!fin || String(fin.owner_id) !== String(params[1]) || Number(fin.is_active) !== 1) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{ ...fin }], rowCount: 1 };
    }

    if (sql.includes('FROM finance_detail WHERE id = $1')) {
      const fin = state.finances.get(String(params[0]));
      if (!fin) return { rows: [], rowCount: 0 };
      return { rows: [{ ...fin }], rowCount: 1 };
    }

    if (sql.includes('FROM finance_detail fd') && sql.includes('WHERE fd.id = $1')) {
      const fin = state.finances.get(String(params[0]));
      if (!fin || (sql.includes('fd.is_active = 1') && Number(fin.is_active) !== 1)) {
        return { rows: [], rowCount: 0 };
      }
      const own = state.owners.get(String(fin.owner_id));
      return {
        rows: [
          {
            ...fin,
            owner_username: own?.username || null,
            owner_is_active: own ? own.is_active : 0,
            address: '10 Anna Salai',
            city: 'Chennai',
            district: 'Chennai',
            state: 'Tamil Nadu',
            pincode: '600002',
          },
        ],
        rowCount: 1,
      };
    }

    // 9. Branding & KPI stats queries
    if (sql.includes('FROM finance_branding_assets')) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('customer_count') && sql.includes('loan_count')) {
      return {
        rows: [{ customer_count: '12', loan_count: '8', total_collection: '250000.00' }],
        rowCount: 1,
      };
    }

    // 10. agent_login_sessions queries
    if (sql.startsWith('INSERT INTO agent_login_sessions')) {
      const id = crypto.randomUUID();
      const userId = String(params[0]);
      const nowIso = new Date().toISOString();
      state.sessions.set(id, {
        id,
        user_id: userId,
        device_name: params[1] || null,
        platform: params.length > 4 ? params[2] : 'Web',
        flagged: params.length > 14 ? Boolean(params[14]) : false,
        flag_reason: params.length > 15 ? params[15] : null,
        login_time: nowIso,
        last_seen_at: nowIso,
        logout_time: null,
        duration_seconds: null,
        logout_reason: null,
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (sql.includes('FROM agent_login_sessions') && sql.includes('id = ANY($2::uuid[])')) {
      const userId = String(params[0]);
      const ids = Array.isArray(params[1]) ? params[1].map(String) : [];
      const rows = ids
        .map((id) => state.sessions.get(id))
        .filter((s) => s && String(s.user_id) === userId);
      return { rows, rowCount: rows.length };
    }

    if (
      sql.startsWith('UPDATE agent_login_sessions') &&
      sql.includes('SET last_seen_at = CURRENT_TIMESTAMP')
    ) {
      const sessionId = String(params[0]);
      const userId = String(params[1]);
      const s = state.sessions.get(sessionId);
      if (s && String(s.user_id) === userId && s.logout_time === null) {
        s.last_seen_at = new Date().toISOString();
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Password-change other-session invalidation (`WHERE user_id = $1::uuid AND ($2::uuid IS NULL OR id <> $2::uuid)`)
    if (
      sql.startsWith('UPDATE agent_login_sessions') &&
      sql.includes("logout_reason = 'password_changed'")
    ) {
      const userId = String(params[0]);
      const keepSessionId = params[1] ? String(params[1]) : null;
      const keepAnchorId = params[2] ? String(params[2]) : null;
      let count = 0;
      for (const s of state.sessions.values()) {
        if (String(s.user_id) !== userId) continue;
        if (keepSessionId && s.id === keepSessionId) continue;
        if (keepAnchorId && s.id === keepAnchorId) continue;
        if (!s.logout_time) {
          s.logout_time = new Date().toISOString();
          s.duration_seconds = 10;
        }
        s.logout_reason = 'password_changed';
        count += 1;
      }
      return { rows: [], rowCount: count };
    }

    // DELETE /users/:id full user session revocation
    if (
      sql.startsWith('UPDATE agent_login_sessions') &&
      sql.includes("logout_reason = 'revoked'") &&
      params.length === 1
    ) {
      const userId = String(params[0]);
      let count = 0;
      for (const s of state.sessions.values()) {
        if (String(s.user_id) !== userId) continue;
        if (!s.logout_time) {
          s.logout_time = new Date().toISOString();
          s.duration_seconds = 15;
        }
        s.logout_reason = 'revoked';
        count += 1;
      }
      return { rows: [], rowCount: count };
    }

    // markSessionsRevokedInDb (`WHERE user_id = $1::uuid AND id = ANY($2::uuid[])`)
    if (
      sql.startsWith('UPDATE agent_login_sessions') &&
      sql.includes('id = ANY($2::uuid[])')
    ) {
      const userId = String(params[0]);
      const ids = Array.isArray(params[1]) ? params[1].map(String) : [];
      const reason = params[2];
      let count = 0;
      for (const id of ids) {
        const s = state.sessions.get(id);
        if (s && String(s.user_id) === userId) {
          if (!s.logout_time) {
            s.logout_time = new Date().toISOString();
            s.duration_seconds = 20;
          }
          s.logout_reason = reason;
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    // Standard single-session close (`WHERE id = $1::uuid AND user_id = $3::uuid AND logout_time IS NULL`)
    if (
      sql.startsWith('UPDATE agent_login_sessions') &&
      sql.includes('WHERE id = $1::uuid') &&
      sql.includes('AND logout_time IS NULL')
    ) {
      const sessionId = String(params[0]);
      const reason = params[1];
      const userId = String(params[2]);
      const s = state.sessions.get(sessionId);
      if (s && String(s.user_id) === userId && s.logout_time === null) {
        s.logout_time = new Date().toISOString();
        s.duration_seconds = 30;
        s.logout_reason = reason;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unhandled SQL in unifiedAuth.test.js mock: ${sql}`);
  };
}

async function apiRequest(baseUrl, method, path, { headers = {}, body = undefined } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, data };
}

describe('AutoFinex Unified License & Direct User Authentication Architecture', () => {
  let server;
  let baseUrl;
  let state;
  let passwordHashes;
  let origQuery;
  let origConnect;
  let origGetConnection;
  let origLocationPolicy;

  before(async () => {
    const [ownerPass, userPass] = await Promise.all([
      bcrypt.hash('LicenseSecret#123', 10),
      bcrypt.hash('UserSecret#123', 10),
    ]);
    passwordHashes = { ownerPass, userPass };

    origQuery = db.query;
    origConnect = db.connect;
    origGetConnection = db.getConnection;
    origLocationPolicy = process.env.LOGIN_LOCATION_POLICY;

    const mockQuery = createMockQueryExecutor(() => state);
    db.query = mockQuery;
    db.connect = async () => ({
      query: mockQuery,
      release: () => {},
    });
    db.getConnection = async () => ({
      query: mockQuery,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/finance', financeRoutes);

    // Diagnostic protected endpoints exercising enhancedCheckFinance, ownerOnly, and ownerCheckFinance
    app.get('/api/test/protected-finance', enhancedCheckFinance, (req, res) => {
      res.json({
        success: true,
        authMode: req.authMode,
        financeId: req.financeId,
        user: req.user,
        owner: req.owner || null,
        isOwner: Boolean(req.isOwner),
      });
    });

    app.get('/api/test/owner-only', ownerOnly, (req, res) => {
      res.json({
        success: true,
        authMode: req.authMode,
        owner: req.owner,
        user: req.user,
      });
    });

    app.get('/api/test/owner-finance', ownerCheckFinance, (req, res) => {
      res.json({
        success: true,
        authMode: req.authMode,
        financeId: req.financeId,
        owner: req.owner,
      });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(() => {
    state = createInMemoryState(passwordHashes);
    process.env.LOGIN_LOCATION_POLICY = 'prefer';
    resetChangePasswordRateLimiterForTests();
  });

  after(async () => {
    db.query = origQuery;
    db.connect = origConnect;
    db.getConnection = origGetConnection;
    if (origLocationPolicy === undefined) {
      delete process.env.LOGIN_LOCATION_POLICY;
    } else {
      process.env.LOGIN_LOCATION_POLICY = origLocationPolicy;
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('Test A: License Mode authenticates License -> User, preserves License on User Logout, and expires closed user session on heartbeat', async () => {
    // 1. License Login succeeds
    const ownerRes = await apiRequest(baseUrl, 'POST', '/api/auth/owner-login', {
      body: { username: 'RIMI-LIC-001', password: 'LicenseSecret#123' },
    });
    assert.equal(ownerRes.status, 200);
    assert.equal(ownerRes.data.success, true);
    assert.equal(ownerRes.data.authMode, 'license');
    assert.equal(ownerRes.data.owner.username, 'RIMI-LIC-001');
    assert.equal(ownerRes.data.owner.finances.length, 2);
    const ownerToken = ownerRes.data.token;

    // 2. Inactive License cannot authenticate
    state.owners.get(IDS.owner2).is_active = 0;
    const inactiveOwnerRes = await apiRequest(baseUrl, 'POST', '/api/auth/owner-login', {
      body: { username: 'OTHER-LIC-002', password: 'LicenseSecret#123' },
    });
    assert.equal(inactiveOwnerRes.status, 403);
    assert.equal(inactiveOwnerRes.data.error_code, 'LICENSE_INACTIVE');

    // 3. Login policy endpoint returns both policy & locationPolicy
    const policyRes = await apiRequest(baseUrl, 'GET', '/api/auth/login-policy');
    assert.equal(policyRes.status, 200);
    assert.equal(policyRes.data.policy, 'prefer');
    assert.equal(policyRes.data.locationPolicy, 'prefer');

    // 4. User Login under License Mode requires owner-authorization and creates attendance session
    const noOwnerHeaderRes = await apiRequest(baseUrl, 'POST', '/api/auth/user-login', {
      body: { username: 'kumar_agent', password: 'UserSecret#123', financeId: IDS.finance1A },
    });
    assert.equal(noOwnerHeaderRes.status, 401);
    assert.equal(noOwnerHeaderRes.data.error_code, 'OWNER_TOKEN_REQUIRED');

    const userLoginRes = await apiRequest(baseUrl, 'POST', '/api/auth/user-login', {
      headers: { 'owner-authorization': `Bearer ${ownerToken}` },
      body: {
        username: 'kumar_agent',
        password: 'UserSecret#123',
        financeId: IDS.finance1A,
        latitude: 13.0827,
        longitude: 80.2707,
        accuracyM: 15,
        locationPermission: 'granted',
      },
    });
    assert.equal(userLoginRes.status, 200);
    assert.equal(userLoginRes.data.authMode, 'license');
    assert.equal(userLoginRes.data.refreshToken, undefined);
    assert.equal(userLoginRes.data.user.current_finance_id, IDS.finance1A);
    assert.equal(userLoginRes.data.flagged, false);
    const userToken = userLoginRes.data.token;
    const sessionId = userLoginRes.data.sessionId;
    assert.ok(state.sessions.has(sessionId));

    // 5. Heartbeat while open returns active: true
    const hbOpen = await apiRequest(baseUrl, 'POST', '/api/auth/session-heartbeat', {
      headers: { Authorization: `Bearer ${userToken}`, 'Finance-ID': IDS.finance1A },
    });
    assert.equal(hbOpen.status, 200);
    assert.equal(hbOpen.data.active, true);

    // 6. Calling user-logout with Owner Token is safely ignored (token-type separation)
    const accidentalOwnerLogout = await apiRequest(baseUrl, 'POST', '/api/auth/user-logout', {
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { reason: 'manual' },
    });
    assert.equal(accidentalOwnerLogout.status, 200);
    assert.equal(accidentalOwnerLogout.data.ignored, true);

    // 7. Manual User Logout closes user attendance session while Owner License remains valid
    const logoutRes = await apiRequest(baseUrl, 'POST', '/api/auth/user-logout', {
      headers: { Authorization: `Bearer ${userToken}` },
      body: { reason: 'manual' },
    });
    assert.equal(logoutRes.status, 200);
    assert.equal(state.sessions.get(sessionId).logout_reason, 'manual');
    assert.notEqual(state.sessions.get(sessionId).logout_time, null);

    // Owner token still fetches /owner-finances cleanly (simulating app restart -> /user-login)
    const ownerFinancesAfterLogout = await apiRequest(baseUrl, 'GET', '/api/auth/owner-finances', {
      headers: { 'owner-authorization': `Bearer ${ownerToken}` },
    });
    assert.equal(ownerFinancesAfterLogout.status, 200);
    assert.equal(ownerFinancesAfterLogout.data.finances.length, 2);

    // Old License-mode user token is now rejected with SESSION_REVOKED
    const reusedUserToken = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${userToken}`, 'Finance-ID': IDS.finance1A },
    });
    assert.equal(reusedUserToken.status, 401);
    assert.equal(reusedUserToken.data.error_code, 'SESSION_REVOKED');
  });

  it('Test B: Direct User Mode authenticates by username or phone, enforces location policy, selects default company, and renews attendance after window_close', async () => {
    // 1. Strict location policy blocks login without device coordinates
    process.env.LOGIN_LOCATION_POLICY = 'strict';
    const missingLocRes = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    assert.equal(missingLocRes.status, 403);
    assert.equal(missingLocRes.data.error_code, 'LOCATION_REQUIRED');

    // 2. Direct login by PHONE NUMBER with coordinates succeeds & picks most recently accessed company (finance1B)
    process.env.LOGIN_LOCATION_POLICY = 'prefer';
    const directRes = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: {
        identifier: '9998887772',
        password: 'UserSecret#123',
        latitude: 13.0827,
        longitude: 80.2707,
        locationPermission: 'granted',
        deviceName: 'Tauri Desktop',
        platform: 'Linux',
      },
    });
    assert.equal(directRes.status, 200);
    assert.equal(directRes.data.success, true);
    assert.equal(directRes.data.authMode, 'direct_user');
    assert.equal(directRes.data.user.username, 'kumar_agent');
    assert.equal(directRes.data.user.current_finance_id, IDS.finance1B);
    assert.equal(directRes.data.finances.length, 2);
    assert.ok(directRes.data.token);
    assert.ok(directRes.data.refreshToken);

    const initialSessionId = directRes.data.sessionId;
    const accessToken = directRes.data.token;
    const refreshToken = directRes.data.refreshToken;

    // 3. Refresh token cannot be used directly as an API access token (separate secret + tokenType guard)
    const refreshAsAccess = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${refreshToken}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(refreshAsAccess.status, 401);
    assert.ok(['INVALID_TOKEN', 'INVALID_TOKEN_TYPE'].includes(refreshAsAccess.data.error_code));

    const sameSecretRefreshToken = jwt.sign(
      { tokenType: 'user_refresh', sub: IDS.agentUser },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const sameSecretAttempt = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${sameSecretRefreshToken}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(sameSecretAttempt.status, 401);
    assert.equal(sameSecretAttempt.data.error_code, 'INVALID_TOKEN_TYPE');

    // 4. App window close (`reason: 'window_close'`) closes the attendance shift WITHOUT revoking persistent auth
    const winCloseRes = await apiRequest(baseUrl, 'POST', '/api/auth/user-logout', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { reason: 'window_close' },
    });
    assert.equal(winCloseRes.status, 200);
    assert.equal(state.sessions.get(initialSessionId).logout_reason, 'window_close');
    assert.notEqual(state.sessions.get(initialSessionId).logout_time, null);

    // 5. On app reopen, heartbeat detects closed shift, validates live DB status, opens a NEW attendance row, and returns renewed token
    const hbResume = await apiRequest(baseUrl, 'POST', '/api/auth/session-heartbeat', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(hbResume.status, 200);
    assert.equal(hbResume.data.active, true);
    assert.equal(hbResume.data.renewed, true);
    assert.notEqual(hbResume.data.sessionId, initialSessionId);
    assert.ok(hbResume.data.token);

    const decodedRenewed = jwt.decode(hbResume.data.token);
    assert.equal(decodedRenewed.authMode, 'direct_user');
    assert.equal(decodedRenewed.user.sessionId, hbResume.data.sessionId);
    assert.equal(decodedRenewed.user.anchorSessionId, initialSessionId);
  });

  it('Test C: Finance Switching & Finance Details preserve Direct User Mode and block unauthorized companies', async () => {
    const loginRes = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    assert.equal(loginRes.status, 200);
    const tokenB = loginRes.data.token;
    const anchorId = loginRes.data.sessionId;

    // 1. GET /finance-details/:financeId allows permitted company & rejects unauthorized company
    const detailsAllowed = await apiRequest(
      baseUrl,
      'GET',
      `/api/auth/finance-details/${IDS.finance1A}`,
      { headers: { Authorization: `Bearer ${tokenB}` } }
    );
    assert.equal(detailsAllowed.status, 200);
    assert.equal(detailsAllowed.data.finance.id, IDS.finance1A);

    const detailsDenied = await apiRequest(
      baseUrl,
      'GET',
      `/api/auth/finance-details/${IDS.finance2C}`,
      { headers: { Authorization: `Bearer ${tokenB}` } }
    );
    assert.equal(detailsDenied.status, 403);
    assert.equal(detailsDenied.data.error_code, 'FINANCE_ACCESS_DENIED');

    // 2. POST /api/finance/switch to permitted company A preserves authMode, sessionId, anchorSessionId, and pwdFp
    const switchOk = await apiRequest(baseUrl, 'POST', '/api/finance/switch', {
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { financeId: IDS.finance1A },
    });
    assert.equal(switchOk.status, 200);
    assert.equal(switchOk.data.current_finance_id, IDS.finance1A);
    assert.equal(switchOk.data.user.role, 'agent');

    const switchedDecoded = jwt.decode(switchOk.data.token);
    assert.equal(switchedDecoded.authMode, 'direct_user');
    assert.equal(switchedDecoded.user.sessionId, anchorId);
    assert.equal(switchedDecoded.user.anchorSessionId, anchorId);
    assert.ok(switchedDecoded.pwdFp);

    // 3. Subsequent API call succeeds for finance1A and rejects finance2C
    const apiOk = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${switchOk.data.token}`, 'Finance-ID': IDS.finance1A },
    });
    assert.equal(apiOk.status, 200);
    assert.equal(apiOk.data.financeId, IDS.finance1A);

    const apiDenied = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${switchOk.data.token}`, 'Finance-ID': IDS.finance2C },
    });
    assert.equal(apiDenied.status, 403);
    assert.equal(apiDenied.data.error_code, 'FINANCE_ACCESS_DENIED');

    // 4. POST /api/finance/switch rejects unauthorized company
    const switchDenied = await apiRequest(baseUrl, 'POST', '/api/finance/switch', {
      headers: { Authorization: `Bearer ${switchOk.data.token}` },
      body: { financeId: IDS.finance2C },
    });
    assert.equal(switchDenied.status, 403);
    assert.equal(switchDenied.data.error_code, 'FINANCE_ACCESS_DENIED');
  });

  it('Test D: Refresh-token rotation & replay detection revoke the entire token family immediately', async () => {
    const loginRes = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    const rt1 = loginRes.data.refreshToken;

    // 1. Valid rotation rt1 -> rt2
    const refresh1 = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: rt1 },
    });
    assert.equal(refresh1.status, 200);
    assert.equal(refresh1.data.authMode, 'direct_user');
    const rt2 = refresh1.data.refreshToken;
    const rotatedAccessToken = refresh1.data.token;
    assert.notEqual(rt2, rt1);

    // 2. Replaying already-used rt1 triggers replay detection and revokes the entire session family
    const replayAttempt = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: rt1 },
    });
    assert.equal(replayAttempt.status, 401);
    assert.equal(replayAttempt.data.error_code, 'SESSION_REVOKED');

    // 3. Both rt2 and rotatedAccessToken are now rejected because the DB anchor & family were revoked
    const rt2AfterReplay = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: rt2 },
    });
    assert.equal(rt2AfterReplay.status, 401);
    assert.equal(rt2AfterReplay.data.error_code, 'SESSION_REVOKED');

    const accessAfterReplay = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${rotatedAccessToken}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(accessAfterReplay.status, 401);
    assert.equal(accessAfterReplay.data.error_code, 'SESSION_REVOKED');
  });

  it('Test E1: Immediate server-side revocation on User deactivation, License deactivation, and Company removal', async () => {
    // Case 1: User deactivated
    const login1 = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    state.users.get(IDS.agentUser).is_active = 0;

    const checkUserInactive = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${login1.data.token}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(checkUserInactive.status, 401);
    assert.equal(checkUserInactive.data.error_code, 'USER_INACTIVE');

    const refreshUserInactive = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: login1.data.refreshToken },
    });
    assert.equal(refreshUserInactive.status, 401);
    assert.equal(refreshUserInactive.data.error_code, 'USER_INACTIVE');

    // Restore user, test License (`owner`) deactivation
    state.users.get(IDS.agentUser).is_active = 1;
    const login2 = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    state.owners.get(IDS.owner1).is_active = 0;

    const checkLicenseInactive = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${login2.data.token}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(checkLicenseInactive.status, 401);
    assert.equal(checkLicenseInactive.data.error_code, 'LICENSE_INACTIVE');

    const refreshLicenseInactive = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: login2.data.refreshToken },
    });
    assert.equal(refreshLicenseInactive.status, 401);
    assert.equal(refreshLicenseInactive.data.error_code, 'LICENSE_INACTIVE');

    // Restore owner, test removing all user_allowed_companies memberships
    state.owners.get(IDS.owner1).is_active = 1;
    const login3 = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    for (const m of state.memberships) {
      if (m.user_id === IDS.agentUser) m.is_active = 0;
    }

    const checkNoAccess = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${login3.data.token}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(checkNoAccess.status, 403);
    assert.equal(checkNoAccess.data.error_code, 'NO_ACTIVE_FINANCE_ACCESS');
  });

  it('Test E2: Password change invalidates old access/refresh sessions across devices while rotating caller credentials', async () => {
    // Device 1 logs in via Direct User Mode
    const device1 = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123', deviceName: 'Device 1' },
    });
    // Device 2 also logs in via Direct User Mode
    const device2 = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123', deviceName: 'Device 2' },
    });

    // Device 1 changes password via changePasswordForPrincipal
    const pwChangeResult = await changePasswordForPrincipal(
      {
        headers: {
          authorization: `Bearer ${device1.data.token}`,
          'finance-id': IDS.finance1B,
        },
        body: {
          currentPassword: 'UserSecret#123',
          newPassword: 'NewStrongPassword#456',
        },
      },
      db
    );

    assert.equal(pwChangeResult.success, true);
    assert.equal(pwChangeResult.authMode, 'direct_user');
    assert.ok(pwChangeResult.token);
    assert.ok(pwChangeResult.refreshToken);

    // Pre-change tokens on BOTH Device 1 and Device 2 are immediately rejected
    const oldDevice1Access = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${device1.data.token}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(oldDevice1Access.status, 401);
    assert.equal(oldDevice1Access.data.error_code, 'PASSWORD_CHANGED');

    const oldDevice2Refresh = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: device2.data.refreshToken },
    });
    assert.equal(oldDevice2Refresh.status, 401);

    // Rotated Device 1 access token AND refresh token succeed seamlessly
    const newDevice1Access = await apiRequest(baseUrl, 'GET', '/api/test/protected-finance', {
      headers: { Authorization: `Bearer ${pwChangeResult.token}`, 'Finance-ID': IDS.finance1B },
    });
    assert.equal(newDevice1Access.status, 200);

    const newDevice1Refresh = await apiRequest(baseUrl, 'POST', '/api/auth/refresh-session', {
      body: { refreshToken: pwChangeResult.refreshToken },
    });
    assert.equal(newDevice1Refresh.status, 200);
  });

  it('Test F: Owner-role Direct User resolves real owner.id (users.id !== owner.id) while Agent/Staff are denied Owner endpoints', async () => {
    // 1. Direct User login as Owner-role user (`IDS.ownerRoleUser !== IDS.owner1`)
    const ownerUserLogin = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'rajesh_owner', password: 'UserSecret#123' },
    });
    assert.equal(ownerUserLogin.status, 200);
    assert.equal(ownerUserLogin.data.user.id, IDS.ownerRoleUser);
    assert.notEqual(ownerUserLogin.data.user.id, IDS.owner1);
    const ownerUserToken = ownerUserLogin.data.token;

    // 2. ownerOnly & ownerCheckFinance resolve REAL `owner.id` (`IDS.owner1`), NOT `users.id`
    const ownerOnlyRes = await apiRequest(baseUrl, 'GET', '/api/test/owner-only', {
      headers: { Authorization: `Bearer ${ownerUserToken}`, 'Finance-ID': IDS.finance1A },
    });
    assert.equal(ownerOnlyRes.status, 200);
    assert.equal(ownerOnlyRes.data.owner.id, IDS.owner1);
    assert.equal(ownerOnlyRes.data.owner.username, 'RIMI-LIC-001');
    assert.equal(ownerOnlyRes.data.authMode, 'direct_user');

    const ownerFinanceRes = await apiRequest(baseUrl, 'GET', '/api/test/owner-finance', {
      headers: { Authorization: `Bearer ${ownerUserToken}`, 'Finance-ID': IDS.finance1A },
    });
    assert.equal(ownerFinanceRes.status, 200);
    assert.equal(ownerFinanceRes.data.financeId, IDS.finance1A);

    // Owner-role Direct User cannot access another Owner's finance company
    const crossTenantFinanceRes = await apiRequest(baseUrl, 'GET', '/api/test/owner-finance', {
      headers: { Authorization: `Bearer ${ownerUserToken}`, 'Finance-ID': IDS.finance2C },
    });
    assert.equal(crossTenantFinanceRes.status, 403);

    // 3. Agent/Staff Direct User is strictly blocked from Owner endpoints
    const agentLogin = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'kumar_agent', password: 'UserSecret#123' },
    });
    const agentToken = agentLogin.data.token;

    const agentOwnerAttempt = await apiRequest(baseUrl, 'GET', '/api/test/owner-only', {
      headers: { Authorization: `Bearer ${agentToken}`, 'Finance-ID': IDS.finance1A },
    });
    assert.equal(agentOwnerAttempt.status, 403);
    assert.equal(agentOwnerAttempt.data.error_code, 'OWNER_ROLE_REQUIRED');

    const resolvedAgent = await resolveOwnerFromRequest({
      headers: { authorization: `Bearer ${agentToken}`, 'finance-id': IDS.finance1A },
    });
    assert.equal(resolvedAgent.isOwner, undefined);
    assert.equal(resolvedAgent.status, 403);

    // 4. DELETE /api/auth/users/:id enforces Owner authority + tenant boundary + session revocation
    const agentDeleteAttempt = await apiRequest(
      baseUrl,
      'DELETE',
      `/api/auth/users/${IDS.agentUser}`,
      { headers: { Authorization: `Bearer ${agentToken}`, 'Finance-ID': IDS.finance1A } }
    );
    assert.equal(agentDeleteAttempt.status, 403);

    const crossTenantDeleteAttempt = await apiRequest(
      baseUrl,
      'DELETE',
      `/api/auth/users/${IDS.otherTenantUser}`,
      { headers: { Authorization: `Bearer ${ownerUserToken}`, 'Finance-ID': IDS.finance1A } }
    );
    assert.equal(crossTenantDeleteAttempt.status, 403);

    const validOwnerDelete = await apiRequest(
      baseUrl,
      'DELETE',
      `/api/auth/users/${IDS.agentUser}`,
      { headers: { Authorization: `Bearer ${ownerUserToken}`, 'Finance-ID': IDS.finance1A } }
    );
    assert.equal(validOwnerDelete.status, 200);
    assert.equal(state.users.get(IDS.agentUser).is_active, 0);
  });

  it('Rate limiting blocks brute-force failed login attempts after 10 failures', async () => {
    for (let i = 0; i < 10; i += 1) {
      const failRes = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
        body: { identifier: 'brute_target_user', password: 'WrongPassword!' },
      });
      assert.equal(failRes.status, 401);
    }

    const blockedRes = await apiRequest(baseUrl, 'POST', '/api/auth/direct-user-login', {
      body: { identifier: 'brute_target_user', password: 'WrongPassword!' },
    });
    assert.equal(blockedRes.status, 429);
    assert.equal(blockedRes.data.error_code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(Number(blockedRes.headers.get('retry-after')) >= 1);
  });
});
