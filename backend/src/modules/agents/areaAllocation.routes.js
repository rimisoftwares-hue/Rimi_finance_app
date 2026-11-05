/**
 * areaAllocation.routes.js
 * 
 * Express routes for Agent Area Allocation.
 * Fixed routes are mounted before parameterized routes.
 */

const express = require('express');
const router = express.Router();
const controller = require('./areaAllocation.controller');

// 1. GET / — all agents with allocations and metrics
router.get('/', controller.getAllocatedAgents);

// 2. GET /agents — active agents for modal agent selector
router.get('/agents', controller.getActiveAgents);

// 3. GET /available-areas — distinct customer current address areas with overlap data
router.get('/available-areas', controller.getAvailableAreas);

// 4. POST / — save or replace allocations for an agent (Owner only)
router.post('/', controller.postSaveAllocations);

// 5. DELETE /agent/:agentId — delete agent allocations (Owner only)
router.delete('/agent/:agentId', controller.deleteAllocations);

module.exports = router;

