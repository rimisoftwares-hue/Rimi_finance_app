import { useCallback, useState, useRef } from 'react';
import { DevicePermissionService as S } from '../services/devicePermissionService';
import type { PermissionType, PermissionResult } from '../types/permissions';

type Phase = 'idle' | 'soft' | 'requesting' | 'blocked';

export function usePermissionFlow(type: PermissionType) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [resolver, setResolver] = useState<((r: PermissionResult) => void) | null>(null);
  const resolverRef = useRef<((r: PermissionResult) => void) | null>(null);

  const native = useCallback(async (): Promise<PermissionResult> => {
    if (type === 'camera') return S.requestCamera();
    if (type === 'location') return S.requestLocation();
    return S.requestNotification();
  }, [type]);

  /** Call from the feature button. Resolves with the final result (or granted:false if user cancelled). */
  const ensure = useCallback(async (): Promise<PermissionResult> => {
    const status = await S.queryStatus(type);
    if (status === 'granted') return native(); // no modal needed
    if (status === 'blocked') {
      setPhase('blocked');
    } else {
      setPhase('soft');
    }
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setResolver(() => resolve);
    });
  }, [type, native]);

  const finish = useCallback((r: PermissionResult) => {
    const fn = resolverRef.current || resolver;
    fn?.(r);
    resolverRef.current = null;
    setResolver(null);
    setPhase('idle');
  }, [resolver]);

  const onAllow = useCallback(async () => {
    setPhase('requesting');
    const r = await native();
    if (r.granted) return finish(r);
    if (r.blocked) {
      setPhase('blocked'); // keep promise pending, show recovery
      return;
    }
    finish(r);
  }, [native, finish]);

  const onCancel = useCallback(() => {
    finish({ granted: false }); // "Not Now": persist nothing
  }, [finish]);

  const retryAfterSettings = useCallback(async () => { // user returns from OS settings
    setPhase('requesting');
    const r = await native();
    if (r.granted) return finish(r);
    setPhase('blocked');
  }, [native, finish]);

  return { phase, ensure, onAllow, onCancel, retryAfterSettings };
}

