const svc = require('./group.service');

// Helper to keep UUIDs as clean strings
const cleanId = (val) => (val && typeof val === 'string' ? val.trim() : val);

// GET /api/ledger-groups/list
exports.getGroups = async (req, res) => {
  try {
    const finance_id = cleanId(req.financeId);
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    const data = await svc.getGroups(finance_id);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getGroups error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// GET /api/ledger-groups/under-dropdown
exports.getUnderDropdown = async (req, res) => {
  try {
    const finance_id = cleanId(req.financeId);
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    const data = await svc.getUnderDropdown(finance_id);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getUnderDropdown error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// POST /api/ledger-groups/create
exports.createGroup = async (req, res) => {
  try {
    const finance_id = cleanId(req.financeId);
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    const payload = { ...req.body, finance_id };
    const id = await svc.createGroup(payload);
    res.json({ success: true, id });
  } catch (err) {
    console.error('createGroup error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// PUT /api/ledger-groups/update/:id or /:id
exports.updateGroup = async (req, res) => {
  try {
    const finance_id = cleanId(req.financeId);
    const id = cleanId(req.params.id);
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: 'Group id missing' });
    }
    await svc.updateGroup(id, finance_id, req.body);
    res.json({ success: true, message: 'Group updated successfully' });
  } catch (err) {
    console.error('updateGroup error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// DELETE /api/ledger-groups/:id or /delete/:id
exports.deleteGroup = async (req, res) => {
  try {
    const finance_id = cleanId(req.financeId);
    const id = cleanId(req.params.id);
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: 'Group id missing' });
    }
    await svc.deleteGroup(id, finance_id);
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (err) {
    console.error('deleteGroup error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// POST /api/ledger-groups/multi-create
exports.multiCreateGroup = async (req, res) => {
  try {
    const fid = cleanId(req.financeId);
    const { groups } = req.body;
    if (!fid || !Array.isArray(groups) || !groups.length) {
      return res.status(400).json({ success: false, message: 'groups[] required' });
    }
    const results = await svc.multiCreateGroup(fid, groups);
    res.json({ success: true, results, ids: results.map(r => r.id) });
  } catch (err) {
    console.error('multiCreateGroup error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// POST /api/ledger-groups/multi-update
exports.multiUpdateGroup = async (req, res) => {
  try {
    const fid = cleanId(req.financeId);
    const { groups } = req.body;
    if (!fid || !Array.isArray(groups) || !groups.length) {
      return res.status(400).json({ success: false, message: 'groups[] required' });
    }
    await svc.multiUpdateGroup(fid, groups);
    res.json({ success: true, message: 'Groups updated successfully' });
  } catch (err) {
    console.error('multiUpdateGroup error:', err);
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};
