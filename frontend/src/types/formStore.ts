import { create } from 'zustand';

export interface Addresses {
  house_no: string;
  street: string;
  street_name: string;
  village: string;
  land_mark: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  location: string;
  latitude?: string;
  longitude?: string;
}

export interface CustomerContact {
  contact_type: 'customer' | 'guardian';
  type: 'mobile' | 'landline' | 'work';
  number: string;
}


export type PhotoField = File | string | { signed_url?: string; original_url?: string } | null;

export interface KycDocumentMeta {
  id: string;
  entity_type: 'customer' | 'guardian' | 'co_applicant' | 'new_customer' | 'finance' | 'user';
  entity_id: string;
  document_type: string;
  side: 'front' | 'back' | 'single';
  file_name?: string | null;
  file_path: string;
  file_size?: number | null;
  mime_type?: string | null;
  uploaded_by?: string | null;
  uploaded_by_type: 'staff' | 'customer_app';
  uploaded_at?: string;
  is_current: boolean;
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  remarks?: string | null;
  signed_url?: string | null;
}

export interface CustomerDetails {
  id?: string;
  hplno: string;
  cname: string;
  loanStatus: 'active' | 'close' | 'seized';
  brokerName: string;
  cphoto: PhotoField;
  cvehiclePhoto: PhotoField;
  cpropertyPhoto: PhotoField;
  ccontacts: CustomerContact[];
  cfname: {
    value: string;
    unit: 'S/O' | 'W/O' | 'D/O' | 'H/O' | 'M/O' | 'F/O';
  };
  aadhar_id: string;
  other_govt_id_type: 'pan_card' | 'voter_id' | 'driving_license' | 'other';
  other_govt_id_number: string;
  profession: string;
  work_office_address: string;
  work_office_phone: string;
  current_vehicle_id: string;
  caddress: Addresses;
  kyc_documents?: KycDocumentMeta[];
}

export interface VehicleDetails {
  id: string;
  vehicle_info_id: string;
  vehicleNumber: string;
  vehicleName: string;
  modelName: string;
  color: string;
  type: string;
  selling_price: number;
  engine_number: string;
  rc_holder: 'Company' | 'customer' | 'third_party' | 'pending';
  rc_status: 'original' | 'duplicate' | 'not_available';
  deal_type: 'finance' | 'consulting';
  brand: string;
  chassis_number: string;
  base_price: number;
  emi_from: number;
  model_name: string;
  fuel_type: 'petrol' | 'diesel' | 'electric' | 'cng' | 'hybrid';
  remarks: string;
  variant: string;
  vehiclePhoto?: PhotoField;
  isNewVehicle?: boolean;
  /** Year of manufacture (vehicle_detail.vehicle_modal). */
  vehicle_modal?: string;
  insurance_expiry_date?: string;
  frontImage?: File;
  sideImage?: File;
}

export interface LoanDetails {
  loan_type: string;
  hpAmount: number;
  hpDate: string;
  due_date: string;
  dueMonth: string | number;
  interestRate: string | number;
  penaltyAmount: number;
  penalty_days: number;
  principle_part: number;
  interest_part: number;
  dueAmount: number;
  net_payable: number;
  down_payment: number;
  pay_mode: 'cash' | 'online' | 'bank' | 'upi' | 'cheque' | 'other';
  net_payment: number;
  pay_mode_1: 'cash' | 'online' | 'bank' | 'upi' | 'cheque' | 'other';
  pay_mode_1_amount: number;
  hand_loan: number;
  hand_loan_remarks: string;
  broker_name: string;
  dealer_name: string;
  documentation_charge: number;
  broker_commission: number;
  remarks: string;
}

export interface GuardianDetails {
  id?: string;
  customer_hplno: string;
  gname: string;
  gphoto: PhotoField;
  gpropertyPhoto: PhotoField;
  gcontacts: CustomerContact[];
  gfname: {
    value: string;
    unit: 'S/O' | 'H/O' | 'W/O' | 'D/O' | 'M/O' | 'F/O';
  };
  aadhar_id: string;
  other_govt_id_type: 'pan_card' | 'voter_id' | 'driving_license' | 'other';
  other_govt_id_number: string;
  profession: string;
  work_office_address: string;
  work_office_phone: string;
  current_vehicle_id: string;
  remarks: string;
  gaddress: Addresses;
  kyc_documents?: KycDocumentMeta[];
}

export interface FormState {
  currentStep: number;
  completedSteps: number[];
  customer: CustomerDetails;
  vehicle: VehicleDetails;
  loan: LoanDetails;
  guardian: GuardianDetails;
  setCurrentStep: (step: number) => void;
  markStepCompleted: (step: number) => void;
  updateCustomer: (data: Partial<CustomerDetails>) => void;
  updateVehicle: (data: Partial<VehicleDetails>) => void;
  updateLoan: (data: Partial<LoanDetails>) => void;
  updateGuardian: (data: Partial<GuardianDetails>) => void;
  resetForm: () => void;
}

const initialCustomer: CustomerDetails = {
  hplno: '',
  cname: '',
  loanStatus: 'active',
  brokerName: '',
  cphoto: null,
  cvehiclePhoto: null,
  cpropertyPhoto: null,
  ccontacts: [{ contact_type: 'customer', type: 'mobile', number: '' }],
  cfname: { value: '', unit: 'S/O' },
  aadhar_id: '',
  other_govt_id_type: 'other',
  other_govt_id_number: '',
  profession: '',
  work_office_address: '',
  work_office_phone: '',
  current_vehicle_id: '',
  caddress: {
    house_no: '',
    street: '',
    street_name: '',
    village: '',
    land_mark: '',
    address: '',
    city: '',
    district: '',
    state: '',
    pincode: '',
    location: '',
    latitude: '',
    longitude: ''
  }
};

const initialVehicle: VehicleDetails = {
  id : '',
  vehicle_info_id:'',
  vehicleNumber: '',
  vehicleName: '',
  modelName: '',
  color: '',
  type: '',
  selling_price: 0,
  engine_number:'',
  chassis_number: '',
  base_price: 0,
  emi_from: 0,
  rc_holder:'Company',
  rc_status:'original',
  brand:'',
  model_name:'',
  fuel_type:'petrol',
  deal_type:'consulting',
  remarks:'',
  variant:'',
  vehiclePhoto: null,
  isNewVehicle: false,
  vehicle_modal: '',
  insurance_expiry_date: ''
};

const initialLoan: LoanDetails = {
  loan_type: '',
  hpAmount: 0,
  hpDate: '',
  due_date: '',
  dueMonth: '',
  interestRate: '',
  penaltyAmount: 0,
  penalty_days : 5,
  principle_part: 0,
  interest_part: 0,
  dueAmount: 0,
  net_payable : 0,
  down_payment: 0,
  pay_mode: 'cash',
  net_payment: 0,
  pay_mode_1: 'online',
  pay_mode_1_amount: 0,
  hand_loan: 0,
  hand_loan_remarks: '',
  broker_name: '',
  dealer_name: '',
  documentation_charge: 0,
  broker_commission: 0,
  remarks: ''
};

const initialGuardian: GuardianDetails = {
  customer_hplno: '',
  gname: '',
  gphoto: null,
  gpropertyPhoto: null,
  gcontacts: [{ contact_type: 'guardian', type: 'mobile', number: '' }],
  gfname: { value: '', unit: 'S/O' },
  aadhar_id: '',
  other_govt_id_type: 'pan_card',
  other_govt_id_number: '',
  profession: '',
  work_office_address: '',
  work_office_phone: '',
  current_vehicle_id: '',
  remarks: '',
  gaddress: {
    house_no: '',
    street: '',
    street_name: '',
    village: '',
    land_mark: '',
    address: '',
    city: '',
    district: '',
    state: '',
    pincode: '',
    location: '',
    latitude: '',
    longitude: ''
  }
};

/** Initial (empty) form values, used e.g. by the OCR apply policy to detect untouched fields. */
export const initialFormValues = {
  customer: initialCustomer,
  vehicle: initialVehicle,
  loan: initialLoan,
  guardian: initialGuardian,
};

export const useFormStore = create<FormState>((set) => ({
  currentStep: 1,
  completedSteps: [],
  customer: initialCustomer,
  vehicle: initialVehicle,
  loan: initialLoan,
  guardian: initialGuardian,

  setCurrentStep: (step) => set({ currentStep: step }),

  markStepCompleted: (step) =>
    set((state) => ({
      completedSteps: state.completedSteps.includes(step)
        ? state.completedSteps
        : [...state.completedSteps, step],
    })),

  updateCustomer: (data) =>
    set((state) => ({
      customer: { ...state.customer, ...data },
    })),

  updateVehicle: (data) =>
    set((state) => ({
      vehicle: { ...state.vehicle, ...data },
    })),

  updateLoan: (data) =>
    set((state) => ({
      loan: { ...state.loan, ...data },
    })),

  updateGuardian: (data) =>
    set((state) => ({
      guardian: { ...state.guardian, ...data },
    })),

  resetForm: () =>
    set({
      currentStep: 1,
      completedSteps: [],
      customer: initialCustomer,
      vehicle: initialVehicle,
      loan: initialLoan,
      guardian: initialGuardian,
    }),
}));