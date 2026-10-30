const express = require('express');
const router = express.Router();
const { db } = require('../../../../config/database.config');
const { enhancedCheckFinance } = require('../../../../middleware/auth.middleware');

const validateGodownInput = (nameOrBody, contact_number) => {
  let name = nameOrBody;
  let contact = contact_number;
  if (nameOrBody && typeof nameOrBody === 'object') {
    name = nameOrBody.name || nameOrBody.godown_name;
    contact = nameOrBody.contact_number || nameOrBody.contactNumber;
  }
  if (!name || !String(name).trim()) {
    return { isValid: false, valid: false, error: 'Godown name is required' };
  }
  if (!contact || !String(contact).trim()) {
    return { isValid: false, valid: false, error: 'Contact number is required' };
  }
  const raw = String(contact).trim();
  if (/[a-zA-Z]/.test(raw) || /[^\d\s+\-()]/.test(raw)) {
    return { isValid: false, valid: false, error: 'Contact number must be exactly 10 digits' };
  }
  let str = raw.replace(/^\+91[\s\-]*/, '').replace(/^0/, '');
  let digits = str.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10) {
    return { isValid: false, valid: false, error: 'Contact number must be exactly 10 digits' };
  }
  return { isValid: true, valid: true, cleanDigits: digits, contactNumber: digits };
};

router.post(['/', '/add-godown'], enhancedCheckFinance, async (req, res) => {
  const { owner_id, name, address, contact_number, contact_person, city } = req.body;
  const financeId = req.financeId;

  const validation = validateGodownInput(name, contact_number);
  if (!validation.isValid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  try {
    let resolvedOwnerId = owner_id;
    if (!resolvedOwnerId) {
      const { rows: fdRows } = await db.query(
        'SELECT owner_id FROM finance_detail WHERE id = $1',
        [financeId]
      );
      resolvedOwnerId = fdRows[0]?.owner_id;
    }

    const { rows } = await db.query(
      'INSERT INTO godowns (owner_id, finance_id, name, address, contact_number, contact_person, city, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id',
      [resolvedOwnerId, financeId, name.trim(), address ? address.trim() : null, validation.cleanDigits, contact_person ? contact_person.trim() : null, city ? city.trim() : null]
    );
    res.json({ success: true, godown_id: rows[0]?.id });
  } catch (error) {
    console.error('Error adding godown:', error);
    res.status(500).json({ success: false, error: 'Failed to add godown' });
  }
});

router.get(['/', '/get-godowns'], enhancedCheckFinance, async (req, res) => {
  const financeId = req.financeId;
  try {
    const { rows } = await db.query(
      'SELECT * FROM godowns WHERE finance_id = $1 ORDER BY created_at DESC',
      [financeId]
    );
    res.json({ success: true, godowns: rows });
  } catch (error) {
    console.error('Error getting godowns:', error);
    res.status(500).json({ success: false, error: 'Failed to get godowns' });
  }
});

router.put(['/update-godown', '/:id'], enhancedCheckFinance, async (req, res) => {
  const { id, name, address, contact_number, contact_person, city } = req.body;
  const financeId = req.financeId;

  const validation = validateGodownInput(name, contact_number);
  if (!validation.isValid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  try {
    await db.query(
      'UPDATE godowns SET name = $1, address = $2, contact_number = $3, contact_person = $4, city = $5, updated_at = NOW() WHERE id = $6 AND finance_id = $7',
      [name.trim(), address ? address.trim() : null, validation.cleanDigits, contact_person ? contact_person.trim() : null, city ? city.trim() : null, id, financeId]
    );
    res.json({ success: true, godown_id: id });
  } catch (error) {
    console.error('Error updating godown:', error);
    res.status(500).json({ success: false, error: 'Failed to update godown' });
  }
});

router.put('/deactive-godown', enhancedCheckFinance, async (req, res) => {
  const { id } = req.body;
  const financeId = req.financeId;
  try {
    await db.query(
      'UPDATE godowns SET is_active = 0, updated_at = NOW() WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );
    res.json({ success: true, godown_id: id });
  } catch (error) {
    console.error('Error deactivating godown:', error);
    res.status(500).json({ success: false, error: 'Failed to deactive godown' });
  }
});

router.put('/active-godown', enhancedCheckFinance, async (req, res) => {
  const { id } = req.body;
  const financeId = req.financeId;
  try {
    await db.query(
      'UPDATE godowns SET is_active = 1, updated_at = NOW() WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );
    res.json({ success: true, godown_id: id });
  } catch (error) {
    console.error('Error activating godown:', error);
    res.status(500).json({ success: false, error: 'Failed to activate godown' });
  }
});

router.get(['/active', '/get-active-godowns'], enhancedCheckFinance, async (req, res) => {
  const financeId = req.financeId;
  try {
    const { rows } = await db.query(
      'SELECT * FROM godowns WHERE finance_id = $1 AND is_active = 1 ORDER BY name ASC',
      [financeId]
    );
    res.json({ success: true, godowns: rows });
  } catch (error) {
    console.error('Error getting active godowns:', error);
    res.status(500).json({ success: false, error: 'Failed to get godowns' });
  }
});

router.get(['/detail', '/get-godown-by-id'], enhancedCheckFinance, async (req, res) => {
  const { id } = req.query;
  const financeId = req.financeId;
  try {
    const { rows } = await db.query(
      'SELECT * FROM godowns WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );
    res.json({ success: true, godown: rows[0] || null });
  } catch (error) {
    console.error('Error getting godown:', error);
    res.status(500).json({ success: false, error: 'Failed to get godown' });
  }
});

router.get('/seized-vehicles', enhancedCheckFinance, async (req, res) => {
  const financeId = req.financeId;
  try {
    const { rows } = await db.query(
      `SELECT 
          c.id as customer_id,
          c.hplno as hplno,
          c.cname as cname,
          c.vehicle_id as vehicle_id,
          vi.brand as brand,
          vi.model_name as model_name,
          v.vehicle_number as vehicle_number,
          g.name as godown_name,
          s.seizing_charge as seizing_charge,
          s.seized_by as seized_by,
          s.seizing_date as seized_date
       FROM customers c
       JOIN vehicle_detail v 
           ON c.vehicle_id = v.id
       JOIN vehicle_info vi 
           ON v.vehicle_info_id = vi.id
       JOIN seizing_vehicle s 
           ON c.id = s.customer_id
       LEFT JOIN godowns g 
           ON s.godown_id = g.id
       WHERE 
           c.finance_id = $1 
           AND c.loan_status = 'seized'`,
      [financeId]
    );
    res.json({ success: true, vehicles: rows });
  } catch (error) {
    console.error('Error getting seized vehicles:', error);
    res.status(500).json({ success: false, error: 'Failed to get seized vehicles' });
  }
});

router.validateGodownInput = validateGodownInput;
module.exports = router;
