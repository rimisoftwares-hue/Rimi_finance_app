export type PrintDocTypeId =
  | 'ledger'
  | 'due_card'
  | 'seizing_letter'
  | 'defaulter_customer'
  | 'defaulter_coapplicant';

export type PrintThemeId = 'classic' | 'modern' | 'premium' | 'compact';

export interface PrintTemplateOptions {
  watermark?: boolean;
  footer?: boolean;
  showLogo?: boolean; // default true
  theme?: PrintThemeId; // default 'classic'
}

export interface PrintDocumentTypeConfig {
  id: PrintDocTypeId;
  name: string;
  description: string;
}

export interface BuiltPrintDocument {
  html: string;
  bodyHtml: string;
  pageCount: number;
  pagesHtml: string[];
}

export interface PrintPhotoObject {
  signed_url?: string | null;
  original_url?: string | null;
}

export type PrintPhotoValue = string | PrintPhotoObject | null | undefined;

export interface PrintContactRecord {
  number?: string | number | null;
}

export interface PrintRelationField {
  unit?: string | null;
  value?: string | null;
}

export interface PrintCustomerRecord {
  cname?: string | null;
  hplno?: string | number | null;
  loanStatus?: string | null;
  brokerName?: string | null;
  cfname?: PrintRelationField | null;
  full_address?: string | null;
  ccontacts?: PrintContactRecord[] | null;
  work_office_address?: string | null;
  work_office_phone?: string | null;
  cphoto?: PrintPhotoValue;
}

export interface PrintGuardianRecord {
  gname?: string | null;
  gfname?: PrintRelationField | null;
  full_address?: string | null;
  gcontacts?: PrintContactRecord[] | null;
  gphoto?: PrintPhotoValue;
}

export interface PrintLoanRecord {
  hpAmount?: number | string | null;
  hp_amount?: number | string | null;
  hpDate?: string | null;
  hp_date?: string | null;
  dueDate?: string | null;
  due_date?: string | null;
  dueMonth?: number | string | null;
  due_month?: number | string | null;
  interestRate?: number | string | null;
  interest_rate?: number | string | null;
  dueAmount?: number | string | null;
  due_amount?: number | string | null;
  net_payable?: number | string | null;
  penaltyAmount?: number | string | null;
  penalty_amount?: number | string | null;
}

export interface PrintVehicleRecord {
  vehicle_number?: string | null;
  model_name?: string | null;
  vehicle_modal?: string | null;
  brand?: string | null;
  chassis_number?: string | null;
  engine_number?: string | null;
  body_type?: string | null;
  type?: string | null;
  color?: string | null;
}

export interface PrintPaymentRecord {
  dueDate?: string | null;
  paymentDate?: string | null;
  billNumber?: string | null;
  amount?: number | string | null;
  penalty?: number | string | null;
}

export interface PrintCustomerData {
  customer?: PrintCustomerRecord | null;
  guardian?: PrintGuardianRecord | null;
  loan?: PrintLoanRecord | null;
  vehicle?: PrintVehicleRecord | null;
  payments?: PrintPaymentRecord[] | null;
}

export interface PrintFinanceData {
  id?: string | number | null;
  name?: string | null;
  address?: string | null;
  phone_numbers?: string[] | string | null;
  phone?: string | null;
  emails?: string[] | string | null;
  email?: string | null;
  print_logo_url?: string | null;
  logo_url?: string | null;
  finance_photo?: string | null;
}

export interface OverdueSummary {
  hpAmount: number;
  dueMonth: number;
  emiAmount: number;
  totalLoan: number;
  totalPaid: number;
  paidEmis: number;
  overdueEmis: number;
  overdueAmount: number;
  totalBalance: number;
  penaltyTotal: number;
}

export type PrintToastFn = (opts: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

export const PRINT_DOCUMENT_TYPES: PrintDocumentTypeConfig[] = [
  {
    id: 'ledger',
    name: 'Ledger Print',
    description: 'Full ledger account statement & EMI history',
  },
  {
    id: 'due_card',
    name: 'Due Card Print',
    description: 'EMI schedule & installment receipt card',
  },
  {
    id: 'seizing_letter',
    name: 'Seizing Letter Print',
    description: 'Final notice for vehicle seizure',
  },
  {
    id: 'defaulter_customer',
    name: 'Defaulter Notice - Customer',
    description: 'Loan defaulter demand notice to customer',
  },
  {
    id: 'defaulter_coapplicant',
    name: 'Defaulter Notice - Co-Applicant',
    description: 'Loan defaulter notice to guarantor / co-applicant',
  },
];

// Draft wording, must be reviewed by legal counsel.
export const DEFAULTER_CUSTOMER_LEGAL_WORDING = {
  openingParagraph:
    'Under instructions from and on behalf of the Management, this formal Demand Notice is issued to inform you that your hypothecation / vehicle loan account referenced below has fallen into default due to non-payment of scheduled monthly installments despite repeated reminders.',
  demandParagraph:
    'You are hereby called upon to clear the entire overdue installment amount along with applicable late payment charges within 7 (seven) days from the date of receipt of this notice.',
  consequenceParagraph:
    'Please take notice that if you fail to settle the overdue balance within the stipulated 7-day period, the Company reserves the right to initiate further recovery proceedings in accordance with the terms and conditions of the Loan / Hypothecation Agreement executed by you, which may include recalling the entire loan facility and taking possession of the hypothecated vehicle at your cost and consequence.',
  ignoreIfPaidNote:
    'Note: If you have already remitted the above overdue installments prior to receiving this notice, please produce the payment receipt at our office so your account records can be updated accordingly.',
};

// Draft wording, must be reviewed by legal counsel.
export const DEFAULTER_COAPPLICANT_LEGAL_WORDING = {
  openingParagraph:
    'This formal notice is addressed to you in your capacity as Guarantor / Co-Applicant for the vehicle loan facility availed by the Principal Borrower named below under the Loan / Hypothecation Agreement executed with our Company.',
  liabilityParagraph:
    'The Principal Borrower has defaulted in making timely payment of the scheduled monthly installments, resulting in the overdue balance detailed below. Pursuant to the terms of the Loan Agreement, the liability of the Guarantor / Co-Applicant is joint, several, and co-extensive with that of the Principal Borrower.',
  demandParagraph:
    'You are hereby requested and called upon to ensure that the overdue installments and applicable late charges are paid and regularized within 7 (seven) days from the receipt of this notice, failing which the Company shall be constrained to initiate recovery proceedings against both the Principal Borrower and the Guarantor / Co-Applicant, including repossession of the hypothecated vehicle, in accordance with the agreement terms.',
  ignoreIfPaidNote:
    'Note: Please contact our office immediately with payment details if the overdue amount has already been settled.',
};

