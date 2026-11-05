import { useCallback } from 'react';
import { usePermissionFlow } from '../../../hooks/usePermissionFlow';
import { PermissionModal } from '../PermissionModal';
import type { PermissionResult } from '../../../types/permissions';

/** Permission-aware location: soft ask, native request, blocked-recovery. Render `modal` once in the host component. */
export function useDeviceLocation() {
  const flow = usePermissionFlow('location');
  const locate = useCallback((): Promise<PermissionResult> => flow.ensure(), [flow.ensure]);
  const modal = (
    <PermissionModal
      open={flow.phase === 'soft' || flow.phase === 'blocked' || flow.phase === 'requesting'}
      type="location"
      mode={flow.phase === 'blocked' ? 'blocked' : 'soft'}
      busy={flow.phase === 'requesting'}
      onAllow={flow.onAllow}
      onCancel={flow.onCancel}
      onRetry={flow.retryAfterSettings}
    />
  );
  return { locate, modal, busy: flow.phase === 'requesting' };
}

