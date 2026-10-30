// routes/reports/reports.controller.js
const svc = require('./reports.service');

// Helper to keep UUIDs as string, or integer as number
const toId = (val) => (val && /^\d+$/.test(String(val)) ? Number(val) : val);

// Helper: current financial year
function currentFY() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

exports.getTrialBalance = async (req, res) => {
  try {
    const { finance_id, financial_year } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.getTrialBalance(toId(finance_id), financial_year || currentFY());
    res.json({ success: true, data });
  } catch (err) {
    console.error('getTrialBalance error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDayBook = async (req, res) => {
  try {
    const { finance_id, from, to } = req.query;
    if (!finance_id || !from || !to) {
      return res.status(400).json({ success: false, message: 'finance_id, from, to required' });
    }
    const data = await svc.getDayBook(toId(finance_id), from, to);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getDayBook error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPnL = async (req, res) => {
  try {
    const { finance_id, financial_year } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.getPnL(toId(finance_id), financial_year || currentFY());
    res.json({ success: true, data });
  } catch (err) {
    console.error('getPnL error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBalanceSheet = async (req, res) => {
  try {
    const { finance_id, financial_year } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.getBalanceSheet(toId(finance_id), financial_year || currentFY());
    res.json({ success: true, data });
  } catch (err) {
    console.error('getBalanceSheet error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCashFlow = async (req, res) => {
  try {
    const { finance_id, from, to } = req.query;
    if (!finance_id || !from || !to) {
      return res.status(400).json({ success: false, message: 'finance_id, from, to required' });
    }
    const data = await svc.getCashFlow(toId(finance_id), from, to);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getCashFlow error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBalances = async (req, res) => {
  try {
    const financeId = req.financeId || req.query.finance_id;
    if (!financeId) return res.status(400).json({ success: false, message: 'finance_id required' });
    const { fromDate, toDate, search } = req.query;
    const data = await svc.getBalances(financeId, { fromDate, toDate, search });
    res.json({ success: true, data });
  } catch (err) {
    console.error('getBalances error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCharges = async (req, res) => {
  try {
    const financeId = req.financeId || req.query.finance_id;
    if (!financeId) return res.status(400).json({ success: false, message: 'finance_id required' });
    const result = await svc.getCharges(financeId, req.query);
    res.json({ success: true, data: result.rows, filters: result.filters });
  } catch (err) {
    console.error('getCharges error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCompliance = async (req, res) => {
  try {
    const financeId = req.financeId || req.query.finance_id;
    if (!financeId) return res.status(400).json({ success: false, message: 'finance_id required' });
    const { mode, search, fromDate, toDate } = req.query;
    const data = await svc.getCompliance(financeId, { mode, search, fromDate, toDate });
    res.json({ success: true, data });
  } catch (err) {
    console.error('getCompliance error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
