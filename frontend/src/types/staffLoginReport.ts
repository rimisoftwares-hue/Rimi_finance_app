/**
 * staffLoginReport.ts
 *
 * TypeScript definitions for Staff App Login Report.
 */

export interface StaffLoginTimelineEntry {
  id: string;
  loginAt?: string;
  login: string;
  logout: string;
  durationSeconds: number;
  duration: string;
  reason: 'manual' | 'window_close' | 'timeout' | 'active' | 'no_logout' | string;
  device: string | null;
  ip: string | null;
}

export interface StaffLoginReportItem {
  groupKey: string;
  userId: string;
  date: string; // YYYY-MM-DD
  staffName: string;
  staffCode: string;
  role: 'owner' | 'admin' | 'agent' | 'staff' | string;
  financeName?: string; // Only present for verified owners
  latestLoginAt: string;
  totalDurationSeconds: number;
  sessionCount: number;
  hasActiveSession: boolean;
  avgDistanceKm: number | null;
  primaryPlatform: string | null;
  primaryDevice: string | null;
  latestIp: string | null;
  latestLat: number | null;
  latestLng: number | null;
  latestLocation: string | null;
  timeline: StaffLoginTimelineEntry[];
}

export interface StaffLoginReportKpis {
  staffDays: number;
  totalSessions: number;
  totalHours: number;
  avgDistanceKm: number | null;
  activeSessions: number;
}

export interface StaffLoginReportColumnsAvailable {
  coordinates: boolean;
  officeDistance: boolean;
  logoutReason: boolean;
}

export interface StaffLoginReportResponse {
  success: boolean;
  data: StaffLoginReportItem[];
  total: number;
  kpis: StaffLoginReportKpis;
  columnsAvailable: StaffLoginReportColumnsAvailable;
  error?: string;
}

export interface StaffLoginReportParams {
  dateFrom?: string;
  dateTo?: string;
  role?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
