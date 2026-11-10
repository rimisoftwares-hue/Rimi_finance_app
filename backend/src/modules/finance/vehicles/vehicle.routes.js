const express = require('express');
const router = express.Router();
const { db } = require('../../../config/database.config');
const multer = require('multer');
const { enhancedCheckFinance } = require('../../../middleware/auth.middleware');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Jimp = require('jimp');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require("dotenv").config({ path: path.join(__dirname, '../.env') });

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion || 'ap-south-1', // Mumbai region
});

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Helper function to generate unique filename
const generateFileName = (originalname) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E9);
  const extension = path.extname(originalname);
  return `${timestamp}-${random}${extension}`;
};

// -----------------------------------------------------------------------
// Postgres query helpers
// `db` is a pg Pool/Client wrapper (see auth.middleware.js: db.query(sql, [$1,$2..]) -> { rows }).
// mysql2-style `?` placeholders and `INSERT ... SET ?` do not exist in pg,
// so every write query is built through these two helpers instead.
// -----------------------------------------------------------------------

// Build a parameterized INSERT from a plain object -> { sql, values }
const buildInsert = (table, data, returning = 'id') => {
  const keys = Object.keys(data);
  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map((k) => data[k]);
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING ${returning}`;
  return { sql, values };
};

// Build a parameterized UPDATE from a plain object -> { sql, values }
// whereSql should use $1, $2... referring only to whereValues; they get
// shifted automatically to sit after the SET values.
const buildUpdate = (table, data, whereSql, whereValues) => {
  const keys = Object.keys(data);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map((k) => data[k]);
  const offset = values.length;
  const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);
  const sql = `UPDATE ${table} SET ${setClause} WHERE ${shiftedWhere}`;
  return { sql, values: [...values, ...whereValues] };
};

// Helper function to upload image to S3 with resizing (KEEP OBJECTS PRIVATE)
const uploadToS3 = async (
  fileBuffer,
  fileName,
  folder = 'vehicles',
  quality = 85,
  maxWidth = 1920
) => {
  try {
    const image = await Jimp.read(fileBuffer);

    // Resize only if image is wider than maxWidth
    if (image.bitmap.width > maxWidth) {
      image.resize(maxWidth, Jimp.AUTO);
    }

    image.quality(quality);

    const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `${folder}/${fileName}`,
        Body: buffer,
        ContentType: 'image/jpeg'
      })
    );

    return `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${folder}/${fileName}`;
  } catch (error) {
    console.error('S3 upload failed:', error);
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
    // Don't return original URL - it's private
    throw new Error('Failed to generate signed URL for private image');
  }
};

// images_json comes back from json_agg() as a real JS array already (or null
// when a vehicle has no media rows, since the FILTER clause drops empty rows).
const processVehicleImages = async (imagesJson) => {
  if (!imagesJson) return [];

  let images;

  if (Array.isArray(imagesJson)) {
    images = imagesJson;
  } else if (typeof imagesJson === 'string') {
    try {
      images = JSON.parse(imagesJson);
    } catch (e) {
      console.error('Invalid JSON string from DB:', imagesJson);
      return [];
    }
  } else {
    console.error('Unexpected imagesJson type:', typeof imagesJson);
    return [];
  }

  // Generate signed URLs
  return Promise.all(
    images.map(async (img) => {
      if (img?.image_url?.includes('amazonaws.com')) {
        try {
          const signedUrl = await getSignedImageUrl(img.image_url, 86400);
          return {
            ...img,
            signed_url: signedUrl,
            original_url: img.image_url
          };
        } catch (err) {
          return { ...img, signed_url: null };
        }
      }
      return img;
    })
  );
};

// Helper function to generate signed URLs for image records
const generateSignedUrlsForImages = async (imageRecords) => {
  const imagesWithSignedUrls = await Promise.all(
    imageRecords.map(async (img) => {
      if (img.image_url && img.image_url.includes('amazonaws.com')) {
        try {
          const signedUrl = await getSignedImageUrl(img.image_url, 86400);
          return {
            ...img,
            signed_url: signedUrl,
            original_url: img.image_url
          };
        } catch (error) {
          console.error('Error generating signed URL for new image:', error);
          return {
            ...img,
            signed_url: null,
            error: 'Failed to generate signed URL'
          };
        }
      }
      return img;
    })
  );

  return imagesWithSignedUrls;
};

// Fetch all vehicles with signed URLs
router.get(['/', '/vehicles'], enhancedCheckFinance, async (req, res) => {
  try {
    const { rows: vehicles } = await db.query(`
      SELECT 
        vd.id,
        vd.vehicle_number,
        vd.vehicle_modal,
        vd.chassis_number,
        vd.engine_number,
        vd.num_owner,
        vd.trip_driven,
        vd.color,
        vd.variant,
        vd.selling_price,
        vd.emi_from,
        vd.base_price,
        vd.final_price,
        vd.status,
        vd.created_date,
        vd.selling_date,
        vd.deal_type,
        vd.rc_holder,
        vd.rc_status,
        vd.fc_expiry_date,
        vd.insurance_expiry_date,
        vd.remarks,
        vd.created_at,
        vd.updated_at,
        vi_info.brand,
        vi_info.model_name,
        vi_info.make_year,
        vi_info.fuel_type,
        vi_info.engine_capacity,
        vi_info.fuel_tank_capacity,
        vi_info.max_torque,
        vi_info.top_speed,
        vi_info.mileage,
        vi_info.transmission,
        vi_info.seating_capacity,
        vi_info.body_type,
        COALESCE(MAX(ve_total.total_expenses), 0) as total_expenses,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vimg.id,
              'vehicle_id', vimg.vehicle_id,
              'image_url', vimg.media_url,
              'image_type', vimg.media_type,
              'is_primary', vimg.is_primary,
              'file_size', vimg.file_size,
              'upload_date', vimg.upload_date,
              'created_at', vimg.created_at
            )
          ) FILTER (WHERE vimg.id IS NOT NULL),
          '[]'
        ) AS images_json
      FROM vehicle_detail vd
      LEFT JOIN vehicle_info vi_info ON vd.vehicle_info_id = vi_info.id
      LEFT JOIN vehicle_media vimg ON vd.id = vimg.vehicle_id
      LEFT JOIN (
        SELECT vehicle_id, SUM(amount) as total_expenses
        FROM vehicle_expenses 
        WHERE finance_id = $1
        GROUP BY vehicle_id
      ) ve_total ON vd.id = ve_total.vehicle_id
      WHERE vd.finance_id = $2
      GROUP BY vd.id, vi_info.id
      ORDER BY vd.created_at DESC
    `, [req.financeId, req.financeId]);

    // Parse and process the vehicles data with signed URLs
    const formattedVehicles = await Promise.all(
      vehicles.map(async (vehicle) => {
        const images = await processVehicleImages(vehicle.images_json);

        return {
          ...vehicle,
          images,
          total_expenses: parseFloat(vehicle.total_expenses) || 0,
          base_price: parseFloat(vehicle.base_price) || 0,
          final_price: parseFloat(vehicle.final_price) || 0,
          selling_price: parseFloat(vehicle.selling_price) || 0,
          emi_from: parseFloat(vehicle.emi_from) || 0
        };
      })
    );

    res.json(formattedVehicles);
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    res.status(500).json({
      error: 'Failed to fetch vehicles',
      details: err.message
    });
  }
});

// Create vehicle with S3 image upload and signed URLs
router.post(['/', '/vehicles'], enhancedCheckFinance, upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'side', maxCount: 1 },
  { name: 'back', maxCount: 1 },
  { name: 'interior', maxCount: 1 },
  { name: 'additional', maxCount: 10 }
]), async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    // Destructure all fields from request body
    const {
      vehicle_info_id,
      vehicle_number,
      vehicle_modal,
      chassis_number,
      engine_number,
      num_owner,
      trip_driven,
      color,
      variant,
      selling_price,
      emi_from,
      base_price,
      final_price,
      status,
      created_date,
      selling_date,
      deal_type,
      rc_holder,
      rc_status,
      fc_expiry_date,
      insurance_expiry_date,
      remarks,
      minimum_down_payment,
    } = req.body;

    // Insert vehicle
    const vehicleInsert = buildInsert('vehicle_detail', {
      finance_id: req.financeId,
      vehicle_info_id: vehicle_info_id ? String(vehicle_info_id).trim() : null,
      vehicle_number,
      vehicle_modal,
      chassis_number: (chassis_number && String(chassis_number).trim()) ? String(chassis_number).trim() : null,
      engine_number: (engine_number && String(engine_number).trim()) ? String(engine_number).trim() : null,
      num_owner: parseInt(num_owner) || 1,
      trip_driven: parseInt(trip_driven) || 0,
      color: color || '',
      variant: variant || null,
      selling_price: parseFloat(selling_price) || 0,
      emi_from: parseFloat(emi_from) || 0,
      base_price: parseFloat(base_price) || 0,
      final_price: parseFloat(final_price) || parseFloat(selling_price) || 0,
      minimum_down_payment: minimum_down_payment ? parseFloat(minimum_down_payment) : null,
      status: status || 'available',
      created_date: created_date || new Date().toISOString().split('T')[0],
      selling_date: selling_date || null,
      deal_type: deal_type || 'finance',
      rc_holder: rc_holder || 'Company',
      rc_status: rc_status || 'original',
      fc_expiry_date: fc_expiry_date || null,
      insurance_expiry_date: insurance_expiry_date || null,
      remarks: remarks || null,
      created_at: new Date(),
      updated_at: new Date()
    });
    const vehicleResult = await client.query(vehicleInsert.sql, vehicleInsert.values);

    const vehicleId = vehicleResult.rows[0].id;
    const imageRecords = [];

    // Process images and upload to S3
    const imageTypes = {
      'front': 'front',
      'side': 'side',
      'back': 'back',
      'interior': 'interior'
    };

    // Process single images
    for (const [field, imageType] of Object.entries(imageTypes)) {
      if (req.files[field] && req.files[field][0]) {
        const file = req.files[field][0];
        const fileName = generateFileName(file.originalname);

        try {
          // Upload to S3 (private folder 'vehicles')
          const imageUrl = await uploadToS3(file.buffer, fileName, 'vehicles');

          const mediaInsert = buildInsert('vehicle_media', {
            finance_id: req.financeId,
            vehicle_id: vehicleId,
            media_url: imageUrl,
            media_type: imageType,
            is_primary: imageType === 'front' ? 1 : 0,
            file_size: file.size,
            upload_date: new Date().toISOString().split('T')[0],
            created_at: new Date()
          });
          const imageResult = await client.query(mediaInsert.sql, mediaInsert.values);

          imageRecords.push({
            id: imageResult.rows[0].id,
            vehicle_id: vehicleId.toString(),
            image_url: imageUrl,
            image_type: imageType,
            is_primary: imageType === 'front',
            file_size: file.size,
            upload_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Failed to upload ${imageType} image:`, uploadError);
          throw uploadError;
        }
      }
    }

    // Process additional images
    if (req.files.additional && req.files.additional.length > 0) {
      console.log(`Processing ${req.files.additional.length} additional images`);

      for (const file of req.files.additional) {
        const fileName = generateFileName(file.originalname);

        try {
          // Upload to S3 (private folder 'vehicles')
          const imageUrl = await uploadToS3(file.buffer, fileName, 'vehicles');

          const mediaInsert = buildInsert('vehicle_media', {
            finance_id: req.financeId,
            vehicle_id: vehicleId,
            media_url: imageUrl,
            media_type: 'additional',
            is_primary: 0,
            file_size: file.size,
            upload_date: new Date().toISOString().split('T')[0],
            created_at: new Date()
          });
          const imageResult = await client.query(mediaInsert.sql, mediaInsert.values);

          imageRecords.push({
            id: imageResult.rows[0].id,
            vehicle_id: vehicleId.toString(),
            image_url: imageUrl,
            image_type: 'additional',
            is_primary: false,
            file_size: file.size,
            upload_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error('Failed to upload additional image:', uploadError);
          throw uploadError;
        }
      }
    }

    // Generate signed URLs for all images
    const imagesWithSignedUrls = await generateSignedUrlsForImages(imageRecords);

    // Add activity log (moved before commit/response so a failure here still rolls back
    // instead of throwing after res.json() has already been sent)
    const activityInsert = buildInsert('recent_activity', {
      finance_id: req.financeId,
      type: 'vehicle',
      reference_id: vehicleId,
      description: `Vehicle added: ${vehicle_number}`,
      amount: final_price || 0,
      created_by: req.user?.user_name || 'System'
    });
    await client.query(activityInsert.sql, activityInsert.values);

    await client.query('COMMIT');

    console.log('Vehicle created successfully:', vehicleId);

    // Return the complete vehicle object with signed URLs
    const newVehicle = {
      id: vehicleId.toString(),
      finance_id: req.financeId,
      vehicle_info_id: vehicle_info_id ? String(vehicle_info_id).trim() : null,
      vehicle_number,
      vehicle_modal,
      chassis_number,
      engine_number: engine_number || null,
      num_owner: parseInt(num_owner) || 1,
      trip_driven: parseInt(trip_driven) || 0,
      color: color || '',
      variant: variant || null,
      selling_price: parseFloat(selling_price) || 0,
      emi_from: parseFloat(emi_from) || 0,
      base_price: parseFloat(base_price) || 0,
      final_price: parseFloat(final_price) || parseFloat(selling_price) || 0,
      minimum_down_payment: minimum_down_payment ? parseFloat(minimum_down_payment) : null,
      status: status || 'available',
      created_date: created_date || new Date().toISOString().split('T')[0],
      selling_date: selling_date || null,
      deal_type: deal_type || 'finance',
      rc_holder: rc_holder || 'Company',
      rc_status: rc_status || 'original',
      fc_expiry_date: fc_expiry_date || null,
      insurance_expiry_date: insurance_expiry_date || null,
      remarks: remarks || null,
      images: imagesWithSignedUrls,
      total_expenses: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    res.json(newVehicle);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating vehicle:', err);
    res.status(500).json({
      error: 'Failed to create vehicle',
      details: err.message
    });
  } finally {
    client.release();
  }
});

// Update vehicle with S3 image handling and signed URLs
router.put(['/:id', '/vehicles/:id'], enhancedCheckFinance, upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'side', maxCount: 1 },
  { name: 'back', maxCount: 1 },
  { name: 'interior', maxCount: 1 },
  { name: 'additional', maxCount: 10 }
]), async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const vehicleId = req.params.id;

    console.log('=== UPDATE VEHICLE REQUEST ===');
    console.log('Vehicle ID:', vehicleId);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    console.log('Finance ID:', req.financeId);

    // Destructure all fields from request body
    const {
      vehicle_info_id,
      vehicle_number,
      vehicle_modal,
      chassis_number,
      engine_number,
      num_owner,
      trip_driven,
      color,
      variant,
      selling_price,
      emi_from,
      base_price,
      final_price,
      status,
      created_date,
      selling_date,
      hosting_info,
      monthly_income_data,
      deal_type,
      rc_holder,
      rc_status,
      fc_expiry_date,
      insurance_expiry_date,
      remarks,
      existing_images
    } = req.body;

    // Validate required fields
    if (!vehicle_number) {
      return res.status(400).json({ error: 'Vehicle number is required' });
    }

    // Parse existing images to keep
    let existingImageIds = [];
    let imagesToDelete = [];
    try {
      existingImageIds = existing_images ? JSON.parse(existing_images) : [];
      console.log('Existing image IDs to keep:', existingImageIds);

      // Get current images to identify which ones to delete from S3
      const { rows: currentImages } = await client.query(
        'SELECT id, media_url AS image_url FROM vehicle_media WHERE vehicle_id = $1 AND finance_id = $2',
        [vehicleId, req.financeId]
      );

      // Find images that will be deleted from database
      imagesToDelete = currentImages.filter(img =>
        !existingImageIds.includes(img.id)
      );
    } catch (parseError) {
      console.error('Error parsing existing_images:', parseError);
      existingImageIds = [];
    }

    // Delete old images from S3
    for (const img of imagesToDelete) {
      try {
        await deleteFromS3(img.image_url);
        console.log('Deleted image from S3:', img.image_url);
      } catch (deleteError) {
        console.error('Failed to delete image from S3:', deleteError);
        // Continue even if S3 deletion fails
      }
    }

    // Create update object
    const updateData = {
      vehicle_info_id: vehicle_info_id ? String(vehicle_info_id).trim() : null,
      vehicle_number: vehicle_number || null,
      vehicle_modal: vehicle_modal || null,
      chassis_number: (chassis_number && String(chassis_number).trim()) ? String(chassis_number).trim() : null,
      engine_number: (engine_number && String(engine_number).trim()) ? String(engine_number).trim() : null,
      num_owner: num_owner ? parseInt(num_owner) : null,
      trip_driven: trip_driven ? parseInt(trip_driven) : null,
      color: color || null,
      variant: variant || null,
      selling_price: selling_price ? parseFloat(selling_price) : null,
      emi_from: emi_from ? parseFloat(emi_from) : null,
      base_price: base_price ? parseFloat(base_price) : null,
      final_price: final_price ? parseFloat(final_price) : null,
      minimum_down_payment: req.body.minimum_down_payment !== undefined ? (req.body.minimum_down_payment ? parseFloat(req.body.minimum_down_payment) : null) : null,
      status: status || 'available',
      created_date: created_date || null,
      selling_date: selling_date || null,
      deal_type: deal_type || 'finance',
      rc_holder: rc_holder || null,
      rc_status: rc_status || null,
      fc_expiry_date: fc_expiry_date || null,
      insurance_expiry_date: insurance_expiry_date || null,
      remarks: remarks || null,
      updated_at: new Date()
    };

    // Remove null values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    console.log('Update data:', updateData);

    // Update vehicle basic info
    const vehicleUpdate = buildUpdate(
      'vehicle_detail',
      updateData,
      'id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );
    await client.query(vehicleUpdate.sql, vehicleUpdate.values);

    // Delete images from database that are not in existingImageIds
    if (existingImageIds.length > 0) {
      console.log(`Keeping images with IDs: ${existingImageIds.join(', ')}`);
      await client.query(
        'DELETE FROM vehicle_media WHERE vehicle_id = $1 AND finance_id = $2 AND id <> ALL($3::uuid[])',
        [vehicleId, req.financeId, existingImageIds]
      );
    } else {
      console.log('No existing images specified - deleting all images');
      await client.query(
        'DELETE FROM vehicle_media WHERE vehicle_id = $1 AND finance_id = $2',
        [vehicleId, req.financeId]
      );
    }

    // Process new images if any
    const imageTypes = {
      'front': 'front',
      'side': 'side',
      'back': 'back',
      'interior': 'interior'
    };

    if (req.files) {
      console.log('Processing new files:', req.files);

      // Process single images
      for (const [field, imageType] of Object.entries(imageTypes)) {
        if (req.files[field] && req.files[field][0]) {
          const file = req.files[field][0];
          const fileName = generateFileName(file.originalname);

          console.log(`Processing ${imageType} image:`, file.originalname);

          // Upload to S3 (private folder 'vehicles')
          const imageUrl = await uploadToS3(file.buffer, fileName, 'vehicles');

          // Check if this type already exists
          const { rows: existing } = await client.query(
            'SELECT id FROM vehicle_media WHERE vehicle_id = $1 AND media_type = $2 AND finance_id = $3',
            [vehicleId, imageType, req.financeId]
          );

          if (existing.length > 0) {
            // Delete old image from S3 first
            try {
              const { rows: oldImage } = await client.query(
                'SELECT media_url AS image_url FROM vehicle_media WHERE id = $1',
                [existing[0].id]
              );
              if (oldImage[0] && oldImage[0].image_url) {
                await deleteFromS3(oldImage[0].image_url);
              }
            } catch (deleteError) {
              console.error('Failed to delete old image from S3:', deleteError);
            }

            // Update existing image in database
            console.log(`Updating existing ${imageType} image`);
            const mediaUpdate = buildUpdate(
              'vehicle_media',
              {
                media_url: imageUrl,
                file_size: file.size
              },
              'vehicle_id = $1 AND media_type = $2 AND finance_id = $3',
              [vehicleId, imageType, req.financeId]
            );
            await client.query(mediaUpdate.sql, mediaUpdate.values);
          } else {
            // Insert new image
            console.log(`Inserting new ${imageType} image`);
            const mediaInsert = buildInsert('vehicle_media', {
              finance_id: req.financeId,
              vehicle_id: vehicleId,
              media_url: imageUrl,
              media_type: imageType,
              is_primary: imageType === 'front' ? 1 : 0,
              file_size: file.size,
              upload_date: new Date().toISOString().split('T')[0],
              created_at: new Date()
            });
            await client.query(mediaInsert.sql, mediaInsert.values);
          }
        }
      }

      // Process additional images
      if (req.files.additional && req.files.additional.length > 0) {
        console.log(`Processing ${req.files.additional.length} additional images`);
        for (const file of req.files.additional) {
          const fileName = generateFileName(file.originalname);
          const imageUrl = await uploadToS3(file.buffer, fileName, 'vehicles');

          const mediaInsert = buildInsert('vehicle_media', {
            finance_id: req.financeId,
            vehicle_id: vehicleId,
            media_url: imageUrl,
            media_type: 'additional',
            is_primary: 0,
            file_size: file.size,
            upload_date: new Date().toISOString().split('T')[0],
            created_at: new Date()
          });
          await client.query(mediaInsert.sql, mediaInsert.values);
        }
      }
    }

    // Fetch updated vehicle with images
    const { rows: updatedVehicles } = await client.query(`
      SELECT 
        vd.*,
        vi_info.id as vehicle_info_id,
        vi_info.brand,
        vi_info.model_name,
        vi_info.make_year,
        vi_info.fuel_type,
        vi_info.engine_capacity,
        vi_info.fuel_tank_capacity,
        vi_info.max_torque,
        vi_info.top_speed,
        vi_info.mileage,
        vi_info.transmission,
        vi_info.seating_capacity,
        vi_info.body_type,
        COALESCE(MAX(ve_total.total_expenses), 0) as total_expenses,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vimg.id,
              'vehicle_id', vimg.vehicle_id,
              'image_url', vimg.media_url,
              'image_type', vimg.media_type,
              'is_primary', vimg.is_primary,
              'file_size', vimg.file_size,
              'upload_date', vimg.upload_date,
              'created_at', vimg.created_at
            )
          ) FILTER (WHERE vimg.id IS NOT NULL),
          '[]'
        ) as images_json
      FROM vehicle_detail vd
      LEFT JOIN vehicle_info vi_info ON vd.vehicle_info_id = vi_info.id
      LEFT JOIN vehicle_media vimg ON vd.id = vimg.vehicle_id
      LEFT JOIN (
        SELECT vehicle_id, SUM(amount) as total_expenses
        FROM vehicle_expenses 
        WHERE finance_id = $1
        GROUP BY vehicle_id
      ) ve_total ON vd.id = ve_total.vehicle_id
      WHERE vd.id = $2 AND vd.finance_id = $3
      GROUP BY vd.id, vi_info.id
    `, [req.financeId, vehicleId, req.financeId]);

    if (updatedVehicles.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    await client.query('COMMIT');

    const updatedVehicle = updatedVehicles[0];
    const images = await processVehicleImages(updatedVehicle.images_json);

    const formattedVehicle = {
      ...updatedVehicle,
      images,
      monthly_income_data: updatedVehicle.monthly_income_data
        ? (typeof updatedVehicle.monthly_income_data === 'string' ? JSON.parse(updatedVehicle.monthly_income_data) : updatedVehicle.monthly_income_data)
        : null,
      hosting_info: updatedVehicle.hosting_info
        ? (typeof updatedVehicle.hosting_info === 'string' ? JSON.parse(updatedVehicle.hosting_info) : updatedVehicle.hosting_info)
        : null,
      total_expenses: parseFloat(updatedVehicle.total_expenses) || 0,
      base_price: parseFloat(updatedVehicle.base_price) || 0,
      final_price: parseFloat(updatedVehicle.final_price) || 0,
      selling_price: parseFloat(updatedVehicle.selling_price) || 0,
      emi_from: parseFloat(updatedVehicle.emi_from) || 0
    };

    console.log('Vehicle updated successfully');
    res.json(formattedVehicle);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating vehicle:', err);
    res.status(500).json({
      error: 'Failed to update vehicle',
      details: err.message
    });
  } finally {
    client.release();
  }
});

// Delete vehicle (with S3 image cleanup)
router.delete(['/:id', '/vehicles/:id'], enhancedCheckFinance, async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const vehicleId = req.params.id;

    // Get all images for this vehicle
    const { rows: images } = await client.query(
      'SELECT media_url AS image_url FROM vehicle_media WHERE vehicle_id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );

    // Delete images from S3
    for (const img of images) {
      try {
        await deleteFromS3(img.image_url);
      } catch (deleteError) {
        console.error('Failed to delete image from S3:', deleteError);
        // Continue even if S3 deletion fails
      }
    }

    // Delete vehicle media from database
    await client.query(
      'DELETE FROM vehicle_media WHERE vehicle_id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );

    // Delete vehicle expenses
    await client.query(
      'DELETE FROM vehicle_expenses WHERE vehicle_id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );

    // Delete vehicle
    const result = await client.query(
      'DELETE FROM vehicle_detail WHERE id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Vehicle and all associated images deleted successfully'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting vehicle:', err);
    res.status(500).json({
      error: 'Failed to delete vehicle',
      details: err.message
    });
  } finally {
    client.release();
  }
});

// Refresh signed URLs for vehicle images
router.get(['/:id/refresh-images', '/vehicles/:id/refresh-images'], enhancedCheckFinance, async (req, res) => {
  try {
    const vehicleId = req.params.id;

    const { rows: images } = await db.query(
      'SELECT id, media_url AS image_url, media_type AS image_type, is_primary FROM vehicle_media WHERE vehicle_id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );

    const refreshedImages = await Promise.all(
      images.map(async (img) => {
        try {
          const signedUrl = await getSignedImageUrl(img.image_url, 86400);
          return {
            id: img.id,
            image_type: img.image_type,
            is_primary: img.is_primary,
            signed_url: signedUrl,
            original_url: img.image_url
          };
        } catch (error) {
          console.error('Error generating signed URL for image:', img.id, error);
          return {
            id: img.id,
            image_type: img.image_type,
            is_primary: img.is_primary,
            signed_url: null,
            original_url: img.image_url,
            error: 'Failed to generate signed URL'
          };
        }
      })
    );

    res.json({ images: refreshedImages });
  } catch (err) {
    console.error('Error refreshing image URLs:', err);
    res.status(500).json({
      error: 'Failed to refresh images',
      details: err.message
    });
  }
});

// Search vehicles by number (must be registered BEFORE /:id to prevent shadowing)
router.get(['/search/:query', '/vehicles/search/:query'], enhancedCheckFinance, async (req, res) => {
  try {
    const { query } = req.params;

    if (!query || query.trim().length < 1) {
      return res.json([]);
    }

    const searchQuery = `%${query.trim()}%`;

    const { rows: vehicles } = await db.query(`
      SELECT 
        vd.id,
        vd.vehicle_number,
        vd.vehicle_modal,
        vd.color,
        vi_info.model_name,
        vi_info.brand,
        vi_info.body_type as type
      FROM vehicle_detail vd
      LEFT JOIN vehicle_info vi_info ON vd.vehicle_info_id = vi_info.id
      WHERE vd.finance_id = $1 
        AND (vd.vehicle_number ILIKE $2 OR REPLACE(vd.vehicle_number, ' ', '') ILIKE REPLACE($2, ' ', ''))
        AND vd.status IN ('available', 'hosted')
      ORDER BY vd.vehicle_number
      LIMIT 10
    `, [req.financeId, searchQuery]);

    // Format the response
    const formattedVehicles = vehicles.map(vehicle => ({
      id: vehicle.id,
      vehicle_number: vehicle.vehicle_number,
      vehicle_modal: vehicle.vehicle_modal,
      color: vehicle.color,
      model_name: vehicle.model_name,
      brand: vehicle.brand,
      type: vehicle.type
    }));

    res.json(formattedVehicles);
  } catch (err) {
    console.error('Error searching vehicles:', err);
    res.status(500).json({
      error: 'Failed to search vehicles',
      details: err.message
    });
  }
});

// Fetch vehicle info (must be defined BEFORE /:id route to avoid shadowing)
const getVehicleInfo = async (req, res) => {
  try {
    const { rows: vehicleInfo } = await db.query(`
      SELECT 
        id,
        brand,
        model_name,
        make_year,
        fuel_type,
        engine_capacity,
        fuel_tank_capacity,
        max_torque,
        top_speed,
        mileage,
        transmission,
        seating_capacity,
        body_type,
        base_price,
        created_at
      FROM vehicle_info
      ORDER BY brand, model_name
    `);

    res.json(vehicleInfo);
  } catch (err) {
    console.error('Error fetching vehicle info:', err);
    res.status(500).json({ error: 'Failed to fetch vehicle info' });
  }
};

router.get(['/info', '/vehicle-info', '/vehicles/info', '/vehicles/vehicle-info'], getVehicleInfo);
router.getVehicleInfo = getVehicleInfo;

// ─── GET /vehicles/availability?number=<regNo>[&engine=<no>][&chassis=<no>] ───
// Read-only. Global lookup (vehicle_number / engine_number / chassis_number are UNIQUE
// across the whole table), deliberately ignoring the status / deal-type filters of /search.
// Must be defined BEFORE the /:id route.
const { classifyAvailability, normalizeRegNo, normalizeIdent } = require('./vehicleAvailability');
router.get(['/availability', '/vehicles/availability'], enhancedCheckFinance, async (req, res) => {
  try {
    const number = normalizeRegNo(req.query.number);
    const engine = normalizeIdent(req.query.engine);
    const chassis = normalizeIdent(req.query.chassis);
    if (!number) {
      return res.status(400).json({ success: false, error: 'number is required' });
    }

    const { rows: numRows } = await db.query(
      `SELECT vd.id, vd.finance_id, vd.status, vd.deal_type, vd.vehicle_number, vd.vehicle_modal, vd.color,
              vd.engine_number, vd.chassis_number,
              vi.brand, vi.model_name, vi.body_type AS type,
              (EXISTS (SELECT 1 FROM customers c WHERE c.vehicle_id = vd.id)
               OR EXISTS (SELECT 1 FROM loans l WHERE l.vehicle_id = vd.id)) AS linked
         FROM vehicle_detail vd
         LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
        WHERE regexp_replace(UPPER(vd.vehicle_number), '[[:space:].-]', '', 'g') = $1
        LIMIT 1`,
      [number]
    );
    let byEngine = null;
    let byChassis = null;
    if (engine) {
      const { rows } = await db.query(
        `SELECT id FROM vehicle_detail WHERE UPPER(REPLACE(engine_number, ' ', '')) = $1 LIMIT 1`,
        [engine]
      );
      byEngine = rows[0] || null;
    }
    if (chassis) {
      const { rows } = await db.query(
        `SELECT id FROM vehicle_detail WHERE UPPER(REPLACE(chassis_number, ' ', '')) = $1 LIMIT 1`,
        [chassis]
      );
      byChassis = rows[0] || null;
    }

    const result = classifyAvailability({
      financeId: req.financeId,
      byNumber: numRows[0] || null,
      byEngine,
      byChassis,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error checking vehicle availability:', err && err.code ? err.code : '');
    return res.status(500).json({ success: false, error: 'Failed to check vehicle availability' });
  }
});

// GET single vehicle by ID with signed URLs
router.get(['/:id', '/vehicles/:id'], enhancedCheckFinance, async (req, res) => {
  const client = await db.connect();

  try {
    const vehicleId = req.params.id;

    const { rows: vehicles } = await client.query(`
      SELECT 
        vd.*,
        vi_info.id as vehicle_info_id,
        vi_info.brand,
        vi_info.model_name,
        vi_info.make_year,
        vi_info.fuel_type,
        vi_info.engine_capacity,
        vi_info.fuel_tank_capacity,
        vi_info.max_torque,
        vi_info.top_speed,
        vi_info.mileage,
        vi_info.transmission,
        vi_info.seating_capacity,
        vi_info.body_type,
        COALESCE(MAX(ve_total.total_expenses), 0) as total_expenses,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vimg.id,
              'vehicle_id', vimg.vehicle_id,
              'image_url', vimg.media_url,
              'image_type', vimg.media_type,
              'is_primary', vimg.is_primary,
              'file_size', vimg.file_size,
              'upload_date', vimg.upload_date,
              'created_at', vimg.created_at
            )
          ) FILTER (WHERE vimg.id IS NOT NULL),
          '[]'
        ) as images_json
      FROM vehicle_detail vd
      LEFT JOIN vehicle_info vi_info ON vd.vehicle_info_id = vi_info.id
      LEFT JOIN vehicle_media vimg ON vd.id = vimg.vehicle_id
      LEFT JOIN (
        SELECT vehicle_id, SUM(amount) as total_expenses
        FROM vehicle_expenses 
        WHERE finance_id = $1
        GROUP BY vehicle_id
      ) ve_total ON vd.id = ve_total.vehicle_id
      WHERE (
        (vd.id::text = $2)
        OR (UPPER(REPLACE(REPLACE(vd.vehicle_number, '-', ''), ' ', '')) = UPPER(REPLACE(REPLACE($2, '-', ''), ' ', '')))
        OR (vd.vehicle_number ILIKE $2)
      )
      AND vd.finance_id = $3
      GROUP BY vd.id, vi_info.id
    `, [req.financeId, vehicleId, req.financeId]);

    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicle = vehicles[0];
    const images = await processVehicleImages(vehicle.images_json);

    const formattedVehicle = {
      ...vehicle,
      images,
      monthly_income_data: vehicle.monthly_income_data
        ? (typeof vehicle.monthly_income_data === 'string' ? JSON.parse(vehicle.monthly_income_data) : vehicle.monthly_income_data)
        : null,
      hosting_info: vehicle.hosting_info
        ? (typeof vehicle.hosting_info === 'string' ? JSON.parse(vehicle.hosting_info) : vehicle.hosting_info)
        : null,
      total_expenses: parseFloat(vehicle.total_expenses) || 0,
      base_price: parseFloat(vehicle.base_price) || 0,
      final_price: parseFloat(vehicle.final_price) || 0,
      selling_price: parseFloat(vehicle.selling_price) || 0,
      emi_from: parseFloat(vehicle.emi_from) || 0,
      price: parseFloat(vehicle.base_price) || 0 // For backward compatibility
    };

    res.json(formattedVehicle);
  } catch (err) {
    console.error('Error fetching vehicle:', err);
    res.status(500).json({
      error: 'Failed to fetch vehicle',
      details: err.message
    });
  } finally {
    client.release();
  }
});

// Toggle vehicle host status
router.put(['/:id/host-toggle', '/vehicles/:id/host-toggle'], enhancedCheckFinance, async (req, res) => {
  try {
    const vehicleId = req.params.id;

    // Get current vehicle status
    const { rows: vehicles } = await db.query(
      'SELECT status FROM vehicle_detail WHERE id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );

    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const currentStatus = vehicles[0].status;
    const newStatus = currentStatus === 'hosted' ? 'available' : 'hosted';

    // Update vehicle status
    await db.query(
      'UPDATE vehicle_detail SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND finance_id = $3',
      [newStatus, vehicleId, req.financeId]
    );

    res.json({
      success: true,
      message: `Vehicle ${newStatus === 'hosted' ? 'hosted' : 'unhosted'} successfully`,
      newStatus
    });
  } catch (err) {
    console.error('Error toggling vehicle host status:', err);
    res.status(500).json({ error: 'Failed to update vehicle status' });
  }
});

// Update vehicle status directly
router.put(['/:id/status', '/vehicles/:id/status'], enhancedCheckFinance, async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const { status, selling_date } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const updateFields = { status };
    if (selling_date) {
      updateFields.selling_date = selling_date;
    }

    const vehicleUpdate = buildUpdate(
      'vehicle_detail',
      updateFields,
      'id = $1 AND finance_id = $2',
      [vehicleId, req.financeId]
    );
    const result = await db.query(vehicleUpdate.sql, vehicleUpdate.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    res.json({
      success: true,
      message: 'Vehicle status updated successfully',
      status
    });
  } catch (err) {
    console.error('Error updating vehicle status:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update vehicle status',
      details: err.message
    });
  }
});


// Get vehicle expenses
router.get(['/:id/expenses', '/vehicles/:id/expenses'], enhancedCheckFinance, async (req, res) => {
  try {
    const { rows: expenses } = await db.query(
      'SELECT * FROM vehicle_expenses WHERE vehicle_id = $1 AND finance_id = $2 ORDER BY expense_date DESC',
      [req.params.id, req.financeId]
    );

    res.json(expenses);
  } catch (err) {
    console.error('Error fetching vehicle expenses:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Create vehicle expense
router.post(['/:id/expenses', '/vehicles/:id/expenses'], enhancedCheckFinance, async (req, res) => {
  try {
    const { expense_date, description, amount } = req.body;

    const expenseInsert = buildInsert('vehicle_expenses', {
      finance_id: req.financeId,
      vehicle_id: req.params.id,
      expense_date,
      description,
      amount: Number(amount) || 0
    });
    const result = await db.query(expenseInsert.sql, expenseInsert.values);

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Error creating vehicle expense:', err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update vehicle expense
router.put(['/:vehicleId/expenses/:expenseId', '/vehicles/:vehicleId/expenses/:expenseId'], enhancedCheckFinance, async (req, res) => {
  try {
    const { expense_date, description, amount } = req.body;

    const expenseUpdate = buildUpdate(
      'vehicle_expenses',
      {
        expense_date,
        description,
        amount: Number(amount) || 0
      },
      'id = $1 AND vehicle_id = $2 AND finance_id = $3',
      [req.params.expenseId, req.params.vehicleId, req.financeId]
    );
    await db.query(expenseUpdate.sql, expenseUpdate.values);

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating vehicle expense:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

router.delete(['/:vehicleId/expenses/:expenseId', '/vehicles/:vehicleId/expenses/:expenseId'], enhancedCheckFinance, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM vehicle_expenses WHERE id = $1 AND vehicle_id = $2 AND finance_id = $3',
      [req.params.expenseId, req.params.vehicleId, req.financeId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting vehicle expense:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});


module.exports = router;