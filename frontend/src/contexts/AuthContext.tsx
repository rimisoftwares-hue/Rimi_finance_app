import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/apiClient';

// Types
interface User {
  id: string;
  email: string;
  username: string;
  phone_no: string;
  role: 'owner' | 'admin' | 'agent' | 'staff';
  allowed_companies: (string | number)[];
  current_finance_id: string | number;
  login_time_from?: string;
  login_time_to?: string;
  last_login?: string;
  created_at: string;
}

interface Finance {
  id: string | number;
  name: string;
  finance_name?: string;
  phone?: string;
  email?: string;
  phone_numbers?: string[];
  emails?: string[];
  address?: string;
  house_no?: string;
  street?: string;
  street_name?: string;
  village?: string;
  land_mark?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  location?: string;
  since?: string;
  finance_photo?: string;
  logo_url?: string;
  owner_id?: string | number;
  owner_username?: string;
  user_role?: string;
  login_time_from?: string;
  login_time_to?: string;
  last_accessed_at?: string;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
  office_lat?: number | null;
  office_lng?: number | null;
  office_geofence_m?: number;
}

interface Statistics {
  customer_count: number;
  loan_count: number;
  total_collection: number;
}

export interface LocationLoginPayload {
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  locationPermission?: 'granted' | 'declined' | 'blocked' | 'unavailable' | 'not_asked';
  platform?: string;
  deviceName?: string;
}

interface LoginResponse {
  success: boolean;
  user: User;
  finance: Finance;
  statistics: Statistics;
  token: string;
  timestamp: string;
  sessionId?: string;
  locationSource?: string;
  flagged?: boolean;
}

interface AuthContextType {
  // State
  user: User | null;
  currentFinance: Finance | null;
  statistics: Statistics | null;
  isLoading: boolean;
  financeList: Finance[];
  allUsers: User[];

  // Login/Logout
  userLogin: (
    identifier: string,
    password: string,
    financeId: string | number,
    locationPayload?: LocationLoginPayload
  ) => Promise<{
    success: boolean;
    message?: string;
    error_code?: string;
  }>;
  userLogout: (reason?: 'manual' | 'window_close' | 'timeout') => Promise<void> | void;

  // Finance Management
  switchFinance: (financeId: string | number) => Promise<boolean>;
  refreshFinanceDetails: () => Promise<void>;
  refreshFinanceList: () => Promise<void>;

  // User Management
  fetchAllUsers: () => Promise<void>;

  // Status
  isUserLoggedIn: boolean;
  isFinanceSelected: boolean;
  canUserAccessFinance: (financeId: string | number) => boolean;

  // Time Check
  isWithinLoginTime: () => boolean;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Base URL from .env
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
void BASE_URL;

// Clean up headers utility
const cleanupHeaders = () => {
  delete axios.defaults.headers.common['Owner-Authorization'];
  delete axios.defaults.headers.common['owner-authorization'];
  delete axios.defaults.headers.common['Finance-ID'];
  delete axios.defaults.headers.common['finance-id'];
  delete axios.defaults.headers.common['finance_id'];
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [currentFinance, setCurrentFinance] = useState<Finance | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [financeList, setFinanceList] = useState<Finance[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        cleanupHeaders();

        // Load tokens: user token is ephemeral (sessionStorage), owner token is persistent (localStorage)
        const userToken = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
        const ownerToken = localStorage.getItem('ownerToken');
        void ownerToken;

        let userData = null;
        let financeData = null;
        let statsData = null;

        // Load user data if token exists
        if (userToken) {
          try {
            const decoded: any = jwtDecode(userToken);
            void decoded;
            const storedUser = sessionStorage.getItem('userData') || localStorage.getItem('userData');

            if (storedUser) {
              userData = JSON.parse(storedUser);
              sessionStorage.setItem('authToken', userToken);
              sessionStorage.setItem('userData', storedUser);
              axios.defaults.headers.common['Authorization'] = `Bearer ${userToken}`;
            }
          } catch (error) {
            console.error('Invalid user token:', error);
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('userData');
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
          }
        }

        // Load finance data
        const storedFinance =
          sessionStorage.getItem('financeData') ||
          sessionStorage.getItem('currentFinance') ||
          localStorage.getItem('financeData') ||
          localStorage.getItem('currentFinance');
        if (storedFinance) {
          financeData = JSON.parse(storedFinance);
          if (financeData?.id) {
            axios.defaults.headers.common['finance-id'] = String(financeData.id);
          }
          sessionStorage.setItem('financeData', storedFinance);
        }

        // Load statistics
        const storedStats = sessionStorage.getItem('statistics') || localStorage.getItem('statistics');
        if (storedStats) {
          statsData = JSON.parse(storedStats);
          sessionStorage.setItem('statistics', storedStats);
        }

        // Clean user keys from localStorage so user session is strictly ephemeral
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('financeData');
        localStorage.removeItem('statistics');

        // Load cached finance list if present
        const storedOwnerFinances = localStorage.getItem('ownerFinances');
        if (storedOwnerFinances) {
          try {
            const parsedFinances = JSON.parse(storedOwnerFinances);
            if (Array.isArray(parsedFinances) && parsedFinances.length > 0) {
              setFinanceList(parsedFinances);
            }
          } catch { /* ignore */ }
        }

        // Set state synchronously first
        setUser(userData);
        setCurrentFinance(financeData);
        setStatistics(statsData);

        // Load finance list
        await refreshFinanceList();

        // Now refresh finance details if we have user and finance data
        if (userData && userData.current_finance_id) {
          try {
            const response = await apiClient.get(
              `/auth/finance-details/${userData.current_finance_id}`
            );

            if (response.data.success) {
              const updatedFinance = response.data.finance;
              setCurrentFinance(updatedFinance);
              sessionStorage.setItem('financeData', JSON.stringify(updatedFinance));
              axios.defaults.headers.common['finance-id'] = String(updatedFinance.id);
            }
          } catch (error) {
            console.error('Error refreshing finance details:', error);
          }
        }

      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // User logout
  const userLogout = useCallback(async (reason: 'manual' | 'window_close' | 'timeout' = 'manual') => {
    try {
      const token = sessionStorage.getItem('authToken');
      if (token) {
        await apiClient.post('/auth/user-logout', { reason }).catch(() => {});
      }
    } catch { /* ignore network error on logout */ }

    // Clear ephemeral sessionStorage
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userData');
    sessionStorage.removeItem('financeData');
    sessionStorage.removeItem('currentFinance');
    sessionStorage.removeItem('statistics');
    sessionStorage.removeItem('currentFinanceId');
    sessionStorage.removeItem('lastLogin');
    sessionStorage.removeItem('lastKnownLocation');

    // Clear legacy localStorage user keys
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('financeData');
    localStorage.removeItem('currentFinance');
    localStorage.removeItem('statistics');
    localStorage.removeItem('currentFinanceId');
    localStorage.removeItem('lastLogin');

    // Clear state
    setUser(null);
    setCurrentFinance(null);
    setStatistics(null);
    setAllUsers([]);

    // Clean up headers
    cleanupHeaders();

    console.log(`User logged out (reason: ${reason})`);
  }, []);

  // Heartbeat: while user session exists, call /auth/session-heartbeat every 60 s
  useEffect(() => {
    if (!user) return;

    const intervalId = setInterval(async () => {
      try {
        const token = sessionStorage.getItem('authToken');
        if (!token) return;
        const res = await apiClient.post('/auth/session-heartbeat');
        if (res.data && res.data.active === false) {
          userLogout('timeout');
        }
      } catch (err: any) {
        if (err?.response?.status === 401 || err?.response?.data?.active === false) {
          userLogout('timeout');
        }
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [user, userLogout]);

  // Fetch all users
  const fetchAllUsers = useCallback(async () => {
    if (!currentFinance?.id) return;

    try {
      const response = await apiClient.get('/auth/allUsers');

      if (response.data.success) {
        setAllUsers(response.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [currentFinance]);

  // User login with finance details and optional location capture
  const userLogin = useCallback(async (
    identifier: string,
    password: string,
    financeId: string | number,
    locationPayload?: LocationLoginPayload
  ): Promise<{ success: boolean; message?: string; error_code?: string }> => {
    try {
      const ownerToken = localStorage.getItem('ownerToken');
      if (!ownerToken) {
        return {
          success: false,
          message: 'Owner session not found. Please login as owner first.',
          error_code: 'OWNER_TOKEN_REQUIRED'
        };
      }

      const cleanDeviceName = (() => {
        try {
          const ua = navigator.userAgent || '';
          let os = 'Desktop';
          if (ua.includes('Win')) os = 'Windows Desktop';
          else if (ua.includes('Mac')) os = 'macOS Desktop';
          else if (ua.includes('Linux')) os = 'Linux Desktop';
          else if (ua.includes('Android')) os = 'Android';
          else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

          let browser = 'App';
          if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
          else if (ua.includes('Firefox')) browser = 'Firefox';
          else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
          else if (ua.includes('Edg')) browser = 'Edge';

          return `${os} - ${browser}`.slice(0, 150);
        } catch {
          return 'Desktop Device';
        }
      })();

      const reqPayload = {
        identifier,
        username: identifier,
        phone_no: identifier,
        password,
        financeId,
        latitude: locationPayload?.latitude ?? null,
        longitude: locationPayload?.longitude ?? null,
        accuracyM: locationPayload?.accuracyM ?? null,
        locationPermission: locationPayload?.locationPermission ?? 'not_asked',
        platform: locationPayload?.platform || (navigator.platform?.slice(0, 50) || 'desktop'),
        deviceName: locationPayload?.deviceName || cleanDeviceName,
      };

      // Make login request
      const response = await apiClient.post<LoginResponse>(
        '/auth/user-login',
        reqPayload
      );

      if (response.data.success) {
        const { token, user: userData, finance, statistics: stats } = response.data;

        // Clean up headers
        cleanupHeaders();

        // Store data in sessionStorage (ephemeral session)
        sessionStorage.setItem('authToken', token);
        sessionStorage.setItem('userData', JSON.stringify(userData));
        sessionStorage.setItem('financeData', JSON.stringify(finance));
        sessionStorage.setItem('statistics', JSON.stringify(stats));
        sessionStorage.setItem('lastLogin', new Date().toISOString());

        // Clean any leftover user keys from localStorage
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('financeData');
        localStorage.removeItem('statistics');

        // Set state
        setUser(userData);
        setCurrentFinance(finance);
        setStatistics(stats);

        // Set headers
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        axios.defaults.headers.common['finance-id'] = String(finance.id);

        // Fetch all users
        await fetchAllUsers();

        console.log('User login successful:', { identifier, financeId });
        return { success: true };
      }

      return { success: false, message: 'Login failed' };

    } catch (error: any) {
      console.error('Login error:', error);

      if (error.response) {
        return {
          success: false,
          message: error.response.data?.message || error.response.data?.error || 'Login failed',
          error_code: error.response.data?.error_code || error.response.data?.code
        };
      }

      return {
        success: false,
        message: 'Network error. Please check your connection.',
        error_code: 'NETWORK_ERROR'
      };
    }
  }, [fetchAllUsers]);

  // Refresh finance details
  const refreshFinanceDetails = useCallback(async () => {
    let activeId: string | number | null = null;
    try {
      const stored =
        sessionStorage.getItem('financeData') ||
        sessionStorage.getItem('currentFinance') ||
        localStorage.getItem('financeData') ||
        localStorage.getItem('currentFinance');
      if (stored) {
        activeId = JSON.parse(stored)?.id || null;
      }
    } catch { /* ignore parse errors */ }

    // Fallback to React state if storage is empty
    if (!activeId) {
      activeId = user?.current_finance_id || currentFinance?.id || null;
    }

    if (!activeId) return;

    try {
      const response = await apiClient.get(
        `/auth/finance-details/${activeId}`
      );

      if (response.data.success) {
        setCurrentFinance(response.data.finance);
        sessionStorage.setItem('financeData', JSON.stringify(response.data.finance));
        sessionStorage.setItem('currentFinance', JSON.stringify(response.data.finance));
        axios.defaults.headers.common['finance-id'] = String(response.data.finance.id);
      }
    } catch (error) {
      console.error('Error refreshing finance details:', error);
    }
  }, [user, currentFinance]);

  // Refresh finance list (supports both owner and regular users)
  const refreshFinanceList = useCallback(async () => {
    try {
      const response = await apiClient.get('/finance/allowed-finances');
      if (response.data.success && Array.isArray(response.data.finances)) {
        setFinanceList(response.data.finances);
        localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
        return;
      }
    } catch (error) {
      console.warn('Could not fetch via /finance/allowed-finances, checking fallback:', error);
    }

    try {
      const ownerToken = localStorage.getItem('ownerToken');
      if (ownerToken) {
        const response = await apiClient.get('/auth/owner-finances');
        if (response.data.success && Array.isArray(response.data.finances)) {
          setFinanceList(response.data.finances);
          localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
        }
      }
    } catch (error) {
      console.error('Error refreshing finance list:', error);
    }
  }, []);

  // Switch finance
  const switchFinance = useCallback(async (financeId: string | number): Promise<boolean> => {
    const targetIdStr = String(financeId).trim();
    if (!targetIdStr) return false;

    try {
      // 1. Call backend switch endpoint
      const response = await apiClient.post('/finance/switch', { financeId: targetIdStr });

      if (response.data?.success) {
        const { token, finance: newFinanceData, user: returnedUser } = response.data;

        // 2. Update token if renewed by backend
        if (token) {
          sessionStorage.setItem('authToken', token);
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        // 3. Establish active finance data
        const matched = financeList.find(f => String(f.id) === targetIdStr);
        const updatedFinance: Finance = newFinanceData || matched || { id: targetIdStr, name: `Finance ${targetIdStr}` };
        
        // 4. Update sessionStorage FIRST
        sessionStorage.setItem('financeData', JSON.stringify(updatedFinance));
        sessionStorage.setItem('currentFinance', JSON.stringify(updatedFinance));

        // 5. Update request headers
        axios.defaults.headers.common['finance-id'] = targetIdStr;

        // 6. Update user state if user is present or returned
        if (returnedUser || user) {
          const updatedUser: User = {
            ...(user || {
              id: returnedUser?.id || '',
              email: returnedUser?.email || '',
              username: returnedUser?.username || '',
              phone_no: returnedUser?.phone_no || '',
              role: returnedUser?.role || 'agent',
              allowed_companies: returnedUser?.allowed_companies || [targetIdStr],
              current_finance_id: targetIdStr,
              created_at: new Date().toISOString()
            }),
            ...(returnedUser || {}),
            current_finance_id: targetIdStr,
          };
          setUser(updatedUser);
          sessionStorage.setItem('userData', JSON.stringify(updatedUser));
        }

        // 7. Update React state LAST
        setCurrentFinance(updatedFinance);

        // 8. Notify app of finance switch
        window.dispatchEvent(new CustomEvent('autofinex:finance-switched', { detail: { financeId: targetIdStr, finance: updatedFinance } }));

        console.log(`Successfully switched to finance: ${updatedFinance.name || targetIdStr}`);
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('Switch finance error:', error);
      throw error;
    }
  }, [financeList, user]);

  // Check if user can access finance
  const canUserAccessFinance = useCallback((financeId: string | number): boolean => {
    const targetStr = String(financeId);

    // If target is in the validated allowed finances list
    if (financeList.some(f => String(f.id) === targetStr)) {
      return true;
    }

    if (!user) return false;

    // Owners can access all their finances
    if (user.role === 'owner') {
      return true;
    }

    // Other users can only access allowed companies
    const allowedStrs = (user.allowed_companies || []).map(String);
    return allowedStrs.includes(targetStr);
  }, [user, financeList]);

  // Check if current time is within login time restrictions
  const isWithinLoginTime = useCallback((): boolean => {
    if (!user?.login_time_from || !user?.login_time_to) {
      return true; // No restrictions
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Convert to minutes

    const [fromHours, fromMinutes] = user.login_time_from.split(':').map(Number);
    const [toHours, toMinutes] = user.login_time_to.split(':').map(Number);

    const fromTime = fromHours * 60 + fromMinutes;
    const toTime = toHours * 60 + toMinutes;

    return currentTime >= fromTime && currentTime <= toTime;
  }, [user]);

  // Status checks
  const isUserLoggedIn = !!user;
  const isFinanceSelected = !!currentFinance;
  // Context value
  const value: AuthContextType = {
    // State
    user,
    currentFinance,
    statistics,
    isLoading,
    financeList,
    allUsers,

    // Login/Logout
    userLogin,
    userLogout,

    // Finance Management
    switchFinance,
    refreshFinanceDetails,
    refreshFinanceList,

    // User Management
    fetchAllUsers,

    // Status
    isUserLoggedIn,
    isFinanceSelected,
    canUserAccessFinance,

    // Time Check
    isWithinLoginTime
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

// Helper hook for finance operations
export const useFinance = () => {
  const { currentFinance, statistics, refreshFinanceDetails } = useAuth();

  return {
    finance: currentFinance,
    statistics,
    refreshFinanceDetails
  };
};

// Helper hook for user management
export const useUserManagement = () => {
  const { allUsers, fetchAllUsers } = useAuth();

  return {
    users: allUsers,
    refreshUsers: fetchAllUsers
  };
};