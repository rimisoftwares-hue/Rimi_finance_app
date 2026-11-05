export type PermissionType = 'camera' | 'location' | 'notification';
export type PermissionStatus = 'unknown' | 'granted' | 'prompt' | 'blocked';

export interface PermissionResult {
  granted: boolean;
  blocked?: boolean;          // permanent denial, soft prompt cannot help
  error?: string;
  data?: { latitude: number; longitude: number; accuracy?: number; source: 'device' | 'ip' };
}

