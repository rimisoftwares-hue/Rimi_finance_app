# Payment & Sub-Due Principal/Interest Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `principal_amount` and `interest_amount` columns to `payments` and `sub_due`, backfill historical records using NBFC Interest-First logic, enforce invariants via PostgreSQL triggers, move multi-due FIFO payment splitting into an atomic PostgreSQL stored function (`fn_process_customer_payment`), and enable Single-Due manual Principal/Interest editing in `PaymentDialog.tsx`.

**Architecture:** Hybrid PostgreSQL Engine + Thin Node.js Service. Multi-due chronological FIFO allocation (`sub_due` top-ups across ALL open/partial dues + current due + clamped-month advance `payments`) executes atomically inside `public.fn_process_customer_payment(...)` under `FOR UPDATE` row locks, avoiding recursive trigger loops when inserting multiple rows into `payments`. Row-level `BEFORE INSERT OR UPDATE` triggers (`trg_payments_pi_sync`, `trg_sub_due_pi_sync`) guarantee `principal_amount + interest_amount = amount/paid_amount` and auto-split legacy/settlement writes, while an `AFTER INSERT OR UPDATE OR DELETE` trigger (`trg_sub_due_parent_status_sync`) keeps parent `payments.status` synchronized.

**Tech Stack:** PostgreSQL 14+/18+ (PL/pgSQL Functions, Guard Triggers, Window CTE Backfill, Zero-Downtime `CHECK ... NOT VALID`), Node.js / Express (`pg`, `node --test`), React 18 + TypeScript + Tailwind CSS.

---

### Task 1: Apply & Verify PostgreSQL Migration `009` (DDL, Backfill, Triggers & `fn_process_customer_payment`)

**Files:**
- Already Created: `backend/sql/main_schema/009_payment_principal_interest_split.sql`
- Already Created (Rollback): `backend/sql/migrations/009_payment_principal_interest_rollback.sql`
- Modify (Greenfield Parity): `backend/sql/main_schema/AutoFinex_final_schema.sql:1775-1959`

**Step 1: Execute Migration `009_payment_principal_interest_split.sql` against PostgreSQL**

Run:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/main_schema/009_payment_principal_interest_split.sql
```
Expected: `BEGIN` ... `ALTER TABLE` ... `UPDATE` ... `CREATE FUNCTION` ... `CREATE TRIGGER` ... `COMMIT` with `0` errors.

**Step 2: Run SQL Validation Queries to Verify Columns, Backfill & Constraints**

Run:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT
  (SELECT COUNT(*) FROM public.payments WHERE ROUND(principal_amount + interest_amount, 2) <> GREATEST(0, ROUND(COALESCE(amount, 0), 2))) AS invalid_payments,
  (SELECT COUNT(*) FROM public.sub_due  WHERE ROUND(principal_amount + interest_amount, 2) <> GREATEST(0, ROUND(COALESCE(paid_amount, 0), 2))) AS invalid_sub_dues,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('trg_payments_pi_sync', 'trg_sub_due_pi_sync', 'trg_sub_due_parent_status_sync')) AS active_triggers;
"
```
Expected: `invalid_payments = 0`, `invalid_sub_dues = 0`, `active_triggers = 3`.

**Step 3: Sync `AutoFinex_final_schema.sql` Table Definitions for Fresh Installations**

In `backend/sql/main_schema/AutoFinex_final_schema.sql`:
- Add `principal_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00` and `interest_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00` under `CREATE TABLE payments` (after `amount`) and `CREATE TABLE sub_due` (after `paid_amount`).

**Step 4: Commit**

```bash
git add backend/sql/main_schema/009_payment_principal_interest_split.sql \
        backend/sql/migrations/009_payment_principal_interest_rollback.sql \
        backend/sql/main_schema/AutoFinex_final_schema.sql
git commit -m "feat(db): add principal/interest split columns, backfill, triggers, and fn_process_customer_payment"
```

---

### Task 2: Create Pure JS Parity & DB Service (`paymentAllocation.service.js`) with Unit Tests

**Files:**
- Create: `backend/src/modules/finance/payments/paymentAllocation.service.js`
- Test: `backend/src/modules/finance/payments/paymentAllocation.test.js`

**Step 1: Write the failing unit tests covering all NBFC Interest-First & Multi-Due scenarios**

```javascript
// backend/src/modules/finance/payments/paymentAllocation.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitAmountInterestFirst,
  previewMultiDueAllocation,
} = require('./paymentAllocation.service');

test('splitAmountInterestFirst: partial payment deducts interest first (₹3,000 on ₹6,000 EMI with ₹1,000 interest)', () => {
  const res = splitAmountInterestFirst(3000, 6000, 1000, 0);
  assert.deepEqual(res, { principalAmount: 2000, interestAmount: 1000 });
});

test('splitAmountInterestFirst: subsequent sub_due deducts only remaining unpaid interest', () => {
  const first = splitAmountInterestFirst(600, 6000, 1000, 0);
  assert.deepEqual(first, { principalAmount: 0, interestAmount: 600 });

  const secondSub = splitAmountInterestFirst(2400, 6000, 1000, first.interestAmount);
  assert.deepEqual(secondSub, { principalAmount: 2000, interestAmount: 400 });

  const finalSub = splitAmountInterestFirst(3000, 6000, 1000, first.interestAmount + secondSub.interestAmount);
  assert.deepEqual(finalSub, { principalAmount: 3000, interestAmount: 0 });
});

test('previewMultiDueAllocation: ₹10,000 pending across 2 old dues + ₹12,000 received on ₹6,000 EMI', () => {
  const preview = previewMultiDueAllocation({
    amount: 12000,
    dueAmount: 6000,
    dueInterest: 1000,
    openDues: [
      { id: 'p1', dueDate: '2026-09-10', paidAmount: 2000, paidInterest: 1000 }, // ₹4,000 shortfall
      { id: 'p2', dueDate: '2026-10-10', paidAmount: 0, paidInterest: 0 },       // ₹6,000 shortfall
    ],
    nextDueDate: '2026-11-10',
  });

  assert.equal(preview.isMultiDue, true);
  assert.equal(preview.oldDueCleared, 10000);
  assert.equal(preview.currentPaid, 2000);
  // P1 sub_due: 4000P + 0I; P2 sub_due: 5000P + 1000I; P3 partial (₹2,000): 1000P + 1000I
  assert.equal(preview.totalPrincipal, 10000);
  assert.equal(preview.totalInterest, 2000);
});

test('previewMultiDueAllocation: honors Single-Due manual override ONLY when <= 1 due is touched', () => {
  const single = previewMultiDueAllocation({
    amount: 6000,
    principalAmount: 4800,
    interestAmount: 1200,
    dueAmount: 6000,
    dueInterest: 1000,
    openDues: [],
    nextDueDate: '2026-11-10',
  });
  assert.equal(single.singleDueOverrideApplied, true);
  assert.equal(single.totalPrincipal, 4800);
  assert.equal(single.totalInterest, 1200);

  const multi = previewMultiDueAllocation({
    amount: 12000,
    principalAmount: 11000,
    interestAmount: 1000,
    dueAmount: 6000,
    dueInterest: 1000,
    openDues: [],
    nextDueDate: '2026-11-10',
  });
  assert.equal(multi.singleDueOverrideApplied, false);
  assert.equal(multi.totalPrincipal, 10000);
  assert.equal(multi.totalInterest, 2000);
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/modules/finance/payments/paymentAllocation.test.js`
Expected: FAIL with `Cannot find module './paymentAllocation.service'`.

**Step 3: Implement `paymentAllocation.service.js`**

```javascript
// backend/src/modules/finance/payments/paymentAllocation.service.js
'use strict';

const { db } = require('../../../config/database.config');

function round2(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
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
  let customP = principalAmount !== null ? round2(principalAmount) : round2(totalReceived - round2(interestAmount));
  let customI = interestAmount !== null ? round2(interestAmount) : round2(totalReceived - customP);

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
      params.payment_mode || 'cash',
      params.payment_mode_1 || null,
      Number(params.payment_mode_1_amount) || 0,
      Number(params.hand_loan) || 0,
      params.hand_loan_remark || null,
      params.remarks || null,
    ]
  );

  return rows[0]?.result || {};
}

async function fetchCustomerPaymentsWithSubDues(runner, financeId, customerId) {
  const { rows } = await runner.query(
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
        row_no: row.sub_due_row_no,
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
  splitAmountInterestFirst,
  previewMultiDueAllocation,
  processCustomerPaymentDb,
  fetchCustomerPaymentsWithSubDues,
};
```

**Step 4: Run unit tests to verify they pass**

Run: `cd backend && node --test src/modules/finance/payments/paymentAllocation.test.js`
Expected: PASS (4/4 tests passing).

**Step 5: Commit**

```bash
git add backend/src/modules/finance/payments/paymentAllocation.service.js \
        backend/src/modules/finance/payments/paymentAllocation.test.js
git commit -m "feat(payments): add paymentAllocation service and unit tests"
```

---

### Task 3: Refactor Duplicate Payment Endpoints in `customer.routes.js` & `payment.routes.js`

**Files:**
- Modify: `backend/src/modules/customers/customer.routes.js:5055-5421`
- Modify: `backend/src/modules/finance/payments/payment.routes.js:190-280`
- Modify: `backend/src/modules/finance/payments/payment.routes.js:464-845`
- Modify: `backend/src/modules/finance/payments/payment.routes.js:1041-1143`

**Step 1: Replace duplicated `GET /:customerId/payments` & `POST /:customerId/payments` in `customer.routes.js`**

Import `{ processCustomerPaymentDb, fetchCustomerPaymentsWithSubDues }` from `../finance/payments/paymentAllocation.service`:
- In `GET /:customerId/payments` (`customer.routes.js:5055`): resolve `actualCustomerId` via the existing UUID/HPL check, then return `payments: await fetchCustomerPaymentsWithSubDues(db, req.financeId, actualCustomerId)`.
- In `POST /:customerId/payments` (`customer.routes.js:5187`): inside `BEGIN ... COMMIT`, resolve `customerId`, call `const data = await processCustomerPaymentDb(conn, { ...req.body, financeId: req.financeId, customerId, collected_by_id: req.user?.id || null })`, `COMMIT`, and return `{ success: true, message: 'Payment processed successfully', data }`. Map SQLSTATE `23514` / `22023` to HTTP `400` and `P0002` to HTTP `404`.

**Step 2: Update `payment.routes.js` (`POST /customers/:customerId/payments`, `GET /customers/:customerId/payments`, `PUT /:id`, and `GET /bill-report`)**

1. `POST /customers/:customerId/payments` (`payment.routes.js:464`): delegate directly to `processCustomerPaymentDb(conn, ...)`.
2. `GET /customers/:customerId/payments` (`payment.routes.js:712`): delegate directly to `fetchCustomerPaymentsWithSubDues(db, req.financeId, customerId)`.
3. `PUT /:id` (`payment.routes.js:1041`): accept optional `principal_amount` and `interest_amount` in `req.body`:
   ```javascript
   const hasExplicitPI =
     req.body.principal_amount !== undefined &&
     req.body.principal_amount !== null &&
     req.body.interest_amount !== undefined &&
     req.body.interest_amount !== null;

   if (hasExplicitPI) {
     await conn.query(
       `UPDATE payments SET
          due_date = $1, payment_date = $2, bill_number = $3,
          amount = $4, principal_amount = $5, interest_amount = $6,
          penalty = $7, collected_by = $8, payment_mode = $9,
          payment_mode_1 = $10, payment_mode_1_amount = $11,
          hand_loan = $12, hand_loan_remark = $13, remarks = $14,
          edited_by = $15, edited_at = NOW()
        WHERE id = $16 AND finance_id = $17`,
       [
         dueDate, paymentDate, billNumber,
         Number(amount) || 0, Number(req.body.principal_amount) || 0, Number(req.body.interest_amount) || 0,
         Number(penalty) || 0, collected_by, payment_mode || 'cash',
         payment_mode_1 && payment_mode_1 !== 'none' ? payment_mode_1 : null,
         Number(payment_mode_1_amount) || 0, Number(hand_loan) || 0,
         hand_loan_remark || null, remarks || null,
         collected_by, paymentId, financeId,
       ]
     );
   }
   // When omitted, existing UPDATE runs and `trg_payments_pi_sync` auto-resplits on amount change!
   ```
4. `GET /bill-report` (`payment.routes.js:190-278`): select `p.principal_amount, p.interest_amount` + active `sub_due` sums, and use stored `principal_amount` and `interest_amount` instead of the proportional `Math.round((amt / dueAmount) * interestPart)` approximation.

**Step 3: Run backend test suite**

Run: `cd backend && npm test`
Expected: PASS with 0 regressions.

**Step 4: Commit**

```bash
git add backend/src/modules/customers/customer.routes.js \
        backend/src/modules/finance/payments/payment.routes.js
git commit -m "refactor(payments): wire customer and payment routes to fn_process_customer_payment"
```

---

### Task 4: Upgrade Authoritative Ledger & Monthly/Business Reports to Use Stored `principal_amount` / `interest_amount`

**Files:**
- Modify: `backend/src/modules/finance/financialCalculation.service.js:144-205,272-287,553-588`
- Modify: `backend/src/modules/dashboard/dashboard.routes.js:310-390`
- Modify: `backend/src/modules/accounting/reports/reports.service.js:1289-1390`
- Test: `backend/src/modules/finance/financial_parity.test.js`

**Step 1: Add test case in `financial_parity.test.js` for Interest-First / Custom Principal Paid**

Verify `computeAuthoritativeLoanLedger` uses `validPrincipalPaid` (when present from `payments.principal_amount + sub_due.principal_amount`) to compute `outstandingPrincipal = Math.min(remainingScheduledEmiAmount, Math.max(0, principalAdvanced - validPrincipalPaid))` and `outstandingInterest = remainingScheduledEmiAmount - outstandingPrincipal`, falling back to proportional ratio only if `validPrincipalPaid` is `undefined`.

**Step 2: Update `financialCalculation.service.js`, `dashboard.routes.js`, and `reports.service.js`**

- In `financialCalculation.service.js`:
  - `aggregateValidPaymentLedger`: sum `p.principal_amount`, `p.interest_amount`, `sd.principal_amount`, `sd.interest_amount` into `validPrincipalPaid` and `validInterestPaid`.
  - `TENANT_LOAN_LEDGER_SQL`: project `paid_main_principal` and `paid_sub_principal` alongside `paid_main` and `paid_sub`.
- In `dashboard.routes.js` (`/monthly-income`): aggregate `COALESCE(SUM(p.principal_amount), 0) + COALESCE(SUM(sd.principal_amount), 0)` and `COALESCE(SUM(p.interest_amount), 0) + COALESCE(SUM(sd.interest_amount), 0)` by collection `payment_date` month (excluding cancelled receipts!).
- In `reports.service.js` (`getBusinessReport`): include active `sub_due` collections by `sd.payment_date` and use stored `principal_amount` & `interest_amount` paise sums directly.

**Step 3: Run backend parity & dashboard tests**

Run: `cd backend && npm test`
Expected: PASS.

**Step 4: Commit**

```bash
git add backend/src/modules/finance/financialCalculation.service.js \
        backend/src/modules/finance/financial_parity.test.js \
        backend/src/modules/dashboard/dashboard.routes.js \
        backend/src/modules/accounting/reports/reports.service.js
git commit -m "feat(reports): compute ledger and revenue metrics from stored principal_amount and interest_amount"
```

---

### Task 5: Add Principal & Interest Fields + Single-Due Override Guard in `PaymentDialog.tsx`

**Files:**
- Modify: `frontend/src/types/customer.ts:330-384`
- Modify: `frontend/src/components/customer/PaymentDialog.tsx:664-870`

**Step 1: Extend TypeScript Interfaces in `frontend/src/types/customer.ts`**

```typescript
// In Payment (lines 330-354):
  principal_amount?: number;
  interest_amount?: number;

// In SubDue (lines 356-368):
  principal_amount?: number;
  interest_amount?: number;

// In PaymentFormData (lines 370-383):
export interface PaymentFormData {
  dueDate: string;
  paymentDate: string;
  billNumber: string;
  amount: number;
  principal_amount?: number;
  interest_amount?: number;
  dueAmount?: number;
  last_payment_id?: string | number | null;
  last_due_paid?: number;
  penalty: number;
  collected_by: string;
  payment_mode: string;
  payment_mode_1?: string;
  payment_mode_1_amount: number;
  hand_loan: number;
  hand_loan_remark: string;
  remarks?: string;
}
```

**Step 2: Add Interest-First Split & Single-Due Override UI in `PaymentDialog.tsx`**

Add props to `PaymentDialogProps`:
```typescript
  loan?: {
    dueAmount?: number;
    due_amount?: number;
    principle_part?: number;
    interest_part?: number;
    hpAmount?: number;
    interestRate?: string | number;
    dueMonth?: string | number;
  } | null;
  openDues?: Array<{
    id: string | number;
    dueDate: string;
    paidAmount: number;
    paidInterest: number;
  }>;
```

Inside `PaymentDialog.tsx`:
1. Compute normalized contractual `dueAmount`, `dueInterest`, and `duePrincipal` (`dueAmount - dueInterest`).
2. Compute `singleDueCap`:
   - If `isEditing`: `Infinity` (editing a single row always permits manual P/I override).
   - Else if `openDues.length > 0`: `Math.max(0, dueAmount - openDues[0].paidAmount)` (shortfall of earliest open due).
   - Else: `dueAmount`.
3. Determine `isMultiDue = !isEditing && singleDueCap > 0 && (Number(formData.amount) || 0) > singleDueCap`.
4. When `Amount (₹)` changes:
   - Compute auto-preview `(principal_amount, interest_amount)` across `openDues` + remaining dues using NBFC Interest-First logic and update `formData`.
5. Render **Principal (₹)** and **Interest (₹)** side-by-side right below `Amount (₹)` & `Penalty (₹)`:
   - When `!isMultiDue` (Single-Due mode): both inputs are editable! Changing `Principal` sets `interest_amount = Math.max(0, round2(amount - val))` (if `val <= amount`) or updates `amount = round2(val + interest_amount)`. Changing `Interest` sets `principal_amount = Math.max(0, round2(amount - val))` (if `val <= amount`) or updates `amount = round2(principal_amount + val)`.
   - When `isMultiDue` (Multi-Due mode, e.g. paying ₹12,000 across two ₹6,000 dues): inputs become `readOnly` displaying the exact auto-calculated Principal & Interest totals, accompanied by an info banner:
     `"Multi-due payment detected — Principal & Interest will auto-split per due (Interest-First)."`
6. On `handleSubmit`:
   - Validate `round2((formData.principal_amount || 0) + (formData.interest_amount || 0)) === round2(formData.amount || 0)`.
   - If `isMultiDue`, omit manual override (`principal_amount: undefined, interest_amount: undefined`) so `fn_process_customer_payment` splits each due cleanly; if `!isMultiDue`, send explicit `principal_amount` and `interest_amount`.

**Step 3: Type-check Frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS with 0 TypeScript errors.

**Step 4: Commit**

```bash
git add frontend/src/types/customer.ts \
        frontend/src/components/customer/PaymentDialog.tsx
git commit -m "feat(ui): add Principal & Interest split inputs with Single-Due override guard in PaymentDialog"
```

---

### Task 6: Wire Multi-Due Open Ledger Context in `CustomerDetails.tsx` & Display P/I in `PaymentTable.tsx`

**Files:**
- Modify: `frontend/src/pages/CustomerDetails.tsx:246-276,405-490,668-680`
- Modify: `frontend/src/components/customer/PaymentTable.tsx:120-260,290-380`

**Step 1: Update `CustomerDetails.tsx` to preserve `principal_amount` / `interest_amount` and pass `loan` + `openDues` to `PaymentDialog`**

1. In `fetchPayments` (`CustomerDetails.tsx:254`), map `principal_amount: Number(p.principal_amount) || 0` and `interest_amount: Number(p.interest_amount) || 0` (and on `sub_dues`).
2. Compute `openDues` in chronological `dueDate` order:
   ```typescript
   const openDues = useMemo(() => {
     const dueAmt = Number(loan?.due_amount ?? loan?.dueAmount ?? 0);
     if (dueAmt <= 0) return [];
     return payments
       .filter((p) => !isPaymentCancelled(p) && p.status !== 'paid')
       .map((p) => {
         const activeSubs = (p.sub_dues || []).filter(
           (sd) => String(sd.status || 'active').toLowerCase() !== 'cancelled'
         );
         const paidAmount =
           (Number(p.amount) || 0) +
           activeSubs.reduce((s, sd) => s + (Number(sd.paid_amount) || 0), 0);
         const paidInterest =
           (Number(p.interest_amount) || 0) +
           activeSubs.reduce((s, sd) => s + (Number(sd.interest_amount) || 0), 0);
         return { id: p.id, dueDate: p.dueDate, paidAmount, paidInterest };
       })
       .filter((od) => od.paidAmount < dueAmt)
       .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
   }, [payments, loan]);
   ```
3. In `handleOpenPaymentDialog(payment)` (`CustomerDetails.tsx:428`), include `principal_amount: payment.principal_amount` and `interest_amount: payment.interest_amount` when editing.
4. Pass `loan={loan}` and `openDues={openDues}` to `<PaymentDialog />` (`CustomerDetails.tsx:668`).

**Step 2: Display `Principal` & `Interest` in `PaymentTable.tsx`**

- Add `Principal` and `Interest` columns (and include them inside the `View Payment` & `View Sub-Due` detail modals) on both:
  - Primary `payments` rows (`payment.principal_amount`, `payment.interest_amount`)
  - Expandable `sub_due` rows (`sub.principal_amount`, `sub.interest_amount`)
- Show footer totals for **Total Principal Paid** and **Total Interest Paid** alongside **Total Paid** and **Total Balance**.

**Step 3: Type-check & Build Frontend**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS with clean production bundle.

**Step 4: Commit**

```bash
git add frontend/src/pages/CustomerDetails.tsx \
        frontend/src/components/customer/PaymentTable.tsx
git commit -m "feat(ui): wire multi-due openDues context and display Principal/Interest in PaymentTable"
```

