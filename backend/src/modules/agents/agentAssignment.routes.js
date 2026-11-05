/**
 * agentAssignment.routes.js
 * 
 * Express routes for customer-to-agent assignment.
 * Fixed routes are declared before parameterized routes.
 */

const express = require('express');
const router = express.Router();
const controller = require('./agentAssignment.controller');
const historyController = require('./assignmentHistory.controller');

// 1. GET /customers — unpaid customers for assignment with filter & pagination
router.get('/customers', controller.getCustomers);

// 2. GET /agents — assignable agents with workload
router.get('/agents', controller.getAgents);

// 3. POST /assign — bulk assign customers to agent
router.post('/assign', controller.postAssign);

// 4. GET /history — batch assignment history with KPIs
router.get('/history', historyController.getHistory);

// 5. GET /history/:agentId/details — detailed customer rows for a batch
router.get('/history/:agentId/details', historyController.getHistoryDetails);

// 6. GET /agents/:agentId/run-sheet — printable field run-sheet data
router.get('/agents/:agentId/run-sheet', controller.getRunSheet);

module.exports = router;

