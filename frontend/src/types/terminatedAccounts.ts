// src/types/terminatedAccounts.ts

export interface TerminatedAccountItem {
  id: string;
  customerId: string;
  loanId: string | null;
  customerName: string;
  accountNumber: string;
  hplno: number | null;
  phone: string;
  photoUrl: string | null;
  vehicleRegistration: string;
  vehicleModel: string;
  vehicleDisplay: string;
  brokerName: string;
  contractualFinalDueDate: string | null;
  actualTerminationDate: string | null;
  daysOverdue: number;
  outstandingAmount: number;
  penaltyAmount: number;
  totalPenaltyAccrued: number;
  totalPenaltyPaid: number;
  penaltyRate: number;
  totalDue: number;
  totalPaid: number;
  tenureMonths: number;
  installmentAmount: number;
  terminationStatus: 'Closed' | 'Seized' | 'Cancelled' | 'Matured' | 'Completed' | string;
  terminationReason: string;
  street: string;
  village: string;
  city: string;
  state: string;
}

export interface TerminatedAccountsAggregates {
  totalTerminated: number;
  totalOutstanding: number;
  totalPenalty: number;
  overdueAccounts: number;
}

export interface TerminatedAccountsFilterOptions {
  brokers: string[];
  streets: string[];
  villages: string[];
  cities: string[];
  states: string[];
  statuses: string[];
}

export interface TerminatedAccountsPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface TerminatedAccountsFilterParams {
  search?: string;
  broker?: string;
  street?: string;
  village?: string;
  city?: string;
  state?: string;
  dueMin?: string | number;
  dueMax?: string | number;
  dateFrom?: string;
  dateTo?: string;
  dateType?: 'contractual' | 'actual' | 'any';
  status?: string;
  page?: number;
  limit?: number;
}

export interface TerminatedAccountsResponse {
  success: boolean;
  data: TerminatedAccountItem[];
  pagination: TerminatedAccountsPagination;
  aggregates: TerminatedAccountsAggregates;
  filterOptions: TerminatedAccountsFilterOptions;
  error?: string;
}
