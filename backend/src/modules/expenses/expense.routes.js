const express = require('express');
const router = express.Router();
const { db } = require('../../config/database.config');
const { enhancedCheckFinance } = require('../../middleware/auth.middleware');

// ─── GET all office expenses for a finance ──────────────────────────────────
router.get(['/', '/office-expenses'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { type, from, to, enteredBy, search } = req.query;

    let query = `
      SELECT id, transaction_type, expense_date, category, description,
             amount, entered_by, created_at
      FROM office_expenses
      WHERE finance_id = $1
    `;
    const params = [financeId];

    if (type && type !== 'all') {
      params.push(type === 'income' ? 'Income' : 'Expense');
      query += ` AND transaction_type = $${params.length}`;
    }
    if (from) {
      params.push(from);
      query += ` AND expense_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND expense_date <= $${params.length}`;
    }
    if (enteredBy) {
      params.push(enteredBy);
      query += ` AND entered_by = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (category ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    query += ` ORDER BY expense_date DESC, created_at DESC`;

    const { rows } = await db.query(query, params);

    // Normalise to camelCase for the frontend
    const data = rows.map(r => ({
      id: r.id,
      type: r.transaction_type === 'Income' ? 'income' : 'expense',
      date: r.expense_date,
      category: r.category,
      description: r.description || '',
      amount: parseFloat(r.amount),
      enteredBy: r.entered_by,
      created_at: r.created_at
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('GET office-expenses error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch expenses' });
  }
});

// ─── GET distinct entered_by values for filter dropdown ─────────────────────
router.get(['/staff', '/office-expenses/staff'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { rows } = await db.query(
      `SELECT DISTINCT entered_by FROM office_expenses WHERE finance_id = $1 ORDER BY entered_by`,
      [financeId]
    );
    res.json({ success: true, staff: rows.map(r => r.entered_by) });
  } catch (err) {
    console.error('GET staff error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch staff list' });
  }
});

// ─── CREATE a new office expense ────────────────────────────────────────────
router.post(['/', '/office-expenses'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { type, date, category, description, amount, enteredBy } = req.body;

    if (!type || !date || !category || !amount || !enteredBy) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const { rows } = await db.query(
      `INSERT INTO office_expenses
        (finance_id, transaction_type, expense_date, category, description, amount, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        financeId,
        type === 'income' ? 'Income' : 'Expense',
        date,
        category,
        description || '',
        parseFloat(amount) || 0,
        enteredBy,
      ]
    );

    res.status(201).json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error('POST office-expenses error:', err);
    res.status(500).json({ success: false, error: 'Failed to create expense' });
  }
});

// ─── UPDATE an office expense ───────────────────────────────────────────────
router.put(['/:id', '/office-expenses/:id'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { id } = req.params;
    const { type, date, category, description, amount, enteredBy } = req.body;

    if (!type || !date || !category || !amount || !enteredBy) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await db.query(
      `UPDATE office_expenses
       SET transaction_type = $1, expense_date = $2, category = $3, description = $4,
           amount = $5, entered_by = $6, updated_at = NOW()
       WHERE id = $7 AND finance_id = $8`,
      [
        type === 'income' ? 'Income' : 'Expense',
        date,
        category,
        description || '',
        parseFloat(amount) || 0,
        enteredBy,
        id,
        financeId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT office-expenses error:', err);
    res.status(500).json({ success: false, error: 'Failed to update expense' });
  }
});

// ─── DELETE an office expense ───────────────────────────────────────────────
router.delete(['/:id', '/office-expenses/:id'], enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { id } = req.params;

    const result = await db.query(
      `DELETE FROM office_expenses WHERE id = $1 AND finance_id = $2`,
      [id, financeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE office-expenses error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
});

module.exports = router;
