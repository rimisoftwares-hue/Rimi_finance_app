import apiClient from './apiClient';
import type {
  DemandStatementParams,
  DemandStatementResponse,
} from '../types/demand';

/**
 * Fetch the monthly Demand Statement and grand summary for an optional date range.
 * Note: apiClient baseURL already ends with '/api', so the path is '/reports/demand'.
 */
export const fetchDemandStatement = async (
  params?: DemandStatementParams,
  signal?: AbortSignal
): Promise<DemandStatementResponse> => {
  const res = await apiClient.get('/reports/demand', {
    params,
    signal,
  });

  if (!res.data?.success || !res.data?.data) {
    throw new Error(res.data?.message || 'Failed to fetch Demand Statement');
  }

  return res.data.data as DemandStatementResponse;
};
