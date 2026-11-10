// src/components/invitations/JoinWithCodeDialog.tsx
import React, { useState } from 'react';
import { KeyRound, Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
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
import { useToast } from '../ui/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  invitationService,
  isValidInviteCodeFormat,
} from '../../services/invitationService';
import type { RedeemInviteCodeResult } from '../../types/invitations';

interface JoinWithCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: RedeemInviteCodeResult) => void;
}

function formatCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return cleaned.slice(0, 13);
}

export const JoinWithCodeDialog: React.FC<JoinWithCodeDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { refreshFinanceList } = useAuth();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [redeemedResult, setRedeemedResult] = useState<RedeemInviteCodeResult | null>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCode('');
      setErrorMsg(null);
      setRedeemedResult(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    setErrorMsg(null);

    if (!isValidInviteCodeFormat(normalized)) {
      setErrorMsg('Enter a valid invite code in the format AFX-XXXX-XXXX.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await invitationService.redeemCode(normalized);
      await refreshFinanceList().catch(() => {});
      setRedeemedResult(result);
      const roleLabel =
        result.assignedRole.charAt(0).toUpperCase() + result.assignedRole.slice(1);
      toast({
        title: `Joined ${result.financeName}`,
        description: `You have joined ${result.financeName} as ${roleLabel}.`,
      });
      onSuccess?.(result);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to redeem invite code.';
      setErrorMsg(msg);
      toast({
        title: 'Redemption failed',
        description: msg,
        variant: 'destructive',
      });
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
              <KeyRound className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Join Company with Invite Code
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Enter an active AutoFinex invite code to join a finance company.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {redeemedResult ? (
          <div className="py-4 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-foreground text-sm">
                  Successfully joined {redeemedResult.financeName}
                </p>
                <p className="text-muted-foreground">
                  Assigned Role:{' '}
                  <span className="font-semibold text-foreground capitalize">
                    {redeemedResult.assignedRole}
                  </span>
                  {redeemedResult.staffCode ? (
                    <>
                      {' · '}Staff Code:{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {redeemedResult.staffCode}
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="text-muted-foreground flex items-center gap-1 pt-1">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {redeemedResult.financeName} is now available in your company switcher.
                  </span>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="w-full sm:w-auto rounded-xl text-xs font-semibold"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="invite-code-input" className="text-xs font-semibold">
                Invite Code
              </Label>
              <Input
                id="invite-code-input"
                type="text"
                value={code}
                onChange={e => {
                  setCode(formatCodeInput(e.target.value));
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="AFX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                className="font-mono uppercase tracking-wider text-sm h-10 rounded-xl"
                disabled={isSubmitting}
              />
              <p className="text-[11px] text-muted-foreground">
                Format: <span className="font-mono font-medium">AFX-XXXX-XXXX</span> (shared by a company owner or admin).
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/25 flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
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
                disabled={isSubmitting || !code.trim()}
                className="rounded-xl text-xs font-semibold gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Redeeming...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" />
                    Join Company
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

