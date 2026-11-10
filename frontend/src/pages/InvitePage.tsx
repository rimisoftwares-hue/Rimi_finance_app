import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  Send,
  Phone,
  Mail,
  Search,
  Copy,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  SlidersHorizontal,
  Ban,
  Trash2,
  Users,
  MessageCircle,
  Link2,
  X,
  CheckCircle2,
  Share2,
  ShieldAlert,
  RotateCw,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { TimePicker } from '../components/ui/time-picker';
import { useToast } from '../components/ui/use-toast';
import { useAuth } from '../contexts/AuthContext';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';
import { MAX_ACTIVE_CODES_PER_COMPANY } from '../config/invitationConfig';
import {
  invitationService,
  deriveInvitationStatus,
  getAllowedInviteRoles,
  normalizeEmailForSearch,
  normalizePhoneForSearch,
  sanitizePhoneFieldInput,
  validateMaxUses,
} from '../services/invitationService';
import type {
  AssignableInviteRole,
  Invitation,
  InvitationDisplayStatus,
  SearchedInviteUser,
  UserSearchMode,
} from '../types/invitations';
import type { FinanceCompany } from '../components/agents/UserDetailModal';

type UsageLimitPreset = '1' | '5' | '10' | 'custom' | 'unlimited';
type CodeFilterType = 'all' | 'active' | 'deactivated';
type DirectoryTab = 'codes' | 'direct';

const ROLE_OPTIONS: {
  id: AssignableInviteRole;
  label: string;
  badgeClass: string;
}[] = [
  { id: 'admin', label: 'Admin', badgeClass: 'badge-warning' },
  { id: 'agent', label: 'Agent', badgeClass: 'badge-success' },
  { id: 'staff', label: 'Staff', badgeClass: 'badge-default' },
];

const LIMIT_PRESETS: { id: UsageLimitPreset; label: string }[] = [
  { id: '1', label: '1' },
  { id: '5', label: '5' },
  { id: '10', label: '10' },
  { id: 'custom', label: 'Custom' },
  { id: 'unlimited', label: 'Unlimited' },
];

function getRoleBadgeClass(role: string) {
  switch (role) {
    case 'owner':
      return 'badge-destructive';
    case 'admin':
      return 'badge-warning';
    case 'agent':
      return 'badge-success';
    default:
      return 'badge-default';
  }
}

function getInactiveReasonLabel(status: InvitationDisplayStatus): string {
  switch (status) {
    case 'deactivated_limit_reached':
      return 'Deactivated · Limit reached';
    case 'deactivated_cancelled':
      return 'Deactivated · Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return 'Inactive';
  }
}

function renderStatusBadge(status: InvitationDisplayStatus) {
  switch (status) {
    case 'active':
      return <span className="badge-success">Active</span>;
    case 'deactivated_limit_reached':
      return <span className="badge-warning">Deactivated · Limit reached</span>;
    case 'deactivated_cancelled':
      return <span className="badge-destructive">Deactivated · Cancelled</span>;
    case 'expired':
      return <span className="badge-default">Expired</span>;
    case 'pending':
      return <span className="badge-pending">Pending</span>;
    case 'accepted':
      return <span className="badge-success">Accepted</span>;
    case 'declined':
      return <span className="badge-destructive">Declined</span>;
    case 'cancelled':
      return <span className="badge-default">Cancelled</span>;
  }
}

function formatDateShort(dateString?: string | null) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTimeShort(dateString?: string | null) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function InvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user: currentUser, currentFinance, financeList } = useAuth();
  const { owner } = useOwnerAuth();

  const initialMode = searchParams.get('mode') === 'direct' ? 'direct' : 'code';
  const prefillSearchMode = searchParams.get('searchMode') === 'email' ? 'email' : 'phone';
  const prefillQuery = searchParams.get('query') || '';

  const effectiveInviterRole = useMemo(() => {
    if (currentUser?.role === 'owner') return 'owner';
    if (currentFinance?.user_role === 'owner') return 'owner';
    if (currentUser?.role === 'admin' || currentFinance?.user_role === 'admin') return 'admin';
    if (owner && !currentUser) return 'owner';
    return currentUser?.role || 'owner';
  }, [currentUser, currentFinance, owner]);

  const canManageInvitations =
    effectiveInviterRole === 'owner' || effectiveInviterRole === 'admin';

  const inviterDisplayName = useMemo(() => {
    return currentUser?.username || owner?.username || 'Owner';
  }, [currentUser, owner]);

  const allowedRoles = useMemo<AssignableInviteRole[]>(() => {
    const roles = getAllowedInviteRoles(effectiveInviterRole);
    return roles.length > 0 ? roles : ['agent', 'staff'];
  }, [effectiveInviterRole]);

  const availableCompanies = useMemo<FinanceCompany[]>(() => {
    const mapped: FinanceCompany[] = (financeList ?? [])
      .filter(f => {
        if (effectiveInviterRole === 'owner') return true;
        const compRole = (f.user_role || currentUser?.role || '').toLowerCase();
        return compRole === 'owner' || compRole === 'admin' || !f.user_role;
      })
      .map(f => ({
        id: f.id,
        name: f.name || f.finance_name || 'Finance Company',
        owner_id: f.owner_id,
        address: f.address || '',
      }));

    if (mapped.length > 0) return mapped;

    if (currentFinance?.id) {
      return [
        {
          id: currentFinance.id,
          name: currentFinance.name || currentFinance.finance_name || 'Finance Company',
          address: currentFinance.address || '',
        },
      ];
    }

    return [];
  }, [financeList, effectiveInviterRole, currentUser?.role, currentFinance]);

  const defaultFinanceId = useMemo(() => {
    if (
      currentFinance?.id &&
      availableCompanies.some(c => String(c.id) === String(currentFinance.id))
    ) {
      return String(currentFinance.id);
    }
    return availableCompanies[0] ? String(availableCompanies[0].id) : '';
  }, [currentFinance, availableCompanies]);

  // ── Creator State ──────────────────────────────────────────────────────────
  const [inviteMode, setInviteMode] = useState<'code' | 'direct'>(initialMode);
  const [selectedFinanceId, setSelectedFinanceId] = useState<string>(defaultFinanceId);
  const [selectedRole, setSelectedRole] = useState<AssignableInviteRole>(
    allowedRoles.includes('agent') ? 'agent' : allowedRoles[0] || 'agent'
  );
  const [limitPreset, setLimitPreset] = useState<UsageLimitPreset>('5');
  const [customLimitRaw, setCustomLimitRaw] = useState<string>('25');
  const [expiryDays, setExpiryDays] = useState<7 | 30>(7);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [staffCode, setStaffCode] = useState('');
  const [loginTimeFrom, setLoginTimeFrom] = useState('');
  const [loginTimeTo, setLoginTimeTo] = useState('');

  // Selected / Created Code Strip State
  const [selectedStripCodeId, setSelectedStripCodeId] = useState<string | null>(null);
  const selectedStripRef = useRef<HTMLDivElement>(null);

  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Direct Invite Lookup State
  const [searchMode, setSearchMode] = useState<UserSearchMode>(prefillSearchMode);
  const [phoneInput, setPhoneInput] = useState(
    prefillSearchMode === 'phone' ? sanitizePhoneFieldInput(prefillQuery) : ''
  );
  const [emailInput, setEmailInput] = useState(
    prefillSearchMode === 'email' ? prefillQuery.trim().toLowerCase() : ''
  );
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedUser, setSearchedUser] = useState<SearchedInviteUser | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didRunPrefillRef = useRef(false);

  // ── Directory State ────────────────────────────────────────────────────────
  const [companyInvitations, setCompanyInvitations] = useState<Invitation[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState<boolean>(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>('codes');
  const [codeFilter, setCodeFilter] = useState<CodeFilterType>('all');
  const [directorySearch, setDirectorySearch] = useState('');
  const [expandedRedemptions, setExpandedRedemptions] = useState<Record<string, boolean>>({});
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [invitationToDelete, setInvitationToDelete] = useState<Invitation | null>(null);

  useEffect(() => {
    if (!selectedFinanceId && defaultFinanceId) {
      setSelectedFinanceId(defaultFinanceId);
    }
  }, [defaultFinanceId, selectedFinanceId]);

  const selectedCompany = useMemo(() => {
    return (
      availableCompanies.find(c => String(c.id) === String(selectedFinanceId)) ||
      availableCompanies[0]
    );
  }, [availableCompanies, selectedFinanceId]);

  const selectedCompanyName = selectedCompany?.name || 'Finance Company';

  useEffect(() => {
    if (!allowedRoles.includes(selectedRole)) {
      setSelectedRole(allowedRoles[0] || 'agent');
    }
  }, [allowedRoles, selectedRole]);

  const loadInvitations = useCallback(async () => {
    if (!selectedFinanceId || !canManageInvitations) {
      setIsLoadingDirectory(false);
      return;
    }
    setIsLoadingDirectory(true);
    setDirectoryError(null);
    try {
      const list = await invitationService.listCompanyInvitations(
        selectedFinanceId,
        selectedCompanyName
      );
      setCompanyInvitations(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load invitations.';
      setDirectoryError(msg);
    } finally {
      setIsLoadingDirectory(false);
    }
  }, [selectedFinanceId, selectedCompanyName, canManageInvitations]);

  useEffect(() => {
    loadInvitations();
    const unsub = invitationService.subscribe(loadInvitations);
    return unsub;
  }, [loadInvitations]);

  const codeInvitations = useMemo(() => {
    return companyInvitations
      .filter(i => i.inviteType === 'code')
      .map(i => ({ ...i, derivedStatus: deriveInvitationStatus(i) }));
  }, [companyInvitations]);

  const directInvitations = useMemo(() => {
    return companyInvitations
      .filter(i => i.inviteType === 'direct')
      .map(i => ({ ...i, derivedStatus: deriveInvitationStatus(i) }));
  }, [companyInvitations]);

  const activeCodeInvitations = useMemo(() => {
    return codeInvitations.filter(i => i.derivedStatus === 'active');
  }, [codeInvitations]);

  const activeCodesCount = activeCodeInvitations.length;
  const isAtActiveCodeCap = activeCodesCount >= MAX_ACTIVE_CODES_PER_COMPANY;

  // Selected code for the Created/Selected Code Strip below the creator card
  const selectedStripInvitation = useMemo(() => {
    if (!selectedStripCodeId) return null;
    return codeInvitations.find(c => c.id === selectedStripCodeId) || null;
  }, [codeInvitations, selectedStripCodeId]);

  const filteredCodeInvitations = useMemo(() => {
    return codeInvitations.filter(inv => {
      if (codeFilter === 'active' && inv.derivedStatus !== 'active') return false;
      if (
        codeFilter === 'deactivated' &&
        inv.derivedStatus !== 'deactivated_limit_reached' &&
        inv.derivedStatus !== 'deactivated_cancelled' &&
        inv.derivedStatus !== 'expired'
      ) {
        return false;
      }
      if (directorySearch.trim()) {
        const q = directorySearch.toLowerCase().trim();
        const matchesCode = inv.code?.toLowerCase().includes(q) ?? false;
        const matchesRole = inv.role.toLowerCase().includes(q);
        const matchesTag = inv.staffCode?.toLowerCase().includes(q) ?? false;
        const matchesJoiner = inv.redemptions.some(r => r.name.toLowerCase().includes(q));
        if (!matchesCode && !matchesRole && !matchesTag && !matchesJoiner) return false;
      }
      return true;
    });
  }, [codeInvitations, codeFilter, directorySearch]);

  const filteredDirectInvitations = useMemo(() => {
    return directInvitations.filter(inv => {
      if (directorySearch.trim()) {
        const q = directorySearch.toLowerCase().trim();
        const matchesName = inv.targetUser?.displayName.toLowerCase().includes(q) ?? false;
        const matchesUser = inv.targetUser?.username.toLowerCase().includes(q) ?? false;
        const matchesRole = inv.role.toLowerCase().includes(q);
        if (!matchesName && !matchesUser && !matchesRole) return false;
      }
      return true;
    });
  }, [directInvitations, directorySearch]);

  const customLimitEvaluation = useMemo(() => {
    if (limitPreset !== 'custom') {
      return { valid: true, value: null as number | null, error: null as string | null };
    }
    const trimmed = customLimitRaw.trim();
    if (!trimmed) {
      return { valid: false, value: null, error: 'Enter a number (1–500)' };
    }
    const num = Number(trimmed);
    const check = validateMaxUses(num);
    return {
      valid: check.valid,
      value: check.valid ? num : null,
      error: check.error || null,
    };
  }, [limitPreset, customLimitRaw]);

  const resolvedMaxUses = useMemo<number | null>(() => {
    switch (limitPreset) {
      case '1':
        return 1;
      case '5':
        return 5;
      case '10':
        return 10;
      case 'unlimited':
        return null;
      case 'custom':
        return customLimitEvaluation.value;
    }
  }, [limitPreset, customLimitEvaluation.value]);

  const phoneValidation = useMemo(() => normalizePhoneForSearch(phoneInput), [phoneInput]);
  const emailValidation = useMemo(() => normalizeEmailForSearch(emailInput), [emailInput]);
  const isSearchReady =
    searchMode === 'phone' ? phoneValidation.valid : emailValidation.valid;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const triggerCopyFeedback = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2000);
  };

  const handleCopyCodeText = async (codeText: string, key = 'main-preview') => {
    const ok = await copyTextToClipboard(codeText);
    if (ok) {
      triggerCopyFeedback(key);
      toast({
        title: 'Code Copied',
        description: `${codeText} copied to clipboard.`,
      });
    }
  };

  const handleGenerateInviteCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBuilderError(null);

    if (isAtActiveCodeCap) {
      setBuilderError(
        `Max ${MAX_ACTIVE_CODES_PER_COMPANY} active codes reached. Deactivate one first.`
      );
      return;
    }

    if (limitPreset === 'custom' && !customLimitEvaluation.valid) {
      setBuilderError(customLimitEvaluation.error || 'Invalid limit.');
      return;
    }

    if (loginTimeFrom && loginTimeTo && loginTimeFrom >= loginTimeTo) {
      setBuilderError('End time must be after start time.');
      return;
    }

    setIsGeneratingCode(true);
    try {
      const saved = await invitationService.generateCode({
        financeId: selectedFinanceId,
        financeName: selectedCompanyName,
        role: selectedRole,
        inviterRole: effectiveInviterRole,
        inviterName: inviterDisplayName,
        maxUses: resolvedMaxUses,
        expiryDays,
        staffCode: staffCode.trim() || undefined,
        loginTimeFrom: loginTimeFrom || undefined,
        loginTimeTo: loginTimeTo || undefined,
      });

      setSelectedStripCodeId(saved.id);
      setDirectoryTab('codes');
      await loadInvitations();

      toast({
        title: 'Code Created',
        description: `${saved.code} is now active.`,
      });
    } catch (err: unknown) {
      setBuilderError(err instanceof Error ? err.message : 'Failed to generate code.');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const executeExactSearch = useCallback(
    async (modeParam?: UserSearchMode, overrideValue?: string, overrideFinanceId?: string) => {
      const modeToUse = modeParam || searchMode;
      const rawValue =
        overrideValue !== undefined
          ? overrideValue
          : modeToUse === 'phone'
            ? phoneInput
            : emailInput;
      const finId = overrideFinanceId || selectedFinanceId;

      if (!finId) return;

      if (modeToUse === 'phone') {
        if (!normalizePhoneForSearch(rawValue).valid) return;
      } else {
        if (!normalizeEmailForSearch(rawValue).valid) return;
      }

      setIsSearching(true);
      setSearchError(null);
      setHasSearched(true);
      setLastSearchedQuery(
        modeToUse === 'phone'
          ? normalizePhoneForSearch(rawValue).normalized
          : normalizeEmailForSearch(rawValue).normalized
      );

      try {
        const found = await invitationService.searchUser({
          mode: modeToUse,
          value: rawValue,
          financeId: finId,
          currentUserId: currentUser?.id ? String(currentUser.id) : undefined,
          currentUserPhone: currentUser?.phone_no,
          currentUserEmail: currentUser?.email,
        });
        setSearchedUser(found);
      } catch (err: unknown) {
        setSearchError(err instanceof Error ? err.message : 'Unable to search user.');
        setSearchedUser(null);
      } finally {
        setIsSearching(false);
      }
    },
    [searchMode, phoneInput, emailInput, selectedFinanceId, currentUser]
  );

  // Auto-run search if navigated from AddUserForm with prefill query
  useEffect(() => {
    if (
      !didRunPrefillRef.current &&
      initialMode === 'direct' &&
      prefillQuery &&
      selectedFinanceId
    ) {
      didRunPrefillRef.current = true;
      executeExactSearch(prefillSearchMode, prefillQuery, selectedFinanceId);
    }
  }, [initialMode, prefillQuery, prefillSearchMode, selectedFinanceId, executeExactSearch]);

  const handleSendDirectInvite = async () => {
    if (!searchedUser || searchedUser.state !== 'available' || isSendingDirect) return;

    if (loginTimeFrom && loginTimeTo && loginTimeFrom >= loginTimeTo) {
      setSearchError('End time must be after start time.');
      return;
    }

    setIsSendingDirect(true);
    setSearchError(null);

    try {
      await invitationService.sendDirectInvite({
        targetUserId: searchedUser.id,
        financeId: selectedFinanceId,
        financeName: selectedCompanyName,
        role: selectedRole,
        inviterRole: effectiveInviterRole,
        inviterName: inviterDisplayName,
        expiryDays,
        staffCode: staffCode.trim() || undefined,
        loginTimeFrom: loginTimeFrom || undefined,
        loginTimeTo: loginTimeTo || undefined,
      });

      toast({
        title: 'Invite Sent',
        description: `Sent to ${searchedUser.displayName} (@${searchedUser.username}).`,
      });

      setPhoneInput('');
      setEmailInput('');
      setSearchedUser(null);
      setHasSearched(false);
      setDirectoryTab('direct');
      await loadInvitations();
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleSelectCodeForShare = (inv: Invitation) => {
    setSelectedStripCodeId(inv.id);
    setTimeout(() => {
      selectedStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleShareVia = async (channel: 'WhatsApp' | 'Email' | 'CopyCode' | 'CopyMessage') => {
    if (!selectedStripInvitation || selectedStripInvitation.derivedStatus !== 'active') {
      return;
    }
    const codeText = selectedStripInvitation.code || '';
    const roleText = selectedStripInvitation.role.toUpperCase();
    const companyText = selectedStripInvitation.financeName || selectedCompanyName;
    const shareMessage = `Join ${companyText} on AutoFinex as ${roleText}.\nInvite Code: ${codeText}`;

    if (channel === 'CopyCode') {
      await handleCopyCodeText(codeText, 'share-code');
      return;
    }
    if (channel === 'CopyMessage') {
      const ok = await copyTextToClipboard(shareMessage);
      if (ok) {
        triggerCopyFeedback('share-msg');
        toast({ title: 'Invite Copied', description: 'Invite text copied.' });
      }
      return;
    }
    if (channel === 'WhatsApp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank');
      return;
    }
    if (channel === 'Email') {
      window.open(
        `mailto:?subject=${encodeURIComponent(`Invite to ${companyText}`)}&body=${encodeURIComponent(shareMessage)}`,
        '_blank'
      );
    }
  };

  const handleDeactivateOrCancel = async (inv: Invitation) => {
    setBusyInvitationId(inv.id);
    try {
      await invitationService.revokeInvitation(inv.id);
      toast({
        title: inv.inviteType === 'code' ? 'Code Deactivated' : 'Invite Cancelled',
        description: inv.code || inv.targetUser?.displayName || '',
      });
    } catch (err: unknown) {
      toast({
        title: 'Action Failed',
        description: err instanceof Error ? err.message : 'Unable to update.',
        variant: 'destructive',
      });
    } finally {
      setBusyInvitationId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!invitationToDelete) return;
    const target = invitationToDelete;
    setBusyInvitationId(target.id);
    setInvitationToDelete(null);

    try {
      await invitationService.deleteInvitation(target.id);
      if (selectedStripCodeId === target.id) {
        setSelectedStripCodeId(null);
      }
      toast({
        title: 'Deleted',
        description: target.code ? `${target.code} removed.` : 'Invitation removed.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Unable to delete.',
        variant: 'destructive',
      });
    } finally {
      setBusyInvitationId(null);
    }
  };

  if (!canManageInvitations) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="dashboard-card text-center space-y-4 p-8">
          <div className="h-12 w-12 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
            <p className="text-xs text-muted-foreground">
              Only company Owners and Admins can create or manage invitations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* ─── HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/AgentManagement')}
            className="h-9 w-9 p-0 rounded-xl"
            title="Back to User Management"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invitations</h1>
            <p className="text-xs text-muted-foreground">
              Create shareable invite codes or send direct invitations to existing AutoFinex users.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadInvitations}
          disabled={isLoadingDirectory}
          className="h-9 px-3.5 rounded-xl text-xs gap-1.5"
        >
          <RotateCw
            className={`h-3.5 w-3.5 ${isLoadingDirectory ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
          />
          Refresh
        </Button>
      </div>

      {/* ─── FULL-WIDTH INVITE CREATOR CARD ───────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="dashboard-card space-y-5"
      >
        {/* Mode Switcher & Active Codes Counter */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-xl bg-secondary p-1 border border-border">
            <button
              type="button"
              onClick={() => {
                setInviteMode('code');
                setBuilderError(null);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                inviteMode === 'code'
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              Invite Code
            </button>
            <button
              type="button"
              onClick={() => {
                setInviteMode('direct');
                setBuilderError(null);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                inviteMode === 'direct'
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Send className="h-3.5 w-3.5 text-primary" />
              Direct Invite
            </button>
          </div>

          <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-lg bg-secondary border border-border text-muted-foreground">
            Active codes: <strong className="text-foreground">{activeCodesCount}</strong> of{' '}
            {MAX_ACTIVE_CODES_PER_COMPANY}
          </span>
        </div>

        {/* Company & Validity Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Company</Label>
            <Select
              value={selectedFinanceId}
              onValueChange={val => {
                setSelectedFinanceId(val);
                setSelectedStripCodeId(null);
                if (inviteMode === 'direct' && hasSearched && isSearchReady) {
                  executeExactSearch(searchMode, undefined, val);
                }
              }}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {availableCompanies.map(c => (
                  <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Validity</Label>
            <Select
              value={String(expiryDays)}
              onValueChange={v => setExpiryDays(Number(v) === 30 ? 30 : 7)}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7" className="text-xs">
                  7 Days
                </SelectItem>
                <SelectItem value="30" className="text-xs">
                  30 Days
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Role Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <div className="grid grid-cols-3 gap-2.5">
            {ROLE_OPTIONS.filter(r => allowedRoles.includes(r.id)).map(rc => {
              const isSelected = selectedRole === rc.id;
              return (
                <button
                  key={rc.id}
                  type="button"
                  onClick={() => setSelectedRole(rc.id)}
                  className={`rounded-xl border-2 px-3.5 py-2.5 text-left transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-2xs'
                      : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  <span className="text-xs font-semibold text-foreground">{rc.label}</span>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-border" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── MODE A: INVITE CODE ── */}
        {inviteMode === 'code' ? (
          <form onSubmit={handleGenerateInviteCode} className="space-y-4">
            {/* Usage Limit Pills */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Usage Limit</Label>
              <div className="grid grid-cols-5 gap-2">
                {LIMIT_PRESETS.map(p => {
                  const active = limitPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setLimitPreset(p.id);
                        setBuilderError(null);
                      }}
                      className={`rounded-xl border-2 py-2 px-2 text-center text-xs font-semibold transition-all ${
                        active
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-card text-foreground hover:border-primary/40'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {limitPreset === 'custom' && (
                <div className="pt-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    placeholder="1 - 500"
                    value={customLimitRaw}
                    onChange={e => setCustomLimitRaw(e.target.value)}
                    className="h-9 text-xs font-mono max-w-[160px]"
                  />
                  {customLimitEvaluation.error && (
                    <p className="text-xs text-destructive mt-1">
                      {customLimitEvaluation.error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Optional Advanced */}
            <div className="rounded-xl border border-border bg-secondary/20 px-3.5 py-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  Advanced
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {advancedOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-2 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Staff Code
                        </Label>
                        <Input
                          placeholder="STF-01"
                          value={staffCode}
                          onChange={e => setStaffCode(e.target.value.toUpperCase())}
                          className="h-9 text-xs font-mono uppercase"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Login From
                        </Label>
                        <TimePicker
                          value={loginTimeFrom}
                          onValueChange={setLoginTimeFrom}
                          placeholder="Start"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Login To
                        </Label>
                        <TimePicker
                          value={loginTimeTo}
                          onValueChange={setLoginTimeTo}
                          placeholder="End"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {(isAtActiveCodeCap || builderError) && (
              <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {builderError ||
                    `Max ${MAX_ACTIVE_CODES_PER_COMPANY} active codes reached. Deactivate one to create another.`}
                </span>
              </div>
            )}

            <Button
              type="submit"
              disabled={
                isGeneratingCode ||
                isAtActiveCodeCap ||
                !selectedFinanceId ||
                (limitPreset === 'custom' && !customLimitEvaluation.valid)
              }
              style={{ background: 'var(--gradient-primary)' }}
              className="w-full h-10 gap-2 text-white shadow-sm"
            >
              {isGeneratingCode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Generate Code
            </Button>
          </form>
        ) : (
          /* ── MODE B: DIRECT INVITE ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-lg bg-secondary p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setSearchMode('phone');
                    setSearchedUser(null);
                    setHasSearched(false);
                    setSearchError(null);
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    searchMode === 'phone'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Phone className="h-3 w-3" /> Phone
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchMode('email');
                    setSearchedUser(null);
                    setHasSearched(false);
                    setSearchError(null);
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    searchMode === 'email'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Mail className="h-3 w-3" /> Email
                </button>
              </div>

              {searchMode === 'phone' && (
                <span className="text-xs font-mono text-muted-foreground">
                  {phoneInput.length}/10
                </span>
              )}
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (isSearchReady && !isSearching) executeExactSearch();
              }}
              className="space-y-2"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  {searchMode === 'phone' ? (
                    <>
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={searchInputRef}
                        type="tel"
                        inputMode="numeric"
                        placeholder="10-digit mobile number"
                        value={phoneInput}
                        onChange={e => {
                          setPhoneInput(sanitizePhoneFieldInput(e.target.value));
                          setSearchError(null);
                        }}
                        onPaste={e => {
                          e.preventDefault();
                          setPhoneInput(
                            sanitizePhoneFieldInput(e.clipboardData.getData('text'))
                          );
                        }}
                        className="pl-9 font-mono text-sm"
                      />
                    </>
                  ) : (
                    <>
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={searchInputRef}
                        type="email"
                        placeholder="Email address"
                        value={emailInput}
                        onChange={e => {
                          setEmailInput(e.target.value.trimStart());
                          setSearchError(null);
                        }}
                        onBlur={() => setEmailInput(prev => prev.trim().toLowerCase())}
                        className="pl-9 text-sm"
                      />
                    </>
                  )}
                </div>
                <Button type="submit" disabled={!isSearchReady || isSearching} className="gap-1.5">
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </Button>
              </div>
            </form>

            {/* Optional Advanced for Direct Invite */}
            <div className="rounded-xl border border-border bg-secondary/20 px-3.5 py-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  Advanced
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {advancedOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-2 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Staff Code
                        </Label>
                        <Input
                          placeholder="STF-01"
                          value={staffCode}
                          onChange={e => setStaffCode(e.target.value.toUpperCase())}
                          className="h-9 text-xs font-mono uppercase"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Login From
                        </Label>
                        <TimePicker
                          value={loginTimeFrom}
                          onValueChange={setLoginTimeFrom}
                          placeholder="Start"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Login To
                        </Label>
                        <TimePicker
                          value={loginTimeTo}
                          onValueChange={setLoginTimeTo}
                          placeholder="End"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Search Result */}
            <div aria-live="polite">
              {searchError && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {!isSearching && hasSearched && searchedUser && (
                <div className="p-3 rounded-xl border border-border bg-secondary/20 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0"
                      style={{ background: 'var(--gradient-primary)' }}
                    >
                      {searchedUser.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {searchedUser.displayName}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          @{searchedUser.username}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">
                        {searchedUser.maskedPhone}
                        {searchedUser.maskedEmail ? ` · ${searchedUser.maskedEmail}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {searchedUser.state === 'available' ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSendDirectInvite}
                        disabled={isSendingDirect}
                        style={{ background: 'var(--gradient-primary)' }}
                        className="h-8 gap-1.5 text-white text-xs"
                      >
                        {isSendingDirect ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Send Invite
                      </Button>
                    ) : (
                      <span className="badge-warning">
                        {searchedUser.state === 'already_in_company'
                          ? 'Already Member'
                          : searchedUser.state === 'invite_pending'
                            ? 'Pending'
                            : 'Your Account'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {!isSearching && hasSearched && !searchedUser && !searchError && (
                <div className="p-3 rounded-xl border border-dashed border-border flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    No user found for <strong className="font-mono">{lastSearchedQuery}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setInviteMode('code')}
                    className="h-7 text-xs gap-1"
                  >
                    <KeyRound className="h-3 w-3" /> Use Code
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.section>

      {/* ─── CREATED / SELECTED CODE STRIP (Directly below Creator Card) ───── */}
      <AnimatePresence>
        {selectedStripInvitation && (
          <motion.section
            ref={selectedStripRef}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="dashboard-card border-primary/30 bg-primary/5 space-y-3.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground">
                  Selected Code:
                </span>
                <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg bg-card border border-border text-foreground select-all">
                  {selectedStripInvitation.code}
                </span>
                <span className={getRoleBadgeClass(selectedStripInvitation.role)}>
                  {selectedStripInvitation.role.toUpperCase()}
                </span>
                {renderStatusBadge(selectedStripInvitation.derivedStatus!)}
                <span className="text-xs text-muted-foreground">
                  {selectedStripInvitation.financeName || selectedCompanyName}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  ({selectedStripInvitation.usedCount}/
                  {selectedStripInvitation.maxUses === null
                    ? '∞'
                    : selectedStripInvitation.maxUses}{' '}
                  used · Exp {formatDateShort(selectedStripInvitation.expiresAt)})
                </span>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStripCodeId(null)}
                className="h-7 w-7 p-0 self-end sm:self-center text-muted-foreground hover:text-foreground"
                title="Close strip"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedStripInvitation.derivedStatus !== 'active' && (
              <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/25 text-xs text-warning flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Sharing disabled — this code is{' '}
                  <strong>
                    {getInactiveReasonLabel(selectedStripInvitation.derivedStatus!)}
                  </strong>
                  .
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={selectedStripInvitation.derivedStatus !== 'active'}
                className="gap-1.5 h-9 text-xs bg-card"
                onClick={() => handleShareVia('WhatsApp')}
              >
                <MessageCircle className="h-4 w-4 text-income" />
                <span>WhatsApp</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedStripInvitation.derivedStatus !== 'active'}
                className="gap-1.5 h-9 text-xs bg-card"
                onClick={() => handleShareVia('Email')}
              >
                <Mail className="h-4 w-4 text-primary" />
                <span>Email</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedStripInvitation.derivedStatus !== 'active'}
                className="gap-1.5 h-9 text-xs bg-card"
                onClick={() => handleShareVia('CopyCode')}
              >
                {copiedKey === 'share-code' ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4 text-foreground" />
                )}
                <span>Code</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedStripInvitation.derivedStatus !== 'active'}
                className="gap-1.5 h-9 text-xs bg-card"
                onClick={() => handleShareVia('CopyMessage')}
              >
                {copiedKey === 'share-msg' ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Link2 className="h-4 w-4 text-warning" />
                )}
                <span>Message</span>
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ─── BOTTOM SECTION: INVITE DIRECTORY ────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="dashboard-card space-y-4"
      >
        {/* Top Bar: Tabs + Filter Pills + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-secondary p-1 border border-border self-start">
            <button
              type="button"
              onClick={() => setDirectoryTab('codes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                directoryTab === 'codes'
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Invite Codes ({codeInvitations.length})
            </button>
            <button
              type="button"
              onClick={() => setDirectoryTab('direct')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                directoryTab === 'direct'
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              Direct Invites ({directInvitations.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {directoryTab === 'codes' && (
              <div className="inline-flex items-center p-1 rounded-xl bg-secondary border border-border">
                {(
                  [
                    { id: 'all', label: `All (${codeInvitations.length})` },
                    { id: 'active', label: `Active (${activeCodesCount})` },
                    {
                      id: 'deactivated',
                      label: `Inactive (${codeInvitations.length - activeCodesCount})`,
                    },
                  ] as { id: CodeFilterType; label: string }[]
                ).map(pill => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setCodeFilter(pill.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      codeFilter === pill.id
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            )}

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={directorySearch}
                onChange={e => setDirectorySearch(e.target.value)}
                className="input-field !pl-8 !pr-7 !py-1.5 text-xs w-full"
              />
              {directorySearch && (
                <button
                  type="button"
                  onClick={() => setDirectorySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Loading / Error / List */}
        {isLoadingDirectory && companyInvitations.length === 0 ? (
          <div className="space-y-2.5 py-2">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-14 rounded-xl bg-secondary/50 animate-pulse border border-border/50"
              />
            ))}
          </div>
        ) : directoryError ? (
          <div className="py-8 px-4 text-center rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
            <p className="text-xs text-destructive font-medium">{directoryError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadInvitations}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : directoryTab === 'codes' ? (
          filteredCodeInvitations.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              No invite codes found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCodeInvitations.map(inv => {
                const status = inv.derivedStatus!;
                const isActive = status === 'active';
                const isExpanded = Boolean(expandedRedemptions[inv.id]);
                const pct =
                  inv.maxUses !== null && inv.maxUses > 0
                    ? Math.min(100, Math.round((inv.usedCount / inv.maxUses) * 100))
                    : inv.usedCount > 0
                      ? 35
                      : 0;

                return (
                  <div
                    key={inv.id}
                    className={`rounded-xl border transition-all px-3.5 py-2.5 ${
                      isActive
                        ? 'border-border bg-card hover:bg-secondary/30'
                        : 'border-border/60 bg-secondary/15 opacity-80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      {/* Left: Code + Role + Status + Usage + Expiry */}
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border">
                          <span className="font-mono text-xs font-bold text-foreground select-all">
                            {inv.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCodeText(inv.code || '', `dir-${inv.id}`)}
                            className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                            title="Copy"
                          >
                            {copiedKey === `dir-${inv.id}` ? (
                              <Check className="h-3 w-3 text-primary" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>

                        <span className={getRoleBadgeClass(inv.role)}>
                          {inv.role.toUpperCase()}
                        </span>

                        {renderStatusBadge(status)}

                        {/* Compact Usage + Mini Progress */}
                        <div className="flex items-center gap-2 px-2 py-0.5 rounded-md bg-secondary/50">
                          <span className="text-xs font-mono font-semibold text-foreground">
                            {inv.usedCount}/{inv.maxUses === null ? '∞' : inv.maxUses} used
                          </span>
                          <div className="w-14 hidden md:block">
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </div>

                        {inv.redemptions.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRedemptions(prev => ({
                                ...prev,
                                [inv.id]: !prev[inv.id],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Users className="h-3 w-3" />
                            <span>{inv.redemptions.length} joined</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Exp {formatDateShort(inv.expiresAt)}
                        </span>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectCodeForShare(inv)}
                          className="h-7 px-2.5 text-xs gap-1"
                        >
                          <Share2 className="h-3 w-3" />
                          Share
                        </Button>

                        {isActive && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyInvitationId === inv.id}
                            onClick={() => handleDeactivateOrCancel(inv)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            <Ban className="h-3 w-3" />
                            Deactivate
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busyInvitationId === inv.id || isActive}
                          onClick={() => setInvitationToDelete(inv)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                          title={
                            isActive
                              ? 'Deactivate code before deleting'
                              : 'Delete inactive code'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Joined Users Pills */}
                    {isExpanded && inv.redemptions.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
                        {inv.redemptions.map((r, idx) => (
                          <span
                            key={`${r.userId}-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-secondary/70 border border-border text-xs"
                          >
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                            <span className="font-medium text-foreground">{r.name}</span>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {formatDateTimeShort(r.joinedAt)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : filteredDirectInvitations.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No direct invites found
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDirectInvitations.map(inv => {
              const status = inv.derivedStatus!;
              const target = inv.targetUser;
              const canDeleteDirect =
                status === 'declined' || status === 'cancelled' || status === 'expired';
              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-border bg-card hover:bg-secondary/30 transition-all px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0"
                      style={{ background: 'var(--gradient-primary)' }}
                    >
                      {(target?.displayName || 'U').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {target?.displayName || 'Invited User'}
                    </span>
                    {target?.username && (
                      <span className="text-xs font-mono text-muted-foreground">
                        @{target.username}
                      </span>
                    )}
                    {target?.maskedPhone && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {target.maskedPhone}
                      </span>
                    )}
                    <span className={getRoleBadgeClass(inv.role)}>
                      {inv.role.toUpperCase()}
                    </span>
                    {renderStatusBadge(status)}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateShort(inv.respondedAt || inv.createdAt)}
                    </span>
                    {status === 'pending' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busyInvitationId === inv.id}
                        onClick={() => handleDeactivateOrCancel(inv)}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        Cancel
                      </Button>
                    )}
                    {canDeleteDirect && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busyInvitationId === inv.id}
                        onClick={() => setInvitationToDelete(inv)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete invitation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* ─── DELETE CONFIRMATION ALERT DIALOG ────────────────────────────── */}
      <AlertDialog
        open={Boolean(invitationToDelete)}
        onOpenChange={open => !open && setInvitationToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {invitationToDelete?.code || invitationToDelete?.targetUser?.displayName || 'Invitation'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove this inactive invitation from the directory? Existing company members who already joined will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
