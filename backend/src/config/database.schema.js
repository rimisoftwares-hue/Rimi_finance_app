const fs = require('fs');
const path = require('path');
const { db, isConnected } = require('./database.config');

/**
 * PostgreSQL Database Schema Initializer / Runner
 * Source of truth: AutoFinex_final_schema.sql
 */

async function applySchema(schemaFilePath) {
  const defaultPath = path.resolve(__dirname, '../../../../Schema/AutoFinex_final_schema.sql');
  const targetPath = schemaFilePath || defaultPath;

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Schema file not found at: ${targetPath}`);
  }

  console.log(`📄 Reading PostgreSQL schema from: ${targetPath}`);
  const sql = fs.readFileSync(targetPath, 'utf8');

  console.log('⏳ Executing schema DDL statements against PostgreSQL...');
  const client = await db.connect();
  try {
    await client.query(sql);
    console.log('✅ PostgreSQL schema applied successfully!');
  } catch (err) {
    console.error('❌ Error executing PostgreSQL schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function verifyTables() {
  try {
    const { rows } = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`📊 Found ${rows.length} tables in PostgreSQL database:`);
    console.log(rows.map(r => r.table_name).join(', '));
    return rows.map(r => r.table_name);
  } catch (err) {
    console.error('❌ Error verifying tables:', err.message);
    throw err;
  }
}

// If run directly: node src/config/database.schema.js
if (require.main === module) {
  (async () => {
    try {
      console.log('🚀 Running PostgreSQL schema runner...');
      await applySchema();
      await verifyTables();
      process.exit(0);
    } catch (err) {
      console.error('Schema initialization failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  applySchema,
  verifyTables
};
