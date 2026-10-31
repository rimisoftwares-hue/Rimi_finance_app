// routes/ledger/ledger.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('./ledger.controller');

// ─── Fixed-Path Routes (registered BEFORE any /:id route) ────────────────────
router.post('/create', ctrl.createLedger);
router.post('/multi-create', ctrl.multiCreateLedger);
router.get('/list', ctrl.listLedgers);
router.get('/list-balances', ctrl.listLedgers);
router.get('/groups', ctrl.listLedgerGroups);
router.post('/groups/create', ctrl.createLedgerGroup);
router.get('/summary', ctrl.getLedgerSummary);
router.get('/view-details', ctrl.getLedgerViewDetails);
router.get('/voucher-types', ctrl.listVoucherTypes);
router.get('/recent-ledgers', ctrl.getRecentLedgers);

// ─── Parameterized Routes ────────────────────────────────────────────────────
router.put('/update/:id', ctrl.updateLedger);
router.delete('/delete/:id', ctrl.deleteLedger);
router.get('/group/:id', ctrl.getGroupLedgers);
router.get('/:id/statement', ctrl.getLedgerStatement);
router.get('/:id/monthly', ctrl.getLedgerMonthly);
router.get('/:ledgerId/details', ctrl.getLedgerDetails);

module.exports = router;
