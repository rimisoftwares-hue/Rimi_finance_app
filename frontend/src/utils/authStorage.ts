import { jwtDecode } from 'jwt-decode';

export type AuthMode = 'license' | 'direct_user';

export const CONFIRMED_REVOCATION_CODES = new Set<string>([
  'USER_INACTIVE',
  'LICENSE_INACTIVE',
  'PASSWORD_CHANGED',
  'SESSION_REVOKED',
  'NO_ACTIVE_FINANCE_ACCESS',
  'REFRESH_TOKEN_EXPIRED',
  'INVALID_REFRESH_TOKEN',
  'INVALID_TOKEN',
  'INVALID_TOKEN_TYPE',
]);

export function getAuthMode(): AuthMode | null {
  try {
    const raw = localStorage.getItem('authMode');
    if (raw === 'direct_user' || raw === 'license') {
      return raw;
    }
    if (localStorage.getItem('ownerToken')) {
      return 'license';
    }
    return null;
  } catch {
    return null;
  }
}

export function isDirectUserMode(): boolean {
  return getAuthMode() === 'direct_user';
}

export function getUserStorage(): Storage {
  return isDirectUserMode() ? localStorage : sessionStorage;
}

export function getActiveUserToken(): string | null {
  try {
    if (isDirectUserMode()) {
      return localStorage.getItem('authToken');
    }
    return sessionStorage.getItem('authToken');
  } catch {
    return null;
  }
}

export function getActiveFinanceRaw(): string | null {
  try {
    if (isDirectUserMode()) {
      return (
        localStorage.getItem('financeData') ||
        localStorage.getItem('currentFinance')
      );
    }
    return (
      sessionStorage.getItem('financeData') ||
      sessionStorage.getItem('currentFinance')
    );
  } catch {
    return null;
  }
}

export function clearEphemeralUserSessionStorage(): void {
  try {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userData');
    sessionStorage.removeItem('financeData');
    sessionStorage.removeItem('currentFinance');
    sessionStorage.removeItem('statistics');
    sessionStorage.removeItem('currentFinanceId');
    sessionStorage.removeItem('lastLogin');
    sessionStorage.removeItem('lastKnownLocation');
  } catch {
    // ignore storage errors
  }
}

export function clearDirectUserLocalStorage(): void {
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('financeData');
    localStorage.removeItem('currentFinance');
    localStorage.removeItem('statistics');
    localStorage.removeItem('currentFinanceId');
    localStorage.removeItem('lastLogin');
    if (localStorage.getItem('authMode') === 'direct_user') {
      localStorage.removeItem('authMode');
      localStorage.removeItem('ownerFinances');
    }
  } catch {
    // ignore storage errors
  }
}

export function clearLicenseLocalStorage(): void {
  try {
    localStorage.removeItem('ownerToken');
    localStorage.removeItem('ownerFinances');
    if (localStorage.getItem('authMode') === 'license') {
      localStorage.removeItem('authMode');
    }
  } catch {
    // ignore storage errors
  }
}

export function isTokenLocallyExpired(token: string | null | undefined, skewSeconds = 10): boolean {
  if (!token) return true;
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    if (typeof decoded?.exp !== 'number') {
      return false;
    }
    return decoded.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

