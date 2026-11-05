// frontend/src/types/balanceSheet.ts

export interface BalanceSheetItem {
  id?: string;
  name: string;
  amount: number;
  drillable?: boolean;
}

export interface BalanceSheetGroup {
  group: string;
  items: BalanceSheetItem[];
}

export interface BalanceSheetDiagnostics {
  invalidNatureLedgersCount: number;
  netMasterOpeningBalance: number;
  openingProfit: number;
  currentPeriodProfit: number;
  unbalancedDifference: number;
}

export interface BalanceSheetData {
  asOfDate: string;
  fyStart: string;
  liabilities: BalanceSheetGroup[];
  assets: BalanceSheetGroup[];
  totalLiabilities: number;
  totalAssets: number;
  difference: number;
  isBalanced: boolean;
  netProfit: number;
  diagnostics?: BalanceSheetDiagnostics;
}

export interface BalanceSheetParams {
  as_of_date?: string;
  financial_year?: string;
}

