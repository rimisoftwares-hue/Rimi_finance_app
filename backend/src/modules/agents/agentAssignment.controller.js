/**
 * agentAssignment.controller.js
 * 
 * HTTP request handlers for customer-agent assignment module.
 */

const { db } = require('../../config/database.config');
const service = require('./agentAssignment.service');

/**
 * Enforces admin/owner role for the active finance context.
 * Rejects agents and unauthorized users with 403 Forbidden.
 */
async function enforceOwnerOrAdmin(req, res) {
  if (req.isOwner || req.user?.role === 'owner') {
    return true;
  }

  const userId = req.user?.id;
  const financeId = req.financeId;

  if (!userId || !financeId) {
    res.status(403).json({ success: false, error: 'Access denied: Authentication context missing' });
    return false;
  }

  try {
    const { rows } = await db.query(
      `SELECT role 
       FROM user_allowed_companies 
       WHERE user_id = $1::uuid AND finance_id = $2::uuid AND is_active = 1
       LIMIT 1`,
      [userId, financeId]
    );

    if (rows.length === 0) {
      res.status(403).json({ success: false, error: 'Access denied: User is not authorized for this finance company' });
      return false;
    }

    const role = rows[0].role;
    if (role !== 'owner' && role !== 'admin') {
      res.status(403).json({ success: false, error: 'Access denied: Requires owner or admin privileges' });
      return false;
    }

    return true;
  } catch (err) {
    console.error('Role verification error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to verify user permissions' });
    return false;
  }
}

/**
 * GET /agent-assignments/customers
 */
async function getCustomers(req, res) {
  try {
    const authorized = await enforceOwnerOrAdmin(req, res);
    if (!authorized) return;

    const financeId = req.financeId;
    const { rows, total } = await service.getAssignableCustomers(financeId, req.query);

    res.json({
      success: true,
      data: rows,
      total,
    });
  } catch (err) {
    console.error('Error fetching assignable customers:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch assignable customers',
    });
  }
}

/**
 * GET /agent-assignments/agents
 */
async function getAgents(req, res) {
  try {
    const authorized = await enforceOwnerOrAdmin(req, res);
    if (!authorized) return;

    const financeId = req.financeId;
    const agents = await service.getAgentsWorkload(financeId);

    res.json({
      success: true,
      data: agents,
    });
  } catch (err) {
    console.error('Error fetching agents workload:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch agents workload',
    });
  }
}

/**
 * POST /agent-assignments/assign
 */
async function postAssign(req, res) {
  try {
    const authorized = await enforceOwnerOrAdmin(req, res);
    if (!authorized) return;

    const financeId = req.financeId;
    const assignedByUserId = req.user?.id;

    if (!assignedByUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authenticated user identifier missing from request',
      });
    }

    const result = await service.assignCustomers(financeId, assignedByUserId, req.body);
    res.json(result);
  } catch (err) {
    console.error('Error assigning customers:', err.message);
    const status = err.statusCode || (err.code === '23505' ? 409 : 500);
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to assign customers to agent',
    });
  }
}

/**
 * GET /agent-assignments/agents/:agentId/run-sheet
 */
async function getRunSheet(req, res) {
  try {
    const authorized = await enforceOwnerOrAdmin(req, res);
    if (!authorized) return;

    const financeId = req.financeId;
    const { agentId } = req.params;

    const runSheetData = await service.getAgentRunSheet(financeId, agentId);

    res.json({
      success: true,
      data: runSheetData,
    });
  } catch (err) {
    console.error('Error generating agent run-sheet:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to generate agent run-sheet',
    });
  }
}

module.exports = {
  enforceOwnerOrAdmin,
  getCustomers,
  getAgents,
  postAssign,
  getRunSheet,
};

