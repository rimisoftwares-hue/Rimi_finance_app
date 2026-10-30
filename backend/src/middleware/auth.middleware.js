const jwt = require('jsonwebtoken');
const { db } = require('../config/database.config');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const enhancedCheckFinance = async (req, res, next) => {
  try {
    let authHeader = req.headers.authorization;
    if (!authHeader && (req.headers['owner-authorization'] || req.headers['Owner-Authorization'])) {
      authHeader = req.headers['owner-authorization'] || req.headers['Owner-Authorization'];
    }
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token missing',
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    let decoded;

    // 1️⃣ VERIFY JWT (PRIMARY SOURCE)
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Attach user or owner to request
    if (decoded.owner) {
      req.owner = decoded.owner;
      req.user = {
        id: decoded.owner.id,
        username: decoded.owner.username,
        role: 'owner',
      };
      req.isOwner = true;
    } else {
      req.user = decoded.user;
    }

    let financeId = req.user?.current_finance_id;

    // 2️⃣ OPTIONAL HEADER OVERRIDE (AUTHORIZED ONLY)
    const headerFinanceId = req.headers['finance-id'];

    if (headerFinanceId) {
      const parsedFinanceId = String(headerFinanceId).trim();
      const isOwnerOrAdmin = req.user?.role === 'owner' || req.user?.role === 'admin' || req.isOwner;

      if (!isOwnerOrAdmin) {
        const allowedCompanies = (req.user?.allowed_companies || []).map(c => String(c).trim());
        if (!allowedCompanies.includes(parsedFinanceId)) {
          // Direct DB verification against user_allowed_companies junction table
          const uacCheck = await db.query(
            `SELECT 1 FROM user_allowed_companies WHERE user_id = $1 AND finance_id = $2 AND is_active = 1`,
            [req.user?.id, parsedFinanceId]
          );
          if (uacCheck.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: 'Not authorized for this finance company',
            });
          }
        }
      }

      financeId = parsedFinanceId;
    }

    // Fallback: If financeId not yet determined, but owner session is active, default to first active finance of owner
    if (!financeId && (req.isOwner || req.user?.role === 'owner') && (req.owner?.id || req.user?.id)) {
      const ownerId = req.owner?.id || req.user?.id;
      const defFin = await db.query(
        'SELECT id FROM finance_detail WHERE owner_id = $1 AND is_active = 1 ORDER BY id ASC LIMIT 1',
        [ownerId]
      );
      if (defFin.rows.length > 0) {
        financeId = String(defFin.rows[0].id);
      }
    }

    // 3️⃣ FINANCE ID MUST EXIST
    if (!financeId) {
      return res.status(400).json({
        success: false,
        error: 'Finance context missing',
      });
    }

    // Normalize once
    req.financeId = String(financeId).trim();

    // Guard: reject empty or literal 'undefined'/'null' finance IDs
    if (!req.financeId || req.financeId === 'undefined' || req.financeId === 'null') {
      return res.status(400).json({
        success: false,
        error: 'Invalid finance ID',
      });
    }

    // 4️⃣ VERIFY FINANCE EXISTS & ACTIVE - PostgreSQL syntax
    try {
      const result = await db.query(
        'SELECT id FROM finance_detail WHERE id = $1 AND is_active = 1',
        [req.financeId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Finance company not found or inactive',
        });
      }
    } catch (dbError) {
      // Handle database connection errors specifically
      if (dbError.code === 'ECONNRESET' || dbError.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Database connection lost during finance check');
        return res.status(503).json({
          success: false,
          error: 'Database connection issue. Please try again.',
          retry: true
        });
      }
      throw dbError;
    }

    // 5️⃣ ENFORCE LOGIN TIME RESTRICTIONS (mid-session)
    // Only applies to non-owner, non-admin users with a valid user ID
    const isOwnerOrAdmin = req.isOwner || req.user?.role === 'owner' || req.user?.role === 'admin';
    if (!isOwnerOrAdmin && req.user?.id) {
      try {
        const uacTimeCheck = await db.query(
          `SELECT login_time_from, login_time_to, role
           FROM user_allowed_companies
           WHERE user_id = $1 AND finance_id = $2 AND is_active = 1
           LIMIT 1`,
          [req.user.id, req.financeId]
        );

        if (uacTimeCheck.rows.length > 0) {
          const { login_time_from, login_time_to, role: companyRole } = uacTimeCheck.rows[0];
          const isCompanyOwnerOrAdmin = companyRole === 'owner' || companyRole === 'admin';

          if (!isCompanyOwnerOrAdmin && login_time_from && login_time_to) {
            // isWithinLoginWindow helper — inline to keep middleware self-contained
            const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
            const currentDate = new Date(now);
            const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

            const parseTime = (timeStr) => {
              const parts = String(timeStr).split(':');
              return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            };

            const fromMinutes = parseTime(login_time_from);
            const toMinutes = parseTime(login_time_to);

            let withinWindow;
            if (fromMinutes <= toMinutes) {
              withinWindow = currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
            } else {
              // Overnight shift (e.g., 22:00 to 06:00)
              withinWindow = currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
            }

            if (!withinWindow) {
              const formatTime = (t) => {
                const parts = String(t).split(':');
                const h = parseInt(parts[0], 10);
                const m = parts[1] || '00';
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;
                return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
              };
              return res.status(403).json({
                success: false,
                message: `Your authorized working hours are ${formatTime(login_time_from)} – ${formatTime(login_time_to)}. Access is restricted outside this window.`,
                error_code: 'LOGIN_TIME_RESTRICTED',
                allowed_from: String(login_time_from),
                allowed_to: String(login_time_to),
              });
            }
          }
        }
      } catch (timeCheckErr) {
        console.error('Login time check error (non-blocking):', timeCheckErr);
        // Non-blocking: allow request to proceed if time check fails due to DB issue
      }
    }

    // ✅ Finance context is valid
    next();
  } catch (error) {
    console.error('Finance middleware error:', error);

    if (error.code === 'ECONNRESET') {
      return res.status(503).json({
        success: false,
        error: 'Database connection lost. Please try again.',
        retry: true
      });
    }

    res.status(500).json({
      success: false,
      error: 'Finance verification failed',
    });
  }
};

// Middleware to authenticate JWT token
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('authHeader :', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token is not valid' });
  }
};

const checkFinance = async (req, res, next) => {
  try {
    const authHeader = req.headers['finance-authorization'];
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const decoded = jwt.verify(token, JWT_SECRET);
      req.financeId = decoded.finance?.id ? String(decoded.finance.id) : null;
      return next();
    }

    // Fallback: Support standard modern Authorization + finance-id via enhancedCheckFinance
    return enhancedCheckFinance(req, res, next);
  } catch (error) {
    res.status(401).json({ error: 'Invalid finance token' });
  }
};

// ─── Helper: Authenticate Owner Session from Headers ───────────────────────────
const resolveOwnerFromRequest = async (req) => {
  let token = null;

  // 1. Check Owner-Authorization header (Primary for Owner session)
  const ownerHeader = req.headers['owner-authorization'] || req.headers['Owner-Authorization'];
  if (ownerHeader) {
    token = ownerHeader.replace(/^Bearer\s+/i, '').trim();
  }

  // 2. Check standard Authorization header
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.replace(/^Bearer\s+/i, '').trim();
  }

  if (!token) {
    return { status: 401, error: 'Authentication token missing. Owner access required.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return { status: 401, error: 'Invalid or expired authorization token' };
  }

  // Case A: Token was issued for an Owner directly (e.g. from owner-login)
  if (decoded?.owner?.id) {
    const { rows } = await db.query(
      'SELECT id, username FROM owner WHERE id = $1 AND is_active = 1',
      [decoded.owner.id]
    );
    if (rows.length > 0) {
      return {
        owner: rows[0],
        user: { id: rows[0].id, username: rows[0].username, role: 'owner' },
        isOwner: true,
      };
    }
  }

  // Case B: Token was issued for a User with role === 'owner'
  if (decoded?.user?.id) {
    if (decoded.user.role === 'owner') {
      const { rows } = await db.query(
        `SELECT u.id, u.username, uac.role
         FROM users u
         JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.is_active = 1
         WHERE u.id = $1 AND u.is_active = 1 AND uac.role = 'owner'
         LIMIT 1`,
        [decoded.user.id]
      );
      if (rows.length > 0) {
        return {
          owner: { id: rows[0].id, username: rows[0].username },
          user: decoded.user,
          isOwner: true,
        };
      }
    }
  }

  // Case C: Owner ID in decoded root
  if (decoded?.id && !decoded.user) {
    const { rows } = await db.query(
      'SELECT id, username FROM owner WHERE id = $1 AND is_active = 1',
      [decoded.id]
    );
    if (rows.length > 0) {
      return {
        owner: rows[0],
        user: { id: rows[0].id, username: rows[0].username, role: 'owner' },
        isOwner: true,
      };
    }
  }

  return { status: 403, error: 'Access denied. Strictly restricted to account Owner.' };
};

// ─── Owner-Only Access Control Middleware ────────────────────────────────────
const ownerOnly = async (req, res, next) => {
  try {
    const result = await resolveOwnerFromRequest(req);
    if (!result.isOwner) {
      return res.status(result.status || 403).json({
        success: false,
        error: result.error,
      });
    }

    req.owner = result.owner;
    req.user = result.user;
    req.isOwner = true;
    return next();
  } catch (error) {
    console.error('ownerOnly middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Owner authorization verification failed',
    });
  }
};

// ─── Owner Finance Context & Ownership Guard ──────────────────────────────────
const ownerCheckFinance = async (req, res, next) => {
  try {
    const result = await resolveOwnerFromRequest(req);
    if (!result.isOwner) {
      return res.status(result.status || 403).json({
        success: false,
        error: result.error,
      });
    }

    req.owner = result.owner;
    req.user = result.user;
    req.isOwner = true;

    // Resolve target finance ID from header, params, query, or body
    let financeId = req.headers['finance-id'] ||
      req.headers['Finance-ID'] ||
      req.params.financeId ||
      req.params.id ||
      req.query.financeId ||
      req.query.finance_id ||
      req.body?.financeId ||
      req.body?.finance_id;

    // If no financeId provided, default to the owner's first active finance company
    if (!financeId || String(financeId).trim() === '' || financeId === 'undefined' || financeId === 'null') {
      const { rows: defaultFinances } = await db.query(
        'SELECT id, finance_name, is_active FROM finance_detail WHERE owner_id = $1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1',
        [req.owner.id]
      );
      if (defaultFinances.length > 0) {
        financeId = defaultFinances[0].id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'No active finance company found for this owner account.',
        });
      }
    }

    const normalizedFinanceId = String(financeId).trim();

    // STRICT OWNERSHIP VERIFICATION: Finance MUST belong to this authenticated owner
    const { rows: financeRows } = await db.query(
      'SELECT id, finance_name, is_active, owner_id FROM finance_detail WHERE id = $1 AND owner_id = $2 AND is_active = 1',
      [normalizedFinanceId, req.owner.id]
    );

    if (financeRows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You do not have owner authority over this finance company or it is inactive.',
      });
    }

    req.financeId = normalizedFinanceId;
    req.finance = financeRows[0];
    return next();
  } catch (err) {
    console.error('ownerCheckFinance error:', err);
    return res.status(500).json({
      success: false,
      error: 'Finance ownership verification failed',
    });
  }
};

module.exports = {
  authMiddleware,
  ownerOnly,
  ownerCheckFinance,
  checkFinance,
  enhancedCheckFinance
};