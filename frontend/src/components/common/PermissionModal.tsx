import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  Camera,
  Mic,
  MapPin,
  Bell,
  Settings,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { DevicePermissionService } from '../../services/devicePermissionService';
import type { PermissionType } from '../../types/permissions';

export interface PermissionModalProps {
  open: boolean;
  type: PermissionType;
  mode: 'soft' | 'blocked';
  busy?: boolean;
  onAllow: () => void;
  onCancel: () => void;
  onRetry: () => void;
  fallback?: {
    label: string;
    onClick: () => void;
  };
}

const PERMISSION_COPY: Record<
  PermissionType,
  { title: string; blockedTitle: string; softText: string }
> = {
  camera: {
    title: 'Camera Access',
    blockedTitle: 'Camera Access Blocked',
    softText: 'Allow camera access to capture KYC documents and inspection photos.',
  },
  location: {
    title: 'Location Access',
    blockedTitle: 'Location Access Blocked',
    softText: 'Allow location access to record collection points and check-ins.',
  },
  notification: {
    title: 'Notification Access',
    blockedTitle: 'Notification Access Blocked',
    softText: 'Allow notifications to receive due reminders and assignment updates.',
  },
  microphone: {
    title: 'Microphone Access',
    blockedTitle: 'Microphone Access Blocked',
    softText: 'Allow microphone access to talk directly with AutoFinex AI in Tamil, English, or Hindi.',
  },
};

export const PermissionModal: React.FC<PermissionModalProps> = ({
  open,
  type,
  mode,
  busy = false,
  onAllow,
  onCancel,
  onRetry,
  fallback,
}) => {
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const copy = PERMISSION_COPY[type] || {
    title: 'Permission Access',
    blockedTitle: 'Permission Access Blocked',
    softText: 'This feature requires your permission to proceed.',
  };

  const handleOpenSettings = async () => {
    setIsOpeningSettings(true);
    setSettingsError(null);
    try {
      await DevicePermissionService.openSystemSettings(type);
    } catch (err: any) {
      setSettingsError(
        typeof err === 'string'
          ? err
          : err?.message || 'Could not open system settings. Please open your system settings manually and allow access for this app.'
      );
    } finally {
      setIsOpeningSettings(false);
    }
  };

  const handleResetConfirm = async () => {
    setIsResetting(true);
    try {
      await DevicePermissionService.resetWebviewPermissions();
      setShowResetConfirm(false);
      onRetry();
    } catch (err: any) {
      setSettingsError(
        typeof err === 'string' ? err : err?.message || 'Failed to reset webview permissions.'
      );
    } finally {
      setIsResetting(false);
    }
  };

  const renderIcon = () => {
    if (mode === 'blocked') {
      return (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
      );
    }

    const iconClasses = 'h-6 w-6 text-primary';
    const bgClasses = 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10';

    switch (type) {
      case 'camera':
        return (
          <div className={bgClasses}>
            <Camera className={iconClasses} />
          </div>
        );
      case 'location':
        return (
          <div className={bgClasses}>
            <MapPin className={iconClasses} />
          </div>
        );
      case 'notification':
        return (
          <div className={bgClasses}>
            <Bell className={iconClasses} />
          </div>
        );
      case 'microphone':
        return (
          <div className={bgClasses}>
            <Mic className={iconClasses} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) {
          setShowResetConfirm(false);
          setSettingsError(null);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          {renderIcon()}
          <DialogTitle className="mt-3 text-lg font-semibold">
            {mode === 'soft' ? copy.title : copy.blockedTitle}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            {mode === 'soft'
              ? copy.softText
              : 'Access is blocked for this app. Open system settings, allow access, then try again.'}
          </DialogDescription>
        </DialogHeader>

        {settingsError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {settingsError}
          </div>
        )}

        {showResetConfirm && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 space-y-2">
            <p className="font-semibold">You will be signed out</p>
            <p>
              Resetting app permissions clears the webview data store (cookies, localStorage, and session state). You will need to sign in again.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleResetConfirm}
                disabled={isResetting}
              >
                {isResetting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Confirm Reset
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-col">
          {mode === 'soft' ? (
            <div className="flex w-full flex-col-reverse sm:flex-row gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={busy}
              >
                Not Now
              </Button>
              <Button
                type="button"
                onClick={onAllow}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Allow Access
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Button
                type="button"
                className="w-full flex items-center justify-center gap-2"
                onClick={handleOpenSettings}
                disabled={isOpeningSettings || busy}
              >
                {isOpeningSettings ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Settings className="h-4 w-4" />
                )}
                Open System Settings
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={onRetry}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                I've enabled it, Try again
              </Button>

              {!showResetConfirm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={busy}
                >
                  Reset App Permissions
                </Button>
              )}

              {fallback && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    fallback.onClick();
                    onCancel();
                  }}
                  disabled={busy}
                >
                  {fallback.label}
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

