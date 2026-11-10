// routes/reports/reports.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('./reports.controller');

router.get('/trial-balance',  ctrl.getTrialBalance);
router.get('/daybook',        ctrl.getDayBook);
router.get('/pnl',            ctrl.getPnL);
router.get('/balance-sheet',  ctrl.getBalanceSheet);
router.get('/cash-flow',      ctrl.getCashFlow);
router.get('/balances',       ctrl.getBalances);
router.get('/charges',        ctrl.getCharges);
router.get('/compliance',     ctrl.getCompliance);
router.get('/demand',         ctrl.getDemand);
router.get('/business',       ctrl.getBusinessReport);

module.exports = router;
