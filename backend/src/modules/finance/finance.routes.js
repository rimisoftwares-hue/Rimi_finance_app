const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const Jimp = require('jimp');
const { db } = require('../../config/database.config');
const {
  ownerOnly,
  ownerCheckFinance,
  enhancedCheckFinance,
  resolveOwnerFromRequest,
} = require('../../middleware/auth.middleware');
const {
  issueUserAccessToken,
  validateOwnerPrincipal,
  validateUserPrincipal,
} = require('../auth/sessionSecurity.service');
const { ensureSystemGroups } = require('../accounting/ledgerGroup/group.service');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ─── AWS S3 Client Setup ──────────────────────────────────────────────────────
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
  region: process.env.BUCKET_REGION,
});

// ─── Multer In-Memory Storage for Company Logo Upload ─────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const validFieldNames = ['company_logo', 'finance_photo', 'logo'];
    if (validFieldNames.includes(file.fieldname) && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid field or format. Accepted image fields: ${validFieldNames.join(', ')}`));
    }
  },
});

// ─── S3 Helper: Structure file under dedicated 'finance' folder ──────────────
const uploadFinanceLogoToS3 = async (file) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const ext = path.extname(file.originalname) || '.png';
  const fileName = `logo-${timestamp}-${random}${ext}`;
  // Dedicated folder prefix: finance/
  const s3Key = `finance/${fileName}`;

  let uploadBuffer = file.buffer;
  let contentType = file.mimetype;

  // Optimize standard image formats (JPEG/PNG/BMP) using Jimp
  if (file.mimetype.startsWith('image/') && !file.mimetype.includes('svg')) {
    try {
      const image = await Jimp.read(file.buffer);
      if (image.bitmap.width > 1200) {
        image.resize(1200, Jimp.AUTO);
      }
      uploadBuffer = await image.quality(85).getBufferAsync(Jimp.MIME_PNG);
      contentType = 'image/png';
    } catch (jimpErr) {
      console.warn('Jimp logo processing skipped, using original buffer:', jimpErr.message);
      uploadBuffer = file.buffer;
    }
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: s3Key,
      Body: uploadBuffer,
      ContentType: contentType,
    })
  );

  const fileUrl = `https://${process.env.BUCKET_NAME}.s3.${process.env.BUCKET_REGION}.amazonaws.com/${s3Key}`;
  return {
    fileUrl,
    s3Key,
    fileName,
    contentType,
    fileSizeBytes: uploadBuffer.length,
  };
};

// ─── S3 Helper: Generate Presigned URL for Private S3 Images ─────────────────
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
    console.error('Error generating signed URL for finance image:', error);
    return imageUrl;
  }
};

// ─── Helper: Authenticate & Bind Owner Dynamically ─────────────────────────────
const resolveAuthenticatedOwner = async (req) => {
  const ownerAuth = await resolveOwnerFromRequest(req);
  if (!ownerAuth.isOwner || !ownerAuth.owner?.id) {
    return null;
  }
  return {
    id: ownerAuth.owner.id,
    username: ownerAuth.owner.username,
    callingUserId: ownerAuth.user?.id || null,
  };
};

// ─── Helper: Parse JSON or Array field safely ──────────────────────────────────
const parseArrayField = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(item => typeof item === 'string' && item.trim() !== '');
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.filter(item => typeof item === 'string' && item.trim() !== '');
  } catch (e) {
    // Treat as comma-separated or single string
    if (typeof val === 'string' && val.trim() !== '') {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
};

// ─── POST /create (and /) ─ Create New Finance Company ────────────────────────
const handleCreateFinance = async (req, res) => {
  try {
    const authenticatedOwner = await resolveAuthenticatedOwner(req);
    if (!authenticatedOwner) {
      return res.status(401).json({
        success: false,
        error: 'Owner authentication required to create a new finance company.',
      });
    }

    const {
      finance_name,
      phone_numbers,
      emails,
      since,
      // Address fields
      house_no,
      street,
      street_name,
      village,
      landmark,
      land_mark,
      address,
      city,
      district,
      state,
      pincode,
      location,
      // Bank details fields
      bank_name,
      branch,
      ifsc_code,
      account_name,
      account_number,
      upi_id,
    } = req.body;

    if (!finance_name || !finance_name.trim()) {
      return res.status(400).json({ success: false, error: 'Finance name is required' });
    }

    const parseCoord = (v, limit) => {
      if (v === undefined || v === null || String(v).trim() === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && Math.abs(n) <= limit ? Number(n.toFixed(7)) : NaN;
    };
    const latitude = parseCoord(req.body.latitude, 90);
    const longitude = parseCoord(req.body.longitude, 180);
    if (Number.isNaN(latitude) || Number.isNaN(longitude) || ((latitude === null) !== (longitude === null))) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude must both be valid numbers' });
    }

    const phoneNumbersArray = parseArrayField(phone_numbers);
    if (phoneNumbersArray.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one phone number is required' });
    }

    const emailsArray = parseArrayField(emails);

    // Check duplicate name under the same owner
    const { rows: existingFinance } = await db.query(
      'SELECT id FROM finance_detail WHERE finance_name = $1 AND owner_id = $2',
      [finance_name.trim(), authenticatedOwner.id]
    );

    if (existingFinance.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'A finance company with this name already exists under your account.',
      });
    }

    // Handle Company Logo upload to AWS S3 (prefix "finance/")
    let uploadedLogo = null;
    const logoFile = req.file || (req.files && (req.files.company_logo?.[0] || req.files.finance_photo?.[0] || req.files[0]));

    if (logoFile) {
      try {
        uploadedLogo = await uploadFinanceLogoToS3(logoFile);
      } catch (uploadErr) {
        console.error('S3 logo upload failed:', uploadErr);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload company logo to S3 storage',
          details: uploadErr.message,
        });
      }
    }

    // Parse structured date for `since`
    let formattedSinceDate = null;
    if (since && String(since).trim() !== '') {
      const trimmedSince = String(since).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedSince)) {
        formattedSinceDate = trimmedSince;
      } else if (/^\d{4}$/.test(trimmedSince)) {
        formattedSinceDate = `${trimmedSince}-01-01`;
      } else {
        const d = new Date(trimmedSince);
        if (!isNaN(d.getTime())) {
          formattedSinceDate = d.toISOString().split('T')[0];
        }
      }
    }

    // Begin PostgreSQL Database Transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert Address Record
      const effectiveLandmark = landmark || land_mark || '';
      let addressId = null;

      if (house_no || street || street_name || village || effectiveLandmark ||
        address || city || district || state || pincode || location || latitude !== null || longitude !== null) {
        const addressResult = await client.query(
          `INSERT INTO addresses (
             house_no, street, street_name, village, land_mark, address, city, district, state, pincode, location, latitude, longitude
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            house_no || '',
            street || '',
            street_name || '',
            village || '',
            effectiveLandmark,
            address || '',
            city || '',
            district || '',
            state || '',
            pincode || '',
            location || '',
            latitude,
            longitude,
          ]
        );
        addressId = addressResult.rows[0].id;
      }

      // 2. Insert Finance Detail Record
      const financePhotoUrl = uploadedLogo ? uploadedLogo.fileUrl : null;
      const financeResult = await client.query(
        `INSERT INTO finance_detail (
           owner_id, finance_name, phone_numbers, emails, is_active, since, address_id, finance_photo, office_lat, office_lng
         ) VALUES ($1, $2, $3::jsonb, $4::jsonb, 1, $5, $6, $7, $8, $9)
         RETURNING id, finance_name, owner_id, phone_numbers, emails, since, address_id, finance_photo, office_lat, office_lng, office_geofence_m, created_at`,
        [
          authenticatedOwner.id,
          finance_name.trim(),
          JSON.stringify(phoneNumbersArray),
          JSON.stringify(emailsArray),
          formattedSinceDate,
          addressId,
          financePhotoUrl,
          latitude,
          longitude,
        ]
      );
      const createdFinance = financeResult.rows[0];
      const financeId = createdFinance.id;

      // 3. Insert Address History
      if (addressId) {
        await client.query(
          `INSERT INTO address_history (entity_type, entity_id, address_id, is_current)
           VALUES ('finance', $1, $2, 1)`,
          [String(financeId), addressId]
        );
      }

      // 4. Insert Primary Bank Account if details provided
      let createdBankAccount = null;
      if (account_number && bank_name && ifsc_code) {
        const bankResult = await client.query(
          `INSERT INTO finance_bank_accounts (
             finance_id, bank_name, branch, ifsc_code, account_name, account_number, upi_id, is_primary, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
           RETURNING id, bank_name, branch, ifsc_code, account_name, account_number, upi_id, is_primary`,
          [
            financeId,
            bank_name.trim(),
            branch ? branch.trim() : null,
            ifsc_code.trim().toUpperCase(),
            (account_name && account_name.trim()) || finance_name.trim(),
            account_number.trim(),
            upi_id ? upi_id.trim() : null,
          ]
        );
        createdBankAccount = bankResult.rows[0];
      }

      // 5. Insert Branding Asset (finance_branding_assets) if logo uploaded
      let brandingAsset = null;
      if (uploadedLogo) {
        const brandingResult = await client.query(
          `INSERT INTO finance_branding_assets (
             finance_id, asset_type, file_path, file_name, mime_type, file_size_bytes, display_name, is_active
           ) VALUES ($1, 'web_logo', $2, $3, $4, $5, 'Primary Web Logo', true)
           RETURNING id, asset_type, file_path`,
          [
            financeId,
            uploadedLogo.fileUrl,
            uploadedLogo.fileName,
            uploadedLogo.contentType,
            uploadedLogo.fileSizeBytes,
          ]
        );
        brandingAsset = brandingResult.rows[0];
      }

      // 6. Grant existing owner-role users under this License access to the new company
      const { rows: ownerRoleUsers } = await client.query(
        `SELECT DISTINCT uac.user_id AS id
           FROM user_allowed_companies uac
           INNER JOIN finance_detail fd ON fd.id = uac.finance_id
           INNER JOIN users u ON u.id = uac.user_id
          WHERE fd.owner_id = $1::uuid
            AND uac.role = 'owner'
            AND uac.is_active = 1
            AND u.is_active = 1`,
        [authenticatedOwner.id]
      );
      const ownerUserIdsToLink = new Set(ownerRoleUsers.map((u) => String(u.id)));
      if (authenticatedOwner.callingUserId) {
        ownerUserIdsToLink.add(String(authenticatedOwner.callingUserId));
      }
      for (const uid of ownerUserIdsToLink) {
        await client.query(
          `INSERT INTO user_allowed_companies (user_id, finance_id, role, is_active)
           VALUES ($1::uuid, $2::uuid, 'owner', 1)
           ON CONFLICT (user_id, finance_id) DO UPDATE SET role = 'owner', is_active = 1`,
          [uid, financeId]
        );
      }

      // 7. Audit log in recent_activity
      await client.query(
        `INSERT INTO recent_activity (finance_id, type, reference_id, description, created_by, created_at)
         VALUES ($1, 'finance_created', $2, $3, $4, CURRENT_TIMESTAMP)`,
        [
          financeId,
          String(financeId),
          `Finance company "${finance_name}" created`,
          authenticatedOwner.username || 'Owner',
        ]
      );

      // 8. Ensure Tally Prime Chart of Accounts system groups exist for this new company
      await ensureSystemGroups(financeId, client);

      await client.query('COMMIT');
      client.release();

      const signedFinancePhoto = await getSignedImageUrl(financePhotoUrl);
      return res.status(201).json({
        success: true,
        message: 'Finance company created successfully',
        finance: {
          ...createdFinance,
          finance_photo: signedFinancePhoto,
          logo_url: signedFinancePhoto,
          bank_account: createdBankAccount,
          branding_asset: brandingAsset,
          owner_name: authenticatedOwner.username,
        },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }
  } catch (err) {
    console.error('Error creating finance company:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to create finance company',
      details: err.message,
    });
  }
};

router.post('/create', ownerOnly, upload.single('company_logo'), handleCreateFinance);
router.post('/', ownerOnly, upload.single('company_logo'), handleCreateFinance);

// ─── Helper: Login Time Window Check ──────────────────────────────────────────
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
    return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
  } else {
    return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
  }
};

// ─── Helper: Resolve Authenticated User or Owner Identity ─────────────────────
const resolveAuthenticatedIdentity = async (req) => {
  // 1. Prioritize standard Authorization header (active User session in both Direct User & License modes)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        const isExpired = err && err.name === 'TokenExpiredError';
        return {
          error: isExpired ? 'Token expired' : 'Invalid authentication token',
          error_code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          status: 401,
        };
      }

      if (decoded?.tokenType === 'user_refresh') {
        return {
          error: 'Refresh token cannot be used as an access token',
          error_code: 'INVALID_TOKEN_TYPE',
          status: 401,
        };
      }

      // User token (`users` principal, including owner-role users)
      if (decoded?.user?.id) {
        const check = await validateUserPrincipal(db, decoded, {
          requireFinanceContext: false,
          enforceLoginWindow: false,
        });
        if (!check.valid) {
          return {
            error: check.message,
            error_code: check.error_code,
            status: check.status || 401,
          };
        }

        return {
          isOwner: false,
          authMode: check.authMode,
          pwdFp: decoded.pwdFp || null,
          sessionId: decoded.user.sessionId || null,
          anchorSessionId: decoded.user.anchorSessionId || decoded.user.sessionId || null,
          user: {
            id: check.userRow.id,
            username: check.userRow.username,
            email: check.userRow.email,
            phone_no: check.userRow.phone_no,
            password: check.userRow.password,
            role: check.selectedMembership?.role || decoded.user.role || 'agent',
          },
          currentFinanceId: decoded.user.current_finance_id || req.headers['finance-id'] || null,
        };
      }

      // Owner token passed in Authorization header (e.g. pre-user-login License screen)
      if (decoded?.owner?.id) {
        const check = await validateOwnerPrincipal(db, decoded);
        if (!check.valid) {
          return {
            error: check.message,
            error_code: check.error_code,
            status: check.status || 401,
          };
        }
        return {
          isOwner: true,
          authMode: 'license',
          owner: check.owner,
          user: { id: check.owner.id, username: check.owner.username, role: 'owner' },
          currentFinanceId: req.headers['finance-id'] || null,
        };
      }
    }
  }

  // 2. Fallback: Owner-Authorization header (when no active User Authorization header exists)
  const ownerHeader = req.headers['owner-authorization'] || req.headers['Owner-Authorization'];
  if (ownerHeader) {
    const ownerToken = ownerHeader.replace(/^Bearer\s+/i, '').trim();
    if (ownerToken) {
      let decoded;
      try {
        decoded = jwt.verify(ownerToken, JWT_SECRET);
      } catch (err) {
        const isExpired = err && err.name === 'TokenExpiredError';
        return {
          error: isExpired ? 'License token expired' : 'Invalid License token',
          error_code: 'INVALID_OWNER_TOKEN',
          status: 401,
        };
      }

      const check = await validateOwnerPrincipal(db, decoded);
      if (!check.valid) {
        return {
          error: check.message,
          error_code: check.error_code,
          status: check.status || 401,
        };
      }

      return {
        isOwner: true,
        authMode: 'license',
        owner: check.owner,
        user: { id: check.owner.id, username: check.owner.username, role: 'owner' },
        currentFinanceId: req.headers['finance-id'] || null,
      };
    }
  }

  return {
    error: 'Authentication token missing',
    error_code: 'NO_TOKEN',
    status: 401,
  };
};

// ─── GET /allowed-finances ─ List All Authorized Finances for Current Identity ─
router.get('/allowed-finances', async (req, res) => {
  try {
    const identity = await resolveAuthenticatedIdentity(req);
    if (identity.error) {
      return res.status(identity.status || 401).json({
        success: false,
        error: identity.error,
        ...(identity.error_code ? { error_code: identity.error_code } : {}),
      });
    }

    let rows = [];

    if (identity.isOwner) {
      // Owner has access to all active finances created by / assigned to them
      const result = await db.query(`
        SELECT 
          fd.id, 
          fd.finance_name AS name, 
          fd.owner_id, 
          fd.phone_numbers,
          fd.emails,
          fd.since,
          fd.finance_photo,
          fd.office_lat,
          fd.office_lng,
          fd.office_geofence_m,
          fd.is_active,
          'owner' AS user_role,
          NULL AS login_time_from,
          NULL AS login_time_to,
          NULL AS last_accessed_at,
          fba.file_path AS logo_url,
          a.city,
          a.district,
          a.state
        FROM finance_detail fd
        LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
          AND ah.entity_id = fd.id::varchar 
          AND ah.is_current = 1
        LEFT JOIN addresses a ON ah.address_id = a.id
        LEFT JOIN finance_branding_assets fba ON fba.finance_id = fd.id 
          AND fba.asset_type = 'web_logo' 
          AND fba.is_active = true
        WHERE fd.owner_id = $1 AND fd.is_active = 1
        ORDER BY fd.finance_name ASC
      `, [identity.owner.id]);
      rows = result.rows;
    } else {
      // Regular user: strictly query user_allowed_companies junction table
      const result = await db.query(`
        SELECT 
          fd.id, 
          fd.finance_name AS name, 
          fd.owner_id, 
          fd.phone_numbers,
          fd.emails,
          fd.since,
          fd.finance_photo,
          fd.office_lat,
          fd.office_lng,
          fd.office_geofence_m,
          fd.is_active,
          uac.role AS user_role,
          uac.login_time_from,
          uac.login_time_to,
          uac.last_accessed_at,
          fba.file_path AS logo_url,
          a.city,
          a.district,
          a.state
        FROM user_allowed_companies uac
        JOIN finance_detail fd ON fd.id = uac.finance_id
        JOIN owner o ON o.id = fd.owner_id
        LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
          AND ah.entity_id = fd.id::varchar 
          AND ah.is_current = 1
        LEFT JOIN addresses a ON ah.address_id = a.id
        LEFT JOIN finance_branding_assets fba ON fba.finance_id = fd.id 
          AND fba.asset_type = 'web_logo' 
          AND fba.is_active = true
        WHERE uac.user_id = $1 AND uac.is_active = 1 AND fd.is_active = 1 AND o.is_active = 1
        ORDER BY fd.finance_name ASC
      `, [identity.user.id]);
      rows = result.rows;
    }

    // Batch lookup of active print_logo and web_logo branding assets across all returned finances
    const financeIds = rows.map(r => r.id).filter(Boolean);
    const brandingMap = new Map();
    if (financeIds.length > 0) {
      const { rows: assetRows } = await db.query(
        `SELECT finance_id, asset_type, file_path
         FROM finance_branding_assets
         WHERE finance_id = ANY($1::uuid[])
           AND asset_type IN ('print_logo', 'web_logo')
           AND is_active = true
         ORDER BY created_at DESC`,
        [financeIds]
      );
      for (const a of assetRows) {
        const fid = String(a.finance_id);
        if (!brandingMap.has(fid)) brandingMap.set(fid, {});
        const bucket = brandingMap.get(fid);
        if (!bucket[a.asset_type]) {
          bucket[a.asset_type] = a.file_path;
        }
      }
    }

    const processedFinances = await Promise.all(
      rows.map(async (f) => {
        const assets = brandingMap.get(String(f.id)) || {};
        const logoUrl = f.logo_url || assets.web_logo || f.finance_photo || null;
        const signedLogo = logoUrl ? await getSignedImageUrl(logoUrl) : null;
        const rawPrintLogo = assets.print_logo || assets.web_logo || f.logo_url || f.finance_photo || null;
        const signedPrintLogo = rawPrintLogo
          ? (rawPrintLogo === logoUrl ? signedLogo : await getSignedImageUrl(rawPrintLogo))
          : null;
        return {
          id: String(f.id),
          name: f.name,
          owner_id: f.owner_id,
          phone_numbers: parseArrayField(f.phone_numbers),
          emails: parseArrayField(f.emails),
          since: f.since,
          finance_photo: signedLogo || f.finance_photo,
          logo_url: signedLogo || f.logo_url,
          print_logo_url: signedPrintLogo,
          user_role: f.user_role || 'agent',
          login_time_from: f.login_time_from || null,
          login_time_to: f.login_time_to || null,
          last_accessed_at: f.last_accessed_at || null,
          city: f.city || '',
          district: f.district || '',
          state: f.state || '',
          office_lat: f.office_lat !== null && f.office_lat !== undefined ? Number(f.office_lat) : null,
          office_lng: f.office_lng !== null && f.office_lng !== undefined ? Number(f.office_lng) : null,
          office_geofence_m: f.office_geofence_m !== null && f.office_geofence_m !== undefined ? Number(f.office_geofence_m) : 200,
          is_active: f.is_active === 1 || f.is_active === true,
        };
      })
    );

    const currentActiveId = identity.currentFinanceId || (processedFinances.length > 0 ? processedFinances[0].id : null);

    return res.json({
      success: true,
      finances: processedFinances,
      current_finance_id: currentActiveId ? String(currentActiveId) : null,
      total: processedFinances.length,
    });
  } catch (error) {
    console.error('Error fetching allowed finances:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve allowed finances',
      details: error.message,
    });
  }
});

// ─── POST /switch ─ Atomically Switch Active Finance Context ──────────────────
router.post('/switch', async (req, res) => {
  try {
    const targetFinanceId = String(req.body.financeId || '').trim();
    if (!targetFinanceId || targetFinanceId === 'undefined' || targetFinanceId === 'null') {
      return res.status(400).json({
        success: false,
        error: 'Valid financeId is required in request body',
      });
    }

    const identity = await resolveAuthenticatedIdentity(req);
    if (identity.error) {
      return res.status(identity.status || 401).json({
        success: false,
        error: identity.error,
        ...(identity.error_code ? { error_code: identity.error_code } : {}),
      });
    }

    // 1. Fetch Target Finance Company Details (including Owner License status)
    const { rows: financeRows } = await db.query(`
      SELECT 
        fd.id, fd.finance_name, fd.owner_id, fd.phone_numbers, fd.emails,
        fd.since, fd.established_date, fd.finance_photo, fd.is_active,
        o.username AS owner_username, o.is_active AS owner_is_active,
        a.house_no, a.street, a.street_name, a.village, a.land_mark,
        a.address, a.city, a.district, a.state, a.pincode, a.location,
        fd.created_at, fd.updated_at
      FROM finance_detail fd
      INNER JOIN owner o ON o.id = fd.owner_id
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id::varchar 
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.id = $1 AND fd.is_active = 1
    `, [targetFinanceId]);

    if (financeRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target finance company not found or is currently inactive',
        error_code: 'FINANCE_NOT_FOUND',
      });
    }

    const targetFinance = financeRows[0];
    if (Number(targetFinance.owner_is_active) !== 1) {
      return res.status(401).json({
        success: false,
        error: 'The associated License is inactive',
        error_code: 'LICENSE_INACTIVE',
      });
    }
    let companyRole = 'agent';
    let targetLoginFrom = null;
    let targetLoginTo = null;

    // 2. Security & Access Verification
    if (identity.isOwner) {
      if (String(targetFinance.owner_id) !== String(identity.owner.id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You do not own this finance company',
          error_code: 'FINANCE_OWNER_MISMATCH',
        });
      }
      companyRole = 'owner';
    } else {
      // Regular user: Must have an active record in user_allowed_companies
      const { rows: uacRows } = await db.query(`
        SELECT id, role, login_time_from, login_time_to, is_active
        FROM user_allowed_companies
        WHERE user_id = $1 AND finance_id = $2 AND is_active = 1
        LIMIT 1
      `, [identity.user.id, targetFinanceId]);

      if (uacRows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: User is not authorized for this finance company',
          error_code: 'FINANCE_ACCESS_DENIED',
        });
      }

      const membership = uacRows[0];
      companyRole = membership.role || 'agent';
      targetLoginFrom = membership.login_time_from;
      targetLoginTo = membership.login_time_to;

      // 3. Login Time Restrictions (for non-owner/admin roles)
      const isOwnerOrAdmin = companyRole === 'owner' || companyRole === 'admin';
      if (!isOwnerOrAdmin && targetLoginFrom && targetLoginTo) {
        if (!isWithinLoginWindow(targetLoginFrom, targetLoginTo)) {
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
            error: `Login is restricted. Permitted hours for this company are ${formatTime(targetLoginFrom)} – ${formatTime(targetLoginTo)}.`,
            error_code: 'LOGIN_TIME_RESTRICTED',
            allowed_from: String(targetLoginFrom),
            allowed_to: String(targetLoginTo),
          });
        }
      }

      // 4. Update last_accessed_at in user_allowed_companies
      await db.query(
        'UPDATE user_allowed_companies SET last_accessed_at = NOW() WHERE user_id = $1 AND finance_id = $2',
        [identity.user.id, targetFinanceId]
      );
    }

    // 5. Fetch branding logos (print_logo and web_logo)
    const { rows: brandingRows } = await db.query(`
      SELECT asset_type, file_path FROM finance_branding_assets 
      WHERE finance_id = $1 AND asset_type IN ('print_logo', 'web_logo') AND is_active = true 
      ORDER BY created_at DESC
    `, [targetFinanceId]);

    const webLogoRow = brandingRows.find(r => r.asset_type === 'web_logo');
    const printLogoRow = brandingRows.find(r => r.asset_type === 'print_logo');
    const rawLogo = webLogoRow ? webLogoRow.file_path : targetFinance.finance_photo;
    const signedLogo = rawLogo ? await getSignedImageUrl(rawLogo) : null;
    const rawPrintLogo = printLogoRow?.file_path || webLogoRow?.file_path || targetFinance.finance_photo || null;
    const signedPrintLogo = rawPrintLogo
      ? (rawPrintLogo === rawLogo ? signedLogo : await getSignedImageUrl(rawPrintLogo))
      : null;

    // 6. Gather all allowed companies for JWT payload
    let allowedCompanies = [targetFinanceId];
    if (!identity.isOwner && identity.user?.id) {
      const { rows: allUac } = await db.query(
        `SELECT uac.finance_id
           FROM user_allowed_companies uac
           INNER JOIN finance_detail fd ON fd.id = uac.finance_id
           INNER JOIN owner o ON o.id = fd.owner_id
          WHERE uac.user_id = $1 AND uac.is_active = 1 AND fd.is_active = 1 AND o.is_active = 1`,
        [identity.user.id]
      );
      allowedCompanies = allUac.map(r => String(r.finance_id));
    } else if (identity.isOwner && identity.owner?.id) {
      const { rows: allOwnerFin } = await db.query(
        'SELECT id FROM finance_detail WHERE owner_id = $1 AND is_active = 1',
        [identity.owner.id]
      );
      allowedCompanies = allOwnerFin.map(r => String(r.id));
    }

    // 7. Issue refreshed JWT token preserving authMode, sessionId, anchorSessionId, and pwdFp
    let updatedToken;
    if (!identity.isOwner) {
      updatedToken = issueUserAccessToken({
        user: identity.user,
        role: companyRole,
        allowedCompanies,
        currentFinanceId: targetFinanceId,
        financeName: targetFinance.finance_name,
        sessionId: identity.sessionId || null,
        anchorSessionId: identity.anchorSessionId || identity.sessionId || null,
        authMode: identity.authMode || 'license',
        pwdFp: identity.pwdFp || null,
      });
    } else {
      const tokenPayload = {
        tokenType: 'owner_license',
        authMode: 'license',
        owner: {
          id: identity.owner.id,
          username: identity.owner.username,
        },
        user: {
          id: identity.user.id,
          username: identity.user.username,
          role: companyRole,
          allowed_companies: allowedCompanies,
          current_finance_id: targetFinanceId,
          finance_name: targetFinance.finance_name,
        },
      };
      updatedToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
    }

    // Format address
    const addressParts = [];
    if (targetFinance.house_no || targetFinance.street) {
      addressParts.push([targetFinance.house_no, targetFinance.street].filter(Boolean).join(' '));
    }
    if (targetFinance.street_name) addressParts.push(targetFinance.street_name);
    if (targetFinance.village) addressParts.push(targetFinance.village);
    if (targetFinance.land_mark) addressParts.push(targetFinance.land_mark);
    if (targetFinance.address) addressParts.push(targetFinance.address);
    if (targetFinance.city || targetFinance.district || targetFinance.state || targetFinance.pincode) {
      const loc = [targetFinance.city, targetFinance.district, targetFinance.state, targetFinance.pincode].filter(Boolean).join(', ');
      if (loc) addressParts.push(loc);
    }
    const fullAddress = addressParts.join(', ');

    return res.json({
      success: true,
      message: `Switched to ${targetFinance.finance_name}`,
      token: updatedToken,
      current_finance_id: targetFinanceId,
      finance: {
        id: String(targetFinance.id),
        name: targetFinance.finance_name,
        finance_name: targetFinance.finance_name,
        owner_id: targetFinance.owner_id,
        owner_username: targetFinance.owner_username || undefined,
        phone_numbers: parseArrayField(targetFinance.phone_numbers),
        emails: parseArrayField(targetFinance.emails),
        phone: parseArrayField(targetFinance.phone_numbers)[0] || '',
        email: parseArrayField(targetFinance.emails)[0] || '',
        since: targetFinance.since,
        finance_photo: signedLogo || targetFinance.finance_photo,
        logo_url: signedLogo || rawLogo,
        print_logo_url: signedPrintLogo,
        address: fullAddress,
        house_no: targetFinance.house_no,
        street: targetFinance.street,
        street_name: targetFinance.street_name,
        village: targetFinance.village,
        land_mark: targetFinance.land_mark,
        city: targetFinance.city,
        district: targetFinance.district,
        state: targetFinance.state,
        pincode: targetFinance.pincode,
        location: targetFinance.location,
        is_active: targetFinance.is_active === 1 || targetFinance.is_active === true,
        role: companyRole,
      },
      user: {
        id: identity.user.id,
        username: identity.user.username,
        role: companyRole,
        current_finance_id: targetFinanceId,
        allowed_companies: allowedCompanies,
        login_time_from: targetLoginFrom,
        login_time_to: targetLoginTo,
      }
    });
  } catch (error) {
    console.error('Error switching finance company:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error switching finance company',
      details: error.message,
    });
  }
});

// ─── GET /default-address ─ Fetch Default City/District for Active Finance ───
router.get('/default-address', enhancedCheckFinance, async (req, res) => {
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
        source: 'finance_detail',
      });
    }

    return res.json({
      success: true,
      defaultAddress: {
        city: results[0].city || '',
        district: results[0].district || '',
        state: results[0].state || '',
      },
      source: 'finance_detail',
    });
  } catch (err) {
    console.error('Error fetching default address:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch default address' });
  }
});

// ─── GET /:id/address ─ Fetch Specific Finance Address ────────────────────────
router.get('/:id/address', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.params.id;
    const { rows: address } = await db.query(`
      SELECT 
        a.house_no, a.street, a.street_name, a.village, a.land_mark,
        a.address, a.city, a.district, a.state, a.pincode, a.location
      FROM address_history ah
      JOIN addresses a ON ah.address_id = a.id
      WHERE ah.entity_type = 'finance' 
        AND ah.entity_id = $1 
        AND ah.is_current = 1
      LIMIT 1
    `, [String(financeId)]);

    if (address.length === 0) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    return res.json({ success: true, address: address[0] });
  } catch (err) {
    console.error('Error fetching finance address:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch address' });
  }
});

// ─── GET /profile ─ Active Finance Profile with Complete KPIs & Trends ──────────
router.get('/profile', ownerCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const { rows: financeDetails } = await db.query(`
      SELECT 
        fd.id, fd.finance_name, fd.owner_id, fd.phone_numbers, fd.emails,
        fd.since, fd.established_date, fd.finance_photo, fd.is_active,
        fd.office_lat, fd.office_lng, fd.office_geofence_m,
        o.username AS owner_name,
        a.house_no, a.street, a.street_name, a.village, a.land_mark,
        a.address, a.city, a.district, a.state, a.pincode, a.location,
        a.latitude, a.longitude,
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

    // Bank accounts for this finance
    const { rows: banks } = await db.query(`
      SELECT id, bank_name, branch, ifsc_code, account_name, account_number, upi_id, is_primary, is_active, created_at, updated_at
      FROM finance_bank_accounts
      WHERE finance_id = $1
      ORDER BY is_primary DESC, created_at ASC
    `, [financeId]);

    // Active branding assets
    const { rows: brandingAssets } = await db.query(`
      SELECT id, asset_type, file_path, file_name, mime_type, display_name, is_active
      FROM finance_branding_assets
      WHERE finance_id = $1 AND is_active = true
    `, [financeId]);

    const webLogoAsset = brandingAssets.find(a => a.asset_type === 'web_logo');
    const printLogoAsset = brandingAssets.find(a => a.asset_type === 'print_logo');

    // Real-time KPI summaries
    const [
      custRes,
      loansRes,
      closedLoansRes,
      collRes,
      dueRes,
      staffRes,
      agentRes,
      godownRes,
      vehicleRes,
      totalUsersRes
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) as count FROM customers WHERE finance_id = $1`, [financeId]),
      db.query(`SELECT COUNT(*) as count FROM loans WHERE finance_id = $1`, [financeId]),
      db.query(`SELECT COUNT(*) as count FROM customers WHERE finance_id = $1 AND loan_status = 'close'`, [financeId]),
      db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE finance_id = $1 AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)`, [financeId]),
      db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE finance_id = $1 AND status = 'pending'`, [financeId]),
      db.query(`SELECT COUNT(DISTINCT u.id) as count FROM users u JOIN user_allowed_companies uac ON u.id = uac.user_id WHERE uac.finance_id = $1 AND uac.role IN ('staff', 'admin') AND u.is_active = 1`, [financeId]),
      db.query(`SELECT COUNT(DISTINCT u.id) as count FROM users u JOIN user_allowed_companies uac ON u.id = uac.user_id WHERE uac.finance_id = $1 AND uac.role = 'agent' AND u.is_active = 1`, [financeId]),
      db.query(`SELECT COUNT(*) as count FROM godowns WHERE finance_id = $1`, [financeId]),
      db.query(`SELECT COUNT(*) as count FROM vehicle_detail WHERE finance_id = $1`, [financeId]),
      db.query(`SELECT COUNT(DISTINCT u.id) as count FROM users u JOIN user_allowed_companies uac ON u.id = uac.user_id WHERE uac.finance_id = $1 AND u.is_active = 1`, [financeId])
    ]);

    // Past 6 Months Customer Growth Trend
    const growthRes = await db.query(`
      SELECT 
        TO_CHAR(d, 'Mon') AS month,
        (
          SELECT COUNT(*) 
          FROM customers 
          WHERE finance_id = $1 
            AND created_at <= (d + INTERVAL '1 month - 1 day')
        )::int AS customers
      FROM GENERATE_SERIES(
        DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months'),
        DATE_TRUNC('month', CURRENT_DATE),
        '1 month'::interval
      ) d
      ORDER BY d ASC
    `, [financeId]);

    // Past 6 Months Collection Trend (in ₹ Lakhs)
    const collTrendRes = await db.query(`
      SELECT 
        TO_CHAR(d, 'Mon') AS month,
        ROUND(COALESCE(
          (
            SELECT SUM(amount) / 100000.0 
            FROM payments 
            WHERE finance_id = $1 
              AND DATE_TRUNC('month', payment_date) = d
          ), 0
        )::numeric, 2)::float AS amount
      FROM GENERATE_SERIES(
        DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months'),
        DATE_TRUNC('month', CURRENT_DATE),
        '1 month'::interval
      ) d
      ORDER BY d ASC
    `, [financeId]);

    const phoneNumbers = Array.isArray(finance.phone_numbers)
      ? finance.phone_numbers
      : (typeof finance.phone_numbers === 'string' ? JSON.parse(finance.phone_numbers || '[]') : []);

    const emails = Array.isArray(finance.emails)
      ? finance.emails
      : (typeof finance.emails === 'string' ? JSON.parse(finance.emails || '[]') : []);

    const rawLogoUrl = webLogoAsset?.file_path || finance.finance_photo || null;
    const rawPrintLogoUrl = printLogoAsset?.file_path || null;
    const rawFinancePhoto = finance.finance_photo || rawLogoUrl;

    const [signedLogoUrl, signedPrintLogoUrl, signedFinancePhoto, processedBrandingAssets] = await Promise.all([
      getSignedImageUrl(rawLogoUrl),
      getSignedImageUrl(rawPrintLogoUrl),
      getSignedImageUrl(rawFinancePhoto),
      Promise.all((brandingAssets || []).map(async (asset) => ({
        ...asset,
        file_path: await getSignedImageUrl(asset.file_path),
        signed_url: await getSignedImageUrl(asset.file_path),
        original_url: asset.file_path,
      }))),
    ]);

    return res.json({
      success: true,
      finance: {
        ...finance,
        phone_numbers: phoneNumbers,
        emails: emails,
        finance_photo: signedFinancePhoto,
        logo_url: signedLogoUrl,
        print_logo_url: signedPrintLogoUrl,
        banks,
        branding_assets: processedBrandingAssets,
        kpis: {
          total_customers: parseInt(custRes.rows[0]?.count || 0, 10),
          active_loans: parseInt(loansRes.rows[0]?.count || 0, 10),
          closed_loans: parseInt(closedLoansRes.rows[0]?.count || 0, 10),
          monthly_collection: parseFloat(collRes.rows[0]?.total || 0),
          total_due: parseFloat(dueRes.rows[0]?.total || 0),
          total_staff: parseInt(staffRes.rows[0]?.count || 0, 10),
          total_agents: parseInt(agentRes.rows[0]?.count || 0, 10),
          godowns_count: parseInt(godownRes.rows[0]?.count || 0, 10),
          vehicles_financed: parseInt(vehicleRes.rows[0]?.count || 0, 10),
          total_users: parseInt(totalUsersRes.rows[0]?.count || 0, 10),
        },
        customer_growth: growthRes.rows,
        collection_trend: collTrendRes.rows,
      },
    });
  } catch (err) {
    console.error('Error fetching finance profile:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch finance profile', details: err.message });
  }
});

// ─── PUT /profile ─ Update Active Finance Profile (Owner Only) ──────────────────
router.put('/profile', ownerCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const {
      finance_name,
      phone_numbers,
      phone_number,
      emails,
      since,
      is_active,
      house_no,
      street,
      street_name,
      village,
      landmark,
      land_mark,
      address,
      city,
      district,
      state,
      pincode,
      location,
    } = req.body;

    const updates = [];
    const values = [];
    let pIdx = 1;

    if (finance_name && finance_name.trim()) {
      updates.push(`finance_name = $${pIdx++}`);
      values.push(finance_name.trim());
    }

    if (phone_numbers !== undefined) {
      const arr = parseArrayField(phone_numbers);
      updates.push(`phone_numbers = $${pIdx++}::jsonb`);
      values.push(JSON.stringify(arr));
    } else if (phone_number) {
      updates.push(`phone_numbers = $${pIdx++}::jsonb`);
      values.push(JSON.stringify([phone_number]));
    }

    if (emails !== undefined) {
      const arr = parseArrayField(emails);
      updates.push(`emails = $${pIdx++}::jsonb`);
      values.push(JSON.stringify(arr));
    }

    if (since !== undefined) {
      updates.push(`since = $${pIdx++}`);
      values.push(since);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${pIdx++}`);
      values.push(is_active ? 1 : 0);
    }

    if (req.body.office_lat !== undefined) {
      updates.push(`office_lat = $${pIdx++}`);
      values.push(req.body.office_lat === null || req.body.office_lat === '' ? null : Number(req.body.office_lat));
    }

    if (req.body.office_lng !== undefined) {
      updates.push(`office_lng = $${pIdx++}`);
      values.push(req.body.office_lng === null || req.body.office_lng === '' ? null : Number(req.body.office_lng));
    }

    if (req.body.office_geofence_m !== undefined) {
      updates.push(`office_geofence_m = $${pIdx++}`);
      values.push(req.body.office_geofence_m === null || req.body.office_geofence_m === '' ? 200 : parseInt(req.body.office_geofence_m, 10));
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(financeId);
      await db.query(
        `UPDATE finance_detail SET ${updates.join(', ')} WHERE id = $${pIdx}`,
        values
      );
    }

    // Address updates
    const effectiveLandmark = landmark !== undefined ? landmark : (land_mark !== undefined ? land_mark : null);
    const hasAddressField = house_no !== undefined || street !== undefined || street_name !== undefined ||
      village !== undefined || effectiveLandmark !== null || address !== undefined ||
      city !== undefined || district !== undefined || state !== undefined ||
      pincode !== undefined || location !== undefined ||
      req.body.latitude !== undefined || req.body.longitude !== undefined;

    if (hasAddressField) {
      const { rows: existingAddr } = await db.query(`
        SELECT a.id 
        FROM address_history ah
        JOIN addresses a ON ah.address_id = a.id
        WHERE ah.entity_type = 'finance' AND ah.entity_id = $1 AND ah.is_current = 1
        LIMIT 1
      `, [String(financeId)]);

      if (existingAddr.length > 0) {
        const addrId = existingAddr[0].id;
        const addrUpdates = [];
        const addrVals = [];
        let aIdx = 1;

        if (house_no !== undefined) { addrUpdates.push(`house_no = $${aIdx++}`); addrVals.push(house_no); }
        if (street !== undefined) { addrUpdates.push(`street = $${aIdx++}`); addrVals.push(street); }
        if (street_name !== undefined) { addrUpdates.push(`street_name = $${aIdx++}`); addrVals.push(street_name); }
        if (village !== undefined) { addrUpdates.push(`village = $${aIdx++}`); addrVals.push(village); }
        if (effectiveLandmark !== null) { addrUpdates.push(`land_mark = $${aIdx++}`); addrVals.push(effectiveLandmark); }
        if (address !== undefined) { addrUpdates.push(`address = $${aIdx++}`); addrVals.push(address); }
        if (city !== undefined) { addrUpdates.push(`city = $${aIdx++}`); addrVals.push(city); }
        if (district !== undefined) { addrUpdates.push(`district = $${aIdx++}`); addrVals.push(district); }
        if (state !== undefined) { addrUpdates.push(`state = $${aIdx++}`); addrVals.push(state); }
        if (pincode !== undefined) { addrUpdates.push(`pincode = $${aIdx++}`); addrVals.push(pincode); }
        if (location !== undefined) { addrUpdates.push(`location = $${aIdx++}`); addrVals.push(location); }
        if (req.body.latitude !== undefined) {
          addrUpdates.push(`latitude = $${aIdx++}`);
          addrVals.push(req.body.latitude === null || req.body.latitude === '' ? null : Number(req.body.latitude));
        }
        if (req.body.longitude !== undefined) {
          addrUpdates.push(`longitude = $${aIdx++}`);
          addrVals.push(req.body.longitude === null || req.body.longitude === '' ? null : Number(req.body.longitude));
        }

        if (addrUpdates.length > 0) {
          addrVals.push(addrId);
          await db.query(`UPDATE addresses SET ${addrUpdates.join(', ')} WHERE id = $${aIdx}`, addrVals);
        }
      } else {
        const parseCoordOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
        const { rows: newAddr } = await db.query(
          `INSERT INTO addresses (
             house_no, street, street_name, village, land_mark, address, city, district, state, pincode, location, latitude, longitude
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            house_no || '',
            street || '',
            street_name || '',
            village || '',
            effectiveLandmark || '',
            address || '',
            city || '',
            district || '',
            state || '',
            pincode || '',
            location || '',
            parseCoordOrNull(req.body.latitude),
            parseCoordOrNull(req.body.longitude),
          ]
        );
        await db.query(
          `INSERT INTO address_history (entity_type, entity_id, address_id, is_current)
           VALUES ('finance', $1, $2, 1)`,
          [String(financeId), newAddr[0].id]
        );
        await db.query(
          `UPDATE finance_detail SET address_id = $1 WHERE id = $2`,
          [newAddr[0].id, financeId]
        );
      }
    }

    // Fetch refreshed finance details
    const { rows: updatedRows } = await db.query(`
      SELECT 
        fd.id, fd.finance_name, fd.phone_numbers, fd.emails, fd.since,
        fd.is_active, fd.finance_photo, fd.updated_at,
        a.house_no, a.street, a.street_name, a.village, a.land_mark,
        a.address, a.city, a.district, a.state, a.pincode, a.location
      FROM finance_detail fd
      LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
        AND ah.entity_id = fd.id::varchar 
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.id = $1
    `, [financeId]);

    // Log recent activity
    await db.query(`
      INSERT INTO recent_activity (finance_id, type, reference_id, description, created_by, created_at)
      VALUES ($1, 'profile', $2, 'Company profile details updated by Owner', $3, CURRENT_TIMESTAMP)
    `, [financeId, String(financeId), req.owner?.username || 'Owner']);

    const refreshedFinance = updatedRows[0];
    if (refreshedFinance?.finance_photo) {
      refreshedFinance.finance_photo = await getSignedImageUrl(refreshedFinance.finance_photo);
      refreshedFinance.logo_url = refreshedFinance.finance_photo;
    }

    return res.json({
      success: true,
      message: 'Finance profile updated successfully',
      finance: refreshedFinance,
    });
  } catch (err) {
    console.error('Error updating finance profile:', err);
    return res.status(500).json({ success: false, error: 'Failed to update finance profile', details: err.message });
  }
});

// ─── POST /logos/upload ─ Upload Branding Logos (Web / Print) ─────────────────
router.post('/logos/upload', ownerCheckFinance, upload.single('logo'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No logo image file uploaded' });
    }

    const assetType = (req.body.asset_type || req.query.type || 'web_logo').trim();
    const validAssetTypes = ['web_logo', 'print_logo', 'app_logo', 'digital_seal', 'authorized_sign'];
    if (!validAssetTypes.includes(assetType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid asset type "${assetType}". Allowed types: ${validAssetTypes.join(', ')}`,
      });
    }

    const uploaded = await uploadFinanceLogoToS3(file);
    const financeId = req.financeId;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // If web_logo, also update finance_detail.finance_photo for global backwards compatibility
      if (assetType === 'web_logo') {
        await client.query(
          'UPDATE finance_detail SET finance_photo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [uploaded.fileUrl, financeId]
        );
      }

      // Upsert into finance_branding_assets
      const { rows: existingAsset } = await client.query(
        'SELECT id FROM finance_branding_assets WHERE finance_id = $1 AND asset_type = $2 AND is_active = true LIMIT 1',
        [financeId, assetType]
      );

      let savedAsset;
      if (existingAsset.length > 0) {
        const { rows } = await client.query(
          `UPDATE finance_branding_assets 
           SET file_path = $1, file_name = $2, mime_type = $3, file_size_bytes = $4, updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING *`,
          [uploaded.fileUrl, uploaded.fileName, uploaded.contentType, uploaded.fileSizeBytes, existingAsset[0].id]
        );
        savedAsset = rows[0];
      } else {
        const { rows } = await client.query(
          `INSERT INTO finance_branding_assets (
             finance_id, asset_type, file_path, file_name, mime_type, file_size_bytes, display_name, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           RETURNING *`,
          [
            financeId,
            assetType,
            uploaded.fileUrl,
            uploaded.fileName,
            uploaded.contentType,
            uploaded.fileSizeBytes,
            assetType === 'web_logo' ? 'Primary Web Logo' : 'Official Printing Logo',
          ]
        );
        savedAsset = rows[0];
      }

      await client.query('COMMIT');
      client.release();

      const signedFileUrl = await getSignedImageUrl(uploaded.fileUrl);
      return res.json({
        success: true,
        message: `${assetType === 'web_logo' ? 'Finance logo' : 'Printing logo'} updated successfully`,
        fileUrl: signedFileUrl,
        originalUrl: uploaded.fileUrl,
        assetType,
        asset: {
          ...savedAsset,
          file_path: signedFileUrl,
        },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }
  } catch (err) {
    console.error('Logo upload error:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload logo', details: err.message });
  }
});

// ─── Bank Accounts Management (Owner Only) ────────────────────────────────────

// GET /banks ─ List all bank accounts for active finance
router.get('/banks', ownerCheckFinance, async (req, res) => {
  try {
    const { rows: banks } = await db.query(
      `SELECT id, bank_name, branch, ifsc_code, account_name, account_number, upi_id, is_primary, is_active, created_at, updated_at
       FROM finance_bank_accounts
       WHERE finance_id = $1
       ORDER BY is_primary DESC, created_at ASC`,
      [req.financeId]
    );
    res.json({ success: true, banks });
  } catch (err) {
    console.error('Error fetching bank accounts:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch bank accounts' });
  }
});

// POST /banks ─ Add new bank account
router.post('/banks', ownerCheckFinance, async (req, res) => {
  try {
    const { bank_name, branch, ifsc_code, account_name, account_number, upi_id, is_primary } = req.body;
    if (!bank_name || !account_number || !ifsc_code) {
      return res.status(400).json({ success: false, error: 'Bank name, account number, and IFSC code are required' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Check duplicate account number
      const { rows: existing } = await client.query(
        'SELECT id FROM finance_bank_accounts WHERE finance_id = $1 AND account_number = $2',
        [req.financeId, account_number.trim()]
      );
      if (existing.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ success: false, error: 'A bank account with this account number already exists.' });
      }

      // Check existing accounts
      const { rows: existingBanks } = await client.query(
        'SELECT id FROM finance_bank_accounts WHERE finance_id = $1',
        [req.financeId]
      );
      const shouldBePrimary = Boolean(is_primary) || existingBanks.length === 0;

      if (shouldBePrimary) {
        await client.query(
          'UPDATE finance_bank_accounts SET is_primary = false WHERE finance_id = $1',
          [req.financeId]
        );
      }

      const { rows } = await client.query(
        `INSERT INTO finance_bank_accounts (
           finance_id, bank_name, branch, ifsc_code, account_name, account_number, upi_id, is_primary, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         RETURNING *`,
        [
          req.financeId,
          bank_name.trim(),
          branch ? branch.trim() : null,
          ifsc_code.trim().toUpperCase(),
          account_name ? account_name.trim() : bank_name.trim(),
          account_number.trim(),
          upi_id ? upi_id.trim() : null,
          shouldBePrimary,
        ]
      );

      await client.query('COMMIT');
      client.release();

      return res.status(201).json({ success: true, message: 'Bank account added successfully', bank: rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      client.release();
      throw e;
    }
  } catch (err) {
    console.error('Error adding bank account:', err);
    res.status(500).json({ success: false, error: 'Failed to add bank account', details: err.message });
  }
});

// PUT /banks/:id ─ Edit bank account
router.put('/banks/:id', ownerCheckFinance, async (req, res) => {
  try {
    const bankId = req.params.id;
    const { bank_name, branch, ifsc_code, account_name, account_number, upi_id } = req.body;

    const { rows } = await db.query(
      `UPDATE finance_bank_accounts
       SET bank_name = COALESCE($1, bank_name),
           branch = COALESCE($2, branch),
           ifsc_code = COALESCE($3, ifsc_code),
           account_name = COALESCE($4, account_name),
           account_number = COALESCE($5, account_number),
           upi_id = COALESCE($6, upi_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND finance_id = $8
       RETURNING *`,
      [
        bank_name ? bank_name.trim() : null,
        branch !== undefined ? branch.trim() : null,
        ifsc_code ? ifsc_code.trim().toUpperCase() : null,
        account_name ? account_name.trim() : null,
        account_number ? account_number.trim() : null,
        upi_id !== undefined ? upi_id.trim() : null,
        bankId,
        req.financeId,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    res.json({ success: true, message: 'Bank account updated successfully', bank: rows[0] });
  } catch (err) {
    console.error('Error updating bank account:', err);
    res.status(500).json({ success: false, error: 'Failed to update bank account', details: err.message });
  }
});

// PATCH /banks/:id/primary ─ Set primary bank account
router.patch('/banks/:id/primary', ownerCheckFinance, async (req, res) => {
  try {
    const bankId = req.params.id;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE finance_bank_accounts SET is_primary = false WHERE finance_id = $1', [req.financeId]);
      const { rows } = await client.query(
        `UPDATE finance_bank_accounts 
         SET is_primary = true, is_active = true, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND finance_id = $2 
         RETURNING *`,
        [bankId, req.financeId]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ success: false, error: 'Bank account not found' });
      }
      await client.query('COMMIT');
      client.release();
      res.json({ success: true, message: 'Primary bank account updated successfully', bank: rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      client.release();
      throw e;
    }
  } catch (err) {
    console.error('Error setting primary bank:', err);
    res.status(500).json({ success: false, error: 'Failed to set primary bank' });
  }
});

// PATCH /banks/:id/status ─ Toggle bank active/inactive
router.patch('/banks/:id/status', ownerCheckFinance, async (req, res) => {
  try {
    const bankId = req.params.id;
    const { is_active } = req.body;
    const { rows } = await db.query(
      `UPDATE finance_bank_accounts
       SET is_active = COALESCE($1, NOT is_active), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND finance_id = $3
       RETURNING *`,
      [is_active !== undefined ? Boolean(is_active) : null, bankId, req.financeId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }
    res.json({
      success: true,
      message: `Bank account ${rows[0].is_active ? 'activated' : 'deactivated'}`,
      bank: rows[0],
    });
  } catch (err) {
    console.error('Error toggling bank status:', err);
    res.status(500).json({ success: false, error: 'Failed to update bank status' });
  }
});

// DELETE /banks/:id ─ Delete bank account
router.delete('/banks/:id', ownerCheckFinance, async (req, res) => {
  try {
    const bankId = req.params.id;
    const { rows } = await db.query(
      'DELETE FROM finance_bank_accounts WHERE id = $1 AND finance_id = $2 RETURNING id, bank_name',
      [bankId, req.financeId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }
    res.json({ success: true, message: `Bank account "${rows[0].bank_name}" deleted successfully` });
  } catch (err) {
    console.error('Error deleting bank account:', err);
    res.status(500).json({ success: false, error: 'Failed to delete bank account' });
  }
});

module.exports = router;
