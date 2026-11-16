import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractValidIdentityPayload,
  buildFieldMatchMap,
  createExistingCustomerCheckController,
} from '../src/hooks/existingCustomerCheckModel.ts';
import type {
  ExistingCustomerCheckRequest,
  ExistingCustomerCheckResponse,
} from '../src/api/customerCheckApi.ts';

const SAMPLE_MATCH_RESPONSE: ExistingCustomerCheckResponse = {
  success: true,
  found: true,
  matchCount: 2,
  highestRiskLevel: 'high',
  overallCreditScore: 58,
  overallCreditBand: 'Fair',
  matches: [
    {
      customerId: 'c0000001-0000-4000-8000-000000000001',
      hplno: 108,
      customerName: 'Murugan K',
      borrowerName: 'Murugan K',
      relationLabel: 'S/O Karuppan',
      loanStatus: 'active',
      hasLoan: true,
      loanType: 'Two Wheeler',
      vehicleNumber: 'TN58AB1234',
      vehicleName: 'Honda Activa',
      primaryPhone: '9876543210',
      address: '12 Gandhi Rd, Madurai - 625001',
      matchedRoles: ['customer'],
      matchedFields: [
        {
          field: 'phone',
          maskedValue: 'XXXXXX3210',
          entityRole: 'customer',
          entityName: 'Murugan K',
          strength: 'possible',
          matchedInputIndex: 0,
        },
        {
          field: 'aadhar',
          maskedValue: 'XXXX-XXXX-9012',
          entityRole: 'customer',
          entityName: 'Murugan K',
          strength: 'strong',
        },
      ],
      guardianSummary: null,
      loanSummary: {
        hpAmount: 60000,
        totalLoan: 66000,
        paidAmount: 11000,
        pendingAmount: 55000,
        overdueAmount: 11000,
        overdueDays: 35,
        hasSeizure: false,
      },
      risk: {
        creditScore: 58,
        creditBand: 'Fair',
        dueRiskScore: 62,
        riskLevel: 'high',
      },
    },
  ],
};

test('1. No work phone sent & invalid identifiers skipped in extractValidIdentityPayload', () => {
  const extracted = extractValidIdentityPayload({
    contacts: [
      { contact_type: 'customer', type: 'mobile', number: '+91 98765-43210' },
      { contact_type: 'customer', type: 'work', number: '9111122222' }, // MUST NOT BE SENT
      { contact_type: 'customer', type: 'landline', number: '04522345678' }, // 11 digits with leading 0 -> 4522345678
      { contact_type: 'customer', type: 'mobile', number: '9999' }, // invalid -> skipped
    ],
    aadhar: '1234 5678 9012',
    otherGovtIdType: 'pan_card',
    otherGovtIdNumber: 'abcde-1234-f',
    excludeCustomerId: 'c0000099-0000-4000-8000-000000000099',
  });

  assert.equal(extracted.hasValidInput, true);
  assert.deepEqual(extracted.requestBody.phones, ['9876543210', '4522345678']);
  assert.equal(extracted.requestBody.phones?.includes('9111122222'), false);
  assert.equal(extracted.requestBody.aadhar, '123456789012');
  assert.equal(extracted.requestBody.otherGovtIdType, 'pan_card');
  assert.equal(extracted.requestBody.otherGovtIdNumber, 'ABCDE1234F');
  assert.equal(extracted.requestBody.excludeCustomerId, 'c0000099-0000-4000-8000-000000000099');
  // Contact row 0 -> norm index 0; Contact row 1 (work) -> skipped; Contact row 2 -> norm index 1
  assert.deepEqual(extracted.contactIndexByNormPhoneIndex, [0, 2]);
});

test('2. No API call when all inputs are invalid or only work phone is present', async () => {
  let apiCalls = 0;
  const ctrl = createExistingCustomerCheckController({
    debounceMs: 30,
    fetcher: async () => {
      apiCalls += 1;
      return { success: true, found: false, matchCount: 0, matches: [] };
    },
  });

  ctrl.updateInput({
    contacts: [
      { contact_type: 'customer', type: 'work', number: '9876543210' },
      { contact_type: 'customer', type: 'mobile', number: '98765' },
    ],
    aadhar: '1234567',
    otherGovtIdNumber: 'AB1',
  });

  await new Promise((r) => setTimeout(r, 70));
  assert.equal(apiCalls, 0);
  assert.equal(ctrl.getSnapshot().panelState, 'hidden');
  ctrl.dispose();
});

test('3. Debounce (400ms configurable) coalesces rapid keystrokes and aborts stale in-flight requests', async () => {
  const calls: Array<{ body: ExistingCustomerCheckRequest; aborted: boolean }> = [];

  const ctrl = createExistingCustomerCheckController({
    debounceMs: 40,
    fetcher: async (body, signal) => {
      const record = { body, aborted: false };
      calls.push(record);
      signal?.addEventListener('abort', () => {
        record.aborted = true;
      });
      await new Promise((r) => setTimeout(r, 60));
      if (signal?.aborted) {
        const abortErr = new Error('Canceled');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return SAMPLE_MATCH_RESPONSE;
    },
  });

  // Rapid typing within debounce window -> first value should never even fire
  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '9000000001' }],
  });
  await new Promise((r) => setTimeout(r, 15));
  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '9000000002' }],
  });

  // Wait for first request ('9000000002') to start, then change input while it's in flight!
  await new Promise((r) => setTimeout(r, 55));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.phones, ['9000000002']);

  // Trigger a new phone while request 1 is still in flight -> must abort request 1!
  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '9876543210' }],
    aadhar: '1234 5678 9012',
  });

  assert.equal(calls[0].aborted, true, 'Stale in-flight request must be aborted immediately');

  await new Promise((r) => setTimeout(r, 130));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.phones, ['9876543210']);
  assert.equal(calls[1].aborted, false);

  const snap = ctrl.getSnapshot();
  assert.equal(snap.matches.length, 1);
  assert.equal(snap.matchCount, 2);
  assert.equal(snap.highestRiskLevel, 'high');
  assert.equal(snap.panelState, 'expanded');
  assert.ok(snap.fieldMatchMap.byContactIndex[0]);
  assert.equal(snap.fieldMatchMap.byContactIndex[0].strength, 'possible');
  assert.ok(snap.fieldMatchMap.aadhar);
  assert.equal(snap.fieldMatchMap.aadhar?.strength, 'strong');

  ctrl.dispose();
});

test('4. Deduplication, caching per signature, and sticky collapsed state per signature', async () => {
  let apiCalls = 0;
  const ctrl = createExistingCustomerCheckController({
    debounceMs: 25,
    fetcher: async () => {
      apiCalls += 1;
      return SAMPLE_MATCH_RESPONSE;
    },
  });

  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '9876543210' }],
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(apiCalls, 1);
  assert.equal(ctrl.getSnapshot().panelState, 'expanded');

  // User collapses the card -> stays collapsed for this signature even if formatting changes
  ctrl.setPanelState('collapsed');
  assert.equal(ctrl.getSnapshot().panelState, 'collapsed');

  // Re-formatting the same phone ('+91 98765-43210') produces the SAME normalized signature -> 0 new calls & stays collapsed!
  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '+91 98765-43210' }],
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(apiCalls, 1);
  assert.equal(ctrl.getSnapshot().panelState, 'collapsed');

  // Clear input -> hidden, then re-enter same phone -> served from cache (0 new calls) and remembers collapsed state!
  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '' }],
  });
  assert.equal(ctrl.getSnapshot().panelState, 'hidden');

  ctrl.updateInput({
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '9876543210' }],
  });
  assert.equal(apiCalls, 1);
  assert.equal(ctrl.getSnapshot().matches.length, 1);
  assert.equal(ctrl.getSnapshot().panelState, 'collapsed');

  ctrl.dispose();
});

test('5. Never throws into the form when API rejects, and maps fieldMatchMap by contact row index accurately', async () => {
  const ctrl = createExistingCustomerCheckController({
    debounceMs: 20,
    fetcher: async () => {
      throw new Error('Network offline');
    },
  });

  assert.doesNotThrow(() => {
    ctrl.updateInput({
      contacts: [{ contact_type: 'customer', type: 'mobile', number: '9876543210' }],
    });
  });

  await new Promise((r) => setTimeout(r, 50));
  const snap = ctrl.getSnapshot();
  assert.equal(snap.loading, false);
  assert.equal(snap.matches.length, 0);
  assert.equal(typeof snap.error, 'string');

  // Verify buildFieldMatchMap maps norm index 0 back to ContactInput row 2 when rows 0 & 1 were work/empty
  const extracted = extractValidIdentityPayload({
    contacts: [
      { contact_type: 'customer', type: 'work', number: '9000011111' },
      { contact_type: 'customer', type: 'mobile', number: '' },
      { contact_type: 'customer', type: 'mobile', number: '9876543210' },
    ],
  });
  const map = buildFieldMatchMap(SAMPLE_MATCH_RESPONSE.matches, extracted);
  assert.equal(map.byContactIndex[0], undefined);
  assert.equal(map.byContactIndex[1], undefined);
  assert.ok(map.byContactIndex[2]);
  assert.equal(map.byContactIndex[2].matchCount, 1);

  ctrl.dispose();
});

test('6. React StrictMode mount -> dispose -> remount with identical initial input still fires debounced check', async () => {
  let calls = 0;
  const ctrl = createExistingCustomerCheckController({
    debounceMs: 25,
    fetcher: async () => {
      calls += 1;
      return SAMPLE_MATCH_RESPONSE;
    },
    shouldDefaultCollapsed: () => false,
  });

  const editInitialInput = {
    contacts: [{ contact_type: 'customer', type: 'mobile', number: '9876543210' }],
    excludeCustomerId: '11111111-2222-4333-8444-555555555555',
  };

  // Simulated React 18 StrictMode: mount -> cleanup -> remount synchronously
  ctrl.updateInput(editInitialInput);
  ctrl.dispose();
  ctrl.updateInput(editInitialInput);

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 1, 'Remount after StrictMode cleanup must still execute the debounced check');
  assert.equal(ctrl.getSnapshot().matchCount, 2);

  ctrl.dispose();
});
