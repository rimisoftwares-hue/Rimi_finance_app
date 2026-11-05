/**
 * staffLoginReportApi.ts
 *
 * API helper for Staff Login Report.
 */

import apiClient from './apiClient';
import {
  StaffLoginReportParams,
  StaffLoginReportResponse,
} from '../types/staffLoginReport';

/**
 * Fetches staff login report with filters, server-side KPIs, and session timelines.
 * Note: apiClient automatically handles base URL (/api) and authorization headers.
 */
export const fetchStaffLoginReport = async (
  params?: StaffLoginReportParams,
  signal?: AbortSignal
): Promise<StaffLoginReportResponse> => {
  const response = await apiClient.get<StaffLoginReportResponse>(
    '/agents/login-report',
    { params, signal }
  );
  return response.data;
};

