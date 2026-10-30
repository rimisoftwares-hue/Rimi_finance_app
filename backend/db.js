const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Sanjay@2006',
  database: process.env.DB_NAME || 'finmotive',
  port: process.env.DB_PORT || 5432,

  max: 10, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  keepAlive: true,
  ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
});

let isConnected = false;

async function connectWithRetry(retryDelay = 5000) {
  try {
    const client = await db.connect();

    isConnected = true;
    console.log('✅ PostgreSQL connected');

    client.release();
  } catch (err) {
    isConnected = false;
    console.error('❌ PostgreSQL unavailable. Retrying in 5s...', err.message);

    setTimeout(() => connectWithRetry(retryDelay), retryDelay);
  }
}

// Start retry loop
connectWithRetry();

module.exports = {
  db,
  isConnected: () => isConnected
};