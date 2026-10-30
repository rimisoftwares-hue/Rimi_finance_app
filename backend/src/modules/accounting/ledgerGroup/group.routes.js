const express = require('express');
const router = express.Router();
const ctrl = require('./group.controller');

// GET    /api/ledger-groups/list            — fetch all groups (system + custom) for current finance
router.get('/list', ctrl.getGroups);

// GET    /api/ledger-groups/under-dropdown  — merged system + custom groups for parent picker
router.get('/under-dropdown', ctrl.getUnderDropdown);

// POST   /api/ledger-groups/create          — create a single group
router.post('/create', ctrl.createGroup);

// PUT    /api/ledger-groups/update/:id      — update a group (with alias for /:id)
router.put('/update/:id', ctrl.updateGroup);
router.put('/:id', ctrl.updateGroup);

// DELETE /api/ledger-groups/delete/:id      — delete a custom group (with alias for /:id)
router.delete('/delete/:id', ctrl.deleteGroup);
router.delete('/:id', ctrl.deleteGroup);

// POST   /api/ledger-groups/multi-create    — bulk create groups
router.post('/multi-create', ctrl.multiCreateGroup);

// POST   /api/ledger-groups/multi-update    — bulk update groups
router.post('/multi-update', ctrl.multiUpdateGroup);

module.exports = router;
