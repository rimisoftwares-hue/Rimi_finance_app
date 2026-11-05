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

// Helper: default Indian financial year date range
function defaultFYDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const fyStartYear = month >= 4 ? year : year - 1;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    from: `${fyStartYear}-04-01`,
    to: `${year}-${pad(month)}-${pad(now.getDate())}`,
  };
}

// Helper: validate YYYY-MM-DD date string
function isValidDate(str) {
  if (!str || typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const d = new Date(str);
  return !isNaN(d.getTime());
}

exports.getTrialBalance = async (req, res) => {
  try {
    const financeId = req.financeId || req.headers['finance-id'] || req.query.finance_id;
    if (!financeId) {
      return res.status(400).json({ success: false, message: 'finance_id is required' });
    }

    let { from, to, financial_year } = req.query;

    if (!from || !to) {
      if (financial_year && /^\d{4}-\d{4}$/.test(financial_year)) {
        const [y1, y2] = financial_year.split('-');
        from = `${y1}-04-01`;
        to = `${y2}-03-31`;
      } else {
        const def = defaultFYDates();
        from = from || def.from;
        to = to || def.to;
      }
    }

    if (!isValidDate(from) || !isValidDate(to) || from > to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range: from and to must be valid YYYY-MM-DD strings and from <= to',
      });
    }

    const data = await svc.getTrialBalance(toId(financeId), { from, to });
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
    const financeId = req.financeId || req.headers['finance-id'] || req.query.finance_id;
    if (!financeId) {
      return res.status(400).json({ success: false, message: 'finance_id is required' });
    }

    let { from, to, financial_year } = req.query;

    if (!from || !to) {
      if (financial_year && /^\d{4}-\d{4}$/.test(financial_year)) {
        const [y1, y2] = financial_year.split('-');
        from = `${y1}-04-01`;
        to = `${y2}-03-31`;
      } else {
        const def = defaultFYDates();
        from = from || def.from;
        to = to || def.to;
      }
    }

    if (!isValidDate(from) || !isValidDate(to) || from > to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range: from and to must be valid YYYY-MM-DD strings and from <= to',
      });
    }

    const data = await svc.getPnL(toId(financeId), { from, to });
    res.json({ success: true, data });
  } catch (err) {
    console.error('getPnL error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBalanceSheet = async (req, res) => {
  try {
    const financeId = req.financeId || req.headers['finance-id'] || req.query.finance_id;
    if (!financeId) {
      return res.status(400).json({ success: false, message: 'finance_id is required' });
    }

    let asOfDate = req.query.as_of_date || req.query.as_on_date || req.query.date || req.query.asOf;

    if (!asOfDate) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      asOfDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    if (!isValidDate(asOfDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid as_of_date: must be a valid YYYY-MM-DD string',
      });
    }

    const data = await svc.getBalanceSheet(toId(financeId), { as_of_date: asOfDate });
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
