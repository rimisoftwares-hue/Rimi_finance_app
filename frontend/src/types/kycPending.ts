// src/types/kycPending.ts

export type KycPendingType = 'Photo' | 'Govt ID' | 'Location';

export interface KycPendingItem {
  id: string;
  entityType: 'Customer' | 'Staff' | 'Agent';
  entityId: string;
  name: string;
  accountNumber: string;
  hplno: number | null;
  phone: string;
  photoUrl: string | null;
  hasPhoto: boolean;
  vehicle: string;
  vehicleName: string;
  vehicleNumber: string;
  hpAmount: number | null;
  brokerName: string;
  street: string;
  streetName: string;
  village: string;
  city: string;
  state: string;
  location: string;
  hasLocation: boolean;
  pendingItems: KycPendingType[];
  primaryPending: KycPendingType | 'None';
  verificationStatus: 'verified' | 'pending' | 'missing' | 'rejected' | 'unverified';
  govtIdNumber: string;
  govtIdType: string;
  isKycPending: boolean;
}

export interface KycPendingPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface KycPendingAggregates {
  totalCount: number;
  photoPendingCount: number;
  govtIdPendingCount: number;
  locationPendingCount: number;
  customerPendingCount: number;
  staffPendingCount: number;
}

export interface KycPendingFilterOptions {
  streets: string[];
  villages: string[];
  cities: string[];
  states: string[];
  brokers: string[];
  entityTypes: string[];
  pendingTypes: string[];
}

export interface KycPendingFilterParams {
  search?: string;
  pendingType?: string;
  street?: string;
  village?: string;
  city?: string;
  state?: string;
  broker?: string;
  entityType?: string;
  page?: number;
  limit?: number;
}

export interface KycPendingResponse {
  success: boolean;
  data: KycPendingItem[];
  pagination: KycPendingPagination;
  aggregates: KycPendingAggregates;
  filterOptions: KycPendingFilterOptions;
  error?: string;
  details?: string;
}
