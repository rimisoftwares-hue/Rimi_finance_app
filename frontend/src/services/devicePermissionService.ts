import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { PermissionType, PermissionStatus, PermissionResult } from '../types/permissions';

export const DevicePermissionService = {
  async openSystemSettings(type: PermissionType) {
    await invoke('open_os_privacy_settings', { permissionType: type });
  },

  async resetWebviewPermissions() {
    await invoke('reset_webview_permissions');
  },

  async queryStatus(type: PermissionType): Promise<PermissionStatus> {
    try {
      if (type === 'notification') {
        return (await isPermissionGranted()) ? 'granted' : 'prompt';
      }
      if (navigator.permissions?.query) {
        const name = (type === 'camera' ? 'camera' : 'geolocation') as PermissionName;
        const s = await navigator.permissions.query({ name });
        return s.state === 'denied' ? 'blocked' : (s.state as PermissionStatus);
      }
    } catch {
      /* some webviews do not support querying camera/geolocation */
    }
    return 'unknown';
  },

  async requestCamera(): Promise<PermissionResult> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return { granted: true };
    } catch (e: any) {
      const blocked = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      // NotFoundError / NotReadableError = no camera or camera busy, NOT a permission problem
      return { granted: false, blocked, error: e?.message ?? String(e) };
    }
  },

  requestLocation(): Promise<PermissionResult> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ granted: false, blocked: false, error: 'Geolocation not supported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({
            granted: true,
            data: {
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
              source: 'device',
            },
          }),
        (err) =>
          resolve({
            granted: false,
            blocked: err.code === err.PERMISSION_DENIED,
            error: err.message,
          }),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  },

  /** Coarse fallback only. Never use for compliance-critical check-ins. */
  async ipLocationFallback(): Promise<PermissionResult> {
    try {
      const r = await fetch('https://ipapi.co/json/');
      const j = await r.json();
      if (typeof j.latitude !== 'number') throw new Error('No coordinates');
      return {
        granted: true,
        data: { latitude: j.latitude, longitude: j.longitude, source: 'ip' },
      };
    } catch (e: any) {
      return { granted: false, error: e?.message ?? 'IP lookup failed' };
    }
  },

  async requestNotification(): Promise<PermissionResult> {
    try {
      let ok = await isPermissionGranted();
      if (!ok) ok = (await requestPermission()) === 'granted';
      return { granted: ok, blocked: !ok };
    } catch (e: any) {
      return { granted: false, error: e?.message ?? String(e) };
    }
  },

  async notify(title: string, body: string) {
    if (await isPermissionGranted()) sendNotification({ title, body });
  },
};

