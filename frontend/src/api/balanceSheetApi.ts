// frontend/src/api/balanceSheetApi.ts
import apiClient from './apiClient';
import type { BalanceSheetData, BalanceSheetParams } from '../types/balanceSheet';

export async function fetchBalanceSheet(
  params?: BalanceSheetParams,
  signal?: AbortSignal
): Promise<BalanceSheetData> {
  const res = await apiClient.get('/reports/balance-sheet', {
    params,
    signal,
  });
  return res.data?.data;
}

