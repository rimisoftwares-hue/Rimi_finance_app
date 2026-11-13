/**
 * riskApi.ts
 * API helpers for the dual-score customer risk system (/api/risk/*).
 *
 *  - creditScore  (30–100, higher = better)  long-term repayment reliability
 *  - dueRiskScore (0–100,  higher = riskier) current monthly delinquency risk
 *
 * distanceFromHome and currentLocation are MOCK values until live GPS is available.
 */

import apiClient from './apiClient';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'warning' | 'high' | 'critical';
export type CreditBand = 'Excellent' | 'Good' | 'Fair' | 'Poor';
export type RiskTypeFilter = 'all' | 'payment' | 'credit' | 'distance';
export type RiskLevelFilter = 'all' | RiskLevel;

export interface RiskPhone {
  number: string;
  /** contact_number_type_enum: mobile | landline | work */
  type: string | null;
  /** contact_entity_type_enum: customer | guardian */
  contactType: string | null;
}

export interface RiskCustomerBase {
  id: string;
  hplno: number | null;
  name: string;
  /** Primary phone (first of allPhones) */
  phone: string | null;
  allPhones: RiskPhone[];
  financeName: string;
  vehicleNumber: string | null;
  vehicleName: string | null;
  vehicleType: string | null;
  /** Live GPS distance (km) when reported; null when GPS not available */
  distanceFromHome: number | null;
  /** null when unassigned */
  assignedAgent: string | null;
  assignedAgentId: string | null;
}

// ─── GET /risk/alerts ─────────────────────────────────────────────────────────

export interface RiskAlertsParams {
  riskType?: RiskTypeFilter;
  riskLevel?: RiskLevelFilter;
  /** 'all' | 'unassigned' | agent UUID */
  agentId?: string;
  search?: string;
}

export interface RiskAlertCustomer extends RiskCustomerBase {
  riskLevel: RiskLevel;
  creditScore: number;
  creditBand: CreditBand;
  dueRiskScore: number;
  overdueDays: number;
  overdueAmount: number;
}

/** Counts always cover the full finance portfolio (filters only affect `customers`). */
export interface RiskAlertsSummary {
  criticalAlerts: number;
  highAlerts: number;
  warnings: number;
  safeCount: number;
  /** critical + high + warnings */
  totalAlerts: number;
}

export interface RiskAgent {
  id: string;
  name: string;
}

export interface RiskAlertsResponse {
  success: boolean;
  summary: RiskAlertsSummary;
  agents: RiskAgent[];
  customers: RiskAlertCustomer[];
}

// ─── GET /risk/customers/:id/deep-view ────────────────────────────────────────

export interface RiskCurrentLocation {
  address: string;
  latitude: number | null;
  longitude: number | null;
  lastSeenHome: string | null;
  isMock: boolean;
}

export interface CustomerLocationHistoryEntry {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceFromHome: number | null;
  timestamp: string;
  isHomeLocation: boolean;
}

export interface DeepViewCustomer extends RiskCustomerBase {
  homeAddress: string | null;
  currentLocation: RiskCurrentLocation;
}

export interface DeepViewLoan {
  loanId: string;
  loanType: string | null;
  hpAmount: number;
  totalLoan: number;
  paidAmount: number;
  pendingAmount: number;
  emiAmount: number;
  dueMonth: number | null;
  installmentsPaid: number;
  interestRateMonthly: number | null;
  interestRateYearly: number | null;
  /** e.g. "2% / month (24% Yearly)" */
  interestLabel: string | null;
  hpDate: string | null;
  nextDueDate: string | null;
  overdueDays: number;
  overdueAmount: number;
  penaltyAmount: number;
}

export type MonthlyPaymentStatus = 'paid' | 'late' | 'partial';

export interface MonthlyPayment {
  /** YYYY-MM */
  monthKey: string;
  /** e.g. "Oct 2026" */
  monthLabel: string;
  totalPaid: number;
  totalPenalty: number;
  paymentCount: number;
  status: MonthlyPaymentStatus;
}

export interface DeepViewRisk {
  creditScore: number;
  creditBand: CreditBand;
  dueRiskScore: number;
  riskLevel: RiskLevel;
  breakdown: {
    dueDelayRisk: number;
    /** Credit vulnerability (0–100) */
    creditScoreRisk: number;
    /** MOCK — derived from mock distance */
    distanceRisk: number;
  };
  metrics: {
    /** 0–1 */
    onTimePaymentRatio: number;
    brokenPromises: number;
    seizureHistory: boolean;
  };
}

export interface CustomerDeepViewResponse {
  success: boolean;
  customer: DeepViewCustomer;
  /** null when the customer has no loan yet */
  loan: DeepViewLoan | null;
  monthlyPayments: MonthlyPayment[];
  risk: DeepViewRisk;
  locationHistory?: CustomerLocationHistoryEntry[];
}

// ─── GET /risk/locator ────────────────────────────────────────────────────────

export interface LocatorCustomer extends RiskAlertCustomer {
  pendingAmount: number;
  hasLiveGps: boolean;
  currentLatitude: number | null;
  currentLongitude: number | null;
  currentAddress: string;
  homeAddress: string | null;
  lastPingAt: string | null;
  area: string | null;
}

export interface LocatorAgent {
  id: string;
  name: string;
  status: 'online' | 'offline';
  isOnline: boolean;
  currentLatitude: number | null;
  currentLongitude: number | null;
  batteryLevel: number | null;
  assignedCount: number;
  lastUpdatedAt: string | null;
}

export interface LocatorActivityItem {
  id: string;
  type: 'move' | 'alert' | 'visit' | 'update';
  message: string;
  timestamp: string | null;
}

export interface LocatorOverviewResponse {
  success: boolean;
  asOfDate: string;
  summary: {
    totalPortfolio: number;
    filteredCount: number;
    gpsReportingCount: number;
    mappableCount: number;
    criticalAlerts: number;
    highAlerts: number;
    warnings: number;
    safeCount: number;
    totalAlerts: number;
    avgDistanceKm: number | null;
    onlineAgentsCount: number;
  };
  riskDistribution: {
    name: string;
    key: RiskLevel;
    value: number;
    pct: number;
    color: string;
  }[];
  topLocations: {
    area: string;
    customers: number;
    pct: number;
  }[];
  agents: LocatorAgent[];
  activityFeed: LocatorActivityItem[];
  customers: LocatorCustomer[];
}

// ─── GET /risk/due-analysis ───────────────────────────────────────────────────

export interface AgingBucket {
  key: 'current' | '1_30' | '31_60' | '61_90' | 'npa';
  label: string;
  count: number;
  /** Outstanding (pending) amount in ₹ */
  amount: number;
  amountLakhs: number;
  overdueAmount: number;
  /** Share of loans (by count), 0–100 */
  percentage: number;
}

export interface DueAnalysisKpis {
  totalLoans: number;
  totalOutstanding: number;
  totalOverdueAmount: number;
  overdueLoans: number;
  npaLoans: number;
  npaAmount: number;
  /** NPA share by loan count, 0–100 */
  npaPercentage: number;
  /** NPA share by outstanding amount, 0–100 */
  npaAmountPercentage: number;
}

export interface DueTrendPoint {
  /** Short month label, e.g. "Oct" */
  month: string;
  monthKey: string;
  asOfDate: string;
  /** NPA % of loans on book at that snapshot */
  npa: number;
  /** Count of overdue loans at that snapshot */
  overdue: number;
  npaCount: number;
  bookSize: number;
}

export interface DueAnalysisResponse {
  success: boolean;
  asOfDate: string;
  kpis: DueAnalysisKpis;
  buckets: AgingBucket[];
  trend: DueTrendPoint[];
}

// ─── GET /risk/credit-check ───────────────────────────────────────────────────

export interface CreditCheckParams {
  aadhar?: string;
  phone?: string;
  customerId?: string;
}

export interface CreditRecommendation {
  eligible: boolean;
  maxSuggestedAmountNote: string;
  reason: string;
}

export interface CreditCheckPastLoan {
  customerId: string;
  hplno: number | null;
  name: string;
  loanId: string;
  loanType: string | null;
  loanStatus: string;
  hpDate: string | null;
  hpAmount: number;
  totalLoan: number;
  paidAmount: number;
  pendingAmount: number;
  overdueDays: number;
  vehicleNumber: string | null;
}

export interface CreditCheckSummary {
  totalLoans: number;
  activeLoans: number;
  closedLoans: number;
  seizedLoans: number;
  totalBorrowed: number;
  totalRepaid: number;
  totalOutstanding: number;
  maxOverdueDays: number;
  totalPayments: number;
  onTimePaymentRatio: number;
  brokenPromises: number;
  seizureHistory: boolean;
}

export interface CreditCheckResponse {
  success: boolean;
  found: boolean;
  isNewCustomer: boolean;
  creditScore: number;
  creditBand: CreditBand;
  recommendation: CreditRecommendation;
  pastLoans: CreditCheckPastLoan[];
  /** Present only when found */
  components?: {
    base: number;
    onTimeBonus: number;
    lateDeduction: number;
    overdueDeduction: number;
    ptpSeizureDeduction: number;
  };
  summary?: CreditCheckSummary;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Portfolio risk summary + filtered alert customers */
export const fetchRiskAlerts = async (
  params?: RiskAlertsParams,
  signal?: AbortSignal
): Promise<RiskAlertsResponse> => {
  const response = await apiClient.get<RiskAlertsResponse>('/risk/alerts', { params, signal });
  return response.data;
};

/** Unified live customer/agent locator, map coords, activity & location analytics */
export const fetchLocatorOverview = async (
  params?: RiskAlertsParams & { riskLevel?: RiskLevelFilter },
  signal?: AbortSignal
): Promise<LocatorOverviewResponse> => {
  const response = await apiClient.get<LocatorOverviewResponse>('/risk/locator', { params, signal });
  return response.data;
};

/** Full risk profile (contacts, loan, monthly payments, scores) for one customer */
export const fetchCustomerDeepView = async (
  customerId: string,
  signal?: AbortSignal
): Promise<CustomerDeepViewResponse> => {
  const response = await apiClient.get<CustomerDeepViewResponse>(
    `/risk/customers/${encodeURIComponent(customerId)}/deep-view`,
    { signal }
  );
  return response.data;
};

/** Aging buckets, KPI totals and 6-month NPA / overdue trend */
export const fetchDueAnalysis = async (signal?: AbortSignal): Promise<DueAnalysisResponse> => {
  const response = await apiClient.get<DueAnalysisResponse>('/risk/due-analysis', { signal });
  return response.data;
};

/** Credit score + lending recommendation by aadhar, phone or customer id */
export const fetchCreditCheck = async (
  params: CreditCheckParams,
  signal?: AbortSignal
): Promise<CreditCheckResponse> => {
  const response = await apiClient.get<CreditCheckResponse>('/risk/credit-check', { params, signal });
  return response.data;
};

/** Extracts a readable error message from an axios error */
export const getRiskErrorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
  const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
};

/** True for real customer ids (UUID) — mock locator customers use numeric ids */
export const isRiskCustomerId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

