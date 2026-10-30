const path = require('path');
require("dotenv").config({
  path: path.resolve(__dirname, ".env")
});

const { enhancedCheckFinance } = require('./server/authMiddleware');
const express = require("express");
const cors = require("cors");
const cookieParser = require('cookie-parser')
//const mysql2 = require("mysql2");
const { db, isConnected } = require('./db');
const multer = require('multer');
const authRoutes = require('./server/authRoutes');
const routes = require('./server/routes');
const dashboardRoutes = require('./server/dashboardRoutes');
const vehicleRoutes = require('./server/vehicleRoutes')
const customerRoutes = require('./server/customerRoutes')
const paymentRoutes = require('./server/paymentRoutes');
const officeExpenceRoutes = require('./server/officeExpenceRoutes');
const godownRoutes = require('./server/godownRoutes');
const databaseScheme = require('./database')
const ledgerRoutes = require('./routes/ledger/ledger_routes');


// Add this at the top of your index.js
const fs = require('fs');
const app = express();
const os = require('os')
const WebSocket = require('ws');
// Create uploads directory if it doesn't exist
// const uploadDir = path.join(__dirname, 'uploads');
const uploadDir = path.join(os.homedir(), 'senthur_groups_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
//middleware
app.use(express.json());
app.use(cookieParser())
app.use(cors({
  origin: true, // or your frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'finance-authorization', 'owner-authorization', 'finance-id']
}));
// For static serving
app.use('/uploads', express.static(uploadDir));

// Configure multer for file uploads
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

app.use('/api', routes)
app.use('/auth', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', vehicleRoutes);
app.use('/api', customerRoutes);
app.use('/api', paymentRoutes);
app.use('/api', officeExpenceRoutes);
app.use('/api/godowns', godownRoutes);
app.use('/api', ledgerRoutes);

// Create tables if they don't exist
// databaseScheme()

// Add this before your CRUD operations
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


// Get finance's default address (city, district, state)
app.get('/api/finance/default-address', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const [results] = await db.query(`
      SELECT 
        a.city,
        a.district,
        a.state
      FROM address_history ah
      JOIN addresses a ON ah.address_id = a.id
      WHERE ah.entity_type = 'finance'
        AND ah.entity_id = ?
        AND ah.is_current = TRUE
      LIMIT 1
    `, [financeId]);

    if (results.length === 0) {
      // Fallback to finance_detail address if no address_history found
      const [financeDetails] = await db.query(`
        SELECT address 
        FROM finance_detail 
        WHERE id = ?
      `, [financeId]);

      let defaultAddress = {
        city: '',
        district: '',
        state: ''
      };

      return res.json({
        success: true,
        defaultAddress,
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch default address'
    });
  }
});

// Get address suggestions for specific field
app.get('/api/address/suggestions/:field', async (req, res) => {
  try {
    const { field } = req.params;
    const { q = '', filters = '{}' } = req.query;

    // Validate field
    const validFields = ['street_name', 'village', 'city', 'district', 'state', 'pincode'];
    if (!validFields.includes(field)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid field name'
      });
    }

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const filterObj = JSON.parse(filters || '{}');

    // Build query based on field and filters
    let query = `
      SELECT DISTINCT ${field} as value
      FROM addresses 
      WHERE ${field} LIKE ?
    `;

    const params = [searchTerm];

    // Add filters for context-aware suggestions
    if (filterObj.state && field !== 'state') {
      query += ` AND state = ?`;
      params.push(filterObj.state);
    }

    if (filterObj.district && field !== 'district' && field !== 'state') {
      query += ` AND district = ?`;
      params.push(filterObj.district);
    }

    if (filterObj.city && field !== 'city' && field !== 'district' && field !== 'state') {
      query += ` AND city = ?`;
      params.push(filterObj.city);
    }

    query += ` ORDER BY ${field} ASC LIMIT 10`;

    const [results] = await db.query(query, params);

    const suggestions = results.map(row => ({
      value: row.value,
      label: row.value
    }));

    res.json({ success: true, suggestions });
  } catch (err) {
    console.error('Error fetching address suggestions:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch address suggestions'
    });
  }
});

// Get address details by pincode
app.get('/api/address/by-pincode/:pincode', async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!pincode || pincode.length !== 6) {
      return res.json({ success: true, address: null });
    }

    const [results] = await db.query(`
      SELECT 
        city,
        district,
        state
      FROM addresses 
      WHERE pincode = ?
      GROUP BY city, district, state
      LIMIT 1
    `, [pincode]);

    if (results.length === 0) {
      return res.json({ success: true, address: null });
    }

    res.json({
      success: true,
      address: results[0]
    });
  } catch (err) {
    console.error('Error fetching address by pincode:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch address details'
    });
  }
});

// Add this endpoint to fetch all payments with customer information
app.get('/payments', async (req, res) => {
  try {
    const [payments] = await db.query(`
      SELECT 
        p.*,
        c.id,
        c.hplno,
        c.cname,
        c.loanStatus,
        v.vehicleNumber,
        v.modelName
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN vehicles v ON c.id = v.customer_id
      ORDER BY p.dueDate
    `);

    // Parse contacts JSON
    const formattedPayments = payments.map(payment => ({
      ...payment,
      contacts: payment.contacts_json
        ? JSON.parse(`[${payment.contacts_json}]`)
        : []
    }));

    res.json(formattedPayments);
  } catch (err) {
    console.error('Error fetching all payments:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments'
    });
  }
});

app.post('/api/finance/create', upload.single('finance_photo'), async (req, res) => {
  try {
    const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

    if (!ownerToken) {
      return res.status(401).json({
        success: false,
        error: 'Owner authentication required'
      });
    }

    // Verify owner token
    let ownerDecoded;
    try {
      const jwt = require('jsonwebtoken');
      ownerDecoded = jwt.verify(ownerToken, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid owner token'
      });
    }

    // Get all address fields from request body
    const {
      finance_name,
      phone_numbers,
      emails,
      // Address fields
      house_no,
      street,
      street_name,
      village,
      land_mark,
      address,
      city,
      district,
      state,
      pincode,
      location,
      since
    } = req.body;

    // Validate required fields
    if (!finance_name || !phone_numbers) {
      return res.status(400).json({
        success: false,
        error: 'Finance name and phone numbers are required'
      });
    }

    // Parse phone_numbers and emails
    let phoneNumbersArray = [];
    let emailsArray = [];

    try {
      phoneNumbersArray = JSON.parse(phone_numbers);
      if (!Array.isArray(phoneNumbersArray)) {
        return res.status(400).json({
          success: false,
          error: 'phone_numbers must be a JSON array'
        });
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone_numbers JSON format'
      });
    }

    try {
      if (emails) {
        emailsArray = JSON.parse(emails);
        if (!Array.isArray(emailsArray)) {
          emailsArray = [emails];
        }
      }
    } catch (err) {
      // If emails is not JSON, treat it as a single email
      if (emails && emails.trim() !== '') {
        emailsArray = [emails];
      }
    }

    // Check if finance name already exists for this owner
    const [existingFinance] = await db.query(
      'SELECT id FROM finance_detail WHERE finance_name = ? AND owner_id = ?',
      [finance_name, ownerDecoded.owner.id]
    );

    if (existingFinance.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Finance name already exists for this owner'
      });
    }

    // Start transaction to create finance, address, and update user
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Get photo path if uploaded
      const financePhotoPath = req.file ? `/uploads/${req.file.filename}` : null;

      // 1. Create finance record
      const [financeResult] = await connection.query(
        `INSERT INTO finance_detail (
          finance_name, 
          phone_numbers,
          emails,
          owner_id,
          finance_photo,
          since,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          finance_name,
          JSON.stringify(phoneNumbersArray),
          JSON.stringify(emailsArray),
          ownerDecoded.owner.id,
          financePhotoPath,
          since || '',
          true
        ]
      );

      const financeId = financeResult.insertId;

      // 2. Create address in addresses table with all fields
      let addressId = null;
      // Check if any address field is provided
      if (house_no || street || street_name || village || land_mark ||
        address || city || district || state || pincode || location) {

        const [addressResult] = await connection.query(
          `INSERT INTO addresses (
            house_no,
            street,
            street_name,
            village,
            land_mark,
            address,
            city,
            district,
            state,
            pincode,
            location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            house_no || '',
            street || '',
            street_name || '',
            village || '',
            land_mark || '',
            address || '',
            city || '',
            district || '',
            state || '',
            pincode || '',
            location || ''
          ]
        );

        addressId = addressResult.insertId;

        // 3. Link address to finance in address_history
        await connection.query(
          `INSERT INTO address_history (
            entity_type, 
            entity_id, 
            address_id, 
            is_current
          ) VALUES (?, ?, ?, ?)`,
          ['finance', financeId.toString(), addressId, true]
        );
      }

      // 5. Add finance ID to owner's allowed_companies in users table
      if (ownerDecoded.owner.id) {
        // Get current allowed_companies for the owner
        const [ownerUser] = await connection.query(
          `SELECT allowed_companies FROM users WHERE user_id = ?`,
          [ownerDecoded.owner.id]
        );

        let updatedCompanies = [];
        if (ownerUser.length > 0 && ownerUser[0].allowed_companies) {
          try {
            const currentCompanies = JSON.parse(ownerUser[0].allowed_companies);
            if (Array.isArray(currentCompanies)) {
              updatedCompanies = [...currentCompanies, financeId];
            } else {
              updatedCompanies = [financeId];
            }
          } catch (err) {
            updatedCompanies = [financeId];
          }
        } else {
          updatedCompanies = [financeId];
        }

        // Update owner's allowed_companies
        await connection.query(
          `UPDATE users 
           SET allowed_companies = ? 
           WHERE user_id = ?`,
          [JSON.stringify(updatedCompanies), ownerDecoded.owner.id]
        );
      }

      // 6. Log activity
      await connection.query(
        `INSERT INTO recent_activity (
          finance_id,
          type,
          reference_id,
          description,
          created_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          financeId,
          'finance_created',
          financeId,
          `Finance "${finance_name}" created`,
          ownerDecoded.owner.username || 'Owner'
        ]
      );

      // Commit transaction
      await connection.commit();
      connection.release();

      // Generate full address string
      const fullAddressParts = [];
      if (house_no) fullAddressParts.push(`House No: ${house_no}`);
      if (street) fullAddressParts.push(`Street: ${street}`);
      if (street_name) fullAddressParts.push(street_name);
      if (village) fullAddressParts.push(village);
      if (land_mark) fullAddressParts.push(`Near ${land_mark}`);
      if (address) fullAddressParts.push(address);

      const locationParts = [];
      if (city) locationParts.push(city);
      if (district) locationParts.push(district);
      if (state) locationParts.push(state);
      if (pincode) locationParts.push(pincode);

      const fullLocation = locationParts.join(', ');
      if (fullLocation) fullAddressParts.push(fullLocation);
      if (location) fullAddressParts.push(`Location: ${location}`);

      const fullAddress = fullAddressParts.join(', ');

      res.json({
        success: true,
        message: 'Finance created successfully',
        finance: {
          id: financeId,
          finance_name,
          phone_numbers: phoneNumbersArray,
          emails: emailsArray,
          finance_photo: financePhotoPath,
          address: fullAddress,
          house_no,
          street,
          street_name,
          village,
          land_mark,
          city,
          district,
          state,
          pincode,
          location,
          owner_id: ownerDecoded.owner.id,
          since: since || ''
        }
      });

    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }

  } catch (err) {
    console.error('Error creating finance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create finance',
      details: err.message
    });
  }
});

// Add this endpoint to get finance address
app.get('/api/finance/:id/address', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.params.id;

    const [address] = await db.query(`
      SELECT a.* 
      FROM address_history ah
      JOIN addresses a ON ah.address_id = a.id
      WHERE ah.entity_type = 'finance' 
        AND ah.entity_id = ? 
        AND ah.is_current = TRUE
      LIMIT 1
    `, [financeId]);

    res.json({
      success: true,
      address: address.length > 0 ? address[0] : null
    });
  } catch (err) {
    console.error('Error fetching finance address:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch address'
    });
  }
});


// GET last payment due date
app.get('/lastduedate', enhancedCheckFinance, async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        c.id,
        c.hplno,
        c.cname,
        l.dueAmount,
        l.hpDate,
        c.created_at,
        MAX(p.dueDate) AS lastDueDate
      FROM customers c
      LEFT JOIN loans l ON c.id = l.customer_id
      LEFT JOIN payments p ON c.id = p.customer_id
      GROUP BY c.id, c.cname, l.dueAmount, l.hpDate, c.created_at
      ORDER BY c.id
    `);

    res.json({
      success: true,
      data: results
    });
  } catch (err) {
    console.error('Error fetching last due date data:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch last due date data'
    });
  }
});


// Add this after all your routes
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      message: err.message
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});


let wss;

function setupWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

    ws.on('close', () => console.log('Client disconnected'));
  });
}

// Add these routes to your index.js file after the existing routes

// Get finance details with statistics
app.get('/api/finance/profile', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    // Get finance basic info with address
    const [financeDetails] = await db.query(`
      SELECT 
        fd.id, 
        fd.finance_name, 
        fd.owner_id, 
        fd.phone_numbers, 
        fd.emails,
        a.address,
        a.city,
        a.district,
        a.state,
        a.pincode,
        fd.created_at,
        fd.updated_at
      FROM finance_detail fd
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id 
        AND ah.is_current = TRUE
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.id = ?
    `, [financeId]);

    if (financeDetails.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Finance not found'
      });
    }

    const finance = financeDetails[0];

    // Parse phone numbers
    let phoneNumber = '';

    try {
      const raw = finance.phone_numbers;

      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed) && parsed.length > 0) {
          phoneNumber = parsed[0];
        }
      }
    } catch (err) {
      console.error('Error parsing phone numbers:', raw);

      // fallback: extract first number
      phoneNumber = String(finance.phone_numbers)
        .split(',')
        .map(n => n.trim())
        .find(Boolean) || '';
    }


    // Format address
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

    // ... rest of your statistics queries remain the same ...
    // Get customer count, active loans, etc.

    const [customerCount] = await db.query(
      `SELECT COUNT(*) as total_customers 
       FROM customers 
       WHERE finance_id = ?`,
      [financeId]
    );

    const [activeLoans] = await db.query(
      `SELECT COUNT(*) as active_loans 
       FROM customers 
       WHERE finance_id = ? AND loanStatus = 'active'`,
      [financeId]
    );

    const [totalLoanAmount] = await db.query(
      `SELECT SUM(l.hpAmount) as total_loan_amount
       FROM loans l
       JOIN customers c ON l.customer_id = c.id
       WHERE c.finance_id = ?`,
      [financeId]
    );

    const [recentActivity] = await db.query(
      `SELECT COUNT(*) as recent_activities
       FROM recent_activity 
       WHERE finance_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [financeId]
    );

    const [paymentStats] = await db.query(
      `SELECT 
        COUNT(*) as total_payments,
        SUM(amount) as total_payment_amount
       FROM payments 
       WHERE finance_id = ? AND paymentDate IS NOT NULL`,
      [financeId]
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
        total_customers: customerCount[0].total_customers || 0,
        active_loans: activeLoans[0].active_loans || 0,
        total_loan_amount: totalLoanAmount[0].total_loan_amount || 0,
        recent_activities: recentActivity[0].recent_activities || 0,
        total_payments: paymentStats[0].total_payments || 0,
        total_payment_amount: paymentStats[0].total_payment_amount || 0
      }
    });

  } catch (err) {
    console.error('Error fetching finance profile:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch finance profile',
      details: err.message
    });
  }
});

// Get user profile with statistics
app.get('/api/user/profile', async (req, res) => {
  try {
    // Get user from token (assuming user is authenticated)
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided'
      });
    }

    const decoded = jwtDecode(token);
    const userId = decoded.user.id;

    // Get user basic info
    const [userDetails] = await db.query(
      `SELECT 
        id, email, role, created_at, updated_at
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    if (userDetails.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userDetails[0];

    // Get user-specific statistics based on role
    let userStats = {};

    if (user.role === 'owner') {
      // Owner can see all finance stats
      const [ownerStats] = await db.query(
        `SELECT 
          (SELECT COUNT(*) FROM customers WHERE finance_id = u.finance_id) as managed_customers,
          (SELECT COUNT(*) FROM users WHERE finance_id = u.finance_id AND role = 'agent') as managed_agents,
          (SELECT COUNT(*) FROM vehicles WHERE finance_id = u.finance_id) as managed_vehicles
         FROM users u
         WHERE u.id = ?`,
        [userId]
      );
      userStats = ownerStats[0] || {};
    } else if (user.role === 'agent') {
      // Agent can see their specific activities
      const [agentStats] = await db.query(
        `SELECT 
          COUNT(*) as recent_activities
         FROM recent_activity 
         WHERE finance_id = (SELECT finance_id FROM users WHERE id = ?) 
         AND created_by = ? 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [userId, user.email]
      );
      userStats = agentStats[0] || {};
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at,
        ...userStats
      }
    });

  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
      details: err.message
    });
  }
});

// Update finance profile
app.put('/api/finance/profile', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const { phone_number, address } = req.body;

    // Validate input
    if (phone_number && phone_number.length > 13) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be 13 characters or less'
      });
    }

    const updateData = {};
    if (phone_number) updateData.phone_number = phone_number;
    if (address) updateData.address = address;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    await db.query(
      'UPDATE finance_detail SET ? WHERE id = ?',
      [updateData, financeId]
    );

    // Get updated finance data
    const [updatedFinance] = await db.query(
      `SELECT id, finance_name, owner_name, phone_number, address, created_at, updated_at
       FROM finance_detail WHERE id = ?`,
      [financeId]
    );

    // Log the activity
    await db.query(
      'INSERT INTO recent_activity SET ?',
      {
        finance_id: financeId,
        type: 'profile',
        reference_id: financeId,
        description: 'Finance profile updated',
        created_by: req.user?.user_name || 'System'
      }
    );

    res.json({
      success: true,
      message: 'Finance profile updated successfully',
      finance: updatedFinance[0]
    });

  } catch (err) {
    console.error('Error updating finance profile:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update finance profile',
      details: err.message
    });
  }
});


app.get('/api/users/:userId/staff-details', async (req, res) => {
  try {
    const { userId } = req.params;
    const [details] = await db.query(
      'SELECT * FROM users_details WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      staff_details: details[0] || null
    });
  } catch (err) {
    console.error('Error fetching staff details:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff details'
    });
  }
});


// Broadcast helper
function broadcastActivity(activity) {
  if (wss) {
    const data = JSON.stringify({ type: 'activity', payload: activity });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}



// Replace everything after your routes with this:

// Add a health check route at the beginning (before other routes)

// function startServer() {
//   return new Promise((resolve, reject) => {
//     const PORT = process.env.PORT // Change to 500
//     const server = app.listen(PORT, '0.0.0.0', () => {
//       console.log(`✅ Server running on port ${PORT}`);
//       console.log(`📍 Local: http://localhost:${PORT}`);
//       setupWebSocket(server);
//       resolve(server);
//     });

//     server.on('error', reject);
//   });
// }
// startServer();
// module.exports = { app, startServer };

// Start the server after ALL table creation is complete
const PORT = process.env.PORT || 5000; // Use 5000 instead of 5001

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Rimi Finance Backend',
    version: '1.0.0',
    database: isConnected() ? 'connected' : 'disconnected'
  });
});

console.log('🔄 Starting server...');

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log(`✅ SERVER STARTED SUCCESSFULLY`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/auth`);
  console.log(`💾 Database: Connected`);
  console.log('='.repeat(60) + '\n');
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ PORT ${PORT} IS ALREADY IN USE!\n`);
    console.error('Solutions:');
    console.error('1. Kill the process using port ' + PORT + ':');
    console.error('   netstat -ano | findstr :' + PORT);
    console.error('   taskkill /PID [PID] /F');
    console.error('\n2. Use a different port:');
    console.error('   set PORT=5001');
    console.error('   npm start');
    console.error('\n3. Or run: PORT=5001 npm start\n');
  } else {
    console.error('❌ Server startup error:', err);
  }
  process.exit(1);
});

// Handle process events
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Server initialization complete.');
// If you want WebSocket support, add it after server starts
// setupWebSocket(server);

//SET SESSION group_concat_max_len = 1000000; -- Increase if needed