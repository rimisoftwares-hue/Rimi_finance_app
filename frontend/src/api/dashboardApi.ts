import apiClient from './apiClient';

export interface KpiTrendBadge {
  value: number;
  up: boolean;
}

export interface HomeDashboardKpiTrends {
  activeLoans: KpiTrendBadge | null;
  totalCustomers: KpiTrendBadge | null;
  unpaidCustomers: KpiTrendBadge | null;
  godownVehicles: KpiTrendBadge | null;
  seizedVehicles: KpiTrendBadge | null;
  cashInHand: KpiTrendBadge | null;
  todayCollection: KpiTrendBadge | null;
  pendingDues: KpiTrendBadge | null;
}

export interface HomeDashboardKpis {
  activeLoans: number;
  totalCustomers: number;
  unpaidCustomers: number;
  godownVehicles: number;
  totalVehicles: number;
  seizedVehicles: number;
  cashInHand: number;
  todayCollection: number;
  pendingDues: number;
  trends?: HomeDashboardKpiTrends;
}

export interface LoanDistributionSlice {
  name: 'Active' | 'Closed' | 'Default' | 'Seized' | string;
  value: number;
  color: string;
}

export interface MonthlyCollectionPoint {
  month: string;
  monthKey: string;
  principal: number;
  interest: number;
  penalty: number;
}

export interface MonthlyOutcomePoint {
  month: string;
  monthKey: string;
  loanDist: number;
  otherExp: number;
}

export interface HomeDashboardQuickInsights {
  highRiskCustomers: number;
  criticalAlerts: number;
  highAlerts: number;
  todaysDueCount: number;
  overdueOver30Days: number;
}

export interface HomeDashboardOverviewResponse {
  success: boolean;
  asOfDate: string;
  kpis: HomeDashboardKpis;
  loanDistribution: LoanDistributionSlice[];
  monthly: {
    collectionTrend: MonthlyCollectionPoint[];
    outcomeTrend: MonthlyOutcomePoint[];
  };
  quickInsights: HomeDashboardQuickInsights;
}

/**
 * Formats an INR amount in compact notation:
 * - |amount| >= 1,00,00,000 (1 Cr) -> `₹X.XX Cr`
 * - |amount| >= 1,00,000 (1 Lakh)  -> `₹X.XX L`
 * - otherwise                      -> `₹X,XXX` (`en-IN`)
 */
export function formatCompactINR(amount: number | null | undefined): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '₹0';

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs >= 1_00_00_000) {
    const cr = (abs / 1_00_00_000).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}₹${cr} Cr`;
  }
  if (abs >= 1_00_000) {
    const lakh = (abs / 1_00_000).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}₹${lakh} L`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

/**
 * Fetches the Home Dashboard overview (`GET /api/dashboard/home-overview`).
 */
export async function fetchHomeDashboardOverview(
  signal?: AbortSignal
): Promise<HomeDashboardOverviewResponse> {
  const res = await apiClient.get<HomeDashboardOverviewResponse>(
    '/dashboard/home-overview',
    { signal }
  );

  if (!res.data?.success) {
    throw new Error(
      (res.data as { error?: string })?.error ||
        'Failed to load Home Dashboard overview'
    );
  }

  return res.data;
}

export interface StaffDashboardKpis {
  totalReceiptsToday: number;
  totalReceiptsTrend: KpiTrendBadge;
  collectedAmount: number;
  collectedAmountTrend: KpiTrendBadge;
  closedLoans: number;
  seizedVehicles: number;
  reloanCount: number;
  reloanCountTrend: KpiTrendBadge;
  todayDues: number;
  unpaidCustomers: number;
  onlinePaymentsMock: string;
}

export interface StaffCallHistoryRecord {
  id: string;
  customerId: string | null;
  customer: string;
  hpl: string;
  type: 'RC' | 'Call';
  vehicle: string;
  vehicleNo: string;
  date: string;
  remarks: string;
  staff: string;
  status: 'Connected' | 'Not Connected' | 'Follow-up';
}

export interface StaffAssignedTaskItem {
  id: string;
  customerId: string;
  customer: string;
  hpl: string;
  hplno: number | null;
  dueAmount: number;
  area: string;
  overdueDays: number;
  riskLevel: 'high' | 'medium' | 'low';
  riskLabel: 'High Risk' | 'Medium Risk' | 'Low Risk';
}

export interface StaffTodayVisitItem {
  id: string;
  customerId: string;
  customer: string;
  hpl: string;
  location: string;
  status: 'Completed' | 'Pending';
}

export interface StaffTodayCollectionItem {
  id: string;
  customerId: string | null;
  customer: string;
  hpl: string;
  hplno: number | null;
  amount: number;
  billNumber: string;
  delayDays: number;
  delayLabel: string;
  delayTone: 'income' | 'pending' | 'expense';
}

export interface StaffDashboardOverviewResponse {
  success: boolean;
  asOfDate: string;
  kpis: StaffDashboardKpis;
  todayCallHistory: StaffCallHistoryRecord[];
  assignedTasks: {
    totalAssigned: number;
    items: StaffAssignedTaskItem[];
  };
  todayVisits: StaffTodayVisitItem[];
  todayCollections: StaffTodayCollectionItem[];
}

/**
 * Fetches the Staff Dashboard overview (`GET /api/dashboard/staff-overview`).
 */
export async function fetchStaffDashboardOverview(
  signal?: AbortSignal
): Promise<StaffDashboardOverviewResponse> {
  const res = await apiClient.get<StaffDashboardOverviewResponse>(
    '/dashboard/staff-overview',
    { signal }
  );

  if (!res.data?.success) {
    throw new Error(
      (res.data as { error?: string })?.error ||
        'Failed to load Staff Dashboard overview'
    );
  }

  return res.data;
}


