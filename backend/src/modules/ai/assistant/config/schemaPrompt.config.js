'use strict';

/**
 * Compact `ai_ro` Schema Guide for `run_readonly_select_query` (`schemaPrompt.config.js`).
 *
 * All views in schema `ai_ro` are `security_barrier = true` PostgreSQL views that
 * automatically filter rows to the authenticated company (`app.current_finance_id`).
 * Every column listed below was verified against live `information_schema.columns`.
 */

const CORE_OPERATIONAL_SCHEMA = `
DYNAMIC READ-ONLY SQL SCHEMA (schema \`ai_ro\` ONLY — NEVER query \`public.*\`):
- Every view in \`ai_ro\` is ALREADY filtered to the current finance company automatically. You do NOT need to guess \`finance_id\`.
- Always prefix views with \`ai_ro.\` (e.g. \`FROM ai_ro.customers c JOIN ai_ro.loans l ON l.customer_id = c.id\`).
- Use ONLY single-statement \`SELECT\` or \`WITH ... SELECT\` queries, capped at <= 50 rows.
- Allowed SQL functions ONLY: COUNT, SUM, AVG, MIN, MAX, COALESCE, NULLIF, GREATEST, LEAST, ROUND, FLOOR, CEIL, CEILING, ABS, LOWER, UPPER, TRIM, BTRIM, LTRIM, RTRIM, LENGTH, CHAR_LENGTH, SUBSTRING, SUBSTR, LEFT, RIGHT, REPLACE, CONCAT, TO_CHAR, TO_DATE, DATE_TRUNC, DATE_PART, EXTRACT, AGE, NOW, CURRENT_DATE, CURRENT_TIMESTAMP, CAST, STRING_AGG, ARRAY_AGG, BOOL_OR, BOOL_AND.

CORE VIEWS IN \`ai_ro\`:
1. \`ai_ro.finance_detail\`(id, finance_id, finance_name, phone_numbers, emails, is_active, since, established_date)
2. \`ai_ro.customers\`(id, finance_id, hplno [INT loan account no], loan_status ['active'|'closed'|'seized'|'settled'|'legal'], broker_name, cname [customer name], cfname_value [father/spouse name], cfname_unit, vehicle_id, profession, home_address, current_address, work_office_address, created_at)
3. \`ai_ro.contacts\`(id, finance_id, customer_id -> customers.id, contact_type ['customer'|'guardian'], type ['mobile'|'landline'|'whatsapp'|'alternate'], number, phone_e164, is_dnc, dnc_reason)
4. \`ai_ro.guardians\`(id, finance_id, customer_id -> customers.id, gname, gfname_value, gfname_unit, profession, remarks, work_office_address)
5. \`ai_ro.addresses\`(id, house_no, street, street_name, village, land_mark, address, city, district, state, pincode, location, label) & \`ai_ro.address_history\`(id, entity_type, entity_id, address_id -> addresses.id, is_current, changed_at)
6. \`ai_ro.loans\`(id, finance_id, customer_id -> customers.id, vehicle_id -> vehicle_detail.id, loan_type, hp_amount [principal], hp_date [disbursement date], due_date [first EMI date], due_month [total tenure months], interest_rate, due_amount [monthly EMI], penalty_amount, penalty_days, principle_part, interest_part, down_payment, net_payment, net_payable [hp_amount + total interest], hand_loan, broker_name, dealer_name, documentation_charge, broker_commission, remarks)
7. \`ai_ro.payments\`(id, finance_id, customer_id -> customers.id, due_date, payment_date, bill_number, amount, penalty, hand_loan, status, payment_status, cancelled_by [NULL when valid; ignore cancelled rows where cancelled_by IS NOT NULL OR status::text = 'cancelled'], collected_by, collected_by_id -> staff_members.user_id, payment_mode ['cash'|'upi'|'bank'|'cheque'|'card'], payment_mode_1, payment_mode_1_amount, remarks, is_approved, created_at)
8. \`ai_ro.sub_due\`(id, finance_id, customer_id, payment_id -> payments.id, bill_number, payment_date, paid_amount, payment_mode, status, collected_by, cancelled_by)
9. \`ai_ro.penalties\`(id, loan_id -> loans.id, overdue_days, per_day_rate, base_penalty, other_charges, total_penalty, calculated_at, settled_payment_id)
10. \`ai_ro.promise_to_pay\`(id, finance_id, customer_id -> customers.id, loan_id -> loans.id, user_id, promised_amount, promised_date, promised_time_text, ptp_status ['pending'|'kept'|'broken'|'rescheduled'|'cancelled'], broken_count, reason, note, is_superseded, created_at)
11. \`ai_ro.customer_agent_assignments\`(id, finance_id, customer_id -> customers.id, agent_id -> staff_members.user_id, priority, status, due_amount, notes, assigned_at, completed_at, target_date)
12. \`ai_ro.vehicle_detail\`(id, finance_id, vehicle_info_id -> vehicle_info.id, vehicle_number [plate], vehicle_modal, chassis_number, engine_number, num_owner, trip_driven, color, variant, selling_price, base_price, final_price, status, selling_date, deal_type, rc_holder, rc_status, fc_expiry_date, insurance_expiry_date)
13. \`ai_ro.vehicle_info\`(id, brand, model_name, make_year, fuel_type, engine_capacity, mileage, transmission, body_type)
14. \`ai_ro.seizing_vehicle\`(id, finance_id, customer_id -> customers.id, vehicle_id -> vehicle_detail.id, godown_id -> godowns.id, seizing_charge, description, seized_by, seizing_date, status, release_date, bill_number)
15. \`ai_ro.godowns\`(id, finance_id, name, address, city, contact_person, contact_number, is_active)
16. \`ai_ro.staff_members\`(user_id, finance_id, username, email, phone_no, role ['owner'|'admin'|'staff'|'agent'], is_active, staff_name, staff_code, joining_date, experience_years)
17. \`ai_ro.ai_telecalling_leads\`(id, finance_id, customer_id, loan_id, phone_e164, days_overdue, installment_amount, overdue_amount, total_balance_amount, pending_emi_count, next_due_date, call_status, last_call_at, call_outcome_note, scheduled_time, attempt_count, callback_requested, is_suppressed)
18. \`ai_ro.ai_telecalling_call_logs\`(id, finance_id, lead_id, customer_id, loan_id, call_status, call_duration_seconds, started_at, ended_at, call_outcome_note, disposition, caller_type, language_used, sentiment, due_amount_at_call, answered, customer_spoke)
19. \`ai_ro.voice_callbacks\`(id, finance_id, customer_id, loan_id, phone_e164, requested_at, scheduled_at, callback_status, customer_note, attempt_count)
20. \`ai_ro.voice_call_summaries\`(id, finance_id, customer_id, loan_id, call_date, language_used, outcome, summary_short, customer_stated_reason, commitment_summary, observable_tone)
21. \`ai_ro.voice_customer_memory\`(id, finance_id, customer_id, active_loan_id, preferred_language, preferred_call_time, recurring_delay_reason, rolling_summary, ptp_kept_count, ptp_broken_count, last_outcome, last_called_at)
`.trim();

const OWNER_ADMIN_ACCOUNTING_SCHEMA = `
OWNER/ADMIN EXPENSE & ACCOUNTING VIEWS IN \`ai_ro\`:
22. \`ai_ro.office_expenses\`(id, finance_id, transaction_type, expense_date, category, description, amount, entered_by, created_at)
23. \`ai_ro.vehicle_expenses\`(id, finance_id, vehicle_id -> vehicle_detail.id, expense_date, description, amount, created_at)
24. \`ai_ro.acc_group_master\`(id, group_name, parent_id, nature, affects_gross_profit, is_active)
25. \`ai_ro.acc_ledger_groups\`(id, finance_id, group_name, alias, parent_group_id, nature, system_group_type, is_active)
26. \`ai_ro.acc_ledgers\`(id, finance_id, ledger_code, ledger_name, alias, group_id -> acc_ledger_groups.id, opening_balance, ob_type ['Dr'|'Cr'], customer_id, vehicle_id, is_bank_account, bank_name, upi_id, is_active)
27. \`ai_ro.acc_ledger_balances\`(id, finance_id, ledger_id -> acc_ledgers.id, financial_year, opening_dr, opening_cr, period_dr, period_cr, closing_dr, closing_cr)
28. \`ai_ro.acc_voucher_types\`(id, finance_id, type_code, type_name, class, prefix, is_active)
29. \`ai_ro.acc_vouchers\`(id, finance_id, voucher_number, voucher_type_id -> acc_voucher_types.id, voucher_date, financial_year, narration, total_amount, customer_id, vehicle_id, loan_id, payment_id, payment_mode, status, is_reconciled)
30. \`ai_ro.acc_voucher_entries\`(id, finance_id, voucher_id -> acc_vouchers.id, ledger_id -> acc_ledgers.id, entry_type ['Dr'|'Cr'], amount, narration)
31. \`ai_ro.acc_financial_years\`(id, finance_id, year_label, start_date, end_date, is_current, is_locked)
32. \`ai_ro.acc_bill_references\`(id, finance_id, ledger_id, voucher_id, bill_number, bill_date, bill_amount, pending_amount, due_date, is_settled, ref_type)
33. \`ai_ro.acc_cost_centres\`(id, finance_id, centre_code, centre_name, parent_id, vehicle_id, is_active)
`.trim();

function buildDynamicSqlSchemaPrompt(role = 'staff') {
  const normRole = String(role || 'staff').toLowerCase();
  if (normRole === 'owner' || normRole === 'admin') {
    return `${CORE_OPERATIONAL_SCHEMA}\n\n${OWNER_ADMIN_ACCOUNTING_SCHEMA}`;
  }
  return `${CORE_OPERATIONAL_SCHEMA}\n\nNOTE: Expense (\`office_expenses\`, \`vehicle_expenses\`) and accounting (\`acc_*\`) views are restricted to owner/admin roles.`;
}

module.exports = {
  CORE_OPERATIONAL_SCHEMA,
  OWNER_ADMIN_ACCOUNTING_SCHEMA,
  buildDynamicSqlSchemaPrompt,
};

