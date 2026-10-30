// src/server.js
// HTTP server entry point.
// Starts the Express app and sets up WebSocket.
// Moved from backend/index.js — no logic changes.

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const WebSocket = require('ws');
const { app } = require('./app');
const { isConnected } = require('./config/database.config');

const PORT = process.env.PORT || 3004;

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
