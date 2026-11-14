const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { db } = require('../../config/database.config');
const crypto = require('crypto');
const {
  authMiddleware,
  ownerOnly,
  checkFinance,
  enhancedCheckFinance,
  resolveOwnerFromRequest,
} = require('../../middleware/auth.middleware');
const { haversineKm, validCoords, getClientIp, lookupIp } = require('./loginLocation');
const { changePasswordForPrincipal } = require('./changePassword.service');
const {
  getJwtSecret,
  computePasswordFingerprint,
  isWithinLoginWindow: checkWithinLoginWindow,
  issueOwnerLicenseToken,
  issueUserAccessToken,
  issueUserRefreshToken,
  revokeFamiliesInMemory,
  markSessionsRevokedInDb,
  validateOwnerPrincipal,
  validateUserPrincipal,
  verifyAndRotateRefreshSession,
} = require('./sessionSecurity.service');

// ── Failed-login sliding-window rate limiter (keyed by IP + identifier) ──
const loginFailureBuckets = new Map();
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

function getLoginBucketKey(req, identifier) {
  const ip = getClientIp(req) || 'unknown';
  const normId = String(identifier || '').trim().toLowerCase();
  return `${ip}:${normId}`;
}

function checkLoginRateLimit(req, identifier) {
  const key = getLoginBucketKey(req, identifier);
  const now = Date.now();
  const bucket = loginFailureBuckets.get(key);
  if (!bucket) return { blocked: false, retryAfterSeconds: 0 };

  if (now - bucket.firstFailedAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailureBuckets.delete(key);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  if (bucket.count >= LOGIN_MAX_FAILURES) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.firstFailedAt + LOGIN_FAILURE_WINDOW_MS - now) / 1000)
    );
    return { blocked: true, retryAfterSeconds };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

function recordFailedLoginAttempt(req, identifier) {
  const key = getLoginBucketKey(req, identifier);
  const now = Date.now();
  if (loginFailureBuckets.size > 5000) {
    for (const [k, v] of loginFailureBuckets.entries()) {
      if (now - v.firstFailedAt > LOGIN_FAILURE_WINDOW_MS) {
        loginFailureBuckets.delete(k);
      }
    }
  }
  const existing = loginFailureBuckets.get(key);
  if (!existing || now - existing.firstFailedAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailureBuckets.set(key, { count: 1, firstFailedAt: now });
  } else {
    existing.count += 1;
  }
}

function clearFailedLoginAttempts(req, identifier) {
  loginFailureBuckets.delete(getLoginBucketKey(req, identifier));
}

const logoutAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token, authorization denied',
      error_code: 'AUTH_REQUIRED',
    });
  }
  try {
    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, getJwtSecret(), { ignoreExpiration: true });
    req.authDecoded = decoded;
    req.user = decoded.user || null;
    req.owner = decoded.owner || null;
    return next();
  } catch (_err) {
    return res.status(401).json({
      success: false,
      message: 'Token is not valid',
      error_code: 'INVALID_TOKEN',
    });
  }
};
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
    location: financeRaw.location,
    office_lat: financeRaw.office_lat != null ? parseFloat(financeRaw.office_lat) : null,
    office_lng: financeRaw.office_lng != null ? parseFloat(financeRaw.office_lng) : null,
    office_geofence_m: financeRaw.office_geofence_m ? parseInt(financeRaw.office_geofence_m, 10) : 200
  };
};

// Resolve signed print_logo_url with fallback: print_logo -> web_logo -> finance_detail.finance_photo
const resolveFinancePrintLogoUrl = async (financeId, fallbackFinancePhoto = null) => {
  try {
    if (!financeId) return fallbackFinancePhoto ? await getSignedImageUrl(fallbackFinancePhoto) : null;
    const { rows } = await db.query(
      `SELECT asset_type, file_path
       FROM finance_branding_assets
       WHERE finance_id = $1
         AND asset_type IN ('print_logo', 'web_logo')
         AND is_active = true
       ORDER BY created_at DESC`,
      [financeId]
    );
    const printLogo = rows.find(r => r.asset_type === 'print_logo')?.file_path;
    const webLogo = rows.find(r => r.asset_type === 'web_logo')?.file_path;
    const rawUrl = printLogo || webLogo || fallbackFinancePhoto || null;
    return rawUrl ? await getSignedImageUrl(rawUrl) : null;
  } catch (err) {
    console.error('Error resolving finance print_logo_url:', err);
    return fallbackFinancePhoto ? await getSignedImageUrl(fallbackFinancePhoto) : null;
  }
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

// ========== HELPER: Format 24h time string to 12h AM/PM ==========
const formatLoginHour12h = (t) => {
  const parts = String(t || '').split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (Number.isNaN(h)) return String(t || '');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
};

const isWithinLoginWindow = (loginTimeFrom, loginTimeTo) =>
  checkWithinLoginWindow(loginTimeFrom, loginTimeTo);

/**
 * Shared helper: verifies User credentials (username OR phone_no + password),
 * auto-upgrades legacy plaintext passwords to bcrypt, and verifies active status.
 */
async function authenticateUserCredentials(loginIdentifier, password) {
  const userResult = await db.query(
    'SELECT * FROM users WHERE username = $1 OR phone_no = $1 LIMIT 1',
    [loginIdentifier]
  );

  if (userResult.rows.length === 0) {
    return {
      ok: false,
      status: 401,
      error_code: 'USER_NOT_FOUND',
      message: 'Invalid credentials',
      recordFailure: true,
    };
  }

  const user = { ...userResult.rows[0] };

  let isMatch = false;
  try {
    isMatch = await bcrypt.compare(password, user.password);
  } catch (_bcryptError) {
    isMatch = false;
  }

  if (!isMatch && password === user.password) {
    isMatch = true;
    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
      user.password = hashedPassword;
    } catch (_hashErr) {
      // Non-fatal if upgrade query fails; password matched
    }
  }

  if (!isMatch) {
    return {
      ok: false,
      status: 401,
      error_code: 'INVALID_PASSWORD',
      message: 'Invalid credentials',
      recordFailure: true,
    };
  }

  if (Number(user.is_active) !== 1) {
    return {
      ok: false,
      status: 403,
      error_code: 'USER_INACTIVE',
      message: 'Your user account is inactive. Please contact your administrator.',
      recordFailure: false,
    };
  }

  return { ok: true, user };
}

/**
 * Shared helper: loads full finance details + print logo + KPI statistics for a finance ID.
 */
async function loadFinanceDetailsAndStatistics(financeIdStr) {
  const financeResult = await db.query(
    `SELECT
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
       o.username AS owner_username,
       o.is_active AS owner_is_active
     FROM finance_detail fd
     LEFT JOIN address_history ah
       ON ah.entity_type = 'finance'
      AND ah.entity_id = fd.id::text
      AND ah.is_current = 1
     LEFT JOIN addresses a ON ah.address_id = a.id
     LEFT JOIN owner o ON fd.owner_id = o.id
     WHERE fd.id = $1 AND fd.is_active = 1`,
    [financeIdStr]
  );

  if (financeResult.rows.length === 0) {
    return null;
  }

  const financeRaw = financeResult.rows[0];
  const financeData = formatFinanceData(financeRaw);
  financeData.logo_url = financeRaw.finance_photo
    ? await getSignedImageUrl(financeRaw.finance_photo)
    : null;
  financeData.print_logo_url = await resolveFinancePrintLogoUrl(
    financeRaw.id,
    financeRaw.finance_photo
  );

  const statsResult = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE finance_id = $1) AS customer_count,
       (SELECT COUNT(*) FROM loans WHERE finance_id = $1) AS loan_count,
       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE finance_id = $1) AS total_collection`,
    [financeIdStr]
  );

  const statistics = {
    customer_count: parseInt(statsResult.rows[0]?.customer_count, 10) || 0,
    loan_count: parseInt(statsResult.rows[0]?.loan_count, 10) || 0,
    total_collection: parseFloat(statsResult.rows[0]?.total_collection) || 0,
  };

  return { financeRaw, financeData, statistics };
}

/**
 * Shared helper: enforces LOGIN_LOCATION_POLICY, evaluates office geofencing,
 * creates an `agent_login_sessions` attendance row, and optionally reverse-geocodes.
 */
async function evaluateLocationAndCreateAttendanceSession(req, user, financeRaw) {
  const policy = process.env.LOGIN_LOCATION_POLICY || 'prefer';
  const ip = getClientIp(req);
  const ipGeo = lookupIp(ip);
  const lat = parseFloat(req.body.latitude);
  const lng = parseFloat(req.body.longitude);
  const hasDevice = policy !== 'off' && validCoords(lat, lng);

  if (policy === 'strict' && !hasDevice) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        code: 'LOCATION_REQUIRED',
        error_code: 'LOCATION_REQUIRED',
        message: 'Location access is required to log in. Please enable location and try again.',
      },
    };
  }

  let source = 'none';
  let useLat = null;
  let useLng = null;
  let accuracy = null;

  if (hasDevice) {
    source = 'device';
    useLat = lat;
    useLng = lng;
    accuracy = Number.isFinite(+req.body.accuracyM) ? Math.round(+req.body.accuracyM) : null;
  } else if (ipGeo) {
    source = 'ip';
    useLat = ipGeo.lat;
    useLng = ipGeo.lng;
  }

  let distanceKm = null;
  let flagged = false;
  let flagReason = null;

  if (useLat !== null && financeRaw?.office_lat != null && financeRaw?.office_lng != null) {
    distanceKm = +haversineKm(
      useLat,
      useLng,
      +financeRaw.office_lat,
      +financeRaw.office_lng
    ).toFixed(2);
  }

  if (source === 'device' && ipGeo && haversineKm(lat, lng, ipGeo.lat, ipGeo.lng) > 150) {
    flagged = true;
    flagReason = 'IP_DEVICE_MISMATCH';
  } else if (
    source === 'device' &&
    distanceKm !== null &&
    distanceKm * 1000 > (financeRaw?.office_geofence_m ?? 200)
  ) {
    flagged = true;
    flagReason = 'OUTSIDE_OFFICE';
  }

  const validPermissions = ['granted', 'declined', 'blocked', 'unavailable', 'not_asked'];
  const rawPermission =
    typeof req.body.locationPermission === 'string'
      ? req.body.locationPermission.toLowerCase().trim()
      : '';
  const locationPermission = validPermissions.includes(rawPermission)
    ? rawPermission
    : 'not_asked';

  const deviceName = String(req.body.deviceName || req.headers['user-agent'] || '').slice(0, 150);
  const platform = String(req.body.platform || '').slice(0, 30);
  const ipCity = ipGeo?.city ? String(ipGeo.city).slice(0, 100) : null;
  const ipRegion = ipGeo?.region ? String(ipGeo.region).slice(0, 100) : null;
  const ipCountry = ipGeo?.country ? String(ipGeo.country).slice(0, 10) : null;

  const sessionInsert = await db.query(
    `INSERT INTO agent_login_sessions (
       user_id, device_name, platform, ip_address,
       login_lat, login_lng, distance_from_office, location_label,
       location_source, location_accuracy_m, location_permission,
       ip_city, ip_region, ip_country, flagged, flag_reason, last_seen_at
     ) VALUES (
       $1::uuid, $2, $3, $4,
       $5, $6, $7, $8,
       $9, $10, $11,
       $12, $13, $14, $15, $16, CURRENT_TIMESTAMP
     ) RETURNING id`,
    [
      user.id,
      deviceName || null,
      platform || null,
      ip || null,
      useLat,
      useLng,
      distanceKm,
      null,
      source,
      accuracy,
      locationPermission,
      ipCity,
      ipRegion,
      ipCountry,
      flagged,
      flagReason,
    ]
  );

  const sessionId = sessionInsert.rows[0].id;

  if (process.env.GOOGLE_MAPS_SERVER_KEY && source === 'device' && useLat !== null && useLng !== null) {
    setImmediate(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${useLat},${useLng}&key=${process.env.GOOGLE_MAPS_SERVER_KEY}`;
        const geoRes = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        const geoData = await geoRes.json();
        const label = geoData?.results?.[0]?.formatted_address?.slice(0, 200);
        if (label) {
          await db.query(
            'UPDATE agent_login_sessions SET location_label = $1 WHERE id = $2::uuid',
            [label, sessionId]
          );
        }
      } catch {
        // Non-critical background lookup
      }
    });
  }

  return {
    ok: true,
    sessionId,
    source,
    flagged,
    deviceName: deviceName || null,
    platform: platform || null,
  };
}

// ========= OWNER / LICENSE LOGIN (Mode A) ==========
router.post('/owner-login', async (req, res) => {
  try {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!rawUsername || !password) {
      return res.status(400).json({
        success: false,
        message: 'License ID and password are required',
        error_code: 'MISSING_CREDENTIALS',
      });
    }

    const rateState = checkLoginRateLimit(req, `license:${rawUsername}`);
    if (rateState.blocked) {
      res.set('Retry-After', String(rateState.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        error_code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: rateState.retryAfterSeconds,
      });
    }

    const result = await db.query('SELECT * FROM owner WHERE username = $1 LIMIT 1', [rawUsername]);

    if (result.rows.length === 0) {
      recordFailedLoginAttempt(req, `license:${rawUsername}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid License ID or password',
        error_code: 'INVALID_CREDENTIALS',
      });
    }

    const owner = { ...result.rows[0] };
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, owner.password);
    } catch (_bcryptErr) {
      isMatch = false;
    }

    if (!isMatch && password === owner.password) {
      isMatch = true;
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query('UPDATE owner SET password = $1 WHERE id = $2', [hashedPassword, owner.id]);
        owner.password = hashedPassword;
      } catch (hashErr) {
        console.error('Failed to auto-hash owner password:', hashErr?.message || hashErr);
      }
    }

    if (!isMatch) {
      recordFailedLoginAttempt(req, `license:${rawUsername}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid License ID or password',
        error_code: 'INVALID_CREDENTIALS',
      });
    }

    if (Number(owner.is_active) !== 1) {
      return res.status(403).json({
        success: false,
        message: 'This License is currently inactive. Please contact support.',
        error_code: 'LICENSE_INACTIVE',
      });
    }

    clearFailedLoginAttempts(req, `license:${rawUsername}`);

    const token = issueOwnerLicenseToken(owner);

    const financesResult = await db.query(
      `SELECT id, finance_name AS name
         FROM finance_detail
        WHERE owner_id = $1 AND is_active = 1
        ORDER BY finance_name ASC`,
      [owner.id]
    );

    return res.json({
      success: true,
      authMode: 'license',
      message: 'Login successful',
      owner: {
        id: owner.id,
        username: owner.username,
        created_at: owner.created_at,
        updated_at: owner.updated_at,
        is_active: owner.is_active === 1,
        finance_count: financesResult.rows.length,
        finances: financesResult.rows,
      },
      token,
      expires_in: '90d',
    });
  } catch (error) {
    console.error('Owner login error:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
});

// ========== LOGIN POLICY ==========
router.get('/login-policy', (_req, res) => {
  const locationPolicy = process.env.LOGIN_LOCATION_POLICY || 'prefer';
  res.json({
    policy: locationPolicy,
    locationPolicy,
  });
});

// ========== USER LOGIN WITH FINANCE SELECTION (Mode A: License Mode) ==========
router.post('/user-login', async (req, res) => {
  try {
    const { identifier, username, phone_no, email, password, financeId } = req.body || {};
    const loginIdentifier = String(identifier || username || phone_no || email || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username or phone number and password are required',
        error_code: 'MISSING_CREDENTIALS',
      });
    }

    const rateState = checkLoginRateLimit(req, `user:${loginIdentifier}`);
    if (rateState.blocked) {
      res.set('Retry-After', String(rateState.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        error_code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: rateState.retryAfterSeconds,
      });
    }

    const ownerToken = req.headers['owner-authorization']?.replace(/^Bearer\s+/i, '').trim();
    if (!ownerToken) {
      return res.status(401).json({
        success: false,
        message: 'License authentication required',
        error_code: 'OWNER_TOKEN_REQUIRED',
      });
    }

    let ownerDecoded;
    try {
      ownerDecoded = jwt.verify(ownerToken, getJwtSecret());
    } catch (_err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid License token',
        error_code: 'INVALID_OWNER_TOKEN',
      });
    }

    const ownerValidation = await validateOwnerPrincipal(db, ownerDecoded);
    if (!ownerValidation.valid) {
      return res.status(ownerValidation.status || 401).json({
        success: false,
        message: ownerValidation.message,
        error_code: ownerValidation.error_code,
      });
    }

    const authResult = await authenticateUserCredentials(loginIdentifier, password);
    if (!authResult.ok) {
      if (authResult.recordFailure) {
        recordFailedLoginAttempt(req, `user:${loginIdentifier}`);
      }
      return res.status(authResult.status).json({
        success: false,
        message: authResult.message,
        error_code: authResult.error_code,
      });
    }

    clearFailedLoginAttempts(req, `user:${loginIdentifier}`);
    const user = authResult.user;

    const financeIdStr = String(financeId || '').trim();
    if (
      !financeIdStr ||
      financeIdStr === 'undefined' ||
      financeIdStr === 'null' ||
      financeIdStr === 'NaN' ||
      !/^[0-9a-fA-F-]{36}$/.test(financeIdStr)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid finance company selection is required',
        error_code: 'INVALID_FINANCE_ID',
      });
    }

    const loadedFinance = await loadFinanceDetailsAndStatistics(financeIdStr);
    if (!loadedFinance) {
      return res.status(404).json({
        success: false,
        message: 'Finance company not found or inactive',
        error_code: 'FINANCE_NOT_FOUND',
      });
    }

    const { financeRaw, financeData, statistics } = loadedFinance;

    if (String(financeRaw.owner_id) !== String(ownerValidation.owner.id)) {
      return res.status(403).json({
        success: false,
        message: 'Finance company does not belong to the active License',
        error_code: 'FINANCE_OWNER_MISMATCH',
      });
    }

    // Query company-scoped memberships scoped to active finances under this License
    const uacResult = await db.query(
      `SELECT uac.finance_id,
              uac.role,
              uac.login_time_from,
              uac.login_time_to,
              uac.last_accessed_at,
              uac.is_active
         FROM user_allowed_companies uac
         INNER JOIN finance_detail fd ON fd.id = uac.finance_id
        WHERE uac.user_id = $1
          AND uac.is_active = 1
          AND fd.is_active = 1
          AND fd.owner_id = $2`,
      [user.id, ownerValidation.owner.id]
    );

    const allowedCompanies = uacResult.rows.map((r) => String(r.finance_id));
    const targetCompanyMembership = uacResult.rows.find(
      (r) => String(r.finance_id) === financeIdStr
    );

    if (!targetCompanyMembership) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized for this finance company',
        error_code: 'FINANCE_ACCESS_DENIED',
      });
    }

    const companyRole = targetCompanyMembership.role;
    const isOwnerOrAdmin = companyRole === 'owner' || companyRole === 'admin';

    if (!isOwnerOrAdmin) {
      const { login_time_from, login_time_to } = targetCompanyMembership;
      if (login_time_from && login_time_to && !isWithinLoginWindow(login_time_from, login_time_to)) {
        return res.status(403).json({
          success: false,
          message: `Login is currently unavailable. Your permitted login hours are ${formatLoginHour12h(login_time_from)} – ${formatLoginHour12h(login_time_to)}. Please try again during your authorized working hours.`,
          error_code: 'LOGIN_TIME_RESTRICTED',
          allowed_from: String(login_time_from),
          allowed_to: String(login_time_to),
        });
      }
    }

    const sessionResult = await evaluateLocationAndCreateAttendanceSession(req, user, financeRaw);
    if (!sessionResult.ok) {
      return res.status(sessionResult.status).json(sessionResult.body);
    }

    const { sessionId, source, flagged } = sessionResult;

    const userToken = issueUserAccessToken({
      user,
      role: companyRole,
      allowedCompanies,
      currentFinanceId: financeIdStr,
      financeName: financeData.name,
      sessionId,
      anchorSessionId: sessionId,
      authMode: 'license',
    });

    await db.query(
      'UPDATE user_allowed_companies SET last_accessed_at = NOW() WHERE user_id = $1 AND finance_id = $2',
      [user.id, financeIdStr]
    );

    return res.json({
      success: true,
      authMode: 'license',
      sessionId,
      locationSource: source,
      flagged,
      user: {
        id: user.id,
        user_id: user.id,
        sessionId,
        email: user.email,
        username: user.username,
        phone_no: user.phone_no,
        role: companyRole,
        allowed_companies: allowedCompanies,
        current_finance_id: financeIdStr,
        login_time_from: targetCompanyMembership.login_time_from || null,
        login_time_to: targetCompanyMembership.login_time_to || null,
        last_accessed_at: targetCompanyMembership.last_accessed_at || null,
        created_at: user.created_at,
      },
      finance: {
        ...financeData,
        user_role: companyRole,
        login_time_from: targetCompanyMembership.login_time_from || null,
        login_time_to: targetCompanyMembership.login_time_to || null,
      },
      statistics,
      token: userToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('User login error:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// ========== DIRECT USER LOGIN (Mode B: Direct User Authentication) ==========
router.post('/direct-user-login', async (req, res) => {
  try {
    const { identifier, username, phone_no, password } = req.body || {};
    const loginIdentifier = String(identifier || username || phone_no || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username or phone number and password are required',
        error_code: 'MISSING_CREDENTIALS',
      });
    }

    const rateState = checkLoginRateLimit(req, `direct:${loginIdentifier}`);
    if (rateState.blocked) {
      res.set('Retry-After', String(rateState.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        error_code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: rateState.retryAfterSeconds,
      });
    }

    const authResult = await authenticateUserCredentials(loginIdentifier, password);
    if (!authResult.ok) {
      if (authResult.recordFailure) {
        recordFailedLoginAttempt(req, `direct:${loginIdentifier}`);
      }
      return res.status(authResult.status).json({
        success: false,
        message: authResult.message,
        error_code: authResult.error_code,
      });
    }

    clearFailedLoginAttempts(req, `direct:${loginIdentifier}`);
    const user = authResult.user;

    // Fetch all permitted companies with active status & License status
    const membershipsRes = await db.query(
      `SELECT uac.finance_id,
              uac.role,
              uac.login_time_from,
              uac.login_time_to,
              uac.last_accessed_at,
              fd.finance_name,
              fd.owner_id,
              fd.phone_numbers,
              fd.emails,
              fd.since,
              fd.finance_photo,
              fd.is_active AS finance_is_active,
              fd.created_at,
              a.address,
              a.city,
              a.district,
              a.state,
              a.pincode,
              o.username AS owner_username,
              o.is_active AS owner_is_active
         FROM user_allowed_companies uac
         INNER JOIN finance_detail fd ON fd.id = uac.finance_id
         INNER JOIN owner o ON o.id = fd.owner_id
         LEFT JOIN address_history ah
           ON ah.entity_type = 'finance'
          AND ah.entity_id = fd.id::text
          AND ah.is_current = 1
         LEFT JOIN addresses a ON ah.address_id = a.id
        WHERE uac.user_id = $1
          AND uac.is_active = 1
        ORDER BY uac.last_accessed_at DESC NULLS LAST, fd.finance_name ASC`,
      [user.id]
    );

    const activeMemberships = membershipsRes.rows.filter(
      (m) => Number(m.finance_is_active) === 1 && Number(m.owner_is_active) === 1
    );

    if (activeMemberships.length === 0) {
      const hasInactiveLicense = membershipsRes.rows.some(
        (m) => Number(m.finance_is_active) === 1 && Number(m.owner_is_active) !== 1
      );
      return res.status(403).json({
        success: false,
        message: hasInactiveLicense
          ? 'The License associated with your workspace is currently inactive.'
          : 'Your account does not have access to any active finance company.',
        error_code: hasInactiveLicense ? 'LICENSE_INACTIVE' : 'NO_ACTIVE_FINANCE_ACCESS',
      });
    }

    // Select the default finance company (most recently accessed whose login window is currently open)
    const eligibleCompany = activeMemberships.find((m) => {
      if (m.role === 'owner' || m.role === 'admin') return true;
      return isWithinLoginWindow(m.login_time_from, m.login_time_to);
    });

    if (!eligibleCompany) {
      const primary = activeMemberships[0];
      return res.status(403).json({
        success: false,
        message: `Login is currently unavailable. Your permitted login hours are ${formatLoginHour12h(primary.login_time_from)} – ${formatLoginHour12h(primary.login_time_to)}. Please try again during your authorized working hours.`,
        error_code: 'LOGIN_TIME_RESTRICTED',
        allowed_from: String(primary.login_time_from),
        allowed_to: String(primary.login_time_to),
      });
    }

    const selectedFinanceId = String(eligibleCompany.finance_id);
    const loadedFinance = await loadFinanceDetailsAndStatistics(selectedFinanceId);
    if (!loadedFinance) {
      return res.status(404).json({
        success: false,
        message: 'Selected finance company is unavailable',
        error_code: 'FINANCE_NOT_FOUND',
      });
    }

    const { financeRaw, financeData, statistics } = loadedFinance;

    const sessionResult = await evaluateLocationAndCreateAttendanceSession(req, user, financeRaw);
    if (!sessionResult.ok) {
      return res.status(sessionResult.status).json(sessionResult.body);
    }

    const { sessionId, source, flagged, deviceName, platform } = sessionResult;
    const allowedCompanies = activeMemberships.map((m) => String(m.finance_id));
    const companyRole = eligibleCompany.role;
    const pwdFp = computePasswordFingerprint(user.password);

    const accessToken = issueUserAccessToken({
      user,
      role: companyRole,
      allowedCompanies,
      currentFinanceId: selectedFinanceId,
      financeName: financeData.name,
      sessionId,
      anchorSessionId: sessionId,
      authMode: 'direct_user',
      pwdFp,
    });

    const { refreshToken } = issueUserRefreshToken({
      userId: user.id,
      anchorSessionId: sessionId,
      currentSessionId: sessionId,
      currentFinanceId: selectedFinanceId,
      pwdFp,
      deviceName,
      platform,
    });

    await db.query(
      'UPDATE user_allowed_companies SET last_accessed_at = NOW() WHERE user_id = $1 AND finance_id = $2',
      [user.id, selectedFinanceId]
    );

    const formattedFinances = await Promise.all(
      activeMemberships.map(async (m) => {
        const formatted = formatFinanceData({
          ...m,
          id: m.finance_id,
          name: m.finance_name,
        });
        const signedLogo = m.finance_photo ? await getSignedImageUrl(m.finance_photo) : null;
        return {
          id: m.finance_id,
          name: m.finance_name,
          finance_name: m.finance_name,
          owner_id: m.owner_id,
          owner_username: m.owner_username,
          user_role: m.role,
          login_time_from: m.login_time_from || null,
          login_time_to: m.login_time_to || null,
          last_accessed_at: m.last_accessed_at || null,
          phone: formatted.phone,
          email: formatted.email,
          address: formatted.address,
          city: m.city || '',
          district: m.district || '',
          state: m.state || '',
          pincode: m.pincode || '',
          since: m.since || null,
          finance_photo: signedLogo || m.finance_photo || null,
          logo_url: signedLogo,
          is_active: true,
        };
      })
    );

    return res.json({
      success: true,
      authMode: 'direct_user',
      sessionId,
      locationSource: source,
      flagged,
      user: {
        id: user.id,
        user_id: user.id,
        sessionId,
        email: user.email,
        username: user.username,
        phone_no: user.phone_no,
        role: companyRole,
        allowed_companies: allowedCompanies,
        current_finance_id: selectedFinanceId,
        login_time_from: eligibleCompany.login_time_from || null,
        login_time_to: eligibleCompany.login_time_to || null,
        last_accessed_at: new Date().toISOString(),
        created_at: user.created_at,
      },
      finance: {
        ...financeData,
        user_role: companyRole,
        login_time_from: eligibleCompany.login_time_from || null,
        login_time_to: eligibleCompany.login_time_to || null,
      },
      finances: formattedFinances,
      statistics,
      token: accessToken,
      refreshToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Direct user login error:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    });
  }
});

// ========== REFRESH PERSISTENT DIRECT-USER SESSION ==========
router.post('/refresh-session', async (req, res) => {
  try {
    const rawRefreshToken = req.body?.refreshToken;
    const result = await verifyAndRotateRefreshSession(db, rawRefreshToken, {
      ipAddress: getClientIp(req),
      ensureAttendanceSession: true,
    });

    if (!result.valid) {
      return res.status(result.status || 401).json({
        success: false,
        message: result.message,
        error_code: result.error_code,
        allowed_from: result.allowed_from,
        allowed_to: result.allowed_to,
      });
    }

    return res.json({
      success: true,
      authMode: 'direct_user',
      token: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
      renewed: result.attendanceRenewed,
      currentFinanceId: String(result.selectedMembership.finance_id),
      role: result.selectedMembership.role,
      allowedCompanies: result.allowedCompanies,
    });
  } catch (error) {
    console.error('Refresh session error:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Unable to refresh session',
      error_code: 'INTERNAL_ERROR',
    });
  }
});

// ========== USER LOGOUT ==========
router.post('/user-logout', logoutAuth, async (req, res) => {
  try {
    // Explicit token-type separation: an Owner/License token must NEVER be invalidated by User Logout
    if (req.owner && !req.user) {
      return res.json({ success: true, ignored: true });
    }

    const userId = req.user?.id;
    const sessionId = req.user?.sessionId || null;
    const anchorSessionId = req.user?.anchorSessionId || sessionId || null;
    const allowedReasons = ['manual', 'window_close', 'timeout'];
    const reason = allowedReasons.includes(req.body?.reason) ? req.body.reason : 'manual';

    if (userId && sessionId && /^[0-9a-fA-F-]{36}$/.test(String(sessionId))) {
      await db.query(
        `UPDATE agent_login_sessions
            SET logout_time = CURRENT_TIMESTAMP,
                duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::int),
                logout_reason = $2
          WHERE id = $1::uuid
            AND user_id = $3::uuid
            AND logout_time IS NULL`,
        [sessionId, reason, userId]
      );
    }

    // Only explicit manual logout revokes persistent Direct User refresh sessions;
    // window_close and timeout close the attendance shift while preserving Direct User persistence.
    if (userId && reason === 'manual') {
      revokeFamiliesInMemory({ anchorSessionId });
      await markSessionsRevokedInDb(db, {
        userId,
        sessionIds: [sessionId, anchorSessionId],
        reason: 'manual',
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to process logout' });
  }
});

// ========== SESSION HEARTBEAT & ATTENDANCE MANAGEMENT ==========
router.post('/session-heartbeat', authMiddleware, async (req, res) => {
  try {
    const decoded = req.authDecoded || {};
    const authMode = decoded.authMode === 'direct_user' ? 'direct_user' : 'license';
    const userId = req.user?.id;
    const sessionId = req.user?.sessionId || null;
    const anchorSessionId = req.user?.anchorSessionId || sessionId || null;
    const targetFinanceId =
      req.headers['finance-id'] ||
      req.headers['Finance-ID'] ||
      req.user?.current_finance_id ||
      null;

    // Validate live account, License, finance membership, password fingerprint, and revocation
    const validation = await validateUserPrincipal(db, decoded, {
      targetFinanceId: targetFinanceId ? String(targetFinanceId).trim() : null,
      requireFinanceContext: false,
      enforceLoginWindow: true,
      enforceOpenAttendanceInLicenseMode: authMode === 'license',
    });

    if (!validation.valid) {
      // Close any open attendance shift if authentication was revoked/invalidated
      if (userId && sessionId && /^[0-9a-fA-F-]{36}$/.test(String(sessionId))) {
        const closeReason =
          validation.error_code === 'PASSWORD_CHANGED'
            ? 'password_changed'
            : validation.error_code === 'SESSION_EXPIRED'
              ? 'timeout'
              : 'revoked';
        await db.query(
          `UPDATE agent_login_sessions
              SET logout_time = CURRENT_TIMESTAMP,
                  duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::int),
                  logout_reason = $2
            WHERE id = $1::uuid
              AND user_id = $3::uuid
              AND logout_time IS NULL`,
          [sessionId, closeReason, userId]
        );
      }

      if (validation.error_code === 'LOGIN_TIME_RESTRICTED') {
        return res.status(403).json({
          active: false,
          revoked: false,
          authMode,
          error_code: 'LOGIN_TIME_RESTRICTED',
          message: validation.message,
          allowed_from: validation.allowed_from,
          allowed_to: validation.allowed_to,
        });
      }

      // In License Mode, normal attendance timeout returns 200 { active: false } so client
      // clears only the ephemeral user session without treating it as a License error.
      if (authMode === 'license' && validation.error_code === 'SESSION_EXPIRED') {
        return res.json({
          active: false,
          revoked: false,
          authMode: 'license',
          error_code: 'SESSION_EXPIRED',
        });
      }

      return res.status(validation.status || 401).json({
        active: false,
        revoked: true,
        authMode,
        error_code: validation.error_code,
        message: validation.message,
      });
    }

    // Mode A: License Mode — ephemeral user session must have an open attendance record
    if (authMode === 'license') {
      if (!sessionId) {
        return res.json({ active: false, authMode: 'license' });
      }
      const r = await db.query(
        `UPDATE agent_login_sessions
            SET last_seen_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
            AND user_id = $2::uuid
            AND logout_time IS NULL`,
        [sessionId, userId]
      );
      return res.json({ active: r.rowCount > 0, authMode: 'license', sessionId });
    }

    // Mode B: Direct User Mode — keep attendance accurate without forcing credential re-entry
    if (sessionId && /^[0-9a-fA-F-]{36}$/.test(String(sessionId))) {
      const r = await db.query(
        `UPDATE agent_login_sessions
            SET last_seen_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid
            AND user_id = $2::uuid
            AND logout_time IS NULL`,
        [sessionId, userId]
      );
      if (r.rowCount > 0) {
        return res.json({
          active: true,
          renewed: false,
          authMode: 'direct_user',
          sessionId,
        });
      }
    }

    // Attendance session was closed (e.g., app restart or system sleep > 3 min),
    // while persistent authentication passed all security checks -> open a fresh attendance shift!
    const ip = getClientIp(req);
    const deviceName = String(req.headers['user-agent'] || 'Desktop App (Resumed)').slice(0, 150);
    const newSessionRes = await db.query(
      `INSERT INTO agent_login_sessions (
         user_id, device_name, platform, ip_address, location_source, flagged, last_seen_at
       ) VALUES ($1::uuid, $2, 'Web', $3, 'none', false, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, deviceName || null, ip || null]
    );
    const newSessionId = newSessionRes.rows[0].id;
    const effectiveAnchor = anchorSessionId || newSessionId;
    const membership = validation.selectedMembership;

    const renewedToken = issueUserAccessToken({
      user: validation.userRow,
      role: membership.role,
      allowedCompanies: validation.allowedCompanies,
      currentFinanceId: membership.finance_id,
      financeName: membership.finance_name,
      sessionId: newSessionId,
      anchorSessionId: effectiveAnchor,
      authMode: 'direct_user',
    });

    return res.json({
      active: true,
      renewed: true,
      authMode: 'direct_user',
      sessionId: newSessionId,
      token: renewedToken,
    });
  } catch (err) {
    console.error('Heartbeat error:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to process session heartbeat' });
  }
});

// ========== GET OWNER'S FINANCE COMPANIES ==========
router.get('/owner-finances', async (req, res) => {
  try {
    const ownerToken = req.headers['owner-authorization']?.replace(/^Bearer\s+/i, '').trim();

    if (!ownerToken) {
      return res.status(401).json({
        success: false,
        message: 'License authentication required',
        error_code: 'OWNER_TOKEN_REQUIRED',
      });
    }

    let ownerDecoded;
    try {
      ownerDecoded = jwt.verify(ownerToken, getJwtSecret());
    } catch (_err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid License token',
        error_code: 'INVALID_OWNER_TOKEN',
      });
    }

    const ownerValidation = await validateOwnerPrincipal(db, ownerDecoded);
    if (!ownerValidation.valid) {
      return res.status(ownerValidation.status || 401).json({
        success: false,
        message: ownerValidation.message,
        error_code: ownerValidation.error_code,
      });
    }

    const result = await db.query(
      `SELECT
         fd.id,
         fd.finance_name AS name,
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
       LEFT JOIN address_history ah
         ON ah.entity_type = 'finance'
        AND ah.entity_id = fd.id::text
        AND ah.is_current = 1
       LEFT JOIN addresses a ON ah.address_id = a.id
       WHERE fd.owner_id = $1 AND fd.is_active = 1
       ORDER BY fd.finance_name ASC`,
      [ownerValidation.owner.id]
    );

    const processedFinances = await Promise.all(
      result.rows.map(async (finance) => {
        const financeData = formatFinanceData(finance);
        const signedLogo = finance.finance_photo
          ? await getSignedImageUrl(finance.finance_photo)
          : null;
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
          finance_photo: signedLogo || finance.finance_photo,
          logo_url: signedLogo,
          is_active: finance.is_active,
          created_at: finance.created_at,
        };
      })
    );

    return res.json({
      success: true,
      finances: processedFinances,
      total: processedFinances.length,
    });
  } catch (error) {
    console.error('Error fetching owner finances:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// ========== REFRESH FINANCE DETAILS (Supports License Mode & Direct User Mode) ==========
router.get('/finance-details/:financeId', async (req, res) => {
  try {
    const financeId = String(req.params.financeId || '').trim();
    if (!financeId || !/^[0-9a-fA-F-]{36}$/.test(financeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid finance ID',
        error_code: 'INVALID_FINANCE_ID',
      });
    }

    const userToken = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() || '';
    const ownerToken = req.headers['owner-authorization']?.replace(/^Bearer\s+/i, '').trim() || '';

    if (!userToken && !ownerToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error_code: 'AUTH_REQUIRED',
      });
    }

    let authorized = false;
    let verifiedUserRole = null;

    // Path 1: Authenticated User (Direct User Mode or License Mode) — verify real DB membership
    if (userToken) {
      let decodedUser = null;
      try {
        decodedUser = jwt.verify(userToken, getJwtSecret());
      } catch (err) {
        if (!ownerToken) {
          const isExpired = err && err.name === 'TokenExpiredError';
          return res.status(401).json({
            success: false,
            message: isExpired ? 'Session token expired' : 'Invalid authentication token',
            error_code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          });
        }
      }

      if (decodedUser?.user?.id) {
        const userValidation = await validateUserPrincipal(db, decodedUser, {
          targetFinanceId: financeId,
          requireFinanceContext: true,
          enforceLoginWindow: false,
        });

        if (!userValidation.valid) {
          return res.status(userValidation.status || 403).json({
            success: false,
            message: userValidation.message,
            error_code: userValidation.error_code,
          });
        }

        authorized = true;
        verifiedUserRole = userValidation.selectedMembership.role;
      } else if (decodedUser?.owner?.id) {
        const ownerValidation = await validateOwnerPrincipal(db, decodedUser);
        if (!ownerValidation.valid) {
          return res.status(ownerValidation.status || 401).json({
            success: false,
            message: ownerValidation.message,
            error_code: ownerValidation.error_code,
          });
        }
        const ownCheck = await db.query(
          'SELECT id FROM finance_detail WHERE id = $1 AND owner_id = $2 AND is_active = 1 LIMIT 1',
          [financeId, ownerValidation.owner.id]
        );
        if (ownCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized for this finance company',
            error_code: 'FINANCE_ACCESS_DENIED',
          });
        }
        authorized = true;
        verifiedUserRole = 'owner';
      }
    }

    // Path 2: License/Owner header authentication
    if (!authorized && ownerToken) {
      let ownerDecoded;
      try {
        ownerDecoded = jwt.verify(ownerToken, getJwtSecret());
      } catch (_err) {
        return res.status(401).json({
          success: false,
          message: 'Invalid License token',
          error_code: 'INVALID_OWNER_TOKEN',
        });
      }

      const ownerValidation = await validateOwnerPrincipal(db, ownerDecoded);
      if (!ownerValidation.valid) {
        return res.status(ownerValidation.status || 401).json({
          success: false,
          message: ownerValidation.message,
          error_code: ownerValidation.error_code,
        });
      }

      const ownCheck = await db.query(
        'SELECT id FROM finance_detail WHERE id = $1 AND owner_id = $2 AND is_active = 1 LIMIT 1',
        [financeId, ownerValidation.owner.id]
      );

      if (ownCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Finance company not found',
          error_code: 'FINANCE_NOT_FOUND',
        });
      }

      authorized = true;
      verifiedUserRole = 'owner';
    }

    if (!authorized) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error_code: 'AUTH_REQUIRED',
      });
    }

    const loaded = await loadFinanceDetailsAndStatistics(financeId);
    if (!loaded) {
      return res.status(404).json({
        success: false,
        message: 'Finance company not found',
        error_code: 'FINANCE_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      finance: {
        ...loaded.financeData,
        ...(verifiedUserRole ? { user_role: verifiedUserRole } : {}),
      },
    });
  } catch (error) {
    console.error('Error fetching finance details:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
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
      const ownerAuth = await resolveOwnerFromRequest(req);
      if (!ownerAuth.isOwner || !ownerAuth.owner?.id) {
        return res.status(ownerAuth.status || 403).json({
          success: false,
          message: ownerAuth.error || 'Owner authentication required',
          error_code: ownerAuth.error_code || 'OWNER_AUTH_REQUIRED',
        });
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

      // Verify any assigned finance companies belong to the authenticated owner
      const companiesToVerify = Array.from(
        new Set(
          [
            ...(Array.isArray(user.allowed_companies) ? user.allowed_companies : []),
            ...(staff_details?.finance_id ? [staff_details.finance_id] : []),
          ]
            .filter(Boolean)
            .map(String)
        )
      );
      if (companiesToVerify.length > 0) {
        const ownershipRes = await db.query(
          'SELECT id, owner_id FROM finance_detail WHERE id = ANY($1::uuid[]) AND is_active = 1',
          [companiesToVerify]
        );
        const validOwnedIds = new Set(
          ownershipRes.rows
            .filter((r) => String(r.owner_id) === String(ownerAuth.owner.id))
            .map((r) => String(r.id))
        );
        for (const cid of companiesToVerify) {
          if (!validOwnedIds.has(cid)) {
            return res.status(403).json({
              success: false,
              message: `Finance company ${cid} does not belong to this owner`,
              error_code: 'FINANCE_OWNER_MISMATCH',
            });
          }
        }
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
      // Authenticate owner (supports both License Mode owner token and Direct User Mode owner-role user token)
      const ownerAuth = await resolveOwnerFromRequest(req);
      if (!ownerAuth.isOwner || !ownerAuth.owner?.id) {
        client.release();
        return res.status(ownerAuth.status || 403).json({
          success: false,
          message: ownerAuth.error || 'Owner authentication required',
          error_code: ownerAuth.error_code || 'OWNER_AUTH_REQUIRED',
        });
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

      const ownerId = String(ownerAuth.owner.id);

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
      if (ownerAuth.user?.id) {
        invitedByUserId = ownerAuth.user.id;
      } else {
        const ownerUserCheck = await client.query(
          `SELECT uac.user_id
             FROM user_allowed_companies uac
             INNER JOIN finance_detail fd ON fd.id = uac.finance_id
            WHERE fd.owner_id = $1 AND uac.role = 'owner' AND uac.is_active = 1
            LIMIT 1`,
          [ownerAuth.owner.id]
        );
        if (ownerUserCheck.rows.length > 0) {
          invitedByUserId = ownerUserCheck.rows[0].user_id;
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
                 photo = COALESCE($6, photo), joining_date = COALESCE($7, joining_date)
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
    const ownerAuth = await resolveOwnerFromRequest(req);
    if (!ownerAuth.isOwner || !ownerAuth.owner?.id) {
      return res.status(ownerAuth.status || 403).json({
        success: false,
        message: ownerAuth.error || 'Owner authentication required',
        error_code: ownerAuth.error_code || 'OWNER_AUTH_REQUIRED',
      });
    }

    const userId = req.params.id;

    // Verify target user belongs to at least one finance company under this owner
    const tenantCheck = await db.query(
      `SELECT 1
         FROM user_allowed_companies uac
         INNER JOIN finance_detail fd ON fd.id = uac.finance_id
        WHERE uac.user_id = $1::uuid
          AND fd.owner_id = $2::uuid
       UNION ALL
       SELECT 1
         FROM users_details ud
         INNER JOIN finance_detail fd ON fd.id = ud.finance_id
        WHERE (ud.user_id = $1::uuid OR ud.id = $1::uuid)
          AND fd.owner_id = $2::uuid
       LIMIT 1`,
      [userId, ownerAuth.owner.id]
    );

    if (tenantCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to deactivate this user',
        error_code: 'FORBIDDEN',
      });
    }

    // Deactivate user and revoke all active sessions / refresh tokens
    await db.query(
      'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid',
      [userId]
    );

    revokeFamiliesInMemory({ userId });
    await db.query(
      `UPDATE agent_login_sessions
          SET logout_time = COALESCE(logout_time, CURRENT_TIMESTAMP),
              duration_seconds = CASE
                WHEN logout_time IS NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))::int)
                ELSE duration_seconds
              END,
              logout_reason = 'revoked'
        WHERE user_id = $1::uuid
          AND (logout_time IS NULL OR logout_reason IS NULL OR logout_reason NOT IN ('manual', 'password_changed', 'revoked'))`,
      [userId]
    );

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
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
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== CHANGE PASSWORD ==========
router.post('/change-password', async (req, res, next) => {
  try {
    const result = await changePasswordForPrincipal(req);
    return res.json(result);
  } catch (error) {
    if (error && error.statusCode) {
      if (error.statusCode === 429 && error.retryAfterSeconds) {
        res.set('Retry-After', String(error.retryAfterSeconds));
      }
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        error_code: error.errorCode || 'CHANGE_PASSWORD_ERROR',
        retryAfterSeconds: error.retryAfterSeconds || undefined,
      });
    }
    console.error('Change password error:', error.message);
    return res.status(500).json({ success: false, error: 'Server error' });
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