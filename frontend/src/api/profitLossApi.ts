// frontend/src/api/profitLossApi.ts
import apiClient from './apiClient';
import type { ProfitLossData, ProfitLossParams } from '../types/profitLoss';

export async function fetchProfitLoss(
  params?: ProfitLossParams,
  signal?: AbortSignal
): Promise<ProfitLossData> {
  const res = await apiClient.get('/reports/pnl', {
    params,
    signal,
  });
  return res.data?.data;
}

