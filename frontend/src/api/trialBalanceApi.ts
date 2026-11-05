// frontend/src/api/trialBalanceApi.ts
import apiClient from './apiClient';
import type { TrialBalanceData, TrialBalanceParams } from '../types/trialBalance';

export async function fetchTrialBalance(
  params?: TrialBalanceParams,
  signal?: AbortSignal
): Promise<TrialBalanceData> {
  const res = await apiClient.get('/reports/trial-balance', {
    params,
    signal,
  });
  return res.data?.data;
}

