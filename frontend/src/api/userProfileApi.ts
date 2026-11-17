// src/api/userProfileApi.ts
import axios from 'axios';
import apiClient from './apiClient';
import { getUserStorage, isDirectUserMode } from '../utils/authStorage';

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
  authMode?: 'license' | 'direct_user';
  token?: string;
  refreshToken?: string;
  ownerToken?: string;
}

export interface FetchUserProfileOverviewOptions {
  signal?: AbortSignal;
  expectedUserId?: string;
  financeId?: string | number | null;
}

/**
 * Fetches the logged-in user's own profile overview scoped to the active finance.
 */
export async function fetchUserProfileOverview(
  signalOrOptions?: AbortSignal | FetchUserProfileOverviewOptions
): Promise<UserProfileOverviewData> {
  const isAbortSignal =
    Boolean(signalOrOptions) &&
    typeof signalOrOptions === 'object' &&
    'aborted' in (signalOrOptions as AbortSignal);

  const signal = isAbortSignal
    ? (signalOrOptions as AbortSignal)
    : (signalOrOptions as FetchUserProfileOverviewOptions | undefined)?.signal;
  const expectedUserId = !isAbortSignal
    ? (signalOrOptions as FetchUserProfileOverviewOptions | undefined)?.expectedUserId
    : undefined;
  const financeId = !isAbortSignal
    ? (signalOrOptions as FetchUserProfileOverviewOptions | undefined)?.financeId
    : undefined;

  const headers: Record<string, string> = {};
  if (financeId !== undefined && financeId !== null && String(financeId).trim() !== '') {
    headers['finance-id'] = String(financeId).trim();
  }

  const response = await apiClient.get<UserProfileOverviewResponse>(
    '/user/profile-overview',
    {
      signal,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    }
  );
  const body = response.data;
  if (!body?.success) {
    throw new Error('Failed to load profile overview');
  }

  let resolved: UserProfileOverviewData | null = null;
  if (body.profile && body.performance && body.activityLog && body.assignedData) {
    resolved = {
      profile: body.profile,
      performance: body.performance,
      activityLog: body.activityLog,
      assignedData: body.assignedData,
    };
  } else if (body.data) {
    resolved = body.data;
  }

  if (!resolved) {
    throw new Error('Invalid profile overview payload');
  }

  if (expectedUserId && String(resolved.profile.id) !== String(expectedUserId)) {
    throw new Error('Profile identity mismatch: loaded profile does not match the signed-in user.');
  }

  return resolved;
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
  const data = response.data;
  if (data?.success) {
    if (data.token) {
      const storage = getUserStorage();
      storage.setItem('authToken', data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    }
    if (data.refreshToken && (data.authMode === 'direct_user' || isDirectUserMode())) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    if (data.ownerToken && localStorage.getItem('ownerToken')) {
      localStorage.setItem('ownerToken', data.ownerToken);
    }
  }
  return data;
}
