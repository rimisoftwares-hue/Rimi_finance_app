const jwt = require('jsonwebtoken');

const { db } = require('../config/database.config');  // Add this import
// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';  // Use environment variable in production

// Update authMiddleware.js
// const enhancedCheckFinance = async (req, res, next) => {
//   try {
//     // Method 1: Get from Finance-ID header (preferred)
//     const financeId = req.headers['finance-id'] || req.headers['finance_id'];

//     // Method 2: Get from user token
//     if (!financeId) {
//       const userToken = req.headers.authorization?.replace('Bearer ', '');
//       if (userToken) {
//         try {
//           const decoded = jwt.verify(userToken, JWT_SECRET);
//           if (decoded.user?.current_finance_id) {
//             req.financeId = decoded.user.current_finance_id;
//           }
//         } catch (err) {
//           // Token verification failed
//         }
//       }
//     }

//     // Method 3: Get from query/body (for specific endpoints)
//     if (!req.financeId && req.body.finance_id) {
//       req.financeId = req.body.finance_id;
//     }

//     if (!req.financeId && req.query.finance_id) {
//       req.financeId = req.query.finance_id;
//     }

//     if (!req.financeId) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Finance ID is required' 
//       });
//     }

//     // Verify user has access to this finance
//     const userToken = req.headers.authorization?.replace('Bearer ', '');
//     if (userToken) {
//       try {
//         const decoded = jwt.verify(userToken, JWT_SECRET);
//         const allowedCompanies = decoded.user?.allowed_companies || [];

//         if (!allowedCompanies.includes(parseInt(req.financeId))) {
//           return res.status(403).json({ 
//             success: false, 
//             error: 'User not authorized for this finance company' 
//           });
//         }
//       } catch (err) {
//         return res.status(401).json({ 
//           success: false, 
//           error: 'Invalid user token' 
//         });
//       }
//     }

//     // Verify finance exists
//     const [finances] = await db.query(
//       'SELECT id FROM finance_detail WHERE id = ? AND is_active = TRUE',
//       [req.financeId]
//     );

//     if (finances.length === 0) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Finance company not found' 
//       });
//     }

//     // Add finance_id to all subsequent queries
//     req.financeId = parseInt(req.financeId);

//     // Set default finance_id for all database queries
//     req.dbFinanceFilter = ` AND finance_id = ${req.financeId}`;

//     next();
//   } catch (error) {
//     console.error('Finance check error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Finance verification failed' 
//     });
//   }
// };

// authMiddleware.js - Add connection error handling
const enhancedCheckFinance = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token missing',
      });
    }

    const token = authHeader.replace('Bearer ', '');
    let decoded;

    // 1ï¸âƒ£ VERIFY JWT (PRIMARY SOURCE)
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Attach user to request
    req.user = decoded.user;

    let financeId = decoded.user?.current_finance_id;

    // 2ï¸âƒ£ OPTIONAL HEADER OVERRIDE (AUTHORIZED ONLY)
    const headerFinanceId = req.headers['finance-id'];

    if (headerFinanceId) {
      const parsedFinanceId = Number(headerFinanceId);
      const allowedCompanies = decoded.user?.allowed_companies || [];

      if (!allowedCompanies.includes(parsedFinanceId)) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized for this finance company',
        });
      }

      financeId = parsedFinanceId;
    }

    // 3ï¸âƒ£ FINANCE ID MUST EXIST
    if (!financeId) {
      return res.status(400).json({
        success: false,
        error: 'Finance context missing',
      });
    }

    // Normalize once
    req.financeId = Number(financeId);

    // Guard: reject non-numeric finance IDs (e.g. "7:1" parsed as NaN)
    if (isNaN(req.financeId) || req.financeId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid finance ID',
      });
    }

    // 4ï¸âƒ£ VERIFY FINANCE EXISTS & ACTIVE
    try {
      const [finances] = await db.query(
        'SELECT id FROM finance_detail WHERE id = $1 AND is_active = 1',
        [req.financeId]
      );

      if (!finances.length) {
        return res.status(404).json({
          success: false,
          error: 'Finance company not found or inactive',
        });
      }
    } catch (dbError) {
      // Handle database connection errors specifically
      if (dbError.code === 'ECONNRESET' || dbError.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Database connection lost during finance check');
        return res.status(503).json({
          success: false,
          error: 'Database connection issue. Please try again.',
          retry: true
        });
      }
      throw dbError; // Re-throw other errors
    }

    // âœ… Finance context is valid
    next();
  } catch (error) {
    console.error('Finance middleware error:', error);

    // Handle specific error types
    if (error.code === 'ECONNRESET') {
      return res.status(503).json({
        success: false,
        error: 'Database connection lost. Please try again.',
        retry: true
      });
    }

    res.status(500).json({
      success: false,
      error: 'Finance verification failed',
    });
  }
};


// Middleware to authenticate JWT token
const authMiddleware = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  console.log('authHeader :', authHeader)//debug log
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  // Verify token  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Add user info to request
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token is not valid' });
  }
};

const checkFinance = async (req, res, next) => {
  try {
    const authHeader = req.headers['finance-authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Finance authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.financeId = decoded.finance.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid finance token' });
  }
};
// Middleware to check if user is an owner
const ownerOnly = (req, res, next) => {
  // First run auth middleware
  authMiddleware(req, res, () => {
    if (req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Owner role required.'
      });
    }
    next();
  });
};

module.exports = { authMiddleware, ownerOnly, checkFinance, enhancedCheckFinance };
