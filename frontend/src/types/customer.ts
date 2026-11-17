// export interface User {
//   id: string;
//   email: string;
//   role: 'owner' | 'agent';
// }

// export interface LoginResponse {
//   success: boolean;
//   user?: User;
//   token?: string;
//   message?: string;
// }

// export interface PasswordResetResponse {
//   success: boolean;
//   error?: string;
//   message?: string;
// }

// export interface ChangePasswordRequest {
//   currentPassword: string;
//   newPassword: string;
// }

// export interface ChangePasswordResponse {
//   success: boolean;
//   message?: string;
// }

// export interface NewUserRequest {
//   email: string;
//   password: string;
//   role: 'owner' | 'agent';
// }

// export interface NewUserResponse {
//   success: boolean;
//   user?: User;
//   message?: string;
// }

// export interface CustomerContact {
//   contact_type : 'customer'|'guardian',
//   type: 'mobile' | 'landline' | 'work';
//   number: string;
// }

// export interface Customer {
//   id: string;
//   hplno: string;
//   cname: string;
//   caddress: string;
//   cphoto?: string;
// }

// export interface CustomerDetails {
//   cname: string;
//   loanStatus : 'active' | 'close';
//   brokerName : string;
//   hplno : string;
//   cphoto: string | File | null;
//   cvehiclePhoto: string | File | null;
//   cpropertyPhoto: string | File | null;
//   ccontacts: CustomerContact[];
//   caddress: string;
//   cfname: {
//     value: string;
//     unit: 's/o' | 'w/o' | 'h/o';
//   }}

// export interface GuardianDetails {
//   gname: string;
//   gphoto: string |File | null;
//   gpropertyPhoto: string |File | null;
//   gaddress: string;
//   gcontacts: CustomerContact[];
//   gfname: {
//     value: string;
//     unit: 's/o' | 'w/o' | 'h/o' | 'c/o';
// }} 

// export interface LoanDetails {
//   hpAmount: number;
//   hpDate: string;
//   dueMonth: number;
//   interestRate: number;
//   dueAmount: number;
//   penaltyAmount : number;
// }

// export interface Payment {
//   id: number;
//   dueDate: string;
//   paymentDate: string;
//   billNumber: string;
//   amount: number;
//   penalty :number;

// }

// export interface VehicleDetails {
//   vehicleNumber: string;
//   modelName: string;
//   type: 'bike' | 'car' | 'document';
//   vehicleName : string,
//   color: string;
// }

// export interface CustomerFormData {
//   customer: CustomerDetails;
//   guardian: GuardianDetails;
//   loan: LoanDetails;
//   vehicle: VehicleDetails;
//   payment : Payment;
// }

// export interface User {
//   id: string;
//   email: string;
//   role: 'owner' | 'agent';
// }

export interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
  role: 'owner' | 'agent' | 'staff' | 'admin';
}


export interface User_new {
  id: string;
  email: string;
  username?: string;
  name?: string;
  role: 'owner' | 'agent' | 'staff' | 'admin';
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface PasswordResetResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message?: string;
}

export interface NewUserRequest {
  email: string;
  password: string;
  role: 'owner' | 'agent';
}

export interface NewUserResponse {
  success: boolean;
  user?: User;
  message?: string;
}

export interface CustomerContact {
  contact_type: 'customer' | 'guardian';
  type: 'mobile' | 'landline' | 'work';
  number: string;
}
export interface Addresses {
  id?: string;
  house_no?: string | null;
  street?: string | null;
  street_name?: string | null;
  village?: string | null;
  land_mark?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  location?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  label?: string | null;
}
export interface NameWithUnit {
  value?: string | null;
  unit?: 'S/O' | 'W/O' | 'D/O' | 'H/O' | 'C/O' | string | null;
}

export interface PhotoUrl {
  signed_url?: string;
  original_url?: string;
}

export interface KycDocument {
  id: string;
  entity_type: 'customer' | 'guardian' | 'vehicle' | 'finance';
  entity_id: string;
  document_type: string;
  side: 'front' | 'back' | 'single';
  file_path: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  verification_status?: 'pending' | 'verified' | 'rejected';
  is_current?: boolean | number;
  uploaded_at?: string;
  signed_url?: string;
  original_url?: string;
}


export interface Customer {
  id: string;
  hplno: string;
  cname: string;
  loanStatus: 'active' | 'close' | 'seized';
  brokerName: string;
  cphoto: string | File | null;
  cvehiclePhoto: string | File | null;
  cpropertyPhoto: string | File | null;
  ccontacts: CustomerContact[];
  cfname: NameWithUnit;
  aadhar_id: string;
  other_govt_id_type: 'pan_card' | 'voter_id' | 'driving_license' | 'other';
  other_govt_id_number: string;
  profession: string;
  work_office_address: string;
  work_office_phone: string;
  current_vehicle_id: string;
  caddress: Addresses;
}


export interface CustomerDetails {
  id: string;
  hplno: string | number;
  cname: string;
  loanStatus: 'active' | 'close' | 'seized' | string;
  loan_status?: string;
  brokerName?: string;
  broker_name?: string;
  cphoto: PhotoUrl;
  cvehiclePhoto: PhotoUrl;
  cpropertyPhoto: PhotoUrl;
  ccontacts: CustomerContact[];
  cfname: NameWithUnit;
  gfname?: NameWithUnit;
  aadhar_id: string;
  other_govt_id_type: 'pan_card' | 'voter_id' | 'driving_license' | 'other';
  other_govt_id_number: string;
  profession: string;
  work_office_address: string;
  work_office_phone: string;
  current_vehicle_id?: string;
  address?: Addresses;
  full_address?: string;
}

export interface GuardianDetails {
  customer_hplno?: string | number;
  gname: string;
  gphoto: PhotoUrl;
  gpropertyPhoto: PhotoUrl;
  gcontacts: CustomerContact[];
  gfname: {
    value: string;
    unit: 'S/O' | 'H/O' | 'W/O' | 'D/O' | string;
  };
  aadhar_id: string;
  other_govt_id_type: 'pan_card' | 'voter_id' | 'driving_license' | 'other';
  other_govt_id_number: string;
  profession: string;
  work_office_address: string;
  work_office_phone: string;
  current_vehicle_id?: string;
  remarks?: string;
  full_address?: string;
  g_address?: string;
  address?: Addresses;
}

export interface LoanDetails {
  loan_type: string;
  hpAmount: number;
  hpDate: string;
  due_date: string;
  dueMonth: string;
  interestRate: string;
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
  // Backend snake_case and alias fields
  hp_amount?: number | string;
  hp_date?: string;
  due_month?: number | string;
  interest_rate?: number | string;
  due_amount?: number | string;
  penalty_amount?: number | string;
  dueDate?: string;
}

export interface Payment {
  id: number | string;
  dueDate: string;
  paymentDate: string | null;
  billNumber: string;
  amount: number;
  principal_amount?: number;
  interest_amount?: number;
  penalty: number;
  // Optional fields from database
  status?: 'paid' | 'partial' | 'pending' | string;
  payment_status?: 'active' | 'cancelled' | string;
  customer_hplno?: string;
  customer_id?: string;
  collected_by: string;
  hand_loan: number;
  hand_loan_remark: string;
  payment_mode: 'cash' | 'online' | 'bank' | 'upi' | 'cheque' | 'other' | string;
  payment_mode_amount?: number;
  payment_mode_1?: 'cash' | 'online' | 'bank' | 'upi' | 'cheque' | 'other' | string;
  payment_mode_1_amount: number;
  remarks: string;
  edited_by?: string;
  edited_at?: string;
  created_at?: string;
  sub_dues?: SubDue[];
}

export interface SubDue {
  id: number | string;
  payment_id: number | string;
  bill_number: string;
  payment_date: string;
  paid_amount: number;
  principal_amount?: number;
  interest_amount?: number;
  payment_mode: string;
  payment_mode_amount: number;
  payment_mode_1: string | null;
  payment_mode_1_amount: number;
  status: 'active' | 'cancelled' | string;
  collected_by: string;
}

export interface PaymentFormData {
  dueDate: string;
  paymentDate: string;
  billNumber: string;
  amount: number;
  principal_amount?: number;
  interest_amount?: number;
  dueAmount?: number;
  last_payment_id?: string | number | null;
  last_due_paid?: number;
  penalty: number;
  collected_by: string;
  payment_mode: string;
  payment_mode_1?: string;
  payment_mode_1_amount: number;
  hand_loan: number;
  hand_loan_remark: string;
  remarks?: string;
}


export interface VehicleDetails {
  id: string;
  finance_id: string;
  vehicle_info_id: string;
  vehicle_number: string;
  vehicle_modal: string;
  chassis_number: string;
  engine_number: string;
  num_owner: number;
  trip_driven: number;
  color: string;
  variant?: string;
  selling_price: number;
  emi_from: number;
  base_price: number;
  final_price: number;
  status: 'available' | 'hosted' | 'sales' | 'seized' | 'sold';
  created_date: string;
  selling_date?: string;
  hosting_info: any;
  monthly_income_data: any;
  deal_type: 'finance' | 'consulting';
  rc_holder: 'Company' | 'customer' | 'third_party' | 'pending';
  rc_status: 'original' | 'duplicate' | 'not_available';
  fc_expriry_date: string;
  insurance_expriry_date: string;
  remarks: string;
  brand: string;
  model_name: string;
  make_year: number;
  fuel_type: 'petrol' | 'diesel' | 'electric' | 'cng' | 'hybrid';
  engine_capacity: string;
  fuel_tank_capacity: string;
  top_speed: string;
  mileage: string;
  body_type?: 'sedan' | 'hatchback' | 'suv' | 'muv' | 'coupe' | 'convertible' | 'scooter' | 'bike';
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: number | string;
  finance_id: number | string;
  customer_id?: string;
  customer_hplno?: number | string;
  type: 'call' | 'rc_book' | string;
  message: string;
  date: string; // YYYY-MM-DD format
  created_by: string;
  created_at?: string;
  updated_at?: string;
}


export interface CustomerFormData {
  customer: CustomerDetails;
  guardian?: GuardianDetails | null;
  loan?: LoanDetails | null;
  vehicle?: VehicleDetails | null;
  payments?: Payment[];
  payment?: Payment;
  kyc_documents?: KycDocument[];
}