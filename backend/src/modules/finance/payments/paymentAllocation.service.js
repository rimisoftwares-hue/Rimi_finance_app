'use strict';

const VALID_PAYMENT_MODES = new Set([
  'cash',
  'online',
  'bank',
  'upi',
  'cheque',
  'mobile_app',
  'other',
]);

function round2(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

function normalizePaymentMode(mode, { allowNull = false } = {}) {
  const raw = mode === undefined || mode === null ? '' : String(mode).trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'null' || raw === 'undefined') {
    return allowNull ? null : 'cash';
  }
  if (VALID_PAYMENT_MODES.has(raw)) {
    return raw;
  }
  return 'other';
}

function splitAmountInterestFirst(amount, dueAmount, dueInterest, alreadyPaidInterest = 0) {
  const amt = Math.max(0, round2(amount));
  const due = Math.max(0, round2(dueAmount));
  if (amt === 0 || due === 0) {
    return { principalAmount: amt, interestAmount: 0 };
  }
  const intCap = Math.min(due, Math.max(0, round2(dueInterest)));
  const paidInt = Math.max(0, round2(alreadyPaidInterest));

  if (amt <= due || paidInt > 0) {
    const remInt = Math.max(0, round2(intCap - paidInt));
    const interestAmount = Math.min(amt, remInt);
    return {
      principalAmount: round2(amt - interestAmount),
      interestAmount,
    };
  }

  const fullDues = Math.floor(amt / due);
  const remAmt = round2(amt - fullDues * due);
  const interestAmount = Math.min(
    amt,
    round2(fullDues * intCap + Math.min(remAmt, intCap))
  );
  return {
    principalAmount: round2(amt - interestAmount),
    interestAmount,
  };
}

function previewMultiDueAllocation({
  amount = 0,
  principalAmount = null,
  interestAmount = null,
  dueAmount = 0,
  dueInterest = 0,
  openDues = [],
}) {
  const totalReceived = Math.max(0, round2(amount));
  const due = Math.max(0, round2(dueAmount)) || totalReceived;
  const intCap = Math.min(due, Math.max(0, round2(dueInterest)));

  const activeOpen = (openDues || []).filter((d) => round2(d.paidAmount) < due);
  const firstShortfall = activeOpen.length > 0 ? round2(due - round2(activeOpen[0].paidAmount)) : 0;

  const hasCustom = principalAmount !== null || interestAmount !== null;
  const customP =
    principalAmount !== null
      ? round2(principalAmount)
      : round2(totalReceived - round2(interestAmount));
  const customI =
    interestAmount !== null
      ? round2(interestAmount)
      : round2(totalReceived - customP);

  const singleDueCap = activeOpen.length > 0 ? firstShortfall : due;
  const isMultiDue = singleDueCap > 0 && totalReceived > singleDueCap;
  const singleDueOverrideApplied =
    hasCustom &&
    !isMultiDue &&
    totalReceived > 0 &&
    customP >= 0 &&
    customI >= 0 &&
    round2(customP + customI) === totalReceived;

  let remaining = totalReceived;
  let oldDueCleared = 0;
  let currentPaid = 0;
  let totalPrincipal = 0;
  let totalInterest = 0;

  for (const od of activeOpen) {
    if (remaining <= 0) break;
    const shortfall = round2(due - round2(od.paidAmount));
    const chunk = Math.min(remaining, shortfall);
    const split = singleDueOverrideApplied
      ? { principalAmount: customP, interestAmount: customI }
      : splitAmountInterestFirst(chunk, due, intCap, od.paidInterest || 0);

    oldDueCleared = round2(oldDueCleared + chunk);
    totalPrincipal = round2(totalPrincipal + split.principalAmount);
    totalInterest = round2(totalInterest + split.interestAmount);
    remaining = round2(remaining - chunk);
  }

  let stepIdx = 0;
  while (remaining > 0) {
    const chunk = due > 0 ? Math.min(remaining, due) : remaining;
    const split =
      stepIdx === 0 && singleDueOverrideApplied
        ? { principalAmount: customP, interestAmount: customI }
        : splitAmountInterestFirst(chunk, due, intCap, 0);

    if (stepIdx === 0) currentPaid = chunk;
    totalPrincipal = round2(totalPrincipal + split.principalAmount);
    totalInterest = round2(totalInterest + split.interestAmount);
    remaining = round2(remaining - chunk);
    stepIdx += 1;
  }

  return {
    totalReceived,
    isMultiDue,
    singleDueCap,
    singleDueOverrideApplied,
    oldDueCleared,
    currentPaid,
    totalPrincipal,
    totalInterest,
  };
}

async function processCustomerPaymentDb(conn, params) {
  const { rows } = await conn.query(
    `SELECT public.fn_process_customer_payment(
      $1::uuid, $2::uuid, $3::date, $4::numeric,
      $5::numeric, $6::numeric, $7::date, $8::numeric,
      $9::varchar, $10::numeric, $11::varchar, $12::uuid,
      $13::varchar, $14::varchar, $15::numeric,
      $16::numeric, $17::text, $18::text
    ) AS result`,
    [
      params.financeId,
      params.customerId,
      params.paymentDate || null,
      Number(params.amount) || 0,
      params.principal_amount !== undefined && params.principal_amount !== null && params.principal_amount !== ''
        ? Number(params.principal_amount)
        : null,
      params.interest_amount !== undefined && params.interest_amount !== null && params.interest_amount !== ''
        ? Number(params.interest_amount)
        : null,
      params.dueDate || null,
      params.dueAmount ? Number(params.dueAmount) : null,
      params.billNumber || null,
      Number(params.penalty) || 0,
      params.collected_by || null,
      params.collected_by_id || null,
      normalizePaymentMode(params.payment_mode, { allowNull: false }),
      normalizePaymentMode(params.payment_mode_1, { allowNull: true }),
      Number(params.payment_mode_1_amount) || 0,
      Number(params.hand_loan) || 0,
      params.hand_loan_remark || null,
      params.remarks || null,
    ]
  );

  return rows[0]?.result || {};
}

async function fetchCustomerPaymentsWithSubDues(runner, financeId, customerId) {
  const queryRunner = runner || require('../../../config/database.config').db;
  const { rows } = await queryRunner.query(
    `SELECT
       p.id,
       TO_CHAR(p.due_date, 'YYYY-MM-DD') AS "dueDate",
       TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS "paymentDate",
       p.bill_number AS "billNumber",
       p.amount,
       p.principal_amount,
       p.interest_amount,
       p.penalty,
       p.status,
       p.payment_status,
       p.collected_by,
       p.payment_mode,
       p.payment_mode_1,
       p.payment_mode_1_amount,
       p.cancelled_by,
       p.edited_by,
       p.edited_at,
       p.hand_loan,
       p.hand_loan_remark,
       p.remarks,
       p.created_at,
       sd.id AS sub_due_id,
       sd.bill_number AS sub_due_bill_number,
       TO_CHAR(sd.payment_date, 'YYYY-MM-DD') AS sub_due_payment_date,
       sd.paid_amount AS sub_due_paid_amount,
       sd.principal_amount AS sub_due_principal_amount,
       sd.interest_amount AS sub_due_interest_amount,
       sd.payment_mode AS sub_due_payment_mode,
       sd.payment_mode_amount AS sub_due_payment_mode_amount,
       sd.payment_mode_1 AS sub_due_payment_mode_1,
       sd.payment_mode_1_amount AS sub_due_payment_mode_1_amount,
       sd.status AS sub_due_status,
       sd.collected_by AS sub_due_collected_by,
       sd.cancelled_by AS sub_due_cancelled_by,
       sd.edited_by AS sub_due_edited_by,
       sd.edited_at AS sub_due_edited_at,
       sd.created_at AS sub_due_created_at,
       ROW_NUMBER() OVER (
         PARTITION BY sd.payment_id
         ORDER BY sd.payment_date ASC, sd.created_at ASC, sd.id ASC
       ) AS sub_due_row_no
     FROM public.payments p
     LEFT JOIN public.sub_due sd
       ON sd.payment_id = p.id
      AND sd.customer_id = $1::uuid
     WHERE p.customer_id = $1::uuid
       AND (p.finance_id IS NULL OR p.finance_id = $2::uuid)
     ORDER BY p.due_date ASC NULLS LAST, p.created_at ASC, p.id ASC`,
    [customerId, financeId]
  );

  const paymentsMap = new Map();
  for (const row of rows) {
    let payment = paymentsMap.get(row.id);
    if (!payment) {
      payment = {
        id: row.id,
        dueDate: row.dueDate,
        paymentDate: row.paymentDate,
        billNumber: row.billNumber,
        amount: Number(row.amount) || 0,
        principal_amount: Number(row.principal_amount) || 0,
        interest_amount: Number(row.interest_amount) || 0,
        penalty: Number(row.penalty) || 0,
        status: row.status,
        payment_status: row.payment_status,
        collected_by: row.collected_by,
        payment_mode: row.payment_mode || 'cash',
        payment_mode_1: row.payment_mode_1,
        payment_mode_1_amount: Number(row.payment_mode_1_amount) || 0,
        cancelled_by: row.cancelled_by,
        edited_by: row.edited_by,
        edited_at: row.edited_at,
        hand_loan: Number(row.hand_loan) || 0,
        hand_loan_remark: row.hand_loan_remark,
        remarks: row.remarks,
        created_at: row.created_at,
        sub_dues: [],
        sub_due: [],
      };
      paymentsMap.set(row.id, payment);
    }

    if (row.sub_due_id) {
      const subItem = {
        id: row.sub_due_id,
        payment_id: row.id,
        row_no: Number(row.sub_due_row_no) || 1,
        bill_number: row.sub_due_bill_number,
        payment_date: row.sub_due_payment_date,
        paid_amount: Number(row.sub_due_paid_amount) || 0,
        principal_amount: Number(row.sub_due_principal_amount) || 0,
        interest_amount: Number(row.sub_due_interest_amount) || 0,
        payment_mode: row.sub_due_payment_mode || 'cash',
        payment_mode_amount: Number(row.sub_due_payment_mode_amount) || 0,
        payment_mode_1: row.sub_due_payment_mode_1,
        payment_mode_1_amount: Number(row.sub_due_payment_mode_1_amount) || 0,
        status: row.sub_due_status,
        collected_by: row.sub_due_collected_by,
        cancelled_by: row.sub_due_cancelled_by,
        edited_by: row.sub_due_edited_by,
        edited_at: row.sub_due_edited_at,
        created_at: row.sub_due_created_at,
      };
      payment.sub_dues.push(subItem);
      payment.sub_due.push(subItem);
    }
  }

  return Array.from(paymentsMap.values());
}

module.exports = {
  round2,
  normalizePaymentMode,
  splitAmountInterestFirst,
  previewMultiDueAllocation,
  processCustomerPaymentDb,
  fetchCustomerPaymentsWithSubDues,
};
