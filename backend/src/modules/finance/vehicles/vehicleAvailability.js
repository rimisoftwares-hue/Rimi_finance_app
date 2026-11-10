'use strict';

/**
 * Vehicle availability classification (pure, unit-tested).
 * vehicle_number, engine_number and chassis_number are UNIQUE across the whole
 * vehicle_detail table, so lookups are global (not filtered by finance, status or deal type).
 */

const normalizeRegNo = (v) => (v === null || v === undefined ? '' : String(v).toUpperCase().replace(/[\s\-.]/g, ''));
const normalizeIdent = (v) => (v === null || v === undefined ? '' : String(v).toUpperCase().replace(/\s+/g, ''));

/**
 * @param {object} p
 * @param {string} p.financeId          caller's finance (req.financeId)
 * @param {object|null} p.byNumber      row matching vehicle_number: { id, finance_id, status, linked, ...display }
 * @param {object|null} p.byEngine      row matching engine_number: { id }
 * @param {object|null} p.byChassis     row matching chassis_number: { id }
 */
const classifyAvailability = ({ financeId, byNumber, byEngine, byChassis }) => {
  const ownId = byNumber ? String(byNumber.id) : null;
  const conflicts = [];
  if (byEngine && String(byEngine.id) !== ownId) conflicts.push('engine_number');
  if (byChassis && String(byChassis.id) !== ownId) conflicts.push('chassis_number');

  if (!byNumber) {
    return conflicts.length ? { state: 'not_found', conflicts } : { state: 'not_found' };
  }
  if (String(byNumber.finance_id) !== String(financeId)) {
    // Another tenant: no ids, no details
    return { state: 'unavailable' };
  }
  const base = conflicts.length ? { conflicts } : {};
  if (byNumber.status === 'available' && !byNumber.linked) {
    return {
      state: 'available',
      vehicleId: byNumber.id,
      vehicle: {
        id: byNumber.id,
        vehicle_number: byNumber.vehicle_number,
        vehicle_modal: byNumber.vehicle_modal || null,
        color: byNumber.color || null,
        brand: byNumber.brand || null,
        model_name: byNumber.model_name || null,
        type: byNumber.type || null,
        deal_type: byNumber.deal_type || null,
        engine_number: byNumber.engine_number || null,
        chassis_number: byNumber.chassis_number || null,
      },
      ...base,
    };
  }
  return { state: 'in_use', ...base };
};

module.exports = { classifyAvailability, normalizeRegNo, normalizeIdent };

