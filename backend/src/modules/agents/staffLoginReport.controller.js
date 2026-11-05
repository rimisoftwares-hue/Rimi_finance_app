/**
 * staffLoginReport.controller.js
 *
 * HTTP controller for Staff Login Report.
 * Enforces owner/admin access control, validates parameters, and delegates to service.
 */

const { db } = require('../../config/database.config');
const service = require('./staffLoginReport.service');

/**
 * Resolves the authenticated user's role and verified owner status for the active finance context.
 *
 * @param {Object} req - Express request
 * @returns {Promise<{ role: string|null, isOwner: boolean }>}
 */
async function resolveUserRoleAndOwner(req) {
  // 1. Direct owner authentication via token
  if (req.isOwner || req.owner?.id) {
    return { role: 'owner', isOwner: true };
  }

  const userId = req.user?.id;
  const financeId = req.financeId;

  if (!userId || !financeId) {
    return { role: null, isOwner: false };
  }

  try {
    // 2. Check if userId matches owner table
    const ownerRes = await db.query(
      'SELECT id FROM owner WHERE id = $1',
      [userId]
    );
    if (ownerRes.rows.length > 0) {
      return { role: 'owner', isOwner: true };
    }

    // 3. Query user_allowed_companies for company-specific role
    const uacRes = await db.query(
      `SELECT role 
       FROM user_allowed_companies 
       WHERE user_id = $1::uuid AND finance_id = $2::uuid AND is_active = 1
       LIMIT 1`,
      [userId, financeId]
    );

    if (uacRes.rows.length === 0) {
      return { role: null, isOwner: false };
    }

    const role = uacRes.rows[0].role;
    const isOwner = role === 'owner';
    return { role, isOwner };
  } catch (err) {
    console.error('Error resolving user role/owner status in staff login report:', err.message);
    return { role: null, isOwner: false };
  }
}

/**
 * GET /api/agents/login-report
 */
async function getReport(req, res) {
  try {
    const financeId = req.financeId;
    if (!financeId) {
      return res.status(400).json({
        success: false,
        error: 'Finance context is required',
      });
    }

    // Authorization: Owner or Admin only
    const { role, isOwner } = await resolveUserRoleAndOwner(req);
    if (!role || (role !== 'owner' && role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only owner and admin can view staff login report',
      });
    }

    const { dateFrom, dateTo, role: filterRole, search, limit, offset } = req.query;

    const result = await service.getStaffLoginReport({
      financeId,
      dateFrom,
      dateTo,
      role: filterRole,
      search,
      isOwner,
      limit,
      offset,
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in staff login report controller:', err.message);
    const status = err.statusCode || (err.message && err.message.toLowerCase().includes('invalid') ? 400 : 500);
    return res.status(status).json({
      success: false,
      error: status === 400 ? err.message : 'Failed to retrieve staff login report',
    });
  }
}

module.exports = {
  getReport,
  resolveUserRoleAndOwner,
};

