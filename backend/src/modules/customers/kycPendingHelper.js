/**
 * AutoFinex — KYC Pending Helper Module
 * Evaluates KYC compliance for customers and staff/agents,
 * applies filters, computes aggregates and dynamic filter options.
 */

/**
 * Evaluates a customer row for KYC compliance.
 *
 * Eligibility rules:
 * - Photo: Must have a verified customer photo in kyc_documents.
 * - Govt ID: Must have a verified identity document (Aadhaar, PAN, Voter ID, Driving License, Passport).
 * - Location: Must have GPS coordinates (location / latitude) or verified address.
 */
function evaluateCustomerKyc(c) {
  const pendingItems = [];

  // 1. Photo Check: Must have a verified customer photo
  const hasValidPhoto = !!(c.photo_url && (c.photo_verification_status ? c.photo_verification_status === 'verified' : true));
  if (!hasValidPhoto) {
    pendingItems.push('Photo');
  }

  // 2. Govt ID Check: Must have a verified identity document uploaded in kyc_documents
  const hasGovtIdDoc = !!(c.govt_id_doc_id && (c.govt_id_verification_status ? c.govt_id_verification_status === 'verified' : true));
  if (!hasGovtIdDoc) {
    pendingItems.push('Govt ID');
  }

  // 3. Location Check: Must have GPS coordinates (location / latitude) or address
  const hasLocation = !!(
    (c.location && String(c.location).trim().length > 0 && String(c.location).trim() !== '—') ||
    c.home_latitude ||
    (c.home_address && String(c.home_address).trim().length > 0)
  );
  if (!hasLocation) {
    pendingItems.push('Location');
  }

  // Determine overall verification status
  let verificationStatus = 'verified';
  if (pendingItems.length === 3) {
    verificationStatus = 'missing';
  } else if (pendingItems.length > 0) {
    verificationStatus = 'pending';
  }

  const vehicleName = [c.brand, c.model_name].filter(Boolean).join(' ') || c.vehicle_modal || null;

  return {
    id: `customer-${c.customer_id}`,
    entityType: 'Customer',
    entityId: String(c.customer_id),
    name: c.name || '—',
    accountNumber: c.hplno ? `HPL ${c.hplno}` : '—',
    hplno: c.hplno ? Number(c.hplno) : null,
    phone: c.phone || '—',
    photoUrl: c.signed_photo_url || c.photo_url || null,
    hasPhoto: hasValidPhoto,
    vehicle: c.vehicle_number ? `${vehicleName || 'Vehicle'} (${c.vehicle_number})`.trim() : (vehicleName || '—'),
    vehicleName: vehicleName || '—',
    vehicleNumber: c.vehicle_number || '—',
    hpAmount: c.hp_amount ? Number(c.hp_amount) : null,
    brokerName: c.broker_name || '—',
    street: c.street || c.street_name || '—',
    streetName: c.street_name || c.street || '—',
    village: c.village || '—',
    city: c.city || '—',
    state: c.state || '—',
    location: c.location || (c.home_address ? c.home_address : '—'),
    hasLocation,
    pendingItems,
    primaryPending: pendingItems[0] || 'None',
    verificationStatus,
    govtIdNumber: c.aadhar_id || c.other_govt_id_number || '—',
    govtIdType: c.aadhar_id ? 'Aadhaar' : (c.other_govt_id_type || '—'),
    isKycPending: pendingItems.length > 0
  };
}

/**
 * Evaluates a staff/agent row for KYC compliance.
 */
function evaluateStaffKyc(s) {
  const pendingItems = [];

  const photo = s.kyc_photo_url || s.photo_url;
  const hasValidPhoto = !!(photo && (s.photo_verification_status ? s.photo_verification_status === 'verified' : true));
  if (!hasValidPhoto) {
    pendingItems.push('Photo');
  }

  const hasGovtId = !!(
    (s.pan_number && String(s.pan_number).trim().length > 0) ||
    (s.govt_id_doc_id && (s.govt_id_verification_status ? s.govt_id_verification_status === 'verified' : true))
  );
  if (!hasGovtId) {
    pendingItems.push('Govt ID');
  }

  const hasLocation = !!(
    (s.location && String(s.location).trim().length > 0 && String(s.location).trim() !== '—') ||
    (s.street && String(s.street).trim().length > 0 && String(s.street).trim() !== '—') ||
    (s.street_name && String(s.street_name).trim().length > 0 && String(s.street_name).trim() !== '—') ||
    (s.village && String(s.village).trim().length > 0 && String(s.village).trim() !== '—') ||
    (s.city && String(s.city).trim().length > 0 && String(s.city).trim() !== '—')
  );
  if (!hasLocation) {
    pendingItems.push('Location');
  }

  let verificationStatus = 'verified';
  if (pendingItems.length === 3) {
    verificationStatus = 'missing';
  } else if (pendingItems.length > 0) {
    verificationStatus = 'pending';
  }

  return {
    id: `staff-${s.staff_detail_id || s.user_id}`,
    entityType: s.role === 'agent' ? 'Agent' : 'Staff',
    entityId: String(s.user_id || s.staff_detail_id),
    name: s.name || s.username || '—',
    accountNumber: s.staff_code || '—',
    hplno: null,
    phone: s.phone || '—',
    photoUrl: s.signed_photo_url || photo || null,
    hasPhoto: hasValidPhoto,
    vehicle: '—',
    vehicleName: '—',
    vehicleNumber: '—',
    hpAmount: null,
    brokerName: '—',
    street: s.street || s.street_name || '—',
    streetName: s.street_name || s.street || '—',
    village: s.village || '—',
    city: s.city || '—',
    state: s.state || '—',
    location: s.location || '—',
    hasLocation,
    pendingItems,
    primaryPending: pendingItems[0] || 'None',
    verificationStatus,
    govtIdNumber: s.pan_number || '—',
    govtIdType: s.pan_number ? 'PAN' : '—',
    isKycPending: pendingItems.length > 0
  };
}

/**
 * Filters KYC records using multi-field AND logic.
 */
function filterKycRecords(records, filters = {}) {
  const {
    search = '',
    pendingType = 'all',
    street = '',
    village = '',
    city = '',
    state = '',
    broker = '',
    entityType = 'all'
  } = filters;

  const searchLower = String(search || '').trim().toLowerCase();
  const streetLower = String(street || '').trim().toLowerCase();
  const villageLower = String(village || '').trim().toLowerCase();
  const cityLower = String(city || '').trim().toLowerCase();
  const stateLower = String(state || '').trim().toLowerCase();
  const brokerLower = String(broker || '').trim().toLowerCase();
  const pTypeLower = String(pendingType || '').trim().toLowerCase();
  const eTypeLower = String(entityType || '').trim().toLowerCase();

  return records.filter(item => {
    // 1. Search filter
    if (searchLower) {
      const matchSearch =
        item.name.toLowerCase().includes(searchLower) ||
        item.accountNumber.toLowerCase().includes(searchLower) ||
        (item.phone && item.phone.toLowerCase().includes(searchLower)) ||
        (item.vehicle && item.vehicle.toLowerCase().includes(searchLower)) ||
        (item.vehicleNumber && item.vehicleNumber.toLowerCase().includes(searchLower)) ||
        (item.vehicleName && item.vehicleName.toLowerCase().includes(searchLower)) ||
        (item.govtIdNumber && item.govtIdNumber.toLowerCase().includes(searchLower));
      if (!matchSearch) return false;
    }

    // 2. Pending Type filter
    if (pTypeLower && pTypeLower !== 'all') {
      const target = pTypeLower === 'photo'
        ? 'Photo'
        : (pTypeLower === 'govt id' || pTypeLower === 'govt_id' || pTypeLower === 'govtid')
        ? 'Govt ID'
        : pTypeLower === 'location'
        ? 'Location'
        : pendingType;
      if (!item.pendingItems.includes(target)) return false;
    }

    // 3. Entity Type filter
    if (eTypeLower && eTypeLower !== 'all') {
      if (item.entityType.toLowerCase() !== eTypeLower) return false;
    }

    // 4. Street filter
    if (streetLower) {
      const itemStreet = (item.street || item.streetName || '').toLowerCase();
      if (!itemStreet.includes(streetLower)) return false;
    }

    // 5. Village filter
    if (villageLower) {
      if (!item.village.toLowerCase().includes(villageLower)) return false;
    }

    // 6. City filter
    if (cityLower) {
      if (!item.city.toLowerCase().includes(cityLower)) return false;
    }

    // 7. State filter
    if (stateLower) {
      if (!item.state.toLowerCase().includes(stateLower)) return false;
    }

    // 8. Broker filter
    if (brokerLower) {
      if (!item.brokerName.toLowerCase().includes(brokerLower)) return false;
    }

    return true;
  });
}

/**
 * Extracts distinct filter options from pending records.
 */
function extractFilterOptions(records) {
  const streets = new Set();
  const villages = new Set();
  const cities = new Set();
  const states = new Set();
  const brokers = new Set();
  const entityTypes = new Set();

  for (const r of records) {
    if (r.street && r.street !== '—') streets.add(r.street);
    if (r.streetName && r.streetName !== '—') streets.add(r.streetName);
    if (r.village && r.village !== '—') villages.add(r.village);
    if (r.city && r.city !== '—') cities.add(r.city);
    if (r.state && r.state !== '—') states.add(r.state);
    if (r.brokerName && r.brokerName !== '—') brokers.add(r.brokerName);
    if (r.entityType) entityTypes.add(r.entityType);
  }

  return {
    streets: Array.from(streets).sort(),
    villages: Array.from(villages).sort(),
    cities: Array.from(cities).sort(),
    states: Array.from(states).sort(),
    brokers: Array.from(brokers).sort(),
    entityTypes: Array.from(entityTypes).sort(),
    pendingTypes: ['Photo', 'Govt ID', 'Location']
  };
}

/**
 * Computes aggregate summary numbers across all pending records.
 */
function computeAggregates(records) {
  let photoPendingCount = 0;
  let govtIdPendingCount = 0;
  let locationPendingCount = 0;
  let customerPendingCount = 0;
  let staffPendingCount = 0;

  for (const r of records) {
    if (r.pendingItems.includes('Photo')) photoPendingCount++;
    if (r.pendingItems.includes('Govt ID')) govtIdPendingCount++;
    if (r.pendingItems.includes('Location')) locationPendingCount++;
    if (r.entityType === 'Customer') customerPendingCount++;
    if (r.entityType === 'Staff' || r.entityType === 'Agent') staffPendingCount++;
  }

  return {
    totalCount: records.length,
    photoPendingCount,
    govtIdPendingCount,
    locationPendingCount,
    customerPendingCount,
    staffPendingCount
  };
}

module.exports = {
  evaluateCustomerKyc,
  evaluateStaffKyc,
  filterKycRecords,
  extractFilterOptions,
  computeAggregates
};
