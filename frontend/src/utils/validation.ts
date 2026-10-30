/**
 * Shared validation utilities for AutoFinex forms.
 */
import type { CustomerDetails, GuardianDetails, LoanDetails, VehicleDetails } from '../types/formStore';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
}

/**
 * Validates a standard Indian contact/mobile number (10 digits).
 * Handles country-code prefixes (+91, 91, 0) consistently without counting towards the 10 digits.
 * Rejects alphabetic characters, invalid symbols, fewer than 10 digits, and more than 10 digits.
 */
export const validateIndianPhoneNumber = (
  value: string | undefined | null,
  isOptional: boolean = false
): ValidationResult => {
  if (!value || !value.trim()) {
    if (isOptional) {
      return { isValid: true, cleanValue: '' };
    }
    return { isValid: false, error: 'Contact number is required', cleanValue: '' };
  }

  const raw = value.trim();

  // Reject alphabetic characters or unexpected punctuation
  if (/[a-zA-Z]/.test(raw) || /[^\d\s+\-()]/.test(raw)) {
    return {
      isValid: false,
      error: 'Contact number cannot contain letters or invalid characters',
      cleanValue: ''
    };
  }

  // Remove leading country code +91 or leading 0
  let str = raw.replace(/^\+91[\s\-]*/, '').replace(/^0/, '');
  let digits = str.replace(/\D/g, '');

  // If 12 digits starting with 91, strip country code
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  if (digits.length < 10) {
    return {
      isValid: false,
      error: 'Contact number must contain at least 10 digits',
      cleanValue: digits
    };
  }

  if (digits.length > 10) {
    return {
      isValid: false,
      error: 'Contact number must not exceed 10 digits',
      cleanValue: digits
    };
  }

  return { isValid: true, cleanValue: digits };
};

/**
 * Validates a required text field ensuring it is not empty or whitespace-only.
 */
export const validateRequired = (
  value: string | undefined | null,
  fieldName: string = 'Field'
): ValidationResult => {
  if (!value || !value.trim()) {
    return { isValid: false, error: `${fieldName} is required`, cleanValue: '' };
  }
  return { isValid: true, cleanValue: value.trim() };
};

/**
 * Validates that at least one of street name or village is provided and non-whitespace.
 * Both are not required simultaneously.
 */
export const validateStreetOrVillage = (
  streetName: string | undefined | null,
  village: string | undefined | null
): { isValid: boolean; streetError?: string; villageError?: string } => {
  const hasStreet = Boolean(streetName && streetName.trim());
  const hasVillage = Boolean(village && village.trim());

  if (!hasStreet && !hasVillage) {
    const errorMsg = 'Either Street Name or Village is required';
    return {
      isValid: false,
      streetError: errorMsg,
      villageError: errorMsg
    };
  }

  return { isValid: true };
};

/**
 * Cleans a UUID value. Returns trimmed string if valid UUID, or null otherwise.
 */
export const cleanUuid = (val: any): string | null => {
  if (!val) return null;
  const str = String(val).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str) ? str.toLowerCase() : null;
};

/**
 * Body type mapping for automatic vehicle type auto-population.
 */
export const bodyTypeMap: Record<string, string> = {
  bike: 'two_wheeler',
  motorcycle: 'two_wheeler',
  scooter: 'two_wheeler',
  moped: 'two_wheeler',
  two_wheeler: 'two_wheeler',
  'two wheeler': 'two_wheeler',
  car: 'four_wheeler',
  sedan: 'four_wheeler',
  hatchback: 'four_wheeler',
  suv: 'four_wheeler',
  muv: 'four_wheeler',
  coupe: 'four_wheeler',
  convertible: 'four_wheeler',
  four_wheeler: 'four_wheeler',
  'four wheeler': 'four_wheeler',
  auto: 'three_wheeler',
  rickshaw: 'three_wheeler',
  'auto rickshaw': 'three_wheeler',
  three_wheeler: 'three_wheeler',
  'three wheeler': 'three_wheeler',
  truck: 'heavy_vehicle',
  bus: 'heavy_vehicle',
  heavy: 'heavy_vehicle',
  heavy_vehicle: 'heavy_vehicle',
  'heavy vehicle': 'heavy_vehicle',
  commercial: 'commercial',
  pickup: 'commercial',
  'commercial vehicle': 'commercial',
};

/**
 * Validates Customer Details (Step 1).
 * Requirements:
 * 1. Customer Name (required, non-whitespace).
 * 2. Customer Relation (unit & value required).
 * 3. At least one Contact Number (10 digits).
 * 4. Address: Either Street Name or Village is required.
 */
export const validateCustomerStep = (customer: CustomerDetails): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!customer.hplno?.trim()) {
    errors.hplno = 'HPL number is required';
  }
  if (!customer.cname?.trim()) {
    errors.cname = 'Customer name is required';
    errors['customer.cname'] = 'Customer name is required';
  }
  if (!customer.cfname?.value?.trim()) {
    errors['cfname.value'] = 'Customer relation name is required';
    errors.cfname_value = 'Customer relation name is required';
  }
  if (!customer.cfname?.unit?.trim()) {
    errors['cfname.unit'] = 'Customer relation unit is required';
    errors.cfname_unit = 'Customer relation unit is required';
  }
  if (!customer.loanStatus) {
    errors.loanStatus = 'Loan status is required';
  }
  if (customer.aadhar_id && !/^\d{12}$/.test(customer.aadhar_id.trim())) {
    errors.aadhar_id = 'Aadhar must be 12 digits';
  }

  // Address validation: Either Street Name or Village is required
  const addrRes = validateStreetOrVillage(customer.caddress?.street_name, customer.caddress?.village);
  if (!addrRes.isValid) {
    errors['caddress.street_name'] = addrRes.streetError!;
    errors.street_name = addrRes.streetError!;
    errors['caddress.village'] = addrRes.villageError!;
    errors.village = addrRes.villageError!;
  }

  // Contact validation: At least one valid 10-digit number is required
  const contacts = customer.ccontacts || [];
  let validContactCount = 0;
  contacts.forEach((contact, index) => {
    const raw = contact.number?.trim();
    if (raw) {
      const res = validateIndianPhoneNumber(raw, false);
      if (!res.isValid) {
        errors[`ccontacts.${index}`] = res.error || 'Invalid phone number';
        errors[`contacts.${index}`] = res.error || 'Invalid phone number';
      } else {
        validContactCount++;
      }
    }
  });

  if (validContactCount === 0) {
    if (!errors['contacts.0']) {
      errors['ccontacts.0'] = 'At least one valid 10-digit contact number is required';
      errors['contacts.0'] = 'At least one valid 10-digit contact number is required';
    }
    errors.contacts = 'At least one valid contact number is required';
  }

  return errors;
};

/**
 * Validates Guardian Details (Step 3).
 * Requirements:
 * 1. Guardian Name (required, non-whitespace).
 * 2. Guardian Relation (required).
 * 3. At least one valid Guardian Contact Number (10 digits).
 * 4. Guardian Street Name (mandatory).
 */
export const validateGuardianStep = (guardian: GuardianDetails): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!guardian.gname?.trim()) {
    errors.gname = 'Guardian name is required';
    errors['guardian.gname'] = 'Guardian name is required';
  }
  if (!guardian.gfname?.value?.trim()) {
    errors['gfname.value'] = 'Guardian relation name is required';
    errors.gfname_value = 'Guardian relation name is required';
  }
  if (!guardian.gfname?.unit?.trim()) {
    errors['gfname.unit'] = 'Guardian relation unit is required';
    errors.gfname_unit = 'Guardian relation unit is required';
  }
  if (guardian.aadhar_id && !/^\d{12}$/.test(guardian.aadhar_id.trim())) {
    errors.aadhar_id = 'Aadhar must be 12 digits';
  }

  // Guardian Street Name is mandatory
  if (!guardian.gaddress?.street_name?.trim()) {
    errors['gaddress.street_name'] = 'Guardian street name is required';
    errors['guardian.street_name'] = 'Guardian street name is required';
    errors.street_name = 'Guardian street name is required';
  }

  // Contact validation: At least one valid guardian contact number is mandatory
  const contacts = guardian.gcontacts || [];
  let validContactCount = 0;
  contacts.forEach((contact, index) => {
    const raw = contact.number?.trim();
    if (raw) {
      const res = validateIndianPhoneNumber(raw, false);
      if (!res.isValid) {
        errors[`gcontacts.${index}`] = res.error || 'Invalid phone number';
        errors[`guardian.contacts.${index}`] = res.error || 'Invalid phone number';
        errors[`contacts.${index}`] = res.error || 'Invalid phone number';
      } else {
        validContactCount++;
      }
    }
  });

  if (validContactCount === 0) {
    if (!errors['guardian.contacts.0']) {
      errors['gcontacts.0'] = 'At least one valid 10-digit guardian contact number is required';
      errors['guardian.contacts.0'] = 'At least one valid 10-digit guardian contact number is required';
      errors['contacts.0'] = 'At least one valid 10-digit guardian contact number is required';
    }
    errors['guardian.contacts'] = 'At least one valid guardian contact number is required';
    errors.gcontacts = 'At least one valid guardian contact number is required';
  }

  return errors;
};

/**
 * Validates Vehicle & Loan Details (Step 2).
 * Requirements:
 * 1. Vehicle Number is mandatory.
 * 2. Vehicle Brand is mandatory.
 * 3. Vehicle Name / Model is required.
 * 4. Loan Type is required.
 * 5. Penalty is NOT mandatory.
 */
export const validateVehicleLoanStep2 = (
  vehicle: VehicleDetails,
  loan: LoanDetails,
  isFinance: boolean = true
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (isFinance) {
    if (!vehicle.vehicleNumber?.trim()) {
      errors['vehicle.vehicleNumber'] = 'Vehicle number is required';
      errors.vehicleNumber = 'Vehicle number is required';
    }
    if (!vehicle.brand?.trim()) {
      errors['vehicle.brand'] = 'Vehicle brand is required';
      errors.brand = 'Vehicle brand is required';
    }
    const vName = vehicle.vehicleName || vehicle.model_name || vehicle.modelName;
    if (!vName?.trim()) {
      errors['vehicle.vehicleName'] = 'Vehicle name is required';
      errors.vehicleName = 'Vehicle name is required';
    }
    if (!vehicle.type?.trim()) {
      errors['vehicle.type'] = 'Vehicle type is required';
      errors.type = 'Vehicle type is required';
    }
  }

  if (!loan.loan_type) {
    errors['loan.loan_type'] = 'Loan type is required';
    errors.loan_type = 'Loan type is required';
  }
  if (!loan.hpAmount || Number(loan.hpAmount) <= 0) {
    errors['loan.hpAmount'] = 'HP amount is required';
    errors.hpAmount = 'HP amount is required';
  }
  if (!loan.dueMonth || !String(loan.dueMonth).trim()) {
    errors['loan.dueMonth'] = 'Due month is required';
    errors.dueMonth = 'Due month is required';
  }
  if (!loan.hpDate) {
    errors['loan.hpDate'] = 'HP date is required';
    errors.hpDate = 'HP date is required';
  }
  if (loan.interestRate === undefined || loan.interestRate === null || !String(loan.interestRate).trim()) {
    errors['loan.interestRate'] = 'Interest rate is required';
    errors.interestRate = 'Interest rate is required';
  }
  if (!loan.dueAmount || Number(loan.dueAmount) <= 0) {
    errors['loan.dueAmount'] = 'Due amount is required';
    errors.dueAmount = 'Due amount is required';
  }

  // NOTE: Penalty amount and penalty days are deliberately NOT validated as mandatory.

  return errors;
};
