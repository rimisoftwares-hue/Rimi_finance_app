'use strict';

/**
 * Internal HMAC-SHA256 Voice AI Write Routes (`/api/internal/voice-ai/*`).
 *
 * Protected exclusively by `requireVoiceAiHmacAuth` (never exposed to browser sessions
 * without HMAC signature + 300s timestamp replay protection).
 */

const express = require('express');
const router = express.Router();
const { verifyInternalSignature } = require('./telecalling/voiceAgent.client');
const internalService = require('./telecalling/ai.internal.service');

function requireVoiceAiHmacAuth(req, res, next) {
  const timestamp = req.headers['x-autofinex-timestamp'];
  const signature = req.headers['x-autofinex-signature'];
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString('utf8')
    : typeof req.rawBody === 'string'
      ? req.rawBody
      : JSON.stringify(req.body ?? {});

  const check = verifyInternalSignature({
    rawBody,
    timestamp,
    signature,
  });

  if (!check.valid) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized internal Voice AI request',
      code: check.reason,
    });
  }

  return next();
}

function sendInternalError(res, err, fallbackMessage) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error(`${fallbackMessage}:`, err);
  }
  return res.status(status).json({
    success: false,
    error: status >= 500 ? fallbackMessage : err.message,
    code: err.code || undefined,
  });
}

async function handleUpdateCallStatus(req, res) {
  try {
    const data = await internalService.updateInternalCallStatus(req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendInternalError(res, err, 'Failed to update internal call status');
  }
}

async function handleScheduleCallback(req, res) {
  try {
    const data = await internalService.recordInternalScheduleCallback(req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendInternalError(res, err, 'Failed to record callback schedule');
  }
}

async function handlePromiseToPay(req, res) {
  try {
    const data = await internalService.recordInternalPromiseToPay(req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendInternalError(res, err, 'Failed to record Promise-to-Pay');
  }
}

async function handlePrivacyOptOut(req, res) {
  try {
    const data = await internalService.recordInternalPrivacyOptOut(req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendInternalError(res, err, 'Failed to process privacy/opt-out request');
  }
}

async function handleEscalation(req, res) {
  try {
    const data = await internalService.recordInternalEscalation(req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendInternalError(res, err, 'Failed to record human escalation');
  }
}

async function handleCompleteCall(req, res) {
  try {
    const data = await internalService.completeInternalVoiceCall(req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendInternalError(res, err, 'Failed to finalize Voice AI call');
  }
}

router.use(requireVoiceAiHmacAuth);

router.post('/calls/status', handleUpdateCallStatus);
router.post('/tools/schedule-callback', handleScheduleCallback);
router.post('/tools/promise-to-pay', handlePromiseToPay);
router.post('/tools/privacy-optout', handlePrivacyOptOut);
router.post('/tools/escalation', handleEscalation);
router.post('/calls/complete', handleCompleteCall);

router.requireVoiceAiHmacAuth = requireVoiceAiHmacAuth;
router.handleUpdateCallStatus = handleUpdateCallStatus;
router.handleScheduleCallback = handleScheduleCallback;
router.handlePromiseToPay = handlePromiseToPay;
router.handlePrivacyOptOut = handlePrivacyOptOut;
router.handleEscalation = handleEscalation;
router.handleCompleteCall = handleCompleteCall;

module.exports = router;
