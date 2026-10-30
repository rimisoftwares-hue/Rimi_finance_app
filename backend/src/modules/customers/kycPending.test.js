const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateCustomerKyc,
  evaluateStaffKyc,
  filterKycRecords,
  extractFilterOptions,
  computeAggregates
} = require('./kycPendingHelper');

test('AutoFinex KYC Pending Helper Unit Tests', async (t) => {
  await t.test('flags customer with missing photo as Photo pending', () => {
    const cust = {
      customer_id: 'cust-1',
      name: 'Ravi Shankar',
      hplno: 1,
      photo_url: null,
      photo_verification_status: null,
      govt_id_doc_id: 'doc-1',
      govt_id_verification_status: 'verified',
      location: '11.0168, 76.9558'
    };
    const res = evaluateCustomerKyc(cust);
    assert.equal(res.isKycPending, true);
    assert.deepEqual(res.pendingItems, ['Photo']);
    assert.equal(res.hasPhoto, false);
    assert.equal(res.hasLocation, true);
  });

  await t.test('flags customer with unverified photo as Photo pending', () => {
    const cust = {
      customer_id: 'cust-2',
      name: 'Meena Kumari',
      hplno: 2,
      photo_url: 'https://example.com/photo.jpg',
      photo_verification_status: 'pending',
      govt_id_doc_id: 'doc-1',
      govt_id_verification_status: 'verified',
      location: '11.0168, 76.9558'
    };
    const res = evaluateCustomerKyc(cust);
    assert.equal(res.isKycPending, true);
    assert.ok(res.pendingItems.includes('Photo'));
  });

  await t.test('flags customer with missing govt id document as Govt ID pending', () => {
    const cust = {
      customer_id: 'cust-3',
      name: 'Karthik Raja',
      hplno: 3,
      photo_url: 'https://example.com/photo.jpg',
      photo_verification_status: 'verified',
      govt_id_doc_id: null,
      govt_id_verification_status: null,
      location: '11.0168, 76.9558'
    };
    const res = evaluateCustomerKyc(cust);
    assert.equal(res.isKycPending, true);
    assert.deepEqual(res.pendingItems, ['Govt ID']);
    assert.equal(res.hasPhoto, true);
  });

  await t.test('flags customer with missing location as Location pending', () => {
    const cust = {
      customer_id: 'cust-4',
      name: 'Anitha Devi',
      hplno: 4,
      photo_url: 'https://example.com/photo.jpg',
      photo_verification_status: 'verified',
      govt_id_doc_id: 'doc-2',
      govt_id_verification_status: 'verified',
      location: null,
      home_latitude: null,
      home_address: null
    };
    const res = evaluateCustomerKyc(cust);
    assert.equal(res.isKycPending, true);
    assert.deepEqual(res.pendingItems, ['Location']);
  });

  await t.test('fully compliant customer is marked as isKycPending = false', () => {
    const cust = {
      customer_id: 'cust-5',
      name: 'Compliant Customer',
      hplno: 5,
      photo_url: 'https://example.com/photo.jpg',
      photo_verification_status: 'verified',
      govt_id_doc_id: 'doc-3',
      govt_id_verification_status: 'verified',
      location: '11.0168, 76.9558'
    };
    const res = evaluateCustomerKyc(cust);
    assert.equal(res.isKycPending, false);
    assert.equal(res.pendingItems.length, 0);
    assert.equal(res.verificationStatus, 'verified');
  });

  await t.test('evaluates staff with missing PAN and location as Govt ID and Location pending', () => {
    const staff = {
      staff_detail_id: 'staff-1',
      user_id: 'user-1',
      name: 'Selva',
      staff_code: 'RIM002',
      photo_url: 'https://example.com/selva.png',
      pan_number: null,
      govt_id_doc_id: null,
      location: null,
      street: null,
      city: null,
      role: 'admin'
    };
    const res = evaluateStaffKyc(staff);
    assert.equal(res.isKycPending, true);
    assert.deepEqual(res.pendingItems, ['Govt ID', 'Location']);
    assert.equal(res.entityType, 'Staff');
    assert.equal(res.hasPhoto, true);
    assert.equal(res.hasLocation, false);
  });

  await t.test('filters records by multi-field AND criteria', () => {
    const records = [
      {
        id: 'cust-1',
        name: 'Ravi Shankar',
        accountNumber: 'HPL 1',
        phone: '9876543210',
        vehicle: 'Yamaha RX100 (TN39AA1234)',
        vehicleNumber: 'TN39AA1234',
        vehicleName: 'Yamaha RX100',
        street: 'Anna Salai',
        village: 'Kappalur',
        city: 'Madurai',
        state: 'Tamil Nadu',
        brokerName: 'Broker A',
        entityType: 'Customer',
        pendingItems: ['Govt ID', 'Location']
      },
      {
        id: 'cust-2',
        name: 'Kumar',
        accountNumber: 'RIM003',
        phone: '8989898989',
        vehicle: '—',
        vehicleNumber: '—',
        vehicleName: '—',
        street: 'Gandhi Street',
        village: 'Thirunagar',
        city: 'Tirupur',
        state: 'Tamil Nadu',
        brokerName: '—',
        entityType: 'Staff',
        pendingItems: ['Photo', 'Govt ID']
      }
    ];

    // Filter by pendingType
    const pRes = filterKycRecords(records, { pendingType: 'Photo' });
    assert.equal(pRes.length, 1);
    assert.equal(pRes[0].name, 'Kumar');

    // Filter by entityType
    const eRes = filterKycRecords(records, { entityType: 'Customer' });
    assert.equal(eRes.length, 1);
    assert.equal(eRes[0].name, 'Ravi Shankar');

    // Filter by city
    const cRes = filterKycRecords(records, { city: 'Madurai' });
    assert.equal(cRes.length, 1);
    assert.equal(cRes[0].name, 'Ravi Shankar');

    // Filter by search matching vehicle registration
    const sRes = filterKycRecords(records, { search: 'TN39AA1234' });
    assert.equal(sRes.length, 1);
    assert.equal(sRes[0].name, 'Ravi Shankar');

    // Combined AND filter with no match
    const noMatch = filterKycRecords(records, { city: 'Madurai', pendingType: 'Photo' });
    assert.equal(noMatch.length, 0);
  });

  await t.test('computes aggregates accurately across records', () => {
    const records = [
      { entityType: 'Customer', pendingItems: ['Photo', 'Govt ID'] },
      { entityType: 'Customer', pendingItems: ['Govt ID', 'Location'] },
      { entityType: 'Staff', pendingItems: ['Location'] }
    ];
    const agg = computeAggregates(records);
    assert.equal(agg.totalCount, 3);
    assert.equal(agg.photoPendingCount, 1);
    assert.equal(agg.govtIdPendingCount, 2);
    assert.equal(agg.locationPendingCount, 2);
    assert.equal(agg.customerPendingCount, 2);
    assert.equal(agg.staffPendingCount, 1);
  });

  await t.test('extracts unique and sorted filter options', () => {
    const records = [
      { street: 'Anna Salai', village: 'Kappalur', city: 'Madurai', state: 'Tamil Nadu', brokerName: 'Broker B', entityType: 'Customer' },
      { street: 'Gandhi Road', village: 'Thirunagar', city: 'Tirupur', state: 'Tamil Nadu', brokerName: 'Broker A', entityType: 'Staff' }
    ];
    const opts = extractFilterOptions(records);
    assert.deepEqual(opts.cities, ['Madurai', 'Tirupur']);
    assert.deepEqual(opts.brokers, ['Broker A', 'Broker B']);
    assert.deepEqual(opts.entityTypes, ['Customer', 'Staff']);
  });
});
