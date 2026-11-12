'use strict';

/**
 * Tenant-scoped `/api/ai` routes for Rimi Finance AI Dashboard, Settings, Logs,
 * Insights, Voice Health, Recording Playback, and Telecalling Lead Queue.
 *
 * Mounted behind `enhancedCheckFinance` in `src/routes/index.js`, guaranteeing
 * `req.financeId` is authenticated and tenant-isolated on every request.
 */

const express = require('express');
const router = express.Router();
const service = require('./ai.service');
const callQueueService = require('./callQueue.service');

function sendError(res, err, fallbackMessage) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error(`${fallbackMessage}:`, err);
  }
  const cooldownSec = Number(err?.details?.cooldown_remaining_seconds || 0);
  if (cooldownSec > 0 && typeof res.setHeader === 'function') {
    res.setHeader('Retry-After', String(Math.ceil(cooldownSec)));
  }
  const exposeStructuredUpstreamError = status < 500 || Boolean(err.code);
  return res.status(status).json({
    success: false,
    error: exposeStructuredUpstreamError ? err.message : fallbackMessage,
    code: err.code || undefined,
    details: exposeStructuredUpstreamError && err.details ? err.details : undefined,
  });
}

async function handleGetVoiceHealth(req, res) {
  try {
    const data = await service.getVoiceHealth(req.query);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to check Voice AI system health');
  }
}

async function handleGetDashboard(req, res) {
  try {
    const data = await service.getDashboardOverview(req.financeId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch AI dashboard overview');
  }
}

async function handleGetInsights(req, res) {
  try {
    const data = await service.getInsightsOverview(req.financeId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch AI insights');
  }
}

async function handleGetLogs(req, res) {
  try {
    const data = await service.getCallLogs(req.financeId, req.query);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch AI conversation logs');
  }
}

async function handleGetSettings(req, res) {
  try {
    const settings = await service.getAiSettings(req.financeId);
    return res.json({ success: true, settings });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch AI settings');
  }
}

async function handleUpdateSettings(req, res) {
  try {
    const settings = await service.updateAiSettings(req.financeId, req.body, {
      userId: req.user?.id || null,
    });
    return res.json({ success: true, settings });
  } catch (err) {
    return sendError(res, err, 'Failed to update AI settings');
  }
}

async function handleGetLeads(req, res) {
  try {
    const data = await service.getTelecallingLeads(req.financeId, req.query);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch AI telecalling leads');
  }
}

async function handleRefreshLeads(req, res) {
  try {
    const data = await service.refreshTelecallingLeads(req.financeId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to refresh AI telecalling leads');
  }
}

async function handleScheduleLeads(req, res) {
  try {
    const data = await service.scheduleLeadCallbacks(req.financeId, req.body);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to schedule AI callbacks');
  }
}

async function handleTriggerLeadCall(req, res) {
  try {
    const data = await service.triggerLeadCall(req.financeId, req.params.leadId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to trigger outbound AI call');
  }
}

async function handleInitiateManualCall(req, res) {
  try {
    const idempotencyKey =
      req.headers?.['idempotency-key'] ?? req.headers?.['Idempotency-Key'] ?? null;
    const data = await service.initiateManualCustomerCall(req.financeId, req.body, {
      userId: req.isOwner ? null : req.user?.id || null,
      idempotencyKey,
      requireIdempotencyKey: true,
    });
    const isReplay = Boolean(data?.idempotencyReplay);
    if (typeof res.setHeader === 'function') {
      res.setHeader('Idempotency-Replay', isReplay ? 'true' : 'false');
    }
    return res.status(isReplay ? 200 : 202).json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to initiate manual Voice AI call');
  }
}

async function handleEnqueueCallBatch(req, res) {
  try {
    const idempotencyKey =
      req.headers?.['idempotency-key'] ?? req.headers?.['Idempotency-Key'] ?? null;
    const data = await callQueueService.enqueueManualCallBatch(req.financeId, req.body, {
      userId: req.isOwner ? null : req.user?.id || null,
      idempotencyKey,
      requireIdempotencyKey: true,
    });
    const isReplay = Boolean(data?.idempotencyReplay);
    if (typeof res.setHeader === 'function') {
      res.setHeader('Idempotency-Replay', isReplay ? 'true' : 'false');
    }
    return res.status(isReplay ? 200 : 202).json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to enqueue manual Voice AI call batch');
  }
}

async function handleGetActiveCallQueue(req, res) {
  try {
    const data = await callQueueService.getActiveQueueStatus(req.financeId, {
      batchId: req.query?.batchId || null,
      reconcileOnRead: true,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch active Voice AI call queue');
  }
}

async function handleCancelCallQueue(req, res) {
  try {
    const data = await callQueueService.cancelQueueBatch(req.financeId, req.params.batchId, {
      userId: req.isOwner ? null : req.user?.id || null,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to cancel pending Voice AI call queue items');
  }
}

async function handleGetCallStatus(req, res) {
  try {
    const data = await service.getCallStatusById(req.financeId, req.params.callId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to fetch Voice AI call status');
  }
}

async function handleGetCallRecordingUrl(req, res) {
  try {
    const data = await service.getCallRecordingPlaybackUrl(req.financeId, req.params.callId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return sendError(res, err, 'Failed to generate call recording playback URL');
  }
}

router.get('/voice-health', handleGetVoiceHealth);
router.get('/dashboard', handleGetDashboard);
router.get('/insights', handleGetInsights);
router.get('/logs', handleGetLogs);
router.get('/settings', handleGetSettings);
router.put('/settings', handleUpdateSettings);
router.get('/leads', handleGetLeads);
router.post('/leads/refresh', handleRefreshLeads);
router.post('/leads/schedule', handleScheduleLeads);
router.post('/leads/:leadId/call', handleTriggerLeadCall);
router.post('/calls/manual', handleInitiateManualCall);
router.post('/calls/queue', handleEnqueueCallBatch);
router.get('/calls/queue/active', handleGetActiveCallQueue);
router.post('/calls/queue/:batchId/cancel', handleCancelCallQueue);
router.get('/calls/:callId', handleGetCallStatus);
router.get('/calls/:callId/recording-url', handleGetCallRecordingUrl);

router.handleGetVoiceHealth = handleGetVoiceHealth;
router.handleGetDashboard = handleGetDashboard;
router.handleGetInsights = handleGetInsights;
router.handleGetLogs = handleGetLogs;
router.handleGetSettings = handleGetSettings;
router.handleUpdateSettings = handleUpdateSettings;
router.handleGetLeads = handleGetLeads;
router.handleRefreshLeads = handleRefreshLeads;
router.handleScheduleLeads = handleScheduleLeads;
router.handleTriggerLeadCall = handleTriggerLeadCall;
router.handleInitiateManualCall = handleInitiateManualCall;
router.handleEnqueueCallBatch = handleEnqueueCallBatch;
router.handleGetActiveCallQueue = handleGetActiveCallQueue;
router.handleCancelCallQueue = handleCancelCallQueue;
router.handleGetCallStatus = handleGetCallStatus;
router.handleGetCallRecordingUrl = handleGetCallRecordingUrl;

module.exports = router;
