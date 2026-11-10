import type { CustomerDetails, GuardianDetails, LoanDetails, VehicleDetails } from '../types/formStore.ts';

export interface NormalizedCustomerData {
  customer: CustomerDetails;
  guardian: GuardianDetails | null;
  loan: LoanDetails;
  vehicle: VehicleDetails | null;
  dealType: 'finance' | 'consulting';
}

const baseUrl = (import.meta.env?.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

export const getNormalizedImageUrl = (
  photo: any,
  fallback = ''
): string => {
  if (!photo) return fallback;
  if (photo instanceof File) return URL.createObjectURL(photo);
  if (typeof photo === 'object') {
    const url = photo.signed_url || photo.original_url || photo.url;
    if (!url) return fallback;
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  if (typeof photo === 'string' && photo.length > 0) {
    if (photo.startsWith('http') || photo.startsWith('blob:')) return photo;
    return `${baseUrl}${photo.startsWith('/') ? '' : '/'}${photo}`;
  }
  return fallback;
};

/**
 * Safely parses a numeric value preserving valid 0s, null, or fallback.
 */
export const safeNumber = (val: any, fallback = 0): number => {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? fallback : num;
};

/**
 * Safely normalizes raw API response into form store structures.
 * Supports both snake_case (Postgres DDL) and camelCase (API aliases).
 * Preserves legitimate 0 values with nullish coalescing.
 */
export const normalizeCustomerData = (apiData: any): NormalizedCustomerData => {
  if (!apiData) {
    throw new Error('API data is missing');
  }

  const rawCust = apiData.customer || {};
  const rawGuard = apiData.guardian || null;
  const rawLoan = apiData.loan || {};
  const rawVeh = apiData.vehicle || null;

  // 1. Normalize Customer
  const customer: CustomerDetails = {
    id: rawCust.id || '',
    hplno: rawCust.hplno != null ? String(rawCust.hplno) : '',
    cname: rawCust.cname || '',
    loanStatus: rawCust.loanStatus || rawCust.loan_status || 'active',
    brokerName: rawCust.brokerName || rawCust.broker_name || '',
    cfname: {
      unit: rawCust.cfname?.unit || rawCust.cfname_unit || 'S/O',
      value: rawCust.cfname?.value || rawCust.cfname_value || '',
    },
    caddress: {
      house_no: rawCust.address?.house_no || rawCust.caddress?.house_no || '',
      street: rawCust.address?.street || rawCust.caddress?.street || '',
      street_name: rawCust.address?.street_name || rawCust.caddress?.street_name || '',
      village: rawCust.address?.village || rawCust.caddress?.village || '',
      land_mark: rawCust.address?.land_mark || rawCust.caddress?.land_mark || '',
      address: rawCust.address?.address || rawCust.caddress?.address || '',
      city: rawCust.address?.city || rawCust.caddress?.city || '',
      district: rawCust.address?.district || rawCust.caddress?.district || '',
      state: rawCust.address?.state || rawCust.caddress?.state || '',
      pincode: rawCust.address?.pincode || rawCust.caddress?.pincode || '',
      location: rawCust.address?.location || rawCust.caddress?.location || '',
      latitude: rawCust.address?.latitude != null ? String(rawCust.address.latitude) : (rawCust.caddress?.latitude != null ? String(rawCust.caddress.latitude) : ''),
      longitude: rawCust.address?.longitude != null ? String(rawCust.address.longitude) : (rawCust.caddress?.longitude != null ? String(rawCust.caddress.longitude) : ''),
    },
    cphoto: getNormalizedImageUrl(rawCust.cphoto, ''),
    cvehiclePhoto: getNormalizedImageUrl(rawCust.cvehiclePhoto, ''),
    cpropertyPhoto: getNormalizedImageUrl(rawCust.cpropertyPhoto, ''),
    ccontacts: Array.isArray(rawCust.ccontacts) && rawCust.ccontacts.length > 0
      ? rawCust.ccontacts
      : Array.isArray(rawCust.contacts) && rawCust.contacts.filter((c: any) => c.contact_type === 'customer').length > 0
      ? rawCust.contacts.filter((c: any) => c.contact_type === 'customer')
      : [{ type: 'mobile', number: '', contact_type: 'customer' }],
    aadhar_id: rawCust.aadhar_id || '',
    other_govt_id_type: rawCust.other_govt_id_type || 'other',
    other_govt_id_number: rawCust.other_govt_id_number || '',
    profession: rawCust.profession || '',
    work_office_address: rawCust.work_office_address || '',
    work_office_phone: rawCust.work_office_phone || '',
    current_vehicle_id: rawCust.current_vehicle_id || rawCust.vehicle_id || '',
    kyc_documents: rawCust.kyc_documents || apiData.kyc_documents || [],
  };

  // 2. Normalize Guardian
  let guardian: GuardianDetails | null = null;
  if (rawGuard && (rawGuard.id || rawGuard.gname || rawGuard.gfname_value || rawGuard.gfname?.value)) {
    guardian = {
      id: rawGuard.id || '',
      customer_hplno: rawGuard.customer_hplno || customer.hplno || '',
      gname: rawGuard.gname || '',
      gfname: {
        unit: rawGuard.gfname?.unit || rawGuard.gfname_unit || 'S/O',
        value: rawGuard.gfname?.value || rawGuard.gfname_value || '',
      },
      gaddress: {
        house_no: rawGuard.address?.house_no || rawGuard.gaddress?.house_no || rawGuard.g_house_no || '',
        street: rawGuard.address?.street || rawGuard.gaddress?.street || rawGuard.g_street || '',
        street_name: rawGuard.address?.street_name || rawGuard.gaddress?.street_name || rawGuard.g_street_name || '',
        village: rawGuard.address?.village || rawGuard.gaddress?.village || rawGuard.g_village || '',
        land_mark: rawGuard.address?.land_mark || rawGuard.gaddress?.land_mark || rawGuard.g_land_mark || '',
        address: rawGuard.address?.address || rawGuard.gaddress?.address || rawGuard.g_address || '',
        city: rawGuard.address?.city || rawGuard.gaddress?.city || rawGuard.g_city || '',
        district: rawGuard.address?.district || rawGuard.gaddress?.district || rawGuard.g_district || '',
        state: rawGuard.address?.state || rawGuard.gaddress?.state || rawGuard.g_state || '',
        pincode: rawGuard.address?.pincode || rawGuard.gaddress?.pincode || rawGuard.g_pincode || '',
        location: rawGuard.address?.location || rawGuard.gaddress?.location || rawGuard.g_location || '',
        latitude: rawGuard.address?.latitude != null ? String(rawGuard.address.latitude) : (rawGuard.gaddress?.latitude != null ? String(rawGuard.gaddress.latitude) : (rawGuard.g_latitude != null ? String(rawGuard.g_latitude) : '')),
        longitude: rawGuard.address?.longitude != null ? String(rawGuard.address.longitude) : (rawGuard.gaddress?.longitude != null ? String(rawGuard.gaddress.longitude) : (rawGuard.g_longitude != null ? String(rawGuard.g_longitude) : '')),
      },
      gphoto: getNormalizedImageUrl(rawGuard.gphoto, ''),
      gpropertyPhoto: getNormalizedImageUrl(rawGuard.gpropertyPhoto, ''),
      gcontacts: Array.isArray(rawGuard.gcontacts) && rawGuard.gcontacts.length > 0
        ? rawGuard.gcontacts
        : Array.isArray(rawGuard.contacts) && rawGuard.contacts.filter((c: any) => c.contact_type === 'guardian').length > 0
        ? rawGuard.contacts.filter((c: any) => c.contact_type === 'guardian')
        : [{ type: 'mobile', number: '', contact_type: 'guardian' }],
      aadhar_id: rawGuard.aadhar_id || '',
      other_govt_id_type: rawGuard.other_govt_id_type || 'pan_card',
      other_govt_id_number: rawGuard.other_govt_id_number || '',
      profession: rawGuard.profession || '',
      work_office_address: rawGuard.work_office_address || '',
      work_office_phone: rawGuard.work_office_phone || rawGuard.guardian_phone || '',
      current_vehicle_id: rawGuard.current_vehicle_id || '',
      remarks: rawGuard.remarks || '',
      kyc_documents: rawGuard.kyc_documents || [],
    };
  }

  // 3. Normalize Loan
  const rawHp = rawLoan.hpAmount ?? rawLoan.hp_amount;
  const rawDueAmount = rawLoan.dueAmount ?? rawLoan.due_amount;
  const rawDueMonth = rawLoan.dueMonth ?? rawLoan.due_month;
  const rawInterestRate = rawLoan.interestRate ?? rawLoan.interest_rate;
  const rawPenaltyAmount = rawLoan.penaltyAmount ?? rawLoan.penalty_amount;
  const rawPenaltyDays = rawLoan.penalty_days ?? rawLoan.penaltyDays;

  const loan: LoanDetails = {
    loan_type: rawLoan.loan_type || 'two_wheeler',
    hpAmount: safeNumber(rawHp, 0),
    hpDate: rawLoan.hpDate || (rawLoan.hp_date ? String(rawLoan.hp_date).split('T')[0] : ''),
    due_date: rawLoan.due_date ? String(rawLoan.due_date).split('T')[0] : (rawLoan.dueDate || ''),
    dueMonth: rawDueMonth != null ? String(rawDueMonth) : '',
    interestRate: rawInterestRate != null ? String(rawInterestRate) : '',
    penaltyAmount: safeNumber(rawPenaltyAmount, 0),
    penalty_days: safeNumber(rawPenaltyDays, 5),
    principle_part: safeNumber(rawLoan.principle_part, 0),
    interest_part: safeNumber(rawLoan.interest_part, 0),
    dueAmount: safeNumber(rawDueAmount, 0),
    net_payable: safeNumber(rawLoan.net_payable, 0),
    down_payment: safeNumber(rawLoan.down_payment, 0),
    pay_mode: rawLoan.pay_mode || 'cash',
    net_payment: safeNumber(rawLoan.net_payment, 0),
    pay_mode_1: rawLoan.pay_mode_1 || '',
    pay_mode_1_amount: safeNumber(rawLoan.pay_mode_1_amount, 0),
    hand_loan: safeNumber(rawLoan.hand_loan, 0),
    hand_loan_remarks: rawLoan.hand_loan_remarks || '',
    broker_name: rawLoan.broker_name || '',
    dealer_name: rawLoan.dealer_name || '',
    documentation_charge: safeNumber(rawLoan.documentation_charge, 0),
    broker_commission: safeNumber(rawLoan.broker_commission, 0),
    remarks: rawLoan.remarks || '',
  };

  // 4. Normalize Vehicle
  let vehicle: VehicleDetails | null = null;
  const hasVehicle = rawVeh && (
    rawVeh.id ||
    rawVeh.vehicle_number ||
    rawVeh.vehicleNumber ||
    rawVeh.brand ||
    rawVeh.model_name ||
    rawVeh.modelName
  );

  if (hasVehicle) {
    vehicle = {
      id: rawVeh.id || '',
      vehicle_info_id: rawVeh.vehicle_info_id || rawVeh.vehicleInfoId || '',
      vehicleNumber: rawVeh.vehicleNumber || rawVeh.vehicle_number || '',
      vehicleName: rawVeh.model_name || rawVeh.vehicleName || rawVeh.modelName || rawVeh.vehicle_modal || '',
      brand: rawVeh.brand || '',
      modelName: rawVeh.model_name || rawVeh.modelName || rawVeh.vehicle_modal || rawVeh.vehicleName || '',
      model_name: rawVeh.model_name || rawVeh.modelName || rawVeh.vehicle_modal || rawVeh.vehicleName || '',
      type: rawVeh.type || rawVeh.body_type || '',
      color: rawVeh.color || '',
      variant: rawVeh.variant || '',
      engine_number: rawVeh.engine_number || '',
      chassis_number: rawVeh.chassis_number || '',
      rc_status: rawVeh.rc_status || 'original',
      rc_holder: rawVeh.rc_holder || 'Company',
      deal_type: rawVeh.deal_type || 'finance',
      base_price: safeNumber(rawVeh.base_price, 0),
      selling_price: safeNumber(rawVeh.selling_price, 0),
      emi_from: safeNumber(rawVeh.emi_from, 0),
      fuel_type: rawVeh.fuel_type || 'petrol',
      remarks: rawVeh.remarks || '',
      vehiclePhoto: getNormalizedImageUrl(rawVeh.vehiclePhoto || rawVeh.cvehiclePhoto, ''),
    };
  }

  // 5. Determine dealType
  const dealType: 'finance' | 'consulting' = vehicle?.deal_type === 'consulting'
    ? 'consulting'
    : (vehicle ? 'finance' : (rawCust.deal_type || 'consulting'));

  return {
    customer,
    guardian,
    loan,
    vehicle,
    dealType,
  };
};
