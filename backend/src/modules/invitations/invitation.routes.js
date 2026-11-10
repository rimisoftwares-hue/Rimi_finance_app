const express = require('express');
const jwt = require('jsonwebtoken');
const { enhancedCheckFinance } = require('../../middleware/auth.middleware');
const {
  InvitationError,
  searchUserForInvite,
  createInviteCode,
  createDirectInvite,
  listCompanyInvitations,
  revokeInvitation,
  deleteInvitation,
  listMyPendingInvitations,
  respondToDirectInvitation,
  redeemInviteCode,
} = require('./invitation.service');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Normalize x-finance-id -> finance-id before enhancedCheckFinance
function normalizeFinanceHeader(req, _res, next) {
  if (!req.headers['finance-id'] && req.headers['x-finance-id']) {
    req.headers['finance-id'] = req.headers['x-finance-id'];
  }
  next();
}

const companyScopedAuth = [normalizeFinanceHeader, enhancedCheckFinance];

// User-scoped auth middleware (does NOT require finance-id header)
function userScopedAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers['owner-authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.user) {
      req.user = decoded.user;
      req.isOwner = false;
      return next();
    }

    if (decoded.owner) {
      req.owner = decoded.owner;
      req.isOwner = true;
      return next();
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token structure',
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token',
    });
  }
}

function handleRouteError(res, err) {
  if (err instanceof InvitationError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  }
  console.error('[Invitations Route Error]:', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

// ── User-Scoped Routes (Must be registered before parameterized /:id routes) ──

// 7. GET /api/invitations/mine/pending
router.get('/mine/pending', userScopedAuth, async (req, res) => {
  try {
    const invitations = await listMyPendingInvitations(req);
    return res.json({
      success: true,
      invitations,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 9. POST /api/invitations/codes/redeem
router.post('/codes/redeem', userScopedAuth, async (req, res) => {
  try {
    const result = await redeemInviteCode(req);
    return res.json({
      success: true,
      message: `Joined ${result.membership.financeName} as ${result.membership.role}`,
      invitation: result.invitation,
      membership: result.membership,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 8. POST /api/invitations/:id/respond
router.post('/:id/respond', userScopedAuth, async (req, res) => {
  try {
    const result = await respondToDirectInvitation(req);
    return res.json({
      success: true,
      message:
        result.invitation.derivedStatus === 'accepted'
          ? `Accepted invitation to ${result.invitation.financeName}`
          : `Declined invitation to ${result.invitation.financeName}`,
      invitation: result.invitation,
      membership: result.membership,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// ── Company-Scoped Routes ────────────────────────────────────────────────────

// 1. GET /api/invitations/search-user
router.get('/search-user', companyScopedAuth, async (req, res) => {
  try {
    const result = await searchUserForInvite(req);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 2. POST /api/invitations/codes
router.post('/codes', companyScopedAuth, async (req, res) => {
  try {
    const invitation = await createInviteCode(req);
    return res.status(201).json({
      success: true,
      invitation,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 3. POST /api/invitations/direct
router.post('/direct', companyScopedAuth, async (req, res) => {
  try {
    const invitation = await createDirectInvite(req);
    return res.status(201).json({
      success: true,
      invitation,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 4. GET /api/invitations
router.get('/', companyScopedAuth, async (req, res) => {
  try {
    const result = await listCompanyInvitations(req);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 5. POST /api/invitations/:id/revoke
router.post('/:id/revoke', companyScopedAuth, async (req, res) => {
  try {
    const invitation = await revokeInvitation(req);
    return res.json({
      success: true,
      invitation,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// 6. DELETE /api/invitations/:id
router.delete('/:id', companyScopedAuth, async (req, res) => {
  try {
    const result = await deleteInvitation(req);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

module.exports = router;
