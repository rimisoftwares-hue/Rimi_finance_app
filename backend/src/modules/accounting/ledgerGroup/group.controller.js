const svc = require('./group.service');

// Helper to keep UUIDs as string, or integer as number
const toId = (val) => (val && /^\d+$/.test(String(val)) ? Number(val) : val);

// GET /api/ledger-groups/list
exports.getGroups = async (req, res) => {
  try {
    const finance_id = req.financeId; // set by enhancedCheckFinance middleware
    console.log('finance_id:', finance_id);
    const rows = await svc.getGroups(toId(finance_id));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getGroups error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getUnderDropdown = async (req, res) => {
  try {
    const finance_id = req.financeId; // set by enhancedCheckFinance middleware
    console.log('finance_id getUnderDropdown:', finance_id);

    const rows = await svc.getUnderDropdown(toId(finance_id));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getUnderDropdown error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/ledger-groups/create
exports.createGroup = async (req, res) => {
  try {
    const payload = { ...req.body, finance_id: req.financeId }; // always use middleware-injected financeId
    const id = await svc.createGroup(payload);
    res.json({ success: true, id });
  } catch (err) {
    console.error('createGroup error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/ledger-groups/multi-create
exports.multiCreateGroup = async (req, res) => {
  try {
    const fid = req.financeId; // always use middleware-injected financeId
    const { groups } = req.body;
    if (!fid || !Array.isArray(groups) || !groups.length) {
      return res.status(400).json({ success: false, message: 'groups[] required' });
    }
    const ids = await svc.multiCreateGroup(toId(fid), groups);
    res.json({ success: true, ids });
  } catch (err) {
    console.error('multiCreateGroup error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/ledger-groups/multi-update
exports.multiUpdateGroup = async (req, res) => {
  try {
    const fid = req.financeId; // always use middleware-injected financeId
    const { groups } = req.body;
    if (!fid || !Array.isArray(groups) || !groups.length) {
      return res.status(400).json({ success: false, message: 'groups[] required' });
    }
    await svc.multiUpdateGroup(toId(fid), groups);
    res.json({ success: true });
  } catch (err) {
    console.error('multiUpdateGroup error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};