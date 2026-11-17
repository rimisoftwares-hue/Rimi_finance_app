'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitAmountInterestFirst,
  previewMultiDueAllocation,
  normalizePaymentMode,
  processCustomerPaymentDb,
  fetchCustomerPaymentsWithSubDues,
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

test('splitAmountInterestFirst: lump-sum settlement across multiple dues caps interest per due', () => {
  const lump = splitAmountInterestFirst(15000, 6000, 1000, 0);
  // 2 full dues (2 * 1000) + remainder ₹3,000 (min(3000, 1000)) = 3000 interest, 12000 principal
  assert.deepEqual(lump, { principalAmount: 12000, interestAmount: 3000 });
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

test('normalizePaymentMode and processCustomerPaymentDb sanitize enum modes and pass parameters to fn_process_customer_payment', async () => {
  assert.equal(normalizePaymentMode('UPI'), 'upi');
  assert.equal(normalizePaymentMode('settlement'), 'other');
  assert.equal(normalizePaymentMode('none', { allowNull: true }), null);

  let capturedSql = '';
  let capturedArgs = [];
  const mockConn = {
    async query(sql, args) {
      capturedSql = sql;
      capturedArgs = args;
      return {
        rows: [{
          result: {
            total_received: 6000,
            total_principal_allocated: 4800,
            total_interest_allocated: 1200,
            single_due_override_applied: true,
          },
        }],
      };
    },
  };

  const out = await processCustomerPaymentDb(mockConn, {
    financeId: '00000000-0000-0000-0000-000000000001',
    customerId: '00000000-0000-0000-0000-000000000002',
    paymentDate: '2026-11-17',
    amount: 6000,
    principal_amount: 4800,
    interest_amount: 1200,
    dueDate: '2026-11-10',
    dueAmount: 6000,
    billNumber: 'B-101',
    penalty: 50,
    collected_by: 'Admin',
    collected_by_id: null,
    payment_mode: 'settlement',
    payment_mode_1: 'none',
    payment_mode_1_amount: 0,
    hand_loan: 0,
    hand_loan_remark: '',
    remarks: 'Full settlement',
  });

  assert.match(capturedSql, /fn_process_customer_payment/);
  assert.equal(capturedArgs[3], 6000);
  assert.equal(capturedArgs[4], 4800);
  assert.equal(capturedArgs[5], 1200);
  assert.equal(capturedArgs[12], 'other');
  assert.equal(capturedArgs[13], null);
  assert.equal(out.total_principal_allocated, 4800);
  assert.equal(out.total_interest_allocated, 1200);
});

test('fetchCustomerPaymentsWithSubDues maps principal_amount and interest_amount on payments and sub_dues', async () => {
  const mockRunner = {
    async query() {
      return {
        rows: [
          {
            id: 'pay-1',
            dueDate: '2026-10-10',
            paymentDate: '2026-10-10',
            billNumber: 'B-1',
            amount: '2000.00',
            principal_amount: '1000.00',
            interest_amount: '1000.00',
            penalty: '0.00',
            status: 'paid',
            payment_status: 'active',
            collected_by: 'Owner',
            payment_mode: 'cash',
            payment_mode_1: null,
            payment_mode_1_amount: null,
            cancelled_by: null,
            edited_by: null,
            edited_at: null,
            hand_loan: '0.00',
            hand_loan_remark: null,
            remarks: null,
            created_at: '2026-10-10T10:00:00Z',
            sub_due_id: 'sd-1',
            sub_due_bill_number: 'B-2',
            sub_due_payment_date: '2026-11-10',
            sub_due_paid_amount: '4000.00',
            sub_due_principal_amount: '4000.00',
            sub_due_interest_amount: '0.00',
            sub_due_payment_mode: 'upi',
            sub_due_payment_mode_amount: '4000.00',
            sub_due_payment_mode_1: null,
            sub_due_payment_mode_1_amount: null,
            sub_due_status: 'active',
            sub_due_collected_by: 'Owner',
            sub_due_cancelled_by: null,
            sub_due_edited_by: null,
            sub_due_edited_at: null,
            sub_due_created_at: '2026-11-10T10:00:00Z',
            sub_due_row_no: '1',
          },
        ],
      };
    },
  };

  const list = await fetchCustomerPaymentsWithSubDues(mockRunner, 'fin-1', 'cust-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 2000);
  assert.equal(list[0].principal_amount, 1000);
  assert.equal(list[0].interest_amount, 1000);
  assert.equal(list[0].sub_dues.length, 1);
  assert.equal(list[0].sub_due.length, 1);
  assert.equal(list[0].sub_dues[0].paid_amount, 4000);
  assert.equal(list[0].sub_dues[0].principal_amount, 4000);
  assert.equal(list[0].sub_dues[0].interest_amount, 0);
});

