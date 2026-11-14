// src/api/apiClient.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  CONFIRMED_REVOCATION_CODES,
  clearDirectUserLocalStorage,
  clearEphemeralUserSessionStorage,
  clearLicenseLocalStorage,
  getActiveFinanceRaw,
  isDirectUserMode,
} from '../utils/authStorage';

export const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || `${API_ORIGIN}/api`).replace(/\/+$/, '');
export const BASE = API_BASE;

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export interface RefreshSessionResult {
  token: string;
  refreshToken: string;
  user?: Record<string, unknown>;
  finance?: Record<string, unknown>;
  finances?: Record<string, unknown>[];
  statistics?: Record<string, unknown>;
}

const apiClient = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Single-flight mutex so concurrent expired requests rotate refreshToken exactly once
let activeRefreshPromise: Promise<RefreshSessionResult> | null = null;

export async function refreshDirectUserSession(): Promise<RefreshSessionResult> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  const storedRefreshToken = localStorage.getItem('refreshToken');
  if (!storedRefreshToken) {
    const missingErr = new Error('Refresh token missing') as AxiosError;
    throw missingErr;
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await axios.post(
        `${BASE}/auth/refresh-session`,
        { refreshToken: storedRefreshToken },
        {
          timeout: 20000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.data?.success || !response.data?.token) {
        throw new Error(response.data?.message || 'Failed to refresh session');
      }

      const nextToken = String(response.data.token);
      const nextRefreshToken = String(response.data.refreshToken || storedRefreshToken);

      localStorage.setItem('authMode', 'direct_user');
      localStorage.setItem('authToken', nextToken);
      localStorage.setItem('refreshToken', nextRefreshToken);

      if (response.data.user) {
        localStorage.setItem('userData', JSON.stringify(response.data.user));
      }
      if (response.data.finance) {
        localStorage.setItem('financeData', JSON.stringify(response.data.finance));
        localStorage.setItem('currentFinance', JSON.stringify(response.data.finance));
        const fid = (response.data.finance as { id?: string | number }).id;
        if (fid) {
          axios.defaults.headers.common['finance-id'] = String(fid);
        }
      }
      if (response.data.statistics) {
        localStorage.setItem('statistics', JSON.stringify(response.data.statistics));
      }
      if (Array.isArray(response.data.finances)) {
        localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
      }

      axios.defaults.headers.common['Authorization'] = `Bearer ${nextToken}`;

      return {
        token: nextToken,
        refreshToken: nextRefreshToken,
        user: response.data.user,
        finance: response.data.finance,
        finances: response.data.finances,
        statistics: response.data.statistics,
      };
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

function redirectToHashSafely(targetHash: '#/owner-login' | '#/user-login'): void {
  if (typeof window === 'undefined') return;
  const currentHash = window.location.hash || '';
  if (!currentHash.startsWith(targetHash)) {
    window.location.hash = targetHash;
  }
}

// ─── Request Interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    const directMode = isDirectUserMode();

    if (directMode) {
      const directToken = localStorage.getItem('authToken');
      if (directToken) {
        config.headers['Authorization'] = `Bearer ${directToken}`;
      }
      delete config.headers['owner-authorization'];
      delete config.headers['Owner-Authorization'];
    } else {
      const sessionUserToken = sessionStorage.getItem('authToken');
      if (sessionUserToken) {
        config.headers['Authorization'] = `Bearer ${sessionUserToken}`;
      }

      const ownerToken = localStorage.getItem('ownerToken');
      if (ownerToken) {
        config.headers['owner-authorization'] = `Bearer ${ownerToken}`;
        if (!sessionUserToken) {
          config.headers['Authorization'] = `Bearer ${ownerToken}`;
        }
      }
    }

    const financeRaw = getActiveFinanceRaw();
    if (financeRaw) {
      try {
        const financeData = JSON.parse(financeRaw) as { id?: string | number };
        if (financeData?.id) {
          config.headers['finance-id'] = String(financeData.id);
        }
      } catch {
        // ignore parse errors
      }
    }

    // Legacy support: if financeToken exists, set finance-authorization
    const financeToken = localStorage.getItem('financeToken') || localStorage.getItem('finance_token');
    if (financeToken) {
      config.headers['finance-authorization'] = `Bearer ${financeToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error_code?: string; code?: string; message?: string; error?: string }>) => {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error_code || error.response?.data?.code || '';
    const originalConfig = error.config as RetryableRequestConfig | undefined;
    const url = originalConfig?.url || '';

    // Handle login time restriction during active session usage
    if (status === 403 && errorCode === 'LOGIN_TIME_RESTRICTED') {
      const isInteractiveLoginOrSwitch =
        url.includes('/auth/user-login') ||
        url.includes('/auth/direct-user-login') ||
        url.includes('/finance/switch');
      if (!isInteractiveLoginOrSwitch && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('autofinex:login-time-restricted', {
            detail: error.response?.data,
          })
        );
      }
      return Promise.reject(error);
    }

    // Direct User Mode: if all active company access was removed (403 NO_ACTIVE_FINANCE_ACCESS)
    if (status === 403 && errorCode === 'NO_ACTIVE_FINANCE_ACCESS' && isDirectUserMode()) {
      const isLoginAttempt = url.includes('/auth/direct-user-login');
      if (!isLoginAttempt) {
        clearEphemeralUserSessionStorage();
        clearDirectUserLocalStorage();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('autofinex:session-revoked', { detail: { errorCode } })
          );
        }
        redirectToHashSafely('#/owner-login');
      }
      return Promise.reject(error);
    }

    if (status === 401) {
      const isExemptAuthEndpoint =
        url.includes('/auth/direct-user-login') ||
        url.includes('/auth/refresh-session') ||
        url.includes('/auth/user-login') ||
        url.includes('/auth/owner-login') ||
        url.includes('/auth/login') ||
        url.includes('/auth/user-logout') ||
        (url.includes('/auth/change-password') && errorCode === 'INVALID_CURRENT_PASSWORD');

      if (isExemptAuthEndpoint) {
        return Promise.reject(error);
      }

      const directMode = isDirectUserMode();

      if (directMode) {
        // Attempt transparent single-flight token rotation when access JWT expires
        const hasRefreshToken = Boolean(localStorage.getItem('refreshToken'));
        const canAttemptRefresh =
          hasRefreshToken &&
          originalConfig &&
          !originalConfig._retry &&
          (errorCode === 'TOKEN_EXPIRED' || !errorCode);

        if (canAttemptRefresh && originalConfig) {
          originalConfig._retry = true;
          try {
            const refreshed = await refreshDirectUserSession();
            originalConfig.headers['Authorization'] = `Bearer ${refreshed.token}`;
            return apiClient(originalConfig);
          } catch (refreshErr) {
            const refreshAxiosErr = refreshErr as AxiosError<{ error_code?: string }>;
            const refreshStatus = refreshAxiosErr.response?.status;
            const refreshCode = refreshAxiosErr.response?.data?.error_code || '';

            // Preserve persistent session on temporary network/server outages
            if (!refreshStatus || refreshStatus >= 500) {
              return Promise.reject(error);
            }

            if (
              refreshStatus === 401 ||
              refreshStatus === 403 ||
              CONFIRMED_REVOCATION_CODES.has(refreshCode)
            ) {
              clearEphemeralUserSessionStorage();
              clearDirectUserLocalStorage();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('autofinex:session-revoked', {
                    detail: { errorCode: refreshCode || errorCode },
                  })
                );
              }
              redirectToHashSafely('#/owner-login');
            }
            return Promise.reject(refreshErr);
          }
        }

        // Confirmed revocation in Direct User Mode (inactive user/license, password changed, revoked session)
        clearEphemeralUserSessionStorage();
        clearDirectUserLocalStorage();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('autofinex:session-revoked', { detail: { errorCode } })
          );
        }
        redirectToHashSafely('#/owner-login');
        return Promise.reject(error);
      }

      // License Mode:
      // /auth/owner-finances authenticates strictly via ownerToken — any 401 means the License token is invalid
      if (url.includes('/auth/owner-finances')) {
        clearEphemeralUserSessionStorage();
        clearLicenseLocalStorage();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('autofinex:session-revoked', { detail: { errorCode: errorCode || 'INVALID_OWNER_TOKEN' } })
          );
        }
        redirectToHashSafely('#/owner-login');
        return Promise.reject(error);
      }

      clearEphemeralUserSessionStorage();

      const ownerInvalid =
        errorCode === 'INVALID_OWNER_TOKEN' || errorCode === 'LICENSE_INACTIVE';
      if (ownerInvalid) {
        clearLicenseLocalStorage();
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('autofinex:session-revoked', { detail: { errorCode } })
        );
      }

      const hasOwner = Boolean(localStorage.getItem('ownerToken'));
      if (hasOwner && !ownerInvalid) {
        redirectToHashSafely('#/user-login');
      } else {
        clearLicenseLocalStorage();
        redirectToHashSafely('#/owner-login');
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
