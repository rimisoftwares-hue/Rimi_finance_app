const express = require('express');
const router = express.Router();
const ctrl = require('./group.controller');

// GET    /api/ledger-groups/list  — fetch all groups for current finance (finance_id from JWT via enhancedCheckFinance)
router.get('/list', ctrl.getGroups);
router.get('/under-dropdown', ctrl.getUnderDropdown);
// POST   /api/ledger-groups/create             — create a single group
router.post('/create', ctrl.createGroup);

// POST   /api/ledger-groups/multi-create       — bulk create groups
router.post('/multi-create', ctrl.multiCreateGroup);

// POST   /api/ledger-groups/multi-update       — bulk update groups
router.post('/multi-update', ctrl.multiUpdateGroup);

module.exports = router;