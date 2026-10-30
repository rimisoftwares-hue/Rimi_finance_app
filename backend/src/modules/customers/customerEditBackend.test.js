const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('AutoFinex Customer Routes & SQL Clause Generation Tests', () => {

  const COLUMN_MAPPINGS = {
    hpAmount: 'hp_amount',
    hpDate: 'hp_date',
    dueMonth: 'due_month',
    interestRate: 'interest_rate',
    penaltyAmount: 'penalty_amount',
    dueAmount: 'due_amount',
    dueDate: 'due_date',
    paymentDate: 'payment_date',
    billNumber: 'bill_number',
    payMode: 'pay_mode',
    payMode1: 'pay_mode_1',
    customerPhoto: 'customer_photo',
    guardianPhoto: 'guardian_photo',
    vehicleNumber: 'vehicle_number',
    modelName: 'model_name',
    vehicleName: 'vehicle_name'
  };

  const normalizeColumnName = (col) => {
    if (COLUMN_MAPPINGS[col]) return COLUMN_MAPPINGS[col];
    if (/^[a-z0-9_]+$/.test(col)) return col;
    return col.replace(/([A-Z])/g, '_$1').toLowerCase();
  };

  const pgSetClause = (data) => {
    const keys = Object.keys(data);
    const clause = keys.map((k, i) => `"${normalizeColumnName(k)}" = $${i + 1}`).join(', ');
    const values = keys.map(k => (k === 'is_current' && typeof data[k] === 'boolean' ? (data[k] ? 1 : 0) : data[k]));
    return { clause, values };
  };

  test('normalizeColumnName maps camelCase loan fields to postgres column names', () => {
    assert.equal(normalizeColumnName('hpAmount'), 'hp_amount');
    assert.equal(normalizeColumnName('dueAmount'), 'due_amount');
    assert.equal(normalizeColumnName('dueMonth'), 'due_month');
    assert.equal(normalizeColumnName('interestRate'), 'interest_rate');
    assert.equal(normalizeColumnName('penaltyAmount'), 'penalty_amount');
    assert.equal(normalizeColumnName('vehicleNumber'), 'vehicle_number');
    assert.equal(normalizeColumnName('modelName'), 'model_name');
  });

  test('pgSetClause generates valid parameterized SQL and values without dropping zero values', () => {
    const loanUpdateData = {
      loan_type: 'HP',
      hpAmount: 50000,
      dueMonth: 12,
      interestRate: 2,
      penaltyAmount: 0,
      down_payment: 0,
    };

    const result = pgSetClause(loanUpdateData);

    assert.ok(result.clause.includes('"loan_type" = $1'));
    assert.ok(result.clause.includes('"hp_amount" = $2'));
    assert.ok(result.clause.includes('"due_month" = $3'));
    assert.ok(result.clause.includes('"interest_rate" = $4'));
    assert.ok(result.clause.includes('"penalty_amount" = $5'));
    assert.ok(result.clause.includes('"down_payment" = $6'));

    assert.strictEqual(result.values[4], 0);
    assert.strictEqual(result.values[5], 0);
  });

  test('Customer routes file exports an express router containing PUT /:customerId and PUT /finance/:customerId', () => {
    const routeFileContent = fs.readFileSync(path.join(__dirname, 'customer.routes.js'), 'utf-8');

    assert.ok(routeFileContent.includes("router.get('/:customerId'"), 'GET /:customerId must be registered');
    assert.ok(routeFileContent.includes("router.put('/finance/:customerId'"), 'PUT /finance/:customerId must be registered');
    assert.ok(routeFileContent.includes("router.put('/consulting/:customerId'"), 'PUT /consulting/:customerId must be registered');
    assert.ok(routeFileContent.includes("router.put('/:customerId'"), 'PUT /:customerId must be registered');
  });

  test('Customer routes contain ON CONFLICT deduplication and sanitizeContactNumberType for contacts', () => {
    const routeFileContent = fs.readFileSync(path.join(__dirname, 'customer.routes.js'), 'utf-8');

    assert.ok(routeFileContent.includes('sanitizeContactNumberType'), 'Must have sanitizeContactNumberType helper');
    assert.ok(
      routeFileContent.includes('ON CONFLICT (customer_id, number, contact_type)'),
      'Must resolve conflict on (customer_id, number, contact_type) constraint'
    );
  });

  test('Vehicle update sanitizes empty chassis_number and engine_number to null', () => {
    const routeFileContent = fs.readFileSync(path.join(__dirname, 'customer.routes.js'), 'utf-8');

    assert.ok(
      routeFileContent.includes('cleanChassis ? cleanChassis : null'),
      'Vehicle update must map empty chassis_number to null to avoid unique constraint collision'
    );
    assert.ok(
      routeFileContent.includes('cleanEngine ? cleanEngine : null'),
      'Vehicle update must map empty engine_number to null to avoid unique constraint collision'
    );
  });

  test('Customer vehicle creation and update auto-resolves vehicle_info_id from vehicle_info catalog', () => {
    const routeFileContent = fs.readFileSync(path.join(__dirname, 'customer.routes.js'), 'utf-8');

    assert.ok(
      routeFileContent.includes('SELECT id FROM vehicle_info'),
      'Must contain auto-resolution lookup for vehicle_info_id'
    );
  });
});

describe('AutoFinex Validation & Catalog Resolution Unit Tests', () => {
  process.env.NODE_ENV = 'test';
  const customerRoutes = require('./customer.routes');
  const godownRoutes = require('../finance/inventory/godown/godown.routes');

  const {
    cleanUuid,
    cleanContactNumber,
    resolveVehicleInfoId,
    validateCustomerPayload,
    validateGuardianPayload,
    validateVehiclePayload
  } = customerRoutes;
  const { validateGodownInput } = godownRoutes;

  describe('cleanUuid helper', () => {
    test('accepts valid UUID strings and normalizes them', () => {
      const valid = '123e4567-e89b-12d3-a456-426614174000';
      assert.strictEqual(cleanUuid(valid), valid.toLowerCase());
      assert.strictEqual(cleanUuid(`  ${valid.toUpperCase()}  `), valid.toLowerCase());
    });

    test('rejects empty strings, whitespace, null, and non-UUID values', () => {
      assert.strictEqual(cleanUuid(''), null);
      assert.strictEqual(cleanUuid('   '), null);
      assert.strictEqual(cleanUuid(null), null);
      assert.strictEqual(cleanUuid(undefined), null);
      assert.strictEqual(cleanUuid('not-a-uuid'), null);
      assert.strictEqual(cleanUuid(12345), null);
      assert.strictEqual(cleanUuid('123e4567-e89b-12d3-a456'), null);
    });
  });

  describe('cleanContactNumber helper', () => {
    test('accepts standard 10-digit mobile number', () => {
      assert.strictEqual(cleanContactNumber('9876543210'), '9876543210');
      assert.strictEqual(cleanContactNumber('98765 43210'), '9876543210');
      assert.strictEqual(cleanContactNumber('98765-43210'), '9876543210');
    });

    test('handles +91, 91, and 0 prefixes without counting towards 10 digits', () => {
      assert.strictEqual(cleanContactNumber('+91 9876543210'), '9876543210');
      assert.strictEqual(cleanContactNumber('+91-9876543210'), '9876543210');
      assert.strictEqual(cleanContactNumber('919876543210'), '9876543210');
      assert.strictEqual(cleanContactNumber('09876543210'), '9876543210');
    });

    test('rejects numbers with fewer than 10 digits', () => {
      assert.strictEqual(cleanContactNumber('987654321'), null);
      assert.strictEqual(cleanContactNumber('12345'), null);
      assert.strictEqual(cleanContactNumber(''), null);
    });

    test('rejects numbers with more than 10 digits', () => {
      assert.strictEqual(cleanContactNumber('98765432101'), null);
      assert.strictEqual(cleanContactNumber('9876543210123'), null);
    });

    test('rejects alphabetic characters and symbols in contact number', () => {
      assert.strictEqual(cleanContactNumber('98765abcde'), null);
      assert.strictEqual(cleanContactNumber('987654321#'), null);
      assert.strictEqual(cleanContactNumber('phone12345'), null);
    });
  });

  describe('Godown Dialog Validation', () => {
    test('rejects missing or whitespace-only godown name', () => {
      const r1 = validateGodownInput({ name: '', contact_number: '9876543210' });
      assert.strictEqual(r1.valid, false);
      assert.strictEqual(r1.error, 'Godown name is required');

      const r2 = validateGodownInput({ name: '   ', contact_number: '9876543210' });
      assert.strictEqual(r2.valid, false);
      assert.strictEqual(r2.error, 'Godown name is required');

      const r3 = validateGodownInput({ contact_number: '9876543210' });
      assert.strictEqual(r3.valid, false);
      assert.strictEqual(r3.error, 'Godown name is required');
    });

    test('rejects invalid contact numbers', () => {
      const r1 = validateGodownInput({ name: 'Main Godown', contact_number: '123' });
      assert.strictEqual(r1.valid, false);
      assert.strictEqual(r1.error, 'Contact number must be exactly 10 digits');

      const r2 = validateGodownInput({ name: 'Main Godown', contact_number: '987654321099' });
      assert.strictEqual(r2.valid, false);
      assert.strictEqual(r2.error, 'Contact number must be exactly 10 digits');

      const r3 = validateGodownInput({ name: 'Main Godown', contact_number: '98765abcde' });
      assert.strictEqual(r3.valid, false);
      assert.strictEqual(r3.error, 'Contact number must be exactly 10 digits');
    });

    test('accepts valid godown name and 10-digit contact number', () => {
      const res1 = validateGodownInput({ name: 'Central Warehouse', contact_number: '9876543210' });
      assert.strictEqual(res1.valid, true);
      assert.strictEqual(res1.contactNumber, '9876543210');

      const res2 = validateGodownInput({ name: 'Central Warehouse', contact_number: '+91 98765 43210' });
      assert.strictEqual(res2.valid, true);
      assert.strictEqual(res2.contactNumber, '9876543210');
    });
  });

  describe('Customer Payload Validation', () => {
    const validCustomer = {
      cname: 'Ramesh Kumar',
      cfname_value: 'Suresh Kumar',
      cfname_unit: 'S/O',
      contacts: [{ number: '9876543210', type: 'mobile' }],
      address: {
        street_name: 'Gandhi Road',
        village: ''
      }
    };

    test('accepts fully valid customer payload', () => {
      const res = validateCustomerPayload(validCustomer);
      assert.strictEqual(res.valid, true);
    });

    test('rejects missing or whitespace customer name', () => {
      assert.strictEqual(validateCustomerPayload({ ...validCustomer, cname: '' }).valid, false);
      assert.strictEqual(validateCustomerPayload({ ...validCustomer, cname: '   ' }).valid, false);
    });

    test('rejects missing customer relation unit or value', () => {
      assert.strictEqual(validateCustomerPayload({ ...validCustomer, cfname_value: '' }).valid, false);
      assert.strictEqual(validateCustomerPayload({ ...validCustomer, cfname_unit: '' }).valid, false);
    });

    test('requires at least one valid 10-digit contact number', () => {
      assert.strictEqual(validateCustomerPayload({ ...validCustomer, contacts: [] }).valid, false);
      assert.strictEqual(
        validateCustomerPayload({ ...validCustomer, contacts: [{ number: '12345', type: 'mobile' }] }).valid,
        false
      );
      assert.strictEqual(
        validateCustomerPayload({ ...validCustomer, contacts: [{ number: '98765abcde', type: 'mobile' }] }).valid,
        false
      );
    });

    test('allows optional second contact only if it is valid when provided', () => {
      const withValidSecond = {
        ...validCustomer,
        contacts: [
          { number: '9876543210', type: 'mobile' },
          { number: '9876543211', type: 'home' }
        ]
      };
      assert.strictEqual(validateCustomerPayload(withValidSecond).valid, true);

      const withInvalidSecond = {
        ...validCustomer,
        contacts: [
          { number: '9876543210', type: 'mobile' },
          { number: '12345', type: 'home' }
        ]
      };
      assert.strictEqual(validateCustomerPayload(withInvalidSecond).valid, false);
    });

    test('requires either Street Name or Village (both missing fails, either one succeeds)', () => {
      // Both missing fails
      assert.strictEqual(
        validateCustomerPayload({ ...validCustomer, address: { street_name: '', village: '' } }).valid,
        false
      );
      assert.strictEqual(
        validateCustomerPayload({ ...validCustomer, address: { street_name: '   ', village: '   ' } }).valid,
        false
      );

      // Street name only succeeds
      assert.strictEqual(
        validateCustomerPayload({ ...validCustomer, address: { street_name: 'Main Street', village: '' } }).valid,
        true
      );

      // Village only succeeds
      assert.strictEqual(
        validateCustomerPayload({ ...validCustomer, address: { street_name: '', village: 'Green Valley' } }).valid,
        true
      );
    });
  });

  describe('Guardian Payload Validation', () => {
    const validGuardian = {
      gname: 'Suresh Kumar',
      gfname_value: 'Grandfather Kumar',
      gfname_unit: 'S/O',
      contacts: [{ number: '9123456789', type: 'mobile' }],
      address: {
        street_name: 'Nehru Lane',
        village: ''
      }
    };

    test('accepts fully valid guardian payload', () => {
      const res = validateGuardianPayload(validGuardian);
      assert.strictEqual(res.valid, true);
    });

    test('rejects missing or whitespace guardian name', () => {
      assert.strictEqual(validateGuardianPayload({ ...validGuardian, gname: '' }).valid, false);
      assert.strictEqual(validateGuardianPayload({ ...validGuardian, gname: '   ' }).valid, false);
    });

    test('rejects missing guardian relation unit or value', () => {
      assert.strictEqual(validateGuardianPayload({ ...validGuardian, gfname_value: '' }).valid, false);
      assert.strictEqual(validateGuardianPayload({ ...validGuardian, gfname_unit: '' }).valid, false);
    });

    test('requires at least one valid 10-digit guardian contact', () => {
      assert.strictEqual(validateGuardianPayload({ ...validGuardian, contacts: [] }).valid, false);
      assert.strictEqual(
        validateGuardianPayload({ ...validGuardian, contacts: [{ number: '1234', type: 'mobile' }] }).valid,
        false
      );
    });

    test('requires guardian street name (mandatory)', () => {
      assert.strictEqual(
        validateGuardianPayload({ ...validGuardian, address: { street_name: '', village: 'Some Village' } }).valid,
        false
      );
      assert.strictEqual(
        validateGuardianPayload({ ...validGuardian, address: { street_name: '   ', village: 'Some Village' } }).valid,
        false
      );
    });
  });

  describe('Vehicle Payload Validation', () => {
    const validVehicle = {
      vehicle_number: 'TN38AB1234',
      brand: 'Honda',
      loan_type: 'two_wheeler',
      penaltyAmount: 0
    };

    test('accepts valid vehicle payload', () => {
      const res = validateVehiclePayload(validVehicle, true);
      assert.strictEqual(res.valid, true);
    });

    test('rejects missing vehicle number', () => {
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, vehicle_number: '' }, true).valid, false);
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, vehicle_number: '   ' }, true).valid, false);
    });

    test('rejects missing vehicle brand', () => {
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, brand: '' }, true).valid, false);
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, brand: '   ' }, true).valid, false);
    });

    test('penalty is optional and does not fail validation when 0, empty, or null', () => {
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, penaltyAmount: null }, true).valid, true);
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, penaltyAmount: 0 }, true).valid, true);
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, penaltyAmount: '' }, true).valid, true);
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, penaltyAmount: undefined }, true).valid, true);
    });

    test('loan type is required for finance deals', () => {
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, loan_type: '' }, true).valid, false);
      assert.strictEqual(validateVehiclePayload({ ...validVehicle, loan_type: '' }, false).valid, true);
    });
  });

  describe('resolveVehicleInfoId helper', () => {
    test('resolves vehicle_info_id from verified existing catalog id', async () => {
      const catalogId = '123e4567-e89b-12d3-a456-426614174000';
      const mockConn = {
        query: async (sql, params) => {
          if (sql.includes('SELECT id FROM vehicle_info WHERE id = $1')) {
            assert.strictEqual(params[0], catalogId);
            return { rows: [{ id: catalogId }] };
          }
          return { rows: [] };
        }
      };

      const result = await resolveVehicleInfoId(mockConn, {
        vehicle_info_id: catalogId,
        brand: 'Honda',
        model_name: 'Activa'
      });
      assert.strictEqual(result, catalogId);
    });

    test('resolves catalog id by brand and model exact match when ID is missing', async () => {
      const catalogId = '223e4567-e89b-12d3-a456-426614174001';
      const mockConn = {
        query: async (sql, params) => {
          if (sql.includes('FROM vehicle_info') && params[0] === 'Honda' && params[1] === 'Activa 6G') {
            return { rows: [{ id: catalogId }] };
          }
          return { rows: [] };
        }
      };

      const result = await resolveVehicleInfoId(mockConn, {
        brand: 'Honda',
        model_name: 'Activa 6G'
      });
      assert.strictEqual(result, catalogId);
    });

    test('strips brand prefix from model name (e.g. "Honda Activa 6G" -> "Activa 6G")', async () => {
      const catalogId = '323e4567-e89b-12d3-a456-426614174002';
      const mockConn = {
        query: async (sql, params) => {
          if (sql.includes('FROM vehicle_info') && params[0] === 'Honda' && params[1] === 'Activa 6G') {
            return { rows: [{ id: catalogId }] };
          }
          return { rows: [] };
        }
      };

      const result = await resolveVehicleInfoId(mockConn, {
        brand: 'Honda',
        model_name: 'Honda Activa 6G'
      });
      assert.strictEqual(result, catalogId);
    });

    test('resolves model with variant text (e.g. "Activa 6G Deluxe" -> "Activa 6G")', async () => {
      const catalogId = '423e4567-e89b-12d3-a456-426614174003';
      const mockConn = {
        query: async (sql, params) => {
          if (sql.includes('FROM vehicle_info') && params[0] === 'Honda' && params[1].includes('Activa 6G')) {
            return { rows: [{ id: catalogId }] };
          }
          return { rows: [] };
        }
      };

      const result = await resolveVehicleInfoId(mockConn, {
        brand: 'Honda',
        model_name: 'Activa 6G Deluxe'
      });
      assert.strictEqual(result, catalogId);
    });

    test('does not guess or associate random entry when no reliable match exists', async () => {
      const mockConn = {
        query: async () => ({ rows: [] })
      };

      const result = await resolveVehicleInfoId(mockConn, {
        brand: 'CustomBrand',
        model_name: 'UnknownCustomModel'
      });
      assert.strictEqual(result, null);
    });
  });
});
