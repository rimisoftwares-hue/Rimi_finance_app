import apiClient from './apiClient';
import type {
  BusinessReportParams,
  BusinessReportResponse,
} from '../types/business';

/**
 * Fetch the monthly Business & Revenue Report for the caller's finance.
 * Note: apiClient baseURL already ends with '/api', so the path is '/reports/business'.
 */
export const fetchBusinessReport = async (
  params?: BusinessReportParams,
  signal?: AbortSignal
): Promise<BusinessReportResponse> => {
  const cleanParams: Record<string, string> = {};
  if (params?.from && params.from.trim()) {
    cleanParams.from = params.from.trim();
  }
  if (params?.to && params.to.trim()) {
    cleanParams.to = params.to.trim();
  }

  const res = await apiClient.get('/reports/business', {
    params: cleanParams,
    signal,
  });

  if (!res.data?.success || !res.data?.data) {
    throw new Error(res.data?.message || 'Failed to fetch Business & Revenue Report');
  }

  return res.data.data as BusinessReportResponse;
};
