/**
 * userProfile.routes.js
 *
 * Routes for the logged-in user's own profile overview.
 * Mounted at /api/user in src/routes/index.js
 */

const express = require('express');
const router = express.Router();
const { enhancedCheckFinance } = require('../../middleware/auth.middleware');
const { getUserProfileOverview } = require('./userProfile.service');

/**
 * GET /api/user/profile-overview
 * Returns the logged-in principal's own profile, performance, 7-day login activity,
 * and assigned customers/areas scoped to the active finance context.
 */
router.get('/profile-overview', enhancedCheckFinance, async (req, res, next) => {
  try {
    const result = await getUserProfileOverview(req);
    return res.json(result);
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        error_code: err.errorCode || 'PROFILE_ERROR',
      });
    }
    return next(err);
  }
});

module.exports = router;

