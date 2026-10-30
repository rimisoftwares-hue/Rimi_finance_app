// routes/ledger/ledger.controller.js
const svc = require('./ledger.service');

// Helper to keep UUIDs as string, or integer as number
const toId = (val) => (val && /^\d+$/.test(String(val)) ? Number(val) : val);

exports.createLedger = async (req, res) => {
  try {
    const { finance_id } = req.body;

    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const id = await svc.createLedger(req.body);
    res.json({ success: true, id });
  } catch (err) {
    console.error('createLedger error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { finance_id } = req.body;

    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    await svc.updateLedger(toId(id), toId(finance_id), req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('updateLedger error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { finance_id } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    await svc.deleteLedger(toId(id), toId(finance_id));
    res.json({ success: true });
  } catch (err) {
    console.error('deleteLedger error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.multiCreateLedger = async (req, res) => {
  try {
    const { ledgers } = req.body;
    const finance_id = req.financeId;
    if (!finance_id || !Array.isArray(ledgers) || !ledgers.length) {
      return res.status(400).json({ success: false, message: 'finance_id and ledgers[] required' });
    }
    const ids = await svc.multiCreateLedger(toId(finance_id), ledgers);
    res.json({ success: true, ids });
  } catch (err) {
    console.error('multiCreateLedger error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.listLedgers = async (req, res) => {
  try {
    const { finance_id, financial_year } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.listLedgers(toId(finance_id), financial_year);
    res.json({ success: true, data });
  } catch (err) {
    console.error('listLedgers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listLedgerGroups = async (req, res) => {
  try {

    const { finance_id } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.listLedgerGroups(toId(finance_id));
    res.json({ success: true, data });
  } catch (err) {
    console.error('listLedgerGroups error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getGroupLedgers = async (req, res) => {
  try {
    const { id } = req.params;
    const { finance_id } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.getGroupWithLedgers(toId(id), toId(finance_id));
    res.json({ success: true, data });
  } catch (err) {
    console.error('getGroupLedgers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createLedgerGroup = async (req, res) => {
  try {
    const id = await svc.createLedgerGroup(req.body);
    res.json({ success: true, id });
  } catch (err) {
    console.error('createLedgerGroup error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getLedgerSummary = async (req, res) => {
  try {
    const { finance_id, financial_year } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.getLedgerSummary(toId(finance_id), financial_year);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getLedgerSummary error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listVoucherTypes = async (req, res) => {
  try {
    const { finance_id } = req.query;
    if (!finance_id) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.listVoucherTypes(toId(finance_id));
    res.json({ success: true, data });
  } catch (err) {
    console.error('listVoucherTypes error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getLedgerStatement = async (req, res) => {
  try {
    const { id } = req.params;
    const { finance_id, from, to } = req.query;
    if (!finance_id || !from || !to) {
      return res.status(400).json({ success: false, message: 'finance_id, from, to required' });
    }
    const data = await svc.getLedgerStatement(toId(id), toId(finance_id), from, to);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getLedgerStatement error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRecentLedgers = async (req, res) => {
  try {
    const financeId = req.financeId;

    if (!financeId) return res.status(400).json({ success: false, message: 'finance_id required' });
    const data = await svc.getRecentLedgers(toId(financeId));
    res.json({ success: true, data });
  } catch (err) {
    console.error('getRecentLedgers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }

}

exports.getLedgerDetails = async (req, res) => {
  try {
    const financeId = req.financeId;
    const ledgerId = toId(req.params.ledgerId);

    if (!ledgerId) {
      return res.status(400).json({
        success: false,
        message: "Invalid Ledger ID",
      });
    }

    const ledger = await svc.getLedgerDetails(ledgerId, toId(financeId));

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: "Ledger not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ledger details fetched successfully",
      data: ledger,
    });

  } catch (error) {
    console.error("getLedgerDetails:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch ledger details",
      error: process.env.NODE_ENV === "development"
        ? error.message
        : undefined,
    });
  }
};