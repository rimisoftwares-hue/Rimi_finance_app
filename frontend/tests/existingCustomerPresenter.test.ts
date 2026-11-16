import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStepContextLabel,
  formatMatchRoleHeadline,
  formatMatchedReasonBadges,
  formatExtraMatchesLabel,
  formatInlineFieldChipText,
  toDeepViewCustomerSeed,
  formatPoliteMatchAnnouncement,
} from '../src/components/form/existingCustomerCheckPresenter.ts';
import type { ExistingCustomerMatch } from '../src/api/customerCheckApi.ts';
import type { FieldMatchSummary } from '../src/hooks/existingCustomerCheckModel.ts';

function makeSampleMatch(overrides: Partial<ExistingCustomerMatch> = {}): ExistingCustomerMatch {
  return {
    customerId: '11111111-2222-4333-8444-555555555555',
    hplno: 105,
    customerName: 'Ramesh Kannan',
    borrowerName: 'Ramesh Kannan',
    relationLabel: 'S/O Kannan',
    loanStatus: 'active',
    hasLoan: true,
    loanType: 'Two Wheeler',
    vehicleNumber: 'TN-09-AB-4567',
    vehicleName: 'Honda Activa',
    primaryPhone: '9876543210',
    address: '12 Gandhi Road, Chennai - 600001',
    matchedRoles: ['customer'],
    matchedFields: [
      {
        field: 'aadhar',
        maskedValue: 'XXXX-XXXX-9012',
        entityRole: 'customer',
        entityName: 'Ramesh Kannan',
        strength: 'strong',
      },
    ],
    guardianSummary: null,
    loanSummary: {
      hpAmount: 50000,
      totalLoan: 60000,
      paidAmount: 20000,
      pendingAmount: 40000,
      overdueAmount: 5000,
      overdueDays: 18,
      hasSeizure: false,
    },
    risk: {
      creditScore: 72,
      creditBand: 'Good',
      dueRiskScore: 34,
      riskLevel: 'warning',
    },
    ...overrides,
  };
}

test('1. Step context label distinguishes Step 1 Customer vs Step 3 Guardian', () => {
  assert.equal(formatStepContextLabel('customer'), 'Matched in Customer details');
  assert.equal(formatStepContextLabel('guardian'), 'Matched in Guardian details');
});

test('2. Role-specific headlines use exact borrower vs guarantor wording', () => {
  const borrowerMatch = makeSampleMatch({ matchedRoles: ['customer'], hplno: 105 });
  assert.deepEqual(formatMatchRoleHeadline(borrowerMatch), {
    primary: 'Existing customer found',
    secondary: null,
  });

  const guarantorMatch = makeSampleMatch({
    matchedRoles: ['guardian'],
    hplno: 208,
    borrowerName: 'Suresh M',
  });
  assert.deepEqual(formatMatchRoleHeadline(guarantorMatch), {
    primary: 'Already a guarantor on HPL #208 (Suresh M)',
    secondary: null,
  });

  const dualMatch = makeSampleMatch({
    matchedRoles: ['customer', 'guardian'],
    hplno: 312,
    borrowerName: 'Anitha R',
  });
  assert.deepEqual(formatMatchRoleHeadline(dualMatch), {
    primary: 'Existing customer found',
    secondary: 'Already a guarantor on HPL #312 (Anitha R)',
  });
});

test('3. Matched reason badges include strength and deduplicate repeated field types', () => {
  const match = makeSampleMatch({
    matchedFields: [
      {
        field: 'aadhar',
        maskedValue: 'XXXX-XXXX-9012',
        entityRole: 'customer',
        entityName: 'Ramesh',
        strength: 'strong',
      },
      {
        field: 'other_govt_id',
        maskedValue: 'XX...234F',
        entityRole: 'guardian',
        entityName: 'Murugan',
        strength: 'strong',
        govtIdType: 'pan_card',
      },
      {
        field: 'phone',
        maskedValue: 'XXXXXX3210',
        entityRole: 'customer',
        entityName: 'Ramesh',
        strength: 'possible',
      },
      {
        field: 'phone',
        maskedValue: 'XXXXXX3210',
        entityRole: 'customer',
        entityName: 'Ramesh',
        strength: 'possible',
      },
    ],
  });

  const badges = formatMatchedReasonBadges(match.matchedFields);
  assert.deepEqual(
    badges.map((b) => b.label),
    ['Aadhaar match - strong', 'Govt ID match - strong', 'Phone match - possible']
  );
});

test('4. Overflow count formats "and N more" only when matchCount > matches.length', () => {
  assert.equal(formatExtraMatchesLabel(3, 3), null);
  assert.equal(formatExtraMatchesLabel(14, 10), 'and 4 more');
});

test('5. Inline field chip text reflects role and HPL cleanly', () => {
  const custSummary: FieldMatchSummary = {
    field: 'aadhar',
    strength: 'strong',
    matchCount: 1,
    roles: ['customer'],
    matches: [makeSampleMatch({ hplno: 105, matchedRoles: ['customer'] })],
  };
  assert.equal(formatInlineFieldChipText(custSummary), 'Existing customer · HPL #105 (strong)');

  const guardSummary: FieldMatchSummary = {
    field: 'phone',
    strength: 'possible',
    matchCount: 1,
    roles: ['guardian'],
    matches: [makeSampleMatch({ hplno: 208, borrowerName: 'Suresh M', matchedRoles: ['guardian'] })],
  };
  assert.equal(
    formatInlineFieldChipText(guardSummary),
    'Already a guarantor · HPL #208 (possible)'
  );

  const multiSummary: FieldMatchSummary = {
    field: 'phone',
    strength: 'possible',
    matchCount: 3,
    roles: ['customer', 'guardian'],
    matches: [makeSampleMatch(), makeSampleMatch({ customerId: '22222222-2222-4333-8444-555555555555' })],
  };
  assert.equal(formatInlineFieldChipText(multiSummary), '3 existing matches (possible)');
});

test('6. toDeepViewCustomerSeed maps both loan and loan-less consulting matches cleanly', () => {
  const withLoan = makeSampleMatch();
  assert.deepEqual(toDeepViewCustomerSeed(withLoan), {
    id: '11111111-2222-4333-8444-555555555555',
    name: 'Ramesh Kannan',
    hplNumber: 'HPL 105',
    vehicleNumber: 'TN-09-AB-4567',
    riskLevel: 'warning',
  });

  const loanLess = makeSampleMatch({
    hplno: null,
    hasLoan: false,
    vehicleNumber: null,
    loanSummary: null,
    risk: null,
  });
  assert.deepEqual(toDeepViewCustomerSeed(loanLess), {
    id: '11111111-2222-4333-8444-555555555555',
    name: 'Ramesh Kannan',
    hplNumber: undefined,
    vehicleNumber: undefined,
    riskLevel: undefined,
  });
});

test('7. Polite aria-live announcement summarizes new matches without raw PII', () => {
  const msg = formatPoliteMatchAnnouncement([makeSampleMatch()], 1, 'customer');
  assert.match(msg, /Matched in Customer details/);
  assert.match(msg, /Existing customer found/);
  assert.doesNotMatch(msg, /9876543210/);
});

