// src/components/auth/ChangePasswordDialog.tsx
import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { changePassword } from '../../api/userProfileApi';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPasswordChanged?: (lastPasswordChange: string) => void;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
  open,
  onOpenChange,
  onPasswordChanged,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);
    setGeneralError(null);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const validate = (): boolean => {
    let valid = true;
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);
    setGeneralError(null);

    if (!currentPassword) {
      setCurrentPasswordError('Current password is required.');
      valid = false;
    }

    if (!newPassword) {
      setNewPasswordError('New password is required.');
      valid = false;
    } else if (newPassword.length < 8) {
      setNewPasswordError('New password must be at least 8 characters.');
      valid = false;
    } else if (newPassword.length > 128) {
      setNewPasswordError('New password must not exceed 128 characters.');
      valid = false;
    } else if (currentPassword && newPassword === currentPassword) {
      setNewPasswordError('New password must be different from your current password.');
      valid = false;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your new password.');
      valid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError('New password and confirmation do not match.');
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
      });

      toast.success(result.message || 'Password changed successfully');
      if (result.lastPasswordChange) {
        onPasswordChanged?.(result.lastPasswordChange);
      }
      resetForm();
      onOpenChange(false);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          status?: number;
          data?: {
            error?: string;
            message?: string;
            error_code?: string;
            retryAfterSeconds?: number;
          };
          headers?: Record<string, string>;
        };
        message?: string;
      };

      const status = axiosErr?.response?.status;
      const data = axiosErr?.response?.data;

      if (status === 401) {
        setCurrentPasswordError(
          data?.error || data?.message || 'Current password is incorrect.'
        );
      } else if (status === 429) {
        const retrySecs =
          data?.retryAfterSeconds ||
          Number(axiosErr?.response?.headers?.['retry-after']) ||
          null;
        const retryMinutes = retrySecs ? Math.max(1, Math.ceil(retrySecs / 60)) : null;
        setGeneralError(
          data?.error ||
            (retryMinutes
              ? `Too many failed attempts. Please try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`
              : 'Too many failed attempts. Please try again later.')
        );
      } else {
        setGeneralError(
          data?.error ||
            data?.message ||
            axiosErr?.message ||
            'Failed to change password. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl border-border bg-card">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Lock className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Change Password
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Enter your current password and choose a new password (8–128 characters).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="current-password-input" className="text-xs font-semibold">
              Current Password
            </Label>
            <div className="relative">
              <Input
                id="current-password-input"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (currentPasswordError) setCurrentPasswordError(null);
                  if (generalError) setGeneralError(null);
                }}
                placeholder="Enter current password"
                autoComplete="current-password"
                disabled={isSubmitting}
                className="h-10 rounded-xl pr-10 text-sm"
                aria-invalid={!!currentPasswordError}
                aria-describedby={currentPasswordError ? 'current-password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                disabled={isSubmitting}
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {currentPasswordError && (
              <p
                id="current-password-error"
                className="text-xs text-destructive flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{currentPasswordError}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password-input" className="text-xs font-semibold">
              New Password
            </Label>
            <div className="relative">
              <Input
                id="new-password-input"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (newPasswordError) setNewPasswordError(null);
                  if (generalError) setGeneralError(null);
                }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={isSubmitting}
                className="h-10 rounded-xl pr-10 text-sm"
                aria-invalid={!!newPasswordError}
                aria-describedby={newPasswordError ? 'new-password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                disabled={isSubmitting}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPasswordError && (
              <p
                id="new-password-error"
                className="text-xs text-destructive flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{newPasswordError}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password-input" className="text-xs font-semibold">
              Confirm New Password
            </Label>
            <div className="relative">
              <Input
                id="confirm-password-input"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmPasswordError) setConfirmPasswordError(null);
                  if (generalError) setGeneralError(null);
                }}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                disabled={isSubmitting}
                className="h-10 rounded-xl pr-10 text-sm"
                aria-invalid={!!confirmPasswordError}
                aria-describedby={confirmPasswordError ? 'confirm-password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                disabled={isSubmitting}
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPasswordError && (
              <p
                id="confirm-password-error"
                className="text-xs text-destructive flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{confirmPasswordError}</span>
              </p>
            )}
          </div>

          {generalError && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/25 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl text-xs font-semibold gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  Update Password
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

