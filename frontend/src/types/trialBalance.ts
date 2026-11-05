// frontend/src/types/trialBalance.ts

export interface TrialBalanceLedger {
  id: string;
  name: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceGroup {
  id: string;
  name: string;
  nature: string;
  gDebit: number;
  gCredit: number;
  ledgers: TrialBalanceLedger[];
}

export interface TrialBalanceData {
  from: string;
  to: string;
  isBalanced: boolean;
  difference: number;
  totalDebit: number;
  totalCredit: number;
  groups: TrialBalanceGroup[];
}

export interface TrialBalanceParams {
  from?: string;
  to?: string;
  financial_year?: string;
}

