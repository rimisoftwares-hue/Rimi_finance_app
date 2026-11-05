// src/api/apiClient.ts
import axios from 'axios';

export const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || `${API_ORIGIN}/api`).replace(/\/+$/, '');
export const BASE = API_BASE;

const apiClient = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Key mapping (must match AuthContext.tsx exactly):
//   authToken   → Bearer Authorization header
//   financeData → JSON { id: string | number, ... } → finance-id header
//   ownerToken  → owner-authorization header

apiClient.interceptors.request.use(
  (config) => {
    // Support FormData uploads (do not force application/json)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    // Auth token (session-ephemeral for users, persistent for owner)
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Finance ID — AuthContext stores it inside the 'financeData' JSON object
    const financeRaw =
      sessionStorage.getItem('financeData') ||
      sessionStorage.getItem('currentFinance') ||
      localStorage.getItem('financeData') ||
      localStorage.getItem('currentFinance');
    if (financeRaw) {
      try {
        const financeData = JSON.parse(financeRaw);
        const rawId = financeData?.id;
        if (rawId) {
          config.headers['finance-id'] = String(rawId);
        }
      } catch { /* ignore parse errors */ }
    }

    // Owner token (stored as 'ownerToken' by AuthContext)
    const ownerToken = localStorage.getItem('ownerToken');
    if (ownerToken) {
      config.headers['owner-authorization'] = `Bearer ${ownerToken}`;
      // Fallback: If no user authToken, use ownerToken for Authorization
      if (!token) {
        config.headers['Authorization'] = `Bearer ${ownerToken}`;
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
  (error) => {
    // Handle login time restriction (HTTP 403 with LOGIN_TIME_RESTRICTED)
    if (error.response?.status === 403 && error.response?.data?.error_code === 'LOGIN_TIME_RESTRICTED') {
      window.dispatchEvent(
        new CustomEvent('autofinex:login-time-restricted', {
          detail: error.response.data,
        })
      );
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthEndpoint =
        url.includes('/auth/user-login') ||
        url.includes('/auth/owner-login') ||
        url.includes('/auth/login') ||
        url.includes('/auth/owner-finances');

      // Do NOT clear tokens or redirect if this 401 is from a login attempt
      if (isAuthEndpoint) {
        return Promise.reject(error);
      }

      // Session expired during regular app usage:
      // Clear user session keys (preserve ownerToken if owner is still active)
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('financeData');
      sessionStorage.removeItem('currentFinance');
      sessionStorage.removeItem('userData');
      sessionStorage.removeItem('statistics');
      sessionStorage.removeItem('lastLogin');
      sessionStorage.removeItem('currentFinanceId');
      sessionStorage.removeItem('lastKnownLocation');

      localStorage.removeItem('authToken');
      localStorage.removeItem('financeData');
      localStorage.removeItem('currentFinance');
      localStorage.removeItem('userData');
      localStorage.removeItem('statistics');
      localStorage.removeItem('lastLogin');
      localStorage.removeItem('currentFinanceId');

      const hasOwner = !!localStorage.getItem('ownerToken');
      if (hasOwner) {
        window.location.hash = '#/user-login';
      } else {
        localStorage.removeItem('ownerToken');
        window.location.hash = '#/owner-login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;