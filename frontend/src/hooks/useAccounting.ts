// src/hooks/useAccounting.ts
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/accounting';

// ─── Helper function to handle response wrapping ──────────────────────────────
async function fetcher<T>(apiCall: () => Promise<{ data: { success: boolean; data: T } }>): Promise<T> {
  const res = await apiCall();
  if (res.data.success) {
    return res.data.data;
  }
  throw new Error('API returned success: false');
}

// ─── Ledger list ─────────────────────────────────────────────────────────────
export function useLedgers(finance_id?: number, financial_year?: string) {
  return useQuery({
    queryKey: ['ledgers', finance_id, financial_year],
    queryFn: () => fetcher(() => api.getLedgers(finance_id!, financial_year)),
    enabled: !!finance_id,
  });
}

// ─── Ledger groups ───────────────────────────────────────────────────────────
export function useLedgerGroups(finance_id?: number) {
  return useQuery({
    queryKey: ['ledgerGroups', finance_id],
    queryFn: () => fetcher(() => api.getLedgerGroups(finance_id!)),
    enabled: !!finance_id,
  });
}

// ─── Voucher types ───────────────────────────────────────────────────────────
export function useVoucherTypes(finance_id?: number) {
  return useQuery({
    queryKey: ['voucherTypes', finance_id],
    queryFn: () => fetcher(() => api.getVoucherTypes(finance_id!)),
    enabled: !!finance_id,
  });
}

// ─── Voucher list ─────────────────────────────────────────────────────────────
export function useVouchers(
  finance_id?: number,
  filters: { from?: string; to?: string; type_id?: number; status?: string } = {}
) {
  return useQuery({
    queryKey: ['vouchers', finance_id, filters],
    queryFn: () => fetcher(() => api.listVouchers(finance_id!, filters)),
    enabled: !!finance_id,
  });
}

// ─── Ledger statement ────────────────────────────────────────────────────────
export function useLedgerStatement(
  ledger_id?: number,
  finance_id?: number,
  from?: string,
  to?: string
) {
  return useQuery({
    queryKey: ['ledgerStatement', ledger_id, finance_id, from, to],
    queryFn: () => fetcher(() => api.getLedgerStatement(ledger_id!, finance_id!, from!, to!)),
    enabled: !!ledger_id && !!finance_id && !!from && !!to,
  });
}

// ─── Trial Balance ───────────────────────────────────────────────────────────
export function useTrialBalance(finance_id?: number, financial_year?: string) {
  return useQuery({
    queryKey: ['trialBalance', finance_id, financial_year],
    queryFn: () => fetcher(() => api.getTrialBalance(finance_id!, financial_year)),
    enabled: !!finance_id,
  });
}

// ─── Day Book ────────────────────────────────────────────────────────────────
export function useDayBook(finance_id?: number, from?: string, to?: string) {
  return useQuery({
    queryKey: ['dayBook', finance_id, from, to],
    queryFn: () => fetcher(() => api.getDayBook(finance_id!, from!, to!)),
    enabled: !!finance_id && !!from && !!to,
  });
}

// ─── P&L ─────────────────────────────────────────────────────────────────────
export function usePnL(finance_id?: number, financial_year?: string) {
  return useQuery({
    queryKey: ['pnl', finance_id, financial_year],
    queryFn: () => fetcher(() => api.getPnL(finance_id!, financial_year)),
    enabled: !!finance_id,
  });
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────
export function useBalanceSheet(finance_id?: number, financial_year?: string) {
  return useQuery({
    queryKey: ['balanceSheet', finance_id, financial_year],
    queryFn: () => fetcher(() => api.getBalanceSheet(finance_id!, financial_year)),
    enabled: !!finance_id,
  });
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────
export function useCashFlow(finance_id?: number, from?: string, to?: string) {
  return useQuery({
    queryKey: ['cashFlow', finance_id, from, to],
    queryFn: () => fetcher(() => api.getCashFlow(finance_id!, from!, to!)),
    enabled: !!finance_id && !!from && !!to,
  });
}
