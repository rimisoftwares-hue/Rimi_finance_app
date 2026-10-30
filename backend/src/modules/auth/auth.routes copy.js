// const express = require('express');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const router = express.Router();
// const { db } = require('../../config/database.config');  // Import your database connection
// const crypto = require('crypto');
// const { authMiddleware, ownerOnly, checkFinance, enhancedCheckFinance } = require('../../middleware/auth.middleware');
// const path = require('path');
// const multer = require('multer');
// const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
// const Jimp = require('jimp');
// require('dotenv').config();

// // â”€â”€â”€ AWS S3 setup (mirrors customerRoutes.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// const s3 = new S3Client({
//   credentials: {
//     accessKeyId: process.env.ACCESS_KEY,
//     secretAccessKey: process.env.SECRET_ACCESS_KEY,
//   },
//   region: process.env.BUCKET_REGION,
// });

// // Multer â€“ memory storage, only accept 'userPhoto' image uploads
// const userPhotoUpload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
//   fileFilter: (req, file, cb) => {
//     if (file.fieldname === 'userPhoto' && file.mimetype.startsWith('image/')) {
//       cb(null, true);
//     } else {
//       cb(new Error('Invalid field name or file type. Accepted field: userPhoto'));
//     }
//   },
// });

// // Helper â€“ unique filename
// const generateFileName = (originalname) => {
//   const timestamp = Date.now();
//   const random = Math.round(Math.random() * 1e9);
//   const ext = path.extname(originalname);
//   return `${timestamp}-${random}${ext}`;
// };

// // Helper â€“ resize & upload to S3 (keeps objects private)
// const uploadUserPhotoToS3 = async (fileBuffer, fileName) => {
//   const image = await Jimp.read(fileBuffer);
//   if (image.bitmap.width > 1920) image.resize(1920, Jimp.AUTO);
//   const resizedBuffer = await image.quality(80).getBufferAsync(Jimp.MIME_JPEG);

//   await s3.send(
//     new PutObjectCommand({
//       Bucket: process.env.BUCKET_NAME,
//       Key: `users/${fileName}`,
//       Body: resizedBuffer,
//       ContentType: 'image/jpeg',
//     })
//   );

//   return `https://${process.env.BUCKET_NAME}.s3.${process.env.BUCKET_REGION}.amazonaws.com/users/${fileName}`;
// };

// // Helper â€“ delete photo from S3 by its stored URL
// const deleteUserPhotoFromS3 = async (imageUrl) => {
//   try {
//     const key = new URL(imageUrl).pathname.substring(1);
//     await s3.send(new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key }));
//   } catch (err) {
//     console.error('Error deleting user photo from S3:', err);
//   }
// };

// // Secret key for JWT
// const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
// const JWT_EXPIRES = process.env.JWT_EXPIRES || '1d';

// //helper function
// const formatFinanceData = (financeRaw) => {
//   if (!financeRaw) return null;

//   let phoneNumbersArray = [];
//   let emailsArray = [];

//   // Handle phone numbers
//   if (financeRaw.phone_numbers) {
//     try {
//       if (typeof financeRaw.phone_numbers === 'string') {
//         // Try to parse as JSON first
//         try {
//           phoneNumbersArray = JSON.parse(financeRaw.phone_numbers);
//         } catch (jsonError) {
//           // If JSON parsing fails, try to extract phone numbers
//           // Handle formats like: "phone1, phone2, phone3" or "phone1; phone2"
//           const cleaned = financeRaw.phone_numbers
//             .replace(/[\[\]"]/g, '') // Remove brackets and quotes
//             .split(/[,;]/) // Split by comma or semicolon
//             .map(num => num.trim())
//             .filter(num => num.length > 0);

//           if (cleaned.length > 0) {
//             phoneNumbersArray = cleaned;
//           } else {
//             // If no commas/semicolons, use the whole string
//             phoneNumbersArray = [financeRaw.phone_numbers];
//           }
//         }
//       } else if (Array.isArray(financeRaw.phone_numbers)) {
//         phoneNumbersArray = financeRaw.phone_numbers;
//       }
//     } catch (err) {
//       console.error('Error processing phone numbers:', err);
//       phoneNumbersArray = [];
//     }
//   }

//   // Handle emails
//   if (financeRaw.emails) {
//     try {
//       if (typeof financeRaw.emails === 'string') {
//         // Try to parse as JSON first
//         try {
//           emailsArray = JSON.parse(financeRaw.emails);
//         } catch (jsonError) {
//           // If JSON parsing fails, try to extract emails
//           // Handle formats like: "email1, email2" or "email1; email2"
//           const cleaned = financeRaw.emails
//             .replace(/[\[\]"]/g, '') // Remove brackets and quotes
//             .split(/[,;]/) // Split by comma or semicolon
//             .map(email => email.trim())
//             .filter(email => email.length > 0 && email.includes('@'));

//           if (cleaned.length > 0) {
//             emailsArray = cleaned;
//           } else {
//             // If no commas/semicolons and it looks like an email, use it
//             if (financeRaw.emails.includes('@')) {
//               emailsArray = [financeRaw.emails];
//             }
//           }
//         }
//       } else if (Array.isArray(financeRaw.emails)) {
//         emailsArray = financeRaw.emails;
//       }
//     } catch (err) {
//       console.error('Error processing emails:', err);
//       emailsArray = [];
//     }
//   }

//   // Rest of the function remains the same...
//   // Build address string
//   const addressParts = [];
//   if (financeRaw.house_no) addressParts.push(`House No: ${financeRaw.house_no}`);
//   if (financeRaw.street) addressParts.push(`Street: ${financeRaw.street}`);
//   if (financeRaw.street_name) addressParts.push(financeRaw.street_name);
//   if (financeRaw.village) addressParts.push(financeRaw.village);
//   if (financeRaw.land_mark) addressParts.push(`Near ${financeRaw.land_mark}`);
//   if (financeRaw.address) addressParts.push(financeRaw.address);

//   const locationParts = [];
//   if (financeRaw.city) locationParts.push(financeRaw.city);
//   if (financeRaw.district) locationParts.push(financeRaw.district);
//   if (financeRaw.state) locationParts.push(financeRaw.state);
//   if (financeRaw.pincode) locationParts.push(financeRaw.pincode);

//   const fullLocation = locationParts.join(', ');
//   if (fullLocation) addressParts.push(fullLocation);
//   if (financeRaw.location) addressParts.push(`Location: ${financeRaw.location}`);

//   const fullAddress = addressParts.join(', ');

//   return {
//     id: financeRaw.id,
//     name: financeRaw.finance_name,
//     phone_numbers: phoneNumbersArray,
//     emails: emailsArray,
//     phone: phoneNumbersArray.length > 0 ? phoneNumbersArray[0] : '',
//     email: emailsArray.length > 0 ? emailsArray[0] : '',
//     since: financeRaw.since,
//     finance_photo: financeRaw.finance_photo,
//     created_at: financeRaw.created_at,
//     updated_at: financeRaw.updated_at,
//     is_active: financeRaw.is_active,
//     owner_id: financeRaw.owner_id,
//     // Full address
//     address: fullAddress,
//     // Individual address components
//     house_no: financeRaw.house_no,
//     street: financeRaw.street,
//     street_name: financeRaw.street_name,
//     village: financeRaw.village,
//     land_mark: financeRaw.land_mark,
//     city: financeRaw.city,
//     district: financeRaw.district,
//     state: financeRaw.state,
//     pincode: financeRaw.pincode,
//     location: financeRaw.location
//   };
// };

// function parseAllowedCompanies(value) {
//   if (!value) return [];

//   // Already array (rare but safe)
//   if (Array.isArray(value)) return value.map(Number);

//   // If stored as JSON
//   if (value.trim().startsWith('[')) {
//     try {
//       return JSON.parse(value).map(Number);
//     } catch {
//       return [];
//     }
//   }

//   // If stored as "1,2,3"
//   return value
//     .split(',')
//     .map(v => Number(v.trim()))
//     .filter(v => Number.isInteger(v));
// }


// router.post('/finance-login', async (req, res) => {
//   try {
//     const { userName, password } = req.body;
//     // Query finnance table
//     const [finance] = await db.query(`
//       SELECT fd.*, f.user_name, f.password 
//       FROM finance_detail fd 
//       JOIN finnance f ON fd.id = f.finance_id 
//       WHERE f.user_name = ?
//     `, [userName]);

//     if (finance.length === 0) {
//       return res.status(401).json({ success: false, message: 'Invalid credentials' });
//     }

//     const financeData = finance[0];

//     // Compare password (you should hash passwords in production)
//     if (password !== financeData.password) {
//       return res.status(401).json({ success: false, message: 'Invalid credentials' });
//     }

//     // Create finance token
//     const token = jwt.sign(
//       { finance: { id: financeData.id, name: financeData.finance_name } },
//       JWT_SECRET,
//       { expiresIn: '30d' }
//     );

//     res.json({
//       success: true,
//       finance: {
//         id: financeData.id,
//         name: financeData.finance_name,
//         owner: financeData.owner_name
//       },
//       token
//     });
//   } catch (error) {
//     console.error('Finance login error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

// // ========= OWNER LOGIN ==========
// // router.post('/owner-login', async (req, res) => {
// //   try {
// //     const { username, password } = req.body;

// //     // Find owner
// //     const [owners] = await db.query(
// //       'SELECT * FROM owner WHERE username = ? AND is_active = TRUE',
// //       [username]
// //     );

// //     if (owners.length === 0) {
// //       return res.status(401).json({ 
// //         success: false, 
// //         message: 'Invalid credentials' 
// //       });
// //     }

// //     const owner = owners[0];

// //     // Verify password
// //     let isMatch = (password === owner.password); // Assuming plain text for now
// //     // In production, use: isMatch = await bcrypt.compare(password, owner.password);

// //     if (!isMatch) {
// //       return res.status(401).json({ success: false, message: 'Invalid credentials' });
// //     }

// //     // Create owner token
// //     const token = jwt.sign(
// //       { owner: { id: owner.id, username: owner.username } },
// //       JWT_SECRET,
// //       { expiresIn: '90d' }
// //     );

// //     res.json({
// //       success: true,
// //       owner: {
// //         id: owner.id,
// //         username: owner.username
// //       },
// //       token
// //     });
// //   } catch (error) {
// //     console.error('Owner login error:', error);
// //     res.status(500).json({ 
// //       success: false, 
// //       message: 'Server error'
// //     });
// //   }
// // });
// // ========= OWNER LOGIN ==========
// router.post('/owner-login', async (req, res) => {
//   try {
//     const { username, password } = req.body;

//     // Validate input
//     if (!username || !password) {
//       return res.status(400).json({
//         success: false,
//         message: 'Username and password are required'
//       });
//     }

//     // Find owner
//     const [owners] = await db.query(
//       'SELECT * FROM owner WHERE username = ? AND is_active = TRUE',
//       [username]
//     );

//     if (owners.length === 0) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid credentials'
//       });
//     }

//     const owner = owners[0];
//     // Verify password using bcrypt compare
//     const isMatch = await bcrypt.compare(password, owner.password);

//     if (!isMatch) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid credentials'
//       });
//     }

//     // Create owner token
//     const token = jwt.sign(
//       {
//         owner: {
//           id: owner.id,
//           username: owner.username
//         }
//       },
//       JWT_SECRET,
//       { expiresIn: '90d' }
//     );

//     // Get owner's finance companies
//     const [finances] = await db.query(
//       `SELECT id, finance_name as name 
//        FROM finance_detail 
//        WHERE owner_id = ? AND is_active = TRUE 
//        ORDER BY finance_name ASC`,
//       [owner.id]
//     );

//     res.json({
//       success: true,
//       message: 'Login successful',
//       owner: {
//         id: owner.id,
//         username: owner.username,
//         created_at: owner.created_at,
//         updated_at: owner.updated_at,
//         is_active: owner.is_active === 1,
//         finance_count: finances.length,
//         finances: finances
//       },
//       token,
//       expires_in: '90d'
//     });

//   } catch (error) {
//     console.error('Owner login error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error during login'
//     });
//   }
// });


// // ========== USER LOGIN WITH FINANCE SELECTION ==========
// router.post('/user-login', async (req, res) => {
//   try {
//     const { email, password, financeId } = req.body;

//     // Get owner token
//     const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

//     if (!ownerToken) {
//       return res.status(401).json({
//         success: false,
//         message: 'Owner authentication required',
//         error_code: 'OWNER_TOKEN_REQUIRED'
//       });
//     }

//     // Verify owner token
//     let ownerDecoded;
//     try {
//       ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
//     } catch (err) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid owner token',
//         error_code: 'INVALID_OWNER_TOKEN'
//       });
//     }

//     // Find user
//     const [users] = await db.query(
//       `SELECT * FROM users WHERE email = ? AND is_active = TRUE`,
//       [email]
//     );

//     if (users.length === 0) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid credentials',
//         error_code: 'USER_NOT_FOUND'
//       });
//     }

//     const user = users[0];

//     // Verify password
//     let isMatch = false;
//     try {
//       isMatch = await bcrypt.compare(password, user.password);
//     } catch (bcryptError) {
//       isMatch = (password === user.password);

//       // Hash plain text password for future logins
//       if (isMatch) {
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);
//         await db.query(
//           'UPDATE users SET password = ? WHERE id = ?',
//           [hashedPassword, user.id]
//         );
//       }
//     }

//     if (!isMatch) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid credentials',
//         error_code: 'INVALID_PASSWORD'
//       });
//     }

//     // Parse allowed companies
//     // let allowedCompanies = [];
//     // // console.log('JSON.parse(user.allowed_companies :',JSON.parse(user.allowed_companies || '[]'))
//     // try {
//     //  allowedCompanies = parseAllowedCompanies(user.allowed_companies);
//     // } catch (err) {
//     //   console.error('Error parsing allowed_companies:', err);
//     // }
//     const allowedCompanies = parseAllowedCompanies(user.allowed_companies);

//     // Convert financeId to number
//     const financeIdNum = Number(financeId);
//     if (!Number.isInteger(financeIdNum)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid financeId',
//         error_code: 'INVALID_FINANCE_ID'
//       });
//     }

//     // Verify user has access to this finance
//     if (!allowedCompanies.includes(financeIdNum)) {
//       return res.status(403).json({
//         success: false,
//         message: 'User not authorized for this finance company',
//         error_code: 'FINANCE_ACCESS_DENIED'
//       });
//     }

//     // Get complete finance details with address
//     const [financeDetails] = await db.query(`
//       SELECT 
//         fd.*,
//         a.house_no,
//         a.street,
//         a.street_name,
//         a.village,
//         a.land_mark,
//         a.address,
//         a.city,
//         a.district,
//         a.state,
//         a.pincode,
//         a.location,
//         o.username as owner_username
//       FROM finance_detail fd
//       LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
//         AND ah.entity_id = fd.id 
//         AND ah.is_current = TRUE
//       LEFT JOIN addresses a ON ah.address_id = a.id
//       LEFT JOIN owner o ON fd.owner_id = o.id
//       WHERE fd.id = ? AND fd.is_active = TRUE
//     `, [financeIdNum]);

//     if (financeDetails.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: 'Finance company not found',
//         error_code: 'FINANCE_NOT_FOUND'
//       });
//     }

//     const financeRaw = financeDetails[0];

//     // Verify finance belongs to owner
//     if (financeRaw.owner_id !== ownerDecoded.owner.id) {
//       return res.status(403).json({
//         success: false,
//         message: 'Finance company does not belong to this owner',
//         error_code: 'FINANCE_OWNER_MISMATCH'
//       });
//     }

//     // Format finance data
//     const financeData = formatFinanceData(financeRaw);

//     // Get user statistics (optional)
//     const [userStats] = await db.query(`
//       SELECT 
//         (SELECT COUNT(*) FROM customers WHERE finance_id = ?) as customer_count,
//         (SELECT COUNT(*) FROM loans WHERE finance_id = ?) as loan_count,
//         (SELECT SUM(amount) FROM payments WHERE finance_id = ?) as total_collection
//     `, [financeIdNum, financeIdNum, financeIdNum]);

//     // Create user token with finance info
//     const userToken = jwt.sign(
//       {
//         user: {
//           id: user.id,
//           email: user.email,
//           username: user.username,
//           role: user.user_role,
//           allowed_companies: allowedCompanies,
//           current_finance_id: financeIdNum,
//           finance_name: financeData.name
//         }
//       },
//       JWT_SECRET,
//       { expiresIn: '24h' }
//     );

//     // Update last login
//     await db.query(
//       'UPDATE users SET last_login = NOW() WHERE id = ?',
//       [user.id]
//     );

//     // // Log activity
//     // await db.query(
//     //   `INSERT INTO recent_activity (
//     //     finance_id,
//     //     type,
//     //     reference_id,
//     //     description,
//     //     created_by,
//     //     created_at
//     //   ) VALUES (?, ?, ?, ?, ?, NOW())`,
//     //   [
//     //     financeIdNum,
//     //     'user_login',
//     //     user.id,
//     //     `User ${user.username} logged in`,
//     //     user.username
//     //   ]
//     // );


//     // Return complete response
//     res.json({
//       success: true,
//       user: {
//         id: user.id,
//         user_id: user.user_id,
//         email: user.email,
//         username: user.username,
//         phone_no: user.phone_no,
//         role: user.user_role,
//         allowed_companies: allowedCompanies,
//         current_finance_id: financeIdNum,
//         login_time_from: user.login_time_from,
//         login_time_to: user.login_time_to,
//         last_login: user.last_login,
//         created_at: user.created_at
//       },
//       finance: financeData,
//       statistics: {
//         customer_count: userStats[0]?.customer_count || 0,
//         loan_count: userStats[0]?.loan_count || 0,
//         total_collection: userStats[0]?.total_collection || 0
//       },
//       token: userToken,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     console.error('User login error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error_code: 'INTERNAL_ERROR',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// });
// // ========== GET OWNER'S FINANCE COMPANIES ==========
// router.get('/owner-finances', async (req, res) => {
//   try {
//     const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

//     if (!ownerToken) {
//       return res.status(401).json({ success: false, message: 'Owner authentication required' });
//     }

//     // Verify owner token
//     let ownerDecoded;
//     try {
//       ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
//     } catch (err) {
//       return res.status(401).json({ success: false, message: 'Invalid owner token' });
//     }

//     // Get owner's finance companies
//     const [finances] = await db.query(`
//       SELECT 
//         fd.id, 
//         fd.finance_name as name, 
//         fd.owner_id, 
//         fd.phone_numbers,
//         fd.emails,
//         fd.since,
//         fd.finance_photo,
//         fd.is_active,
//         fd.created_at,
//         a.address,
//         a.city,
//         a.district,
//         a.state,
//         a.pincode
//       FROM finance_detail fd
//       LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
//         AND ah.entity_id = fd.id 
//         AND ah.is_current = TRUE
//       LEFT JOIN addresses a ON ah.address_id = a.id
//       WHERE fd.owner_id = ? AND fd.is_active = TRUE
//       ORDER BY fd.finance_name ASC
//     `, [ownerDecoded.owner.id]);

//     // Process finance data
//     const processedFinances = finances.map(finance => {
//       const financeData = formatFinanceData(finance);
//       return {
//         id: finance.id,
//         name: finance.name,
//         owner_id: finance.owner_id,
//         phone: financeData.phone,
//         email: financeData.email,
//         address: financeData.address,
//         city: finance.city,
//         district: finance.district,
//         state: finance.state,
//         pincode: finance.pincode,
//         since: finance.since,
//         finance_photo: finance.finance_photo,
//         is_active: finance.is_active,
//         created_at: finance.created_at
//       };
//     });

//     res.json({
//       success: true,
//       finances: processedFinances,
//       total: processedFinances.length
//     });
//   } catch (error) {
//     console.error('Error fetching owner finances:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// // ========== REFRESH FINANCE DETAILS ==========
// router.get('/finance-details/:financeId', async (req, res) => {
//   try {
//     const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

//     if (!ownerToken) {
//       return res.status(401).json({
//         success: false,
//         message: 'Owner authentication required'
//       });
//     }
//     const financeId = Number(req.params.financeId);

//     // Verify owner token
//     let ownerDecoded;
//     try {
//       ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
//     } catch (err) {
//       return res.status(401).json({ success: false, message: 'Invalid owner token' });
//     }




//     // Get finance details
//     const [financeDetails] = await db.query(`
//       SELECT 
//         fd.*,
//         a.house_no,
//         a.street,
//         a.street_name,
//         a.village,
//         a.land_mark,
//         a.address,
//         a.city,
//         a.district,
//         a.state,
//         a.pincode,
//         a.location
//       FROM finance_detail fd
//       LEFT JOIN address_history ah ON ah.entity_type = 'finance' 
//         AND ah.entity_id = fd.id 
//         AND ah.is_current = TRUE
//       LEFT JOIN addresses a ON ah.address_id = a.id
//       WHERE fd.id = ? AND fd.owner_id = ? AND fd.is_active = TRUE
//     `, [financeId, ownerDecoded.owner.id]);

//     if (financeDetails.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: 'Finance company not found'
//       });
//     }

//     const financeData = formatFinanceData(financeDetails[0]);

//     res.json({
//       success: true,
//       finance: financeData
//     });

//   } catch (error) {
//     console.error('Error fetching finance details:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error'
//     });
//   }
// });

// // â”€â”€â”€ Create user (owner only) â€“ supports optional userPhoto upload to AWS S3 â”€â”€
// router.post(
//   '/users/create',
//   userPhotoUpload.single('userPhoto'), // multer handles multipart; photo is optional
//   async (req, res) => {
//     let uploadedPhotoUrl = null;

//     try {
//       // â”€â”€ 1. Authenticate owner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');
//       if (!ownerToken) {
//         return res.status(401).json({ success: false, message: 'Owner authentication required' });
//       }

//       let ownerDecoded;
//       try {
//         ownerDecoded = jwt.verify(ownerToken, JWT_SECRET);
//       } catch (err) {
//         return res.status(401).json({ success: false, message: 'Invalid owner token' });
//       }

//       // â”€â”€ 2. Parse JSON parts from multipart body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       // Frontend sends user/staff_details as JSON strings inside FormData
//       let user, staff_details;
//       try {
//         user = req.body.user ? JSON.parse(req.body.user) : null;
//         staff_details = req.body.staff_details ? JSON.parse(req.body.staff_details) : null;
//       } catch (parseErr) {
//         return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
//       }

//       // Validate required fields
//       if (!user || !user.email || !user.password || !user.username || !user.phone_no) {
//         return res.status(400).json({ success: false, message: 'Missing required user fields' });
//       }

//       // Validate login times
//       if (user.login_time_from && user.login_time_to) {
//         if (user.login_time_from >= user.login_time_to) {
//           return res.status(400).json({
//             success: false,
//             message: 'Login end time must be after start time',
//           });
//         }
//       }

//       // â”€â”€ 3. Uniqueness checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       const [[existingEmail]] = await db.query(
//         'SELECT id FROM users WHERE email = ?', [user.email]
//       );
//       if (existingEmail) {
//         return res.status(400).json({ success: false, message: 'Email already in use' });
//       }

//       const [[existingUsername]] = await db.query(
//         'SELECT id FROM users WHERE username = ?', [user.username]
//       );
//       if (existingUsername) {
//         return res.status(400).json({ success: false, message: 'Username already in use' });
//       }

//       const [[existingPhone]] = await db.query(
//         'SELECT id FROM users WHERE phone_no = ?', [user.phone_no]
//       );
//       if (existingPhone) {
//         return res.status(400).json({ success: false, message: 'Phone number already in use' });
//       }

//       // â”€â”€ 4. Upload photo to S3 (if provided) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       if (req.file) {
//         console.log('Uploading user photo to S3:', req.file.originalname);
//         const fileName = generateFileName(req.file.originalname);
//         uploadedPhotoUrl = await uploadUserPhotoToS3(req.file.buffer, fileName);
//         console.log('User photo uploaded:', uploadedPhotoUrl);
//       }

//       // â”€â”€ 5. Hash password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       const salt = await bcrypt.genSalt(10);
//       const hashedPassword = await bcrypt.hash(user.password, salt);

//       const allowedCompaniesJson =
//         user.allowed_companies && user.allowed_companies.length > 0
//           ? JSON.stringify(user.allowed_companies)
//           : null;

//       // â”€â”€ 6. Insert into users table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       const [result] = await db.query(
//         `INSERT INTO users (
//           user_id, email, username, phone_no, password, user_role,
//           allowed_companies, login_time_from, login_time_to, is_active
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [
//           user.user_id,
//           user.email,
//           user.username,
//           user.phone_no,
//           hashedPassword,
//           user.user_role,
//           allowedCompaniesJson,
//           user.login_time_from || null,
//           user.login_time_to || null,
//           user.is_active !== undefined ? user.is_active : true,
//         ]
//       );

//       const userId = result.insertId;

//       // â”€â”€ 7. Insert staff details (includes S3 photo URL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       if (staff_details) {
//         await db.query(
//           `INSERT INTO users_details (
//             id, finance_id, staff_name, staff_code, father_spouse_name,
//             experience_years, education_qualification, photo, joining_date
//           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//           [
//             user.user_id,
//             staff_details.finance_id,
//             staff_details.staff_name,
//             staff_details.staff_code,
//             staff_details.father_spouse_name || null,
//             staff_details.experience_years || 0,
//             staff_details.education_qualification || null,
//             uploadedPhotoUrl || null,   // â† S3 URL stored here
//             staff_details.joining_date || new Date().toISOString().split('T')[0],
//           ]
//         );
//       }

//       // â”€â”€ 8. Return created user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//       const [createdUser] = await db.query(
//         `SELECT
//           id, user_id, email, username, phone_no, user_role AS role,
//           allowed_companies, login_time_from, login_time_to, is_active, created_at
//         FROM users WHERE id = ?`,
//         [userId]
//       );

//       res.json({
//         success: true,
//         message: 'User created successfully',
//         user: {
//           ...createdUser[0],
//           allowed_companies: createdUser[0].allowed_companies
//             ? JSON.parse(createdUser[0].allowed_companies)
//             : [],
//           photo: uploadedPhotoUrl,
//         },
//       });
//     } catch (error) {
//       // If S3 upload succeeded but DB insert failed, clean up the orphaned photo
//       if (uploadedPhotoUrl) {
//         await deleteUserPhotoFromS3(uploadedPhotoUrl).catch(() => { });
//       }
//       console.error('Create user error:', error);
//       res.status(500).json({ success: false, message: 'Server error', error: error.message });
//     }
//   }
// );

// // Add user deletion endpoint
// router.delete('/users/:id', async (req, res) => {
//   try {
//     const ownerToken = req.headers['owner-authorization']?.replace('Bearer ', '');

//     if (!ownerToken) {
//       return res.status(401).json({
//         success: false,
//         message: 'Owner authentication required'
//       });
//     }

//     const userId = req.params.id;

//     // Soft delete - set is_active to false
//     await db.query(
//       'UPDATE users SET is_active = FALSE WHERE id = ?',
//       [userId]
//     );

//     res.json({
//       success: true,
//       message: 'User deactivated successfully'
//     });

//   } catch (error) {
//     console.error('Delete user error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message
//     });
//   }
// });

// // GET /api/users - Get all users for the current finance
// router.get('/allUsers', enhancedCheckFinance, async (req, res) => {
//   try {
//     const financeId = req.financeId;

//     const [users] = await db.query(`
//      SELECT 
//       id,
//       username,
//       email,
//       user_role as role,
//       phone_no,
//       allowed_companies,
//       is_active,
//       last_login,
//       created_at
//     FROM users 
//     WHERE is_active = TRUE
//       AND JSON_CONTAINS(allowed_companies, ?)
//     ORDER BY 
//       CASE user_role 
//         WHEN 'owner' THEN 1
//         WHEN 'admin' THEN 2
//         WHEN 'agent' THEN 3
//         WHEN 'staff' THEN 4
//         ELSE 5
//       END,
//       username ASC
//     `, [JSON.stringify(financeId)]);

//     const formattedUsers = users.map(user => ({
//       id: user.id,
//       email: user.email,
//       username: user.username,
//       phone_no: user.phone_no,
//       role: user.role,
//       is_active: user.is_active,
//       allowed_companies: user.allowed_companies ? parseAllowedCompanies(user.allowed_companies) : [],
//       last_login: user.last_login,
//       created_at: user.created_at
//     }));

//     res.json({
//       success: true,
//       users: formattedUsers,
//       total: formattedUsers.length
//     });
//   } catch (err) {
//     console.error('Error fetching users:', err);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch users'
//     });
//   }
// });

// // Login route  checkFinance, 
// router.post('/login', async (req, res) => {
//   try {

//     const { email, password } = req.body;
//     // Validate input
//     if (!email || !password) {
//       return res.status(400).json({ success: false, message: 'Email and password are required' });
//     }
//     // Find user by email
//     const [users] = await db.query(
//       'SELECT * FROM users WHERE email = ?',
//       [email]
//     );

//     if (users.length === 0) {
//       return res.status(401).json({ success: false, message: 'Invalid credentials' });
//     }

//     const user = users[0];
//     console.log('User found:', { id: user.id, email: user.email, role: user.role });
//     // Compare password
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ success: false, message: 'Invalid credentials' });
//     }

//     // Create JWT
//     const payload = {
//       user: {
//         id: user.id,
//         email: user.email,
//         role: user.role
//       }
//     };

//     const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

//     // Return user info and token
//     res.json({
//       success: true,
//       user: {
//         id: user.id,
//         email: user.email,
//         role: user.role
//       },
//       token
//     });
//   } catch (error) {
//     console.error('Login error details:', {
//       message: error.message,
//       stack: error.stack,
//       sqlMessage: error.sqlMessage // If it's a database error
//     });
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// });

// // Request password reset route (for owners only)
// router.post('/request-reset', async (req, res) => {
//   try {
//     const { email } = req.body;

//     // Find user by email
//     const [users] = await db.promise().query(
//       'SELECT * FROM users WHERE email = ?',
//       [email]
//     );

//     if (users.length === 0) {
//       // Don't reveal if email exists or not
//       return res.json({ success: true, message: 'If your email exists, a reset link has been sent' });
//     }

//     const user = users[0];

//     // Check if user is an agent (agents can't reset passwords)
//     if (user.role === 'agent') {
//       return res.status(403).json({
//         success: false,
//         message: 'Agents cannot reset passwords. Please contact an owner.',
//         error: 'agent_not_allowed'
//       });
//     }

//     // Generate reset token
//     const resetToken = crypto.randomBytes(32).toString('hex');
//     const resetTokenExpiry = new Date();
//     resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token valid for 1 hour

//     // Save reset token to database
//     await db.promise().query(
//       'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
//       [resetToken, resetTokenExpiry, user.id]
//     );

//     // In a real app, send email with reset link
//     // For now, just return success

//     res.json({
//       success: true,
//       message: 'Password reset link sent',
//       // Only for demo/testing purposes, don't include this in production!
//       resetLink: `http://localhost:5173/reset-password?token=${resetToken}`
//     });
//   } catch (error) {
//     console.error('Reset request error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

// // Reset password with token
// router.post('/reset-password', async (req, res) => {
//   try {
//     const { token, newPassword } = req.body;

//     if (!token || !newPassword) {
//       return res.status(400).json({ success: false, message: 'Token and new password are required' });
//     }

//     // Find user with this reset token that hasn't expired
//     const [users] = await db.promise().query(
//       'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
//       [token]
//     );

//     if (users.length === 0) {
//       return res.status(400).json({ success: false, message: 'Invalid or expired token' });
//     }

//     const user = users[0];

//     // Hash new password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(newPassword, salt);

//     // Update password and clear reset token
//     await db.promise().query(
//       'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
//       [hashedPassword, user.id]
//     );

//     res.json({ success: true, message: 'Password reset successful' });
//   } catch (error) {
//     console.error('Reset password error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

// // Change password (for authenticated users)
// router.post('/change-password', async (req, res) => {
//   try {
//     const { currentPassword, newPassword } = req.body;
//     const userId = req.user.id; // from auth middleware

//     // Validate input
//     if (!currentPassword || !newPassword) {
//       return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
//     }

//     // Find user
//     const [users] = await db.promise().query(
//       'SELECT * FROM users WHERE id = ?',
//       [userId]
//     );

//     if (users.length === 0) {
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }

//     const user = users[0];

//     // Verify current password
//     const isMatch = await bcrypt.compare(currentPassword, user.password);

//     if (!isMatch) {
//       return res.status(401).json({ success: false, message: 'Current password is incorrect' });
//     }

//     // Hash new password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(newPassword, salt);

//     // Update password
//     await db.promise().query(
//       'UPDATE users SET password = ? WHERE id = ?',
//       [hashedPassword, userId]
//     );

//     res.json({ success: true, message: 'Password changed successfully' });
//   } catch (error) {
//     console.error('Change password error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

// // Check user role by email (used for password reset validation)
// router.post('/check-role', async (req, res) => {
//   try {
//     const { email } = req.body;

//     // Find user by email
//     const [users] = await db.promise().query(
//       'SELECT role FROM users WHERE email = ?',
//       [email]
//     );

//     if (users.length === 0) {
//       return res.json({ role: null });
//     }

//     res.json({ role: users[0].role });
//   } catch (error) {
//     console.error('Check role error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

// // Create user (for owner only)
// // Create user (for owner only)
// // router.post('/users', checkFinance, async (req, res) => {
// //   try {
// //     const { email, password, role } = req.body;

// //     // Validate input
// //     if (!email || !password || !role) {
// //       return res.status(400).json({ success: false, message: 'Email, password, and role are required' });
// //     }

// //     if (role !== 'owner' && role !== 'agent') {
// //       return res.status(400).json({ success: false, message: 'Role must be owner or agent' });
// //     }

// //     // Check if email already exists - FIXED
// //     const [existingUsers] = await db.query(
// //       'SELECT * FROM users WHERE email = ? AND finance_id = ?',
// //       [email, req.financeId]
// //     );

// //     if (existingUsers.length > 0) {
// //       return res.status(400).json({ success: false, message: 'Email already in use' });
// //     }

// //     // Hash password
// //     const salt = await bcrypt.genSalt(10);
// //     const hashedPassword = await bcrypt.hash(password, salt);

// //     // Create user with finance_id - FIXED
// //     const userId = crypto.randomUUID();
// //     await db.query(
// //       'INSERT INTO users (id, finance_id, email, password, role) VALUES (?, ?, ?, ?, ?)',
// //       [userId, req.financeId, email, hashedPassword, role]
// //     );

// //     res.json({ 
// //       success: true, 
// //       message: 'User created successfully',
// //       user: {
// //         id: userId,
// //         email,
// //         role,
// //         created_at: new Date().toISOString()
// //       }
// //     });
// //   } catch (error) {
// //     console.error('Create user error:', error);
// //     res.status(500).json({ 
// //       success: false, 
// //       message: 'Server error',
// //       error: error.message 
// //     });
// //   }
// // });

// // Delete user (for owner only) - FIX MIDDLEWARE ORDER
// // router.delete('/users/:id', checkFinance, authMiddleware, ownerOnly, async (req, res) => {
// //   try {
// //     const userId = req.params.id;

// //     console.log('Deleting user with ID:', userId, 'for finance_id:', req.financeId);
// //     console.log('Request user:', req.user); // Debug log to check if user is defined

// //     // Validate input
// //     if (!userId) {
// //       return res.status(400).json({ success: false, message: 'User ID is required' });
// //     }

// //     // Check if user exists and belongs to the same finance
// //     const [users] = await db.query(
// //       'SELECT * FROM users WHERE id = ? AND finance_id = ?',
// //       [userId, req.financeId]
// //     );

// //     if (users.length === 0) {
// //       return res.status(404).json({ 
// //         success: false, 
// //         message: 'User not found or does not belong to your finance' 
// //       });
// //     }

// //     const userToDelete = users[0];

// //     // Prevent users from deleting themselves
// //     if (userToDelete.id === req.user.id) {
// //       return res.status(400).json({ 
// //         success: false, 
// //         message: 'You cannot delete your own account' 
// //       });
// //     }

// //     // Delete the user
// //     await db.query(
// //       'DELETE FROM users WHERE id = ? AND finance_id = ?',
// //       [userId, req.financeId]
// //     );

// //     res.json({ 
// //       success: true, 
// //       message: 'User deleted successfully',
// //       deletedUser: {
// //         id: userToDelete.id,
// //         email: userToDelete.email,
// //         role: userToDelete.role
// //       }
// //     });
// //   } catch (error) {
// //     console.error('Delete user error:', error);
// //     res.status(500).json({ 
// //       success: false, 
// //       message: 'Server error',
// //       error: error.message 
// //     });
// //   }
// // });

// router.get('/users', checkFinance, async (req, res) => {
//   try {
//     const [users] = await db.query(
//       `SELECT id, email, role FROM users WHERE finance_id = ?`,
//       [req.financeId]
//     );

//     res.json({
//       success: true,
//       users: users
//     });
//   } catch (err) {
//     console.error('Error fetching users:', err);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch users'
//     });
//   }
// });

// router.get('/allUser', checkFinance, async (req, res) => {
//   try {
//     const [users] = await db.query(`
//       SELECT 
//         id,
//         email,
//         role,
//         created_at
//       FROM users
//       WHERE finance_id = ?
//     `, [req.financeId]); // Add finance_id filter

//     res.json({
//       success: true,
//       users: users
//     });
//   } catch (err) {
//     console.error('Error fetching users:', err);
//     res.status(500).json({
//       success: false,
//       error: err.message
//     });
//   }
// });

// router.get('/health', (req, res) => {
//   res.json({
//     status: 'healthy',
//     endpoints: {
//       owner_login: '/auth/owner-login',
//       finance_login: '/auth/finance-login'
//     }
//   });
// });

// module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { db } = require('../../config/database.config');
const crypto = require('crypto');
const { authMiddleware, ownerOnly, checkFinance, enhancedCheckFinance } = require('../../middleware/auth.middleware');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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

  if (Array.isArray(value)) return value.map(Number);

  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      return JSON.parse(value).map(Number);
    } catch {
      return [];
    }
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(v => Number(v.trim()))
      .filter(v => Number.isInteger(v));
  }

  return [];
}

// ========= FINANCE LOGIN ==========
router.post('/finance-login', async (req, res) => {
  try {
    const { userName, password } = req.body;

    // PostgreSQL query with parameterized placeholders
    const result = await db.query(`
      SELECT fd.*, f.user_name, f.password 
      FROM finance_detail fd 
      JOIN finnance f ON fd.id = f.finance_id 
      WHERE f.user_name = $1
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
      'SELECT * FROM owner WHERE username = $1 AND is_active = TRUE',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const owner = result.rows[0];
    const isMatch = await bcrypt.compare(password, owner.password);

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
       WHERE owner_id = $1 AND is_active = TRUE 
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

// ========== USER LOGIN WITH FINANCE SELECTION ==========
router.post('/user-login', async (req, res) => {
  try {
    const { email, password, financeId } = req.body;

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

    // PostgreSQL query
    const userResult = await db.query(
      `SELECT * FROM users WHERE email = $1 AND is_active = 1`,
      [email]
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

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error_code: 'INVALID_PASSWORD'
      });
    }

    const allowedCompanies = parseAllowedCompanies(user.allowed_companies);

    const financeIdNum = Number(financeId);
    if (!Number.isInteger(financeIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid financeId',
        error_code: 'INVALID_FINANCE_ID'
      });
    }

    if (!allowedCompanies.includes(financeIdNum)) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized for this finance company',
        error_code: 'FINANCE_ACCESS_DENIED'
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
        AND ah.is_current = TRUE
      LEFT JOIN addresses a ON ah.address_id = a.id
      LEFT JOIN owner o ON fd.owner_id = o.id
      WHERE fd.id = $1 AND fd.is_active = TRUE
    `, [financeIdNum]);

    if (financeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Finance company not found',
        error_code: 'FINANCE_NOT_FOUND'
      });
    }

    const financeRaw = financeResult.rows[0];

    if (financeRaw.owner_id !== ownerDecoded.owner.id) {
      return res.status(403).json({
        success: false,
        message: 'Finance company does not belong to this owner',
        error_code: 'FINANCE_OWNER_MISMATCH'
      });
    }

    const financeData = formatFinanceData(financeRaw);

    // PostgreSQL query for statistics
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers WHERE finance_id = $1) as customer_count,
        (SELECT COUNT(*) FROM loans WHERE finance_id = $1) as loan_count,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE finance_id = $1) as total_collection
    `, [financeIdNum]);

    const userToken = jwt.sign(
      {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.user_role,
          allowed_companies: allowedCompanies,
          current_finance_id: financeIdNum,
          finance_name: financeData.name
        }
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // PostgreSQL UPDATE with NOW()
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        email: user.email,
        username: user.username,
        phone_no: user.phone_no,
        role: user.user_role,
        allowed_companies: allowedCompanies,
        current_finance_id: financeIdNum,
        login_time_from: user.login_time_from,
        login_time_to: user.login_time_to,
        last_login: user.last_login,
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
        AND ah.is_current = TRUE
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.owner_id = $1 AND fd.is_active = TRUE
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

    const financeId = Number(req.params.financeId);

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
        AND ah.is_current = TRUE
      LEFT JOIN addresses a ON ah.address_id = a.id
      WHERE fd.id = $1 AND fd.owner_id = $2 AND fd.is_active = TRUE
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

      if (user.login_time_from && user.login_time_to) {
        if (user.login_time_from >= user.login_time_to) {
          return res.status(400).json({
            success: false,
            message: 'Login end time must be after start time',
          });
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

      const allowedCompaniesJson =
        user.allowed_companies && user.allowed_companies.length > 0
          ? JSON.stringify(user.allowed_companies)
          : null;

      // PostgreSQL INSERT with RETURNING
      const insertResult = await db.query(
        `INSERT INTO users (
          user_id, email, username, phone_no, password, user_role,
          allowed_companies, login_time_from, login_time_to, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          user.user_id,
          user.email,
          user.username,
          user.phone_no,
          hashedPassword,
          user.user_role,
          allowedCompaniesJson,
          user.login_time_from || null,
          user.login_time_to || null,
          user.is_active !== undefined ? user.is_active : true,
        ]
      );

      const userId = insertResult.rows[0].id;

      // Insert staff details
      if (staff_details) {
        await db.query(
          `INSERT INTO users_details (
            id, finance_id, staff_name, staff_code, father_spouse_name,
            experience_years, education_qualification, photo, joining_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            user.user_id,
            staff_details.finance_id,
            staff_details.staff_name,
            staff_details.staff_code,
            staff_details.father_spouse_name || null,
            staff_details.experience_years || 0,
            staff_details.education_qualification || null,
            uploadedPhotoUrl || null,
            staff_details.joining_date || new Date().toISOString().split('T')[0],
          ]
        );
      }

      // PostgreSQL SELECT to get created user
      const userResult = await db.query(
        `SELECT
          id, user_id, email, username, phone_no, user_role AS role,
          allowed_companies, login_time_from, login_time_to, is_active, created_at
        FROM users WHERE id = $1`,
        [userId]
      );

      const createdUser = userResult.rows[0];
      let parsedAllowedCompanies = [];
      try {
        parsedAllowedCompanies = createdUser.allowed_companies ? JSON.parse(createdUser.allowed_companies) : [];
      } catch {
        parsedAllowedCompanies = [];
      }

      res.json({
        success: true,
        message: 'User created successfully',
        user: {
          ...createdUser,
          allowed_companies: parsedAllowedCompanies,
          photo: uploadedPhotoUrl,
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
      'UPDATE users SET is_active = FALSE WHERE id = $1',
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
    const result = await db.query(`
      SELECT 
        id,
        username,
        email,
        user_role as role,
        phone_no,
        allowed_companies,
        is_active,
        last_login,
        created_at
      FROM users 
      WHERE is_active = TRUE
        AND allowed_companies @> $1::jsonb
      ORDER BY 
        CASE user_role 
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'agent' THEN 3
          WHEN 'staff' THEN 4
          ELSE 5
        END,
        username ASC
    `, [JSON.stringify([financeId])]);

    const formattedUsers = result.rows.map(user => ({
      id: user.id,
      email: user.email,
      username: user.username,
      phone_no: user.phone_no,
      role: user.role,
      is_active: user.is_active,
      allowed_companies: user.allowed_companies ? parseAllowedCompanies(user.allowed_companies) : [],
      last_login: user.last_login,
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // PostgreSQL query
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('User found:', { id: user.id, email: user.email, role: user.role });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
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

    // PostgreSQL query
    const result = await db.query(
      'SELECT role FROM users WHERE email = $1',
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
    // PostgreSQL query
    const result = await db.query(
      `SELECT id, email, role FROM users WHERE finance_id = $1`,
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
    // PostgreSQL query
    const result = await db.query(`
      SELECT 
        id,
        email,
        role,
        created_at
      FROM users
      WHERE finance_id = $1
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