'use strict';

/**
 * Phase A Read-Only & Post-Apply Verification Script
 * --------------------------------------------------
 * Safe to run before or after applying `004_lead_calling_recording_and_readonly_role.sql`.
 * - Never prints credentials, connection strings, or raw phone PII.
 * - Uses `BEGIN READ ONLY ... ROLLBACK` on the primary connection.
 * - When `AUTOFINEX_RO_DATABASE_URL` or `VOICE_RO_DB_PASSWORD` is set, connects
 *   as `autofinex_voice_ro` and verifies SQLSTATE `25006` write denial,
 *   SQLSTATE `42501` privilege denial, and `RESTRICTIVE` RLS tenant isolation.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client } = require('pg');

function buildSslConfig() {
  return process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false;
}

function maskPhone(e164) {
  if (!e164) return null;
  const s = String(e164);
  if (s.length <= 6) return '***';
  return `${s.slice(0, 4)}****${s.slice(-2)}`;
}

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: buildSslConfig(),
  });

  await client.connect();
  let allApplied = true;

  try {
    await client.query('BEGIN READ ONLY');

    const meta = await client.query(`
      SELECT current_user AS connected_role,
             current_setting('server_version') AS pg_version,
             current_setting('TIMEZONE') AS db_timezone
    `);
    console.log('=== 1. Live Database Connection (Read-Only Audit) ===');
    console.table(meta.rows);

    const cols = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'ai_telecalling_call_logs' AND column_name IN (
            'call_lifecycle_status', 'answered', 'customer_spoke',
            'recording_s3_key', 'recording_status', 'recording_duration_seconds',
            'recording_size_bytes', 'error_detail', 'idempotency_key',
            'total_tokens', 'tts_characters', 'stt_seconds',
            'llm_model', 'tts_model', 'stt_model'
          ))
          OR (table_name = 'ai_settings' AND column_name = 'leads_last_refreshed_at')
        )
      ORDER BY table_name, column_name
    `);
    const expectedColCount = 16;
    const colsOk = cols.rows.length === expectedColCount;
    if (!colsOk) allApplied = false;
    console.log(`=== 2. 004 Additive Columns (${cols.rows.length}/${expectedColCount}) ===`);
    if (cols.rows.length > 0) console.table(cols.rows);

    const fns = await client.query(`
      SELECT p.proname AS function_name, p.pronargs AS arg_count, p.provolatile AS volatility
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'fn_calculate_customer_due_summary',
          'fn_check_voice_call_eligibility',
          'fn_get_precall_memory_bundle',
          'fn_complete_voice_call'
        )
      ORDER BY p.proname
    `);
    const hasEligibilityFn = fns.rows.some((r) => r.function_name === 'fn_check_voice_call_eligibility');
    if (!hasEligibilityFn) allApplied = false;
    console.log('=== 3. Voice AI SQL Functions ===');
    console.table(fns.rows);

    const roleCheck = await client.query(`
      SELECT r.rolname,
             r.rolcanlogin,
             r.rolsuper,
             r.rolcreaterole,
             r.rolcreatedb,
             r.rolbypassrls,
             r.rolconfig
      FROM pg_roles r
      WHERE r.rolname = 'autofinex_voice_ro'
    `);
    const hasRoRole = roleCheck.rows.length === 1;
    if (!hasRoRole) allApplied = false;
    console.log('=== 4. Read-Only Role (autofinex_voice_ro) ===');
    console.table(roleCheck.rows.length ? roleCheck.rows : [{ status: 'NOT_YET_CREATED (Run 004 as avnadmin)' }]);

    const rlsCheck = await client.query(`
      SELECT tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname = 'voice_ro_require_tenant_ctx'
      ORDER BY tablename
    `);
    if (rlsCheck.rows.length < 4) allApplied = false;
    console.log(`=== 5. RESTRICTIVE RLS Policies (${rlsCheck.rows.length}/4) ===`);
    if (rlsCheck.rows.length > 0) console.table(rlsCheck.rows);

    const dueSample = await client.query(`
      SELECT c.hplno,
             d.loan_status,
             d.installment_amount,
             d.total_contractual_due,
             d.total_paid,
             d.total_balance_amount,
             d.overdue_amount,
             d.pending_emi_count,
             d.days_overdue,
             d.phone_e164
      FROM public.customers c
      CROSS JOIN LATERAL public.fn_calculate_customer_due_summary(c.id, CURRENT_DATE) d
      ORDER BY c.hplno ASC NULLS LAST
      LIMIT 6
    `);
    console.log('=== 6. Live Sample Customer Due Summary (PII Masked) ===');
    console.table(
      dueSample.rows.map((r) => ({
        hplno: r.hplno,
        loan_status: r.loan_status,
        emi: r.installment_amount,
        contractual_due: r.total_contractual_due,
        total_paid: r.total_paid,
        balance: r.total_balance_amount,
        overdue: r.overdue_amount,
        pending_emis: r.pending_emi_count,
        days_overdue: r.days_overdue,
        phone_masked: maskPhone(r.phone_e164),
      }))
    );

    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }

  const roUrl = process.env.AUTOFINEX_RO_DATABASE_URL;
  const roPassword = process.env.VOICE_RO_DB_PASSWORD;

  if (roUrl || roPassword) {
    console.log('=== 7. Live Write-Denial (25006) & ACL (42501) Verification as autofinex_voice_ro ===');
    const roClient = roUrl
      ? new Client({ connectionString: roUrl, ssl: buildSslConfig() })
      : new Client({
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.VOICE_RO_DB_USER || 'autofinex_voice_ro',
          password: roPassword,
          database: process.env.DB_NAME,
          ssl: buildSslConfig(),
        });

    await roClient.connect();
    try {
      const results = [];
      for (const [label, sql] of [
        ['INSERT_DENIED_25006', "INSERT INTO public.payments (customer_id, payment_date, amount) VALUES ('00000000-0000-0000-0000-000000000000', CURRENT_DATE, 1)"],
        ['UPDATE_DENIED_25006', "UPDATE public.customers SET cname = cname WHERE false"],
        ['DELETE_DENIED_25006', "DELETE FROM public.ai_telecalling_leads WHERE false"],
        ['DDL_DENIED_25006', 'CREATE TABLE public.__ro_probe (id int)'],
      ]) {
        try {
          await roClient.query(sql);
          results.push({ check: label, pass: false, code: 'UNEXPECTED_SUCCESS' });
        } catch (err) {
          results.push({ check: label, pass: err.code === '25006', code: err.code, message: err.message });
        }
      }

      await roClient.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE');
      for (const [label, sql] of [
        ['BYPASS_RW_INSERT_42501', "INSERT INTO public.payments (customer_id, payment_date, amount) VALUES ('00000000-0000-0000-0000-000000000000', CURRENT_DATE, 1)"],
        ['EXEC_WRITE_FN_42501', "SELECT public.fn_complete_voice_call('00000000-0000-0000-0000-000000000000'::uuid, 'probe', 'completed'::lead_call_status_enum, 1)"],
        ['READ_USERS_DENIED_42501', 'SELECT count(*) FROM public.users'],
        ['READ_KYC_DENIED_42501', 'SELECT count(*) FROM public.kyc_documents'],
      ]) {
        try {
          await roClient.query(sql);
          results.push({ check: label, pass: false, code: 'UNEXPECTED_SUCCESS' });
        } catch (err) {
          results.push({ check: label, pass: err.code === '42501', code: err.code, message: err.message });
        }
      }

      const rlsUnset = await roClient.query('SELECT count(*)::int AS cnt FROM public.voice_customer_memory');
      results.push({
        check: 'RESTRICTIVE_RLS_UNSET_ZERO_ROWS',
        pass: rlsUnset.rows[0].cnt === 0,
        code: 'OK',
        message: `rows=${rlsUnset.rows[0].cnt}`,
      });

      console.table(results);
      if (results.some((r) => !r.pass)) {
        process.exitCode = 1;
      }
    } finally {
      await roClient.end();
    }
  } else {
    console.log(
      '=== 7. autofinex_voice_ro Live Probe Skipped (set VOICE_RO_DB_PASSWORD or AUTOFINEX_RO_DATABASE_URL after running 004 as avnadmin) ==='
    );
  }

  console.log(`\nPhase A Live Aiven Migration Status: ${allApplied ? 'APPLIED' : 'PENDING_AVNADMIN_APPLY'}`);
}

run().catch((err) => {
  console.error('Phase A verification error:', err.code || '', err.message);
  process.exit(1);
});

