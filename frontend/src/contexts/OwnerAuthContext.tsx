import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AxiosError } from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/apiClient';
import {
  clearDirectUserLocalStorage,
  clearEphemeralUserSessionStorage,
  clearLicenseLocalStorage,
  isDirectUserMode,
  isTokenLocallyExpired,
} from '../utils/authStorage';

export interface Owner {
  id: string | number;
  username: string;
}

export interface OwnerLoginResult {
  success: boolean;
  message?: string;
  error_code?: string;
}

interface OwnerJwtPayload {
  owner?: Owner;
  exp?: number;
}

interface OwnerAuthContextType {
  owner: Owner | null;
  isLoading: boolean;
  ownerLogin: (username: string, password: string) => Promise<boolean>;
  ownerLoginDetailed: (username: string, password: string) => Promise<OwnerLoginResult>;
  ownerLogout: () => void;
}

const OwnerAuthContext = createContext<OwnerAuthContextType | undefined>(undefined);

export const OwnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOwnerFinances = useCallback(async () => {
    try {
      const response = await apiClient.get<{ success?: boolean; finances?: unknown[] }>('/auth/owner-finances');
      if (response.data?.success && Array.isArray(response.data.finances)) {
        localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
      }
    } catch (error) {
      console.error('Error fetching owner finances:', error);
    }
  }, []);

  useEffect(() => {
    if (!isDirectUserMode()) {
      const token = localStorage.getItem('ownerToken');
      if (token) {
        if (isTokenLocallyExpired(token, 0)) {
          clearLicenseLocalStorage();
        } else {
          try {
            const decoded = jwtDecode<OwnerJwtPayload>(token);
            if (decoded?.owner?.id) {
              if (!localStorage.getItem('authMode')) {
                localStorage.setItem('authMode', 'license');
              }
              setOwner(decoded.owner);
              void fetchOwnerFinances();
            } else {
              clearLicenseLocalStorage();
            }
          } catch (error) {
            console.error('Invalid owner token:', error);
            clearLicenseLocalStorage();
          }
        }
      }
    }
    setIsLoading(false);
  }, [fetchOwnerFinances]);

  useEffect(() => {
    const handleModeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ authMode?: string }>).detail;
      if (detail?.authMode === 'direct_user') {
        setOwner(null);
      }
    };

    const handleSessionRevoked = () => {
      if (!localStorage.getItem('ownerToken') || isDirectUserMode()) {
        setOwner(null);
      }
    };

    window.addEventListener('autofinex:auth-mode-changed', handleModeChanged);
    window.addEventListener('autofinex:session-revoked', handleSessionRevoked);
    return () => {
      window.removeEventListener('autofinex:auth-mode-changed', handleModeChanged);
      window.removeEventListener('autofinex:session-revoked', handleSessionRevoked);
    };
  }, []);

  const ownerLoginDetailed = useCallback(
    async (username: string, password: string): Promise<OwnerLoginResult> => {
      try {
        const response = await apiClient.post<{
          success: boolean;
          token: string;
          owner: Owner;
          finances?: unknown[];
          message?: string;
          error_code?: string;
        }>('/auth/owner-login', {
          username: username.trim(),
          password,
        });

        if (response.data?.success && response.data.token && response.data.owner) {
          const { token, owner: ownerData, finances } = response.data;

          // Clear any prior Direct User or ephemeral user session keys before activating License Mode
          clearEphemeralUserSessionStorage();
          clearDirectUserLocalStorage();

          localStorage.setItem('authMode', 'license');
          localStorage.setItem('ownerToken', token);
          setOwner(ownerData);

          if (Array.isArray(finances)) {
            localStorage.setItem('ownerFinances', JSON.stringify(finances));
          } else {
            await fetchOwnerFinances();
          }

          window.dispatchEvent(
            new CustomEvent('autofinex:auth-mode-changed', {
              detail: { authMode: 'license' },
            })
          );

          return { success: true };
        }

        return {
          success: false,
          message: response.data?.message || 'Invalid License credentials',
          error_code: response.data?.error_code || 'INVALID_CREDENTIALS',
        };
      } catch (err) {
        const axiosErr = err as AxiosError<{ message?: string; error?: string; error_code?: string }>;
        if (axiosErr.response) {
          const status = axiosErr.response.status;
          const data = axiosErr.response.data;
          const code = data?.error_code;

          if (status === 429) {
            return {
              success: false,
              message: data?.message || 'Too many failed login attempts. Please wait and try again.',
              error_code: code || 'TOO_MANY_ATTEMPTS',
            };
          }

          if (code === 'OWNER_NOT_FOUND') {
            return {
              success: false,
              message: 'License ID not found or inactive.',
              error_code: code,
            };
          }

          if (code === 'INVALID_PASSWORD') {
            return {
              success: false,
              message: 'Password is incorrect.',
              error_code: code,
            };
          }

          return {
            success: false,
            message: data?.message || data?.error || 'Invalid License ID or password.',
            error_code: code || `HTTP_${status}`,
          };
        }

        return {
          success: false,
          message: 'Unable to reach server. Please check your connection and try again.',
          error_code: 'NETWORK_ERROR',
        };
      }
    },
    [fetchOwnerFinances]
  );

  const ownerLogin = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      const result = await ownerLoginDetailed(username, password);
      return result.success;
    },
    [ownerLoginDetailed]
  );

  const ownerLogout = useCallback(() => {
    clearEphemeralUserSessionStorage();
    clearDirectUserLocalStorage();
    clearLicenseLocalStorage();
    try {
      localStorage.removeItem('authMode');
    } catch {
      // ignore storage errors
    }
    setOwner(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('autofinex:session-revoked', {
          detail: { errorCode: 'OWNER_LOGOUT' },
        })
      );
    }
  }, []);

  return (
    <OwnerAuthContext.Provider
      value={{ owner, isLoading, ownerLogin, ownerLoginDetailed, ownerLogout }}
    >
      {children}
    </OwnerAuthContext.Provider>
  );
};

export const useOwnerAuth = () => {
  const context = useContext(OwnerAuthContext);
  if (!context) {
    throw new Error('useOwnerAuth must be used within an OwnerAuthProvider');
  }
  return context;
};
