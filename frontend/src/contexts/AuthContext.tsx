import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiClient, { refreshDirectUserSession } from '../api/apiClient';
import {
  AuthMode,
  CONFIRMED_REVOCATION_CODES,
  clearDirectUserLocalStorage,
  clearEphemeralUserSessionStorage,
  clearLicenseLocalStorage,
  getActiveFinanceRaw,
  getActiveUserToken,
  getAuthMode,
  getUserStorage,
  isDirectUserMode,
  isTokenLocallyExpired,
} from '../utils/authStorage';

export type { AuthMode } from '../utils/authStorage';
export { getAuthMode, isDirectUserMode, getUserStorage } from '../utils/authStorage';

// Types
export interface User {
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

export interface Finance {
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
  print_logo_url?: string | null;
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

export interface Statistics {
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

export interface UserLoginResult {
  success: boolean;
  message?: string;
  error_code?: string;
}

export interface UserLogoutResult {
  remoteClosed: boolean;
}

interface LoginResponse {
  success: boolean;
  authMode?: AuthMode;
  user: User;
  finance: Finance;
  finances?: Finance[];
  statistics: Statistics;
  token: string;
  refreshToken?: string;
  timestamp: string;
  sessionId?: string;
  locationSource?: string;
  flagged?: boolean;
  message?: string;
  error_code?: string;
}

interface AuthContextType {
  // State
  authMode: AuthMode | null;
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
  ) => Promise<UserLoginResult>;
  directUserLogin: (
    identifier: string,
    password: string,
    locationPayload?: LocationLoginPayload
  ) => Promise<UserLoginResult>;
  userLogout: (reason?: 'manual' | 'window_close' | 'timeout') => Promise<UserLogoutResult>;

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const cleanupHeaders = () => {
  delete axios.defaults.headers.common['Authorization'];
  delete axios.defaults.headers.common['Owner-Authorization'];
  delete axios.defaults.headers.common['owner-authorization'];
  delete axios.defaults.headers.common['Finance-ID'];
  delete axios.defaults.headers.common['finance-id'];
  delete axios.defaults.headers.common['finance_id'];
};

function resolveCleanDeviceName(): string {
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
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authMode, setAuthMode] = useState<AuthMode | null>(() => getAuthMode());
  const [user, setUser] = useState<User | null>(null);
  const [currentFinance, setCurrentFinance] = useState<Finance | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [financeList, setFinanceList] = useState<Finance[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Refresh finance list (supports Direct User Mode, License User session, and pre-login License token)
  const refreshFinanceList = useCallback(async () => {
    const directMode = isDirectUserMode();
    const activeUserToken = getActiveUserToken();
    const hasAnyToken = Boolean(
      activeUserToken || (!directMode && localStorage.getItem('ownerToken'))
    );
    if (!hasAnyToken) return;

    if (activeUserToken) {
      try {
        const response = await apiClient.get<{ success?: boolean; finances?: Finance[] }>(
          '/finance/allowed-finances'
        );
        if (response.data?.success && Array.isArray(response.data.finances)) {
          setFinanceList(response.data.finances);
          localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
          return;
        }
      } catch (error) {
        console.warn('Could not fetch via /finance/allowed-finances, checking fallback:', error);
      }
    }

    if (!directMode) {
      try {
        const ownerToken = localStorage.getItem('ownerToken');
        if (ownerToken) {
          const response = await apiClient.get<{ success?: boolean; finances?: Finance[] }>(
            '/auth/owner-finances'
          );
          if (response.data?.success && Array.isArray(response.data.finances)) {
            setFinanceList(response.data.finances);
            localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
          }
        }
      } catch (error) {
        console.error('Error refreshing finance list:', error);
      }
    }
  }, []);

  // Listen for cross-context mode switches & confirmed session revocations
  useEffect(() => {
    const handleModeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ authMode?: AuthMode }>).detail;
      const nextMode = detail?.authMode || getAuthMode();
      setAuthMode(nextMode);

      if (nextMode === 'license' && !sessionStorage.getItem('authToken')) {
        cleanupHeaders();
        setUser(null);
        setCurrentFinance(null);
        setStatistics(null);
        setAllUsers([]);
        const cachedFinances = localStorage.getItem('ownerFinances');
        if (cachedFinances) {
          try {
            const parsed = JSON.parse(cachedFinances) as Finance[];
            if (Array.isArray(parsed)) setFinanceList(parsed);
          } catch {
            // ignore
          }
        }
      }
    };

    const handleSessionRevoked = () => {
      cleanupHeaders();
      setUser(null);
      setCurrentFinance(null);
      setStatistics(null);
      setAllUsers([]);
      if (!localStorage.getItem('ownerFinances') && !localStorage.getItem('ownerToken')) {
        setFinanceList([]);
      }
      setAuthMode(getAuthMode());
    };

    window.addEventListener('autofinex:auth-mode-changed', handleModeChanged);
    window.addEventListener('autofinex:session-revoked', handleSessionRevoked);
    return () => {
      window.removeEventListener('autofinex:auth-mode-changed', handleModeChanged);
      window.removeEventListener('autofinex:session-revoked', handleSessionRevoked);
    };
  }, []);

  // Initialize auth state according to active AuthMode
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        cleanupHeaders();

        const resolvedMode = getAuthMode();
        setAuthMode(resolvedMode);

        // Load cached finance list if present
        const storedOwnerFinances = localStorage.getItem('ownerFinances');
        if (storedOwnerFinances) {
          try {
            const parsedFinances = JSON.parse(storedOwnerFinances) as Finance[];
            if (Array.isArray(parsedFinances) && parsedFinances.length > 0) {
              setFinanceList(parsedFinances);
            }
          } catch {
            // ignore parse errors
          }
        }

        // ─── MODE B: Direct User Authentication (Persistent in localStorage) ───
        if (resolvedMode === 'direct_user') {
          clearEphemeralUserSessionStorage();

          let directToken = localStorage.getItem('authToken');
          const storedRefreshToken = localStorage.getItem('refreshToken');
          const storedUserRaw = localStorage.getItem('userData');
          const storedFinanceRaw =
            localStorage.getItem('financeData') || localStorage.getItem('currentFinance');
          const storedStatsRaw = localStorage.getItem('statistics');

          if (!directToken && !storedRefreshToken) {
            clearDirectUserLocalStorage();
            setAuthMode(null);
            setIsLoading(false);
            return;
          }

          let parsedUser: User | null = null;
          let parsedFinance: Finance | null = null;
          let parsedStats: Statistics | null = null;

          try {
            if (storedUserRaw) parsedUser = JSON.parse(storedUserRaw) as User;
          } catch {
            parsedUser = null;
          }
          try {
            if (storedFinanceRaw) parsedFinance = JSON.parse(storedFinanceRaw) as Finance;
          } catch {
            parsedFinance = null;
          }
          try {
            if (storedStatsRaw) parsedStats = JSON.parse(storedStatsRaw) as Statistics;
          } catch {
            parsedStats = null;
          }

          // Hydrate state immediately from localStorage so desktop startup has zero blank delay
          if (parsedUser) {
            setUser(parsedUser);
          }
          if (parsedFinance) {
            setCurrentFinance(parsedFinance);
            if (parsedFinance.id) {
              axios.defaults.headers.common['finance-id'] = String(parsedFinance.id);
            }
          }
          if (parsedStats) {
            setStatistics(parsedStats);
          }
          if (directToken && !isTokenLocallyExpired(directToken)) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${directToken}`;
          }

          // Rotate expired access token if refreshToken is available
          if (isTokenLocallyExpired(directToken) && storedRefreshToken) {
            try {
              const refreshed = await refreshDirectUserSession();
              directToken = refreshed.token;
              if (refreshed.user) {
                parsedUser = refreshed.user as unknown as User;
                setUser(parsedUser);
              }
              if (refreshed.finance) {
                parsedFinance = refreshed.finance as unknown as Finance;
                setCurrentFinance(parsedFinance);
              }
              if (refreshed.statistics) {
                parsedStats = refreshed.statistics as unknown as Statistics;
                setStatistics(parsedStats);
              }
              if (Array.isArray(refreshed.finances)) {
                setFinanceList(refreshed.finances as unknown as Finance[]);
              }
            } catch (refreshErr) {
              const axiosErr = refreshErr as AxiosError<{ error_code?: string }>;
              const errStatus = axiosErr.response?.status;
              const errCode = axiosErr.response?.data?.error_code || '';

              if (errStatus === 401 || errStatus === 403 || CONFIRMED_REVOCATION_CODES.has(errCode)) {
                clearDirectUserLocalStorage();
                cleanupHeaders();
                setUser(null);
                setCurrentFinance(null);
                setStatistics(null);
                setAuthMode(null);
                setIsLoading(false);
                return;
              }
              // Temporary network outage: preserve cached Direct User session
              console.warn('Offline/transient error refreshing Direct User session; keeping cached session.');
              setIsLoading(false);
              return;
            }
          } else if (isTokenLocallyExpired(directToken) && !storedRefreshToken) {
            clearDirectUserLocalStorage();
            cleanupHeaders();
            setUser(null);
            setCurrentFinance(null);
            setStatistics(null);
            setAuthMode(null);
            setIsLoading(false);
            return;
          }

          // Background-refresh finance list & active finance details (preserving session on offline errors)
          await refreshFinanceList();

          const activeFinanceId = parsedUser?.current_finance_id || parsedFinance?.id;
          if (activeFinanceId) {
            try {
              const response = await apiClient.get<{ success?: boolean; finance?: Finance }>(
                `/auth/finance-details/${activeFinanceId}`
              );
              if (response.data?.success && response.data.finance) {
                const updatedFinance = response.data.finance;
                setCurrentFinance(updatedFinance);
                localStorage.setItem('financeData', JSON.stringify(updatedFinance));
                localStorage.setItem('currentFinance', JSON.stringify(updatedFinance));
                axios.defaults.headers.common['finance-id'] = String(updatedFinance.id);
              }
            } catch (error) {
              // Revocation errors are already handled by apiClient's response interceptor;
              // network errors preserve the persistent Direct User session.
              console.warn('Could not refresh finance details during startup:', error);
            }
          }

          return;
        }

        // ─── MODE A: License Authentication (User session strictly ephemeral in sessionStorage) ───
        // Remove any stale user keys from localStorage while keeping ownerToken & ownerFinances intact
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('financeData');
        localStorage.removeItem('currentFinance');
        localStorage.removeItem('statistics');
        localStorage.removeItem('currentFinanceId');
        localStorage.removeItem('lastLogin');

        if (localStorage.getItem('ownerToken') && !localStorage.getItem('authMode')) {
          localStorage.setItem('authMode', 'license');
          setAuthMode('license');
        }

        const sessionToken = sessionStorage.getItem('authToken');
        let userData: User | null = null;
        let financeData: Finance | null = null;
        let statsData: Statistics | null = null;

        if (sessionToken) {
          if (isTokenLocallyExpired(sessionToken, 0)) {
            clearEphemeralUserSessionStorage();
          } else {
            try {
              jwtDecode(sessionToken);
              const storedUser = sessionStorage.getItem('userData');
              if (storedUser) {
                userData = JSON.parse(storedUser) as User;
                axios.defaults.headers.common['Authorization'] = `Bearer ${sessionToken}`;
              }
            } catch (error) {
              console.error('Invalid session user token:', error);
              clearEphemeralUserSessionStorage();
            }
          }
        }

        if (userData) {
          const storedFinance =
            sessionStorage.getItem('financeData') || sessionStorage.getItem('currentFinance');
          if (storedFinance) {
            try {
              financeData = JSON.parse(storedFinance) as Finance;
              if (financeData?.id) {
                axios.defaults.headers.common['finance-id'] = String(financeData.id);
              }
            } catch {
              financeData = null;
            }
          }

          const storedStats = sessionStorage.getItem('statistics');
          if (storedStats) {
            try {
              statsData = JSON.parse(storedStats) as Statistics;
            } catch {
              statsData = null;
            }
          }
        }

        setUser(userData);
        setCurrentFinance(financeData);
        setStatistics(statsData);

        if (userData || localStorage.getItem('ownerToken')) {
          await refreshFinanceList();
        }

        if (userData && userData.current_finance_id) {
          try {
            const response = await apiClient.get<{ success?: boolean; finance?: Finance }>(
              `/auth/finance-details/${userData.current_finance_id}`
            );
            if (response.data?.success && response.data.finance) {
              const updatedFinance = response.data.finance;
              setCurrentFinance(updatedFinance);
              sessionStorage.setItem('financeData', JSON.stringify(updatedFinance));
              sessionStorage.setItem('currentFinance', JSON.stringify(updatedFinance));
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

    void initializeAuth();
  }, [refreshFinanceList]);

  // User logout — terminates user session without deleting License ownerToken in License Mode
  const userLogout = useCallback(
    async (reason: 'manual' | 'window_close' | 'timeout' = 'manual'): Promise<UserLogoutResult> => {
      const directMode = isDirectUserMode();
      let remoteClosed = true;
      try {
        const token = getActiveUserToken();
        if (token) {
          await apiClient.post('/auth/user-logout', { reason });
        }
      } catch (error) {
        remoteClosed = false;
        console.warn('Server user-logout request failed; proceeding with local session cleanup:', error);
      }

      clearEphemeralUserSessionStorage();

      // In Direct User Mode, keep persistent login across window_close, clear on manual/revocation/timeout
      if (directMode && reason !== 'window_close') {
        clearDirectUserLocalStorage();
        setFinanceList([]);
        setAuthMode(null);
      } else if (!directMode) {
        // Ensure no stale user keys remain in localStorage while preserving ownerToken & ownerFinances
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('financeData');
        localStorage.removeItem('currentFinance');
        localStorage.removeItem('statistics');
        localStorage.removeItem('currentFinanceId');
        localStorage.removeItem('lastLogin');
      }

      setUser(null);
      setCurrentFinance(null);
      setStatistics(null);
      setAllUsers([]);

      cleanupHeaders();
      return { remoteClosed };
    },
    []
  );

  // Heartbeat: keep attendance session alive while app is open
  useEffect(() => {
    if (!user) return undefined;

    const intervalId = window.setInterval(async () => {
      const directMode = isDirectUserMode();
      try {
        const token = getActiveUserToken();
        if (!token) return;

        const res = await apiClient.post<{
          active?: boolean;
          revoked?: boolean;
          token?: string;
        }>('/auth/session-heartbeat');

        // If backend renewed an attendance session in Direct User Mode, store updated access JWT
        if (res.data?.token) {
          const storage = getUserStorage();
          storage.setItem('authToken', res.data.token);
          axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        }

        if (res.data && res.data.active === false) {
          if (!directMode || res.data.revoked === true) {
            void userLogout('timeout');
          }
        }
      } catch (err) {
        const axiosErr = err as AxiosError<{ active?: boolean; revoked?: boolean; error_code?: string }>;
        const status = axiosErr.response?.status;
        const errCode = axiosErr.response?.data?.error_code || '';

        if (!directMode) {
          if (status === 401 || axiosErr.response?.data?.active === false) {
            void userLogout('timeout');
          }
        } else if (
          axiosErr.response?.data?.revoked === true ||
          CONFIRMED_REVOCATION_CODES.has(errCode)
        ) {
          void userLogout('timeout');
        }
      }
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [user, userLogout]);

  // Fetch all users for active finance
  const fetchAllUsers = useCallback(async () => {
    if (!currentFinance?.id && !getActiveFinanceRaw()) return;

    try {
      const response = await apiClient.get<{ success?: boolean; users?: User[] }>('/auth/allUsers');
      if (response.data?.success && Array.isArray(response.data.users)) {
        setAllUsers(response.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [currentFinance?.id]);

  // Mode A: License Mode User Login (ephemeral sessionStorage)
  const userLogin = useCallback(
    async (
      identifier: string,
      password: string,
      financeId: string | number,
      locationPayload?: LocationLoginPayload
    ): Promise<UserLoginResult> => {
      try {
        const ownerToken = localStorage.getItem('ownerToken');
        if (!ownerToken) {
          return {
            success: false,
            message: 'License session not found. Please sign in with your License ID first.',
            error_code: 'OWNER_TOKEN_REQUIRED',
          };
        }

        const cleanDeviceName = resolveCleanDeviceName();
        const trimmedIdentifier = identifier.trim();

        const reqPayload = {
          identifier: trimmedIdentifier,
          username: trimmedIdentifier,
          phone_no: trimmedIdentifier,
          password,
          financeId,
          latitude: locationPayload?.latitude ?? null,
          longitude: locationPayload?.longitude ?? null,
          accuracyM: locationPayload?.accuracyM ?? null,
          locationPermission: locationPayload?.locationPermission ?? 'not_asked',
          platform: locationPayload?.platform || (navigator.platform?.slice(0, 50) || 'desktop'),
          deviceName: locationPayload?.deviceName || cleanDeviceName,
        };

        const response = await apiClient.post<LoginResponse>('/auth/user-login', reqPayload);

        if (response.data?.success) {
          const { token, user: userData, finance, statistics: stats } = response.data;

          cleanupHeaders();
          clearDirectUserLocalStorage();
          localStorage.setItem('authMode', 'license');

          sessionStorage.setItem('authToken', token);
          sessionStorage.setItem('userData', JSON.stringify(userData));
          sessionStorage.setItem('financeData', JSON.stringify(finance));
          sessionStorage.setItem('currentFinance', JSON.stringify(finance));
          sessionStorage.setItem('statistics', JSON.stringify(stats));
          sessionStorage.setItem('lastLogin', new Date().toISOString());

          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          axios.defaults.headers.common['finance-id'] = String(finance.id);

          setAuthMode('license');
          setUser(userData);
          setCurrentFinance(finance);
          setStatistics(stats);

          await refreshFinanceList();

          return { success: true };
        }

        return {
          success: false,
          message: response.data?.message || 'Login failed',
          error_code: response.data?.error_code,
        };
      } catch (error) {
        const axiosErr = error as AxiosError<{ message?: string; error?: string; error_code?: string; code?: string }>;
        if (axiosErr.response) {
          return {
            success: false,
            message:
              axiosErr.response.data?.message ||
              axiosErr.response.data?.error ||
              'Login failed',
            error_code:
              axiosErr.response.data?.error_code || axiosErr.response.data?.code,
          };
        }

        return {
          success: false,
          message: 'Network error. Please check your connection.',
          error_code: 'NETWORK_ERROR',
        };
      }
    },
    [refreshFinanceList]
  );

  // Mode B: Direct User Authentication (persistent localStorage with rotating refresh token)
  const directUserLogin = useCallback(
    async (
      identifier: string,
      password: string,
      locationPayload?: LocationLoginPayload
    ): Promise<UserLoginResult> => {
      try {
        const cleanDeviceName = resolveCleanDeviceName();
        const trimmedIdentifier = identifier.trim();

        const reqPayload = {
          identifier: trimmedIdentifier,
          username: trimmedIdentifier,
          phone_no: trimmedIdentifier,
          password,
          latitude: locationPayload?.latitude ?? null,
          longitude: locationPayload?.longitude ?? null,
          accuracyM: locationPayload?.accuracyM ?? null,
          locationPermission: locationPayload?.locationPermission ?? 'not_asked',
          platform: locationPayload?.platform || (navigator.platform?.slice(0, 50) || 'desktop'),
          deviceName: locationPayload?.deviceName || cleanDeviceName,
        };

        const response = await apiClient.post<LoginResponse>(
          '/auth/direct-user-login',
          reqPayload
        );

        if (response.data?.success) {
          const {
            token,
            refreshToken,
            user: userData,
            finance,
            finances,
            statistics: stats,
          } = response.data;

          cleanupHeaders();
          clearEphemeralUserSessionStorage();
          clearLicenseLocalStorage();

          localStorage.setItem('authMode', 'direct_user');
          localStorage.setItem('authToken', token);
          if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken);
          }
          localStorage.setItem('userData', JSON.stringify(userData));
          localStorage.setItem('financeData', JSON.stringify(finance));
          localStorage.setItem('currentFinance', JSON.stringify(finance));
          localStorage.setItem('statistics', JSON.stringify(stats));
          localStorage.setItem('lastLogin', new Date().toISOString());

          if (Array.isArray(finances)) {
            localStorage.setItem('ownerFinances', JSON.stringify(finances));
            setFinanceList(finances);
          }

          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          axios.defaults.headers.common['finance-id'] = String(finance.id);

          setAuthMode('direct_user');
          setUser(userData);
          setCurrentFinance(finance);
          setStatistics(stats);

          window.dispatchEvent(
            new CustomEvent('autofinex:auth-mode-changed', {
              detail: { authMode: 'direct_user' },
            })
          );

          if (!Array.isArray(finances)) {
            await refreshFinanceList();
          }

          return { success: true };
        }

        return {
          success: false,
          message: response.data?.message || 'Login failed',
          error_code: response.data?.error_code,
        };
      } catch (error) {
        const axiosErr = error as AxiosError<{ message?: string; error?: string; error_code?: string; code?: string }>;
        if (axiosErr.response) {
          return {
            success: false,
            message:
              axiosErr.response.data?.message ||
              axiosErr.response.data?.error ||
              'Login failed',
            error_code:
              axiosErr.response.data?.error_code || axiosErr.response.data?.code,
          };
        }

        return {
          success: false,
          message: 'Network error. Please check your connection.',
          error_code: 'NETWORK_ERROR',
        };
      }
    },
    [refreshFinanceList]
  );

  // Refresh finance details using active storage
  const refreshFinanceDetails = useCallback(async () => {
    let activeId: string | number | null = null;
    try {
      const stored = getActiveFinanceRaw();
      if (stored) {
        activeId = (JSON.parse(stored) as { id?: string | number })?.id || null;
      }
    } catch {
      // ignore parse errors
    }

    if (!activeId) {
      activeId = user?.current_finance_id || currentFinance?.id || null;
    }

    if (!activeId) return;

    try {
      const response = await apiClient.get<{ success?: boolean; finance?: Finance }>(
        `/auth/finance-details/${activeId}`
      );

      if (response.data?.success && response.data.finance) {
        const storage = getUserStorage();
        setCurrentFinance(response.data.finance);
        storage.setItem('financeData', JSON.stringify(response.data.finance));
        storage.setItem('currentFinance', JSON.stringify(response.data.finance));
        axios.defaults.headers.common['finance-id'] = String(response.data.finance.id);
      }
    } catch (error) {
      console.error('Error refreshing finance details:', error);
    }
  }, [user?.current_finance_id, currentFinance?.id]);

  // Switch finance preserving active AuthMode storage
  const switchFinance = useCallback(
    async (financeId: string | number): Promise<boolean> => {
      const targetIdStr = String(financeId).trim();
      if (!targetIdStr) return false;

      try {
        const response = await apiClient.post<{
          success?: boolean;
          token?: string;
          finance?: Finance;
          user?: Partial<User>;
        }>('/finance/switch', { financeId: targetIdStr });

        if (response.data?.success) {
          const { token, finance: newFinanceData, user: returnedUser } = response.data;
          const storage = getUserStorage();

          if (token) {
            storage.setItem('authToken', token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          }

          const matched = financeList.find((f) => String(f.id) === targetIdStr);
          const updatedFinance: Finance =
            newFinanceData || matched || { id: targetIdStr, name: `Finance ${targetIdStr}` };

          storage.setItem('financeData', JSON.stringify(updatedFinance));
          storage.setItem('currentFinance', JSON.stringify(updatedFinance));

          axios.defaults.headers.common['finance-id'] = targetIdStr;

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
                created_at: new Date().toISOString(),
              }),
              ...(returnedUser || {}),
              current_finance_id: targetIdStr,
            };
            setUser(updatedUser);
            storage.setItem('userData', JSON.stringify(updatedUser));
          }

          setCurrentFinance(updatedFinance);

          window.dispatchEvent(
            new CustomEvent('autofinex:finance-switched', {
              detail: { financeId: targetIdStr, finance: updatedFinance },
            })
          );

          return true;
        }

        return false;
      } catch (error) {
        console.error('Switch finance error:', error);
        throw error;
      }
    },
    [financeList, user]
  );

  const canUserAccessFinance = useCallback(
    (financeId: string | number): boolean => {
      const targetStr = String(financeId);

      if (financeList.some((f) => String(f.id) === targetStr)) {
        return true;
      }

      if (!user) return false;

      if (user.role === 'owner') {
        return true;
      }

      const allowedStrs = (user.allowed_companies || []).map(String);
      return allowedStrs.includes(targetStr);
    },
    [financeList, user]
  );

  const isWithinLoginTime = useCallback((): boolean => {
    if (!user) return false;

    if (user.role === 'owner' || user.role === 'admin') {
      return true;
    }

    if (!user.login_time_from || !user.login_time_to) {
      return true;
    }

    const now = new Date();
    const istString = now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [curH, curM] = istString.split(':').map(Number);
    const currentMinutes = curH * 60 + curM;

    const [fromHours, fromMinutes] = user.login_time_from.split(':').map(Number);
    const [toHours, toMinutes] = user.login_time_to.split(':').map(Number);

    const fromTotalMinutes = fromHours * 60 + fromMinutes;
    const toTotalMinutes = toHours * 60 + toMinutes;

    if (fromTotalMinutes <= toTotalMinutes) {
      return currentMinutes >= fromTotalMinutes && currentMinutes <= toTotalMinutes;
    }
    return currentMinutes >= fromTotalMinutes || currentMinutes <= toTotalMinutes;
  }, [user]);

  useEffect(() => {
    if (currentFinance?.id && user) {
      void fetchAllUsers();
    }
  }, [currentFinance?.id, user, fetchAllUsers]);

  const value: AuthContextType = {
    authMode,
    user,
    currentFinance,
    statistics,
    isLoading,
    financeList,
    allUsers,
    userLogin,
    directUserLogin,
    userLogout,
    switchFinance,
    refreshFinanceDetails,
    refreshFinanceList,
    fetchAllUsers,
    isUserLoggedIn: Boolean(user),
    isFinanceSelected: Boolean(currentFinance),
    canUserAccessFinance,
    isWithinLoginTime,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
