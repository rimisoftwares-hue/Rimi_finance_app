export interface DemandPeriod {
  from: string | null;
  to: string | null;
}

export interface DemandAmounts {
  demandPrincipal: number;
  demandInterest: number;
  demandTotal: number;
  receivedPrincipal: number;
  receivedInterest: number;
  receivedTotal: number;
  balancePrincipal: number;
  balanceInterest: number;
  balanceTotal: number;
}

export interface DemandSummary extends DemandAmounts {
  totalInstallments: number;
  collectionRate: number;
}

export interface DemandMonthRow extends DemandAmounts {
  monthKey: string;
  month: string;
  loanCount: number;
}

export interface DemandStatementResponse {
  period: DemandPeriod;
  summary: DemandSummary;
  months: DemandMonthRow[];
}

export interface DemandStatementParams {
  from?: string;
  to?: string;
}
