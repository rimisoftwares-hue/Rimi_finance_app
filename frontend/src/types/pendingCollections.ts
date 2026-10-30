export interface PendingCollectionRecord {
  id: number | string;
  customerId: number | string;
  loanId: number | string;
  vehicleId?: number | string | null;
  loanNo: string;
  hplno: number;
  name: string;
  vehicle: string;
  vehicleName: string;
  vehicleType: string;
  phone: string;
  loanDate: string;
  hpDate: string;
  firstDueDate?: string | null;
  lastPaymentDate?: string | null;
  nextDueDate?: string | null;
  totalEmi: number;
  paidEmi: number;
  pendingEmi: number;
  defaultEmi: number;
  dueProgress: string;
  totalDue: number;
  paid: number;
  pending: number;
  balance: number;
  status: "good" | "action" | "pending" | "close" | string;
  statusLabel: string;
  statusColor: "green" | "yellow" | "red" | "black" | string;
  street: string;
  village: string;
  city: string;
  state: string;
  fullAddress?: string;
  dealType: "Finance" | "Consulting" | string;
  hbAmount: number;
  hpAmount: number;
  defaultAmount: number;
  broker: string;
  interestRate?: number;
  installmentAmount: number;
}

export interface PendingCollectionsFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  hpDate?: string;
  hpDateFrom?: string;
  hpDateTo?: string;
  pendingMin?: number | string;
  pendingMax?: number | string;
  dueDaysMin?: number | string;
  dueDaysMax?: number | string;
  broker?: string;
  vehicleType?: string;
  street?: string;
  village?: string;
  city?: string;
  state?: string;
  statusFilter?: string; // "All" | "Action" | "Close" | "Pending"
  dealType?: string; // "All" | "Consulting" | "Finance"
  hbAmountMin?: number | string;
  hbAmountMax?: number | string;
  defaultAmountMin?: number | string;
  defaultAmountMax?: number | string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  asOfDate?: string;
}

export interface PendingCollectionsPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PendingCollectionsAggregates {
  totalCount: number;
  totalDueSum: number;
  totalPaidSum: number;
  totalPendingSum: number;
  totalBalanceSum: number;
}

export interface PendingCollectionsFilterOptions {
  brokers: string[];
  streets: string[];
  villages: string[];
  cities: string[];
}

export interface PendingCollectionsResponse {
  success: boolean;
  data: PendingCollectionRecord[];
  pagination: PendingCollectionsPagination;
  aggregates: PendingCollectionsAggregates;
  filters: PendingCollectionsFilterOptions;
}