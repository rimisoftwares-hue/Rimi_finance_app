// backend/src/modules/accounting/vouchers/voucher.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('./voucher.controller');

// Read endpoints (registered before any wildcard or root routes)
router.get('/types', ctrl.getVoucherTypes);
router.get('/next-number', ctrl.getNextVoucherNumber);
router.get(['/', '/list'], ctrl.listVouchers);

// Write endpoints
router.post(['/', '/create'], ctrl.createVoucher);
router.post('/multi-create', ctrl.multiCreateVoucher);

module.exports = router;
