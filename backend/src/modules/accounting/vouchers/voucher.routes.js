// routes/voucher/voucher.routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('./voucher.controller');

router.post(['/', '/create'],       ctrl.createVoucher);
router.post('/multi-create', ctrl.multiCreateVoucher);
router.get(['/', '/list'],          ctrl.listVouchers);

module.exports = router;