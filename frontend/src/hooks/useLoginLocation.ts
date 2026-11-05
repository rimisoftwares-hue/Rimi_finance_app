// frontend/src/hooks/useLoginLocation.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { usePermissionFlow } from './usePermissionFlow';
import { DevicePermissionService } from '../services/devicePermissionService';
import type { PermissionStatus, PermissionResult } from '../types/permissions';

export type LocationPermissionResult = 'granted' | 'declined' | 'blocked' | 'unavailable' | 'not_asked';

export interface LoginLocationResult {
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  locationPermission: LocationPermissionResult;
}

export function isValidCoords(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function useLoginLocation() {
  const flow = usePermissionFlow('location');
  const [status, setStatus] = useState<PermissionStatus>('unknown');
  const lastPhaseRef = useRef<string>('idle');

  useEffect(() => {
    if (flow.phase !== 'idle') {
      lastPhaseRef.current = flow.phase;
    }
  }, [flow.phase]);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await DevicePermissionService.queryStatus('location');
      setStatus(s);
      return s;
    } catch {
      setStatus('unknown');
      return 'unknown' as PermissionStatus;
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const captureForLogin = useCallback(async (): Promise<LoginLocationResult> => {
    try {
      lastPhaseRef.current = flow.phase;

      // Hard cap of 12 seconds total for acquisition so login never hangs
      const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) =>
        setTimeout(() => resolve({ isTimeout: true }), 12000)
      );

      const ensurePromise = flow.ensure();
      const outcome = await Promise.race([ensurePromise, timeoutPromise]);

      if ('isTimeout' in outcome) {
        console.warn('Location capture timed out at 12s');
        return { locationPermission: 'unavailable' };
      }

      const res = outcome as PermissionResult;

      if (res.granted && res.data) {
        const { latitude, longitude, accuracy } = res.data;
        if (isValidCoords(latitude, longitude)) {
          const accuracyM = typeof accuracy === 'number' && Number.isFinite(accuracy)
            ? Math.round(accuracy)
            : undefined;

          // Cache good fix in sessionStorage key lastKnownLocation
          try {
            sessionStorage.setItem(
              'lastKnownLocation',
              JSON.stringify({
                lat: latitude,
                lng: longitude,
                accuracy: accuracyM,
                ts: Date.now(),
              })
            );
          } catch { /* ignore storage errors */ }

          setStatus('granted');
          return {
            latitude,
            longitude,
            accuracyM,
            locationPermission: 'granted',
          };
        }
        return { locationPermission: 'unavailable' };
      }

      if (res.blocked || lastPhaseRef.current === 'blocked') {
        setStatus('blocked');
        return { locationPermission: 'blocked' };
      }

      if (res.error) {
        const errLower = res.error.toLowerCase();
        if (errLower.includes('timeout') || errLower.includes('position') || errLower.includes('support')) {
          return { locationPermission: 'unavailable' };
        }
      }

      // User pressed Not Now or explicitly dismissed
      return { locationPermission: 'declined' };
    } catch (err: any) {
      console.error('Error during location capture:', err);
      return { locationPermission: 'unavailable' };
    }
  }, [flow]);

  return {
    flow,
    status,
    refreshStatus,
    captureForLogin,
  };
}

