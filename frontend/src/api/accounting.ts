import apiClient from './apiClient';

export interface Ledger {
  id: number;
  finance_id: number;
  ledger_name: string;
  alias: string | null;
  alias_regional: string | null;
  group_id: number | null;          // ← set when Under = custom group
  master_group_id: number | null;   // ← set when Under = master/system group
  group_source?: 'system' | 'custom';
  group_name?: string;
  reporting_under?: string | null;
  inactive: number;
  opening_balance: number;
  ob_type: 'Dr' | 'Cr';
  effective_date?: string | null;
  freeze_balance?: number;
  is_active: number;
  is_bank_account: number;
  opening_dr: number;
  opening_cr: number;
  period_dr: number;
  period_cr: number;
  closing_dr: number;
  closing_cr: number;
}

export interface Recentledger {
  id: number;
  finance_id: number;
  ledger_name: string;
  alias: string | null;
  alias_regional: string | null;
  reporting_under: string | null;
  opening_balance: number;
  ob_type: 'Dr' | 'Cr';
  effective_date: string | null;
  freeze_balance: boolean;
  is_active: boolean;
  inactive: boolean;
  is_bank_account: boolean;
  is_system: boolean;
  group: Record<string, any> | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LedgerDetails {
  ledger: Record<string, any>;
  group: Record<string, any> | null;
  balance: Record<string, any> | null;
  mailing: Record<string, any> | null;
  banking: Record<string, any> | null;
  tax: Record<string, any> | null;
  statutory: Record<string, any> | null;
  billwise: Record<string, any> | null;
}

/** Identifies a single "Under" selection unambiguously for create/update payloads. */
export interface UnderSelection {
  under_id: string | number;
  under_source: 'system' | 'custom';
}

export interface LedgerGroup {
  id: number;
  group_code: string;
  group_name: string;
  parent_group_id: number | null;
  nature: 'Assets' | 'Liabilities' | 'Income' | 'Expense';
  sort_order: number;
  is_system: number;
  is_active: number;
  description: string | null;
}

// ─── Acc Ledger Group (acc_ledger_groups table) ───────────────────────────────
export interface AccLedgerGroup {
  id: string | number;
  finance_id: string | number;
  group_name: string;
  alias: string | null;
  alias_lang: Record<string, string> | null;
  parent_group_id?: string | number | null;
  system_parent_id: string | number | null;
  custom_parent_id: string | number | null;
  root_master_id: string | number | null;
  nature: 'Assets' | 'Liabilities' | 'Income' | 'Expenses';
  affects_gross_profit: number | boolean;
  behaves_like_subledger: number | boolean;
  nett_balance_report: 'Debit' | 'Credit' | 'Both';
  used_for_calculation: number | boolean;
  allocation_method: 'By Quantity' | 'By Value' | 'Not Applicable';
  is_system?: boolean;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

/** Unified dropdown item returned by GET /ledger-groups/under-dropdown */
export interface UnderDropdownItem {
  id: string | number;
  group_name: string;
  parent_group_id?: string | number | null;
  parent_name?: string | null;
  system_parent_id?: string | number | null;
  custom_parent_id?: string | number | null;
  nature: 'Assets' | 'Liabilities' | 'Income' | 'Expenses';
  source: 'system' | 'custom';
  affects_gross_profit?: boolean;
  behaves_like_subledger?: boolean;
  nett_balance_report?: 'Debit' | 'Credit' | 'Both';
  used_for_calculation?: boolean;
  allocation_method?: 'By Quantity' | 'By Value' | 'Not Applicable';
  sequence_order?: number;
}

export interface VoucherType {
  id: number;
  type_code: string;
  type_name: string;
  class: string;
  prefix: string;
  numbering_mode: string;
}

export interface LedgerStatement {
  ledger: {
    ledger_name: string;
    ledger_code: string;
    alias_name: string | null;
    opening_balance: number;
    ob_type: string;
    group_name: string;
    nature: string;
  };
  opening: { dr: number; cr: number };
  entries: Array<{
    voucher_date: string;
    voucher_number: string;
    voucher_type: string;
    entry_type: 'Dr' | 'Cr';
    amount: number;
    narration: string | null;
  }>;
}

export interface LedgerSummary {
  totalDr: number;
  totalCr: number;
  openingBalance: number;
  openingType: 'Dr' | 'Cr';
  closingBalance: number;
  closingType: 'Dr' | 'Cr';
}

// Helper: derive financial year (Apr–Mar)
export function getFinancialYear(date?: Date): string {
  const d = date || new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function getCurrentFYRange(): { from: string; to: string } {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const startYear = m >= 4 ? y : y - 1;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

// ─── LEDGER APIs ─────────────────────────────────────────────────────────────

export const getLedgers = (finance_id: string | number, financial_year?: string) =>
  apiClient.get<{ success: boolean; data: Ledger[] }>('/ledger/list', {
    params: { finance_id, financial_year: financial_year || getFinancialYear() }
  });

export const getRecentledgers = () =>
  apiClient.get<{ success: boolean; data: Recentledger[] }>('/ledger/recent-ledgers');

export const getLedgerDetails = (ledgerId: number) =>
  apiClient.get<{ success: boolean; data: LedgerDetails }>(`/ledger/${ledgerId}/details`);

export const getLedgerGroups = (finance_id: number) =>
  apiClient.get<{ success: boolean; data: LedgerGroup[] }>('/ledger/groups', {
    params: { finance_id }
  });

export const createLedgerGroup = (payload: {
  finance_id: number;
  group_name: string;
  parent_group_id?: number | null;
  nature: string;
  description?: string;
  created_by?: number;
}) => apiClient.post<{ success: boolean; id: number }>('/ledger/groups/create', payload);

export const getGroupLedgers = (groupId: number, finance_id: number) =>
  apiClient.get<{ success: boolean; data: { group: LedgerGroup; ledgers: Ledger[] } }>(
    `/ledger/group/${groupId}`,
    { params: { finance_id } }
  );

export const getVoucherTypes = (finance_id: number) =>
  apiClient.get<{ success: boolean; data: VoucherType[] }>('/ledger/voucher-types', {
    params: { finance_id }
  });

export const getLedgerStatement = (ledger_id: number, finance_id: number, from: string, to: string) =>
  apiClient.get<{ success: boolean; data: LedgerStatement }>(`/ledger/${ledger_id}/statement`, {
    params: { finance_id, from, to }
  });

// payload must include exactly one Under selection via { under_id, under_source }
// ('system' → acc_group_master, 'custom' → acc_ledger_groups). The backend
// resolves this into the mutually-exclusive group_id / master_group_id
// columns — never send group_id/master_group_id directly.
export const createLedger = (payload: Record<string, unknown> & UnderSelection) =>
  apiClient.post<{ success: boolean; id: number; message?: string }>('/ledger/create', payload);

export const updateLedger = (id: number, finance_id: number, payload: Record<string, unknown>) =>
  apiClient.put<{ success: boolean }>(`/ledger/update/${id}`, { ...payload, finance_id });

export const deleteLedger = (id: number, finance_id: number) =>
  apiClient.delete<{ success: boolean }>(`/ledger/delete/${id}`, {
    params: { finance_id }
  });

export const multiCreateLedger = (
  finance_id: number,
  ledgers: Array<Record<string, unknown> & UnderSelection>
) => apiClient.post<{ success: boolean; ids: number[]; message?: string }>('/ledger/multi-create', { finance_id, ledgers });

export const getLedgerSummary = (finance_id: number, financial_year?: string) =>
  apiClient.get<{ success: boolean; data: LedgerSummary }>('/ledger/summary', {
    params: { finance_id, financial_year: financial_year || getFinancialYear() }
  });

// ─── ACC LEDGER GROUP APIs (acc_ledger_groups table) ─────────────────────────

/** GET /ledger-groups/list — custom groups for this company */
export const getAccLedgerGroups = () =>
  apiClient.get<{ success: boolean; data: { systemGroups: AccLedgerGroup[]; customGroups: AccLedgerGroup[] } | AccLedgerGroup[] }>('/ledger-groups/list');

/** GET /ledger-groups/under-dropdown — merged system + custom groups for parent picker */
export const getUnderDropdown = () =>
  apiClient.get<{ success: boolean; data: UnderDropdownItem[] }>('/ledger-groups/under-dropdown');

/** POST /ledger-groups/create — create a single custom group */
export const createAccLedgerGroup = (payload: {
  group_name: string;
  alias?: string | null;
  alias_lang?: Record<string, string> | null;
  parent_group_id?: string | number | null;
  system_parent_id?: string | number | null;
  custom_parent_id?: string | number | null;
  nature?: 'Assets' | 'Liabilities' | 'Income' | 'Expenses';
  affects_gross_profit?: boolean;
  behaves_like_subledger?: boolean;
  nett_balance_report?: 'Debit' | 'Credit' | 'Both';
  used_for_calculation?: boolean;
  allocation_method?: 'By Quantity' | 'By Value' | 'Not Applicable';
}) => apiClient.post<{ success: boolean; id: string | number }>('/ledger-groups/create', payload);

/** PUT /ledger-groups/update/:id — update a custom group */
export const updateAccLedgerGroup = (id: string | number, payload: Partial<AccLedgerGroup>) =>
  apiClient.put<{ success: boolean; message?: string }>(`/ledger-groups/update/${id}`, payload);

/** DELETE /ledger-groups/:id — delete a custom group */
export const deleteAccLedgerGroup = (id: string | number) =>
  apiClient.delete<{ success: boolean; message?: string }>(`/ledger-groups/${id}`);

/** POST /ledger-groups/multi-create — create multiple custom groups in bulk */
export const multiCreateAccLedgerGroup = (groups: Array<{
  group_name: string;
  alias?: string | null;
  parent_group_id?: string | number | null;
  system_parent_id?: string | number | null;
  custom_parent_id?: string | number | null;
  nature?: string;
  affects_gross_profit?: boolean;
  behaves_like_subledger?: boolean;
  nett_balance_report?: string;
  used_for_calculation?: boolean;
  allocation_method?: string;
}>) => apiClient.post<{ success: boolean; ids: (string | number)[] }>('/ledger-groups/multi-create', { groups });

/** POST /ledger-groups/multi-update — bulk update custom groups */
export const multiUpdateAccLedgerGroup = (groups: Array<{
  id: string | number;
  group_name: string;
  alias?: string | null;
  parent_group_id?: string | number | null;
  system_parent_id?: string | number | null;
  custom_parent_id?: string | number | null;
  nature?: string;
  affects_gross_profit?: boolean;
  behaves_like_subledger?: boolean;
  nett_balance_report?: string;
  used_for_calculation?: boolean;
  allocation_method?: string;
}>) => apiClient.post<{ success: boolean }>('/ledger-groups/multi-update', { groups });


