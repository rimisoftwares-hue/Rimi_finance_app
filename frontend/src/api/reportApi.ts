// src/api/reportApi.ts
import apiClient from './apiClient';
import { Payment } from '../components/PaymentReport/PaymentTable';

interface PaymentReportResponse {
  summary: {
    totalPayment: number;
    totalPenalty: number;
    grandTotal: number;
  };
  payments: Payment[];
}

/**
 * Fetches payment report data from the server
 */
export const fetchPaymentReport = async (
  type: 'today' | 'custom' | 'week' | 'month' | 'year',
  startDate?: string,
  endDate?: string
): Promise<PaymentReportResponse> => {
  let url = `/payments/report?type=${type}`;
  
  if (type === 'custom' && startDate && endDate) {
    url += `&startDate=${startDate}&endDate=${endDate}`;
  }
  
  // apiClient handles Authorization header and 401 errors globally
  const response = await apiClient.get<PaymentReportResponse>(url);
  return response.data;
};