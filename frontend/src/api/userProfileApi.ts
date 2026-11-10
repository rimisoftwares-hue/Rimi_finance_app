// src/api/userProfileApi.ts
import apiClient from './apiClient';

export interface ProfileSection {
  id: string;
  name: string;
  username: string;
  role: 'Owner' | 'Admin' | 'Staff' | 'Agent' | string;
  rawRole: 'owner' | 'admin' | 'staff' | 'agent' | string;
  status: 'Active' | 'Inactive';
  isOnline: boolean;
  email: string;
  phone: string;
  address: string;
  staffCode: string;
  joiningDate: string;
  experience: string;
  qualification: string;
  financeCompany: string;
  lastLogin: string | null;
  lastPasswordChange: string | null;
  photo: string | null;
}

export interface CollectionTrendPoint {
  monthKey: string;
  month: string;
  amount: number;
  collected?: number;
}

export interface PerformanceMonthlyPoint {
  monthKey: string;
  month: string;
  rate: number;
  score?: number;
}

export interface PerformanceSection {
  totalCustomers: number;
  totalCollections: number;
  monthlyPerformance: number;
  assignedLoans: number;
  recoveryRate: number;
  collectionTrend: CollectionTrendPoint[];
  performanceMonthly: PerformanceMonthlyPoint[];
}

export interface ActivityLogItem {
  date: string;
  day: string;
  login?: string;
  logout?: string;
  duration?: string;
  loginAt?: string | null;
  firstLogin: string | null;
  lastLogout: string | null;
  isActiveNow: boolean;
  durationMinutes: number | null;
  device: string | null;
  ip: string | null;
  sessions: number;
}

export interface AssignedCustomerItem {
  id: string;
  hplno: string;
  name: string;
  loanAmount: number;
  status: 'Active' | 'Overdue' | 'Closed';
}

export interface AssignedDataSection {
  customerCount: number;
  loanCount: number;
  areaCount: number;
  hasMore: boolean;
  assignedAreas: string[];
  assignedCustomers: AssignedCustomerItem[];
}

export interface UserProfileOverviewData {
  profile: ProfileSection;
  performance: PerformanceSection;
  activityLog: ActivityLogItem[];
  assignedData: AssignedDataSection;
}

export interface UserProfileOverviewResponse extends UserProfileOverviewData {
  success: boolean;
  data?: UserProfileOverviewData;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
  lastPasswordChange: string;
}

/**
 * Fetches the logged-in user's own profile overview scoped to the active finance.
 */
export async function fetchUserProfileOverview(
  signal?: AbortSignal
): Promise<UserProfileOverviewData> {
  const response = await apiClient.get<UserProfileOverviewResponse>(
    '/user/profile-overview',
    { signal }
  );
  const body = response.data;
  if (!body?.success) {
    throw new Error('Failed to load profile overview');
  }
  if (body.profile && body.performance && body.activityLog && body.assignedData) {
    return {
      profile: body.profile,
      performance: body.performance,
      activityLog: body.activityLog,
      assignedData: body.assignedData,
    };
  }
  if (body.data) {
    return body.data;
  }
  throw new Error('Invalid profile overview payload');
}

/**
 * Changes the logged-in principal's password after verifying currentPassword.
 */
export async function changePassword(
  payload: ChangePasswordPayload
): Promise<ChangePasswordResponse> {
  const response = await apiClient.post<ChangePasswordResponse>(
    '/auth/change-password',
    payload
  );
  return response.data;
}
