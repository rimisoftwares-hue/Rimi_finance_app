// src/api/terminatedApi.ts
import apiClient from './apiClient';
import {
  TerminatedAccountsFilterParams,
  TerminatedAccountsResponse
} from '../types/terminatedAccounts';

/**
 * Fetches genuine terminated and matured loan account records from the PostgreSQL backend,
 * supporting multi-field filtering, pagination, aggregates, and dynamic options.
 */
export async function fetchTerminatedAccounts(
  params: TerminatedAccountsFilterParams = {}
): Promise<TerminatedAccountsResponse> {
  const cleanParams: Record<string, any> = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'All' && value !== 'all') {
      cleanParams[key] = value;
    }
  });

  const response = await apiClient.get<TerminatedAccountsResponse>('/customers/terminated-accounts', {
    params: cleanParams
  });

  return response.data;
}
