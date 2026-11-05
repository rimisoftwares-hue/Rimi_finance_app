// frontend/src/api/daybookApi.ts
import apiClient from './apiClient';
import type {
  DayBookTransactionsResponse,
  VoucherDetailData,
  LedgerMonthlyResponse,
  MonthVoucherTypesResponse,
  MonthVouchersResponse,
} from '../types/daybook';

export async function fetchDayBookTransactions(
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<DayBookTransactionsResponse> {
  const res = await apiClient.get('/accounting/daybook/transactions', {
    params: { from, to },
    signal,
  });
  return res.data?.data;
}

export async function fetchVoucherDetail(
  voucherNumber: string,
  signal?: AbortSignal
): Promise<VoucherDetailData> {
  const res = await apiClient.get(
    `/accounting/daybook/voucher/${encodeURIComponent(voucherNumber)}`,
    { signal }
  );
  return res.data?.data;
}

export async function fetchLedgerMonthlySummary(
  ledgerName: string,
  financialYear?: string,
  signal?: AbortSignal
): Promise<LedgerMonthlyResponse> {
  const res = await apiClient.get('/accounting/daybook/ledger-monthly', {
    params: { ledgerName, financialYear },
    signal,
  });
  return res.data?.data;
}

export async function fetchMonthVoucherTypes(
  ledgerName: string,
  monthKey: string,
  signal?: AbortSignal
): Promise<MonthVoucherTypesResponse> {
  const res = await apiClient.get('/accounting/daybook/month-voucher-types', {
    params: { ledgerName, monthKey },
    signal,
  });
  return res.data?.data;
}

export async function fetchMonthVouchersRegister(
  ledgerName: string,
  monthKey: string,
  typeCode: string,
  signal?: AbortSignal
): Promise<MonthVouchersResponse> {
  const res = await apiClient.get('/accounting/daybook/month-vouchers', {
    params: { ledgerName, monthKey, typeCode },
    signal,
  });
  return res.data?.data;
}

