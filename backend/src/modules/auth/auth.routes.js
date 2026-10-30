const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { db } = require('../../config/database.config');
const crypto = require('crypto');
const { authMiddleware, ownerOnly, checkFinance, enhancedCheckFinance } = require('../../middleware/auth.middleware');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const Jimp = require('jimp');
require('dotenv').config();

// AWS S3 setup
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
  region: process.env.BUCKET_REGION,
});

// Multer - memory storage, only accept 'userPhoto' image uploads
const userPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'userPhoto' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid field name or file type. Accepted field: userPhoto'));
    }
  },
});

// Helper - unique filename
const generateFileName = (originalname) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  return `${timestamp}-${random}${ext}`;
};

// Helper - resize & upload to S3
const uploadUserPhotoToS3 = async (fileBuffer, fileName) => {
  const image = await Jimp.read(fileBuffer);
  if (image.bitmap.width > 1920) image.resize(1920, Jimp.AUTO);
  const resizedBuffer = await image.quality(80).getBufferAsync(Jimp.MIME_JPEG);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: `users/${fileName}`,
      Body: resizedBuffer,
      ContentType: 'image/jpeg',
    })
  );

  return `https://${process.env.BUCKET_NAME}.s3.${process.env.BUCKET_REGION}.amazonaws.com/users/${fileName}`;
};

// Helper - delete photo from S3
const deleteUserPhotoFromS3 = async (imageUrl) => {
  try {
    const key = new URL(imageUrl).pathname.substring(1);
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error('Error deleting user photo from S3:', err);
  }
};

// S3 Helper: Generate Presigned URL for Private S3 Images
const getSignedImageUrl = async (imageUrl, expiresIn = 86400) => {
  try {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    if (!imageUrl.startsWith('http') || !imageUrl.includes('amazonaws.com')) {
      return imageUrl;
    }
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1);
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(s3, command, { expiresIn });
  } catch (error) {
    console.error('Error generating signed URL for auth image:', error);
    return imageUrl;
  }
};

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '1d';

// Helper function
const formatFinanceData = (financeRaw) => {
  if (!financeRaw) return null;

  let phoneNumbersArray = [];
  let emailsArray = [];

  // Handle phone numbers
  if (financeRaw.phone_numbers) {
    try {
      if (typeof financeRaw.phone_numbers === 'string') {
        try {
          phoneNumbersArray = JSON.parse(financeRaw.phone_numbers);
        } catch (jsonError) {
          const cleaned = financeRaw.phone_numbers
            .replace(/[\[\]"]/g, '')
            .split(/[,;]/)
            .map(num => num.trim())
            .filter(num => num.length > 0);

          if (cleaned.length > 0) {
            phoneNumbersArray = cleaned;
          } else {
            phoneNumbersArray = [financeRaw.phone_numbers];
          }
        }
      } else if (Array.isArray(financeRaw.phone_numbers)) {
        phoneNumbersArray = financeRaw.phone_numbers;
      }
    } catch (err) {
      console.error('Error processing phone numbers:', err);
      phoneNumbersArray = [];
    }
  }

  // Handle emails
  if (financeRaw.emails) {
    try {
      if (typeof financeRaw.emails === 'string') {
        try {
          emailsArray = JSON.parse(financeRaw.emails);
        } catch (jsonError) {
          const cleaned = financeRaw.emails
            .replace(/[\[\]"]/g, '')
            .split(/[,;]/)
            .map(email => email.trim())
            .filter(email => email.length > 0 && email.includes('@'));

          if (cleaned.length > 0) {
            emailsArray = cleaned;
          } else {
            if (financeRaw.emails.includes('@')) {
              emailsArray = [financeRaw.emails];
            }
          }
        }
      } else if (Array.isArray(financeRaw.emails)) {
        emailsArray = financeRaw.emails;
      }
    } catch (err) {
      console.error('Error processing emails:', err);
      emailsArray = [];
    }
  }

  // Build address string
  const addressParts = [];
  if (financeRaw.house_no) addressParts.push(`House No: ${financeRaw.house_no}`);
  if (financeRaw.street) addressParts.push(`Street: ${financeRaw.street}`);
  if (financeRaw.street_name) addressParts.push(financeRaw.street_name);
  if (financeRaw.village) addressParts.push(financeRaw.village);
  if (financeRaw.land_mark) addressParts.push(`Near ${financeRaw.land_mark}`);
  if (financeRaw.address) addressParts.push(financeRaw.address);

  const locationParts = [];
  if (financeRaw.city) locationParts.push(financeRaw.city);
  if (financeRaw.district) locationParts.push(financeRaw.district);
  if (financeRaw.state) locationParts.push(financeRaw.state);
  if (financeRaw.pincode) locationParts.push(financeRaw.pincode);

  const fullLocation = locationParts.join(', ');
  if (fullLocation) addressParts.push(fullLocation);
  if (financeRaw.location) addressParts.push(`Location: ${financeRaw.location}`);

  const fullAddress = addressParts.join(', ');

  return {
    id: financeRaw.id,
    name: financeRaw.finance_name,
    phone_numbers: phoneNumbersArray,
    emails: emailsArray,
    phone: phoneNumbersArray.length > 0 ? phoneNumbersArray[0] : '',
    email: emailsArray.length > 0 ? emailsArray[0] : '',
    since: financeRaw.since,
    finance_photo: financeRaw.finance_photo,
    created_at: financeRaw.created_at,
    updated_at: financeRaw.updated_at,
    is_active: financeRaw.is_active,
    owner_id: financeRaw.owner_id,
    address: fullAddress,
    house_no: financeRaw.house_no,
    street: financeRaw.street,
    street_name: financeRaw.street_name,
    village: financeRaw.village,
    land_mark: financeRaw.land_mark,
    city: financeRaw.city,
    district: financeRaw.district,
    state: financeRaw.state,
    pincode: financeRaw.pincode,
    location: financeRaw.location
  };
};

function parseAllowedCompanies(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value.map(v => String(v).trim());

  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      return JSON.parse(value).map(v => String(v).trim());
    } catch {
      return [];
    }
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(v => String(v).trim())
      .filter(Boolean);
  }

  return [];
}

// ========= FINANCE LOGIN ==========
router.post('/finance-login', async (req, res) => {
  try {
    const { userName, password } = req.body;

    // PostgreSQL query with parameterized placeholders
    // NOTE: original query joined a non-existent "finnance" table.
    // finance_detail has no username/password of its own — those live on
    // "owner". This assumes finance-login is meant to authenticate via the
    // owning owner's credentials; confirm this matches your intended flow.
    const result = await db.query(`
      SELECT fd.*, o.username AS user_name, o.password 
      FROM finance_detail fd 
      JOIN owner o ON fd.owner_id = o.id 
      WHERE o.username = $1
    `, [userName]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const financeData = result.rows[0];

    if (password !== financeData.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { finance: { id: financeData.id, name: financeData.finance_name } },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      finance: {
        id: financeData.id,
        name: financeData.finance_name,
        owner: financeData.owner_name
      },
      token
    });
  } catch (error) {
    console.error('Finance login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========= OWNER LOGIN ==========
router.post('/owner-login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // PostgreSQL query
    const result = await db.query(
      'SELECT * FROM owner WHERE username = $1 AND is_active = 1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const owner = result.rows[0];
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, owner.password);
    } catch (bcryptErr) {
      isMatch = false;
    }

    if (!isMatch && password === owner.password) {
      isMatch = true;
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query(
          'UPDATE owner SET password = $1 WHERE id = $2',
          [hashedPassword, owner.id]
        );
      } catch (hashErr) {
        console.error('Failed to auto-hash owner password:', hashErr);
      }
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        owner: {
          id: owner.id,
          username: owner.username
        }
      },
      JWT_SECRET,
      { expiresIn: '90d' }
    );

    // PostgreSQL query for finances
    const financesResult = await db.query(
      `SELECT id, finance_name as name 
       FROM finance_detail 
       WHERE owner_id = $1 AND is_active = 1 
       ORDER BY finance_name ASC`,
      [owner.id]
    );

    res.json({
      success: true,
      message: 'Login successful',
      owner: {
        id: owner.id,
        username: owner.username,
        created_at: owner.created_at,
        updated_at: owner.updated_at,
        is_active: owner.is_active === 1,
        finance_count: financesResult.rows.length,
        finances: financesResult.rows
      },
      token,
      expires_in: '90d'
    });

  } catch (error) {
    console.error('Owner login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// ========== HELPER: Login Time Window Check ==========
// Supports standard day shifts (from <= to) and overnight shifts (from > to)
const isWithinLoginWindow = (loginTimeFrom, loginTimeTo) => {
  if (!loginTimeFrom || !loginTimeTo) return true; // No restriction configured

  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const currentDate = new Date(now);
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

  const parseTime = (timeStr) => {
    const parts = String(timeStr).split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  const fromMinutes = parseTime(loginTimeFrom);
  const toMinutes = parseTime(loginTimeTo);

  if (fromMinutes <= toMinutes) {
    // Standard day shift: e.g., 09:00 to 18:00
    return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
  } else {
    // Overnight shift: e.g., 22:00 to 06:00
    return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
  }
};

// ========== USER LOGIN WITH FINANCE SELECTION ==========
router.post('/user-login', async (req, res) => {
  try {
    const { identifier, username, phone_no, email, password, financeId } = req.body;
    // Support login via username or phone_no (accept any identifier sent by client)
    const loginIdentifier = (identifier || username || phone_no || email || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username or phone number and password are required',
        error_code: 'MISSING_CREDENTIALS'
      });
    }

    const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

    if (!ownerToken) {
      return res.status(401).json({
        success: false,
        message: 'Owner authentication required',
        error_code: 'OWNER_TOKEN_REQUIRED'
      });
    }

    let ownerDecoded;
    try {
      ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid owner token',
        error_code: 'INVALID_OWNER_TOKEN'
      });
    }

    // PostgreSQL query: find user by username OR phone_no
    const userResult = await db.query(
      `SELECT * FROM users WHERE (username = $1 OR phone_no = $1) AND is_active = 1`,
      [loginIdentifier]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error_code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (bcryptError) {
      isMatch = (password === user.password);
      if (isMatch) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query(
          'UPDATE users SET password = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
      }
    }

    if (!isMatch && password === user.password) {
      isMatch = true;
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query(
          'UPDATE users SET password = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
      } catch (hashErr) { }
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error_code: 'INVALID_PASSWORD'
      });
    }

    const financeIdStr = String(financeId).trim();
    if (!financeIdStr || financeIdStr === 'undefined' || financeIdStr === 'null' || financeIdStr === 'NaN') {
      return res.status(400).json({
        success: false,
        message: 'Invalid financeId',
        error_code: 'INVALID_FINANCE_ID'
      });
    }

    // PostgreSQL query with joins
    const financeResult = await db.query(`
      SELECT 
        fd.*,
        a.house_no,
        a.street,
        a.street_name,
        a.village,
        a.land_mark,
        a.address,
        a.city,
        a.district,
        a.state,
        a.pincode,
        a.location,
        o.username as owner_username
      FROM finance_detail fd
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id::text
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      LEFT JOIN owner o ON fd.owner_id = o.id
      WHERE fd.id = $1 AND fd.is_active = 1
    `, [financeIdStr]);

    if (financeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Finance company not found',
        error_code: 'FINANCE_NOT_FOUND'
      });
    }

    const financeRaw = financeResult.rows[0];

    if (String(financeRaw.owner_id) !== String(ownerDecoded.owner.id)) {
      return res.status(403).json({
        success: false,
        message: 'Finance company does not belong to this owner',
        error_code: 'FINANCE_OWNER_MISMATCH'
      });
    }

    // Query company-scoped membership with role and login restrictions
    const uacResult = await db.query(
      `SELECT finance_id, role, login_time_from, login_time_to, last_accessed_at, is_active
       FROM user_allowed_companies WHERE user_id = $1 AND is_active = 1`,
      [user.id]
    );
    const allowedCompanies = uacResult.rows.map(r => String(r.finance_id));

    // Find the specific company membership for the requested finance
    const targetCompanyMembership = uacResult.rows.find(
      r => String(r.finance_id) === financeIdStr
    );

    // Determine role: company-scoped role takes priority
    const companyRole = targetCompanyMembership?.role || null;
    const isOwnerOrAdmin = companyRole === 'owner' || companyRole === 'admin';
    const isExplicitlyAllowed = allowedCompanies.includes(financeIdStr);

    if (!isOwnerOrAdmin && !isExplicitlyAllowed) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized for this finance company',
        error_code: 'FINANCE_ACCESS_DENIED'
      });
    }

    // Enforce login time restrictions for non-owner/admin roles
    if (targetCompanyMembership && !isOwnerOrAdmin) {
      const { login_time_from, login_time_to } = targetCompanyMembership;
      if (login_time_from && login_time_to) {
        if (!isWithinLoginWindow(login_time_from, login_time_to)) {
          // Format times for user-friendly display
          const formatTime = (t) => {
            const parts = String(t).split(':');
            const h = parseInt(parts[0], 10);
            const m = parts[1] || '00';
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
          };
          return res.status(403).json({
            success: false,
            message: `Login is currently unavailable. Your permitted login hours are ${formatTime(login_time_from)} – ${formatTime(login_time_to)}. Please try again during your authorized working hours.`,
            error_code: 'LOGIN_TIME_RESTRICTED',
            allowed_from: String(login_time_from),
            allowed_to: String(login_time_to)
          });
        }
      }
    }

    const financeData = formatFinanceData(financeRaw);

    // PostgreSQL query for statistics
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers WHERE finance_id = $1) as customer_count,
        (SELECT COUNT(*) FROM loans WHERE finance_id = $1) as loan_count,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE finance_id = $1) as total_collection
    `, [financeIdStr]);

    const userToken = jwt.sign(
      {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: companyRole,
          allowed_companies: allowedCompanies,
          current_finance_id: financeIdStr,
          finance_name: financeData.name
        }
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last_accessed_at in user_allowed_companies for this company
    await db.query(
      'UPDATE user_allowed_companies SET last_accessed_at = NOW() WHERE user_id = $1 AND finance_id = $2',
      [user.id, financeIdStr]
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        user_id: user.id,
        email: user.email,
        username: user.username,
        phone_no: user.phone_no,
        role: companyRole,
        allowed_companies: allowedCompanies,
        current_finance_id: financeIdStr,
        login_time_from: targetCompanyMembership?.login_time_from || null,
        login_time_to: targetCompanyMembership?.login_time_to || null,
        last_accessed_at: targetCompanyMembership?.last_accessed_at || null,
        created_at: user.created_at
      },
      finance: financeData,
      statistics: {
        customer_count: parseInt(statsResult.rows[0]?.customer_count) || 0,
        loan_count: parseInt(statsResult.rows[0]?.loan_count) || 0,
        total_collection: parseFloat(statsResult.rows[0]?.total_collection) || 0
      },
      token: userToken,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== GET OWNER'S FINANCE COMPANIES ==========
router.get('/owner-finances', async (req, res) => {
  try {
    const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

    if (!ownerToken) {
      return res.status(401).json({ success: false, message: 'Owner authentication required' });
    }

    let ownerDecoded;
    try {
      ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid owner token' });
    }

    // PostgreSQL query
    const result = await db.query(`
      SELECT 
        fd.id, 
        fd.finance_name as name, 
        fd.owner_id, 
        fd.phone_numbers,
        fd.emails,
        fd.since,
        fd.finance_photo,
        fd.is_active,
        fd.created_at,
        a.address,
        a.city,
        a.district,
        a.state,
        a.pincode
      FROM finance_detail fd
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id::text
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.owner_id = $1 AND fd.is_active = 1
      ORDER BY fd.finance_name ASC
    `, [ownerDecoded.owner.id]);

    const processedFinances = result.rows.map(finance => {
      const financeData = formatFinanceData(finance);
      return {
        id: finance.id,
        name: finance.name,
        owner_id: finance.owner_id,
        phone: financeData.phone,
        email: financeData.email,
        address: financeData.address,
        city: finance.city,
        district: finance.district,
        state: finance.state,
        pincode: finance.pincode,
        since: finance.since,
        finance_photo: finance.finance_photo,
        is_active: finance.is_active,
        created_at: finance.created_at
      };
    });

    res.json({
      success: true,
      finances: processedFinances,
      total: processedFinances.length
    });
  } catch (error) {
    console.error('Error fetching owner finances:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========== REFRESH FINANCE DETAILS ==========
router.get('/finance-details/:financeId', async (req, res) => {
  try {
    const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

    if (!ownerToken) {
      return res.status(401).json({
        success: false,
        message: 'Owner authentication required'
      });
    }

    const financeId = String(req.params.financeId).trim();

    let ownerDecoded;
    try {
      ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid owner token' });
    }

    // PostgreSQL query
    const result = await db.query(`
      SELECT 
        fd.*,
        a.house_no,
        a.street,
        a.street_name,
        a.village,
        a.land_mark,
        a.address,
        a.city,
        a.district,
        a.state,
        a.pincode,
        a.location
      FROM finance_detail fd
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id::text
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.id = $1 AND fd.owner_id = $2 AND fd.is_active = 1
    `, [financeId, ownerDecoded.owner.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Finance company not found'
      });
    }

    const financeData = formatFinanceData(result.rows[0]);

    res.json({
      success: true,
      finance: financeData
    });

  } catch (error) {
    console.error('Error fetching finance details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ========== CREATE USER (owner only) ==========
router.post(
  '/users/create',
  userPhotoUpload.single('userPhoto'),
  async (req, res) => {
    let uploadedPhotoUrl = null;

    try {
      const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');
      if (!ownerToken) {
        return res.status(401).json({ success: false, message: 'Owner authentication required' });
      }

      let ownerDecoded;
      try {
        ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid owner token' });
      }

      let user, staff_details;
      try {
        user = req.body.user ? JSON.parse(req.body.user) : null;
        staff_details = req.body.staff_details ? JSON.parse(req.body.staff_details) : null;
      } catch (parseErr) {
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
      }

      if (!user || !user.email || !user.password || !user.username || !user.phone_no) {
        return res.status(400).json({ success: false, message: 'Missing required user fields' });
      }

      // PostgreSQL uniqueness checks
      const emailCheck = await db.query('SELECT id FROM users WHERE email = $1', [user.email]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }

      const usernameCheck = await db.query('SELECT id FROM users WHERE username = $1', [user.username]);
      if (usernameCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Username already in use' });
      }

      const phoneCheck = await db.query('SELECT id FROM users WHERE phone_no = $1', [user.phone_no]);
      if (phoneCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Phone number already in use' });
      }

      // Upload photo to S3 if provided
      if (req.file) {
        console.log('Uploading user photo to S3:', req.file.originalname);
        const fileName = generateFileName(req.file.originalname);
        uploadedPhotoUrl = await uploadUserPhotoToS3(req.file.buffer, fileName);
        console.log('User photo uploaded:', uploadedPhotoUrl);
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);

      const isActiveValue = (user.is_active === false || user.is_active === 0 || user.is_active === '0' || user.is_active === 'false') ? 0 : 1;

      // PostgreSQL INSERT with RETURNING — no longer includes user_role, login_time_from, login_time_to
      const insertResult = await db.query(
        `INSERT INTO users (
          email, username, phone_no, password, is_active
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [
          user.email,
          user.username,
          user.phone_no,
          hashedPassword,
          isActiveValue,
        ]
      );

      const userId = insertResult.rows[0].id;
      const staffDetailId = userId;

      // Insert user allowed companies with company-scoped role and login times
      const companiesToAssign = Array.isArray(user.allowed_companies) ? user.allowed_companies : [];
      const userRole = user.user_role || 'agent';
      for (const compId of companiesToAssign) {
        if (compId) {
          await db.query(
            `INSERT INTO user_allowed_companies (user_id, finance_id, role, login_time_from, login_time_to, is_active)
             VALUES ($1, $2, $3, $4, $5, 1)
             ON CONFLICT (user_id, finance_id) DO NOTHING`,
            [userId, compId, userRole, user.login_time_from || null, user.login_time_to || null]
          );
        }
      }

      // Insert staff details (with user_id FK linkage)
      if (staff_details) {
        await db.query(
          `INSERT INTO users_details (
            id, user_id, finance_id, staff_name, staff_code, father_spouse_name,
            experience_years, education_qualification, photo, joining_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            staffDetailId,
            userId,
            staff_details.finance_id,
            staff_details.staff_name,
            staff_details.staff_code || null,
            staff_details.father_spouse_name || null,
            staff_details.experience_years || 0,
            staff_details.education_qualification || null,
            uploadedPhotoUrl || null,
            staff_details.joining_date || new Date().toISOString().split('T')[0],
          ]
        );
      }

      // PostgreSQL SELECT to get created user — join with user_allowed_companies for role
      const userResult = await db.query(
        `SELECT
          u.id, u.email, u.username, u.phone_no, u.is_active, u.created_at,
          uac.role,
          uac.login_time_from, uac.login_time_to
        FROM users u
        LEFT JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.is_active = 1
        WHERE u.id = $1
        LIMIT 1`,
        [userId]
      );

      const createdUser = userResult.rows[0];
      const parsedAllowedCompanies = companiesToAssign.map(c => String(c));

      const signedUserPhoto = await getSignedImageUrl(uploadedPhotoUrl);

      res.json({
        success: true,
        message: 'User created successfully',
        user: {
          ...createdUser,
          user_id: userId,
          allowed_companies: parsedAllowedCompanies,
          photo: signedUserPhoto,
        },
      });
    } catch (error) {
      if (uploadedPhotoUrl) {
        await deleteUserPhotoFromS3(uploadedPhotoUrl).catch(() => { });
      }
      console.error('Create user error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
);

// ========== CHECK USERNAME AVAILABILITY ==========
router.get('/users/check-username', enhancedCheckFinance, async (req, res) => {
  try {
    const { username, excludeUserId } = req.query;

    if (!username || String(username).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();

    // Check length
    if (normalizedUsername.length > 100) {
      return res.status(400).json({ success: false, message: 'Username must be at most 100 characters' });
    }

    let result;
    if (excludeUserId) {
      result = await db.query(
        'SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2::uuid LIMIT 1',
        [normalizedUsername, excludeUserId]
      );
    } else {
      result = await db.query(
        'SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1',
        [normalizedUsername]
      );
    }

    res.json({
      success: true,
      available: result.rows.length === 0,
      username: normalizedUsername,
    });
  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify username', error_code: 'CHECK_ERROR' });
  }
});

// ========== CHECK IDENTITY (EMAIL / PHONE) ==========
router.get('/users/check-identity', enhancedCheckFinance, async (req, res) => {
  try {
    const { email, phone } = req.query;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required' });
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Validate phone format if provided
    if (phone && !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Phone number must be 10 digits' });
    }

    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    const normalizedPhone = phone ? String(phone).trim() : null;

    const result = await db.query(
      `SELECT id, username, email, phone_no, is_active
       FROM users
       WHERE ($1::text IS NOT NULL AND LOWER(email) = $1)
          OR ($2::text IS NOT NULL AND phone_no = $2)`,
      [normalizedEmail, normalizedPhone]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, exists: false, available: true });
    }

    // Check for cross-account conflict
    if (result.rows.length >= 2) {
      // Email and phone belong to different users
      return res.json({
        success: true,
        exists: true,
        available: false,
        conflict: true,
        message: 'Email and phone number belong to different accounts. Please resolve manually.',
      });
    }

    // Single user found
    const foundUser = result.rows[0];

    // Verify if the matched user's email AND phone both match (or only one was provided)
    if (normalizedEmail && normalizedPhone) {
      const emailMatches = foundUser.email.toLowerCase() === normalizedEmail;
      const phoneMatches = foundUser.phone_no === normalizedPhone;

      if (emailMatches && !phoneMatches) {
        // Email matches this user, but phone doesn't match this user — check if phone belongs to someone else
        const phoneCheck = await db.query('SELECT id FROM users WHERE phone_no = $1', [normalizedPhone]);
        if (phoneCheck.rows.length > 0 && String(phoneCheck.rows[0].id) !== String(foundUser.id)) {
          return res.json({
            success: true,
            exists: true,
            available: false,
            conflict: true,
            message: 'Email and phone number belong to different accounts. Please resolve manually.',
          });
        }
      } else if (!emailMatches && phoneMatches) {
        // Phone matches this user, but email doesn't match — check if email belongs to someone else
        const emailCheck = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
        if (emailCheck.rows.length > 0 && String(emailCheck.rows[0].id) !== String(foundUser.id)) {
          return res.json({
            success: true,
            exists: true,
            available: false,
            conflict: true,
            message: 'Email and phone number belong to different accounts. Please resolve manually.',
          });
        }
      }
    }

    res.json({
      success: true,
      exists: true,
      available: false,
      conflict: false,
      user: {
        id: foundUser.id,
        username: foundUser.username,
        email: foundUser.email,
        phone_no: foundUser.phone_no,
        is_active: foundUser.is_active,
      },
    });
  } catch (error) {
    console.error('Check identity error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify identity', error_code: 'CHECK_ERROR' });
  }
});

// ========== CHECK EMAIL AVAILABILITY ==========
router.get('/users/check-email', enhancedCheckFinance, async (req, res) => {
  try {
    const { email, excludeUserId } = req.query;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    let query = 'SELECT id, username, email, phone_no, is_active FROM users WHERE LOWER(email) = $1';
    const params = [normalizedEmail];

    if (excludeUserId) {
      query += ' AND id != $2::uuid';
      params.push(excludeUserId);
    }
    query += ' LIMIT 1';

    const result = await db.query(query, params);
    const existing = result.rows[0] || null;

    res.json({
      success: true,
      available: !existing,
      exists: Boolean(existing),
      user: existing ? {
        id: existing.id,
        username: existing.username,
        email: existing.email,
        phone_no: existing.phone_no,
        is_active: existing.is_active,
      } : null,
    });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify email', error_code: 'CHECK_ERROR' });
  }
});

// ========== CHECK PHONE AVAILABILITY ==========
router.get('/users/check-phone', enhancedCheckFinance, async (req, res) => {
  try {
    const { phone, excludeUserId } = req.query;
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Phone number must be 10 digits' });
    }

    const normalizedPhone = String(phone).trim();
    let query = 'SELECT id, username, email, phone_no, is_active FROM users WHERE phone_no = $1';
    const params = [normalizedPhone];

    if (excludeUserId) {
      query += ' AND id != $2::uuid';
      params.push(excludeUserId);
    }
    query += ' LIMIT 1';

    const result = await db.query(query, params);
    const existing = result.rows[0] || null;

    res.json({
      success: true,
      available: !existing,
      exists: Boolean(existing),
      user: existing ? {
        id: existing.id,
        username: existing.username,
        email: existing.email,
        phone_no: existing.phone_no,
        is_active: existing.is_active,
      } : null,
    });
  } catch (error) {
    console.error('Check phone error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify phone', error_code: 'CHECK_ERROR' });
  }
});

// ========== SEARCH USERS (FOR INVITATION) ==========
router.get('/users/search', enhancedCheckFinance, async (req, res) => {
  try {
    const { q, financeId } = req.query;

    if (!q || String(q).trim().length < 1) {
      return res.json({ success: true, users: [] });
    }

    const searchTerm = `%${String(q).trim()}%`;
    const targetFinanceId = financeId ? String(financeId).trim() : null;

    // Search active or registered users by username, email, or phone
    const usersResult = await db.query(
      `SELECT 
         u.id, u.username, u.email, u.phone_no, u.is_active, u.created_at,
         ud.staff_name, ud.photo
       FROM users u
       LEFT JOIN LATERAL (
         SELECT staff_name, photo 
         FROM users_details 
         WHERE user_id = u.id OR id = u.id 
         ORDER BY created_at DESC 
         LIMIT 1
       ) ud ON true
       WHERE (u.username ILIKE $1 OR u.email ILIKE $1 OR u.phone_no ILIKE $1)
       ORDER BY u.username ASC
       LIMIT 30`,
      [searchTerm]
    );

    // Enrich users with current memberships and pending invitations
    const enrichedUsers = await Promise.all(
      usersResult.rows.map(async (u) => {
        // Query user's allowed companies
        const membershipsRes = await db.query(
          `SELECT uac.finance_id, fd.finance_name, uac.role, uac.is_active
           FROM user_allowed_companies uac
           LEFT JOIN finance_detail fd ON fd.id = uac.finance_id
           WHERE uac.user_id = $1 AND uac.is_active = 1`,
          [u.id]
        );

        // Query pending invitations
        const pendingRes = await db.query(
          `SELECT ai.finance_id, fd.finance_name, ai.status, ai.created_at
           FROM agent_invitations ai
           LEFT JOIN finance_detail fd ON fd.id = ai.finance_id
           WHERE ai.user_id = $1 AND ai.status = 'pending'`,
          [u.id]
        );

        const memberCompanyIds = membershipsRes.rows.map(m => String(m.finance_id));
        const pendingCompanyIds = pendingRes.rows.map(p => String(p.finance_id));

        const isMemberOfTarget = targetFinanceId ? memberCompanyIds.includes(targetFinanceId) : false;
        const hasPendingForTarget = targetFinanceId ? pendingCompanyIds.includes(targetFinanceId) : false;

        return {
          id: u.id,
          username: u.username,
          display_name: u.staff_name || u.username,
          email: u.email,
          phone_no: u.phone_no,
          photo: await getSignedImageUrl(u.photo),
          is_active: u.is_active,
          created_at: u.created_at,
          memberships: membershipsRes.rows,
          pending_invitations: pendingRes.rows,
          is_member_of_target: isMemberOfTarget,
          has_pending_for_target: hasPendingForTarget,
        };
      })
    );

    res.json({
      success: true,
      users: enrichedUsers,
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: 'Failed to search users', error: error.message });
  }
});

// ========== INVITE EXISTING USER TO COMPANY ==========
router.post(
  '/users/invite-existing',
  userPhotoUpload.single('userPhoto'),
  async (req, res) => {
    let uploadedPhotoUrl = null;
    const client = await db.connect();

    try {
      // Authenticate owner
      const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');
      if (!ownerToken) {
        client.release();
        return res.status(401).json({ success: false, message: 'Owner authentication required' });
      }

      let ownerDecoded;
      try {
        ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
      } catch (err) {
        client.release();
        return res.status(401).json({ success: false, message: 'Invalid owner token' });
      }

      // Parse body — supports both JSON and multipart/form-data
      let body;
      try {
        body = req.body.invitation ? JSON.parse(req.body.invitation) : req.body;
      } catch (parseErr) {
        client.release();
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
      }

      const {
        userId,
        financeId,
        financeIds,
        role,
        staffCode,
        staffName,
        fatherName,
        spouseName,
        education,
        experienceYears,
        joiningDate,
        loginTimeFrom,
        loginTimeTo,
      } = body;

      // Determine target companies list
      const targetFinanceIds = Array.isArray(financeIds) && financeIds.length > 0
        ? financeIds
        : (financeId ? [financeId] : []);

      if (!userId || targetFinanceIds.length === 0 || !staffCode) {
        client.release();
        return res.status(400).json({
          success: false,
          message: 'userId, at least one company (financeId/financeIds), and staffCode are required',
        });
      }

      // Validate role — prevent privilege escalation
      const validRoles = ['agent', 'staff', 'admin'];
      const assignedRole = validRoles.includes(role) ? role : 'agent';

      // Verify target user exists and is active
      const userCheck = await client.query('SELECT id, username, email, phone_no FROM users WHERE id = $1 AND is_active = 1', [userId]);
      if (userCheck.rows.length === 0) {
        client.release();
        return res.status(404).json({ success: false, message: 'User not found or inactive' });
      }
      const targetUser = userCheck.rows[0];

      const ownerId = String(ownerDecoded.owner?.id || ownerDecoded.user?.id);

      // Validate each target finance company belongs to the owner
      for (const fid of targetFinanceIds) {
        const financeCheck = await client.query(
          'SELECT id, owner_id FROM finance_detail WHERE id = $1 AND is_active = 1',
          [fid]
        );
        if (financeCheck.rows.length === 0) {
          client.release();
          return res.status(404).json({ success: false, message: `Finance company ${fid} not found` });
        }
        if (String(financeCheck.rows[0].owner_id) !== ownerId) {
          client.release();
          return res.status(403).json({ success: false, message: `Finance company ${fid} does not belong to this owner` });
        }

        // Check if user already has active membership in this company
        const existingMembership = await client.query(
          'SELECT id, is_active FROM user_allowed_companies WHERE user_id = $1 AND finance_id = $2',
          [userId, fid]
        );
        if (existingMembership.rows.length > 0 && existingMembership.rows[0].is_active === 1) {
          client.release();
          return res.status(409).json({ success: false, message: `User is already an active member of company ${fid}` });
        }

        // Check staff code uniqueness within the target company
        const staffCodeCheck = await client.query(
          'SELECT id FROM users_details WHERE staff_code = $1 AND finance_id = $2',
          [staffCode, fid]
        );
        if (staffCodeCheck.rows.length > 0) {
          client.release();
          return res.status(409).json({ success: false, message: `Staff code "${staffCode}" is already in use in this company` });
        }

        // Check for duplicate pending invitations
        const pendingCheck = await client.query(
          `SELECT id FROM agent_invitations WHERE user_id = $1 AND finance_id = $2 AND status = 'pending'`,
          [userId, fid]
        );
        if (pendingCheck.rows.length > 0) {
          client.release();
          return res.status(409).json({ success: false, message: 'A pending invitation already exists for this user and company' });
        }
      }

      // Upload photo if provided
      if (req.file) {
        const fileName = generateFileName(req.file.originalname);
        uploadedPhotoUrl = await uploadUserPhotoToS3(req.file.buffer, fileName);
      }

      // Resolve inviter user ID
      let invitedByUserId = null;
      if (ownerDecoded.user?.id) {
        invitedByUserId = ownerDecoded.user.id;
      } else if (ownerDecoded.owner?.id) {
        const ownerUserCheck = await client.query('SELECT id FROM users WHERE id = $1', [ownerDecoded.owner.id]);
        if (ownerUserCheck.rows.length > 0) {
          invitedByUserId = ownerDecoded.owner.id;
        }
      }

      // Prepare consolidated father/spouse name
      const fatherSpouseCombined = [fatherName, spouseName].filter(Boolean).join(' / ') || body.father_spouse_name || null;
      const parsedExperience = parseInt(experienceYears || body.experience_years, 10) || 0;
      const resolvedStaffName = staffName || body.staff_name || targetUser.username;
      const resolvedJoiningDate = joiningDate || body.joining_date || new Date().toISOString().split('T')[0];
      const resolvedEducation = education || body.education_qualification || null;

      // BEGIN TRANSACTION
      await client.query('BEGIN');

      for (const fid of targetFinanceIds) {
        // 1. Insert or reactivate company membership
        const existingMembership = await client.query(
          'SELECT id, is_active FROM user_allowed_companies WHERE user_id = $1 AND finance_id = $2',
          [userId, fid]
        );

        if (existingMembership.rows.length > 0) {
          await client.query(
            `UPDATE user_allowed_companies
             SET role = $1, login_time_from = $2, login_time_to = $3, is_active = 1, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4 AND finance_id = $5`,
            [assignedRole, loginTimeFrom || null, loginTimeTo || null, userId, fid]
          );
        } else {
          await client.query(
            `INSERT INTO user_allowed_companies (user_id, finance_id, role, login_time_from, login_time_to, is_active)
             VALUES ($1, $2, $3, $4, $5, 1)`,
            [userId, fid, assignedRole, loginTimeFrom || null, loginTimeTo || null]
          );
        }

        // 2. Insert or update staff details for this company
        const existingStaffDetail = await client.query(
          'SELECT id FROM users_details WHERE user_id = $1 AND finance_id = $2',
          [userId, fid]
        );

        if (existingStaffDetail.rows.length === 0) {
          await client.query(
            `INSERT INTO users_details (
               user_id, finance_id, staff_name, staff_code, father_spouse_name,
               experience_years, education_qualification, photo, joining_date
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              userId,
              fid,
              resolvedStaffName,
              staffCode,
              fatherSpouseCombined,
              parsedExperience,
              resolvedEducation,
              uploadedPhotoUrl || null,
              resolvedJoiningDate,
            ]
          );
        } else {
          await client.query(
            `UPDATE users_details 
             SET staff_name = $1, staff_code = $2, father_spouse_name = COALESCE($3, father_spouse_name),
                 experience_years = $4, education_qualification = COALESCE($5, education_qualification),
                 photo = COALESCE($6, photo), joining_date = COALESCE($7, joining_date), updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $8 AND finance_id = $9`,
            [
              resolvedStaffName,
              staffCode,
              fatherSpouseCombined,
              parsedExperience,
              resolvedEducation,
              uploadedPhotoUrl,
              resolvedJoiningDate,
              userId,
              fid,
            ]
          );
        }

        // 3. Record invitation audit log in agent_invitations
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const invitationCode = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

        if (invitedByUserId) {
          await client.query(
            `INSERT INTO agent_invitations (
               finance_id, invited_by, user_id, invite_token, invitation_code, 
               staff_code, assigned_role, status, login_time_from, login_time_to, expires_at, accepted_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted', $8, $9, CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP)`,
            [fid, invitedByUserId, userId, inviteToken, invitationCode, staffCode, assignedRole, loginTimeFrom || null, loginTimeTo || null]
          );
        }
      }

      await client.query('COMMIT');
      client.release();

      res.json({
        success: true,
        message: 'Invitation sent successfully.',
        invitation: {
          userId,
          financeIds: targetFinanceIds,
          role: assignedRole,
          staffCode,
          staffName: resolvedStaffName,
          loginTimeFrom: loginTimeFrom || null,
          loginTimeTo: loginTimeTo || null,
          photo: uploadedPhotoUrl,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      if (uploadedPhotoUrl) {
        await deleteUserPhotoFromS3(uploadedPhotoUrl).catch(() => {});
      }
      console.error('Invite existing user error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error', error: error.message });
    }
  }
);

// ========== DELETE USER ==========
router.delete('/users/:id', async (req, res) => {
  try {
    const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

    if (!ownerToken) {
      return res.status(401).json({
        success: false,
        message: 'Owner authentication required'
      });
    }

    const userId = req.params.id;

    // PostgreSQL UPDATE
    await db.query(
      'UPDATE users SET is_active = 0 WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ========== GET ALL USERS ==========
router.get('/allUsers', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    // PostgreSQL query with JSON_CONTAINS equivalent
    // Using jsonb containment operator @> 
    // PostgreSQL query — role now comes from user_allowed_companies, not users
    const result = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        uac_target.role,
        u.phone_no,
        u.is_active,
        uac_target.last_accessed_at,
        u.created_at,
        COALESCE(
          (SELECT json_agg(uac2.finance_id) FROM user_allowed_companies uac2 WHERE uac2.user_id = u.id AND uac2.is_active = 1),
          '[]'::json
        ) AS allowed_companies
      FROM users u 
      LEFT JOIN user_allowed_companies uac_target 
        ON uac_target.user_id = u.id AND uac_target.finance_id = $1::uuid AND uac_target.is_active = 1
      WHERE u.is_active = 1
        AND (
          EXISTS (SELECT 1 FROM user_allowed_companies uac WHERE uac.user_id = u.id AND uac.finance_id = $1::uuid AND uac.is_active = 1)
        )
      ORDER BY 
        CASE uac_target.role 
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'agent' THEN 3
          WHEN 'staff' THEN 4
          ELSE 5
        END,
        u.username ASC
    `, [financeId]);

    const formattedUsers = result.rows.map(user => ({
      id: user.id,
      user_id: user.id,
      email: user.email,
      username: user.username,
      phone_no: user.phone_no,
      role: user.role,
      is_active: user.is_active,
      allowed_companies: user.allowed_companies ? (Array.isArray(user.allowed_companies) ? user.allowed_companies : parseAllowedCompanies(user.allowed_companies)) : [],
      last_accessed_at: user.last_accessed_at,
      created_at: user.created_at
    }));

    res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// ========== LOGIN ==========
router.post('/login', async (req, res) => {
  try {
    const { identifier, username, phone_no, email, password } = req.body;
    const loginIdentifier = (identifier || username || phone_no || email || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Username or phone number and password are required' });
    }

    // PostgreSQL query: strictly authenticate by username OR phone_no (never email)
    const result = await db.query(
      'SELECT * FROM users WHERE (username = $1 OR phone_no = $1) AND is_active = 1',
      [loginIdentifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Fetch company-scoped roles
    const uacResult = await db.query(
      `SELECT finance_id, role FROM user_allowed_companies WHERE user_id = $1 AND is_active = 1`,
      [user.id]
    );
    const allowedCompanies = uacResult.rows.map(r => String(r.finance_id));
    // Use the first company's role as a general role indicator
    const primaryRole = uacResult.rows.length > 0 ? uacResult.rows[0].role : 'agent';

    console.log('User found:', { id: user.id, username: user.username, phone_no: user.phone_no, role: primaryRole });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        role: primaryRole,
        allowed_companies: allowedCompanies
      }
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: primaryRole,
        allowed_companies: allowedCompanies
      },
      token
    });
  } catch (error) {
    console.error('Login error details:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========== REQUEST PASSWORD RESET ==========
router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body;

    // PostgreSQL query
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'If your email exists, a reset link has been sent' });
    }

    const user = result.rows[0];

    if (user.role === 'agent') {
      return res.status(403).json({
        success: false,
        message: 'Agents cannot reset passwords. Please contact an owner.',
        error: 'agent_not_allowed'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

    // PostgreSQL UPDATE
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
      [resetToken, resetTokenExpiry, user.id]
    );

    res.json({
      success: true,
      message: 'Password reset link sent',
      resetLink: `http://localhost:5173/reset-password?token=${resetToken}`
    });
  } catch (error) {
    console.error('Reset request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== RESET PASSWORD ==========
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    // PostgreSQL query with NOW()
    const result = await db.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    const user = result.rows[0];

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // PostgreSQL UPDATE
    await db.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== CHANGE PASSWORD ==========
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
    }

    // PostgreSQL query
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // PostgreSQL UPDATE
    await db.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== CHECK ROLE ==========
router.post('/check-role', async (req, res) => {
  try {
    const { email } = req.body;

    // Query role from user_allowed_companies (role is now company-scoped, return first found)
    const result = await db.query(
      `SELECT uac.role 
       FROM users u
       JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.is_active = 1
       WHERE u.email = $1
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({ role: null });
    }

    res.json({ role: result.rows[0].role });
  } catch (error) {
    console.error('Check role error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== GET USERS ==========
router.get('/users', checkFinance, async (req, res) => {
  try {
    // Role now comes from user_allowed_companies, not users
    const result = await db.query(
      `SELECT DISTINCT u.id, u.email, uac.role
       FROM users u
       LEFT JOIN users_details ud ON ud.id = u.id
       LEFT JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid AND uac.is_active = 1
       WHERE ud.finance_id = $1 OR uac.finance_id = $1::uuid`,
      [req.financeId]
    );

    res.json({
      success: true,
      users: result.rows
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// ========== GET ALL USERS (legacy) ==========
router.get('/allUser', checkFinance, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT 
        u.id,
        u.email,
        uac.role,
        u.created_at
      FROM users u
      LEFT JOIN users_details ud ON ud.id = u.id
      LEFT JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = $1::uuid AND uac.is_active = 1
      WHERE ud.finance_id = $1 OR uac.finance_id = $1::uuid
    `, [req.financeId]);

    res.json({
      success: true,
      users: result.rows
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ========== HEALTH CHECK ==========
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoints: {
      owner_login: '/auth/owner-login',
      finance_login: '/auth/finance-login'
    }
  });
});

module.exports = router;