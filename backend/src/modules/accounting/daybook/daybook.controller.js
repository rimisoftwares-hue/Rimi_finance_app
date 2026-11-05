// backend/src/modules/accounting/daybook/daybook.controller.js
const svc = require('./daybook.service');

function handleError(err, res) {
  let status = err.statusCode || 500;
  let message = err.message || 'An unexpected error occurred';

  // PostgreSQL invalid input (bad uuid / date / enum literal)
  if (!err.statusCode && ['22P02', '22007', '22008'].includes(err.code)) {
    status = 400;
    message = 'Invalid parameter value';
  }
  if (status >= 500) {
    console.error('DayBook controller error:', err);
    message = 'Failed to load Day Book data';
  }
  return res.status(status).json({ success: false, message });
}

function financeIdOr400(req, res) {
  const financeId = req.financeId;
  if (!financeId) {
    res.status(400).json({ success: false, message: 'Finance context missing' });
    return null;
  }
  return financeId;
}

// GET /accounting/daybook/transactions?from&to
exports.getTransactions = async (req, res) => {
  const financeId = financeIdOr400(req, res);
  if (!financeId) return;
  try {
    const { from, to } = req.query;
    const data = await svc.getTransactions(financeId, { from, to });
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// GET /accounting/daybook/voucher/:voucherNumber
exports.getVoucher = async (req, res) => {
  const financeId = financeIdOr400(req, res);
  if (!financeId) return;
  try {
    const data = await svc.getVoucherDetail(financeId, req.params.voucherNumber);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// GET /accounting/daybook/ledger-monthly?ledgerName&financialYear
exports.getLedgerMonthly = async (req, res) => {
  const financeId = financeIdOr400(req, res);
  if (!financeId) return;
  try {
    const { ledgerName, financialYear } = req.query;
    const data = await svc.getLedgerMonthly(financeId, { ledgerName, financialYear });
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// GET /accounting/daybook/month-voucher-types?ledgerName&monthKey
exports.getMonthVoucherTypes = async (req, res) => {
  const financeId = financeIdOr400(req, res);
  if (!financeId) return;
  try {
    const { ledgerName, monthKey } = req.query;
    const data = await svc.getMonthVoucherTypes(financeId, { ledgerName, monthKey });
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// GET /accounting/daybook/month-vouchers?ledgerName&monthKey&typeCode
exports.getMonthVouchers = async (req, res) => {
  const financeId = financeIdOr400(req, res);
  if (!financeId) return;
  try {
    const { ledgerName, monthKey, typeCode } = req.query;
    const data = await svc.getMonthVouchers(financeId, { ledgerName, monthKey, typeCode });
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

