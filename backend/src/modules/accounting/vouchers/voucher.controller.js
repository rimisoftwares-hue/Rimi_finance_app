// routes/voucher/voucher.controller.js
const svc = require('./voucher.service');

// Helper to keep UUIDs as string, or integer as number
const toId = (val) => (val && /^\d+$/.test(String(val)) ? Number(val) : val);

exports.createVoucher = async (req, res) => {
  try {
    const id = await svc.createVoucher(req.body);
    res.json({ success: true, id });
  } catch (err) {
    console.error('createVoucher error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.multiCreateVoucher = async (req, res) => {
  try {
    const { finance_id, vouchers, created_by } = req.body;
    if (!finance_id || !Array.isArray(vouchers) || !vouchers.length) {
      return res.status(400).json({ success: false, message: 'finance_id and vouchers[] required' });
    }
    const ids = await svc.multiCreateVoucher(toId(finance_id), vouchers, created_by);
    res.json({ success: true, ids });
  } catch (err) {
    console.error('multiCreateVoucher error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.listVouchers = async (req, res) => {
  try {
    const { finance_id, from, to, type_id, status } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.listVouchers(toId(finance_id), { from, to, type_id, status });
    res.json({ success: true, data });
  } catch (err) {
    console.error('listVouchers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};