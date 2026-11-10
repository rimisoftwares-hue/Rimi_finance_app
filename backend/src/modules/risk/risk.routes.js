/**
 * risk.routes.js
 *
 * Dual-score customer risk endpoints (creditScore + dueRiskScore).
 * Mounted at /api/risk behind enhancedCheckFinance (routes/index.js), so every
 * handler can rely on req.financeId being a verified, active finance.
 */

const express = require('express');
const router = express.Router();
const service = require('./risk.service');

/**
 * 4xx errors carry a safe, user-facing message; 5xx errors are logged and
 * replaced with a generic message so SQL details never leak to the client.
 */
function sendError(res, err, fallbackMessage) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error(`${fallbackMessage}:`, err);
  }
  res.status(status).json({
    success: false,
    error: status >= 500 ? fallbackMessage : err.message,
  });
}

// 1. GET /alerts — portfolio risk summary + filtered customer list
//    Query: riskType (all|payment|credit|distance), riskLevel (all|critical|high|warning|safe),
//           agentId (all|unassigned|<uuid>), search
router.get('/alerts', async (req, res) => {
  try {
    const data = await service.getRiskAlerts(req.financeId, req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    sendError(res, err, 'Failed to fetch risk alerts');
  }
});

// 2. GET /customers/:customerId/deep-view — full risk profile for one customer
router.get('/customers/:customerId/deep-view', async (req, res) => {
  try {
    const data = await service.getCustomerDeepView(req.financeId, req.params.customerId);
    res.json({ success: true, ...data });
  } catch (err) {
    sendError(res, err, 'Failed to fetch customer deep view');
  }
});

// 3. GET /due-analysis — aging buckets, KPI totals and 6-month NPA/overdue trend
router.get('/due-analysis', async (req, res) => {
  try {
    const data = await service.getDueAnalysis(req.financeId);
    res.json({ success: true, ...data });
  } catch (err) {
    sendError(res, err, 'Failed to fetch due analysis');
  }
});

// 4. GET /credit-check — credit score + lending recommendation
//    Query: aadhar | phone | customerId (at least one required)
router.get('/credit-check', async (req, res) => {
  try {
    const data = await service.getCreditCheck(req.financeId, req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    sendError(res, err, 'Failed to run credit check');
  }
});

module.exports = router;

