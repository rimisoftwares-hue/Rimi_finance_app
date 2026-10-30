// src/api/kycApi.ts
import apiClient from './apiClient';
import { KycPendingFilterParams, KycPendingResponse } from '../types/kycPending';

/**
 * Fetches real KYC pending records for customers and staff/agents
 * with multi-field filtering, pagination, aggregates, and dynamic options.
 */
export async function fetchKycPending(params: KycPendingFilterParams = {}): Promise<KycPendingResponse> {
  const cleanParams: Record<string, any> = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'All' && value !== 'all') {
      cleanParams[key] = value;
    }
  });

  const response = await apiClient.get<KycPendingResponse>('/customers/kyc-pending', {
    params: cleanParams,
  });

  return response.data;
}
