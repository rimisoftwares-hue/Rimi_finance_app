// routes/ledger/ledger.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('./ledger.controller');

// â”€â”€â”€ Ledger CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/create', ctrl.createLedger);
router.post('/multi-create', ctrl.multiCreateLedger);
router.get('/list', ctrl.listLedgers);
router.put('/update/:id', ctrl.updateLedger);
router.delete('/delete/:id', ctrl.deleteLedger);

// â”€â”€â”€ Groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/groups', ctrl.listLedgerGroups);
router.post('/groups/create', ctrl.createLedgerGroup);
router.get('/group/:id', ctrl.getGroupLedgers);    // group + nested ledgers

// â”€â”€â”€ Summary & Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/summary', ctrl.getLedgerSummary);   // { totalDr, totalCr, openingBalance, closingBalance }
router.get('/voucher-types', ctrl.listVoucherTypes);
router.get('/recent-ledgers', ctrl.getRecentLedgers);
router.get('/:id/statement', ctrl.getLedgerStatement);
router.get('/:ledgerId/details', ctrl.getLedgerDetails);


module.exports = router;
