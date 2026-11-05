/**
 * areaAllocation.controller.js
 * 
 * HTTP request handlers for Agent Area Allocation.
 * Enforces tenant isolation and owner-only mutation permissions.
 */

const { db } = require('../../config/database.config');
const service = require('./areaAllocation.service');

/**
 * Enforces owner-only access for mutations.
 * Returns true if owner; sends 403 response and returns false otherwise.
 */
async function enforceOwner(req, res) {
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
    if (role !== 'owner') {
      res.status(403).json({ success: false, error: 'Access denied: Requires owner privileges' });
      return false;
    }

    return true;
  } catch (err) {
    console.error('Owner role verification error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to verify owner permissions' });
    return false;
  }
}

/**
 * GET /api/agents/area-allocations
 * Returns all agents with their allocations and metrics.
 */
async function getAllocatedAgents(req, res) {
  try {
    const financeId = req.financeId;
    if (!financeId) {
      return res.status(400).json({ success: false, error: 'Finance context is required' });
    }

    const agents = await service.getAllocatedAgents(financeId);

    res.json({
      success: true,
      data: agents,
    });
  } catch (err) {
    console.error('Error fetching allocated agents:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch allocated agents',
    });
  }
}

/**
 * GET /api/agents/area-allocations/agents
 * Returns active agents for modal agent selector.
 */
async function getActiveAgents(req, res) {
  try {
    const financeId = req.financeId;
    if (!financeId) {
      return res.status(400).json({ success: false, error: 'Finance context is required' });
    }

    const agents = await service.getActiveAgents(financeId);

    res.json({
      success: true,
      data: agents,
    });
  } catch (err) {
    console.error('Error fetching active agents:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch active agents',
    });
  }
}

/**
 * GET /api/agents/area-allocations/available-areas
 * Returns distinct areas with overlap and customer metrics.
 */
async function getAvailableAreas(req, res) {
  try {
    const financeId = req.financeId;
    if (!financeId) {
      return res.status(400).json({ success: false, error: 'Finance context is required' });
    }

    const areas = await service.getAvailableAreas(financeId);

    res.json({
      success: true,
      data: areas,
    });
  } catch (err) {
    console.error('Error fetching available areas:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to fetch available areas',
    });
  }
}

/**
 * POST /api/agents/area-allocations
 * Save or replace an agent's allocations (Owner only).
 */
async function postSaveAllocations(req, res) {
  try {
    const isAuthorized = await enforceOwner(req, res);
    if (!isAuthorized) return;

    const financeId = req.financeId;
    const { agentId, areas } = req.body;

    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    if (!Array.isArray(areas)) {
      return res.status(400).json({ success: false, error: 'areas must be an array' });
    }

    const currentUserId = req.user?.id || null;

    const result = await service.saveAgentAllocations(
      financeId,
      agentId,
      areas,
      currentUserId
    );

    res.json({
      success: true,
      message: 'Area allocations saved successfully',
      data: result,
    });
  } catch (err) {
    console.error('Error saving area allocations:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to save area allocations',
    });
  }
}

/**
 * DELETE /api/agents/area-allocations/agent/:agentId
 * Delete an agent's allocations (Owner only).
 */
async function deleteAllocations(req, res) {
  try {
    const isAuthorized = await enforceOwner(req, res);
    if (!isAuthorized) return;

    const financeId = req.financeId;
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    const result = await service.deleteAgentAllocations(financeId, agentId);

    res.json({
      success: true,
      message: 'Area allocations deleted successfully',
      data: result,
    });
  } catch (err) {
    console.error('Error deleting area allocations:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to delete area allocations',
    });
  }
}

module.exports = {
  enforceOwner,
  getAllocatedAgents,
  getActiveAgents,
  getAvailableAreas,
  postSaveAllocations,
  deleteAllocations,
};

