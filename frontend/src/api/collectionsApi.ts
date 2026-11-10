// src/api/collectionsApi.ts
import apiClient from './apiClient';
import {
  PendingCollectionsFilterParams,
  PendingCollectionsResponse,
} from '../types/pendingCollections';

/**
 * Fetches pending collections data from the PostgreSQL database via /api/customers/pending-collections
 */
export const fetchPendingCollections = async (
  params?: PendingCollectionsFilterParams
): Promise<PendingCollectionsResponse> => {
  const response = await apiClient.get<PendingCollectionsResponse>(
    '/customers/pending-collections',
    { params }
  );
  return response.data;
};

export interface PrintBatchFinance {
  id: string;
  name: string;
  address: string;
  phone_numbers: string[];
  emails: string[];
  print_logo_url: string | null;
  logo_url: string | null;
}

export interface PrintBatchItem {
  customer: any;
  guardian: any | null;
  loan: any | null;
  vehicle: any | null;
  payments: any[];
}

export interface PrintBatchResponse {
  success: boolean;
  finance: PrintBatchFinance;
  items: PrintBatchItem[];
  missingIds: string[];
}

/**
 * Fetches full customer, guardian, loan, vehicle, and active payments data
 * in a single batched call via POST /api/customers/print-batch (max 200 IDs).
 */
export const fetchPrintBatch = async (
  customerIds: (string | number)[]
): Promise<PrintBatchResponse> => {
  const response = await apiClient.post<PrintBatchResponse>(
    '/customers/print-batch',
    { customerIds: customerIds.map(String) }
  );
  return response.data;
};