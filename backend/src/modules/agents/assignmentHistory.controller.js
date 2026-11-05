/**
 * assignmentHistory.controller.js
 * 
 * HTTP request handlers for Assignment History.
 * Enforces tenant isolation, role-based visibility, and date defaults.
 */

const { db } = require('../../config/database.config');
const service = require('./assignmentHistory.service');

/**
 * Helper to determine user's role in the finance context.
 */
async function getUserRole(req) {
  if (req.isOwner || req.user?.role === 'owner') {
    return 'owner';
  }

  const userId = req.user?.id;
  const financeId = req.financeId;

  if (!userId || !financeId) {
    return null;
  }

  try {
    const { rows } = await db.query(
      `SELECT role 
       FROM user_allowed_companies 
       WHERE user_id = $1::uuid AND finance_id = $2::uuid AND is_active = 1
       LIMIT 1`,
      [userId, financeId]
    );

    if (rows.length === 0) return null;
    return rows[0].role;
  } catch (err) {
    console.error('Error resolving user role:', err.message);
    return null;
  }
}

/**
 * GET /api/agent-assignments/history
 * Query params: dateFrom, dateTo, agentId
 */
async function getHistory(req, res) {
  try {
    const financeId = req.financeId;
    if (!financeId) {
      return res.status(400).json({ success: false, error: 'Finance context is required' });
    }

    const role = await getUserRole(req);
    if (!role) {
      return res.status(403).json({ success: false, error: 'Access denied: User is not authorized for this finance company' });
    }

    let { dateFrom, dateTo, agentId } = req.query;

    // Apply defaults if dateFrom or dateTo are missing
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');

    if (!dateFrom) {
      dateFrom = `${currentYear}-${currentMonth}-01`;
    }
    if (!dateTo) {
      dateTo = `${currentYear}-${currentMonth}-${currentDay}`;
    }

    // Role restriction: Agent can only view their own assignments
    if (role === 'agent') {
      agentId = req.user?.id;
    }

    const result = await service.getAssignmentHistory(financeId, {
      dateFrom,
      dateTo,
      agentId: agentId || null,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Error fetching assignment history:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch assignment history',
    });
  }
}

/**
 * GET /api/agent-assignments/history/:agentId/details
 * Query params: date, targetDate, assignedBy
 */
async function getHistoryDetails(req, res) {
  try {
    const financeId = req.financeId;
    if (!financeId) {
      return res.status(400).json({ success: false, error: 'Finance context is required' });
    }

    const role = await getUserRole(req);
    if (!role) {
      return res.status(403).json({ success: false, error: 'Access denied: User is not authorized for this finance company' });
    }

    const { agentId } = req.params;
    const { date, targetDate, assignedBy } = req.query;

    // Agent can only see their own batch details
    if (role === 'agent' && req.user?.id !== agentId) {
      return res.status(403).json({ success: false, error: 'Access denied: You can only view your own assignment details' });
    }

    const result = await service.getAssignmentBatchDetails(financeId, {
      agentId,
      date,
      targetDate: targetDate || null,
      assignedBy: assignedBy || null,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Error fetching assignment batch details:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch assignment batch details',
    });
  }
}

module.exports = {
  getHistory,
  getHistoryDetails,
};

