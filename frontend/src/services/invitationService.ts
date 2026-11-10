import apiClient from '../api/apiClient';
import {
  MAX_ACTIVE_CODES_PER_COMPANY,
  MAX_CUSTOM_CODE_USES,
} from '../config/invitationConfig';
import type {
  AssignableInviteRole,
  CompanyInvitationsResponse,
  GenerateInviteCodePayload,
  Invitation,
  InvitationStatus,
  RedeemInviteCodeResult,
  SearchedInviteUser,
  SearchInviteUserParams,
  SendDirectInvitePayload,
} from '../types/invitations';

const CODE_REGEX = /^AFX-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Pure Validation & Formatting Helpers ───────────────────────────────────

export function isValidInviteCodeFormat(code: string): boolean {
  if (!code) return false;
  return CODE_REGEX.test(code.trim().toUpperCase());
}

export function sanitizePhoneFieldInput(raw: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function normalizePhoneForSearch(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const cleaned = sanitizePhoneFieldInput(raw);
  if (cleaned.length !== 10 || !/^\d{10}$/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      error: 'Enter an exact 10-digit mobile number.',
    };
  }
  return { valid: true, normalized: cleaned };
}

export function normalizeEmailForSearch(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = (raw || '').trim().toLowerCase();
  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Enter a valid email address.',
    };
  }
  return { valid: true, normalized };
}

export function maskPhone(phone: string): string {
  const digits = sanitizePhoneFieldInput(phone);
  if (digits.length < 4) return '**********';
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const trimmed = (email || '').trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return '***@***';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function getAllowedInviteRoles(inviterRole: string | undefined): AssignableInviteRole[] {
  const normalized = (inviterRole || '').toLowerCase();
  if (normalized === 'owner') {
    return ['admin', 'agent', 'staff'];
  }
  if (normalized === 'admin') {
    return ['agent', 'staff'];
  }
  return [];
}

export function validateMaxUses(maxUses: number | null): { valid: boolean; error?: string } {
  if (maxUses === null) return { valid: true };
  if (
    typeof maxUses !== 'number' ||
    !Number.isInteger(maxUses) ||
    maxUses < 1 ||
    maxUses > MAX_CUSTOM_CODE_USES
  ) {
    return {
      valid: false,
      error: `Custom usage limit must be a whole number between 1 and ${MAX_CUSTOM_CODE_USES}.`,
    };
  }
  return { valid: true };
}

export function deriveInvitationStatus(inv: Invitation, nowMs: number = Date.now()): InvitationStatus {
  if (inv.derivedStatus) {
    return inv.derivedStatus;
  }

  const expiresMs = new Date(inv.expiresAt).getTime();
  const isPastExpiry = Number.isFinite(expiresMs) && nowMs >= expiresMs;

  if (inv.inviteType === 'code') {
    if (inv.status === 'deactivated_cancelled' || inv.status === 'cancelled' || inv.revokedAt) {
      return 'deactivated_cancelled';
    }
    if (
      inv.status === 'deactivated_limit_reached' ||
      (inv.maxUses !== null && inv.usedCount >= inv.maxUses)
    ) {
      return 'deactivated_limit_reached';
    }
    if (inv.status === 'expired' || isPastExpiry) {
      return 'expired';
    }
    return 'active';
  }

  if (
    inv.status === 'accepted' ||
    inv.status === 'declined' ||
    inv.status === 'cancelled'
  ) {
    return inv.status;
  }
  if (inv.status === 'expired' || isPastExpiry) {
    return 'expired';
  }
  return 'pending';
}

// ── Error Extraction Helper ────────────────────────────────────────────────

function extractApiError(err: unknown, fallbackMessage: string): Error {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const axiosErr = err as {
      response?: { status?: number; data?: { message?: string; error?: string; code?: string } };
      message?: string;
    };
    const msg =
      axiosErr.response?.data?.message ||
      axiosErr.response?.data?.error ||
      axiosErr.message ||
      fallbackMessage;
    const errorObj = new Error(msg) as Error & { status?: number; code?: string };
    errorObj.status = axiosErr.response?.status;
    errorObj.code = axiosErr.response?.data?.code;
    return errorObj;
  }
  if (err instanceof Error) return err;
  return new Error(fallbackMessage);
}

// ── Subscriber Registry ────────────────────────────────────────────────────

type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

function notifySubscribers() {
  subscribers.forEach(fn => {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  });
}

// ── Real PostgreSQL-Backed Invitation Service ──────────────────────────────

export const invitationService = {
  subscribe(listener: Subscriber): () => void {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  },

  async searchUser(params: SearchInviteUserParams): Promise<SearchedInviteUser | null> {
    try {
      const headers: Record<string, string> = {};
      if (params.financeId) {
        headers['finance-id'] = String(params.financeId);
      }
      const res = await apiClient.get('/invitations/search-user', {
        params: {
          mode: params.mode,
          value: params.value,
        },
        headers,
      });
      if (res.data?.found && res.data?.user) {
        return res.data.user as SearchedInviteUser;
      }
      return null;
    } catch (err) {
      throw extractApiError(err, 'Unable to search user.');
    }
  },

  async sendDirectInvite(payload: SendDirectInvitePayload): Promise<Invitation> {
    try {
      const headers: Record<string, string> = {};
      if (payload.financeId) {
        headers['finance-id'] = String(payload.financeId);
      }
      const res = await apiClient.post(
        '/invitations/direct',
        {
          targetUserId: payload.targetUserId,
          role: payload.role,
          expiryDays: payload.expiryDays ?? 7,
          staffCode: payload.staffCode,
          loginTimeFrom: payload.loginTimeFrom,
          loginTimeTo: payload.loginTimeTo,
        },
        { headers }
      );
      notifySubscribers();
      return res.data.invitation as Invitation;
    } catch (err) {
      throw extractApiError(err, 'Failed to send direct invitation.');
    }
  },

  async generateCode(payload: GenerateInviteCodePayload): Promise<Invitation> {
    try {
      const headers: Record<string, string> = {};
      if (payload.financeId) {
        headers['finance-id'] = String(payload.financeId);
      }
      const res = await apiClient.post(
        '/invitations/codes',
        {
          role: payload.role,
          maxUses: payload.maxUses,
          expiryDays: payload.expiryDays,
          staffCode: payload.staffCode,
          loginTimeFrom: payload.loginTimeFrom,
          loginTimeTo: payload.loginTimeTo,
        },
        { headers }
      );
      notifySubscribers();
      return res.data.invitation as Invitation;
    } catch (err) {
      throw extractApiError(err, 'Failed to generate invite code.');
    }
  },

  async getCompanyInvitationsSummary(
    financeId: string,
    filters?: { type?: 'all' | 'code' | 'direct'; status?: 'all' | 'active' | 'inactive' }
  ): Promise<CompanyInvitationsResponse> {
    try {
      const headers: Record<string, string> = {};
      if (financeId) {
        headers['finance-id'] = String(financeId);
      }
      const res = await apiClient.get('/invitations', {
        params: {
          type: filters?.type || 'all',
          status: filters?.status || 'all',
        },
        headers,
      });
      return {
        invitations: (res.data?.invitations || []) as Invitation[],
        activeCodeCount:
          typeof res.data?.activeCodeCount === 'number' ? res.data.activeCodeCount : 0,
        maxActiveCodes:
          typeof res.data?.maxActiveCodes === 'number'
            ? res.data.maxActiveCodes
            : MAX_ACTIVE_CODES_PER_COMPANY,
      };
    } catch (err) {
      throw extractApiError(err, 'Failed to load company invitations.');
    }
  },

  async listCompanyInvitations(
    financeId: string,
    _financeName?: string,
    filters?: { type?: 'all' | 'code' | 'direct'; status?: 'all' | 'active' | 'inactive' }
  ): Promise<Invitation[]> {
    const summary = await this.getCompanyInvitationsSummary(financeId, filters);
    return summary.invitations;
  },

  async revokeInvitation(invitationId: string, financeId?: string): Promise<Invitation> {
    try {
      const headers: Record<string, string> = {};
      if (financeId) {
        headers['finance-id'] = String(financeId);
      }
      const res = await apiClient.post(
        `/invitations/${invitationId}/revoke`,
        {},
        { headers }
      );
      notifySubscribers();
      return res.data.invitation as Invitation;
    } catch (err) {
      throw extractApiError(err, 'Failed to deactivate invitation.');
    }
  },

  async deleteInvitation(invitationId: string, financeId?: string): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (financeId) {
        headers['finance-id'] = String(financeId);
      }
      await apiClient.delete(`/invitations/${invitationId}`, { headers });
      notifySubscribers();
    } catch (err) {
      throw extractApiError(err, 'Failed to delete invitation.');
    }
  },

  async listPendingDirectInvitesForUser(): Promise<Invitation[]> {
    try {
      const res = await apiClient.get('/invitations/mine/pending');
      return (res.data?.invitations || []) as Invitation[];
    } catch (err) {
      throw extractApiError(err, 'Failed to load pending invitations.');
    }
  },

  async respondToInvitation(
    invitationId: string,
    decision: 'accept' | 'decline'
  ): Promise<Invitation> {
    try {
      const res = await apiClient.post(`/invitations/${invitationId}/respond`, {
        decision,
      });
      notifySubscribers();
      return res.data.invitation as Invitation;
    } catch (err) {
      throw extractApiError(err, 'Failed to respond to invitation.');
    }
  },

  async redeemCode(
    input: string | { code: string }
  ): Promise<RedeemInviteCodeResult> {
    const code = typeof input === 'string' ? input : input.code;
    try {
      const res = await apiClient.post('/invitations/codes/redeem', {
        code: code.trim().toUpperCase(),
      });
      notifySubscribers();
      const inv = res.data.invitation as Invitation;
      const membership = res.data.membership || {
        financeId: inv.financeId,
        financeName: inv.financeName,
        role: inv.role,
      };
      return {
        invitation: inv,
        financeId: membership.financeId || inv.financeId,
        financeName: membership.financeName || inv.financeName,
        assignedRole: membership.role || inv.role,
        staffCode: inv.staffCode || null,
        membership,
      };
    } catch (err) {
      throw extractApiError(err, 'Invalid or expired invite code');
    }
  },
};

export default invitationService;
