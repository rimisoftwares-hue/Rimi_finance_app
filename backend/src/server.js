// src/server.js
// HTTP server entry point.
// Starts the Express app and sets up WebSocket.
// Moved from backend/index.js — no logic changes.

const dns = require('dns');
const net = require('net');
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const { loadBackendEnv, assertRequiredAiEnvOnBoot } = require('./config/env.loader');
loadBackendEnv();
assertRequiredAiEnvOnBoot();

const WebSocket = require('ws');
const { app } = require('./app');
const { isConnected, db } = require('./config/database.config');
const { attachAssistantWebSocketGateway } = require('./modules/ai/assistant/gateway/assistantWs.gateway');

const PORT = process.env.PORT || 3004;

// ─── Stale Session Closer (every 2 minutes) ──────────────────────────────────
async function closeStaleSessions() {
  try {
    const res = await db.query(`
      UPDATE agent_login_sessions
         SET logout_time = last_seen_at,
             duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - login_time))::int,
             logout_reason = 'timeout'
       WHERE logout_time IS NULL
         AND last_seen_at < CURRENT_TIMESTAMP - INTERVAL '3 minutes'
    `);
    if (res.rowCount > 0) {
      console.log(`[SessionCloser] Closed ${res.rowCount} stale session(s) due to timeout.`);
    }
  } catch (err) {
    console.error('[SessionCloser] Error closing stale sessions:', err.message);
  }
}

// Run once at boot and then every 2 minutes
closeStaleSessions();
setInterval(closeStaleSessions, 2 * 60 * 1000);

// ─── WebSocket setup ──────────────────────────────────────────────────────────
let wss;

function setupWebSocket(server) {
  wss = new WebSocket.Server({ server });
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    ws.on('close', () => console.log('Client disconnected'));
  });
}

// Broadcast helper (exported for use by route handlers if needed)
function broadcastActivity(activity) {
  if (wss) {
    const data = JSON.stringify({ type: 'activity', payload: activity });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Rimi Finance Backend',
    version: '1.0.0',
    database: isConnected() ? 'connected' : 'disconnected'
  });
});



// ─── Start server ─────────────────────────────────────────────────────────────
console.log('🔄 Starting server...');

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log(`✅ SERVER STARTED SUCCESSFULLY`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`☁️ Tunnel: https://autofinex-desktop-api.rimio.in`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/auth`);
  console.log(`💾 Database: Connected`);
  console.log('='.repeat(60) + '\n');
  // Uncomment to enable WebSocket:
  // setupWebSocket(server);
  attachAssistantWebSocketGateway(server);

  // OCR worker (AI Scan) runs in-process only when both flags are on.
  // It never runs DDL; the OCR tables come from sql/migrations/006_create_ocr_tables.sql.
  const { getOcrConfig } = require('./modules/ocr/ocr.config');
  const ocrCfg = getOcrConfig();
  if (ocrCfg.enabled && ocrCfg.workerEnabled) {
    require('./modules/ocr/ocr.worker').startOcrWorker().catch((err) => {
      console.error('[OCR] Worker failed to start:', err && err.code ? err.code : 'ERROR');
    });
  }
});

// ─── Error handlers ───────────────────────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ PORT ${PORT} IS ALREADY IN USE!\n`);
    console.error('Solutions:');
    console.error('1. Kill the process using port ' + PORT + ':');
    console.error('   netstat -ano | findstr :' + PORT);
    console.error('   taskkill /PID [PID] /F');
    console.error('\n2. Use a different port:');
    console.error('   set PORT=3005');
    console.error('   npm start');
  } else {
    console.error('❌ Server startup error:', err);
  }
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Server initialization complete.');

module.exports = { app, server, broadcastActivity };
