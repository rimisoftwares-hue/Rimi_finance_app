'use strict';

/**
 * Deferred (consulting) vehicle persistence for POST /customers.
 * Runs INSIDE the caller's transaction (conn). Never commits or rolls back itself.
 *
 * A vehicle is deferred when:
 *   - vehicle.isNewVehicle === true, or
 *   - String(vehicle.id) starts with 'temp_', or
 *   - vehicle.id is empty AND a registration number is present.
 * A real UUID keeps the existing behaviour (handled by the caller).
 */

const normalizeRegNo = (v) => (v === null || v === undefined ? '' : String(v).toUpperCase().replace(/[\s\-.]/g, ''));
const nullIfEmpty = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase().replace(/\s+/g, '');
  return s ? s : null;
};

class VehicleConflictError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    this.status = 409;
    if (field) this.field = field;
  }
}

const regNoOf = (vehicle) => normalizeRegNo(vehicle && (vehicle.vehicleNumber || vehicle.vehicle_number));

const isDeferredVehicle = (vehicle) => {
  if (!vehicle) return false;
  if (vehicle.isNewVehicle === true) return true;
  const id = vehicle.id === null || vehicle.id === undefined ? '' : String(vehicle.id).trim();
  if (id.startsWith('temp_')) return true;
  return !id && !!regNoOf(vehicle);
};

/**
 * Pure decision for an existing row found by registration number.
 * @returns {'reuse'|'linked'|'other_finance'}
 */
const decideExisting = (row, financeId) => {
  if (String(row.finance_id) !== String(financeId)) return 'other_finance';
  if (row.status === 'available' && !row.linked) return 'reuse';
  return 'linked';
};

const toNumberOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Year / model text for vehicle_detail.vehicle_modal (VARCHAR(10)). */
const vehicleModalOf = (vehicle) => {
  const raw = vehicle.vehicle_modal || vehicle.manufacture_year || vehicle.modelName || '';
  const s = String(raw).trim();
  return s ? s.slice(0, 10) : null;
};

/**
 * Prices: never derived from the loan HP amount (decision D5).
 * base_price: explicit vehicle.base_price > master vehicle_info.base_price > 0 (column is NOT NULL, no default).
 * final_price: selling_price > base_price.
 */
const computePrices = (vehicle, masterBasePrice) => {
  const explicitBase = toNumberOrNull(vehicle.base_price);
  const master = toNumberOrNull(masterBasePrice);
  const base = explicitBase ?? master ?? 0;
  const selling = toNumberOrNull(vehicle.selling_price);
  return { base_price: base, selling_price: selling, final_price: selling ?? base };
};

/**
 * @param {object} conn                 pg client inside BEGIN
 * @param {object} args
 * @param {object} args.vehicle          parsed vehicle payload
 * @param {string} args.financeId        from middleware (never from the body)
 * @param {Function} args.resolveVehicleInfoId  (conn, vehicle) => uuid|null
 * @param {Function} args.insertClause   pgInsertClause helper
 * @returns {Promise<{ vehicleId: string, created: boolean, vehicleNumber: string }>}
 */
const resolveDeferredVehicle = async (conn, { vehicle, financeId, resolveVehicleInfoId, insertClause }) => {
  const regNo = regNoOf(vehicle);
  if (!regNo) {
    const e = new Error('Vehicle number is required');
    e.status = 400;
    e.code = 'VEHICLE_NUMBER_REQUIRED';
    throw e;
  }
  const engine = nullIfEmpty(vehicle.engine_number);
  const chassis = nullIfEmpty(vehicle.chassis_number);

  const { rows: found } = await conn.query(
    `SELECT vd.id, vd.finance_id, vd.status, vd.deal_type,
            (EXISTS (SELECT 1 FROM customers c WHERE c.vehicle_id = vd.id)
             OR EXISTS (SELECT 1 FROM loans l WHERE l.vehicle_id = vd.id)) AS linked
       FROM vehicle_detail vd
      WHERE regexp_replace(UPPER(vd.vehicle_number), '[[:space:].-]', '', 'g') = $1
      FOR UPDATE OF vd`,
    [regNo]
  );

  if (found.length > 0) {
    const row = found[0];
    const decision = decideExisting(row, financeId);
    if (decision === 'other_finance') {
      throw new VehicleConflictError('VEHICLE_NUMBER_TAKEN', 'This registration number is already registered in the system');
    }
    if (decision === 'linked') {
      throw new VehicleConflictError('VEHICLE_ALREADY_LINKED', `Vehicle ${regNo} is already sold or linked to another customer`);
    }
    await conn.query(
      `UPDATE vehicle_detail SET status = 'sales', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id]
    );
    return { vehicleId: row.id, created: false, vehicleNumber: regNo };
  }

  // Not found: engine / chassis are UNIQUE globally too
  if (engine) {
    const { rows } = await conn.query('SELECT 1 FROM vehicle_detail WHERE UPPER(REPLACE(engine_number, \' \', \'\')) = $1 LIMIT 1', [engine]);
    if (rows.length) throw new VehicleConflictError('VEHICLE_ENGINE_TAKEN', 'This engine number is already registered', 'engine_number');
  }
  if (chassis) {
    const { rows } = await conn.query('SELECT 1 FROM vehicle_detail WHERE UPPER(REPLACE(chassis_number, \' \', \'\')) = $1 LIMIT 1', [chassis]);
    if (rows.length) throw new VehicleConflictError('VEHICLE_CHASSIS_TAKEN', 'This chassis number is already registered', 'chassis_number');
  }

  // vehicle_info_id is nullable in the schema; resolve when possible
  const vehicleInfoId = await resolveVehicleInfoId(conn, vehicle);
  let masterBasePrice = null;
  if (vehicleInfoId) {
    const { rows } = await conn.query('SELECT base_price FROM vehicle_info WHERE id = $1', [vehicleInfoId]);
    masterBasePrice = rows[0] ? rows[0].base_price : null;
  }
  const prices = computePrices(vehicle, masterBasePrice);

  const rcStatus = ['original', 'duplicate', 'not_available'].includes(vehicle.rc_status) ? vehicle.rc_status : 'original';
  const rcHolder = ['Company', 'customer', 'third_party', 'pending'].includes(vehicle.rc_holder) ? vehicle.rc_holder : 'Company';
  const insExpiry = vehicle.insurance_expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(String(vehicle.insurance_expiry_date))
    ? String(vehicle.insurance_expiry_date)
    : null;

  const ins = insertClause({
    finance_id: financeId,
    vehicle_info_id: vehicleInfoId,
    vehicle_number: regNo,
    vehicle_modal: vehicleModalOf(vehicle),
    chassis_number: chassis,
    engine_number: engine,
    num_owner: 1,
    trip_driven: 0,
    color: vehicle.color ? String(vehicle.color).trim().slice(0, 100) : null,
    variant: vehicle.variant ? String(vehicle.variant).trim().slice(0, 100) : null,
    selling_price: prices.selling_price,
    emi_from: 0,
    base_price: prices.base_price,
    final_price: prices.final_price,
    status: 'sales',
    created_date: new Date().toISOString().split('T')[0],
    deal_type: 'consulting',
    rc_holder: rcHolder,
    rc_status: rcStatus,
    fc_expiry_date: null,
    insurance_expiry_date: insExpiry,
    remarks: vehicle.remarks ? String(vehicle.remarks) : 'Created via Consulting Loan Entry',
  });
  const { rows: inserted } = await conn.query(
    `INSERT INTO vehicle_detail (${ins.columns}) VALUES (${ins.placeholders}) RETURNING id`,
    ins.values
  );
  return { vehicleId: inserted[0].id, created: true, vehicleNumber: regNo };
};

/** Map PostgreSQL unique violations on vehicle_detail to 409 responses (backstop). */
const mapVehicleUniqueViolation = (err) => {
  if (!err || err.code !== '23505') return null;
  const c = String(err.constraint || '');
  if (c === 'vehicle_detail_vehicle_number_key') return new VehicleConflictError('VEHICLE_NUMBER_TAKEN', 'This registration number is already registered in the system');
  if (c === 'vehicle_detail_engine_number_key') return new VehicleConflictError('VEHICLE_ENGINE_TAKEN', 'This engine number is already registered', 'engine_number');
  if (c === 'vehicle_detail_chassis_number_key') return new VehicleConflictError('VEHICLE_CHASSIS_TAKEN', 'This chassis number is already registered', 'chassis_number');
  return null;
};

module.exports = {
  isDeferredVehicle,
  decideExisting,
  computePrices,
  vehicleModalOf,
  resolveDeferredVehicle,
  mapVehicleUniqueViolation,
  VehicleConflictError,
  normalizeRegNo,
  nullIfEmpty,
};

