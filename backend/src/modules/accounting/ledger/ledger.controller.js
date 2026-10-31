// routes/ledger/ledger.controller.js
const svc = require('./ledger.service');

function handleError(res, err, defaultMsg) {
  console.error(`${defaultMsg}:`, err);
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: err.message || 'Ledger name already exists in this company',
    });
  }
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: err.message || 'Referenced group or parent record does not exist',
    });
  }
  if (err.code === '22P02') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID or parameter format',
    });
  }
  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      message: err.message || 'Check constraint violation',
    });
  }
  return res.status(400).json({
    success: false,
    message: err.message || defaultMsg,
  });
}

exports.createLedger = async (req, res) => {
  try {
    const finance_id = req.financeId || req.body.finance_id;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const id = await svc.createLedger({ ...req.body, finance_id });
    res.json({ success: true, id });
  } catch (err) {
    handleError(res, err, 'createLedger error');
  }
};

exports.updateLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const finance_id = req.financeId || req.body.finance_id;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    await svc.updateLedger(id, finance_id, req.body);
    res.json({ success: true, message: 'Ledger updated successfully' });
  } catch (err) {
    handleError(res, err, 'updateLedger error');
  }
};

exports.deleteLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const finance_id = req.financeId || req.query.finance_id;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    await svc.deleteLedger(id, finance_id);
    res.json({ success: true, message: 'Ledger deleted successfully' });
  } catch (err) {
    handleError(res, err, 'deleteLedger error');
  }
};

exports.multiCreateLedger = async (req, res) => {
  try {
    const { ledgers } = req.body;
    const finance_id = req.financeId || req.body.finance_id;
    if (!finance_id || !Array.isArray(ledgers) || !ledgers.length) {
      return res.status(400).json({ success: false, message: 'finance_id and ledgers[] required' });
    }
    const ids = await svc.multiCreateLedger(finance_id, ledgers);
    res.json({ success: true, ids, count: ids.length });
  } catch (err) {
    handleError(res, err, 'multiCreateLedger error');
  }
};

exports.listLedgers = async (req, res) => {
  try {
    const finance_id = req.financeId || req.query.finance_id;
    const { financial_year } = req.query;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const data = await svc.listLedgers(finance_id, financial_year);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'listLedgers error');
  }
};

exports.listLedgerGroups = async (req, res) => {
  try {
    const finance_id = req.financeId || req.query.finance_id;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const data = await svc.listLedgerGroups(finance_id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'listLedgerGroups error');
  }
};

exports.getGroupLedgers = async (req, res) => {
  try {
    const { id } = req.params;
    const finance_id = req.financeId || req.query.finance_id;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const data = await svc.getGroupWithLedgers(id, finance_id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'getGroupLedgers error');
  }
};

exports.createLedgerGroup = async (req, res) => {
  try {
    const finance_id = req.financeId || req.body.finance_id;
    const id = await svc.createLedgerGroup({ ...req.body, finance_id });
    res.json({ success: true, id });
  } catch (err) {
    handleError(res, err, 'createLedgerGroup error');
  }
};

exports.getLedgerSummary = async (req, res) => {
  try {
    const finance_id = req.financeId || req.query.finance_id;
    const { financial_year } = req.query;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const data = await svc.getLedgerSummary(finance_id, financial_year);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'getLedgerSummary error');
  }
};

exports.listVoucherTypes = async (req, res) => {
  try {
    const finance_id = req.financeId || req.query.finance_id;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const data = await svc.listVoucherTypes(finance_id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'listVoucherTypes error');
  }
};

exports.getLedgerStatement = async (req, res) => {
  try {
    const { id } = req.params;
    const finance_id = req.financeId || req.query.finance_id;
    const { from, to } = req.query;
    if (!finance_id || !from || !to) {
      return res.status(400).json({ success: false, message: 'finance_id, from, to required' });
    }
    const data = await svc.getLedgerStatement(id, finance_id, from, to);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'getLedgerStatement error');
  }
};

exports.getRecentLedgers = async (req, res) => {
  try {
    const finance_id = req.financeId || req.query.finance_id;
    const limit = req.query.limit || 10;
    if (!finance_id) {
      return res.status(400).json({ success: false, message: 'finance_id required' });
    }
    const data = await svc.getRecentLedgers(finance_id, limit);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'getRecentLedgers error');
  }
};

exports.getLedgerDetails = async (req, res) => {
  try {
    const finance_id = req.financeId || req.query.finance_id;
    const { ledgerId } = req.params;

    if (!ledgerId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ledger ID',
      });
    }

    const ledger = await svc.getLedgerDetails(ledgerId, finance_id);

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Ledger details fetched successfully',
      data: ledger,
    });
  } catch (err) {
    handleError(res, err, 'getLedgerDetails error');
  }
};
