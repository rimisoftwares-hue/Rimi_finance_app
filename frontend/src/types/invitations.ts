/**
 * Two-Mode User Invitation System — Shared TypeScript Contracts
 *
 * Mode 1: Direct Invite (exact phone/email match -> in-app notification -> Accept/Decline)
 * Mode 2: Shareable Invite Code (AFX-XXXX-XXXX, 1 / 5 / 10 / Custom 1-500 / Unlimited, 7 or 30 days, max 5 active codes per company)
 */

export type AssignableInviteRole = 'admin' | 'agent' | 'staff';

export type InviterRole = 'owner' | 'admin';

export type InvitationType = 'direct' | 'code';

/**
 * Stored / Derived status for invitations:
 * - Direct invites: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
 * - Invite codes:   'active' | 'deactivated_limit_reached' | 'deactivated_cancelled' | 'expired'
 */
export type InvitationStatus =
  | 'active'
  | 'deactivated_limit_reached'
  | 'deactivated_cancelled'
  | 'expired'
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled';

export type InvitationDisplayStatus = InvitationStatus;

export type UserSearchMode = 'phone' | 'email';

export type SearchedUserInviteState =
  | 'available'
  | 'already_in_company'
  | 'invite_pending'
  | 'self';

export interface SearchedInviteUser {
  id: string;
  username: string;
  displayName: string;
  maskedPhone: string;
  maskedEmail: string;
  photoUrl?: string | null;
  state: SearchedUserInviteState;
  existingRole?: AssignableInviteRole | 'owner';
  pendingInvitationId?: string;
}

export interface InviteRedemption {
  id?: string;
  userId: string;
  username: string;
  displayName: string;
  name: string;
  maskedPhone: string;
  redeemedAt: string; // ISO timestamp
  joinedAt: string; // ISO timestamp
}

export interface Invitation {
  id: string;
  inviteType: InvitationType;
  financeId: string;
  financeName: string;
  role: AssignableInviteRole;
  assignedRole?: AssignableInviteRole;
  status: InvitationStatus;
  derivedStatus?: InvitationStatus;
  dbStatus?: string;

  // Mode 2: Invite Code fields
  code?: string; // Format: AFX-XXXX-XXXX
  invitationCode?: string | null;
  maxUses: number | null; // null = Unlimited, or integer 1..500
  usedCount: number;
  redemptions: InviteRedemption[];

  // Mode 1: Direct Invite fields
  targetUser?: {
    id: string;
    username: string;
    displayName: string;
    maskedPhone: string;
    maskedEmail: string;
  };

  // Audit & Optional settings
  invitedByRole: InviterRole;
  invitedByName: string;
  createdByName: string;
  invitedByUserId?: string | null;
  invitedByOwnerId?: string | null;
  staffCode?: string;
  loginTimeFrom?: string;
  loginTimeTo?: string;
  createdAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
  acceptedAt?: string; // ISO timestamp
  respondedAt?: string | null; // ISO timestamp
  revokedAt?: string; // ISO timestamp
}

export interface SearchInviteUserParams {
  mode: UserSearchMode;
  value: string;
  financeId: string;
  currentUserId?: string;
  currentUserPhone?: string;
  currentUserEmail?: string;
}

export interface SendDirectInvitePayload {
  targetUserId: string;
  financeId: string;
  financeName?: string;
  role: AssignableInviteRole;
  inviterRole?: InviterRole | string;
  inviterName?: string;
  expiryDays?: number;
  staffCode?: string;
  loginTimeFrom?: string;
  loginTimeTo?: string;
}

export interface GenerateInviteCodePayload {
  financeId: string;
  financeName?: string;
  role: AssignableInviteRole;
  inviterRole?: InviterRole | string;
  inviterName?: string;
  maxUses: number | null; // null = Unlimited, 1..500
  expiryDays: 7 | 30;
  staffCode?: string;
  loginTimeFrom?: string;
  loginTimeTo?: string;
}

export interface CompanyInvitationsResponse {
  invitations: Invitation[];
  activeCodeCount: number;
  maxActiveCodes: number;
}

export interface RedeemInviteCodeResult {
  invitation: Invitation;
  financeId: string;
  financeName: string;
  assignedRole: AssignableInviteRole;
  staffCode?: string | null;
  membership: {
    financeId: string;
    financeName: string;
    role: AssignableInviteRole;
  };
}
