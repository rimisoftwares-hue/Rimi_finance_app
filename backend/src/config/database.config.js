const { Pool } = require('pg');
require('dotenv').config();

function isLocalDbHost(rawHost) {
  const host = String(rawHost || '').trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (host.startsWith('/')) return true;
  return false;
}

function assertSafeTestDbTarget(env = process.env) {
  if (String(env.NODE_ENV || '').trim() !== 'test') {
    return;
  }
  const allowRemote = String(env.ALLOW_REMOTE_DB_IN_TESTS || '').trim().toLowerCase() === 'true';
  if (!allowRemote && !isLocalDbHost(env.DB_HOST)) {
    const err = new Error(
      'Refusing to connect to non-local DB host in NODE_ENV=test unless ALLOW_REMOTE_DB_IN_TESTS=true is explicitly set'
    );
    err.code = 'TEST_REMOTE_DB_BLOCKED';
    throw err;
  }
}

const blockedAtInit =
  String(process.env.NODE_ENV || '').trim() === 'test' &&
  String(process.env.ALLOW_REMOTE_DB_IN_TESTS || '').trim().toLowerCase() !== 'true' &&
  !isLocalDbHost(process.env.DB_HOST);

const db = new Pool({
  host: blockedAtInit ? '127.0.0.1' : process.env.DB_HOST,
  user: blockedAtInit ? 'blocked_test_user' : process.env.DB_USER,
  password: blockedAtInit ? '' : process.env.DB_PASSWORD,
  database: blockedAtInit ? 'blocked_test_db' : process.env.DB_NAME,
  port: blockedAtInit ? 1 : process.env.DB_PORT,

  max: 10, // Equivalent to connectionLimit
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // 30s timeout for remote cloud latency

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // 10s keepalive to prevent firewall/NAT drops
  ssl: !blockedAtInit && process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
});

// Handle idle client errors gracefully
db.on('error', (err) => {
  console.error('⚠️ Unexpected PostgreSQL pool error on idle client:', err.message);
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

// 🔁 Start retry loop (skip in test environment to avoid unhandled open handles)
if (process.env.NODE_ENV !== 'test') {
  connectWithRetry();
}

// Query normalizer: converts legacy ? placeholders to PostgreSQL $1, $2, ...
function normalizeQuery(text, params) {
  if (typeof text === 'string') {
    let queryText = text;
    if (queryText.includes('?')) {
      let idx = 1;
      queryText = queryText.replace(/\?/g, () => `$${idx++}`);
    }
    return { text: queryText, params };
  } else if (text && typeof text === 'object' && typeof text.text === 'string') {
    let queryText = text.text;
    if (queryText.includes('?')) {
      let idx = 1;
      queryText = queryText.replace(/\?/g, () => `$${idx++}`);
    }
    return { text: { ...text, text: queryText }, params };
  }
  return { text, params };
}

// Enhances PostgreSQL query result to be compatible with both pg ({ rows }) and MySQL2 ([rows, fields]) destructuring
function wrapQueryResult(res) {
  if (res && typeof res === 'object' && Array.isArray(res.rows)) {
    if (!res[Symbol.iterator]) {
      res[Symbol.iterator] = function* () {
        yield res.rows;
        yield res.fields;
      };
    }
    if (res.rows.length > 0 && res.rows[0] && res.rows[0].id !== undefined && res.insertId === undefined) {
      res.insertId = res.rows[0].id;
    }
  }
  return res;
}

// Wrap db.connect, db.query, db.execute, and db.getConnection to enforce test remote-DB safety guard
const origPoolConnect = db.connect.bind(db);
db.connect = async function (...args) {
  assertSafeTestDbTarget(process.env);
  return origPoolConnect(...args);
};

const origPoolQuery = db.query.bind(db);
db.query = async function (text, params) {
  assertSafeTestDbTarget(process.env);
  const norm = normalizeQuery(text, params);
  try {
    const res = await (norm.params !== undefined ? origPoolQuery(norm.text, norm.params) : origPoolQuery(norm.text));
    return wrapQueryResult(res);
  } catch (err) {
    if (err && err.message && (err.message.includes('Connection terminated') || err.message.includes('timeout') || err.message.includes('ECONNRESET'))) {
      console.warn('⚠️ Stale connection encountered, retrying query...', err.message);
      const res = await (norm.params !== undefined ? origPoolQuery(norm.text, norm.params) : origPoolQuery(norm.text));
      return wrapQueryResult(res);
    }
    throw err;
  }
};

// Wrap db.execute
db.execute = async function (text, params) {
  assertSafeTestDbTarget(process.env);
  const norm = normalizeQuery(text, params);
  try {
    const res = await (norm.params !== undefined ? origPoolQuery(norm.text, norm.params) : origPoolQuery(norm.text));
    return [res.rows, res.fields];
  } catch (err) {
    if (err && err.message && (err.message.includes('Connection terminated') || err.message.includes('timeout') || err.message.includes('ECONNRESET'))) {
      console.warn('⚠️ Stale connection encountered, retrying execute...', err.message);
      const res = await (norm.params !== undefined ? origPoolQuery(norm.text, norm.params) : origPoolQuery(norm.text));
      return [res.rows, res.fields];
    }
    throw err;
  }
};

// Connection provider for transactions and legacy getConnection calls
db.getConnection = async function () {
  assertSafeTestDbTarget(process.env);
  const client = await db.connect();
  const origClientQuery = client.query.bind(client);
  const origRelease = client.release.bind(client);

  client.query = function (text, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = undefined;
    }
    const norm = normalizeQuery(text, params);
    if (typeof callback === 'function') {
      return origClientQuery(norm.text, norm.params, (err, res) => {
        if (err) return callback(err);
        return callback(null, wrapQueryResult(res));
      });
    }
    return (async () => {
      const res = await (norm.params !== undefined ? origClientQuery(norm.text, norm.params) : origClientQuery(norm.text));
      return wrapQueryResult(res);
    })();
  };

  client.execute = async function (text, params) {
    const norm = normalizeQuery(text, params);
    const res = await (norm.params !== undefined ? origClientQuery(norm.text, norm.params) : origClientQuery(norm.text));
    return [res.rows, res.fields];
  };

  client.beginTransaction = async function () {
    return origClientQuery('BEGIN');
  };

  client.commit = async function () {
    return origClientQuery('COMMIT');
  };

  client.rollback = async function () {
    return origClientQuery('ROLLBACK');
  };

  client.release = function (destroy) {
    client.query = origClientQuery;
    client.release = origRelease;
    delete client.execute;
    delete client.beginTransaction;
    delete client.commit;
    delete client.rollback;
    return origRelease(destroy);
  };

  return client;
};

module.exports = {
  db,
  isConnected: () => isConnected,
  isLocalDbHost,
  assertSafeTestDbTarget,
};
