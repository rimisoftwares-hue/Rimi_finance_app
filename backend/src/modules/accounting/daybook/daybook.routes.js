// backend/src/modules/accounting/daybook/daybook.routes.js
// Mounted at /accounting/daybook behind enhancedCheckFinance (req.financeId).
const express = require('express');
const router = express.Router();
const ctrl = require('./daybook.controller');

router.get('/transactions', ctrl.getTransactions);
router.get('/voucher/:voucherNumber', ctrl.getVoucher);
router.get('/ledger-monthly', ctrl.getLedgerMonthly);
router.get('/month-voucher-types', ctrl.getMonthVoucherTypes);
router.get('/month-vouchers', ctrl.getMonthVouchers);

module.exports = router;

