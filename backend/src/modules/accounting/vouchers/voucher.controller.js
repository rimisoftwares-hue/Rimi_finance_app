// backend/src/modules/accounting/vouchers/voucher.controller.js
const svc = require('./voucher.service');

function handleError(err, res) {
  console.error('Voucher controller error:', err);

  const status = err.statusCode || (err.code === '23505' || err.code === 'FY_LOCKED' ? 409 : 400);

  let message = err.message || 'An unexpected error occurred';
  if (err.code === '23505') {
    message = err.message.includes('already exists') ? err.message : 'Voucher number already exists for this company';
  } else if (err.code === '23503') {
    message = err.message || 'Referenced ledger or voucher type does not exist';
  } else if (err.code === '22P02') {
    message = 'Invalid ID or value format';
  } else if (err.code === '23514') {
    message = 'Data check constraint violation';
  } else if (err.code === 'P0001') {
    message = err.message;
  }

  return res.status(status).json({
    success: false,
    message,
    code: err.code || undefined,
  });
}

// ─── GET /vouchers/types ─────────────────────────────────────────────────────
exports.getVoucherTypes = async (req, res) => {
  try {
    const finance_id = req.financeId;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    const data = await svc.getVoucherTypes(finance_id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// ─── GET /vouchers/next-number ───────────────────────────────────────────────
exports.getNextVoucherNumber = async (req, res) => {
  try {
    const finance_id = req.financeId;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }
    const { type_id, date } = req.query;
    if (!type_id) {
      return res.status(400).json({ success: false, message: 'type_id is required' });
    }
    const data = await svc.getNextVoucherNumber(finance_id, { type_id, date });
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// ─── POST /vouchers/create or /vouchers ──────────────────────────────────────
exports.createVoucher = async (req, res) => {
  try {
    const finance_id = req.financeId;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }

    const created_by =
      req.user?.username ||
      req.user?.name ||
      req.user?.id ||
      req.headers['x-user-id'] ||
      'system';

    const result = await svc.createVoucher({
      finance_id,
      voucher_type_id: req.body.voucher_type_id,
      voucher_number: req.body.voucher_number,
      date: req.body.date,
      narration: req.body.narration,
      entries: req.body.entries,
      created_by,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: `Voucher ${result.voucher_number} posted successfully`,
    });
  } catch (err) {
    handleError(err, res);
  }
};

// ─── POST /vouchers/multi-create ─────────────────────────────────────────────
exports.multiCreateVoucher = async (req, res) => {
  try {
    const finance_id = req.financeId;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }

    const { vouchers } = req.body;
    if (!Array.isArray(vouchers) || !vouchers.length) {
      return res.status(400).json({ success: false, message: 'vouchers array is required and must not be empty' });
    }

    const created_by =
      req.user?.username ||
      req.user?.name ||
      req.user?.id ||
      'system';

    const results = await svc.multiCreateVoucher(finance_id, vouchers, created_by);
    res.status(201).json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (err) {
    handleError(err, res);
  }
};

// ─── GET /vouchers/list or /vouchers ─────────────────────────────────────────
exports.listVouchers = async (req, res) => {
  try {
    const finance_id = req.financeId;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'Finance context missing' });
    }

    const { from, to, type_id, status, search, limit, offset } = req.query;
    const result = await svc.listVouchers(finance_id, {
      from,
      to,
      type_id,
      status,
      search,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.data,
      total: result.total,
    });
  } catch (err) {
    handleError(err, res);
  }
};
