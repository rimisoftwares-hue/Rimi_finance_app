import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLoanInstallmentParts,
  computeAutoPaymentSplit,
  applyManualPrincipalChange,
  applyManualInterestChange,
  buildSubmitPaymentPayload,
} from '../src/components/customer/paymentSplitModel.ts';

test('resolveLoanInstallmentParts normalizes dueAmount, duePrincipal, and dueInterest accurately', () => {
  const parts = resolveLoanInstallmentParts({
    dueAmount: 6000,
    principle_part: 5000,
    interest_part: 1000,
  });
  assert.deepEqual(parts, {
    dueAmount: 6000,
    duePrincipal: 5000,
    dueInterest: 1000,
  });
});

test('computeAutoPaymentSplit computes Interest-First single-due and multi-due allocations with singleDueCap', () => {
  const loan = { dueAmount: 6000, principle_part: 5000, interest_part: 1000 };

  // Single partial payment on fresh due: ₹3,000 -> 2000P + 1000I, not multi-due
  const singlePartial = computeAutoPaymentSplit({
    amount: 3000,
    loan,
    openDues: [],
    isEditing: false,
  });
  assert.equal(singlePartial.isMultiDue, false);
  assert.equal(singlePartial.singleDueCap, 6000);
  assert.equal(singlePartial.principal_amount, 2000);
  assert.equal(singlePartial.interest_amount, 1000);

  // Exact shortfall on open due: ₹4,000 remaining on open due (2000 paid, 1000 interest already paid) -> 4000P + 0I, single-due!
  const singleSubDue = computeAutoPaymentSplit({
    amount: 4000,
    loan,
    openDues: [{ id: 'p1', dueDate: '2026-10-10', paidAmount: 2000, paidInterest: 1000 }],
    isEditing: false,
  });
  assert.equal(singleSubDue.isMultiDue, false);
  assert.equal(singleSubDue.singleDueCap, 4000);
  assert.equal(singleSubDue.principal_amount, 4000);
  assert.equal(singleSubDue.interest_amount, 0);

  // Exceeding shortfall on open due (₹10,000 = ₹4,000 old due + ₹6,000 current due) -> multi-due (9000P + 1000I)
  const multiDue = computeAutoPaymentSplit({
    amount: 10000,
    loan,
    openDues: [{ id: 'p1', dueDate: '2026-10-10', paidAmount: 2000, paidInterest: 1000 }],
    isEditing: false,
  });
  assert.equal(multiDue.isMultiDue, true);
  assert.equal(multiDue.principal_amount, 9000);
  assert.equal(multiDue.interest_amount, 1000);
});

test('applyManualPrincipalChange and applyManualInterestChange rebalance within amount or expand amount when > total', () => {
  // Rebalance within ₹6,000
  const rebalancedP = applyManualPrincipalChange(6000, 4800, 1000);
  assert.deepEqual(rebalancedP, {
    amount: 6000,
    principal_amount: 4800,
    interest_amount: 1200,
  });

  // Principal exceeds current amount -> updates amount = newPrincipal + currentInterest
  const expandedP = applyManualPrincipalChange(6000, 6500, 1000);
  assert.deepEqual(expandedP, {
    amount: 7500,
    principal_amount: 6500,
    interest_amount: 1000,
  });

  // Interest rebalance within ₹6,000
  const rebalancedI = applyManualInterestChange(6000, 750, 5000);
  assert.deepEqual(rebalancedI, {
    amount: 6000,
    principal_amount: 5250,
    interest_amount: 750,
  });
});

test('buildSubmitPaymentPayload omits manual P/I when isMultiDue and enforces P + I === amount', () => {
  const validSingle = buildSubmitPaymentPayload(
    {
      dueDate: '2026-11-10',
      paymentDate: '2026-11-17',
      billNumber: 'B-1',
      amount: 6000,
      principal_amount: 4800,
      interest_amount: 1200,
      penalty: 0,
      collected_by: 'Admin',
      payment_mode: 'cash',
      payment_mode_1_amount: 0,
      hand_loan: 0,
      hand_loan_remark: '',
    },
    false
  );
  assert.equal(validSingle.ok, true);
  assert.equal(validSingle.payload?.principal_amount, 4800);
  assert.equal(validSingle.payload?.interest_amount, 1200);

  const validMulti = buildSubmitPaymentPayload(
    {
      dueDate: '2026-11-10',
      paymentDate: '2026-11-17',
      billNumber: 'B-2',
      amount: 12000,
      principal_amount: 10000,
      interest_amount: 2000,
      penalty: 0,
      collected_by: 'Admin',
      payment_mode: 'cash',
      payment_mode_1_amount: 0,
      hand_loan: 0,
      hand_loan_remark: '',
    },
    true
  );
  assert.equal(validMulti.ok, true);
  assert.equal(validMulti.payload?.principal_amount, undefined);
  assert.equal(validMulti.payload?.interest_amount, undefined);

  const invalidSum = buildSubmitPaymentPayload(
    {
      dueDate: '2026-11-10',
      paymentDate: '2026-11-17',
      billNumber: 'B-3',
      amount: 6000,
      principal_amount: 4000,
      interest_amount: 1000,
      penalty: 0,
      collected_by: 'Admin',
      payment_mode: 'cash',
      payment_mode_1_amount: 0,
      hand_loan: 0,
      hand_loan_remark: '',
    },
    false
  );
  assert.equal(invalidSum.ok, false);
});

