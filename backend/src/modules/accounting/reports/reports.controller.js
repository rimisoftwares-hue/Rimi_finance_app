// routes/reports/reports.controller.js
const svc = require('./reports.service');
const { parseYmdParts } = require('./demand.calculator');
const { diffMonthsInclusive } = require('./business.calculator');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEMAND_RANGE_DAYS = 1827; // ~5 years (including leap days)
const MAX_BUSINESS_RANGE_DAYS = 3653; // ~10 years (including leap days)
const MAX_BUSINESS_RANGE_MONTHS = 120; // 10 years (120 calendar months)

function getFinanceId(req) {
  return (
    req.financeId ||
    req.user?.finance_id ||
    req.user?.financeId ||
    req.headers?.['finance-id'] ||
    req.headers?.['x-finance-id']
  );
}

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

exports.getDemand = async (req, res) => {
  try {
    const financeId = getFinanceId(req);
    if (!financeId || !UUID_REGEX.test(String(financeId))) {
      throw new ValidationError('Valid finance_id is required');
    }

    const fromRaw = req.query.from ?? req.query.fromDate;
    const toRaw = req.query.to ?? req.query.toDate;

    let fromParts = null;
    if (fromRaw !== undefined && String(fromRaw).trim() !== '') {
      const fromStr = String(fromRaw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
        throw new ValidationError('from must be a valid YYYY-MM-DD date');
      }
      fromParts = parseYmdParts(fromStr);
      if (!fromParts) {
        throw new ValidationError('from must be a real calendar date in YYYY-MM-DD format');
      }
    }

    let toParts = null;
    if (toRaw !== undefined && String(toRaw).trim() !== '') {
      const toStr = String(toRaw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
        throw new ValidationError('to must be a valid YYYY-MM-DD date');
      }
      toParts = parseYmdParts(toStr);
      if (!toParts) {
        throw new ValidationError('to must be a real calendar date in YYYY-MM-DD format');
      }
    }

    if (fromParts && toParts) {
      if (fromParts.ymd > toParts.ymd) {
        throw new ValidationError('Invalid date range: from must be less than or equal to to');
      }

      const fromUtcMs = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
      const toUtcMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
      const diffDays = Math.round((toUtcMs - fromUtcMs) / (1000 * 60 * 60 * 24));
      if (diffDays > MAX_DEMAND_RANGE_DAYS) {
        throw new ValidationError('Date range cannot exceed 5 years');
      }
    }

    const data = await svc.getDemandStatement(
      String(financeId),
      fromParts ? fromParts.ymd : null,
      toParts ? toParts.ymd : null
    );

    return res.json({ success: true, data });
  } catch (err) {
    if (err instanceof ValidationError || err.statusCode === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('getDemand error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/reports/business
 *
 * Returns the database-driven Business & Revenue Report for the caller's finance.
 * Note on Basis (Decision A):
 * - Collections (`principal`, `interest`, `defaultAmt`, `handLoan`, `totalCollection`)
 *   are bucketed by `payment_date` month in `Asia/Kolkata` (cash basis).
 * - Disbursements (`hpCount`, `loanAmount`) and `docCharge` are bucketed by
 *   `hp_date` month in `Asia/Kolkata` (loan origination date basis).
 * - `netIncome` (`interest + defaultAmt + docCharge`) mixes cash-basis collections
 *   with loan-date documentation charges.
 * - Any `from`/`to` range is snapped to whole calendar months (Decision C).
 */
exports.getBusinessReport = async (req, res) => {
  try {
    if (
      req.query?.financeId !== undefined ||
      req.query?.finance_id !== undefined ||
      req.body?.financeId !== undefined ||
      req.body?.finance_id !== undefined
    ) {
      throw new ValidationError(
        'financeId parameter is not accepted; finance is determined from authenticated context'
      );
    }

    const financeId = getFinanceId(req);
    if (!financeId || !UUID_REGEX.test(String(financeId))) {
      throw new ValidationError('Valid finance_id is required from authenticated context');
    }

    const fromRaw = req.query?.from ?? req.query?.fromDate;
    const toRaw = req.query?.to ?? req.query?.toDate;

    let fromParts = null;
    if (fromRaw !== undefined && String(fromRaw).trim() !== '') {
      const fromStr = String(fromRaw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
        throw new ValidationError('from must be a valid YYYY-MM-DD date');
      }
      fromParts = parseYmdParts(fromStr);
      if (!fromParts) {
        throw new ValidationError('from must be a real calendar date in YYYY-MM-DD format');
      }
    }

    let toParts = null;
    if (toRaw !== undefined && String(toRaw).trim() !== '') {
      const toStr = String(toRaw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
        throw new ValidationError('to must be a valid YYYY-MM-DD date');
      }
      toParts = parseYmdParts(toStr);
      if (!toParts) {
        throw new ValidationError('to must be a real calendar date in YYYY-MM-DD format');
      }
    }

    if (fromParts && toParts) {
      if (fromParts.ymd > toParts.ymd) {
        throw new ValidationError('Invalid date range: from must be less than or equal to to');
      }

      const fromUtcMs = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
      const toUtcMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
      const diffDays = Math.round((toUtcMs - fromUtcMs) / (1000 * 60 * 60 * 24));
      const spanMonths = diffMonthsInclusive(
        fromParts.ymd.slice(0, 7),
        toParts.ymd.slice(0, 7)
      );
      if (diffDays > MAX_BUSINESS_RANGE_DAYS || spanMonths > MAX_BUSINESS_RANGE_MONTHS) {
        throw new ValidationError('Date range cannot exceed 10 years (120 months)');
      }
    }

    const data = await svc.getBusinessReport(
      String(financeId),
      fromParts ? fromParts.ymd : null,
      toParts ? toParts.ymd : null
    );

    if (
      data?.monthKeys?.effective &&
      data.monthKeys.effective.length > MAX_BUSINESS_RANGE_MONTHS
    ) {
      throw new ValidationError('Date range cannot exceed 10 years (120 months)');
    }

    return res.json({ success: true, data });
  } catch (err) {
    if (err instanceof ValidationError || err.statusCode === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('getBusinessReport error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.ValidationError = ValidationError;

