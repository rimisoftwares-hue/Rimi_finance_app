// src/app.js
// Express application setup — middleware, static files, route mounting, error handler.
// Extracted from backend/index.js. No business logic changes.

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const os = require('os');
const fs = require('fs');

const { createCorsMiddleware } = require('./config/cors.config');
const { enhancedCheckFinance } = require('./middleware/auth.middleware');
const { db } = require('./config/database.config');
const allRoutes = require('./routes/index');

const app = express();

// ─── Upload directory ─────────────────────────────────────────────────────────
const uploadDir = path.join(os.homedir(), 'senthur_groups_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Core middleware ──────────────────────────────────────────────────────────
const jsonParser = express.json({
  verify: (req, _res, buf) => {
    if (buf && buf.length > 0) {
      req.rawBody = buf.toString('utf8');
    }
  },
});
app.use((req, res, next) => {
  if (req.path === '/api/ocr/scan' || /^\/api\/ocr\/jobs\/[^/]+\/upload$/.test(req.path)) {
    return next();
  }
  return jsonParser(req, res, next);
});
app.use(cookieParser());
app.use(createCorsMiddleware());

// ─── Static file serving ──────────────────────────────────────────────────────
app.use('/uploads', express.static(uploadDir));

// ─── Multer setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const validFields = [
      'customerPhoto',
      'customerVehiclePhoto',
      'customerPropertyPhoto',
      'guardianPhoto',
      'guardianPropertyPhoto',
      'finance_photo'
    ];
    if (validFields.includes(file.fieldname) && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid field name or file type. Accepted fields: ${validFields.join(', ')}`));
    }
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Rimi Finance Backend',
    version: '1.0.0',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Rimi Finance Backend',
    version: '1.0.0',
  });
});

// ─── Root endpoint ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Loan Management API',
    endpoints: {
      customers: {
        GET_all: '/customers',
        GET_one: '/customers/:hplno',
        POST: '/customers',
        PUT: '/customers/:hplno',
        DELETE: '/customers/:hplno',
        GET_ONE_PAYMENT: '/customers/:hplno/payments',
        GET_PAYMENT: '/payments',
        GET_UNPAID_CUSTOMERS: '/unpaidcustomers',
        GET_CUSTOME_PAYMENT: 'api/payments/report',
        GET_LAST_PAYMENT: '/lastduedate',
        FINANCE: '/auth/finance-login'
      }
    }
  });
});

// ─── Module routes ────────────────────────────────────────────────────────────
app.use('/api', allRoutes);
app.get('/vehicle-info', (req, res, next) => {
  req.url = '/vehicle-info';
  return allRoutes(req, res, next);
});

// ─── Finance default address ──────────────────────────────────────────────────
app.get('/api/finance/default-address', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const { rows: results } = await db.query(`
      SELECT 
        a.city,
        a.district,
        a.state
      FROM address_history ah
      JOIN addresses a ON ah.address_id = a.id
      WHERE ah.entity_type = 'finance'
        AND ah.entity_id = $1
        AND ah.is_current = 1
      LIMIT 1
    `, [String(financeId)]);

    if (results.length === 0) {
      return res.json({
        success: true,
        defaultAddress: { city: '', district: '', state: '' },
        source: 'finance_detail'
      });
    }

    res.json({
      success: true,
      defaultAddress: results[0],
      source: 'address_history'
    });
  } catch (err) {
    console.error('Error fetching finance default address:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch default address' });
  }
});

// ─── Address suggestions ──────────────────────────────────────────────────────
app.get('/api/address/suggestions/:field', async (req, res) => {
  try {
    const { field } = req.params;
    const { q = '', filters = '{}' } = req.query;

    const validFields = ['street_name', 'village', 'city', 'district', 'state', 'pincode'];
    if (!validFields.includes(field)) {
      return res.status(400).json({ success: false, error: 'Invalid field name' });
    }

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const filterObj = JSON.parse(filters || '{}');

    let query = `
      SELECT DISTINCT ${field} as value
      FROM addresses 
      WHERE ${field} ILIKE $1
    `;
    const params = [searchTerm];
    let paramIndex = 2;

    if (filterObj.state && field !== 'state') {
      query += ` AND state = $${paramIndex++}`;
      params.push(filterObj.state);
    }
    if (filterObj.district && field !== 'district' && field !== 'state') {
      query += ` AND district = $${paramIndex++}`;
      params.push(filterObj.district);
    }
    if (filterObj.city && field !== 'city' && field !== 'district' && field !== 'state') {
      query += ` AND city = $${paramIndex++}`;
      params.push(filterObj.city);
    }

    query += ` ORDER BY ${field} ASC LIMIT 10`;

    const { rows: results } = await db.query(query, params);
    res.json({
      success: true,
      suggestions: results.map(row => ({ value: row.value, label: row.value }))
    });
  } catch (err) {
    console.error('Error fetching address suggestions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch address suggestions' });
  }
});

// ─── Address by pincode ───────────────────────────────────────────────────────
app.get('/api/address/by-pincode/:pincode', async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!pincode || pincode.length !== 6) {
      return res.json({ success: true, address: null });
    }

    const { rows: results } = await db.query(`
      SELECT city, district, state
      FROM addresses 
      WHERE pincode = $1
      GROUP BY city, district, state
      LIMIT 1
    `, [pincode]);

    res.json({ success: true, address: results.length > 0 ? results[0] : null });
  } catch (err) {
    console.error('Error fetching address by pincode:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch address details' });
  }
});

// ─── All payments (legacy endpoint) ──────────────────────────────────────────
app.get('/payments', async (req, res) => {
  try {
    const { rows: payments } = await db.query(`
      SELECT 
        p.*,
        c.id as customer_id,
        c.hplno,
        c.cname,
        c.loan_status AS "loanStatus",
        vd.vehicle_number AS "vehicleNumber",
        vd.vehicle_modal AS "modelName"
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN vehicle_detail vd ON c.vehicle_id = vd.id
      ORDER BY p.due_date
    `);

    const formattedPayments = payments.map(payment => ({
      ...payment,
      contacts: []
    }));

    res.json(formattedPayments);
  } catch (err) {
    console.error('Error fetching all payments:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
});

// ─── Finance routes handled in modules/finance/finance.routes.js ─────────────

// ─── Finance address ──────────────────────────────────────────────────────────
app.get('/api/finance/:id/address', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.params.id;
    const { rows: address } = await db.query(`
      SELECT a.* 
      FROM address_history ah
      JOIN addresses a ON ah.address_id = a.id
      WHERE ah.entity_type = 'finance' 
        AND ah.entity_id = $1 
        AND ah.is_current = 1
      LIMIT 1
    `, [String(financeId)]);

    res.json({ success: true, address: address.length > 0 ? address[0] : null });
  } catch (err) {
    console.error('Error fetching finance address:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch address' });
  }
});

// ─── Last due date ────────────────────────────────────────────────────────────
app.get(['/lastduedate', '/api/lastduedate'], enhancedCheckFinance, async (req, res) => {
  try {
    const { rows: results } = await db.query(`
      SELECT 
        c.id,
        c.hplno,
        c.cname,
        l.due_amount AS "dueAmount",
        l.hp_date AS "hpDate",
        c.created_at,
        MAX(p.due_date) AS "lastDueDate"
      FROM customers c
      LEFT JOIN loans l ON c.id = l.customer_id
      LEFT JOIN payments p ON c.id = p.customer_id
      GROUP BY c.id, c.hplno, c.cname, l.due_amount, l.hp_date, c.created_at
      ORDER BY c.id
    `);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching last due date data:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch last due date data' });
  }
});

// ─── User Profile ─────────────────────────────────────────────────────────────
app.get('/api/user/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'No authentication token provided' });
    }

    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'jwt123');
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const userId = decoded.user?.id || decoded.user?.user_id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID missing in token' });
    }

    const { rows: userDetails } = await db.query(
      `SELECT 
        u.id, u.email, u.username, u.phone_no,
        (SELECT uac.role FROM user_allowed_companies uac WHERE uac.user_id = u.id AND uac.is_active = 1 LIMIT 1) AS role,
        u.created_at, u.updated_at,
        COALESCE(
          (SELECT json_agg(uac.finance_id) FROM user_allowed_companies uac WHERE uac.user_id = u.id AND uac.is_active = 1),
          '[]'::json
        ) AS allowed_companies
      FROM users u WHERE u.id = $1`,
      [userId]
    );

    if (userDetails.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: userDetails[0] });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile', details: err.message });
  }
});


// ─── Finance profile ──────────────────────────────────────────────────────────
app.get('/api/finance/profile', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const { rows: financeDetails } = await db.query(`
      SELECT 
        fd.id, fd.finance_name, fd.owner_id, fd.phone_numbers, fd.emails,
        o.username AS owner_name,
        a.address, a.city, a.district, a.state, a.pincode,
        fd.created_at, fd.updated_at
      FROM finance_detail fd
      LEFT JOIN owner o ON fd.owner_id = o.id
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id::varchar 
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.id = $1
    `, [financeId]);

    if (financeDetails.length === 0) {
      return res.status(404).json({ success: false, error: 'Finance not found' });
    }

    const finance = financeDetails[0];

    let phoneNumber = '';
    try {
      const raw = finance.phone_numbers;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) phoneNumber = parsed[0];
    } catch (err) {
      phoneNumber = String(finance.phone_numbers || '').split(',').map(n => n.trim()).find(Boolean) || '';
    }

    let formattedAddress = '';
    if (finance.address) {
      const addressParts = [];
      if (finance.address) addressParts.push(finance.address);
      if (finance.city) addressParts.push(finance.city);
      if (finance.district) addressParts.push(finance.district);
      if (finance.state) addressParts.push(finance.state);
      if (finance.pincode) addressParts.push(finance.pincode);
      formattedAddress = addressParts.join(', ');
    }

    const { rows: customerCount } = await db.query(
      `SELECT COUNT(*) as total_customers FROM customers WHERE finance_id = $1`, [financeId]
    );
    const { rows: activeLoans } = await db.query(
      `SELECT COUNT(*) as active_loans FROM customers WHERE finance_id = $1 AND loan_status = 'active'`, [financeId]
    );
    const { rows: totalLoanAmount } = await db.query(
      `SELECT COALESCE(SUM(l.hp_amount), 0) as total_loan_amount FROM loans l JOIN customers c ON l.customer_id = c.id WHERE c.finance_id = $1`, [financeId]
    );
    const { rows: recentActivity } = await db.query(
      `SELECT COUNT(*) as recent_activities FROM recent_activity WHERE finance_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`, [financeId]
    );
    const { rows: paymentStats } = await db.query(
      `SELECT COUNT(*) as total_payments, COALESCE(SUM(amount), 0) as total_payment_amount FROM payments WHERE finance_id = $1 AND payment_date IS NOT NULL`, [financeId]
    );

    res.json({
      success: true,
      finance: {
        id: finance.id,
        name: finance.finance_name,
        owner: finance.owner_name,
        phone: phoneNumber,
        phone_numbers: finance.phone_numbers,
        address: formattedAddress,
        city: finance.city,
        district: finance.district,
        state: finance.state,
        pincode: finance.pincode,
        created_at: finance.created_at,
        updated_at: finance.updated_at,
        total_customers: Number(customerCount[0]?.total_customers || 0),
        active_loans: Number(activeLoans[0]?.active_loans || 0),
        total_loan_amount: Number(totalLoanAmount[0]?.total_loan_amount || 0),
        recent_activities: Number(recentActivity[0]?.recent_activities || 0),
        total_payments: Number(paymentStats[0]?.total_payments || 0),
        total_payment_amount: Number(paymentStats[0]?.total_payment_amount || 0)
      }
    });
  } catch (err) {
    console.error('Error fetching finance profile:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch finance profile', details: err.message });
  }
});

// ─── Update finance profile ───────────────────────────────────────────────────
app.put('/api/finance/profile', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { phone_number, address } = req.body;

    if (phone_number && phone_number.length > 13) {
      return res.status(400).json({ success: false, error: 'Phone number must be 13 characters or less' });
    }

    if (!phone_number && !address) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    if (phone_number) {
      await db.query(
        'UPDATE finance_detail SET phone_numbers = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify([phone_number]), financeId]
      );
    }

    if (address) {
      const { rows: existingAddr } = await db.query(`
        SELECT a.id 
        FROM address_history ah
        JOIN addresses a ON ah.address_id = a.id
        WHERE ah.entity_type = 'finance' AND ah.entity_id = $1 AND ah.is_current = 1
        LIMIT 1
      `, [String(financeId)]);

      if (existingAddr.length > 0) {
        await db.query(`UPDATE addresses SET address = $1 WHERE id = $2`, [address, existingAddr[0].id]);
      } else {
        const { rows: newAddr } = await db.query(
          `INSERT INTO addresses (address) VALUES ($1) RETURNING id`,
          [address]
        );
        await db.query(
          `INSERT INTO address_history (entity_type, entity_id, address_id, is_current) VALUES ('finance', $1, $2, 1)`,
          [String(financeId), newAddr[0].id]
        );
      }
    }

    const { rows: updatedFinance } = await db.query(
      `SELECT id, finance_name, phone_numbers, created_at, updated_at FROM finance_detail WHERE id = $1`,
      [financeId]
    );

    await db.query(`
      INSERT INTO recent_activity (finance_id, type, reference_id, description, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [financeId, 'profile', String(financeId), 'Finance profile updated', req.user?.username || req.user?.user_name || 'System']);

    res.json({ success: true, message: 'Finance profile updated successfully', finance: updatedFinance[0] });
  } catch (err) {
    console.error('Error updating finance profile:', err);
    res.status(500).json({ success: false, error: 'Failed to update finance profile', details: err.message });
  }
});

// ─── Staff details ────────────────────────────────────────────────────────────
app.get('/api/users/:userId/staff-details', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows: details } = await db.query('SELECT * FROM users_details WHERE id = $1', [userId]);
    res.json({ success: true, staff_details: details[0] || null });
  } catch (err) {
    console.error('Error fetching staff details:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch staff details' });
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: 'File upload error', message: err.message });
  }
  res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
});

module.exports = { app, upload };
