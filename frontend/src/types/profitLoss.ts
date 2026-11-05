// frontend/src/types/profitLoss.ts

export interface PnLLedgerItem {
  id: string;
  name: string;
  group: string;
  isDirect: boolean;
  amount: number;
}

export interface ProfitLossData {
  from: string;
  to: string;
  expenses: PnLLedgerItem[];
  incomes: PnLLedgerItem[];
  totalExpense: number;
  totalIncome: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
  isProfit: boolean;
}

export interface ProfitLossParams {
  from?: string;
  to?: string;
  financial_year?: string;
}

