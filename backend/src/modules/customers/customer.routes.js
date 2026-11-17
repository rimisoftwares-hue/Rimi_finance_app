const express = require('express');
const router = express.Router();
const { db } = require('../../config/database.config');
const multer = require('multer');
const { checkFinance, enhancedCheckFinance } = require('../../middleware/auth.middleware');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const Jimp = require('jimp');
const { mapPendingCollectionRow } = require('./pendingCollectionsHelper');
const {
  queryTenantLoanLedgers,
  resolveIstDateString,
} = require('../finance/financialCalculation.service');
const { isDeferredVehicle, resolveDeferredVehicle, mapVehicleUniqueViolation } = require('./deferredVehicle');
const {
  evaluateCustomerKyc,
  evaluateStaffKyc,
  filterKycRecords,
  extractFilterOptions,
  computeAggregates
} = require('./kycPendingHelper');
const {
  calculateContractualFinalDueDate,
  evaluateTerminatedAccount,
  filterTerminatedAccounts,
  computeTerminatedAggregates,
  extractTerminatedFilterOptions
} = require('./terminatedHelper');
const {
  checkExistingCustomerIdentity,
} = require('../risk/existingCustomerCheck.service');
const {
  processCustomerPaymentDb,
  fetchCustomerPaymentsWithSubDues,
} = require('../finance/payments/paymentAllocation.service');
require("dotenv").config();

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion
});

// Configure multer for memory storage (for S3 uploads)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const validFields = [
      'customerPhoto',
      'customerVehiclePhoto',
      'vehiclePhoto',
      'customerPropertyPhoto',
      'guardianPhoto',
      'guardianPropertyPhoto'
    ];

    if (validFields.includes(file.fieldname) && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid field name or file type. Accepted fields: ${validFields.join(', ')}`));
    }
  }
});

// -----------------------------------------------------------------------
// Postgres query helpers
// -----------------------------------------------------------------------
const COLUMN_MAPPINGS = {
  loanStatus: 'loan_status',
  brokerName: 'broker_name',
  cvehiclePhoto: 'cvehicle_photo',
  cpropertyPhoto: 'cproperty_photo',
  gpropertyPhoto: 'gproperty_photo',
  hpAmount: 'hp_amount',
  hpDate: 'hp_date',
  dueMonth: 'due_month',
  interestRate: 'interest_rate',
  penaltyAmount: 'penalty_amount',
  dueAmount: 'due_amount',
  dueDate: 'due_date',
  paymentDate: 'payment_date',
  billNumber: 'bill_number',
  payMode: 'pay_mode',
  payMode1: 'pay_mode_1',
  customerPhoto: 'customer_photo',
  guardianPhoto: 'guardian_photo',
  vehicleNumber: 'vehicle_number',
  modelName: 'model_name',
  vehicleName: 'vehicle_name'
};

const normalizeColumnName = (col) => {
  if (COLUMN_MAPPINGS[col]) return COLUMN_MAPPINGS[col];
  if (/^[a-z0-9_]+$/.test(col)) return col;
  return col.replace(/([A-Z])/g, '_$1').toLowerCase();
};

const pgInsertClause = (data) => {
  const keys = Object.keys(data);
  const columns = keys.map(k => `"${normalizeColumnName(k)}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map(k => (k === 'is_current' && typeof data[k] === 'boolean' ? (data[k] ? 1 : 0) : data[k]));
  return { columns, placeholders, values };
};

const pgSetClause = (data) => {
  const keys = Object.keys(data);
  const clause = keys.map((k, i) => `"${normalizeColumnName(k)}" = $${i + 1}`).join(', ');
  const values = keys.map(k => (k === 'is_current' && typeof data[k] === 'boolean' ? (data[k] ? 1 : 0) : data[k]));
  return { clause, values };
};

const cleanUuid = (val) => {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '""') return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? trimmed.toLowerCase() : null;
};

const cleanContactNumber = (num) => {
  if (!num) return null;
  const str = String(num).trim();
  if (/[a-zA-Z]/.test(str)) return null;
  let digits = str.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits.length === 10 ? digits : null;
};

const parseCoordinate = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
};

const resolveVehicleInfoId = async (conn, vehicle) => {
  if (!vehicle) return null;

  const rawId = vehicle.vehicle_info_id || vehicle.vehicleInfoId;
  const directUuid = cleanUuid(typeof rawId === 'string' ? rawId : (rawId ? String(rawId) : null));

  if (directUuid) {
    const { rows: viExists } = await conn.query(
      'SELECT id FROM vehicle_info WHERE id = $1 LIMIT 1',
      [directUuid]
    );
    if (viExists.length > 0) {
      return viExists[0].id;
    }
  }

  const rawBrand = (vehicle.brand || '').toString().trim();
  const modelCandidates = [
    vehicle.model_name,
    vehicle.modelName,
    vehicle.vehicle_modal,
    vehicle.vehicle_name,
    vehicle.vehicleName
  ];
  let rawModel = '';
  for (const candidate of modelCandidates) {
    if (candidate && candidate.toString().trim()) {
      rawModel = candidate.toString().trim();
      break;
    }
  }

  if (!rawBrand && !rawModel) return null;

  let searchModel = rawModel;
  if (rawBrand && searchModel.toLowerCase().startsWith(rawBrand.toLowerCase())) {
    searchModel = searchModel.slice(rawBrand.length).trim();
  }

  if (rawBrand) {
    const { rows: viMatch } = await conn.query(
      `SELECT id FROM vehicle_info 
       WHERE LOWER(TRIM(brand)) = LOWER(TRIM($1)) 
         AND (
           LOWER(TRIM(model_name)) = LOWER(TRIM($2)) 
           OR LOWER(TRIM(model_name)) ILIKE LOWER(TRIM($2)) || '%'
           OR LOWER(TRIM($2)) ILIKE '%' || LOWER(TRIM(model_name)) || '%'
         )
       ORDER BY 
         CASE WHEN LOWER(TRIM(model_name)) = LOWER(TRIM($2)) THEN 1 ELSE 2 END,
         LENGTH(model_name) ASC
       LIMIT 1`,
      [rawBrand, searchModel || rawModel]
    );
    if (viMatch.length > 0) {
      return viMatch[0].id;
    }
  } else if (searchModel) {
    const { rows: viMatchAny } = await conn.query(
      `SELECT id FROM vehicle_info 
       WHERE LOWER(TRIM(model_name)) = LOWER(TRIM($1))
          OR LOWER(TRIM(model_name)) ILIKE LOWER(TRIM($1)) || '%'
          OR LOWER(TRIM($1)) ILIKE '%' || LOWER(TRIM(model_name)) || '%'
       ORDER BY 
         CASE WHEN LOWER(TRIM(model_name)) = LOWER(TRIM($1)) THEN 1 ELSE 2 END,
         LENGTH(model_name) ASC
       LIMIT 1`,
      [searchModel]
    );
    if (viMatchAny.length > 0) {
      return viMatchAny[0].id;
    }
  }

  return null;
};

const validateCustomerPayload = (customer, address, contacts) => {
  if (!customer?.cname || !String(customer.cname).trim()) {
    return { isValid: false, valid: false, error: 'Customer name is required' };
  }
  const relVal = customer?.cfname?.value ?? customer?.cfname_value ?? customer?.relation_name ?? customer?.relationName;
  if (!relVal || !String(relVal).trim()) {
    return { isValid: false, valid: false, error: 'Customer relation name is required' };
  }
  const relUnit = customer?.cfname?.unit ?? customer?.cfname_unit ?? customer?.relation_type ?? customer?.relationType;
  if (!relUnit || !String(relUnit).trim()) {
    return { isValid: false, valid: false, error: 'Customer relation unit is required' };
  }
  // Address: either street_name or village
  const streetName = address?.street_name || customer?.street_name || customer?.caddress?.street_name || customer?.address?.street_name;
  const village = address?.village || customer?.village || customer?.caddress?.village || customer?.address?.village;
  if ((!streetName || !String(streetName).trim()) && (!village || !String(village).trim())) {
    return { isValid: false, valid: false, error: 'Either Street Name or Village is required' };
  }
  // Coordinates validation
  const latRaw = address?.latitude ?? customer?.latitude ?? customer?.caddress?.latitude;
  const lngRaw = address?.longitude ?? customer?.longitude ?? customer?.caddress?.longitude;
  const hasLat = latRaw !== undefined && latRaw !== null && String(latRaw).trim() !== '';
  const hasLng = lngRaw !== undefined && lngRaw !== null && String(lngRaw).trim() !== '';
  if (hasLat !== hasLng) {
    return { isValid: false, valid: false, error: 'Both latitude and longitude must be provided, or leave both empty' };
  }
  if (hasLat && hasLng) {
    const latN = Number(latRaw);
    const lngN = Number(lngRaw);
    if (isNaN(latN) || latN < -90 || latN > 90) {
      return { isValid: false, valid: false, error: 'Latitude must be between -90 and 90' };
    }
    if (isNaN(lngN) || lngN < -180 || lngN > 180) {
      return { isValid: false, valid: false, error: 'Longitude must be between -180 and 180' };
    }
  }
  // Contacts: at least one valid 10-digit contact
  const contactList = Array.isArray(contacts)
    ? contacts
    : (Array.isArray(customer?.ccontacts) ? customer.ccontacts : (Array.isArray(customer?.contacts) ? customer.contacts : []));
  let hasValidContact = false;
  for (const c of contactList) {
    const rawNum = typeof c === 'string' ? c : c?.number;
    if (rawNum && String(rawNum).trim()) {
      if (/[a-zA-Z]/.test(String(rawNum))) {
        return { isValid: false, valid: false, error: 'Contact number cannot contain letters' };
      }
      const clean = cleanContactNumber(rawNum);
      if (clean && clean.length === 10) {
        hasValidContact = true;
      } else {
        return { isValid: false, valid: false, error: 'Contact number must be exactly 10 digits' };
      }
    }
  }
  if (!hasValidContact) {
    return { isValid: false, valid: false, error: 'At least one valid 10-digit contact number is required' };
  }
  return { isValid: true, valid: true };
};

const validateGuardianPayload = (guardian, gaddress, gcontacts) => {
  if (!guardian?.gname || !String(guardian.gname).trim()) {
    return { isValid: false, valid: false, error: 'Guardian name is required' };
  }
  const relVal = guardian?.gfname?.value ?? guardian?.gfname_value ?? guardian?.relation_name ?? guardian?.relationName;
  if (!relVal || !String(relVal).trim()) {
    return { isValid: false, valid: false, error: 'Guardian relation name is required' };
  }
  const relUnit = guardian?.gfname?.unit ?? guardian?.gfname_unit ?? guardian?.relation_type ?? guardian?.relationType;
  if (!relUnit || !String(relUnit).trim()) {
    return { isValid: false, valid: false, error: 'Guardian relation unit is required' };
  }
  // Guardian Street Name is mandatory
  const streetName = gaddress?.street_name || guardian?.street_name || guardian?.gaddress?.street_name || guardian?.address?.street_name;
  if (!streetName || !String(streetName).trim()) {
    return { isValid: false, valid: false, error: 'Guardian street name is required' };
  }
  // Coordinates validation
  const latRaw = gaddress?.latitude ?? guardian?.latitude ?? guardian?.gaddress?.latitude;
  const lngRaw = gaddress?.longitude ?? guardian?.longitude ?? guardian?.gaddress?.longitude;
  const hasLat = latRaw !== undefined && latRaw !== null && String(latRaw).trim() !== '';
  const hasLng = lngRaw !== undefined && lngRaw !== null && String(lngRaw).trim() !== '';
  if (hasLat !== hasLng) {
    return { isValid: false, valid: false, error: 'Both latitude and longitude must be provided, or leave both empty' };
  }
  if (hasLat && hasLng) {
    const latN = Number(latRaw);
    const lngN = Number(lngRaw);
    if (isNaN(latN) || latN < -90 || latN > 90) {
      return { isValid: false, valid: false, error: 'Latitude must be between -90 and 90' };
    }
    if (isNaN(lngN) || lngN < -180 || lngN > 180) {
      return { isValid: false, valid: false, error: 'Longitude must be between -180 and 180' };
    }
  }
  // At least one valid guardian contact number
  const contactList = Array.isArray(gcontacts)
    ? gcontacts
    : (Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : (Array.isArray(guardian?.contacts) ? guardian.contacts : []));
  let hasValidContact = false;
  for (const c of contactList) {
    const rawNum = typeof c === 'string' ? c : c?.number;
    if (rawNum && String(rawNum).trim()) {
      if (/[a-zA-Z]/.test(String(rawNum))) {
        return { isValid: false, valid: false, error: 'Guardian contact number cannot contain letters' };
      }
      const clean = cleanContactNumber(rawNum);
      if (clean && clean.length === 10) {
        hasValidContact = true;
      } else {
        return { isValid: false, valid: false, error: 'Guardian contact number must be exactly 10 digits' };
      }
    }
  }
  if (!hasValidContact) {
    return { isValid: false, valid: false, error: 'At least one valid 10-digit guardian contact number is required' };
  }
  return { isValid: true, valid: true };
};

const validateVehiclePayload = (vehicle, loan, isFinanceDeal = true) => {
  const vehNum = vehicle?.vehicle_number || vehicle?.vehicleNumber;
  if (!vehNum || !String(vehNum).trim()) {
    return { isValid: false, valid: false, error: 'Vehicle number is required' };
  }
  const brand = vehicle?.brand;
  if (!brand || !String(brand).trim()) {
    return { isValid: false, valid: false, error: 'Vehicle brand is required' };
  }
  const shouldCheckLoan = typeof loan === 'boolean' ? loan : (typeof isFinanceDeal === 'boolean' ? isFinanceDeal : true);
  const loanSource = typeof loan === 'object' && loan ? loan : vehicle;
  if (shouldCheckLoan) {
    const loanType = loanSource?.loan_type || loanSource?.loanType;
    if (!loanType || !String(loanType).trim()) {
      return { isValid: false, valid: false, error: 'Loan type is required' };
    }
  }
  return { isValid: true, valid: true };
};


// Helper function to generate unique filename
const generateFileName = (originalname) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E9);
  const extension = path.extname(originalname);
  return `${timestamp}-${random}${extension}`;
};

// Helper function to upload image to S3 (KEEP OBJECTS PRIVATE)
const uploadToS3 = async (fileBuffer, fileName, mimeType, folder = 'customers') => {
  try {
    const image = await Jimp.read(fileBuffer);

    if (image.bitmap.width > 1920) {
      image.resize(1920, Jimp.AUTO);
    }

    const resizedBuffer = await image
      .quality(80)
      .getBufferAsync(Jimp.MIME_JPEG);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `${folder}/${fileName}`,
        Body: resizedBuffer,
        ContentType: 'image/jpeg'
      })
    );

    return `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${folder}/${fileName}`;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};


// Helper function to delete image from S3
const deleteFromS3 = async (imageUrl) => {
  try {
    // Extract key from URL
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1); // Remove leading slash

    const params = {
      Bucket: bucketName,
      Key: key
    };

    const command = new DeleteObjectCommand(params);
    await s3.send(command);
    console.log('Successfully deleted from S3:', key);
    return true;
  } catch (error) {
    console.error('Error deleting from S3:', error);
    throw error;
  }
};

// Helper function to get signed URL
const getSignedImageUrl = async (imageUrl, expiresIn = 86400) => {
  try {
    // Extract key from URL
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1);

    const params = {
      Bucket: bucketName,
      Key: key
    };

    const command = new GetObjectCommand(params);
    const signedUrl = await getSignedUrl(s3, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error('Failed to generate signed URL for private image');
  }
};

// Helper function to process images with signed URLs
const processImagesWithSignedUrls = async (imagesData) => {
  if (!imagesData) return {};

  const processedData = {};
  const imageFields = {
    cphoto: 'customerPhoto',
    cvehiclePhoto: 'customerVehiclePhoto',
    cvehicle_photo: 'customerVehiclePhoto',
    vehiclePhoto: 'vehiclePhoto',
    cpropertyPhoto: 'customerPropertyPhoto',
    cproperty_photo: 'customerPropertyPhoto',
    gphoto: 'guardianPhoto',
    gpropertyPhoto: 'guardianPropertyPhoto',
    gproperty_photo: 'guardianPropertyPhoto'
  };

  // Process each image field
  for (const [dbField, reqField] of Object.entries(imageFields)) {
    if (imagesData[dbField]) {
      const imageUrl = imagesData[dbField];

      // Check if it's an S3 URL (starts with http/https and contains amazonaws.com)
      if (imageUrl && imageUrl.startsWith('http') && imageUrl.includes('amazonaws.com')) {
        try {
          const signedUrl = await getSignedImageUrl(imageUrl, 86400);
          processedData[dbField] = {
            signed_url: signedUrl,
            original_url: imageUrl
          };
        } catch (error) {
          console.error(`Error generating signed URL for ${dbField}:`, error);
          processedData[dbField] = {
            signed_url: null,
            original_url: imageUrl,
            error: 'Failed to generate signed URL'
          };
        }
      } else {
        // For non-S3 URLs (like local paths), just return as-is
        processedData[dbField] = {
          signed_url: imageUrl, // Use original URL as signed_url
          original_url: imageUrl
        };
      }
    }
  }

  return processedData;
};

// Helper function to extract URL string from either a string or an uploaded file object
const getFileUrl = (f) => (typeof f === 'string' ? f : f?.url || null);

// Helper function to handle file uploads to S3
const handleFileUploads = async (files, hplno) => {
  const uploadedFiles = {};

  for (const [fieldName, fileArray] of Object.entries(files)) {
    if (fileArray && fileArray.length > 0) {
      const file = fileArray[0];
      const fileName = generateFileName(file.originalname);
      const folder = (fieldName === 'vehiclePhoto' || fieldName === 'customerVehiclePhoto' || fieldName === 'frontImage' || fieldName === 'sideImage') ? 'vehicles' : 'customers';

      try {
        const s3Url = await uploadToS3(file.buffer, fileName, file.mimetype, folder);
        uploadedFiles[fieldName] = {
          url: s3Url,
          fileName: fileName,
          originalName: file.originalname,
          fileSize: file.size || (file.buffer ? file.buffer.length : null),
          mimeType: file.mimetype
        };
      } catch (error) {
        console.error(`Error uploading ${fieldName} to S3:`, error);
        throw new Error(`Failed to upload ${fieldName}`);
      }
    }
  }

  return uploadedFiles;
};

// Helper function to save or update KYC document in kyc_documents table
const saveKycDocument = async (client, {
  entityType,
  entityId,
  documentType,
  filePath,
  fileName = null,
  fileSize = null,
  mimeType = null,
  uploadedBy = null,
  uploadedByType = 'staff',
  side = 'single'
}) => {
  let path = filePath;
  let name = fileName;
  let size = fileSize;
  let mime = mimeType;

  if (typeof filePath === 'object' && filePath !== null) {
    path = filePath.url;
    name = fileName || filePath.fileName || filePath.originalName || null;
    size = fileSize || filePath.fileSize || null;
    mime = mimeType || filePath.mimeType || null;
  }

  if (!entityId || !path) return null;

  const validSide = ['aadhar_card', 'driving_license', 'voter_id'].includes(documentType)
    ? (side === 'back' ? 'back' : 'front')
    : 'single';

  const uploaderStr = uploadedBy ? String(uploadedBy) : null;

  const sql = `
    INSERT INTO kyc_documents (
      entity_type, entity_id, document_type, side, file_path, file_name, file_size, mime_type, uploaded_by, uploaded_by_type, verification_status, is_current
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'verified', true
    )
    ON CONFLICT (entity_type, entity_id, document_type, side) WHERE (is_current = true)
    DO UPDATE SET 
      file_path = EXCLUDED.file_path,
      file_name = COALESCE(EXCLUDED.file_name, kyc_documents.file_name),
      file_size = COALESCE(EXCLUDED.file_size, kyc_documents.file_size),
      mime_type = COALESCE(EXCLUDED.mime_type, kyc_documents.mime_type),
      uploaded_by = COALESCE(EXCLUDED.uploaded_by, kyc_documents.uploaded_by),
      uploaded_by_type = EXCLUDED.uploaded_by_type,
      uploaded_at = CURRENT_TIMESTAMP, 
      verification_status = 'verified'
    RETURNING id
  `;
  const { rows } = await client.query(sql, [
    entityType,
    entityId.toString(),
    documentType,
    validSide,
    path,
    name,
    size,
    mime,
    uploaderStr,
    uploadedByType
  ]);
  return rows[0]?.id;
};

// Helper to sanitize contact phone type against contact_number_type_enum ('mobile', 'landline', 'work')
const sanitizeContactNumberType = (t) => (['mobile', 'landline', 'work'].includes(t) ? t : 'mobile');

// Helper function to save work phone in contacts table
const saveWorkContact = async (client, { customerId, contactType, number, financeId }) => {
  if (!customerId || !number || !String(number).trim()) return null;
  const sql = `
    INSERT INTO contacts (
      customer_id, contact_type, type, number, finance_id
    ) VALUES (
      $1, $2, 'work', $3, $4
    )
    ON CONFLICT (customer_id, number, contact_type) 
    DO UPDATE SET type = 'work', finance_id = EXCLUDED.finance_id
    RETURNING id
  `;
  const { rows } = await client.query(sql, [customerId, contactType, String(number).trim(), financeId]);
  return rows[0]?.id;
};

// Helper function to save vehicle photo in vehicle_media table
const saveVehicleMedia = async (client, { financeId, vehicleId, mediaUrl, mediaType = 'front', isPrimary = 1 }) => {
  if (!vehicleId || !mediaUrl) return null;
  const { rows: existing } = await client.query(
    'SELECT id FROM vehicle_media WHERE vehicle_id = $1 AND media_type = $2 LIMIT 1',
    [vehicleId, mediaType]
  );
  if (existing.length > 0) {
    await client.query(
      'UPDATE vehicle_media SET media_url = $1, is_primary = $2 WHERE id = $3',
      [mediaUrl, isPrimary, existing[0].id]
    );
    return existing[0].id;
  } else {
    const { rows } = await client.query(
      `INSERT INTO vehicle_media (finance_id, vehicle_id, media_url, media_type, is_primary)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [financeId, vehicleId, mediaUrl, mediaType, isPrimary]
    );
    return rows[0]?.id;
  }
};

// Per-user sliding-window rate limiter for POST /customers/check-existing (30 req / 60s)
const CHECK_EXISTING_RATE_WINDOW_MS = 60 * 1000;
const CHECK_EXISTING_RATE_MAX = 30;
const checkExistingRateBuckets = new Map();

const checkExistingRateLimiter = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const now = Date.now();
  const principalKey = String(req.user?.id || req.owner?.id || req.ip || 'anonymous');

  // Opportunistic sweep to bound Map size
  if (checkExistingRateBuckets.size > 1000) {
    for (const [k, b] of checkExistingRateBuckets.entries()) {
      if (b.resetAt <= now) checkExistingRateBuckets.delete(k);
    }
  }

  let bucket = checkExistingRateBuckets.get(principalKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + CHECK_EXISTING_RATE_WINDOW_MS };
    checkExistingRateBuckets.set(principalKey, bucket);
  }

  bucket.count += 1;
  if (bucket.count > CHECK_EXISTING_RATE_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      success: false,
      error: 'Too many identity check requests. Please wait a moment.',
      error_code: 'RATE_LIMITED',
    });
  }

  return next();
};

// Real-time existing customer / guarantor identity check (registered ABOVE all /:customerId routes)
router.post('/check-existing', enhancedCheckFinance, checkExistingRateLimiter, async (req, res) => {
  const startedAt = Date.now();
  res.set('Cache-Control', 'no-store');

  try {
    if (!req.financeId || (!req.user?.id && !req.owner?.id)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        error_code: 'FORBIDDEN',
      });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        success: false,
        error: 'Request body must be a JSON object',
      });
    }

    if (typeof req.rawBody === 'string' && req.rawBody.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Request payload too large',
      });
    }

    if (body.phones !== undefined && body.phones !== null) {
      if (!Array.isArray(body.phones) || body.phones.length > 6) {
        return res.status(400).json({
          success: false,
          error: 'phones must be an array of at most 6 strings',
        });
      }
      for (const p of body.phones) {
        if (typeof p !== 'string' || p.length > 32) {
          return res.status(400).json({
            success: false,
            error: 'Each phone entry must be a short string',
          });
        }
      }
    }

    const stringFields = ['aadhar', 'otherGovtIdType', 'otherGovtIdNumber', 'excludeCustomerId'];
    for (const key of stringFields) {
      const val = body[key];
      if (val !== undefined && val !== null && (typeof val !== 'string' || val.length > 64)) {
        return res.status(400).json({
          success: false,
          error: `${key} must be a short string`,
        });
      }
    }

    const data = await checkExistingCustomerIdentity(req.financeId, {
      phones: body.phones,
      aadhar: body.aadhar,
      otherGovtIdType: body.otherGovtIdType,
      otherGovtIdNumber: body.otherGovtIdNumber,
      excludeCustomerId: body.excludeCustomerId,
    });

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const status = err?.statusCode || 500;
    if (status >= 500) {
      console.error('[customers/check-existing] error', {
        financeId: req.financeId || null,
        durationMs,
        code: err?.code || null,
      });
    }
    return res.status(status).json({
      success: false,
      error: status >= 500 ? 'Failed to check existing customer records' : err.message,
    });
  }
});

// CREATE Customer
router.post('/', enhancedCheckFinance, upload.fields([
  { name: 'customerPhoto', maxCount: 1 },
  { name: 'customerVehiclePhoto', maxCount: 1 },
  { name: 'vehiclePhoto', maxCount: 1 },
  { name: 'customerPropertyPhoto', maxCount: 1 },
  { name: 'guardianPhoto', maxCount: 1 },
  { name: 'guardianPropertyPhoto', maxCount: 1 },
  { name: 'frontImage', maxCount: 1 },
  { name: 'sideImage', maxCount: 1 }
]), async (req, res) => {
  const conn = await db.connect();

  try {
    console.log('Request files:', req.files);
    console.log('Request body:', req.body);

    // Validate required data sections first
    if (!req.body.customer || !req.body.guardian || !req.body.loan || !req.body.vehicle) {
      throw new Error('Missing required data sections');
    }

    // Parse the JSON data from each part
    const customer = JSON.parse(req.body.customer);
    const guardian = JSON.parse(req.body.guardian);
    const loan = JSON.parse(req.body.loan);
    const vehicle = JSON.parse(req.body.vehicle);
    const finance_id = req.financeId;

    // Validate required fields
    if (!customer.hplno) {
      throw new Error('Invalid or missing hplno');
    }
    const custVal = validateCustomerPayload(customer, customer.caddress, customer.ccontacts);
    if (!custVal.isValid) {
      throw new Error(custVal.error);
    }
    const guardVal = validateGuardianPayload(guardian, guardian.gaddress, guardian.gcontacts);
    if (!guardVal.isValid) {
      throw new Error(guardVal.error);
    }

    await conn.query('BEGIN');

    try {
      // Upload files to S3
      let uploadedFiles = {};
      if (req.files) {
        uploadedFiles = await handleFileUploads(req.files, customer.hplno);
      }

      console.log('vehicle id:', vehicle.id);

      let targetVehicleId = vehicle.id;

      // 3. Handle Vehicle: deferred (consulting) vehicles are resolved/inserted inside this
      //    transaction (see deferredVehicle.js). Real UUIDs keep the existing behaviour below.
      if (isDeferredVehicle(vehicle)) {
        const deferred = await resolveDeferredVehicle(conn, {
          vehicle,
          financeId: finance_id,
          resolveVehicleInfoId,
          insertClause: pgInsertClause,
        });
        targetVehicleId = deferred.vehicleId;

        const __insVehAct = pgInsertClause({
          finance_id: finance_id,
          type: 'vehicle',
          reference_id: targetVehicleId,
          description: deferred.created
            ? `Vehicle ${deferred.vehicleNumber} created with sales status for consulting customer ${customer.hplno}`
            : `Vehicle ${deferred.vehicleNumber} status changed to sales for customer ${customer.hplno}`,
          created_by: req.user?.user_name || 'System'
        });
        await conn.query(
          `INSERT INTO recent_activity (${__insVehAct.columns}) VALUES (${__insVehAct.placeholders})`,
          __insVehAct.values
        );
      } else if (targetVehicleId) {
        // Existing vehicle: update status to 'sales' if available
        const { rows: vehicleCheck } = await conn.query(
          'SELECT id, status FROM vehicle_detail WHERE id = $1 AND finance_id = $2',
          [targetVehicleId, finance_id]
        );

        if (vehicleCheck.length > 0 && vehicleCheck[0].status === 'available') {
          // Update vehicle status to 'sales'
          await conn.query(
            'UPDATE vehicle_detail SET status = $1 WHERE id = $2',
            ['sales', targetVehicleId]
          );

          // Log the vehicle status change
          const __ins1 = pgInsertClause({
            finance_id: finance_id,
            type: 'vehicle',
            reference_id: targetVehicleId,
            description: `Vehicle ${vehicle.vehicleNumber || ''} status changed to sales for customer ${customer.hplno}`,
            created_by: req.user?.user_name || 'System'
          });
          await conn.query(
            `INSERT INTO recent_activity (${__ins1.columns}) VALUES (${__ins1.placeholders})`,
            __ins1.values
          );
        }
      }

      // 4. Insert customer (without normalized photo and work phone columns)
      const customerResultIns = pgInsertClause({
        finance_id: finance_id,
        hplno: customer.hplno,
        loanStatus: customer.loanStatus || 'active',
        brokerName: customer.brokerName || null,
        cname: customer.cname,
        cfname_value: customer.cfname?.value || null,
        cfname_unit: customer.cfname?.unit || null,
        vehicle_id: targetVehicleId || null,
        aadhar_id: customer.aadhar_id || null,
        other_govt_id_type: customer.other_govt_id_type || null,
        other_govt_id_number: customer.other_govt_id_number || null,
        profession: customer.profession || null,
        work_office_address: customer.work_office_address || null
      });
      const { rows: customerResult } = await conn.query(
        `INSERT INTO customers (${customerResultIns.columns}) VALUES (${customerResultIns.placeholders}) RETURNING id`,
        customerResultIns.values
      );
      const customerId = customerResult[0].id;

      // Store customer photos in kyc_documents
      if (uploadedFiles.customerPhoto) {
        await saveKycDocument(conn, {
          entityType: 'customer',
          entityId: customerId,
          documentType: 'customer_photo',
          filePath: uploadedFiles.customerPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      if (uploadedFiles.customerPropertyPhoto) {
        await saveKycDocument(conn, {
          entityType: 'customer',
          entityId: customerId,
          documentType: 'property_photo',
          filePath: uploadedFiles.customerPropertyPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      const vehPhotoObj = uploadedFiles.customerVehiclePhoto || uploadedFiles.vehiclePhoto;
      if (vehPhotoObj) {
        await saveKycDocument(conn, {
          entityType: 'customer',
          entityId: customerId,
          documentType: 'vehicle_photo',
          filePath: vehPhotoObj,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      // Store customer work office phone in contacts
      if (customer.work_office_phone) {
        await saveWorkContact(conn, {
          customerId: customerId,
          contactType: 'customer',
          number: customer.work_office_phone,
          financeId: finance_id
        });
      }
      // Store vehicle photo directly in vehicle_media
      if (targetVehicleId) {
        if (uploadedFiles.frontImage) {
          const frontUrl = getFileUrl(uploadedFiles.frontImage);
          if (frontUrl) {
            await saveVehicleMedia(conn, {
              financeId: finance_id,
              vehicleId: targetVehicleId,
              mediaUrl: frontUrl,
              mediaType: 'front',
              isPrimary: 1
            });
          }
        }
        if (uploadedFiles.sideImage) {
          const sideUrl = getFileUrl(uploadedFiles.sideImage);
          if (sideUrl) {
            await saveVehicleMedia(conn, {
              financeId: finance_id,
              vehicleId: targetVehicleId,
              mediaUrl: sideUrl,
              mediaType: 'side',
              isPrimary: 0
            });
          }
        }
        const vehPhotoUrl = getFileUrl(uploadedFiles.vehiclePhoto) || getFileUrl(uploadedFiles.customerVehiclePhoto);
        if (vehPhotoUrl && !uploadedFiles.frontImage) {
          await saveVehicleMedia(conn, {
            financeId: finance_id,
            vehicleId: targetVehicleId,
            mediaUrl: vehPhotoUrl,
            mediaType: 'front',
            isPrimary: 1
          });
        }
      }

      // 1. Insert customer address if provided
      let customerAddressId = null;
      if (customer.caddress) {
        const cLat = parseCoordinate(customer.caddress.latitude);
        const cLng = parseCoordinate(customer.caddress.longitude);
        const addressResultIns = pgInsertClause({
          house_no: customer.caddress.house_no || null,
          street: customer.caddress.street || null,
          street_name: customer.caddress.street_name || null,
          village: customer.caddress.village || null,
          land_mark: customer.caddress.land_mark || null,
          address: customer.caddress.address || null,
          city: customer.caddress.city || null,
          district: customer.caddress.district || null,
          state: customer.caddress.state || null,
          pincode: customer.caddress.pincode || null,
          location: customer.caddress.location || null,
          latitude: cLat,
          longitude: cLng
        });
        const { rows: addressResult } = await conn.query(
          `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
          addressResultIns.values
        );
        customerAddressId = addressResult[0].id;

        if (cLat !== null || cLng !== null) {
          await conn.query(
            `UPDATE customers SET home_latitude = $1, home_longitude = $2 WHERE id = $3`,
            [cLat, cLng, customerId]
          );
        }

        // Insert into address_history
        const __ins2 = pgInsertClause({
          entity_type: 'customer',
          entity_id: customerId,
          address_id: customerAddressId,
          is_current: 1
        });
        await conn.query(
          `INSERT INTO address_history (${__ins2.columns}) VALUES (${__ins2.placeholders})`,
          __ins2.values
        );
      }


      // 5. Insert customer contacts
      const customerContacts = customer.ccontacts || [];
      if (Array.isArray(customerContacts)) {
        for (const contact of customerContacts) {
          const __ins3 = pgInsertClause({
            finance_id: finance_id,
            customer_id: customerId,
            contact_type: 'customer',
            type: sanitizeContactNumberType(contact.type),
            number: contact.number
          });
          await conn.query(
            `INSERT INTO contacts (${__ins3.columns}) VALUES (${__ins3.placeholders}) ON CONFLICT DO NOTHING`,
            __ins3.values
          );
        }
      }

      // 6. Insert guardian (without normalized photo and work phone columns)
      const guardianResultIns = pgInsertClause({
        finance_id: finance_id,
        customer_id: customerId,
        gname: guardian.gname || null,
        gfname_value: guardian.gfname?.value || null,
        gfname_unit: guardian.gfname?.unit || null,
        aadhar_id: guardian.aadhar_id || null,
        other_govt_id_type: guardian.other_govt_id_type || null,
        other_govt_id_number: guardian.other_govt_id_number || null,
        profession: guardian.profession || null,
        remarks: guardian.remarks || null,
        work_office_address: guardian.work_office_address || null
      });
      const { rows: guardianResult } = await conn.query(
        `INSERT INTO guardians (${guardianResultIns.columns}) VALUES (${guardianResultIns.placeholders}) RETURNING id`,
        guardianResultIns.values
      );
      const guardianId = guardianResult[0].id;

      // Store guardian photos in kyc_documents
      if (uploadedFiles.guardianPhoto) {
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: guardianId,
          documentType: 'guardian_photo',
          filePath: uploadedFiles.guardianPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      if (uploadedFiles.guardianPropertyPhoto) {
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: guardianId,
          documentType: 'property_photo',
          filePath: uploadedFiles.guardianPropertyPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      // Store guardian work office phone in contacts
      if (guardian.work_office_phone) {
        await saveWorkContact(conn, {
          customerId: customerId,
          contactType: 'guardian',
          number: guardian.work_office_phone,
          financeId: finance_id
        });
      }

      // 7. Insert guardian contacts
      const guardianContacts = guardian.gcontacts || [];
      if (Array.isArray(guardianContacts)) {
        for (const contact of guardianContacts) {
          const __ins4 = pgInsertClause({
            finance_id: finance_id,
            customer_id: customerId,
            contact_type: 'guardian',
            type: sanitizeContactNumberType(contact.type),
            number: contact.number
          });
          await conn.query(
            `INSERT INTO contacts (${__ins4.columns}) VALUES (${__ins4.placeholders}) ON CONFLICT DO NOTHING`,
            __ins4.values
          );
        }
      }
      // 2. Insert guardian address if provided
      let guardianAddressId = null;
      if (guardian.gaddress) {
        const gLat = parseCoordinate(guardian.gaddress.latitude);
        const gLng = parseCoordinate(guardian.gaddress.longitude);
        const addressResultIns = pgInsertClause({
          house_no: guardian.gaddress.house_no || null,
          street: guardian.gaddress.street || null,
          street_name: guardian.gaddress.street_name || null,
          village: guardian.gaddress.village || null,
          land_mark: guardian.gaddress.land_mark || null,
          address: guardian.gaddress.address || null,
          city: guardian.gaddress.city || null,
          district: guardian.gaddress.district || null,
          state: guardian.gaddress.state || null,
          pincode: guardian.gaddress.pincode || null,
          location: guardian.gaddress.location || null,
          latitude: gLat,
          longitude: gLng
        });
        const { rows: addressResult } = await conn.query(
          `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
          addressResultIns.values
        );
        guardianAddressId = addressResult[0].id;

        // Insert into address_history
        const __ins5 = pgInsertClause({
          entity_type: 'guardian',
          entity_id: customerId,
          address_id: guardianAddressId,
          is_current: 1
        });
        await conn.query(
          `INSERT INTO address_history (${__ins5.columns}) VALUES (${__ins5.placeholders})`,
          __ins5.values
        );
      }
      // 8. Insert loan (with vehicle_id)
      const __ins6 = pgInsertClause({
        finance_id: finance_id,
        customer_id: customerId,
        vehicle_id: targetVehicleId || null,
        loan_type: loan.loan_type || null,
        hpAmount: loan.hpAmount || 0,
        hpDate: loan.hpDate || null,
        due_date: loan.due_date || null,
        dueMonth: loan.dueMonth || 0,
        interestRate: loan.interestRate || 0,
        penaltyAmount: loan.penaltyAmount || 0,
        principle_part: loan.principle_part || 0,
        interest_part: loan.interest_part || 0,
        dueAmount: loan.dueAmount || 0,
        down_payment: loan.down_payment || 0,
        net_payment: loan.net_payment || 0,
        net_payable: loan.net_payable || 0,
        pay_mode_1_amount: loan.pay_mode_1_amount || 0,
        hand_loan: loan.hand_loan || 0,
        hand_loan_remarks: loan.hand_loan_remarks || null,
        broker_name: loan.broker_name || null,
        dealer_name: loan.dealer_name || null,
        documentation_charge: loan.documentation_charge || 0,
        broker_commission: loan.broker_commission || 0,
        remarks: loan.remarks || null
      });
      await conn.query(
        `INSERT INTO loans (${__ins6.columns}) VALUES (${__ins6.placeholders})`,
        __ins6.values
      );

      // 9. Log activity
      const __ins7 = pgInsertClause({
        finance_id: finance_id,
        type: 'customer',
        reference_id: customer.hplno,
        description: `New customer added: ${customer.cname}`,
        amount: loan.hpAmount || 0,
        created_by: req.user?.user_name || 'System'
      });
      await conn.query(
        `INSERT INTO recent_activity (${__ins7.columns}) VALUES (${__ins7.placeholders})`,
        __ins7.values
      );

      await conn.query('COMMIT');

      res.json({
        success: true,
        customerId: customer.hplno,
        message: 'Customer created successfully',
        uploadedFiles: uploadedFiles
      });
    } catch (err) {
      await conn.query('ROLLBACK');
      console.error('Transaction error:', err);
      throw err;
    }
  } catch (parseErr) {
    console.error('Customer creation error:', parseErr && parseErr.code ? parseErr.code : '', parseErr && parseErr.message);
    // Backstop: unique violations on vehicle_detail become clear 409s instead of 400/500
    const mapped = mapVehicleUniqueViolation(parseErr) || parseErr;
    res.status(mapped.status || 400).json({
      success: false,
      code: mapped.code && /^[A-Z_]+$/.test(String(mapped.code)) ? mapped.code : undefined,
      field: mapped.field,
      error: mapped.message || 'Invalid request data',
      details: mapped.message
    });
  } finally {
    conn.release();
  }
});

// CREATE Customer with Vehicle Loan (New endpoint)
router.post(['/vehicleLoan', '/vehicle-loan', '/customer/vehicleLoan'], enhancedCheckFinance, upload.fields([
  { name: 'customerPhoto', maxCount: 1 },
  { name: 'customerVehiclePhoto', maxCount: 1 },
  { name: 'vehiclePhoto', maxCount: 1 },
  { name: 'customerPropertyPhoto', maxCount: 1 },
  { name: 'guardianPhoto', maxCount: 1 },
  { name: 'guardianPropertyPhoto', maxCount: 1 }
]), async (req, res) => {
  const conn = await db.connect();

  try {
    console.log('Request files:', req.files);
    console.log('Request body:', req.body);

    // Validate required data sections first
    if (!req.body.customer || !req.body.guardian || !req.body.loan || !req.body.vehicle) {
      throw new Error('Missing required data sections');
    }

    // Parse the JSON data from each part
    const customer = JSON.parse(req.body.customer);
    const guardian = JSON.parse(req.body.guardian);
    const loan = JSON.parse(req.body.loan);
    const vehicle = JSON.parse(req.body.vehicle);
    const finance_id = req.financeId;

    // Validate required fields
    if (!customer.hplno) {
      throw new Error('Invalid or missing hplno');
    }
    const custVal = validateCustomerPayload(customer, customer.caddress, customer.ccontacts);
    if (!custVal.isValid) {
      throw new Error(custVal.error);
    }
    const vehVal = validateVehiclePayload(vehicle, loan);
    if (!vehVal.isValid) {
      throw new Error(vehVal.error);
    }
    const guardVal = validateGuardianPayload(guardian, guardian.gaddress, guardian.gcontacts);
    if (!guardVal.isValid) {
      throw new Error(guardVal.error);
    }

    await conn.query('BEGIN');

    try {
      // Upload files to S3
      let uploadedFiles = {};
      if (req.files) {
        uploadedFiles = await handleFileUploads(req.files, customer.hplno);
      }

      // 1. Resolve vehicle catalog ID and insert vehicle into vehicle_detail table
      const resolvedVehicleInfoId = await resolveVehicleInfoId(conn, vehicle);

      const vehicleResultIns = pgInsertClause({
        finance_id: finance_id,
        vehicle_info_id: cleanUuid(resolvedVehicleInfoId) || null,
        vehicle_number: vehicle.vehicle_number || vehicle.vehicleNumber,
        vehicle_modal: ((vehicle.vehicle_modal || vehicle.modelName || vehicle.model_name || '').toString()).slice(0, 10),
        chassis_number: (vehicle.chassis_number && vehicle.chassis_number.trim()) ? vehicle.chassis_number.trim() : null,
        engine_number: (vehicle.engine_number && vehicle.engine_number.trim()) ? vehicle.engine_number.trim() : null,
        selling_price: vehicle.selling_price || loan.hpAmount || 0,
        emi_from: vehicle.emi_from || loan.dueAmount || 0,
        base_price: vehicle.base_price || 0,
        final_price: vehicle.final_price || vehicle.selling_price || loan.hpAmount || 0,
        status: 'sales',
        deal_type: 'finance',
        rc_holder: vehicle.rc_holder || 'Company',
        rc_status: vehicle.rc_status || 'not_available',
        remarks: vehicle.remarks || ''
      });
      const { rows: vehicleResult } = await conn.query(
        `INSERT INTO vehicle_detail (${vehicleResultIns.columns}) VALUES (${vehicleResultIns.placeholders}) RETURNING id`,
        vehicleResultIns.values
      );

      const vehicleId = vehicleResult[0].id;

      // Store vehicle photo in vehicle_media table
      const vehPhotoUrl = getFileUrl(uploadedFiles.vehiclePhoto) || getFileUrl(uploadedFiles.customerVehiclePhoto);
      if (vehPhotoUrl) {
        await saveVehicleMedia(conn, {
          financeId: finance_id,
          vehicleId: vehicleId,
          mediaUrl: vehPhotoUrl,
          mediaType: 'front',
          isPrimary: 1
        });
      }

      // Log vehicle creation activity
      const __ins8 = pgInsertClause({
        finance_id: finance_id,
        type: 'vehicle',
        reference_id: vehicleId,
        description: `Vehicle ${vehicle.vehicle_number || vehicle.vehicleNumber} added and assigned to customer ${customer.hplno}`,
        created_by: req.user?.user_name || 'System'
      });
      await conn.query(
        `INSERT INTO recent_activity (${__ins8.columns}) VALUES (${__ins8.placeholders})`,
        __ins8.values
      );

      // 2. Insert customer (without normalized photo and work phone columns)
      const customerResultIns = pgInsertClause({
        finance_id: finance_id,
        hplno: customer.hplno,
        loanStatus: customer.loanStatus || 'active',
        brokerName: customer.brokerName || null,
        cname: customer.cname,
        cfname_value: customer.cfname?.value || null,
        cfname_unit: customer.cfname?.unit || null,
        vehicle_id: vehicleId, // Link to the newly created vehicle
        aadhar_id: customer.aadhar_id || null,
        other_govt_id_type: customer.other_govt_id_type || null,
        other_govt_id_number: customer.other_govt_id_number || null,
        profession: customer.profession || null,
        work_office_address: customer.work_office_address || null
      });
      const { rows: customerResult } = await conn.query(
        `INSERT INTO customers (${customerResultIns.columns}) VALUES (${customerResultIns.placeholders}) RETURNING id`,
        customerResultIns.values
      );
      const customerId = customerResult[0].id;

      // Store customer photos in kyc_documents
      if (uploadedFiles.customerPhoto) {
        await saveKycDocument(conn, {
          entityType: 'customer',
          entityId: customerId,
          documentType: 'customer_photo',
          filePath: uploadedFiles.customerPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      if (uploadedFiles.customerPropertyPhoto) {
        await saveKycDocument(conn, {
          entityType: 'customer',
          entityId: customerId,
          documentType: 'property_photo',
          filePath: uploadedFiles.customerPropertyPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      const vehPhotoObj = uploadedFiles.customerVehiclePhoto || uploadedFiles.vehiclePhoto;
      if (vehPhotoObj) {
        await saveKycDocument(conn, {
          entityType: 'customer',
          entityId: customerId,
          documentType: 'vehicle_photo',
          filePath: vehPhotoObj,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      // Store customer work office phone in contacts
      if (customer.work_office_phone) {
        await saveWorkContact(conn, {
          customerId: customerId,
          contactType: 'customer',
          number: customer.work_office_phone,
          financeId: finance_id
        });
      }

      // 3. Insert customer address if provided
      let customerAddressId = null;
      if (customer.caddress) {
        const cLat = parseCoordinate(customer.caddress.latitude);
        const cLng = parseCoordinate(customer.caddress.longitude);
        const addressResultIns = pgInsertClause({
          house_no: customer.caddress.house_no || null,
          street: customer.caddress.street || null,
          street_name: customer.caddress.street_name || null,
          village: customer.caddress.village || null,
          land_mark: customer.caddress.land_mark || null,
          address: customer.caddress.address || null,
          city: customer.caddress.city || null,
          district: customer.caddress.district || null,
          state: customer.caddress.state || null,
          pincode: customer.caddress.pincode || null,
          location: customer.caddress.location || null,
          latitude: cLat,
          longitude: cLng
        });
        const { rows: addressResult } = await conn.query(
          `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
          addressResultIns.values
        );
        customerAddressId = addressResult[0].id;

        if (cLat !== null || cLng !== null) {
          await conn.query(
            `UPDATE customers SET home_latitude = $1, home_longitude = $2 WHERE id = $3`,
            [cLat, cLng, customerId]
          );
        }

        // Insert into address_history
        const __ins9 = pgInsertClause({
          entity_type: 'customer',
          entity_id: customerId,
          address_id: customerAddressId,
          is_current: 1
        });
        await conn.query(
          `INSERT INTO address_history (${__ins9.columns}) VALUES (${__ins9.placeholders})`,
          __ins9.values
        );
      }

      // 4. Insert customer contacts
      const customerContacts = customer.ccontacts || [];
      if (Array.isArray(customerContacts)) {
        for (const contact of customerContacts) {
          const __ins10 = pgInsertClause({
            finance_id: finance_id,
            customer_id: customerId,
            contact_type: 'customer',
            type: contact.type || 'mobile',
            number: contact.number
          });
          await conn.query(
            `INSERT INTO contacts (${__ins10.columns}) VALUES (${__ins10.placeholders}) ON CONFLICT DO NOTHING`,
            __ins10.values
          );
        }
      }

      // 5. Insert guardian (without normalized photo and work phone columns)
      const guardianResultIns = pgInsertClause({
        finance_id: finance_id,
        customer_id: customerId,
        gname: guardian.gname || null,
        gfname_value: guardian.gfname?.value || null,
        gfname_unit: guardian.gfname?.unit || null,
        aadhar_id: guardian.aadhar_id || null,
        other_govt_id_type: guardian.other_govt_id_type || null,
        other_govt_id_number: guardian.other_govt_id_number || null,
        profession: guardian.profession || null,
        remarks: guardian.remarks || null,
        work_office_address: guardian.work_office_address || null
      });
      const { rows: guardianResult } = await conn.query(
        `INSERT INTO guardians (${guardianResultIns.columns}) VALUES (${guardianResultIns.placeholders}) RETURNING id`,
        guardianResultIns.values
      );
      const guardianId = guardianResult[0].id;

      // Store guardian photos in kyc_documents
      if (uploadedFiles.guardianPhoto) {
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: guardianId,
          documentType: 'guardian_photo',
          filePath: uploadedFiles.guardianPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      if (uploadedFiles.guardianPropertyPhoto) {
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: guardianId,
          documentType: 'property_photo',
          filePath: uploadedFiles.guardianPropertyPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }
      // Store guardian work office phone in contacts
      if (guardian.work_office_phone) {
        await saveWorkContact(conn, {
          customerId: customerId,
          contactType: 'guardian',
          number: guardian.work_office_phone,
          financeId: finance_id
        });
      }

      // 6. Insert guardian contacts
      const guardianContacts = guardian.gcontacts || [];
      if (Array.isArray(guardianContacts)) {
        for (const contact of guardianContacts) {
          const __ins11 = pgInsertClause({
            finance_id: finance_id,
            customer_id: customerId,
            contact_type: 'guardian',
            type: contact.type || 'mobile',
            number: contact.number
          });
          await conn.query(
            `INSERT INTO contacts (${__ins11.columns}) VALUES (${__ins11.placeholders}) ON CONFLICT DO NOTHING`,
            __ins11.values
          );
        }
      }

      // 7. Insert guardian address if provided
      let guardianAddressId = null;
      if (guardian.gaddress) {
        const gLat = parseCoordinate(guardian.gaddress.latitude);
        const gLng = parseCoordinate(guardian.gaddress.longitude);
        const addressResultIns = pgInsertClause({
          house_no: guardian.gaddress.house_no || null,
          street: guardian.gaddress.street || null,
          street_name: guardian.gaddress.street_name || null,
          village: guardian.gaddress.village || null,
          land_mark: guardian.gaddress.land_mark || null,
          address: guardian.gaddress.address || null,
          city: guardian.gaddress.city || null,
          district: guardian.gaddress.district || null,
          state: guardian.gaddress.state || null,
          pincode: guardian.gaddress.pincode || null,
          location: guardian.gaddress.location || null,
          latitude: gLat,
          longitude: gLng
        });
        const { rows: addressResult } = await conn.query(
          `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
          addressResultIns.values
        );
        guardianAddressId = addressResult[0].id;

        // Insert into address_history
        const __ins12 = pgInsertClause({
          entity_type: 'guardian',
          entity_id: customerId,
          address_id: guardianAddressId,
          is_current: 1
        });
        await conn.query(
          `INSERT INTO address_history (${__ins12.columns}) VALUES (${__ins12.placeholders})`,
          __ins12.values
        );
      }

      // 8. Insert loan (with relational vehicle_id)
      const __ins13 = pgInsertClause({
        finance_id: finance_id,
        customer_id: customerId,
        vehicle_id: vehicleId,
        loan_type: loan.loan_type || null,
        hpAmount: loan.hpAmount || 0,
        hpDate: loan.hpDate || null,
        due_date: loan.due_date || null,
        dueMonth: loan.dueMonth || 0,
        interestRate: loan.interestRate || 0,
        penaltyAmount: loan.penaltyAmount || 0,
        principle_part: loan.principle_part || 0,
        interest_part: loan.interest_part || 0,
        dueAmount: loan.dueAmount || 0,
        down_payment: loan.down_payment || 0,
        net_payment: loan.net_payment || 0,
        net_payable: loan.net_payable || 0,
        pay_mode_1_amount: loan.pay_mode_1_amount || 0,
        hand_loan: loan.hand_loan || 0,
        hand_loan_remarks: loan.hand_loan_remarks || null,
        broker_name: loan.broker_name || null,
        dealer_name: loan.dealer_name || null,
        documentation_charge: loan.documentation_charge || 0,
        broker_commission: loan.broker_commission || 0,
        remarks: loan.remarks || null
      });
      await conn.query(
        `INSERT INTO loans (${__ins13.columns}) VALUES (${__ins13.placeholders})`,
        __ins13.values
      );

      // 9. Log customer creation activity
      const __ins14 = pgInsertClause({
        finance_id: finance_id,
        type: 'customer',
        reference_id: customer.hplno,
        description: `New customer added: ${customer.cname} with vehicle ${vehicle.vehicle_number || vehicle.vehicleNumber}`,
        amount: loan.hpAmount || 0,
        created_by: req.user?.user_name || 'System'
      });
      await conn.query(
        `INSERT INTO recent_activity (${__ins14.columns}) VALUES (${__ins14.placeholders})`,
        __ins14.values
      );

      await conn.query('COMMIT');

      res.json({
        success: true,
        customerId: customer.hplno,
        vehicleId: vehicleId,
        message: 'Customer created successfully with vehicle',
        uploadedFiles: uploadedFiles
      });
    } catch (err) {
      await conn.query('ROLLBACK');
      console.error('Transaction error:', err);
      throw err;
    }
  } catch (parseErr) {
    console.error('Customer creation error:', parseErr);
    res.status(parseErr.status || 400).json({
      success: false,
      error: parseErr.message || 'Invalid request data',
      details: parseErr.message
    });
  } finally {
    conn.release();
  }
});






// UPDATE endpoint for Consulting customers (doesn't update vehicle_detail)
router.put('/consulting/:customerId', enhancedCheckFinance, upload.fields([
  { name: 'customerPhoto', maxCount: 1 },
  { name: 'customerVehiclePhoto', maxCount: 1 },
  { name: 'vehiclePhoto', maxCount: 1 },
  { name: 'customerPropertyPhoto', maxCount: 1 },
  { name: 'guardianPhoto', maxCount: 1 },
  { name: 'guardianPropertyPhoto', maxCount: 1 }
]), async (req, res) => {
  const conn = await db.connect();

  try {
    await conn.query('BEGIN');

    const finance_id = req.financeId;
    const customerId = req.params.customerId;

    // First verify the customer belongs to this finance (supports UUID and HPL number)
    const { rows: customerCheck } = await conn.query(
      'SELECT id, hplno, vehicle_id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2',
      [customerId, finance_id]
    );

    if (customerCheck.length === 0) {
      await conn.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Customer not found or not authorized'
      });
    }

    const actualCustomerId = customerCheck[0].id;
    const customerHplno = customerCheck[0].hplno;

    // Get current customer and guardian photos from kyc_documents
    const { rows: currentCustomerDocs } = await conn.query(
      `SELECT document_type, file_path FROM kyc_documents 
       WHERE entity_type = 'customer' AND entity_id = $1 AND is_current = true`,
      [actualCustomerId.toString()]
    );
    const currentCustomerPhotos = currentCustomerDocs.reduce((acc, row) => {
      acc[row.document_type] = row.file_path;
      return acc;
    }, {});

    const { rows: currentGuardianRows } = await conn.query(
      'SELECT id FROM guardians WHERE customer_id = $1 LIMIT 1',
      [actualCustomerId]
    );
    const currentGuardianId = currentGuardianRows[0]?.id;
    let currentGuardianPhotos = {};
    if (currentGuardianId) {
      const { rows: currentGuardianDocs } = await conn.query(
        `SELECT document_type, file_path FROM kyc_documents 
         WHERE entity_type = 'guardian' AND entity_id = $1 AND is_current = true`,
        [currentGuardianId.toString()]
      );
      currentGuardianPhotos = currentGuardianDocs.reduce((acc, row) => {
        acc[row.document_type] = row.file_path;
        return acc;
      }, {});
    }

    // Parse all data from request safely
    const customer = typeof req.body.customer === 'string' ? JSON.parse(req.body.customer) : (req.body.customer || null);
    const guardian = typeof req.body.guardian === 'string' ? JSON.parse(req.body.guardian) : (req.body.guardian || null);
    const loan = typeof req.body.loan === 'string' ? JSON.parse(req.body.loan) : (req.body.loan || null);
    const vehicle = typeof req.body.vehicle === 'string' ? JSON.parse(req.body.vehicle) : (req.body.vehicle || null);

    // Validate required fields
    if (!customer || !customer.hplno || !customer.cname) {
      throw new Error('Missing required customer fields');
    }

    // Handle file uploads to S3
    let uploadedFiles = {};
    if (req.files) {
      uploadedFiles = await handleFileUploads(req.files, customer.hplno);
    }

    const validGovtIdTypes = ['pan_card', 'voter_id', 'driving_license', 'other'];
    const validLoanStatuses = ['active', 'close', 'seized'];

    // Prepare customer update data (excluding normalized photo and work phone columns)
    const customerUpdateData = {
      hplno: parseInt(customer.hplno, 10) || customerHplno,
      loanStatus: validLoanStatuses.includes(customer.loanStatus) ? customer.loanStatus : 'active',
      brokerName: customer.brokerName || null,
      cname: customer.cname,
      cfname_value: customer.cfname?.value || null,
      cfname_unit: customer.cfname?.unit || null,
      aadhar_id: (customer.aadhar_id && String(customer.aadhar_id).trim()) ? String(customer.aadhar_id).trim() : null,
      other_govt_id_type: validGovtIdTypes.includes(customer.other_govt_id_type) ? customer.other_govt_id_type : null,
      other_govt_id_number: customer.other_govt_id_number || null,
      profession: customer.profession || null,
      work_office_address: customer.work_office_address || null
    };

    // Update vehicle_id if provided
    const targetVehId = (vehicle && vehicle.id) ? vehicle.id : customerCheck[0].vehicle_id;
    if (targetVehId) {
      customerUpdateData.vehicle_id = targetVehId;
    }

    // Update customer images in kyc_documents
    if (uploadedFiles.customerPhoto) {
      if (currentCustomerPhotos.customer_photo) {
        try {
          await deleteFromS3(currentCustomerPhotos.customer_photo);
        } catch (error) {
          console.error('Error deleting old customer photo:', error);
        }
      }
      await saveKycDocument(conn, {
        entityType: 'customer',
        entityId: actualCustomerId,
        documentType: 'customer_photo',
        filePath: uploadedFiles.customerPhoto,
        uploadedBy: req.user?.id || req.user?.user_name || null,
        uploadedByType: 'staff'
      });
    }

    if (uploadedFiles.customerPropertyPhoto) {
      if (currentCustomerPhotos.property_photo) {
        try {
          await deleteFromS3(currentCustomerPhotos.property_photo);
        } catch (error) {
          console.error('Error deleting old customer property photo:', error);
        }
      }
      await saveKycDocument(conn, {
        entityType: 'customer',
        entityId: actualCustomerId,
        documentType: 'property_photo',
        filePath: uploadedFiles.customerPropertyPhoto,
        uploadedBy: req.user?.id || req.user?.user_name || null,
        uploadedByType: 'staff'
      });
    }

    const vehPhotoObj = uploadedFiles.customerVehiclePhoto || uploadedFiles.vehiclePhoto;
    if (vehPhotoObj) {
      await saveKycDocument(conn, {
        entityType: 'customer',
        entityId: actualCustomerId,
        documentType: 'vehicle_photo',
        filePath: vehPhotoObj,
        uploadedBy: req.user?.id || req.user?.user_name || null,
        uploadedByType: 'staff'
      });
    }

    // Store vehicle photo if provided
    const vehPhotoUrl = getFileUrl(uploadedFiles.vehiclePhoto) || getFileUrl(uploadedFiles.customerVehiclePhoto);
    if (vehPhotoUrl && customerCheck[0].vehicle_id) {
      await saveVehicleMedia(conn, {
        financeId: finance_id,
        vehicleId: customerCheck[0].vehicle_id,
        mediaUrl: vehPhotoUrl,
        mediaType: 'front',
        isPrimary: 1
      });
    }

    // 1. Update customer
    const customerUpdateDataUpd = pgSetClause(customerUpdateData);
    await conn.query(
      `UPDATE customers SET ${customerUpdateDataUpd.clause} WHERE id = $${customerUpdateDataUpd.values.length + 1} AND finance_id = $${customerUpdateDataUpd.values.length + 2}`,
      [...customerUpdateDataUpd.values, actualCustomerId, finance_id]
    );

    // 2. Handle customer address update with history tracking
    if (customer.caddress && Object.keys(customer.caddress).length > 0) {
      // Check if address has any non-empty values
      const hasAddressData = Object.values(customer.caddress).some(val => val && val.toString().trim() !== '');

      if (hasAddressData) {
        // Mark old customer address as not current
        await conn.query(
          `UPDATE address_history 
           SET is_current = 0, changed_at = CURRENT_TIMESTAMP 
           WHERE entity_type = 'customer' 
           AND entity_id = $1::text 
           AND is_current = 1`,
          [actualCustomerId]
        );

        // Insert new address
        const cLat = parseCoordinate(customer.caddress.latitude);
        const cLng = parseCoordinate(customer.caddress.longitude);
        const addressResultIns = pgInsertClause({
          house_no: customer.caddress.house_no || null,
          street: customer.caddress.street || null,
          street_name: customer.caddress.street_name || null,
          village: customer.caddress.village || null,
          land_mark: customer.caddress.land_mark || null,
          address: customer.caddress.address || null,
          city: customer.caddress.city || null,
          district: customer.caddress.district || null,
          state: customer.caddress.state || null,
          pincode: customer.caddress.pincode || null,
          location: customer.caddress.location || null,
          latitude: cLat,
          longitude: cLng
        });
        const { rows: addressResult } = await conn.query(
          `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
          addressResultIns.values
        );

        if (cLat !== null || cLng !== null) {
          await conn.query(
            `UPDATE customers SET home_latitude = $1, home_longitude = $2 WHERE id = $3`,
            [cLat, cLng, actualCustomerId]
          );
        }

        // Insert new address history record
        const __ins15 = pgInsertClause({
          entity_type: 'customer',
          entity_id: actualCustomerId,
          address_id: addressResult[0].id,
          is_current: 1
        });
        await conn.query(
          `INSERT INTO address_history (${__ins15.columns}) VALUES (${__ins15.placeholders})`,
          __ins15.values
        );
      }
    }

    // 3. Update contacts - delete existing and insert new
    await conn.query(
      'DELETE FROM contacts WHERE customer_id = $1 AND finance_id = $2',
      [actualCustomerId, finance_id]
    );

    // Insert customer contacts
    if (customer.ccontacts && Array.isArray(customer.ccontacts)) {
      for (const contact of customer.ccontacts) {
        if (contact.number && String(contact.number).trim()) {
          const __ins16 = pgInsertClause({
            finance_id: finance_id,
            customer_id: actualCustomerId,
            contact_type: 'customer',
            type: sanitizeContactNumberType(contact.type),
            number: String(contact.number).trim()
          });
          await conn.query(
            `INSERT INTO contacts (${__ins16.columns}) VALUES (${__ins16.placeholders})
             ON CONFLICT (customer_id, number, contact_type)
             DO UPDATE SET type = EXCLUDED.type, finance_id = EXCLUDED.finance_id`,
            __ins16.values
          );
        }
      }
    }

    // Update customer work office phone in contacts
    if (customer.work_office_phone && String(customer.work_office_phone).trim()) {
      await saveWorkContact(conn, {
        customerId: actualCustomerId,
        contactType: 'customer',
        number: customer.work_office_phone,
        financeId: finance_id
      });
    }

    // 4. Update guardian
    if (guardian && guardian.gname) {
      const guardianUpdateData = {
        gname: guardian.gname,
        gfname_value: guardian.gfname?.value || null,
        gfname_unit: guardian.gfname?.unit || null,
        aadhar_id: guardian.aadhar_id || null,
        other_govt_id_type: guardian.other_govt_id_type || null,
        other_govt_id_number: guardian.other_govt_id_number || null,
        profession: guardian.profession || null,
        remarks: guardian.remarks || null,
        work_office_address: guardian.work_office_address || null
      };

      const { rows: existingGuardian } = await conn.query(
        'SELECT id FROM guardians WHERE customer_id = $1',
        [actualCustomerId]
      );
      let guardianId = existingGuardian[0]?.id;

      if (guardianId) {
        const guardianUpdateDataUpd = pgSetClause(guardianUpdateData);
        await conn.query(
          `UPDATE guardians SET ${guardianUpdateDataUpd.clause} WHERE id = $${guardianUpdateDataUpd.values.length + 1}`,
          [...guardianUpdateDataUpd.values, guardianId]
        );
      } else {
        const __ins17 = pgInsertClause({
          finance_id: finance_id,
          customer_id: actualCustomerId,
          ...guardianUpdateData
        });
        const { rows: newGuard } = await conn.query(
          `INSERT INTO guardians (${__ins17.columns}) VALUES (${__ins17.placeholders}) RETURNING id`,
          __ins17.values
        );
        guardianId = newGuard[0]?.id;
      }

      // Update guardian images in kyc_documents
      if (guardianId && uploadedFiles.guardianPhoto) {
        if (currentGuardianPhotos.guardian_photo) {
          try {
            await deleteFromS3(currentGuardianPhotos.guardian_photo);
          } catch (error) {
            console.error('Error deleting old guardian photo:', error);
          }
        }
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: guardianId,
          documentType: 'guardian_photo',
          filePath: uploadedFiles.guardianPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }

      if (guardianId && uploadedFiles.guardianPropertyPhoto) {
        if (currentGuardianPhotos.property_photo) {
          try {
            await deleteFromS3(currentGuardianPhotos.property_photo);
          } catch (error) {
            console.error('Error deleting old guardian property photo:', error);
          }
        }
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: guardianId,
          documentType: 'property_photo',
          filePath: uploadedFiles.guardianPropertyPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }

      // 5. Handle guardian address update with history tracking
      if (guardian.gaddress && Object.keys(guardian.gaddress).length > 0) {
        const hasAddressData = Object.values(guardian.gaddress).some(val => val && val.toString().trim() !== '');

        if (hasAddressData && guardianId) {
          // Mark old guardian address as not current
          await conn.query(
            `UPDATE address_history 
             SET is_current = 0, changed_at = CURRENT_TIMESTAMP 
             WHERE entity_type = 'guardian' 
             AND entity_id = $1::text 
             AND is_current = 1`,
            [guardianId.toString()]
          );

          // Insert new address
          const gLat = parseCoordinate(guardian.gaddress.latitude);
          const gLng = parseCoordinate(guardian.gaddress.longitude);
          const addressResultIns = pgInsertClause({
            house_no: guardian.gaddress.house_no || null,
            street: guardian.gaddress.street || null,
            street_name: guardian.gaddress.street_name || null,
            village: guardian.gaddress.village || null,
            land_mark: guardian.gaddress.land_mark || null,
            address: guardian.gaddress.address || null,
            city: guardian.gaddress.city || null,
            district: guardian.gaddress.district || null,
            state: guardian.gaddress.state || null,
            pincode: guardian.gaddress.pincode || null,
            location: guardian.gaddress.location || null,
            latitude: gLat,
            longitude: gLng
          });
          const { rows: addressResult } = await conn.query(
            `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
            addressResultIns.values
          );

          // Insert new address history record
          const __ins18 = pgInsertClause({
            entity_type: 'guardian',
            entity_id: guardianId.toString(),
            address_id: addressResult[0].id,
            is_current: 1
          });
          await conn.query(
            `INSERT INTO address_history (${__ins18.columns}) VALUES (${__ins18.placeholders})`,
            __ins18.values
          );
        }
      }

      // 6. Insert guardian contacts
      if (guardian.gcontacts && Array.isArray(guardian.gcontacts)) {
        for (const contact of guardian.gcontacts) {
          if (contact.number && String(contact.number).trim()) {
            const __ins19 = pgInsertClause({
              finance_id: finance_id,
              customer_id: actualCustomerId,
              contact_type: 'guardian',
              type: sanitizeContactNumberType(contact.type),
              number: String(contact.number).trim()
            });
            await conn.query(
              `INSERT INTO contacts (${__ins19.columns}) VALUES (${__ins19.placeholders})
               ON CONFLICT (customer_id, number, contact_type)
               DO UPDATE SET type = EXCLUDED.type, finance_id = EXCLUDED.finance_id`,
              __ins19.values
            );
          }
        }
      }

      // Update guardian work office phone in contacts
      if (guardian.work_office_phone && String(guardian.work_office_phone).trim()) {
        await saveWorkContact(conn, {
          customerId: actualCustomerId,
          contactType: 'guardian',
          number: guardian.work_office_phone,
          financeId: finance_id
        });
      }
    }

    // 7. Update loan
    if (loan && (loan.hpAmount !== undefined || loan.hp_amount !== undefined || loan.loan_type)) {
      const loanUpdateData = {
        loan_type: loan.loan_type || 'HP',
        hpAmount: parseFloat(loan.hpAmount ?? loan.hp_amount) || 0,
        hpDate: loan.hpDate || loan.hp_date || null,
        due_date: loan.due_date || loan.dueDate || null,
        dueMonth: parseInt(loan.dueMonth ?? loan.due_month, 10) || 0,
        interestRate: parseFloat(loan.interestRate ?? loan.interest_rate) || 0,
        penaltyAmount: parseFloat(loan.penaltyAmount ?? loan.penalty_amount) || 0,
        penalty_days: parseInt(loan.penalty_days ?? loan.penaltyDays, 10) || 0,
        principle_part: parseFloat(loan.principle_part ?? loan.principlePart) || 0,
        interest_part: parseFloat(loan.interest_part ?? loan.interestPart) || 0,
        dueAmount: parseFloat(loan.dueAmount ?? loan.due_amount) || 0,
        down_payment: parseFloat(loan.down_payment ?? loan.downPayment) || 0,
        net_payment: parseFloat(loan.net_payment ?? loan.netPayment) || 0,
        net_payable: parseFloat(loan.net_payable ?? loan.netPayable) || 0,
        pay_mode_1_amount: parseFloat(loan.pay_mode_1_amount ?? loan.payMode1Amount) || 0,
        hand_loan: parseFloat(loan.hand_loan ?? loan.handLoan) || 0,
        hand_loan_remarks: loan.hand_loan_remarks || loan.handLoanRemarks || null,
        broker_name: loan.broker_name || loan.brokerName || null,
        dealer_name: loan.dealer_name || loan.dealerName || null,
        documentation_charge: parseFloat(loan.documentation_charge ?? loan.documentationCharge) || 0,
        broker_commission: parseFloat(loan.broker_commission ?? loan.brokerCommission) || 0,
        remarks: loan.remarks || null
      };

      const { rows: existingLoan } = await conn.query(
        'SELECT id FROM loans WHERE customer_id = $1',
        [actualCustomerId]
      );

      if (existingLoan.length > 0) {
        const loanUpdateDataUpd = pgSetClause(loanUpdateData);
        await conn.query(
          `UPDATE loans SET ${loanUpdateDataUpd.clause} WHERE customer_id = $${loanUpdateDataUpd.values.length + 1}`,
          [...loanUpdateDataUpd.values, actualCustomerId]
        );
      } else {
        const __ins20 = pgInsertClause({
          finance_id: finance_id,
          customer_id: actualCustomerId,
          ...loanUpdateData
        });
        await conn.query(
          `INSERT INTO loans (${__ins20.columns}) VALUES (${__ins20.placeholders})`,
          __ins20.values
        );
      }
    }

    // 8. Log activity
    const __ins21 = pgInsertClause({
      finance_id: finance_id,
      type: 'customer',
      reference_id: String(customer.hplno),
      description: `Customer updated: ${customer.cname}`,
      created_by: req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins21.columns}) VALUES (${__ins21.placeholders})`,
      __ins21.values
    );

    await conn.query('COMMIT');

    res.json({
      success: true,
      message: 'Customer updated successfully',
      uploadedFiles: uploadedFiles
    });

  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('Error updating customer:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      message: 'Failed to update customer'
    });
  } finally {
    conn.release();
  }
});

// UPDATE endpoint for Finance customers (updates vehicle_detail as well)
const customerUploadFields = upload.fields([
  { name: 'customerPhoto', maxCount: 1 },
  { name: 'customerVehiclePhoto', maxCount: 1 },
  { name: 'vehiclePhoto', maxCount: 1 },
  { name: 'customerPropertyPhoto', maxCount: 1 },
  { name: 'guardianPhoto', maxCount: 1 },
  { name: 'guardianPropertyPhoto', maxCount: 1 }
]);

const updateFinanceCustomerHandler = async (req, res) => {
  const conn = await db.connect();

  try {
    await conn.query('BEGIN');

    const finance_id = req.financeId;
    const customerId = req.params.customerId;
    console.log('Request body:', req.body);
    // First verify the customer belongs to this finance (supports UUID and HPL number)
    const { rows: customerCheck } = await conn.query(
      'SELECT id, hplno, vehicle_id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2',
      [customerId, finance_id]
    );

    if (customerCheck.length === 0) {
      await conn.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Customer not found or not authorized'
      });
    }

    const actualCustomerId = customerCheck[0].id;
    const customerHplno = customerCheck[0].hplno;
    const currentVehicleId = customerCheck[0].vehicle_id;

    // Get current customer and guardian photos from kyc_documents
    const { rows: currentCustomerDocs } = await conn.query(
      `SELECT document_type, file_path FROM kyc_documents 
       WHERE entity_type = 'customer' AND entity_id = $1 AND is_current = true`,
      [actualCustomerId.toString()]
    );
    const currentCustomerPhotos = currentCustomerDocs.reduce((acc, row) => {
      acc[row.document_type] = row.file_path;
      return acc;
    }, {});

    const { rows: currentGuardianRows } = await conn.query(
      'SELECT id FROM guardians WHERE customer_id = $1 LIMIT 1',
      [actualCustomerId]
    );
    const currentGuardianId = currentGuardianRows[0]?.id;
    let currentGuardianPhotos = {};
    if (currentGuardianId) {
      const { rows: currentGuardianDocs } = await conn.query(
        `SELECT document_type, file_path FROM kyc_documents 
         WHERE entity_type = 'guardian' AND entity_id = $1 AND is_current = true`,
        [currentGuardianId.toString()]
      );
      currentGuardianPhotos = currentGuardianDocs.reduce((acc, row) => {
        acc[row.document_type] = row.file_path;
        return acc;
      }, {});
    }

    // Parse all data from request safely
    const customer = typeof req.body.customer === 'string' ? JSON.parse(req.body.customer) : (req.body.customer || null);
    const guardian = typeof req.body.guardian === 'string' ? JSON.parse(req.body.guardian) : (req.body.guardian || null);
    const loan = typeof req.body.loan === 'string' ? JSON.parse(req.body.loan) : (req.body.loan || null);
    const vehicle = typeof req.body.vehicle === 'string' ? JSON.parse(req.body.vehicle) : (req.body.vehicle || null);

    // Validate required fields
    if (!customer || !customer.hplno || !customer.cname) {
      throw new Error('Missing required customer fields');
    }

    // Handle file uploads to S3
    let uploadedFiles = {};
    if (req.files) {
      uploadedFiles = await handleFileUploads(req.files, customer.hplno);
    }

    const validGovtIdTypes = ['pan_card', 'voter_id', 'driving_license', 'other'];
    const validLoanStatuses = ['active', 'close', 'seized'];

    // Prepare customer update data (excluding normalized photo and work phone columns)
    const customerUpdateData = {
      hplno: parseInt(customer.hplno, 10) || customerHplno,
      loanStatus: validLoanStatuses.includes(customer.loanStatus) ? customer.loanStatus : 'active',
      brokerName: customer.brokerName || null,
      cname: customer.cname,
      cfname_value: customer.cfname?.value || null,
      cfname_unit: customer.cfname?.unit || null,
      aadhar_id: (customer.aadhar_id && String(customer.aadhar_id).trim()) ? String(customer.aadhar_id).trim() : null,
      other_govt_id_type: validGovtIdTypes.includes(customer.other_govt_id_type) ? customer.other_govt_id_type : null,
      other_govt_id_number: customer.other_govt_id_number || null,
      profession: customer.profession || null,
      work_office_address: customer.work_office_address || null
    };

    // Update vehicle_id if provided
    const targetVehId = (vehicle && vehicle.id) ? vehicle.id : currentVehicleId;
    if (targetVehId) {
      customerUpdateData.vehicle_id = targetVehId;
    }

    // Update customer images in kyc_documents
    if (uploadedFiles.customerPhoto) {
      if (currentCustomerPhotos.customer_photo) {
        try {
          await deleteFromS3(currentCustomerPhotos.customer_photo);
        } catch (error) {
          console.error('Error deleting old customer photo:', error);
        }
      }
      await saveKycDocument(conn, {
        entityType: 'customer',
        entityId: actualCustomerId,
        documentType: 'customer_photo',
        filePath: uploadedFiles.customerPhoto,
        uploadedBy: req.user?.id || req.user?.user_name || null,
        uploadedByType: 'staff'
      });
    }

    if (uploadedFiles.customerPropertyPhoto) {
      if (currentCustomerPhotos.property_photo) {
        try {
          await deleteFromS3(currentCustomerPhotos.property_photo);
        } catch (error) {
          console.error('Error deleting old customer property photo:', error);
        }
      }
      await saveKycDocument(conn, {
        entityType: 'customer',
        entityId: actualCustomerId,
        documentType: 'property_photo',
        filePath: uploadedFiles.customerPropertyPhoto,
        uploadedBy: req.user?.id || req.user?.user_name || null,
        uploadedByType: 'staff'
      });
    }

    const vehPhotoObj = uploadedFiles.customerVehiclePhoto || uploadedFiles.vehiclePhoto;
    if (vehPhotoObj) {
      await saveKycDocument(conn, {
        entityType: 'customer',
        entityId: actualCustomerId,
        documentType: 'vehicle_photo',
        filePath: vehPhotoObj,
        uploadedBy: req.user?.id || req.user?.user_name || null,
        uploadedByType: 'staff'
      });
    }

    // Store vehicle photo directly in vehicle_media
    const vehPhotoUrl = getFileUrl(uploadedFiles.vehiclePhoto) || getFileUrl(uploadedFiles.customerVehiclePhoto);
    if (vehPhotoUrl && targetVehId) {
      await saveVehicleMedia(conn, {
        financeId: finance_id,
        vehicleId: targetVehId,
        mediaUrl: vehPhotoUrl,
        mediaType: 'front',
        isPrimary: 1
      });
    }

    // 1. Update customer
    const customerUpdateDataUpd = pgSetClause(customerUpdateData);
    await conn.query(
      `UPDATE customers SET ${customerUpdateDataUpd.clause} WHERE id = $${customerUpdateDataUpd.values.length + 1} AND finance_id = $${customerUpdateDataUpd.values.length + 2}`,
      [...customerUpdateDataUpd.values, actualCustomerId, finance_id]
    );

    // 2. Handle customer address update with history tracking
    if (customer.caddress && Object.keys(customer.caddress).length > 0) {
      // Check if address has any non-empty values
      const hasAddressData = Object.values(customer.caddress).some(val => val && val.toString().trim() !== '');

      if (hasAddressData) {
        // Mark old customer address as not current
        await conn.query(
          `UPDATE address_history 
           SET is_current = 0, changed_at = CURRENT_TIMESTAMP 
           WHERE entity_type = 'customer' 
           AND entity_id = $1::text 
           AND is_current = 1`,
          [actualCustomerId]
        );

        // Insert new address
        const cLat = parseCoordinate(customer.caddress.latitude);
        const cLng = parseCoordinate(customer.caddress.longitude);
        const addressResultIns = pgInsertClause({
          house_no: customer.caddress.house_no || null,
          street: customer.caddress.street || null,
          street_name: customer.caddress.street_name || null,
          village: customer.caddress.village || null,
          land_mark: customer.caddress.land_mark || null,
          address: customer.caddress.address || null,
          city: customer.caddress.city || null,
          district: customer.caddress.district || null,
          state: customer.caddress.state || null,
          pincode: customer.caddress.pincode || null,
          location: customer.caddress.location || null,
          latitude: cLat,
          longitude: cLng
        });
        const { rows: addressResult } = await conn.query(
          `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
          addressResultIns.values
        );

        if (cLat !== null || cLng !== null) {
          await conn.query(
            `UPDATE customers SET home_latitude = $1, home_longitude = $2 WHERE id = $3`,
            [cLat, cLng, actualCustomerId]
          );
        }

        // Insert new address history record
        const __ins22 = pgInsertClause({
          entity_type: 'customer',
          entity_id: actualCustomerId,
          address_id: addressResult[0].id,
          is_current: 1
        });
        await conn.query(
          `INSERT INTO address_history (${__ins22.columns}) VALUES (${__ins22.placeholders})`,
          __ins22.values
        );
      }
    }

    // 3. Update contacts - delete existing and insert new
    await conn.query(
      'DELETE FROM contacts WHERE customer_id = $1 AND finance_id = $2',
      [actualCustomerId, finance_id]
    );

    // Insert customer contacts
    if (customer.ccontacts && Array.isArray(customer.ccontacts)) {
      for (const contact of customer.ccontacts) {
        if (contact.number && String(contact.number).trim()) {
          const __ins23 = pgInsertClause({
            finance_id: finance_id,
            customer_id: actualCustomerId,
            contact_type: 'customer',
            type: sanitizeContactNumberType(contact.type),
            number: String(contact.number).trim()
          });
          await conn.query(
            `INSERT INTO contacts (${__ins23.columns}) VALUES (${__ins23.placeholders})
             ON CONFLICT (customer_id, number, contact_type)
             DO UPDATE SET type = EXCLUDED.type, finance_id = EXCLUDED.finance_id`,
            __ins23.values
          );
        }
      }
    }

    // Update customer work office phone in contacts
    if (customer.work_office_phone && String(customer.work_office_phone).trim()) {
      await saveWorkContact(conn, {
        customerId: actualCustomerId,
        contactType: 'customer',
        number: customer.work_office_phone,
        financeId: finance_id
      });
    }

    // 4. Update guardian
    if (guardian && guardian.gname) {
      const guardianUpdateData = {
        gname: guardian.gname,
        gfname_value: guardian.gfname?.value || null,
        gfname_unit: guardian.gfname?.unit || null,
        aadhar_id: guardian.aadhar_id || null,
        other_govt_id_type: guardian.other_govt_id_type || null,
        other_govt_id_number: guardian.other_govt_id_number || null,
        profession: guardian.profession || null,
        remarks: guardian.remarks || null,
        work_office_address: guardian.work_office_address || null
      };

      const { rows: existingGuardian } = await conn.query(
        'SELECT id FROM guardians WHERE customer_id = $1',
        [actualCustomerId]
      );

      let targetGuardianId;
      if (existingGuardian.length > 0) {
        targetGuardianId = existingGuardian[0].id;
        const guardianUpdateDataUpd = pgSetClause(guardianUpdateData);
        await conn.query(
          `UPDATE guardians SET ${guardianUpdateDataUpd.clause} WHERE customer_id = $${guardianUpdateDataUpd.values.length + 1}`,
          [...guardianUpdateDataUpd.values, actualCustomerId]
        );
      } else {
        const __ins24 = pgInsertClause({
          finance_id: finance_id,
          customer_id: actualCustomerId,
          ...guardianUpdateData
        });
        const { rows: newG } = await conn.query(
          `INSERT INTO guardians (${__ins24.columns}) VALUES (${__ins24.placeholders}) RETURNING id`,
          __ins24.values
        );
        targetGuardianId = newG[0]?.id;
      }

      // Update guardian images in kyc_documents
      if (uploadedFiles.guardianPhoto && targetGuardianId) {
        if (currentGuardianPhotos?.guardian_photo) {
          try {
            await deleteFromS3(currentGuardianPhotos.guardian_photo);
          } catch (error) {
            console.error('Error deleting old guardian photo:', error);
          }
        }
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: targetGuardianId,
          documentType: 'guardian_photo',
          filePath: uploadedFiles.guardianPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }

      if (uploadedFiles.guardianPropertyPhoto && targetGuardianId) {
        if (currentGuardianPhotos?.property_photo || currentGuardianPhotos?.guardian_property_photo) {
          try {
            await deleteFromS3(currentGuardianPhotos.property_photo || currentGuardianPhotos.guardian_property_photo);
          } catch (error) {
            console.error('Error deleting old guardian property photo:', error);
          }
        }
        await saveKycDocument(conn, {
          entityType: 'guardian',
          entityId: targetGuardianId,
          documentType: 'property_photo',
          filePath: uploadedFiles.guardianPropertyPhoto,
          uploadedBy: req.user?.id || req.user?.user_name || null,
          uploadedByType: 'staff'
        });
      }

      // 5. Handle guardian address update with history tracking
      if (guardian.gaddress && Object.keys(guardian.gaddress).length > 0) {
        const hasAddressData = Object.values(guardian.gaddress).some(val => val && val.toString().trim() !== '');

        if (hasAddressData && targetGuardianId) {
          // Mark old guardian address as not current
          await conn.query(
            `UPDATE address_history 
             SET is_current = 0, changed_at = CURRENT_TIMESTAMP 
             WHERE entity_type = 'guardian' 
             AND entity_id = $1::text 
             AND is_current = 1`,
            [targetGuardianId.toString()]
          );

          // Insert new address
          const gLat = parseCoordinate(guardian.gaddress.latitude);
          const gLng = parseCoordinate(guardian.gaddress.longitude);
          const addressResultIns = pgInsertClause({
            house_no: guardian.gaddress.house_no || null,
            street: guardian.gaddress.street || null,
            street_name: guardian.gaddress.street_name || null,
            village: guardian.gaddress.village || null,
            land_mark: guardian.gaddress.land_mark || null,
            address: guardian.gaddress.address || null,
            city: guardian.gaddress.city || null,
            district: guardian.gaddress.district || null,
            state: guardian.gaddress.state || null,
            pincode: guardian.gaddress.pincode || null,
            location: guardian.gaddress.location || null,
            latitude: gLat,
            longitude: gLng
          });
          const { rows: addressResult } = await conn.query(
            `INSERT INTO addresses (${addressResultIns.columns}) VALUES (${addressResultIns.placeholders}) RETURNING id`,
            addressResultIns.values
          );

          // Insert new address history record
          const __ins25 = pgInsertClause({
            entity_type: 'guardian',
            entity_id: targetGuardianId.toString(),
            address_id: addressResult[0].id,
            is_current: 1
          });
          await conn.query(
            `INSERT INTO address_history (${__ins25.columns}) VALUES (${__ins25.placeholders})`,
            __ins25.values
          );
        }
      }

      // 6. Insert guardian contacts
      if (guardian.gcontacts && Array.isArray(guardian.gcontacts)) {
        for (const contact of guardian.gcontacts) {
          if (contact.number && String(contact.number).trim()) {
            const __ins26 = pgInsertClause({
              finance_id: finance_id,
              customer_id: actualCustomerId,
              contact_type: 'guardian',
              type: sanitizeContactNumberType(contact.type),
              number: String(contact.number).trim()
            });
            await conn.query(
              `INSERT INTO contacts (${__ins26.columns}) VALUES (${__ins26.placeholders})
               ON CONFLICT (customer_id, number, contact_type)
               DO UPDATE SET type = EXCLUDED.type, finance_id = EXCLUDED.finance_id`,
              __ins26.values
            );
          }
        }
      }

      // Update guardian work office phone in contacts
      if (guardian.work_office_phone && String(guardian.work_office_phone).trim()) {
        await saveWorkContact(conn, {
          customerId: actualCustomerId,
          contactType: 'guardian',
          number: guardian.work_office_phone,
          financeId: finance_id
        });
      }
    }

    // 7. Update loan
    if (loan && (loan.hpAmount !== undefined || loan.hp_amount !== undefined || loan.loan_type)) {
      const loanUpdateData = {
        loan_type: loan.loan_type || 'HP',
        hpAmount: parseFloat(loan.hpAmount ?? loan.hp_amount) || 0,
        hpDate: loan.hpDate || loan.hp_date || null,
        due_date: loan.due_date || loan.dueDate || null,
        dueMonth: parseInt(loan.dueMonth ?? loan.due_month, 10) || 0,
        interestRate: parseFloat(loan.interestRate ?? loan.interest_rate) || 0,
        penaltyAmount: parseFloat(loan.penaltyAmount ?? loan.penalty_amount) || 0,
        penalty_days: parseInt(loan.penalty_days ?? loan.penaltyDays, 10) || 0,
        principle_part: parseFloat(loan.principle_part ?? loan.principlePart) || 0,
        interest_part: parseFloat(loan.interest_part ?? loan.interestPart) || 0,
        dueAmount: parseFloat(loan.dueAmount ?? loan.due_amount) || 0,
        down_payment: parseFloat(loan.down_payment ?? loan.downPayment) || 0,
        net_payment: parseFloat(loan.net_payment ?? loan.netPayment) || 0,
        net_payable: parseFloat(loan.net_payable ?? loan.netPayable) || 0,
        pay_mode_1_amount: parseFloat(loan.pay_mode_1_amount ?? loan.payMode1Amount) || 0,
        hand_loan: parseFloat(loan.hand_loan ?? loan.handLoan) || 0,
        hand_loan_remarks: loan.hand_loan_remarks || loan.handLoanRemarks || null,
        broker_name: loan.broker_name || loan.brokerName || null,
        dealer_name: loan.dealer_name || loan.dealerName || null,
        documentation_charge: parseFloat(loan.documentation_charge ?? loan.documentationCharge) || 0,
        broker_commission: parseFloat(loan.broker_commission ?? loan.brokerCommission) || 0,
        remarks: loan.remarks || null
      };
      if (targetVehId) {
        loanUpdateData.vehicle_id = targetVehId;
      }

      const { rows: existingLoan } = await conn.query(
        'SELECT id FROM loans WHERE customer_id = $1',
        [actualCustomerId]
      );

      if (existingLoan.length > 0) {
        const loanUpdateDataUpd = pgSetClause(loanUpdateData);
        await conn.query(
          `UPDATE loans SET ${loanUpdateDataUpd.clause} WHERE customer_id = $${loanUpdateDataUpd.values.length + 1}`,
          [...loanUpdateDataUpd.values, actualCustomerId]
        );
      } else {
        const __ins27 = pgInsertClause({
          finance_id: finance_id,
          customer_id: actualCustomerId,
          ...loanUpdateData
        });
        await conn.query(
          `INSERT INTO loans (${__ins27.columns}) VALUES (${__ins27.placeholders})`,
          __ins27.values
        );
      }
    }

    // 8. Update or create vehicle if provided
    if (vehicle && (vehicle.id || vehicle.vehicle_number || vehicle.vehicleNumber)) {
      const cleanChassis = (vehicle.chassis_number ?? vehicle.chassisNumber)?.toString().trim();
      const cleanEngine = (vehicle.engine_number ?? vehicle.engineNumber)?.toString().trim();

      let targetVehicleId = vehicle.id || null;
      let vehicleFound = false;

      if (targetVehicleId) {
        const { rows: vehicleExists } = await conn.query(
          'SELECT id FROM vehicle_detail WHERE id = $1 AND finance_id = $2',
          [targetVehicleId, finance_id]
        );
        if (vehicleExists.length > 0) {
          vehicleFound = true;
        }
      }

      const vehicleNum = (vehicle.vehicle_number || vehicle.vehicleNumber || '').toString().trim();

      if (!vehicleFound && vehicleNum) {
        const { rows: numExists } = await conn.query(
          'SELECT id FROM vehicle_detail WHERE LOWER(TRIM(vehicle_number)) = LOWER(TRIM($1)) AND finance_id = $2 LIMIT 1',
          [vehicleNum, finance_id]
        );
        if (numExists.length > 0) {
          targetVehicleId = numExists[0].id;
          vehicleFound = true;
        }
      }

      // Resolve vehicle_info_id using robust catalog resolver
      const resolvedInfoId = await resolveVehicleInfoId(conn, vehicle);

      const vehicleFields = {
        vehicle_number: vehicleNum,
        vehicle_modal: ((vehicle.vehicle_modal || vehicle.modelName || vehicle.vehicleName || vehicle.model_name || '').toString()).slice(0, 10),
        engine_number: cleanEngine ? cleanEngine : null,
        chassis_number: cleanChassis ? cleanChassis : null,
        selling_price: parseFloat(vehicle.selling_price ?? vehicle.sellingPrice) || 0,
        rc_status: vehicle.rc_status || 'not_available',
        rc_holder: vehicle.rc_holder || 'pending',
        remarks: vehicle.remarks || '',
        color: vehicle.color || '',
        variant: vehicle.variant || '',
        vehicle_info_id: cleanUuid(resolvedInfoId) || null,
      };

      if (vehicleFound && targetVehicleId) {
        const vehicleUpdateDataUpd = pgSetClause(vehicleFields);
        await conn.query(
          `UPDATE vehicle_detail SET ${vehicleUpdateDataUpd.clause} WHERE id = $${vehicleUpdateDataUpd.values.length + 1} AND finance_id = $${vehicleUpdateDataUpd.values.length + 2}`,
          [...vehicleUpdateDataUpd.values, targetVehicleId, finance_id]
        );
      } else if (vehicleNum) {
        // Insert new vehicle record
        const __newVehIns = pgInsertClause({
          finance_id: finance_id,
          ...vehicleFields,
          status: 'sales',
          deal_type: 'finance',
          base_price: parseFloat(vehicle.base_price ?? vehicle.basePrice) || 0,
          emi_from: parseFloat(vehicle.emi_from ?? vehicle.emiFrom) || 0,
        });
        const { rows: newVehRows } = await conn.query(
          `INSERT INTO vehicle_detail (${__newVehIns.columns}) VALUES (${__newVehIns.placeholders}) RETURNING id`,
          __newVehIns.values
        );
        if (newVehRows.length > 0) {
          targetVehicleId = newVehRows[0].id;
        }
      }

      // Link vehicle to customer and loan
      if (targetVehicleId) {
        await conn.query('UPDATE customers SET vehicle_id = $1 WHERE id = $2', [targetVehicleId, actualCustomerId]);
        await conn.query('UPDATE loans SET vehicle_id = $1 WHERE customer_id = $2', [targetVehicleId, actualCustomerId]);

        if (currentVehicleId !== targetVehicleId) {
          await conn.query(
            'UPDATE vehicle_detail SET status = $1 WHERE id = $2 AND finance_id = $3',
            ['sales', targetVehicleId, finance_id]
          );
          if (currentVehicleId) {
            await conn.query(
              'UPDATE vehicle_detail SET status = $1 WHERE id = $2 AND finance_id = $3',
              ['available', currentVehicleId, finance_id]
            );
          }
          const __ins28 = pgInsertClause({
            finance_id: finance_id,
            type: 'vehicle',
            reference_id: targetVehicleId,
            description: `Vehicle ${vehicle.vehicle_number || targetVehicleId} assigned to customer ${customer.hplno}`,
            created_by: req.user?.user_name || 'System'
          });
          await conn.query(
            `INSERT INTO recent_activity (${__ins28.columns}) VALUES (${__ins28.placeholders})`,
            __ins28.values
          );
        }
      }
    }

    // 9. Log activity
    const __ins29 = pgInsertClause({
      finance_id: finance_id,
      type: 'customer',
      reference_id: customer.hplno,
      description: `Customer updated: ${customer.cname}`,
      created_by: req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins29.columns}) VALUES (${__ins29.placeholders})`,
      __ins29.values
    );

    await conn.query('COMMIT');

    res.json({
      success: true,
      message: 'Customer updated successfully',
      uploadedFiles: uploadedFiles
    });

  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('Error updating customer:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      message: 'Failed to update customer'
    });
  } finally {
    conn.release();
  }
};

router.put('/finance/:customerId', enhancedCheckFinance, customerUploadFields, updateFinanceCustomerHandler);
router.put('/:customerId', enhancedCheckFinance, customerUploadFields, updateFinanceCustomerHandler);



// Get all customers with signed URLs
router.get('/', enhancedCheckFinance, async (req, res) => {
  try {
    const { rows: customers } = await db.query(`
      SELECT 
          c.id,
          c.hplno,
          c.loan_status AS "loanStatus",
          c.broker_name AS "brokerName",
          c.cname,
          c.cfname_value,
          c.cfname_unit,
          c.aadhar_id,
          c.other_govt_id_type,
          c.other_govt_id_number,
          c.profession,
          c.work_office_address,
          (
              SELECT ct_work.number FROM contacts ct_work 
              WHERE ct_work.customer_id = c.id 
                AND ct_work.contact_type = 'customer' 
                AND ct_work.type = 'work' 
              LIMIT 1
          ) AS work_office_phone,
          c.vehicle_id,

          vd.vehicle_number,
          vd.vehicle_modal,
          vd.vehicle_info_id,
          vi.brand,
          vi.body_type,
          vi.model_name AS "modelName",

          CONCAT_WS(' ', vi.brand, vi.model_name) AS "vehicleName",

          (
              SELECT vm.media_url 
              FROM vehicle_media vm 
              WHERE vm.vehicle_id = c.vehicle_id AND vm.is_primary = 1 
              LIMIT 1
          ) AS "vehicleMediaPhoto",

          CONCAT_WS(', ',
              NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
              NULLIF(a.street_name, ''),
              NULLIF(a.village, ''),
              NULLIF(a.land_mark, ''),
              NULLIF(a.address, ''),
              NULLIF(a.city, ''),
              NULLIF(a.district, ''),
              NULLIF(a.state, ''),
              NULLIF(a.pincode, '')
          ) AS caddress,

          COALESCE(ct.contacts_json, '[]'::jsonb) AS contacts_json

      FROM customers c

      LEFT JOIN (
          SELECT 
              customer_id,
              jsonb_agg(
                  jsonb_build_object(
                      'type', type,
                      'number', number
                  )
                  ORDER BY id
              ) AS contacts_json
          FROM contacts
          WHERE contact_type = 'customer'
          GROUP BY customer_id
      ) ct 
          ON c.id = ct.customer_id

      LEFT JOIN vehicle_detail vd 
          ON c.vehicle_id = vd.id

      LEFT JOIN vehicle_info vi 
          ON vd.vehicle_info_id = vi.id

      LEFT JOIN address_history ah 
          ON ah.entity_type = 'customer'
          AND ah.entity_id = c.id::text
          AND ah.is_current = 1

      LEFT JOIN addresses a 
          ON ah.address_id = a.id

      WHERE c.finance_id = $1
      ORDER BY c.hplno ASC;
      `,
      [req.financeId]
    );

    // Fetch KYC documents (customer photo, property photo, vehicle photo) in batch
    const customerIds = customers.map(c => c.id.toString());
    const kycPhotoMap = new Map();

    if (customerIds.length > 0) {
      const { rows: kycDocs } = await db.query(`
        SELECT entity_id, document_type, file_path
        FROM kyc_documents
        WHERE entity_type = 'customer'
          AND entity_id = ANY($1)
          AND document_type IN ('customer_photo', 'property_photo', 'vehicle_photo')
          AND is_current = true
        ORDER BY uploaded_at DESC
      `, [customerIds]);

      for (const doc of kycDocs) {
        if (!kycPhotoMap.has(doc.entity_id)) {
          kycPhotoMap.set(doc.entity_id, {});
        }
        const m = kycPhotoMap.get(doc.entity_id);
        // Retain the latest current document for each document type
        if (!m[doc.document_type]) {
          m[doc.document_type] = doc.file_path;
        }
      }
    }

    // Process each customer's images with signed URLs
    const formattedCustomers = await Promise.all(customers.map(async (customer) => {
      // Parse contacts JSON safely (Postgres jsonb is already parsed to an array)
      let contacts = [];
      if (Array.isArray(customer.contacts_json)) {
        contacts = customer.contacts_json;
      } else if (typeof customer.contacts_json === 'string') {
        try {
          contacts = JSON.parse(customer.contacts_json.startsWith('[') ? customer.contacts_json : `[${customer.contacts_json}]`);
        } catch {
          contacts = [];
        }
      }

      const docs = kycPhotoMap.get(customer.id.toString()) || {};
      const rawCustomerPhoto = docs.customer_photo || null;
      const rawPropertyPhoto = docs.property_photo || null;
      const rawVehiclePhoto = docs.vehicle_photo || customer.vehicleMediaPhoto || null;

      // Process images with signed URLs
      const customerImages = await processImagesWithSignedUrls({
        cphoto: rawCustomerPhoto,
        cpropertyPhoto: rawPropertyPhoto,
        cvehiclePhoto: rawVehiclePhoto
      });

      return {
        id: customer.id,
        hplno: customer.hplno,
        loanStatus: customer.loanStatus,
        brokerName: customer.brokerName,
        cname: customer.cname,
        cfname: {
          value: customer.cfname_value,
          unit: customer.cfname_unit
        },
        aadhar_id: customer.aadhar_id,
        other_govt_id_type: customer.other_govt_id_type,
        other_govt_id_number: customer.other_govt_id_number,
        profession: customer.profession,
        work_office_address: customer.work_office_address,
        work_office_phone: customer.work_office_phone,
        vehicle_id: customer.vehicle_id,
        vehicle_number: customer.vehicle_number,
        vehicleNumber: customer.vehicle_number,
        vehicle_modal: customer.vehicle_modal,
        modelName: customer.modelName || customer.vehicle_modal,
        vehicleName: customer.vehicleName,
        caddress: customer.caddress,
        contacts: contacts,
        // Standardized image objects (signed_url & original_url)
        cphoto: customerImages.cphoto || null,
        cvehiclePhoto: customerImages.cvehiclePhoto || null,
        cpropertyPhoto: customerImages.cpropertyPhoto || null
      };
    }));

    res.json(formattedCustomers);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get signed URL for a specific image
router.get('/images/signed-url', enhancedCheckFinance, async (req, res) => {
  try {
    const { imageUrl } = req.query;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }

    if (!imageUrl.includes('amazonaws.com')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid S3 URL'
      });
    }

    const signedUrl = await getSignedImageUrl(imageUrl, 86400); // 24 hours

    res.json({
      success: true,
      signed_url: signedUrl,
      original_url: imageUrl,
      expires_in: 86400
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate signed URL'
    });
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Server error:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      message: err.message,
      details: {
        code: err.code,
        field: err.field,
        expectedFields: [
          'customerPhoto',
          'customerVehiclePhoto',
          'customerPropertyPhoto',
          'guardianPhoto',
          'guardianPropertyPhoto'
        ]
      }
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Tenant-scoped customer search endpoint
router.get('/search', enhancedCheckFinance, async (req, res) => {
  try {
    const { cname = '', cfname = '', mobile = '', vehicleNumber = '' } = req.query;

    if (!cname && !cfname && !mobile && !vehicleNumber) {
      return res.json({ success: true, found: false });
    }

    const cnameLike = `%${String(cname).trim()}%`;
    const cfnameLike = `%${String(cfname).trim()}%`;
    const mobileExact = String(mobile).trim();
    const vehicleExact = String(vehicleNumber).trim();

    const sql = `
      SELECT 
        c.*,
        (
          SELECT vm.media_url 
          FROM vehicle_media vm 
          WHERE vm.vehicle_id = COALESCE(l.vehicle_id, c.vehicle_id) AND vm.is_primary = 1 
          LIMIT 1
        ) AS "cvehiclePhoto",
        g.id AS guardian_id,
        g.gname,
        (
          SELECT CONCAT_WS(', ',
            NULLIF(CONCAT_WS(' ', ag.house_no, ag.street), ''),
            NULLIF(ag.street_name, ''),
            NULLIF(ag.village, ''),
            NULLIF(ag.land_mark, ''),
            NULLIF(ag.address, ''),
            NULLIF(ag.city, ''),
            NULLIF(ag.district, ''),
            NULLIF(ag.state, ''),
            NULLIF(ag.pincode, '')
          )
          FROM address_history ahg
          JOIN addresses ag ON ahg.address_id = ag.id
          WHERE ahg.entity_type = 'guardian' AND ahg.entity_id = g.id::text AND ahg.is_current = 1
          LIMIT 1
        ) AS gaddress,
        (
          SELECT CONCAT_WS(', ',
            NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
            NULLIF(a.street_name, ''),
            NULLIF(a.village, ''),
            NULLIF(a.land_mark, ''),
            NULLIF(a.address, ''),
            NULLIF(a.city, ''),
            NULLIF(a.district, ''),
            NULLIF(a.state, ''),
            NULLIF(a.pincode, '')
          )
          FROM address_history ah
          JOIN addresses a ON ah.address_id = a.id
          WHERE ah.entity_type = 'customer' AND ah.entity_id = c.id::text AND ah.is_current = 1
          LIMIT 1
        ) AS caddress,
        g.gfname_value, g.gfname_unit,
        vd.vehicle_info_id AS "vehicle_info_id", vi.brand AS "brand", vd.vehicle_number AS "vehicleNumber", vi.model_name AS "modelName", CONCAT_WS(' ', vi.brand, vi.model_name) AS "vehicleName", vi.vehicle_type AS "vehicleType", vd.color AS "vehicleColor",
        l.hp_amount AS "hpAmount", l.hp_date AS "hpDate", l.due_month AS "dueMonth", l.interest_rate AS "interestRate", l.due_amount AS "loanDueAmount", l.penalty_amount AS "penaltyAmount",
        (
          SELECT STRING_AGG(DISTINCT ct2.number, ',')
          FROM contacts ct2
          WHERE ct2.customer_id = c.id
        ) AS contact_numbers
      FROM customers c
      LEFT JOIN guardians g ON c.id = g.customer_id
      LEFT JOIN loans l ON c.id = l.customer_id
      LEFT JOIN vehicle_detail vd ON COALESCE(l.vehicle_id, c.vehicle_id) = vd.id
      LEFT JOIN vehicle_info vi ON vd.vehicle_info_id = vi.id
      LEFT JOIN contacts ct ON c.id = ct.customer_id
      WHERE c.finance_id = $11::uuid
        AND (
          ( $1 <> '' AND $2 <> '' AND c.cname LIKE $3 AND ct.number = $4)
          OR ( $5 <> '' AND c.cfname_value LIKE $6)
          OR ( $7 <> '' AND ct.number = $8)
          OR ( $9 <> '' AND vd.vehicle_number = $10)
        )
      LIMIT 1
    `;

    const params = [
      cname, mobileExact, cnameLike, mobileExact,
      cfname, cfnameLike,
      mobileExact, mobileExact,
      vehicleExact, vehicleExact,
      req.financeId
    ];

    const { rows: rows } = await db.query(sql, params);

    if (!rows || rows.length === 0) {
      return res.json({ success: true, found: false });
    }

    const r = rows[0];

    const { rows: contactsRows } = await db.query('SELECT contact_type, type, number FROM contacts WHERE customer_id = $1', [r.id]);
    const { rows: guardianRows } = await db.query('SELECT * FROM guardians WHERE customer_id = $1', [r.id]);
    const { rows: loanRows } = await db.query('SELECT * FROM loans WHERE customer_id = $1 AND (finance_id = $2::uuid OR finance_id IS NULL)', [r.id, req.financeId]);
    const { rows: vehicleRows } = await db.query('SELECT vd.*, vi.model_name AS "modelName", vi.brand FROM vehicle_detail vd LEFT JOIN vehicle_info vi ON vd.vehicle_info_id = vi.id WHERE vd.id = (SELECT COALESCE(l.vehicle_id, c.vehicle_id) FROM customers c LEFT JOIN loans l ON l.customer_id = c.id WHERE c.id = $1 AND c.finance_id = $2::uuid LIMIT 1)', [r.id, req.financeId]);
    const { rows: paymentRows } = await db.query('SELECT id, due_date AS "dueDate", TO_CHAR(payment_date, \'YYYY-MM-DD\') AS "paymentDate", bill_number AS "billNumber", amount, penalty FROM payments WHERE customer_id = $1 AND (finance_id = $2::uuid OR finance_id IS NULL) ORDER BY due_date DESC', [r.id, req.financeId]);

    // Retrieve KYC documents for customer and guardian
    const guardianId = guardianRows[0]?.id ? guardianRows[0].id.toString() : (r.guardian_id ? r.guardian_id.toString() : null);
    const { rows: kycDocs } = await db.query(`
      SELECT entity_type, document_type, file_path 
      FROM kyc_documents
      WHERE ((entity_type = 'customer' AND entity_id = $1)
         OR ($2::text IS NOT NULL AND entity_type = 'guardian' AND entity_id = $2))
        AND document_type IN ('customer_photo', 'property_photo', 'vehicle_photo', 'guardian_photo')
        AND is_current = true
      ORDER BY uploaded_at DESC
    `, [r.id.toString(), guardianId]);

    const kycMap = {};
    for (const d of kycDocs) {
      const key = `${d.entity_type}:${d.document_type}`;
      if (!kycMap[key]) kycMap[key] = d.file_path;
    }

    const cphotoUrl = kycMap['customer:customer_photo'] || null;
    const cpropertyPhotoUrl = kycMap['customer:property_photo'] || null;
    const cvehiclePhotoUrl = kycMap['customer:vehicle_photo'] || r.cvehiclePhoto || null;
    const gphotoUrl = kycMap['guardian:guardian_photo'] || null;
    const gpropertyPhotoUrl = kycMap['guardian:property_photo'] || null;

    const customerImages = await processImagesWithSignedUrls({
      cphoto: cphotoUrl,
      cpropertyPhoto: cpropertyPhotoUrl,
      cvehiclePhoto: cvehiclePhotoUrl
    });

    const guardianImages = await processImagesWithSignedUrls({
      gphoto: gphotoUrl,
      gpropertyPhoto: gpropertyPhotoUrl
    });

    const result = {
      success: true,
      found: true,
      customer: {
        id: r.id,
        hplno: r.hplno,
        loanStatus: r.loanStatus,
        brokerName: r.brokerName,
        cname: r.cname,
        cfname: {
          value: r.cfname_value,
          unit: r.cfname_unit
        },
        cphoto: customerImages.cphoto || null,
        cvehiclePhoto: customerImages.cvehiclePhoto || null,
        cpropertyPhoto: customerImages.cpropertyPhoto || null,
        caddress: r.caddress || null,
        contacts: contactsRows || [],
        vehicle: vehicleRows[0] || null,
        loan: loanRows[0] || null,
        guardian: guardianRows[0] ? {
          ...guardianRows[0],
          gphoto: guardianImages.gphoto || null,
          gpropertyPhoto: guardianImages.gpropertyPhoto || null
        } : null,
        payments: paymentRows || []
      }
    };

    res.json(result);
  } catch (err) {
    console.error('Error /customers/search:', err);
    res.status(500).json({ success: false, error: 'Search failed', details: err.message });
  }
});


router.get('/unpaidcustomers', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const asOfDate = resolveIstDateString();

    const [{ rows: unpaidcustomers }, ledgerSnapshot] = await Promise.all([
      db.query(`
      SELECT 
        c.id,
        c.hplno,
        c.loan_status AS "loanStatus",
        c.broker_name AS "brokerName",
        c.cname,
        c.cfname_value,
        c.cfname_unit,
        -- Customer address
        MAX(CONCAT_WS(', ',
          NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
          NULLIF(a.street_name, ''),
          NULLIF(a.village, ''),
          NULLIF(a.land_mark, ''),
          NULLIF(a.address, ''),
          NULLIF(a.city, ''),
          NULLIF(a.district, ''),
          NULLIF(a.state, ''),
          NULLIF(a.pincode, '')
        )) as caddress,
        -- Vehicle info
        MAX(vd.vehicle_number) as vehicle_number,
        MAX(CONCAT_WS(' ', vi.brand, vi.model_name)) as "vehicleName",
        MAX(vi.model_name) as "modelName",
        -- Loan info
        MAX(l.due_month) as "dueMonth",
        MAX(l.due_amount) as "dueAmount",
        MAX(TO_CHAR(l.due_date, 'YYYY-MM-DD')) as due_date,
        MAX(TO_CHAR(l.due_date, 'YYYY-MM-DD')) as "dueDate",
        MAX(TO_CHAR(l.hp_date, 'YYYY-MM-DD')) as "hpDate",
        -- Guardian
        MAX(g.gname) AS guardian_name,
        MAX(g.id::text) AS guardian_id,
        -- Vehicle media
        MAX((SELECT vm.media_url FROM vehicle_media vm WHERE vm.vehicle_id = COALESCE(l.vehicle_id, c.vehicle_id) AND vm.is_primary = 1 LIMIT 1)) AS "vehicleMediaPhoto",
        -- Contacts
        (
          SELECT STRING_AGG(DISTINCT ct.number, ',')
          FROM contacts ct
          WHERE ct.customer_id = c.id 
            AND ct.contact_type = 'customer'
        ) as contact_numbers,
        -- Guardian contacts
        (
          SELECT STRING_AGG(DISTINCT ct.number, ',')
          FROM contacts ct
          WHERE ct.customer_id = c.id
            AND ct.contact_type = 'guardian'
        ) as guardian_numbers,
        -- Valid non-cancelled payment due dates
        (
          SELECT STRING_AGG(DISTINCT p.due_date::text, ',' ORDER BY p.due_date::text DESC)
          FROM payments p
          WHERE p.customer_id = c.id
            AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
            AND COALESCE(p.status::text, 'paid') <> 'cancelled'
        ) as due_dates
      FROM customers c
      LEFT JOIN address_history ah ON 
        ah.entity_type = 'customer' 
        AND ah.entity_id = c.id::text
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      LEFT JOIN loans l ON c.id = l.customer_id AND (l.finance_id IS NULL OR l.finance_id = c.finance_id)
      LEFT JOIN vehicle_detail vd ON COALESCE(l.vehicle_id, c.vehicle_id) = vd.id
      LEFT JOIN vehicle_info vi ON vd.vehicle_info_id = vi.id
      LEFT JOIN guardians g ON c.id = g.customer_id
      WHERE c.finance_id = $1
        AND c.loan_status IN ('active', 'seized')
        AND l.due_amount > 0
        AND (l.due_month IS NULL OR l.due_month > 0)
      GROUP BY c.id, c.hplno, c.loan_status, c.broker_name, c.cname, c.cfname_value, c.cfname_unit, c.vehicle_id
      ORDER BY c.hplno ASC NULLS LAST, c.id ASC`,
        [financeId]
      ),
      queryTenantLoanLedgers(financeId, { asOfDate }),
    ]);

    // Filter strictly to customers who are genuinely overdue, due today, or seized
    const eligibleRows = unpaidcustomers.filter((customer) => {
      const rollup = ledgerSnapshot.customerRollups.get(String(customer.id));
      if (customer.loanStatus === 'seized') return true;
      if (!rollup) return false;
      const isDueToday =
        rollup.currentOverdueEmiAmount <= 0 &&
        rollup.remainingScheduledEmiAmount > 0 &&
        rollup.nextEmiDueDate === asOfDate;
      return rollup.currentOverdueEmiAmount > 0 || isDueToday;
    });

    // Fetch KYC documents in batch for eligible customers and guardians
    const customerIds = eligibleRows.map(c => c.id.toString());
    const guardianIds = eligibleRows.map(c => c.guardian_id).filter(Boolean);
    const kycMap = new Map();

    if (customerIds.length > 0 || guardianIds.length > 0) {
      const { rows: kycDocs } = await db.query(`
        SELECT entity_type, entity_id, document_type, file_path 
        FROM kyc_documents 
        WHERE ((entity_type = 'customer' AND entity_id = ANY($1))
           OR (entity_type = 'guardian' AND entity_id = ANY($2)))
          AND document_type IN ('customer_photo', 'property_photo', 'vehicle_photo', 'guardian_photo')
          AND is_current = true
        ORDER BY uploaded_at DESC
      `, [customerIds, guardianIds]);

      for (const doc of kycDocs) {
        const key = `${doc.entity_type}:${doc.entity_id}`;
        if (!kycMap.has(key)) kycMap.set(key, {});
        const m = kycMap.get(key);
        if (!m[doc.document_type]) m[doc.document_type] = doc.file_path;
      }
    }

    // Process each customer's images with signed URLs and authoritative ledger metrics
    const formattedCustomers = await Promise.all(eligibleRows.map(async (customer) => {
      const rollup = ledgerSnapshot.customerRollups.get(String(customer.id));
      const isDueToday = Boolean(
        rollup &&
        rollup.currentOverdueEmiAmount <= 0 &&
        rollup.remainingScheduledEmiAmount > 0 &&
        rollup.nextEmiDueDate === asOfDate
      );
      const authoritativeDaysUntilDue = rollup
        ? (rollup.overdueDays > 0 ? rollup.overdueDays : (isDueToday ? 0 : -1))
        : -1;
      const authoritativePendingAmount = rollup
        ? (rollup.currentOverdueEmiAmount > 0
            ? rollup.currentOverdueEmiAmount
            : (isDueToday ? rollup.installmentAmount : 0))
        : 0;
      const authoritativePendingMonths = rollup
        ? (rollup.pendingEmiCount > 0 ? rollup.pendingEmiCount : (isDueToday ? 1 : 0))
        : 0;

      const custDocs = kycMap.get(`customer:${customer.id}`) || {};
      const guardDocs = customer.guardian_id ? (kycMap.get(`guardian:${customer.guardian_id}`) || {}) : {};

      const customerImages = {
        cphoto: custDocs.customer_photo || null,
        cvehiclePhoto: custDocs.vehicle_photo || customer.vehicleMediaPhoto || null,
        cpropertyPhoto: custDocs.property_photo || null
      };

      const guardianImages = {
        gphoto: guardDocs.guardian_photo || null,
        gpropertyPhoto: guardDocs.property_photo || null
      };

      // Process customer images with signed URLs
      const processedCustomerImages = await processImagesWithSignedUrls(customerImages);
      const processedGuardianImages = await processImagesWithSignedUrls(guardianImages);

      return {
        id: customer.id,
        hplno: customer.hplno,
        loanStatus: customer.loanStatus,
        brokerName: customer.brokerName,
        cname: customer.cname,
        cfname: {
          value: customer.cfname_value || '',
          unit: customer.cfname_unit || ''
        },
        caddress: customer.caddress,
        vehicle_number: customer.vehicle_number,
        vehicleNumber: customer.vehicle_number,
        vehicleName: customer.vehicleName,
        modelName: customer.modelName,
        dueMonth: rollup?.totalInstallments ?? customer.dueMonth,
        dueAmount: rollup?.installmentAmount ?? customer.dueAmount,
        dueDate: rollup?.earliestUnpaidDueDate || rollup?.nextEmiDueDate || customer.dueDate || customer.due_date || null,
        due_date: rollup?.earliestUnpaidDueDate || rollup?.nextEmiDueDate || customer.due_date || customer.dueDate || null,
        hpDate: customer.hpDate || null,
        // Authoritative Shared Financial Ledger fields
        overdueDays: rollup?.overdueDays ?? 0,
        daysUntilDue: authoritativeDaysUntilDue,
        pendingAmount: authoritativePendingAmount,
        currentOverdueEmiAmount: rollup?.currentOverdueEmiAmount ?? 0,
        pendingEmiCount: authoritativePendingMonths,
        installmentsCovered: rollup?.installmentsCovered ?? 0,
        earliestUnpaidDueDate: rollup?.earliestUnpaidDueDate ?? null,
        nextEmiDueDate: rollup?.nextEmiDueDate ?? null,
        remainingScheduledEmiAmount: rollup?.remainingScheduledEmiAmount ?? 0,
        outstandingPenaltyAmount: rollup?.outstandingPenaltyAmount ?? 0,
        totalOutstandingLoanBalance: rollup?.totalOutstandingLoanBalance ?? 0,
        totalAmountPaid: rollup?.totalAmountPaid ?? 0,
        hasPaidDues: Boolean((rollup && rollup.installmentsCovered > 0) || (customer.due_dates && customer.due_dates.trim())),
        paidDueDates: customer.due_dates
          ? customer.due_dates.split(',').filter(Boolean)
          : [],
        guardian_name: customer.guardian_name,
        guardianName: customer.guardian_name,
        // Image fields with signed URLs
        cphoto: processedCustomerImages.cphoto || null,
        cvehiclePhoto: processedCustomerImages.cvehiclePhoto || null,
        cpropertyPhoto: processedCustomerImages.cpropertyPhoto || null,
        gphoto: processedGuardianImages.gphoto || null,
        gpropertyPhoto: processedGuardianImages.gpropertyPhoto || null,
        // Contact info
        contactNumbers: customer.contact_numbers
          ? customer.contact_numbers.split(',').filter(Boolean)
          : [],
        guardianNumbers: customer.guardian_numbers
          ? customer.guardian_numbers.split(',').filter(Boolean)
          : [],
        dueDates: customer.due_dates
          ? customer.due_dates.split(',').filter(Boolean)
          : (customer.due_date ? [customer.due_date] : [])
      };
    }));

    res.json({
      success: true,
      count: formattedCustomers.length,
      customers: formattedCustomers
    });
  } catch (err) {
    console.error('Error fetching unpaid customers:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unpaid customers',
      details: err.message
    });
  }
});


// ─── Pending Collections API ─────────────────────────────────────────────────
router.get('/pending-collections', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const {
      search,
      hpDate,
      hpDateFrom,
      hpDateTo,
      pendingMin,
      pendingMax,
      dueDaysMin,
      dueDaysMax,
      broker,
      vehicleType,
      street,
      village,
      city,
      state,
      statusFilter,
      dealType,
      hbAmountMin,
      hbAmountMax,
      defaultAmountMin,
      defaultAmountMax,
      page = 1,
      limit = 20,
      sortBy = 'hplno',
      sortOrder = 'ASC',
      asOfDate = resolveIstDateString(),
    } = req.query;

    const queryParams = [financeId];
    let whereClauses = ['c.finance_id = $1::uuid'];

    // Search query: customer name, HPL number, vehicle number, phone, brand/model
    if (search && String(search).trim()) {
      queryParams.push(`%${String(search).trim()}%`);
      const pIdx = queryParams.length;
      whereClauses.push(`(
        c.cname ILIKE $${pIdx} OR
        l.hplno::text ILIKE $${pIdx} OR
        v.vehicle_number ILIKE $${pIdx} OR
        vi.brand ILIKE $${pIdx} OR
        vi.model_name ILIKE $${pIdx} OR
        v.vehicle_modal ILIKE $${pIdx}
      )`);
    }

    // Exact HP Date
    if (hpDate && String(hpDate).trim()) {
      queryParams.push(String(hpDate).trim());
      whereClauses.push(`l.hp_date = $${queryParams.length}::date`);
    }

    // HP Date From
    if (hpDateFrom && String(hpDateFrom).trim()) {
      queryParams.push(String(hpDateFrom).trim());
      whereClauses.push(`l.hp_date >= $${queryParams.length}::date`);
    }

    // HP Date To
    if (hpDateTo && String(hpDateTo).trim()) {
      queryParams.push(String(hpDateTo).trim());
      whereClauses.push(`l.hp_date <= $${queryParams.length}::date`);
    }

    // HB / HP Amount Range
    if (hbAmountMin !== undefined && hbAmountMin !== '' && !isNaN(Number(hbAmountMin))) {
      queryParams.push(Number(hbAmountMin));
      whereClauses.push(`l.hp_amount >= $${queryParams.length}`);
    }
    if (hbAmountMax !== undefined && hbAmountMax !== '' && !isNaN(Number(hbAmountMax))) {
      queryParams.push(Number(hbAmountMax));
      whereClauses.push(`l.hp_amount <= $${queryParams.length}`);
    }

    // Broker search / filter
    if (broker && String(broker).trim()) {
      queryParams.push(`%${String(broker).trim()}%`);
      whereClauses.push(`(c.broker_name ILIKE $${queryParams.length} OR l.broker_name ILIKE $${queryParams.length})`);
    }

    // Vehicle Type
    if (vehicleType && String(vehicleType).trim() && String(vehicleType).toLowerCase() !== 'all types' && String(vehicleType).toLowerCase() !== 'all') {
      queryParams.push(`%${String(vehicleType).trim()}%`);
      whereClauses.push(`(vi.body_type::text ILIKE $${queryParams.length} OR l.loan_type::text ILIKE $${queryParams.length})`);
    }

    // Address Filters
    if (street && String(street).trim()) {
      queryParams.push(`%${String(street).trim()}%`);
      whereClauses.push(`(a.street ILIKE $${queryParams.length} OR a.street_name ILIKE $${queryParams.length})`);
    }
    if (village && String(village).trim()) {
      queryParams.push(`%${String(village).trim()}%`);
      whereClauses.push(`a.village ILIKE $${queryParams.length}`);
    }
    if (city && String(city).trim()) {
      queryParams.push(`%${String(city).trim()}%`);
      whereClauses.push(`a.city ILIKE $${queryParams.length}`);
    }
    if (state && String(state).trim()) {
      queryParams.push(`%${String(state).trim()}%`);
      whereClauses.push(`a.state ILIKE $${queryParams.length}`);
    }

    // Deal Type Filter ('Finance' vs 'Consulting')
    if (dealType && String(dealType).trim() && String(dealType).toLowerCase() !== 'all') {
      const dtLower = String(dealType).trim().toLowerCase();
      if (dtLower === 'finance') {
        whereClauses.push(`(l.loan_type = 'finance')`);
      } else if (dtLower === 'consulting') {
        whereClauses.push(`(l.loan_type != 'finance' OR l.loan_type IS NULL)`);
      }
    }

    const sql = `
      SELECT 
        c.id as customer_id,
        c.hplno,
        c.cname as customer_name,
        COALESCE(c.broker_name, l.broker_name, '') as broker_name,
        c.loan_status,
        l.id as loan_id,
        l.loan_type as deal_type,
        l.due_month as total_installments,
        l.due_amount as installment_amount,
        l.net_payable,
        l.hp_amount,
        COALESCE(l.penalty_amount, 0) as penalty_amount,
        TO_CHAR(l.hp_date, 'YYYY-MM-DD') as hp_date,
        TO_CHAR(l.due_date, 'YYYY-MM-DD') as first_due_date,
        v.id as vehicle_id,
        v.vehicle_number,
        COALESCE(vi.brand, '') as brand,
        COALESCE(vi.model_name, v.vehicle_modal, '') as model,
        COALESCE(vi.body_type::text, '') as vehicle_type,
        a.street,
        a.street_name,
        a.village,
        a.city,
        a.state,
        COALESCE((
          SELECT ct.number FROM contacts ct 
          WHERE ct.customer_id = c.id 
          ORDER BY CASE WHEN ct.type::text = 'mobile' THEN 1 ELSE 2 END 
          LIMIT 1
        ), '') as primary_phone,
        (
          COALESCE((
            SELECT SUM(p.amount) 
            FROM payments p 
            WHERE p.customer_id = c.id
              AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
              AND COALESCE(p.status::text, 'paid') <> 'cancelled'
          ), 0) +
          COALESCE((
            SELECT SUM(sd.paid_amount)
            FROM sub_due sd
            JOIN payments p_sd ON p_sd.id = sd.payment_id
            WHERE sd.customer_id = c.id
              AND sd.finance_id = c.finance_id
              AND COALESCE(sd.status::text, 'active') <> 'cancelled'
              AND COALESCE(p_sd.payment_status::text, 'active') <> 'cancelled'
              AND COALESCE(p_sd.status::text, 'paid') <> 'cancelled'
          ), 0)
        ) as total_paid,
        COALESCE((
          SELECT SUM(p.penalty)
          FROM payments p
          WHERE p.customer_id = c.id
            AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
            AND COALESCE(p.status::text, 'paid') <> 'cancelled'
        ), 0) as total_penalty_paid,
        COALESCE((
          SELECT COUNT(*) 
          FROM payments p 
          WHERE p.customer_id = c.id
            AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
            AND COALESCE(p.status::text, 'paid') = 'paid'
        ), 0) as installments_paid,
        (
          SELECT TO_CHAR(MAX(p.payment_date), 'YYYY-MM-DD') 
          FROM payments p 
          WHERE p.customer_id = c.id
            AND COALESCE(p.payment_status::text, 'active') <> 'cancelled'
            AND COALESCE(p.status::text, 'paid') <> 'cancelled'
        ) as last_payment_date
      FROM customers c
      JOIN loans l ON l.customer_id = c.id
      LEFT JOIN vehicle_detail v ON c.vehicle_id = v.id
      LEFT JOIN vehicle_info vi ON v.vehicle_info_id = vi.id
      LEFT JOIN addresses a ON a.id = (
        SELECT ah.address_id 
        FROM address_history ah 
        WHERE ah.entity_id = c.id::text AND ah.entity_type = 'customer' 
        ORDER BY ah.is_current DESC, ah.id DESC 
        LIMIT 1
      )
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY c.hplno ASC
    `;

    const { rows } = await db.query(sql, queryParams);

    // Map rows using established calculation helper
    let records = rows.map(r => mapPendingCollectionRow(r, asOfDate));

    // Dynamic distinct options for filter dropdowns
    const uniqueBrokers = [...new Set(records.map(r => r.broker).filter(Boolean))].sort();
    const uniqueStreets = [...new Set(records.map(r => r.street).filter(Boolean))].sort();
    const uniqueVillages = [...new Set(records.map(r => r.village).filter(Boolean))].sort();
    const uniqueCities = [...new Set(records.map(r => r.city).filter(Boolean))].sort();

    // Secondary filters on calculated / derived financial metrics
    if (pendingMin !== undefined && pendingMin !== '' && !isNaN(Number(pendingMin))) {
      records = records.filter(r => r.pending >= Number(pendingMin));
    }
    if (pendingMax !== undefined && pendingMax !== '' && !isNaN(Number(pendingMax))) {
      records = records.filter(r => r.pending <= Number(pendingMax));
    }
    if (defaultAmountMin !== undefined && defaultAmountMin !== '' && !isNaN(Number(defaultAmountMin))) {
      records = records.filter(r => r.defaultAmount >= Number(defaultAmountMin));
    }
    if (defaultAmountMax !== undefined && defaultAmountMax !== '' && !isNaN(Number(defaultAmountMax))) {
      records = records.filter(r => r.defaultAmount <= Number(defaultAmountMax));
    }
    if (dueDaysMin !== undefined && dueDaysMin !== '' && !isNaN(Number(dueDaysMin))) {
      records = records.filter(r => r.paidEmi >= Number(dueDaysMin));
    }
    if (dueDaysMax !== undefined && dueDaysMax !== '' && !isNaN(Number(dueDaysMax))) {
      records = records.filter(r => r.paidEmi <= Number(dueDaysMax));
    }
    if (statusFilter && String(statusFilter).trim() && String(statusFilter).toLowerCase() !== 'all') {
      const sf = String(statusFilter).trim().toLowerCase();
      records = records.filter(r => {
        if (sf === 'action') return r.status === 'action';
        if (sf === 'close') return r.status === 'close';
        if (sf === 'pending') return r.status === 'pending';
        return true;
      });
    }

    // Totals / Aggregates across all matching records
    const totalCount = records.length;
    const totalDueSum = records.reduce((sum, r) => sum + r.totalDue, 0);
    const totalPaidSum = records.reduce((sum, r) => sum + r.paid, 0);
    const totalPendingSum = records.reduce((sum, r) => sum + r.pending, 0);
    const totalBalanceSum = records.reduce((sum, r) => sum + r.balance, 0);

    // Sorting
    const sortField = sortBy || 'hplno';
    const isDesc = String(sortOrder).toUpperCase() === 'DESC';
    records.sort((a, b) => {
      let va = a[sortField] !== undefined ? a[sortField] : a.hplno;
      let vb = b[sortField] !== undefined ? b[sortField] : b.hplno;
      if (typeof va === 'string' && typeof vb === 'string') {
        return isDesc ? vb.localeCompare(va) : va.localeCompare(vb);
      }
      return isDesc ? (Number(vb) || 0) - (Number(va) || 0) : (Number(va) || 0) - (Number(vb) || 0);
    });

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = parseInt(limit, 10);
    const paginated = limitNum > 0 ? records.slice((pageNum - 1) * limitNum, pageNum * limitNum) : records;
    const totalPages = limitNum > 0 ? Math.ceil(totalCount / limitNum) : 1;

    res.json({
      success: true,
      data: paginated,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum || totalCount,
        totalPages,
      },
      aggregates: {
        totalCount,
        totalDueSum,
        totalPaidSum,
        totalPendingSum,
        totalBalanceSum,
      },
      filters: {
        brokers: uniqueBrokers,
        streets: uniqueStreets,
        villages: uniqueVillages,
        cities: uniqueCities,
      },
    });
  } catch (err) {
    console.error('Error fetching pending collections:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending collections',
      details: err.message,
    });
  }
});

// ─── KYC Pending API ─────────────────────────────────────────────────────────
router.get('/kyc-pending', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const {
      search,
      pendingType,
      street,
      village,
      city,
      state,
      broker,
      entityType,
      page = 1,
      limit = 12
    } = req.query;

    // 1. Fetch Customers and their KYC document state
    const customerSql = `
      SELECT
        c.id as customer_id,
        c.cname as name,
        c.hplno,
        c.aadhar_id,
        c.other_govt_id_type,
        c.other_govt_id_number,
        c.broker_name,
        c.home_address,
        c.home_latitude,
        c.home_longitude,
        c.loan_status,
        a.street,
        a.street_name,
        a.village,
        a.city,
        a.state,
        a.location,
        ct.number as phone,
        kd_photo.file_path as photo_url,
        kd_photo.verification_status as photo_verification_status,
        kd_gid.id as govt_id_doc_id,
        kd_gid.verification_status as govt_id_verification_status,
        vd.vehicle_number,
        vi.brand,
        vi.model_name,
        l.hp_amount
      FROM customers c
      LEFT JOIN (
        SELECT DISTINCT ON (entity_id) entity_id, file_path, verification_status
        FROM kyc_documents
        WHERE entity_type = 'customer' AND document_type = 'customer_photo' AND is_current = true
        ORDER BY entity_id, created_at DESC
      ) kd_photo ON kd_photo.entity_id = c.id::text
      LEFT JOIN (
        SELECT DISTINCT ON (entity_id) entity_id, id, verification_status
        FROM kyc_documents
        WHERE entity_type = 'customer'
          AND document_type IN ('aadhar_card', 'pan_card', 'voter_id', 'driving_license', 'passport')
          AND is_current = true
        ORDER BY entity_id, created_at DESC
      ) kd_gid ON kd_gid.entity_id = c.id::text
      LEFT JOIN address_history ah ON ah.entity_id = c.id::text AND ah.entity_type = 'customer' AND ah.is_current = 1
      LEFT JOIN addresses a ON a.id = ah.address_id
      LEFT JOIN (
        SELECT DISTINCT ON (customer_id) customer_id, number
        FROM contacts
        WHERE contact_type = 'customer'
        ORDER BY customer_id, CASE WHEN type::text = 'mobile' THEN 1 ELSE 2 END
      ) ct ON ct.customer_id = c.id
      LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
      LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
      LEFT JOIN loans l ON l.customer_id = c.id
      WHERE c.finance_id = $1
      ORDER BY c.hplno ASC
    `;
    const { rows: custRows } = await db.query(customerSql, [financeId]);

    // 2. Fetch Staff / Users and their KYC document state
    const staffSql = `
      SELECT
        ud.id as staff_detail_id,
        ud.user_id,
        ud.staff_name as name,
        ud.staff_code,
        ud.photo as photo_url,
        ud.pan_number,
        u.username,
        u.phone_no as phone,
        uac.role,
        a.street,
        a.street_name,
        a.village,
        a.city,
        a.state,
        a.location,
        kd_photo.file_path as kyc_photo_url,
        kd_gid.id as govt_id_doc_id,
        kd_gid.verification_status as govt_id_verification_status
      FROM users_details ud
      LEFT JOIN users u ON u.id = ud.user_id
      LEFT JOIN user_allowed_companies uac ON uac.user_id = ud.user_id AND uac.finance_id = ud.finance_id
      LEFT JOIN (
        SELECT DISTINCT ON (entity_id) entity_id, file_path, verification_status
        FROM kyc_documents
        WHERE entity_type = 'user' AND document_type IN ('user_profile_photo', 'customer_photo') AND is_current = true
        ORDER BY entity_id, created_at DESC
      ) kd_photo ON kd_photo.entity_id = ud.user_id::text
      LEFT JOIN (
        SELECT DISTINCT ON (entity_id) entity_id, id, verification_status
        FROM kyc_documents
        WHERE entity_type = 'user'
          AND document_type IN ('pan_card', 'aadhar_card')
          AND is_current = true
        ORDER BY entity_id, created_at DESC
      ) kd_gid ON kd_gid.entity_id = ud.user_id::text
      LEFT JOIN address_history ah ON ah.entity_id = ud.user_id::text AND ah.entity_type = 'user' AND ah.is_current = 1
      LEFT JOIN addresses a ON a.id = ah.address_id
      WHERE ud.finance_id = $1
      ORDER BY ud.created_at ASC
    `;
    const { rows: staffRows } = await db.query(staffSql, [financeId]);

    // 3. Process S3 signed URLs
    const allPending = [];

    // Evaluate customers
    for (const c of custRows) {
      let signedPhoto = c.photo_url;
      if (signedPhoto && signedPhoto.includes('amazonaws.com')) {
        try {
          signedPhoto = await getSignedImageUrl(signedPhoto);
        } catch (e) {
          // Keep raw URL on failure
        }
      }
      const evaluated = evaluateCustomerKyc({ ...c, signed_photo_url: signedPhoto });
      if (evaluated.isKycPending) {
        allPending.push(evaluated);
      }
    }

    // Evaluate staff
    for (const s of staffRows) {
      let signedPhoto = s.kyc_photo_url || s.photo_url;
      if (signedPhoto && signedPhoto.includes('amazonaws.com')) {
        try {
          signedPhoto = await getSignedImageUrl(signedPhoto);
        } catch (e) {
          // Keep raw URL
        }
      }
      const evaluated = evaluateStaffKyc({ ...s, signed_photo_url: signedPhoto });
      if (evaluated.isKycPending) {
        allPending.push(evaluated);
      }
    }

    // 4. Compute full dataset aggregates & filter options before filtering
    const aggregates = computeAggregates(allPending);
    const filterOptions = extractFilterOptions(allPending);

    // 5. Apply filters
    const filtered = filterKycRecords(allPending, {
      search,
      pendingType,
      street,
      village,
      city,
      state,
      broker,
      entityType
    });

    // 6. Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = parseInt(limit, 10) || 12;
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const paginated = limitNum > 0 ? filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum) : filtered;

    res.json({
      success: true,
      data: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      aggregates,
      filterOptions
    });
  } catch (err) {
    console.error('Error fetching KYC pending records:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KYC pending records',
      details: err.message
    });
  }
});

// ─── Terminated Accounts API ─────────────────────────────────────────────────
router.get('/terminated-accounts', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;
    const {
      search,
      broker,
      street,
      village,
      city,
      state,
      dueMin,
      dueMax,
      dateFrom,
      dateTo,
      dateType = 'any',
      status,
      page = 1,
      limit = 12
    } = req.query;

    const query = `
      SELECT
        c.id as customer_id,
        c.cname,
        c.hplno,
        c.broker_name,
        c.loan_status,
        c.created_at as customer_created_at,
        l.id as loan_id,
        l.hp_date,
        l.due_date,
        l.due_month,
        l.due_amount,
        l.net_payable,
        l.penalty_amount,
        l.penalty_days,
        vd.vehicle_number,
        vi.brand,
        vi.model_name,
        ct.number as phone,
        a.street,
        a.street_name,
        a.village,
        a.city,
        a.state,
        kd_photo.file_path as photo_url,
        COALESCE(pay.total_paid, 0) as total_paid,
        COALESCE(pay.total_penalty_paid, 0) as total_penalty_paid,
        lc.reason as cancellation_reason,
        lc.status as cancellation_status,
        lc.processed_at as cancellation_processed_at,
        sv.seizing_date,
        sv.description as seizing_description,
        sv.seizing_charge
      FROM customers c
      LEFT JOIN loans l ON l.customer_id = c.id
      LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
      LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
      LEFT JOIN (
        SELECT DISTINCT ON (customer_id) customer_id, number
        FROM contacts
        WHERE contact_type = 'customer'
        ORDER BY customer_id, CASE WHEN type::text = 'mobile' THEN 1 ELSE 2 END
      ) ct ON ct.customer_id = c.id
      LEFT JOIN address_history ah ON ah.entity_id = c.id::text AND ah.entity_type = 'customer' AND ah.is_current = 1
      LEFT JOIN addresses a ON a.id = ah.address_id
      LEFT JOIN (
        SELECT DISTINCT ON (entity_id) entity_id, file_path
        FROM kyc_documents
        WHERE entity_type = 'customer' AND document_type = 'customer_photo' AND is_current = true
        ORDER BY entity_id, created_at DESC
      ) kd_photo ON kd_photo.entity_id = c.id::text
      LEFT JOIN (
        SELECT
          customer_id,
          COALESCE(SUM(amount) FILTER (WHERE payment_status != 'cancelled'), 0) as total_paid,
          COALESCE(SUM(penalty) FILTER (WHERE payment_status != 'cancelled'), 0) as total_penalty_paid
        FROM payments
        GROUP BY customer_id
      ) pay ON pay.customer_id = c.id
      LEFT JOIN (
        SELECT DISTINCT ON (loan_id) loan_id, reason, status, processed_at
        FROM loan_cancellations
        ORDER BY loan_id, requested_at DESC
      ) lc ON lc.loan_id = l.id
      LEFT JOIN (
        SELECT DISTINCT ON (customer_id) customer_id, seizing_date, description, seizing_charge
        FROM seizing_vehicle
        ORDER BY customer_id, seizing_date DESC
      ) sv ON sv.customer_id = c.id
      WHERE c.finance_id = $1
      ORDER BY c.hplno ASC
    `;

    const { rows } = await db.query(query, [financeId]);

    // Process S3 signed URLs and evaluate records
    const allTerminated = [];
    for (const r of rows) {
      let signedPhoto = r.photo_url;
      if (signedPhoto && signedPhoto.includes('amazonaws.com')) {
        try {
          signedPhoto = await getSignedImageUrl(signedPhoto);
        } catch (e) {
          // Keep raw URL on error
        }
      }

      const evaluated = evaluateTerminatedAccount({ ...r, signed_photo_url: signedPhoto });
      if (evaluated.isTerminated) {
        allTerminated.push(evaluated);
      }
    }

    // 1. Compute aggregates and filter options on the full dataset
    const aggregates = computeTerminatedAggregates(allTerminated);
    const filterOptions = extractTerminatedFilterOptions(allTerminated);

    // 2. Apply combined multi-field filters
    const filtered = filterTerminatedAccounts(allTerminated, {
      search,
      broker,
      street,
      village,
      city,
      state,
      dueMin,
      dueMax,
      dateFrom,
      dateTo,
      dateType,
      status
    });

    // 3. Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = parseInt(limit, 10) || 12;
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const paginated = limitNum > 0 ? filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum) : filtered;

    res.json({
      success: true,
      data: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      aggregates,
      filterOptions
    });
  } catch (err) {
    console.error('Error fetching terminated accounts:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch terminated accounts',
      details: err.message
    });
  }
});

// Get next HPL number (placed before /:customerId to avoid parameter shadowing)
router.get('/next-hplno', enhancedCheckFinance, async (req, res) => {
  try {
    const financeId = req.financeId;

    const { rows } = await db.query(
      `SELECT get_next_hplno($1) AS "nextHplno"`,
      [financeId]
    );

    return res.json({
      success: true,
      nextHplno: rows[0].nextHplno
    });
  } catch (err) {
    console.error('Error fetching next HPL number:', err);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate next HPL number'
    });
  }
});

// -----------------------------------------------------------------------
// POST /api/customers/print-batch
// Batched customer + guardian + loan + vehicle + active payments + finance
// lookup for unified print templates and Notices bulk generation.
// -----------------------------------------------------------------------
router.post('/print-batch', enhancedCheckFinance, async (req, res) => {
  try {
    const rawIds = req.body?.customerIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'customerIds must be a non-empty array'
      });
    }

    // De-duplicate while preserving request order
    const uniqueIds = Array.from(
      new Set(
        rawIds
          .map(id => (id !== null && id !== undefined ? String(id).trim() : ''))
          .filter(Boolean)
      )
    );

    if (uniqueIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'customerIds must contain at least one valid identifier'
      });
    }

    if (uniqueIds.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 200 customerIds allowed per batch request'
      });
    }

    const financeId = req.financeId;

    // 1. Batched query for finance details + branding assets and customers in parallel
    const [financeRes, brandingRes, customersRes] = await Promise.all([
      db.query(
        `SELECT 
           fd.id,
           fd.finance_name,
           fd.phone_numbers,
           fd.emails,
           fd.finance_photo,
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
           CONCAT_WS(', ',
             NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
             NULLIF(a.street_name, ''),
             NULLIF(a.village, ''),
             NULLIF(a.land_mark, ''),
             NULLIF(a.address, ''),
             NULLIF(a.city, ''),
             NULLIF(a.district, ''),
             NULLIF(a.state, ''),
             NULLIF(a.pincode, '')
           ) AS full_address
         FROM finance_detail fd
         LEFT JOIN LATERAL (
           SELECT ah.address_id
           FROM address_history ah
           WHERE ah.entity_type = 'finance'
             AND ah.entity_id = fd.id::text
             AND ah.is_current = 1
           ORDER BY ah.changed_at DESC NULLS LAST
           LIMIT 1
         ) ah_fin ON true
         LEFT JOIN addresses a ON ah_fin.address_id = a.id
         WHERE fd.id = $1
         LIMIT 1`,
        [financeId]
      ),
      db.query(
        `SELECT asset_type, file_path
         FROM finance_branding_assets
         WHERE finance_id = $1
           AND asset_type IN ('print_logo', 'web_logo')
           AND is_active = true
         ORDER BY created_at DESC`,
        [financeId]
      ),
      db.query(
        `SELECT 
           c.*,
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
           CONCAT_WS(', ',
             NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
             NULLIF(a.street_name, ''),
             NULLIF(a.village, ''),
             NULLIF(a.land_mark, ''),
             NULLIF(a.address, ''),
             NULLIF(a.city, ''),
             NULLIF(a.district, ''),
             NULLIF(a.state, ''),
             NULLIF(a.pincode, '')
           ) AS full_address
         FROM customers c
         LEFT JOIN LATERAL (
           SELECT ah.address_id
           FROM address_history ah
           WHERE ah.entity_type = 'customer'
             AND ah.entity_id = c.id::text
             AND ah.is_current = 1
           ORDER BY ah.changed_at DESC NULLS LAST
           LIMIT 1
         ) ah_cur ON true
         LEFT JOIN addresses a ON ah_cur.address_id = a.id
         WHERE c.finance_id = $1
           AND (c.id::text = ANY($2::text[]) OR c.hplno::text = ANY($2::text[]))`,
        [financeId, uniqueIds]
      )
    ]);

    // Assemble top-level finance object
    const finRow = financeRes.rows[0] || {};
    const parseJsonArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(String).filter(Boolean);
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {
          return val.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return [];
    };

    const printLogoAsset = brandingRes.rows.find(r => r.asset_type === 'print_logo')?.file_path;
    const webLogoAsset = brandingRes.rows.find(r => r.asset_type === 'web_logo')?.file_path;
    const rawWebLogo = webLogoAsset || finRow.finance_photo || null;
    const rawPrintLogo = printLogoAsset || webLogoAsset || finRow.finance_photo || null;

    const safeSignUrl = async (url) => {
      if (!url || typeof url !== 'string') return null;
      if (url.startsWith('http') && url.includes('amazonaws.com')) {
        try {
          return await getSignedImageUrl(url, 86400);
        } catch {
          return url;
        }
      }
      return url;
    };

    const [signedWebLogo, signedPrintLogo] = await Promise.all([
      safeSignUrl(rawWebLogo),
      rawPrintLogo === rawWebLogo ? safeSignUrl(rawWebLogo) : safeSignUrl(rawPrintLogo)
    ]);

    const financePayload = {
      id: finRow.id ? String(finRow.id) : String(financeId),
      name: finRow.finance_name || '',
      address: finRow.full_address || '',
      phone_numbers: parseJsonArray(finRow.phone_numbers),
      emails: parseJsonArray(finRow.emails),
      print_logo_url: signedPrintLogo,
      logo_url: signedWebLogo
    };

    const customerRows = customersRes.rows;
    const matchedCustomerUuids = customerRows.map(c => c.id);
    const matchedCustomerUuidTexts = matchedCustomerUuids.map(id => String(id));

    // Determine missingIds (preserve input order)
    const byUuidLower = new Map();
    const byHplno = new Map();
    for (const c of customerRows) {
      byUuidLower.set(String(c.id).toLowerCase(), c);
      if (c.hplno !== null && c.hplno !== undefined) {
        byHplno.set(String(c.hplno).trim(), c);
      }
    }

    const missingIds = [];
    const orderedCustomers = [];
    const seenCustomerUuids = new Set();

    for (const reqId of uniqueIds) {
      const matched = byUuidLower.get(reqId.toLowerCase()) || byHplno.get(reqId);
      if (!matched) {
        missingIds.push(reqId);
      } else {
        const cidStr = String(matched.id);
        if (!seenCustomerUuids.has(cidStr)) {
          seenCustomerUuids.add(cidStr);
          orderedCustomers.push(matched);
        }
      }
    }

    if (orderedCustomers.length === 0) {
      return res.json({
        success: true,
        finance: financePayload,
        items: [],
        missingIds
      });
    }

    // 2. Run ONE batched query per related entity (contacts, guardians, loans, vehicles, payments, kyc photos)
    const [contactsRes, guardiansRes, loansRes, vehiclesRes, paymentsRes, kycPhotosRes] = await Promise.all([
      db.query(
        `SELECT id, customer_id, contact_type, type, number
         FROM contacts
         WHERE customer_id = ANY($1::uuid[])
           AND finance_id = $2
         ORDER BY id ASC`,
        [matchedCustomerUuids, financeId]
      ),
      db.query(
        `SELECT 
           g.*,
           ag.house_no AS g_house_no,
           ag.street AS g_street,
           ag.street_name AS g_street_name,
           ag.village AS g_village,
           ag.land_mark AS g_land_mark,
           ag.address AS g_address,
           ag.city AS g_city,
           ag.district AS g_district,
           ag.state AS g_state,
           ag.pincode AS g_pincode,
           ag.location AS g_location,
           CONCAT_WS(', ',
             NULLIF(CONCAT_WS(' ', ag.house_no, ag.street), ''),
             NULLIF(ag.street_name, ''),
             NULLIF(ag.village, ''),
             NULLIF(ag.land_mark, ''),
             NULLIF(ag.address, ''),
             NULLIF(ag.city, ''),
             NULLIF(ag.district, ''),
             NULLIF(ag.state, ''),
             NULLIF(ag.pincode, '')
           ) AS full_address
         FROM guardians g
         LEFT JOIN LATERAL (
           SELECT ahg.address_id
           FROM address_history ahg
           WHERE ahg.entity_type = 'guardian'
             AND (ahg.entity_id = g.id::text OR ahg.entity_id = g.customer_id::text)
             AND ahg.is_current = 1
           ORDER BY ahg.changed_at DESC NULLS LAST
           LIMIT 1
         ) ahg_cur ON true
         LEFT JOIN addresses ag ON ahg_cur.address_id = ag.id
         WHERE g.customer_id = ANY($1::uuid[])
           AND g.finance_id = $2`,
        [matchedCustomerUuids, financeId]
      ),
      db.query(
        `SELECT 
           l.*,
           TO_CHAR(l.hp_date, 'YYYY-MM-DD') AS "hpDateStr",
           TO_CHAR(l.due_date, 'YYYY-MM-DD') AS "dueDateStr"
         FROM loans l
         WHERE l.customer_id = ANY($1::uuid[])
           AND l.finance_id = $2
         ORDER BY l.hp_date DESC NULLS LAST, l.id DESC`,
        [matchedCustomerUuids, financeId]
      ),
      db.query(
        `SELECT 
           vd.*,
           vi.brand,
           vi.model_name,
           vi.make_year,
           vi.fuel_type,
           vi.engine_capacity,
           vi.body_type
         FROM vehicle_detail vd
         LEFT JOIN vehicle_info vi ON vd.vehicle_info_id = vi.id
         WHERE vd.finance_id = $2
           AND vd.id IN (
             SELECT c_v.vehicle_id FROM customers c_v WHERE c_v.id = ANY($1::uuid[]) AND c_v.vehicle_id IS NOT NULL
             UNION
             SELECT l_v.vehicle_id FROM loans l_v WHERE l_v.customer_id = ANY($1::uuid[]) AND l_v.vehicle_id IS NOT NULL
           )`,
        [matchedCustomerUuids, financeId]
      ),
      db.query(
        `SELECT 
           p.id,
           p.customer_id,
           TO_CHAR(p.due_date, 'YYYY-MM-DD') AS "dueDate",
           TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS "paymentDate",
           p.bill_number AS "billNumber",
           p.amount,
           p.penalty,
           p.status,
           p.payment_mode,
           p.collected_by,
           p.remarks
         FROM payments p
         WHERE p.customer_id = ANY($1::uuid[])
           AND p.finance_id = $2
           AND COALESCE(p.payment_status, 'active') = 'active'
         ORDER BY COALESCE(p.payment_date, p.due_date) ASC NULLS LAST, p.created_at ASC`,
        [matchedCustomerUuids, financeId]
      ),
      db.query(
        `SELECT entity_type, entity_id, document_type, file_path
         FROM kyc_documents
         WHERE document_type IN ('customer_photo', 'guardian_photo')
           AND is_current = true
           AND (
             (entity_type = 'customer' AND entity_id = ANY($1::text[]))
             OR (entity_type = 'guardian' AND (
               entity_id = ANY($1::text[])
               OR entity_id IN (SELECT id::text FROM guardians WHERE customer_id = ANY($2::uuid[]) AND finance_id = $3)
             ))
           )
         ORDER BY uploaded_at DESC`,
        [matchedCustomerUuidTexts, matchedCustomerUuids, financeId]
      )
    ]);

    // Group contacts by customer_id
    const customerContactsMap = new Map();
    const guardianContactsMap = new Map();
    for (const ct of contactsRes.rows) {
      const cid = String(ct.customer_id);
      const entry = {
        id: ct.id,
        contact_type: ct.contact_type,
        type: ct.type,
        number: ct.number
      };
      if (ct.contact_type === 'guardian') {
        if (!guardianContactsMap.has(cid)) guardianContactsMap.set(cid, []);
        guardianContactsMap.get(cid).push(entry);
      } else {
        if (!customerContactsMap.has(cid)) customerContactsMap.set(cid, []);
        customerContactsMap.get(cid).push(entry);
      }
    }

    // Group guardians by customer_id and guardian_id -> customer_id
    const guardianByCustomerMap = new Map();
    const guardianIdToCustomerIdMap = new Map();
    for (const g of guardiansRes.rows) {
      const cid = String(g.customer_id);
      if (g.id) guardianIdToCustomerIdMap.set(String(g.id), cid);
      if (!guardianByCustomerMap.has(cid)) {
        guardianByCustomerMap.set(cid, g);
      }
    }

    // Group latest loan by customer_id
    const loanByCustomerMap = new Map();
    for (const l of loansRes.rows) {
      const cid = String(l.customer_id);
      if (!loanByCustomerMap.has(cid)) {
        loanByCustomerMap.set(cid, l);
      }
    }

    // Index vehicles by id
    const vehicleByIdMap = new Map();
    for (const v of vehiclesRes.rows) {
      vehicleByIdMap.set(String(v.id), v);
    }

    // Group active payments by customer_id
    const paymentsByCustomerMap = new Map();
    for (const p of paymentsRes.rows) {
      const cid = String(p.customer_id);
      if (!paymentsByCustomerMap.has(cid)) paymentsByCustomerMap.set(cid, []);
      paymentsByCustomerMap.get(cid).push({
        id: p.id,
        dueDate: p.dueDate || '',
        paymentDate: p.paymentDate || '',
        billNumber: p.billNumber || '',
        amount: Number(p.amount || 0),
        penalty: Number(p.penalty || 0),
        status: p.status || 'paid',
        payment_mode: p.payment_mode || 'cash',
        collected_by: p.collected_by || '',
        remarks: p.remarks || ''
      });
    }

    // Sign KYC photos in parallel
    const cphotoMap = new Map();
    const gphotoMap = new Map();
    await Promise.all(
      kycPhotosRes.rows.map(async (doc) => {
        const signed = await safeSignUrl(doc.file_path);
        const entityIdStr = String(doc.entity_id);
        if (doc.entity_type === 'customer' && doc.document_type === 'customer_photo') {
          if (!cphotoMap.has(entityIdStr)) cphotoMap.set(entityIdStr, signed);
        } else if (doc.entity_type === 'guardian' && doc.document_type === 'guardian_photo') {
          const cid = guardianIdToCustomerIdMap.get(entityIdStr) || entityIdStr;
          if (!gphotoMap.has(cid)) gphotoMap.set(cid, signed);
        }
      })
    );

    // Assemble per-customer items
    const items = orderedCustomers.map((c) => {
      const cid = String(c.id);
      const ccontacts = customerContactsMap.get(cid) || [];
      const gcontacts = guardianContactsMap.get(cid) || [];
      const workContact = ccontacts.find(ct => ct.type === 'work');
      const gWorkContact = gcontacts.find(ct => ct.type === 'work');

      const gRow = guardianByCustomerMap.get(cid) || null;
      const lRow = loanByCustomerMap.get(cid) || null;
      const vehicleId = c.vehicle_id || lRow?.vehicle_id || null;
      const vRow = vehicleId ? (vehicleByIdMap.get(String(vehicleId)) || null) : null;

      return {
        customer: {
          id: c.id,
          hplno: c.hplno,
          cname: c.cname || '',
          loanStatus: c.loan_status || 'active',
          brokerName: c.broker_name || '',
          cfname: {
            value: c.cfname_value || '',
            unit: c.cfname_unit || ''
          },
          full_address: c.full_address || '',
          work_office_address: c.work_office_address || '',
          work_office_phone: workContact?.number || '',
          ccontacts,
          cphoto: cphotoMap.get(cid) || null
        },
        guardian: gRow
          ? {
              id: gRow.id,
              gname: gRow.gname || '',
              gfname: {
                value: gRow.gfname_value || '',
                unit: gRow.gfname_unit || ''
              },
              full_address: gRow.full_address || '',
              work_office_address: gRow.work_office_address || '',
              work_office_phone: gWorkContact?.number || '',
              gcontacts,
              gphoto: gphotoMap.get(cid) || null
            }
          : null,
        loan: lRow
          ? {
              id: lRow.id,
              loan_type: lRow.loan_type || '',
              hpAmount: Number(lRow.hp_amount || 0),
              hpDate: lRow.hpDateStr || '',
              dueDate: lRow.dueDateStr || '',
              due_date: lRow.dueDateStr || '',
              dueMonth: Number(lRow.due_month || 0),
              interestRate: Number(lRow.interest_rate || 0),
              penaltyAmount: Number(lRow.penalty_amount || 0),
              dueAmount: Number(lRow.due_amount || 0),
              down_payment: Number(lRow.down_payment || 0),
              net_payable: Number(lRow.net_payable || 0),
              documentation_charge: Number(lRow.documentation_charge || 0)
            }
          : null,
        vehicle: vRow
          ? {
              id: vRow.id,
              vehicle_number: vRow.vehicle_number || '',
              model_name: vRow.model_name || '',
              vehicle_modal: vRow.vehicle_modal || vRow.model_name || '',
              brand: vRow.brand || '',
              chassis_number: vRow.chassis_number || '',
              engine_number: vRow.engine_number || '',
              body_type: vRow.body_type || '',
              type: vRow.type || '',
              color: vRow.color || ''
            }
          : null,
        payments: paymentsByCustomerMap.get(cid) || []
      };
    });

    return res.json({
      success: true,
      finance: financePayload,
      items,
      missingIds
    });
  } catch (err) {
    console.error('Error in POST /customers/print-batch:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch batch print data',
      details: err.message
    });
  }
});

router.get('/:customerId', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const customerId = req.params.customerId;

    // Get customer with all related data in a single query supporting dual UUID or HPL lookup
    const { rows: customer } = await conn.query(`
      SELECT 
        c.*,
        (
            SELECT ct_work.number FROM contacts ct_work 
            WHERE ct_work.customer_id = c.id 
              AND ct_work.contact_type = 'customer' 
              AND ct_work.type = 'work' 
            LIMIT 1
        ) AS work_office_phone,
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
        a.latitude,
        a.longitude,
        CONCAT_WS(', ',
          NULLIF(CONCAT_WS(' ', a.house_no, a.street), ''),
          NULLIF(a.street_name, ''),
          NULLIF(a.village, ''),
          NULLIF(a.land_mark, ''),
          NULLIF(a.address, ''),
          NULLIF(a.city, ''),
          NULLIF(a.district, ''),
          NULLIF(a.state, ''),
          NULLIF(a.pincode, '')
        ) as full_address
      FROM customers c
      LEFT JOIN address_history ah ON 
        ah.entity_type = 'customer' 
        AND ah.entity_id = c.id::text 
        AND ah.is_current = 1
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE (c.id::text = $1 OR (c.hplno::text = $1 AND c.finance_id = $2))`,
      [customerId, req.financeId]
    );

    if (!customer[0]) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const actualCustomerId = customer[0].id;

    // Get contacts with finance_id check
    const { rows: contacts } = await conn.query(
      'SELECT * FROM contacts WHERE customer_id = $1',
      [actualCustomerId]
    );

    // Get guardian with address
    const { rows: guardian } = await conn.query(`
      SELECT 
        g.*,
        (
            SELECT ct_g.number FROM contacts ct_g 
            WHERE ct_g.customer_id = g.customer_id 
              AND ct_g.contact_type = 'guardian' 
            ORDER BY CASE WHEN ct_g.type = 'mobile' THEN 1 ELSE 2 END 
            LIMIT 1
        ) AS guardian_phone,
        ag.house_no as g_house_no,
        ag.street as g_street,
        ag.street_name as g_street_name,
        ag.village as g_village,
        ag.land_mark as g_land_mark,
        ag.address as g_address,
        ag.city as g_city,
        ag.district as g_district,
        ag.state as g_state,
        ag.pincode as g_pincode,
        ag.location as g_location,
        ag.latitude as g_latitude,
        ag.longitude as g_longitude,
        CONCAT_WS(', ',
          NULLIF(CONCAT_WS(' ', ag.house_no, ag.street), ''),
          NULLIF(ag.street_name, ''),
          NULLIF(ag.village, ''),
          NULLIF(ag.land_mark, ''),
          NULLIF(ag.address, ''),
          NULLIF(ag.city, ''),
          NULLIF(ag.district, ''),
          NULLIF(ag.state, ''),
          NULLIF(ag.pincode, '')
        ) as full_address
      FROM guardians g
      LEFT JOIN address_history ahg ON 
        ahg.entity_type = 'guardian' 
        AND (ahg.entity_id = g.id::text OR ahg.entity_id = g.customer_id::text)
        AND ahg.is_current = 1
      LEFT JOIN addresses ag ON ahg.address_id = ag.id
      WHERE g.customer_id = $1`,
      [actualCustomerId]
    );

    // Get loan details
    const { rows: loan } = await conn.query(
      `SELECT 
          loans.*,
          TO_CHAR(hp_date, 'YYYY-MM-DD') AS "hpDate",
          TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date
      FROM loans 
      WHERE customer_id = $1`,
      [actualCustomerId]
    );

    // Get payments
    const { rows: payment } = await conn.query(
      `SELECT 
        id,
        due_date AS "dueDate",
        TO_CHAR(payment_date, 'YYYY-MM-DD') AS "paymentDate",
        bill_number AS "billNumber",
        amount,
        penalty,
        status,
        collected_by,
        payment_mode,
        payment_mode_1,
        payment_mode_1_amount,
        hand_loan,
        hand_loan_remark,
        remarks
      FROM payments WHERE customer_id = $1`,
      [actualCustomerId]
    );

    // Get vehicle details with joint query to vehicle_info
    const { rows: vehicle } = await conn.query(`
      SELECT 
        vd.*,
        vi.brand,
        vi.model_name,
        vi.make_year,
        vi.fuel_type,
        vi.engine_capacity,
        vi.fuel_tank_capacity,
        vi.top_speed,
        vi.mileage,
        vi.body_type
      FROM vehicle_detail vd
      LEFT JOIN vehicle_info vi ON vd.vehicle_info_id = vi.id
      WHERE vd.id = (SELECT COALESCE(l.vehicle_id, c.vehicle_id) FROM customers c LEFT JOIN loans l ON l.customer_id = c.id WHERE c.id = $1 LIMIT 1)`,
      [actualCustomerId]
    );

    // Get vehicle media from vehicle_media table
    let vehicleMedia = [];
    if (vehicle[0]?.id) {
      const { rows: vm } = await conn.query(
        'SELECT * FROM vehicle_media WHERE vehicle_id = $1 ORDER BY is_primary DESC, created_at DESC',
        [vehicle[0].id]
      );
      vehicleMedia = vm;
    }

    if (vehicle[0]) {
      vehicle[0].media = await Promise.all(vehicleMedia.map(async (m) => {
        let signedUrl = m.media_url;
        if (m.media_url && m.media_url.includes('amazonaws.com')) {
          try {
            signedUrl = await getSignedImageUrl(m.media_url);
          } catch (e) {
            console.error('Error signing vehicle media url:', e);
          }
        }
        return { ...m, signed_url: signedUrl };
      }));
      vehicle[0].vehiclePhoto = vehicle[0].media[0]?.signed_url || vehicle[0].media[0]?.media_url || null;
    }

    // Get all KYC documents for customer and guardian
    let kycDocsWithSignedUrls = [];
    try {
      const { rows: kycDocs } = await conn.query(
        `SELECT id, entity_type, entity_id, document_type, side, file_path, file_name, file_size, mime_type, verification_status, is_current, uploaded_at
         FROM kyc_documents
         WHERE (entity_type = 'customer' AND entity_id = $1)
            OR (entity_type = 'guardian' AND (entity_id = $1 OR entity_id IN (SELECT id::text FROM guardians WHERE customer_id = $2)))
         ORDER BY uploaded_at DESC`,
        [actualCustomerId.toString(), actualCustomerId]
      );

      kycDocsWithSignedUrls = await Promise.all(kycDocs.map(async (doc) => {
        let signedUrl = doc.file_path;
        if (doc.file_path && doc.file_path.includes('amazonaws.com')) {
          try {
            signedUrl = await getSignedImageUrl(doc.file_path);
          } catch (e) {
            console.error('Error signing kyc doc url:', e);
          }
        }
        return {
          ...doc,
          signed_url: signedUrl,
          original_url: doc.file_path
        };
      }));
    } catch (kErr) {
      console.error('Error fetching kyc_documents:', kErr);
    }

    // Map photo documents
    const customerPhotoDoc = kycDocsWithSignedUrls.find(d => d.entity_type === 'customer' && d.document_type === 'customer_photo');
    const customerPropertyDoc = kycDocsWithSignedUrls.find(d => d.entity_type === 'customer' && d.document_type === 'property_photo');
    const customerVehicleDoc = kycDocsWithSignedUrls.find(d => d.entity_type === 'customer' && d.document_type === 'vehicle_photo');

    const guardianPhotoDoc = kycDocsWithSignedUrls.find(d => d.entity_type === 'guardian' && d.document_type === 'guardian_photo');
    const guardianPropertyDoc = kycDocsWithSignedUrls.find(d => d.entity_type === 'guardian' && d.document_type === 'property_photo');

    const customerImages = {
      cphoto: customerPhotoDoc ? { signed_url: customerPhotoDoc.signed_url, original_url: customerPhotoDoc.original_url } : null,
      cpropertyPhoto: customerPropertyDoc ? { signed_url: customerPropertyDoc.signed_url, original_url: customerPropertyDoc.original_url } : null,
      cvehiclePhoto: customerVehicleDoc ? { signed_url: customerVehicleDoc.signed_url, original_url: customerVehicleDoc.original_url } : (vehicle[0]?.vehiclePhoto ? { signed_url: vehicle[0].vehiclePhoto, original_url: vehicle[0].vehiclePhoto } : null)
    };

    const guardianImages = {
      gphoto: guardianPhotoDoc ? { signed_url: guardianPhotoDoc.signed_url, original_url: guardianPhotoDoc.original_url } : null,
      gpropertyPhoto: guardianPropertyDoc ? { signed_url: guardianPropertyDoc.signed_url, original_url: guardianPropertyDoc.original_url } : null
    };

    // Filter contacts by type
    const customerContacts = contacts.filter(c => c.contact_type === 'customer');
    const guardianContacts = contacts.filter(c => c.contact_type === 'guardian');

    // Construct full address JSON object for customer
    const customerAddress = {
      house_no: customer[0].house_no,
      street: customer[0].street,
      street_name: customer[0].street_name,
      village: customer[0].village,
      land_mark: customer[0].land_mark,
      address: customer[0].address,
      city: customer[0].city,
      district: customer[0].district,
      state: customer[0].state,
      pincode: customer[0].pincode,
      location: customer[0].location,
      latitude: customer[0].latitude != null ? customer[0].latitude.toString() : '',
      longitude: customer[0].longitude != null ? customer[0].longitude.toString() : ''
    };

    // Construct full address JSON object for guardian
    const guardianAddress = guardian[0] ? {
      house_no: guardian[0].g_house_no,
      street: guardian[0].g_street,
      street_name: guardian[0].g_street_name,
      village: guardian[0].g_village,
      land_mark: guardian[0].g_land_mark,
      address: guardian[0].g_address,
      city: guardian[0].g_city,
      district: guardian[0].g_district,
      state: guardian[0].g_state,
      pincode: guardian[0].g_pincode,
      location: guardian[0].g_location,
      latitude: guardian[0].g_latitude != null ? guardian[0].g_latitude.toString() : '',
      longitude: guardian[0].g_longitude != null ? guardian[0].g_longitude.toString() : ''
    } : null;

    // Remove address-related fields from main customer object
    const {
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
      g_house_no,
      g_street,
      g_street_name,
      g_village,
      g_land_mark,
      g_address,
      g_city,
      g_district,
      g_state,
      g_pincode,
      ...customerRest
    } = customer[0];

    // Construct response
    const response = {
      success: true,
      customer: {
        ...customerRest,
        loanStatus: customer[0].loan_status || 'active',
        loan_status: customer[0].loan_status || 'active',
        brokerName: customer[0].broker_name || '',
        hplno: customer[0].hplno,
        full_address: customer[0].full_address, // Keep the concatenated address string
        address: customerAddress, // Add the address object
        ccontacts: customerContacts,
        contacts: contacts,
        cfname: {
          value: customer[0].cfname_value || '',
          unit: customer[0].cfname_unit || ''
        },
        // Replace image URLs with signed URL objects
        cphoto: customerImages.cphoto,
        cvehiclePhoto: customerImages.cvehiclePhoto,
        cpropertyPhoto: customerImages.cpropertyPhoto
      },
      guardian: guardian[0] ? {
        ...guardian[0],
        full_address: guardian[0].full_address, // Keep the concatenated address string
        address: guardianAddress, // Add the address object
        gcontacts: guardianContacts,
        gfname: {
          value: guardian[0].gfname_value || '',
          unit: guardian[0].gfname_unit || ''
        },
        // Replace image URLs with signed URL objects
        gphoto: guardianImages.gphoto,
        gpropertyPhoto: guardianImages.gpropertyPhoto
      } : null,
      loan: loan[0] ? {
        ...loan[0],
        hpAmount: loan[0].hp_amount !== undefined && loan[0].hp_amount !== null ? Number(loan[0].hp_amount) : (loan[0].hpAmount ?? 0),
        hp_amount: loan[0].hp_amount !== undefined && loan[0].hp_amount !== null ? Number(loan[0].hp_amount) : (loan[0].hpAmount ?? 0),
        dueAmount: loan[0].due_amount !== undefined && loan[0].due_amount !== null ? Number(loan[0].due_amount) : (loan[0].dueAmount ?? 0),
        due_amount: loan[0].due_amount !== undefined && loan[0].due_amount !== null ? Number(loan[0].due_amount) : (loan[0].dueAmount ?? 0),
        dueMonth: loan[0].due_month !== undefined && loan[0].due_month !== null ? Number(loan[0].due_month) : (loan[0].dueMonth ?? 0),
        due_month: loan[0].due_month !== undefined && loan[0].due_month !== null ? Number(loan[0].due_month) : (loan[0].dueMonth ?? 0),
        interestRate: loan[0].interest_rate !== undefined && loan[0].interest_rate !== null ? loan[0].interest_rate : (loan[0].interestRate ?? 0),
        interest_rate: loan[0].interest_rate !== undefined && loan[0].interest_rate !== null ? loan[0].interest_rate : (loan[0].interestRate ?? 0),
        penaltyAmount: loan[0].penalty_amount !== undefined && loan[0].penalty_amount !== null ? Number(loan[0].penalty_amount) : (loan[0].penaltyAmount ?? 0),
        penalty_amount: loan[0].penalty_amount !== undefined && loan[0].penalty_amount !== null ? Number(loan[0].penalty_amount) : (loan[0].penaltyAmount ?? 0),
        downPayment: loan[0].down_payment !== undefined && loan[0].down_payment !== null ? Number(loan[0].down_payment) : (loan[0].downPayment ?? 0),
        down_payment: loan[0].down_payment !== undefined && loan[0].down_payment !== null ? Number(loan[0].down_payment) : (loan[0].downPayment ?? 0),
        netPayment: loan[0].net_payment !== undefined && loan[0].net_payment !== null ? Number(loan[0].net_payment) : (loan[0].netPayment ?? 0),
        net_payment: loan[0].net_payment !== undefined && loan[0].net_payment !== null ? Number(loan[0].net_payment) : (loan[0].netPayment ?? 0),
        netPayable: loan[0].net_payable !== undefined && loan[0].net_payable !== null ? Number(loan[0].net_payable) : (loan[0].netPayable ?? 0),
        net_payable: loan[0].net_payable !== undefined && loan[0].net_payable !== null ? Number(loan[0].net_payable) : (loan[0].netPayable ?? 0),
        principlePart: loan[0].principle_part !== undefined && loan[0].principle_part !== null ? Number(loan[0].principle_part) : (loan[0].principlePart ?? 0),
        principle_part: loan[0].principle_part !== undefined && loan[0].principle_part !== null ? Number(loan[0].principle_part) : (loan[0].principlePart ?? 0),
        interestPart: loan[0].interest_part !== undefined && loan[0].interest_part !== null ? Number(loan[0].interest_part) : (loan[0].interestPart ?? 0),
        interest_part: loan[0].interest_part !== undefined && loan[0].interest_part !== null ? Number(loan[0].interest_part) : (loan[0].interestPart ?? 0),
        hpDate: loan[0].hpDate || loan[0].hp_date || null,
        hp_date: loan[0].hpDate || loan[0].hp_date || null,
        dueDate: loan[0].due_date || loan[0].dueDate || null,
        due_date: loan[0].due_date || loan[0].dueDate || null,
      } : null,
      payments: payment || [],
      vehicle: vehicle[0] ? {
        ...vehicle[0],
        vehicleNumber: vehicle[0].vehicle_number || vehicle[0].vehicleNumber || '',
        vehicle_number: vehicle[0].vehicle_number || vehicle[0].vehicleNumber || '',
        vehicleName: vehicle[0].model_name || vehicle[0].vehicle_modal || vehicle[0].vehicleName || '',
        modelName: vehicle[0].model_name || vehicle[0].vehicle_modal || vehicle[0].modelName || '',
        model_name: vehicle[0].model_name || vehicle[0].vehicle_modal || vehicle[0].modelName || '',
        vehicleModal: vehicle[0].vehicle_modal || vehicle[0].model_name || '',
        vehicle_modal: vehicle[0].vehicle_modal || vehicle[0].model_name || '',
        type: vehicle[0].body_type || vehicle[0].type || '',
        body_type: vehicle[0].body_type || vehicle[0].type || '',
        brand: vehicle[0].brand || '',
        color: vehicle[0].color || '',
        chassisNumber: vehicle[0].chassis_number || vehicle[0].chassisNumber || '',
        chassis_number: vehicle[0].chassis_number || vehicle[0].chassisNumber || '',
        engineNumber: vehicle[0].engine_number || vehicle[0].engineNumber || '',
        engine_number: vehicle[0].engine_number || vehicle[0].engineNumber || '',
        sellingPrice: vehicle[0].selling_price !== undefined ? vehicle[0].selling_price : vehicle[0].sellingPrice,
        selling_price: vehicle[0].selling_price !== undefined ? vehicle[0].selling_price : vehicle[0].sellingPrice,
      } : null,
      kyc_documents: kycDocsWithSignedUrls
    };

    res.json(response);

  } catch (err) {
    console.error('Error fetching customer:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer data',
      details: err.message
    });
  } finally {
    conn.release();
  }
});

// ─── Customer Payments ────────────────────────────────────────────────────────
router.get('/:customerId/payments', enhancedCheckFinance, async (req, res) => {
  try {
    const customerId = req.params.customerId;

    // Verify customer exists with dual lookup (UUID or HPL) scoped to tenant
    const { rows: customerCheck } = await db.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR hplno::text = $1) AND finance_id = $2',
      [customerId, req.financeId]
    );

    if (!customerCheck || customerCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found or not authorized'
      });
    }

    const actualCustomerId = customerCheck[0].id;
    const payments = await fetchCustomerPaymentsWithSubDues(db, req.financeId, actualCustomerId);

    res.json({
      success: true,
      payments,
    });
  } catch (err) {
    console.error('Error fetching payments:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
      details: err.message
    });
  }
});

router.post('/:customerId/payments', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  const rawCustomerId = req.params.customerId;

  try {
    await conn.query('BEGIN');

    // Verify customer with dual UUID / HPL lookup scoped to tenant
    const { rows: customerRows } = await conn.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR hplno::text = $1) AND finance_id = $2',
      [rawCustomerId, req.financeId]
    );

    if (!customerRows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customerId = customerRows[0].id;
    const collectedById =
      req.principalType === 'user' && req.user?.id
        ? req.user.id
        : null;

    const data = await processCustomerPaymentDb(conn, {
      ...req.body,
      financeId: req.financeId,
      customerId,
      collected_by_id: collectedById,
    });

    await conn.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data,
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('Payment error:', err);
    if (err && (err.code === '23514' || err.code === '22023')) {
      return res.status(400).json({
        success: false,
        message: err.message,
        error: err.message,
      });
    }
    if (err && err.code === 'P0002') {
      return res.status(404).json({
        success: false,
        message: err.message,
        error: err.message,
      });
    }
    res.status(500).json({
      success: false,
      message: 'Payment failed',
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// Get all history entries for a customer
router.get('/:customerId/history', enhancedCheckFinance, async (req, res) => {
  try {
    const { customerId } = req.params;

    // First verify customer exists and belongs to this finance (supports dual UUID or HPL lookup)
    const { rows: customerCheck } = await db.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2))',
      [customerId, req.financeId]
    );

    if (customerCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found or access denied'
      });
    }

    const actualCustomerId = customerCheck[0].id;

    const { rows: history } = await db.query(`
      SELECT 
        id,
        finance_id,
        customer_id,
        entry_type as type,
        message,
        entry_date as date,
        created_by,
        created_at,
        updated_at
      FROM history_entries 
      WHERE customer_id = $1
      ORDER BY entry_date DESC, created_at DESC
    `, [actualCustomerId]);

    res.json({
      success: true,
      history
    });
  } catch (err) {
    console.error('Error fetching history entries:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch history entries'
    });
  }
});

// Add new history entry
router.post('/:customerId/history', enhancedCheckFinance, async (req, res) => {
  try {
    const { customerId } = req.params;
    const financeId = req.financeId;
    const { type, message, date, hplno } = req.body;

    // Validate input
    if (!type || !message || !date) {
      return res.status(400).json({
        success: false,
        error: 'Type, message, and date are required'
      });
    }

    if (!['call', 'rc_book'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid entry type. Must be "call" or "rc_book"'
      });
    }

    // Verify customer exists and belongs to this finance (supports dual UUID or HPL lookup)
    const { rows: customerCheck } = await db.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2))',
      [customerId, financeId]
    );

    if (customerCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found or access denied'
      });
    }

    const actualCustomerId = customerCheck[0].id;

    // Insert new history entry
    const { rows: result } = await db.query(
      `INSERT INTO history_entries 
       (finance_id, customer_id, entry_type, message, entry_date, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        financeId,
        actualCustomerId,
        type,
        message.trim(),
        date,
        req.user?.user_name || req.user?.email || 'System'
      ]
    );

    // Log activity
    const __ins30 = pgInsertClause({
      finance_id: financeId,
      type: 'history',
      reference_id: hplno,
      description: `Added ${type === 'call' ? 'call' : 'RC book'} history for customer ${hplno}`,
      created_by: req.user?.user_name || 'System'
    });
    await db.query(
      `INSERT INTO recent_activity (${__ins30.columns}) VALUES (${__ins30.placeholders})`,
      __ins30.values
    );

    // Broadcast activity
    const newActivity = {
      finance_id: financeId,
      type: 'history',
      reference_id: hplno,
      description: `Added ${type === 'call' ? 'call' : 'RC book'} history for customer ${hplno}`,
      created_by: req.user?.user_name || 'System'
    };

    if (typeof broadcastActivity === 'function') {
      broadcastActivity(newActivity);
    }

    res.json({
      success: true,
      id: result[0].id,
      message: 'History entry added successfully'
    });
  } catch (err) {
    console.error('Error adding history entry:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to add history entry'
    });
  }
});

// Update history entry
router.put('/history/:id', enhancedCheckFinance, async (req, res) => {
  try {
    const { id } = req.params;
    const financeId = req.financeId;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Verify entry exists and belongs to this finance
    const { rows: entryCheck } = await db.query(
      'SELECT id FROM history_entries WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );

    if (entryCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found or access denied'
      });
    }

    // Update entry
    await db.query(
      'UPDATE history_entries SET message = $1 WHERE id = $2',
      [message.trim(), id]
    );

    // Log activity
    const { rows: updatedEntry } = await db.query(
      'SELECT customer_id, entry_type FROM history_entries WHERE id = $1',
      [id]
    );

    if (updatedEntry.length > 0) {
      const __ins31 = pgInsertClause({
        finance_id: financeId,
        type: 'history',
        reference_id: updatedEntry[0].customer_id,
        description: `Updated ${updatedEntry[0].entry_type === 'call' ? 'call' : 'RC book'} history for customer ${updatedEntry[0].customer_hplno}`,
        created_by: req.user?.user_name || 'System'
      });
      await db.query(
        `INSERT INTO recent_activity (${__ins31.columns}) VALUES (${__ins31.placeholders})`,
        __ins31.values
      );
    }

    res.json({
      success: true,
      message: 'History entry updated successfully'
    });
  } catch (err) {
    console.error('Error updating history entry:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update history entry'
    });
  }
});

router.delete('/history/:id', enhancedCheckFinance, async (req, res) => {
  try {
    const { id } = req.params;
    const financeId = req.financeId;

    // Get entry details before deletion for logging
    const { rows: entryDetails } = await db.query(
      'SELECT customer_id, entry_type FROM history_entries WHERE id = $1 AND finance_id = $2',
      [id, financeId]
    );

    if (entryDetails.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found or access denied'
      });
    }

    // Delete entry
    await db.query(
      'DELETE FROM history_entries WHERE id = $1',
      [id]
    );

    // Log activity
    const __ins32 = pgInsertClause({
      finance_id: financeId,
      type: 'history',
      reference_id: entryDetails[0].customer_id,
      description: `Deleted ${entryDetails[0].entry_type === 'call' ? 'call' : 'RC book'} history for customer ${entryDetails[0].customer_hplno}`,
      created_by: req.user?.user_name || 'System'
    });
    await db.query(
      `INSERT INTO recent_activity (${__ins32.columns}) VALUES (${__ins32.placeholders})`,
      __ins32.values
    );

    res.json({
      success: true,
      message: 'History entry deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting history entry:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete history entry'
    });
  }
});

// Update customer status (for seized/unseized)
router.put('/:customerId/update-status', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const customerId = req.params.customerId;
    const { loanStatus, vehicle_number, status, hplno } = req.body;
    const financeId = req.financeId;
    console.log('status:', status);
    // Validate loan status
    const validStatuses = ['active', 'close', 'seized'];
    if (!validStatuses.includes(loanStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid loan status'
      });
    }

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custCheck } = await conn.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2))',
      [customerId, financeId]
    );
    if (!custCheck.length) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const actualCustomerId = custCheck[0].id;

    // Update customer loan status
    await conn.query(
      'UPDATE customers SET loan_status = $1 WHERE id = $2',
      [loanStatus, actualCustomerId]
    );
    await conn.query(
      'UPDATE vehicle_detail SET status = $1 WHERE vehicle_number = $2',
      [status, vehicle_number]
    );

    // Log activity
    const __ins33 = pgInsertClause({
      finance_id: financeId,
      type: 'customer',
      reference_id: hplno,
      description: `Customer loan status updated to ${loanStatus}`,
      created_by: req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins33.columns}) VALUES (${__ins33.placeholders})`,
      __ins33.values
    );

    res.json({
      success: true,
      message: `Customer status updated to ${loanStatus}`
    });
  } catch (err) {
    console.error('Error updating customer status:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update customer status'
    });
  } finally {
    conn.release();
  }
});

// Update customer address location (Google Maps string / GPS coordinates)
router.put('/:customerId/update-location', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const customerId = req.params.customerId;
    const { location, latitude, longitude } = req.body;
    const financeId = req.financeId;

    if (!location || !location.trim()) {
      return res.status(400).json({ success: false, error: 'Location string is required' });
    }

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custCheck } = await conn.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2))',
      [customerId, financeId]
    );
    if (!custCheck.length) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const actualCustomerId = custCheck[0].id;

    // Check if customer has an existing address via address_history
    const { rows: addrRows } = await conn.query(
      `SELECT a.id 
       FROM address_history ah 
       JOIN addresses a ON ah.address_id = a.id 
       WHERE ah.entity_type = 'customer' 
         AND ah.entity_id = $1 
         AND ah.is_current = 1 
       LIMIT 1`,
      [actualCustomerId.toString()]
    );

    if (addrRows.length > 0) {
      await conn.query(
        `UPDATE addresses 
         SET location = $1, 
             latitude = COALESCE($2, latitude), 
             longitude = COALESCE($3, longitude) 
         WHERE id = $4`,
        [location.trim(), latitude || null, longitude || null, addrRows[0].id]
      );
    } else {
      const { rows: newAddr } = await conn.query(
        `INSERT INTO addresses (location, latitude, longitude) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        [location.trim(), latitude || null, longitude || null]
      );
      await conn.query(
        `INSERT INTO address_history (entity_type, entity_id, address_id, is_current) 
         VALUES ('customer', $1, $2, 1)`,
        [actualCustomerId.toString(), newAddr[0].id]
      );
    }

    // Update customer home coordinates if coordinates provided
    if (latitude || longitude) {
      await conn.query(
        `UPDATE customers 
         SET home_latitude = COALESCE($1, home_latitude), 
             home_longitude = COALESCE($2, home_longitude) 
         WHERE id = $3`,
        [latitude || null, longitude || null, actualCustomerId]
      );
    }

    res.json({
      success: true,
      message: 'Customer location updated successfully',
      location: location.trim()
    });
  } catch (err) {
    console.error('Error updating customer location:', err);
    res.status(500).json({ success: false, error: 'Failed to update customer location' });
  } finally {
    conn.release();
  }
});

// Update guardian address location
router.put('/:customerId/update-guardian-location', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const customerId = req.params.customerId;
    const { location, latitude, longitude } = req.body;
    const financeId = req.financeId;

    if (!location || !location.trim()) {
      return res.status(400).json({ success: false, error: 'Location string is required' });
    }

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custCheck } = await conn.query(
      'SELECT id, hplno FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2))',
      [customerId, financeId]
    );
    if (!custCheck.length) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const actualCustomerId = custCheck[0].id;

    // Find guardian record
    const { rows: guardianRows } = await conn.query(
      'SELECT id FROM guardians WHERE customer_id = $1 LIMIT 1',
      [actualCustomerId]
    );

    const guardianId = guardianRows[0]?.id;

    // Check if guardian has an existing address via address_history
    const { rows: addrRows } = await conn.query(
      `SELECT a.id 
       FROM address_history ah 
       JOIN addresses a ON ah.address_id = a.id 
       WHERE ah.entity_type = 'guardian' 
         AND (ah.entity_id = $1 OR ah.entity_id = $2) 
         AND ah.is_current = 1 
       LIMIT 1`,
      [guardianId ? guardianId.toString() : actualCustomerId.toString(), actualCustomerId.toString()]
    );

    if (addrRows.length > 0) {
      await conn.query(
        `UPDATE addresses 
         SET location = $1, 
             latitude = COALESCE($2, latitude), 
             longitude = COALESCE($3, longitude) 
         WHERE id = $4`,
        [location.trim(), latitude || null, longitude || null, addrRows[0].id]
      );
    } else {
      const { rows: newAddr } = await conn.query(
        `INSERT INTO addresses (location, latitude, longitude) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        [location.trim(), latitude || null, longitude || null]
      );
      const entityId = guardianId ? guardianId.toString() : actualCustomerId.toString();
      await conn.query(
        `INSERT INTO address_history (entity_type, entity_id, address_id, is_current) 
         VALUES ('guardian', $1, $2, 1)`,
        [entityId, newAddr[0].id]
      );
    }

    res.json({
      success: true,
      message: 'Guardian location updated successfully',
      location: location.trim()
    });
  } catch (err) {
    console.error('Error updating guardian location:', err);
    res.status(500).json({ success: false, error: 'Failed to update guardian location' });
  } finally {
    conn.release();
  }
});

router.post('/reloan', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();

  try {
    const {
      oldCustomerId,
      oldHplNo,
      newHplNo,
      reloanAmount,
      loanDetails,
      settlementPayment,
      customerName,
      vehicleId
    } = req.body;
    console.log('Closing old customer:', oldCustomerId);
    const financeId = req.financeId;
    const currentUser = req.user?.email || req.user?.user_name || 'System';

    if (!oldHplNo || !newHplNo || !reloanAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: oldHplNo, newHplNo, reloanAmount'
      });
    }

    await conn.query('BEGIN');

    try {
      // 1. Verify old customer exists
      const { rows: existingCustomer } = await conn.query(
        'SELECT * FROM customers WHERE hplno = $1 AND finance_id = $2',
        [oldHplNo, financeId]
      );

      if (existingCustomer.length === 0) {
        throw new Error(`Original customer HPL ${oldHplNo} not found`);
      }

      const oldCustomer = existingCustomer[0];

      // 2. Create settlement payment for old loan


      // 3. Create new customer record
      const customerNewdataIns = pgInsertClause({
        finance_id: financeId,
        hplno: newHplNo,
        loanStatus: 'active',
        brokerName: oldCustomer.brokerName,
        cname: oldCustomer.cname,
        cfname_value: oldCustomer.cfname_value,
        cfname_unit: oldCustomer.cfname_unit,
        vehicle_id: oldCustomer.vehicle_id, // Keep same vehicle
        aadhar_id: oldCustomer.aadhar_id,
        other_govt_id_type: oldCustomer.other_govt_id_type,
        other_govt_id_number: oldCustomer.other_govt_id_number,
        profession: oldCustomer.profession,
        work_office_address: oldCustomer.work_office_address
      });
      const { rows: customerNewdata } = await conn.query(
        `INSERT INTO customers (${customerNewdataIns.columns}) VALUES (${customerNewdataIns.placeholders}) RETURNING id`,
        customerNewdataIns.values
      );
      const customerId = customerNewdata[0].id;

      // Copy kyc_documents from old customer to new customer
      const { rows: oldDocs } = await conn.query(
        "SELECT * FROM kyc_documents WHERE entity_type = 'customer' AND entity_id = $1",
        [String(oldCustomer.id)]
      );
      for (const doc of oldDocs) {
        await saveKycDocument(conn, {
          financeId,
          entityType: 'customer',
          entityId: customerId,
          documentType: doc.document_type,
          filePath: doc.file_path
        });
      }

      if (settlementPayment) {
        const __ins34 = pgInsertClause({
          finance_id: financeId,
          customer_id: customerId,
          dueDate: settlementPayment.dueDate || new Date().toISOString().split('T')[0],
          paymentDate: settlementPayment.paymentDate || new Date().toISOString().split('T')[0],
          billNumber: settlementPayment.billNumber || `REL-${oldHplNo}-${Date.now()}`,
          amount: settlementPayment.amount || 0,
          penalty: settlementPayment.penalty || 0,
          collected_by: settlementPayment.collected_by || currentUser,
          hand_loan: settlementPayment.hand_loan || 0,
          hand_loan_remark: settlementPayment.hand_loan_remark || '',
          payment_mode: settlementPayment.payment_mode || 'cash',
          payment_mode_1: settlementPayment.payment_mode_1 || null,
          payment_mode_1_amount: settlementPayment.payment_mode_1_amount || 0,
          remarks: settlementPayment.remarks || `Reloan settlement - New HPL: ${newHplNo}`
        });
        await conn.query(
          `INSERT INTO payments (${__ins34.columns}) VALUES (${__ins34.placeholders})`,
          __ins34.values
        );
      }

      // 4. Update guardian's customer_hplno to point to new HPL


      // 5. Update customer contacts to point to new HPL
      await conn.query(
        'UPDATE contacts SET customer_id = $1 WHERE customer_id = $2 AND contact_type = \'customer\'',
        [customerId, oldCustomerId]
      );

      // 6. Update guardian contacts to point to new HPL
      await conn.query(
        'UPDATE contacts SET customer_id = $1 WHERE customer_id = $2 AND contact_type = \'guardian\'',
        [customerId, oldCustomerId]
      );

      await conn.query(
        'UPDATE guardians SET customer_id = $1 WHERE customer_id = $2',
        [customerId, oldCustomerId]
      );

      // 7. Update address_history to point to new HPL
      await conn.query(
        'UPDATE address_history SET entity_id = $1 WHERE entity_type = \'customer\' AND entity_id = $2::text',
        [String(customerId), String(oldCustomerId)]
      );

      // Update guardian address_history
      await conn.query(
        'UPDATE address_history SET entity_id = $1 WHERE entity_type = \'guardian\' AND entity_id = $2::text',
        [String(customerId), String(oldCustomerId)]
      );



      // 8. Create new loan for the reloan
      const { rows: oldLoan } = await conn.query(
        'SELECT * FROM loans WHERE customer_id = $1',
        [oldCustomerId]
      );

      if (oldLoan.length > 0) {
        const oldLoanData = oldLoan[0];
        const __ins35 = pgInsertClause({
          finance_id: financeId,
          customer_id: customerId,
          vehicle_id: oldCustomer.vehicle_id || oldLoanData.vehicle_id || null,
          loan_type: loanDetails?.loan_type || oldLoanData.loan_type,
          hpAmount: reloanAmount,
          hpDate: loanDetails?.hpDate || new Date().toISOString().split('T')[0],
          due_date: loanDetails?.due_date || new Date().toISOString().split('T')[0],
          dueMonth: loanDetails?.dueMonth || oldLoanData.dueMonth,
          interestRate: loanDetails?.interestRate || oldLoanData.interestRate,
          penaltyAmount: loanDetails?.penaltyAmount || oldLoanData.penaltyAmount,
          principle_part: loanDetails?.principle_part || oldLoanData.principle_part,
          interest_part: loanDetails?.interest_part || oldLoanData.interest_part,
          dueAmount: loanDetails?.dueAmount || oldLoanData.dueAmount,
          down_payment: loanDetails?.down_payment || 0,
          net_payment: reloanAmount,
          net_payable: reloanAmount,
          pay_mode_1_amount: loanDetails?.pay_mode_1_amount || oldLoanData.pay_mode_1_amount,
          hand_loan: loanDetails?.hand_loan || oldLoanData.hand_loan,
          hand_loan_remarks: loanDetails?.hand_loan_remarks || `Reloan from ${oldHplNo}`,
          broker_name: loanDetails?.broker_name || oldLoanData.broker_name,
          dealer_name: oldLoanData.dealer_name,
          documentation_charge: loanDetails?.documentation_charge || oldLoanData.documentation_charge,
          broker_commission: loanDetails?.broker_commission || oldLoanData.broker_commission,
          remarks: loanDetails?.remarks || `Reloan from ${oldHplNo}`
        });
        await conn.query(
          `INSERT INTO loans (${__ins35.columns}) VALUES (${__ins35.placeholders})`,
          __ins35.values
        );
      } else {
        // Create new loan if old loan doesn't exist
        const __ins36 = pgInsertClause({
          finance_id: financeId,
          customer_id: customerId,
          vehicle_id: oldCustomer.vehicle_id || null,
          loan_type: loanDetails?.loan_type || 'two_wheeler',
          hpAmount: reloanAmount,
          hpDate: loanDetails?.hpDate || new Date().toISOString().split('T')[0],
          due_date: loanDetails?.due_date || new Date().toISOString().split('T')[0],
          dueMonth: loanDetails?.dueMonth || 24,
          interestRate: loanDetails?.interestRate || 1.5,
          penaltyAmount: loanDetails?.penaltyAmount || 0,
          principle_part: loanDetails?.principle_part || 0,
          interest_part: loanDetails?.interest_part || 0,
          dueAmount: loanDetails?.dueAmount || (reloanAmount / 24),
          down_payment: loanDetails?.down_payment || 0,
          net_payment: reloanAmount,
          net_payable: reloanAmount,
          pay_mode_1_amount: loanDetails?.pay_mode_1_amount || 0,
          hand_loan: loanDetails?.hand_loan || 0,
          hand_loan_remarks: loanDetails?.hand_loan_remarks || `Reloan from ${oldHplNo}`,
          broker_name: loanDetails?.broker_name || oldCustomer.brokerName,
          documentation_charge: loanDetails?.documentation_charge || 2000,
          broker_commission: loanDetails?.broker_commission || 5000,
          remarks: loanDetails?.remarks || `Reloan from ${oldHplNo}`
        });
        await conn.query(
          `INSERT INTO loans (${__ins36.columns}) VALUES (${__ins36.placeholders})`,
          __ins36.values
        );
      }

      // 9. Update old loan status to 'closed' (optional - keep it as reference)
      // We'll keep the old loan record for historical purposes

      // 10. Update old customer status to 'close'
      await conn.query(
        'UPDATE customers SET loan_status = $1 WHERE id = $2',
        ['close', oldCustomerId]
      );

      // 11. Log activities
      // Log for new loan creation
      const __ins37 = pgInsertClause({
        finance_id: financeId,
        type: 'reloan',
        reference_id: newHplNo,
        description: `Reloan created from ${oldHplNo} to ${newHplNo} for ${customerName || oldCustomer.cname}`,
        amount: reloanAmount,
        created_by: currentUser
      });
      await conn.query(
        `INSERT INTO recent_activity (${__ins37.columns}) VALUES (${__ins37.placeholders})`,
        __ins37.values
      );

      // Log for old loan closure
      const __ins38 = pgInsertClause({
        finance_id: financeId,
        type: 'customer',
        reference_id: oldHplNo,
        description: `Loan closed due to reloan to new HPL ${newHplNo}`,
        created_by: currentUser
      });
      await conn.query(
        `INSERT INTO recent_activity (${__ins38.columns}) VALUES (${__ins38.placeholders})`,
        __ins38.values
      );

      // 12. If there's history entries, update them to new HPL
      await conn.query(
        'UPDATE history_entries SET customer_id = $1 WHERE customer_id = $2',
        [customerId, oldCustomerId]
      );

      await conn.query('COMMIT');

      res.json({
        success: true,
        message: 'Reloan created successfully',
        data: {
          oldHplNo,
          oldLoanStatus: 'close',
          newHplNo,
          newLoanStatus: 'active',
          reloanAmount,
          customerName: customerName || oldCustomer.cname,
          guardianUpdated: true,
          contactsUpdated: true,
          addressHistoryUpdated: true
        }
      });

    } catch (err) {
      await conn.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error creating reloan:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create reloan',
      details: err.message
    });
  } finally {
    conn.release();
  }
});

// seizure endpoint - creates seizing_vehicle record + updates loan/vehicle status
router.put('/:id/seize', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const { id } = req.params;
    const financeId = req.financeId;
    const {
      hplno, vehicle_number, status, loanStatus,
      seizing_charge, description, godown_id, seized_by, seizing_date, godown_name
    } = req.body;

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custRows } = await conn.query(
      `SELECT id, hplno, vehicle_id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2 LIMIT 1`,
      [id, financeId]
    );
    if (custRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const customer = custRows[0];
    const actualCustomerId = customer.id;

    // Update customer loan status to 'seized'
    await conn.query(
      'UPDATE customers SET loan_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [loanStatus || 'seized', actualCustomerId]
    );

    // Resolve vehicle_id from customer or vehicle_number
    let vehicleId = customer.vehicle_id;
    if (!vehicleId && vehicle_number) {
      const { rows: vehRows } = await conn.query(
        'SELECT id FROM vehicle_detail WHERE vehicle_number = $1 AND finance_id = $2 LIMIT 1',
        [vehicle_number, financeId]
      );
      if (vehRows.length > 0) vehicleId = vehRows[0].id;
    }

    if (vehicleId) {
      await conn.query(
        'UPDATE vehicle_detail SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND finance_id = $3',
        [status || 'seized', vehicleId, financeId]
      );
    }

    // Resolve godown_id from candidate
    let resolvedGodownId = null;
    const candidateGodown = godown_id || req.body.godown || godown_name;
    if (candidateGodown) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(candidateGodown).trim());
      if (isUuid) {
        resolvedGodownId = candidateGodown;
      } else {
        const { rows: gRows } = await conn.query(
          `SELECT id FROM godowns WHERE (name = $1 OR id::text = $1) AND (finance_id = $2 OR finance_id IS NULL) LIMIT 1`,
          [candidateGodown, financeId]
        );
        if (gRows.length > 0) resolvedGodownId = gRows[0].id;
      }
    }

    // Insert seizing record if charge is present and vehicle is identified
    if (seizing_charge !== undefined && vehicleId) {
      const chargeNum = parseFloat(seizing_charge) || 0;
      await conn.query(
        `INSERT INTO seizing_vehicle (finance_id, customer_id, vehicle_id, seizing_charge, description, godown_id, seized_by, seizing_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')`,
        [
          financeId,
          actualCustomerId,
          vehicleId,
          chargeNum,
          description ? String(description).trim().slice(0, 255) : null,
          resolvedGodownId,
          (seized_by ? String(seized_by).trim().slice(0, 150) : null) || req.user?.username || req.user?.user_name || 'System',
          seizing_date || new Date().toISOString().split('T')[0]
        ]
      );
    }

    // Log activity
    const __ins39 = pgInsertClause({
      finance_id: financeId,
      type: 'customer',
      reference_id: customer.hplno || actualCustomerId,
      description: `Vehicle seized | Godown: ${godown_name || ''} | Charge: ${seizing_charge || 0}`,
      created_by: req.user?.username || req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins39.columns}) VALUES (${__ins39.placeholders})`,
      __ins39.values
    );

    res.json({
      success: true,
      message: 'Vehicle seized successfully'
    });
  } catch (err) {
    console.error('Error seizing vehicle:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to seize vehicle'
    });
  } finally {
    conn.release();
  }
});

// GET seizing records for a customer
router.get('/:id/seizing', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const { id } = req.params;
    const financeId = req.financeId;

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custRows } = await conn.query(
      `SELECT id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2 LIMIT 1`,
      [id, financeId]
    );
    const actualCustomerId = custRows.length > 0 ? custRows[0].id : id;

    const { rows: records } = await conn.query(
      `SELECT sv.*, 
              g.name AS godown, 
              g.name AS godown_name
       FROM seizing_vehicle sv
       LEFT JOIN godowns g ON sv.godown_id = g.id
       WHERE sv.customer_id = $1 AND sv.finance_id = $2
       ORDER BY sv.created_at DESC`,
      [actualCustomerId, financeId]
    );

    const pendingTotal = records
      .filter(r => r.status === 'Pending')
      .reduce((sum, r) => sum + parseFloat(r.seizing_charge || 0), 0);

    res.json({
      success: true,
      records,
      pendingTotal
    });
  } catch (err) {
    console.error('Error fetching seizing records:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch seizing records' });
  } finally {
    conn.release();
  }
});

// PUT unseize - update seizing record status
router.put('/:id/unseize', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const { id } = req.params;
    const financeId = req.financeId;
    const { seizing_id, status, loanStatus, vehicle_number, vehicleStatus } = req.body;

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custRows } = await conn.query(
      `SELECT id, vehicle_id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2 LIMIT 1`,
      [id, financeId]
    );
    if (custRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const customer = custRows[0];
    const actualCustomerId = customer.id;

    // Update the seizing record status if provided
    if (seizing_id) {
      const validStatuses = ['Pending', 'Paid', 'Cancelled'];
      let normStatus = 'Paid';
      if (status) {
        const cap = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        if (validStatuses.includes(cap)) normStatus = cap;
        else if (validStatuses.includes(status)) normStatus = status;
      }
      await conn.query(
        `UPDATE seizing_vehicle 
         SET status = COALESCE($1, 'Paid'), release_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND customer_id = $3 AND finance_id = $4`,
        [normStatus, seizing_id, actualCustomerId, financeId]
      );
    }

    // Update customer loan status
    await conn.query(
      'UPDATE customers SET loan_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [loanStatus || 'active', actualCustomerId]
    );

    // Update vehicle status
    let vehicleId = customer.vehicle_id;
    if (!vehicleId && vehicle_number) {
      const { rows: vRows } = await conn.query(
        'SELECT id FROM vehicle_detail WHERE vehicle_number = $1 AND finance_id = $2 LIMIT 1',
        [vehicle_number, financeId]
      );
      if (vRows.length > 0) vehicleId = vRows[0].id;
    }

    if (vehicleId) {
      await conn.query(
        'UPDATE vehicle_detail SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND finance_id = $3',
        [vehicleStatus || 'sales', vehicleId, financeId]
      );
    }

    // Log activity
    const __ins40 = pgInsertClause({
      finance_id: financeId,
      type: 'customer',
      reference_id: actualCustomerId,
      description: `Vehicle unseized - status: ${status || 'active'}`,
      created_by: req.user?.username || req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins40.columns}) VALUES (${__ins40.placeholders})`,
      __ins40.values
    );

    res.json({ success: true, message: 'Vehicle unseized successfully' });
  } catch (err) {
    console.error('Error unseizing vehicle:', err);
    res.status(500).json({ success: false, error: 'Failed to unseize vehicle' });
  } finally {
    conn.release();
  }
});

// PUT /:id/seizing/:seizingId — edit a seizing record
router.put('/:id/seizing/:seizingId', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const { id, seizingId } = req.params;
    const financeId = req.financeId;
    const { seizing_charge, description, godown, godown_id, seized_by, seizing_date, status, release_date } = req.body;

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custRows } = await conn.query(
      `SELECT id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2 LIMIT 1`,
      [id, financeId]
    );
    if (custRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const actualCustomerId = custRows[0].id;

    // Validate seizing_charge
    const chargeNum = parseFloat(seizing_charge);
    if (isNaN(chargeNum) || chargeNum < 0) {
      return res.status(400).json({ success: false, error: 'Invalid seizing charge: must be a non-negative number' });
    }

    // Validate seized_by
    if (!seized_by || !String(seized_by).trim()) {
      return res.status(400).json({ success: false, error: 'seized_by is required' });
    }
    const sanitizedSeizedBy = String(seized_by).trim().slice(0, 150);

    // Validate seizing_date
    if (!seizing_date) {
      return res.status(400).json({ success: false, error: 'seizing_date is required' });
    }

    // Validate & normalize status enum ('Pending', 'Paid', 'Cancelled')
    const validStatuses = ['Pending', 'Paid', 'Cancelled'];
    let normalizedStatus = 'Pending';
    if (status) {
      const cap = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      if (validStatuses.includes(cap)) {
        normalizedStatus = cap;
      } else if (validStatuses.includes(status)) {
        normalizedStatus = status;
      } else {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
    }

    // Resolve godown_id from candidate
    let resolvedGodownId = null;
    const candidateGodown = godown_id || godown;
    if (candidateGodown) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(candidateGodown).trim());
      if (isUuid) {
        resolvedGodownId = candidateGodown;
      } else {
        const { rows: gRows } = await conn.query(
          `SELECT id FROM godowns WHERE (name = $1 OR id::text = $1) AND (finance_id = $2 OR finance_id IS NULL) LIMIT 1`,
          [candidateGodown, financeId]
        );
        if (gRows.length > 0) {
          resolvedGodownId = gRows[0].id;
        }
      }
    }

    const cleanReleaseDate = release_date && String(release_date).trim() ? String(release_date).trim() : null;
    const cleanDesc = description && String(description).trim() ? String(description).trim().slice(0, 255) : null;

    const updateResult = await conn.query(
      `UPDATE seizing_vehicle
       SET seizing_charge = $1, 
           description = $2, 
           godown_id = $3, 
           seized_by = $4,
           seizing_date = $5, 
           status = $6, 
           release_date = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND customer_id = $9 AND finance_id = $10
       RETURNING id, customer_id, seizing_charge, godown_id, seized_by, seizing_date, status, release_date`,
      [
        chargeNum,
        cleanDesc,
        resolvedGodownId,
        sanitizedSeizedBy,
        seizing_date,
        normalizedStatus,
        cleanReleaseDate,
        seizingId,
        actualCustomerId,
        financeId,
      ]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Seizing record not found' });
    }

    // Log activity
    const __ins41 = pgInsertClause({
      finance_id: financeId,
      type: 'customer',
      reference_id: actualCustomerId,
      description: `Seizing record updated: Charge ₹${chargeNum}, Status: ${normalizedStatus}`,
      created_by: req.user?.username || req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins41.columns}) VALUES (${__ins41.placeholders})`,
      __ins41.values
    );

    res.json({
      success: true,
      message: 'Seizing record updated successfully',
      data: updateResult.rows[0]
    });
  } catch (err) {
    console.error('Error updating seizing record:', err);
    res.status(500).json({ success: false, error: 'Failed to update seizing record' });
  } finally {
    conn.release();
  }
});

// DELETE /:id/seizing/:seizingId — delete a seizing record
router.delete('/:id/seizing/:seizingId', enhancedCheckFinance, async (req, res) => {
  const conn = await db.connect();
  try {
    const { id, seizingId } = req.params;
    const financeId = req.financeId;

    // Resolve customer with dual UUID or HPL lookup
    const { rows: custRows } = await conn.query(
      `SELECT id FROM customers WHERE (id::text = $1 OR (hplno::text = $1 AND finance_id = $2)) AND finance_id = $2 LIMIT 1`,
      [id, financeId]
    );
    const actualCustomerId = custRows.length > 0 ? custRows[0].id : id;

    const result = await conn.query(
      `DELETE FROM seizing_vehicle WHERE id = $1 AND customer_id = $2 AND finance_id = $3`,
      [seizingId, actualCustomerId, financeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Seizing record not found' });
    }

    // Log activity
    const __ins42 = pgInsertClause({
      finance_id: financeId,
      type: 'customer',
      reference_id: actualCustomerId,
      description: `Seizing record ${seizingId} deleted`,
      created_by: req.user?.username || req.user?.user_name || 'System'
    });
    await conn.query(
      `INSERT INTO recent_activity (${__ins42.columns}) VALUES (${__ins42.placeholders})`,
      __ins42.values
    );

    res.json({ success: true, message: 'Seizing record deleted successfully' });
  } catch (err) {
    console.error('Error deleting seizing record:', err);
    res.status(500).json({ success: false, error: 'Failed to delete seizing record' });
  } finally {
    conn.release();
  }
});

router.cleanUuid = cleanUuid;
router.cleanContactNumber = cleanContactNumber;
router.resolveVehicleInfoId = resolveVehicleInfoId;
router.validateCustomerPayload = validateCustomerPayload;
router.validateGuardianPayload = validateGuardianPayload;
router.validateVehiclePayload = validateVehiclePayload;

module.exports = router;