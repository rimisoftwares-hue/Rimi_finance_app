export interface MonthlyBusinessRecord {
  id: string;              // "YYYY-MM"
  monthKey?: string;       // "YYYY-MM"
  month: string;           // "Aug 2026"
  fullMonth?: string;      // "August 2026"
  date: string;            // "YYYY-MM-01"
  principal: number;
  interest: number;
  defaultAmt: number;      // penalty collected
  handLoan: number;
  hpCount: number;
  loanAmount: number;      // loan disbursed that month
  docCharge: number;
  totalCollection?: number;
  netIncome?: number;
  netCashFlow?: number;
  isFuture?: boolean;
}

export interface DerivedBusinessMetrics {
  totalCollection: number;
  netIncome: number;
  netCashFlow: number;
}

export interface BusinessTotals extends DerivedBusinessMetrics {
  principal: number;
  interest: number;
  defaultAmt: number;
  handLoan: number;
  hpCount: number;
  loanAmount: number;
  docCharge: number;
}

export interface BusinessReportRange {
  from: string | null;
  to: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface BusinessReportParams {
  from?: string;
  to?: string;
}

export interface BusinessReportResponse {
  range: BusinessReportRange;
  earliestMonth: string;
  currentMonth: string;
  monthKeys: {
    effective: string[];
    default12: string[];
    default6: string[];
  };
  monthsByKey: Record<string, MonthlyBusinessRecord>;
  months: {
    effective: MonthlyBusinessRecord[];
    default12: MonthlyBusinessRecord[];
    default6: MonthlyBusinessRecord[];
  };
  totals: BusinessTotals;
}
