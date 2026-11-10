// OCR (AI Scan) types: API envelopes and the sanitized ledger_v1 result.
// Mirrors backend/src/modules/ocr (ocr.routes.js, ocr.sanitizer.js, prompts/ledger_extraction.v1.txt).

import type { LoanType } from '../components/form/LoanTypeToggle';

export type OcrBatchStatus =
  | 'created'
  | 'processing'
  | 'complete'
  | 'needs_review'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type OcrJobStatus =
  | 'created'
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'needs_review'
  | 'failed'
  | 'cancelled';

export interface OcrConfig {
  enabled: boolean;
  directScan?: boolean;
  reason?: string;
  providerReady?: boolean;
  maxImages?: number;
  allowedMime?: string[];
  maxFileBytes?: number;
  imageMaxEdge?: number;
  retentionDays?: number;
  extractPayments?: boolean;
  dailyRemaining?: number;
}

export interface OcrDirectScanResponse {
  loanType: LoanType;
  modelUsed: string;
  fallbackUsed: boolean;
  durationMs: number;
  mergedResult: LedgerV1;
}

export interface OcrCreatedJob {
  jobId: string;
  sequenceNo: number;
  uploadUrl: string;
  contentType: string;
}

export interface OcrCreateBatchResponse {
  batchId: string;
  expiresAt: string;
  jobs: OcrCreatedJob[];
}

export interface OcrJobState {
  jobId: string;
  sequenceNo: number;
  status: OcrJobStatus;
  errorCode: string | null;
  retryCount: number;
}

export interface OcrBatchState {
  batchId: string;
  loanType: LoanType;
  expectedImages: number;
  status: OcrBatchStatus;
  progress?: { percent: number };
  jobs: OcrJobState[];
  mergedResult: LedgerV1 | null;
}

export type VehicleAvailabilityState = 'not_found' | 'available' | 'in_use' | 'unavailable';

export interface VehicleAvailability {
  state: VehicleAvailabilityState;
  vehicleId?: string;
  vehicle?: {
    id: string;
    vehicle_number: string;
    vehicle_modal: string | null;
    color: string | null;
    brand: string | null;
    model_name: string | null;
    type: string | null;
    deal_type: string | null;
    engine_number: string | null;
    chassis_number: string | null;
  };
  conflicts?: Array<'engine_number' | 'chassis_number'>;
}

// ── ledger_v1 (after backend sanitization) ──────────────────────────────────
type N<T> = T | null;

export interface LedgerRelation {
  unit: N<'S/O' | 'W/O' | 'D/O' | 'H/O' | 'M/O' | 'F/O' | string>;
  value: N<string>;
}

export interface LedgerContact {
  contact_type: 'customer' | 'guardian';
  type: 'mobile' | 'landline' | 'work';
  number: N<string>; // cleaned 10-digit mobile, or null when not cleanable
  number_raw: N<string>;
  label: N<string>;
}

export interface LedgerAddress {
  house_no: N<string>;
  street: N<string>;
  street_name: N<string>;
  village: N<string>;
  land_mark: N<string>;
  address: N<string>;
  pincode: N<string>;
  city: N<string>;
  district: N<string>;
  state: N<string>;
  location: null;
  latitude: null;
  longitude: null;
}

export interface LedgerUncertainField {
  field_path: string;
  raw_text: N<string>;
  options: string[];
  reason: N<string>;
}

export interface LedgerV1 {
  form_type_detected: N<string>;
  doc_meta: { company: N<string>; card_no: N<string>; raw_acc_no: N<string>; doc_type: N<string> };
  customer: {
    hplno: N<string>;
    cname: N<string>;
    cfname: LedgerRelation;
    ccontacts: LedgerContact[];
    caddress: LedgerAddress;
    profession: N<string>;
    work_office_phone: N<string>;
    work_office_address: N<string>;
    aadhar_id: N<string>;
    other_govt_id_type: N<string>;
    other_govt_id_number: N<string>;
  };
  vehicle: {
    brand: N<string>;
    vehicleName: N<string>;
    model_name: N<string>;
    manufacture_year: N<string>;
    vehicleNumber: N<string>;
    type: N<string>;
    color: N<string>;
    rc_status: N<string>;
    rc_holder: N<string>;
    engine_number: N<string>;
    chassis_number: N<string>;
    remarks: N<string>;
  };
  loan: {
    loan_type: N<string>;
    pay_mode: N<string>;
    down_payment: N<number>;
    pay_mode_1: N<string>;
    pay_mode_1_amount: N<number>;
    net_payment: N<number>;
    hpAmount: N<number>;
    dueMonth: N<number>;
    hpDate: N<string>;
    due_date: N<string>;
    interestRate: N<number>;
    principle_part: N<number>;
    interest_part: N<number>;
    dueAmount: N<number>;
    raw_due_amount_text: N<string>;
    book_binding_amount: N<number>;
    net_payable: N<number>;
    penaltyAmount: N<number>;
    penalty_days: N<number>;
    hand_loan: N<number>;
    documentation_charge: N<number>;
    hand_loan_remarks: N<string>;
    broker_name: N<string>;
    broker_commission: N<number>;
    dealer_name: N<string>;
    remarks: N<string>;
  };
  guardian: {
    customer_hplno: N<string>;
    gname: N<string>;
    gfname: LedgerRelation;
    gcontacts: LedgerContact[];
    gaddress: LedgerAddress;
    profession: N<string>;
    work_office_phone: N<string>;
    work_office_address: N<string>;
    aadhar_id: N<string>;
    other_govt_id_type: N<string>;
    other_govt_id_number: N<string>;
    remarks: N<string>;
  };
  table_headers: string[];
  payments: unknown[];
  notes: string[];
  ai_predictions_and_options: {
    suggested_vehicle: {
      brand: N<string>;
      vehicleName: N<string>;
      model_name: N<string>;
      manufacture_year: N<string>;
      type: N<string>;
      confidence_note: N<string>;
    };
    name_mismatches: Array<{ field: string; account_heading_name: N<string>; party_name: N<string>; selected_for_form: N<string> }>;
    shifted_field_corrections: Array<{ printed_label: string; written_value: string; mapped_to_field: string }>;
    uncertain_fields: LedgerUncertainField[];
    review_required: true;
  };
}

