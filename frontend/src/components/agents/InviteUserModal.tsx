import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Mail, Phone, Briefcase, Clock, GraduationCap, Building,
  X, CheckCircle, AlertCircle, UserCheck, UserPlus, Loader2,
  Search, ArrowLeft, ArrowRight, Send, Shield, Calendar, Users
} from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { DatePicker } from '../ui/date-picker';
import { TimePicker } from '../ui/time-picker';
import { CapitalizedInput } from '../common/CapitalizedInput';
import type { FinanceCompany } from './UserDetailModal';

export interface SearchUserResult {
  id: string;
  username: string;
  display_name: string;
  email: string;
  phone_no: string;
  photo?: string | null;
  is_active: number | boolean;
  created_at?: string;
  memberships?: { finance_id: string; finance_name?: string; role?: string; is_active?: number }[];
  pending_invitations?: { finance_id: string; finance_name?: string; status?: string }[];
  is_member_of_target?: boolean;
  has_pending_for_target?: boolean;
}

interface InviteUserModalProps {
  onClose: () => void;
  financeCompanies: FinanceCompany[];
  onSubmit: (result: any) => void;
  onSwitchToCreateUser?: () => void;
  initialUser?: SearchUserResult | null;
}

type Stage = 'search' | 'details' | 'confirm';

export const InviteUserModal: React.FC<InviteUserModalProps> = ({
  onClose,
  financeCompanies,
  onSubmit,
  onSwitchToCreateUser,
  initialUser = null,
}) => {
  const { user: currentUser, financeList } = useAuth();

  // Derive companies list
  const companies: FinanceCompany[] = (
    financeCompanies && financeCompanies.length > 0
      ? financeCompanies
      : (financeList ?? []).map((f: any) => ({
        id: f.id,
        name: f.name ?? f.finance_name,
        owner_id: f.owner_id,
        phone_number: f.phone ?? f.phone_numbers ?? '',
        address: f.address ?? '',
      }))
  );

  // Flow stage
  const [stage, setStage] = useState<Stage>(initialUser ? 'details' : 'search');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected user
  const [selectedUser, setSelectedUser] = useState<SearchUserResult | null>(initialUser);

  // Staff and invitation form state
  const [staffName, setStaffName] = useState(initialUser?.display_name || initialUser?.username || '');
  const [staffCode, setStaffCode] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [education, setEducation] = useState('');
  const [experienceYears, setExperienceYears] = useState<number>(0);
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [loginTimeFrom, setLoginTimeFrom] = useState('');
  const [loginTimeTo, setLoginTimeTo] = useState('');
  const [role, setRole] = useState<'agent' | 'staff' | 'admin'>('agent');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(
    companies.length > 0 ? [String(companies[0].id)] : []
  );
  const [selectAllCompanies, setSelectAllCompanies] = useState(false);

  // Form submission state
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync staff name when user selected
  useEffect(() => {
    if (selectedUser && !staffName) {
      setStaffName(selectedUser.display_name || selectedUser.username);
    }
  }, [selectedUser, staffName]);

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const activeFinId = companies.length > 0 ? companies[0].id : undefined;
      const res = await apiClient.get('/auth/users/search', {
        params: {
          q: trimmed,
          financeId: activeFinId,
        },
      });

      if (res.data.success && Array.isArray(res.data.users)) {
        setSearchResults(res.data.users);
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      console.error('User search failed:', err);
      setSearchError(err.response?.data?.message || 'Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [companies]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 350);
  };

  // Company selection handlers
  const handleToggleCompany = (companyId: string) => {
    setSelectAllCompanies(false);
    setSelectedCompanies(prev =>
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  const handleSelectAllCompanies = (checked: boolean) => {
    setSelectAllCompanies(checked);
    if (checked) {
      setSelectedCompanies(companies.map(c => String(c.id)));
    } else {
      setSelectedCompanies([]);
    }
  };

  // Stage 1 -> Stage 2: Select user
  const handleSelectUser = (user: SearchUserResult) => {
    setSelectedUser(user);
    setStaffName(user.display_name || user.username);
    setFormError(null);
    setStage('details');
  };

  // Stage 2 -> Stage 3: Validate details and proceed to confirm
  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedUser) {
      setFormError('No user selected');
      setStage('search');
      return;
    }

    if (!staffCode.trim()) {
      setFormError('Staff Code is required');
      return;
    }

    if (selectedCompanies.length === 0) {
      setFormError('Please select at least one company to grant access');
      return;
    }

    setStage('confirm');
  };

  // Stage 3: Submit Invitation
  const handleSendInvitation = async () => {
    if (!selectedUser) return;
    setFormError(null);

    const token = localStorage.getItem('ownerToken');
    if (!token) {
      setFormError('Owner session expired. Please log in as owner again.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        userId: selectedUser.id,
        financeIds: selectedCompanies,
        role,
        staffCode: staffCode.trim().toUpperCase(),
        staffName: staffName.trim() || selectedUser.username,
        fatherName: fatherName.trim() || null,
        spouseName: spouseName.trim() || null,
        education: education.trim() || null,
        experienceYears: Number(experienceYears) || 0,
        joiningDate: joiningDate || null,
        loginTimeFrom: loginTimeFrom || null,
        loginTimeTo: loginTimeTo || null,
      };

      const response = await apiClient.post('/auth/users/invite-existing', payload);

      if (response.data.success) {
        setIsSuccess(true);
        setTimeout(() => {
          onSubmit(response.data);
          onClose();
        }, 1500);
      } else {
        setFormError(response.data.message || 'Failed to send invitation');
      }
    } catch (err: any) {
      console.error('Send invitation error:', err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to send invitation. Please try again.';
      setFormError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'input-field';

  return (
    <div className="fixed inset-0 bg-foreground/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-card rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-border overflow-hidden">
        
        {/* Modal Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
                Invite Existing User
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Grant existing registered users access to your finance companies
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 py-3 bg-secondary/30 border-b border-border flex items-center justify-between text-xs">
          {[
            { id: 'search', label: '1. Search User', icon: Search },
            { id: 'details', label: '2. Staff & Company', icon: GraduationCap },
            { id: 'confirm', label: '3. Review & Send', icon: Send },
          ].map((s, idx) => {
            const isActive = stage === s.id;
            const isCompleted =
              (stage === 'details' && s.id === 'search') ||
              (stage === 'confirm' && (s.id === 'search' || s.id === 'details'));

            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 font-medium transition-colors ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isCompleted
                      ? 'text-primary'
                      : 'text-muted-foreground'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isCompleted
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary border border-border text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <CheckCircle className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Form Error Alert */}
          {formError && (
            <div className="mb-5 bg-destructive/10 border-l-4 border-destructive p-4 rounded-lg flex items-start gap-3 animate-fade-in">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-destructive text-sm">Action Needed</p>
                <p className="text-xs text-destructive/90 mt-1">{formError}</p>
              </div>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-destructive/70 hover:text-destructive text-xs"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Success Banner */}
          {isSuccess && (
            <div className="my-8 py-8 text-center bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 animate-scale-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h4 className="text-xl font-bold text-card-foreground">Invitation Sent Successfully!</h4>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                <strong>{selectedUser?.username}</strong> has been granted access with staff code{' '}
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {staffCode}
                </span>.
              </p>
            </div>
          )}

          {!isSuccess && (
            <>
              {/* ─────────────────────────────────────────────────────────────
                  STAGE 1: SEARCH EXISTING USERS
              ───────────────────────────────────────────────────────────── */}
              {stage === 'search' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-card-foreground mb-2">
                      Search User by Username, Email, or Phone
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <CapitalizedInput
                        type="text"
                        casing="none"
                        autoFocus
                        placeholder="Search by username, email, or phone number..."
                        value={searchQuery}
                        onChange={e => handleSearchChange(e.target.value)}
                        className="input-field !pl-10 !pr-10 !py-3 text-sm"
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />
                      )}
                      {!isSearching && searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchResults([]);
                            setHasSearched(false);
                          }}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Enter at least 2 characters to search across registered users in the platform.
                    </p>
                  </div>

                  {/* Search Error */}
                  {searchError && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{searchError}</span>
                    </div>
                  )}

                  {/* Search Results List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>Matching Accounts ({searchResults.length})</span>
                      {hasSearched && !isSearching && (
                        <span className="text-muted-foreground/80 lowercase">query: &ldquo;{searchQuery}&rdquo;</span>
                      )}
                    </div>

                    {isSearching && (
                      <div className="py-12 text-center">
                        <Loader2 className="h-7 w-7 animate-spin mx-auto text-emerald-600 mb-2" />
                        <p className="text-xs text-muted-foreground">Searching platform directory...</p>
                      </div>
                    )}

                    {!isSearching && searchResults.length > 0 && (
                      <div className="divide-y divide-border border border-border rounded-xl overflow-hidden glass-card">
                        {searchResults.map(user => {
                          const isAlreadyMember = user.is_member_of_target;
                          const hasPending = user.has_pending_for_target;

                          return (
                            <div
                              key={user.id}
                              className="p-4 flex items-center justify-between gap-4 transition-colors hover:bg-secondary/40"
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                {user.photo ? (
                                  <img
                                    src={user.photo}
                                    alt={user.username}
                                    className="w-11 h-11 rounded-full object-cover border border-border flex-shrink-0"
                                  />
                                ) : (
                                  <div
                                    className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                                    style={{ background: 'var(--gradient-primary)' }}
                                  >
                                    {(user.display_name || user.username || 'U').charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-card-foreground truncate">
                                      {user.display_name || user.username}
                                    </p>
                                    <span className="text-xs text-muted-foreground truncate">
                                      @{user.username}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3 text-muted-foreground/70" /> {user.email}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3 text-muted-foreground/70" /> {user.phone_no}
                                    </span>
                                  </div>
                                  {/* Status tags */}
                                  <div className="flex items-center gap-2 mt-1.5">
                                    {isAlreadyMember && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                        <Shield className="h-3 w-3" /> Already Member
                                      </span>
                                    )}
                                    {hasPending && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                        <Clock className="h-3 w-3" /> Invitation Pending
                                      </span>
                                    )}
                                    {!isAlreadyMember && !hasPending && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        <CheckCircle className="h-3 w-3" /> Available to Invite
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isAlreadyMember ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectUser(user)}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                                    title="View and reassign or add other companies"
                                  >
                                    Manage
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectUser(user)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg text-emerald-950 dark:text-emerald-100 bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 border border-emerald-500/30 transition-all shadow-sm"
                                  >
                                    <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                    Invite
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isSearching && hasSearched && searchResults.length === 0 && (
                      <div className="py-12 px-4 text-center border border-dashed border-border rounded-xl">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
                        <h4 className="text-sm font-semibold text-card-foreground">No matching user found</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                          No registered user found with username, email, or phone matching &ldquo;{searchQuery}&rdquo;.
                        </p>
                        {onSwitchToCreateUser && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSwitchToCreateUser();
                            }}
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                          >
                            <UserPlus className="h-3.5 w-3.5" /> Create New User Instead
                          </button>
                        )}
                      </div>
                    )}

                    {!hasSearched && (
                      <div className="py-10 px-4 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                        <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-sm font-medium">Type a username, email, or phone to begin</p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                          You will be able to configure their role, staff code, and assigned companies before sending.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  STAGE 2: INVITATION DETAILS FORM (Staff Details & Company Access)
              ───────────────────────────────────────────────────────────── */}
              {stage === 'details' && selectedUser && (
                <form id="invite-details-form" onSubmit={handleProceedToConfirm} className="space-y-6">
                  
                  {/* Selected User Header Card */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {selectedUser.photo ? (
                        <img
                          src={selectedUser.photo}
                          alt={selectedUser.username}
                          className="w-12 h-12 rounded-full object-cover border border-emerald-500/30 flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base flex-shrink-0"
                          style={{ background: 'var(--gradient-primary)' }}
                        >
                          {(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-card-foreground text-sm truncate">
                            {selectedUser.display_name || selectedUser.username}
                          </h4>
                          <span className="text-xs text-muted-foreground font-mono">
                            @{selectedUser.username}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {selectedUser.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {selectedUser.phone_no}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStage('search')}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border flex-shrink-0"
                    >
                      Change User
                    </button>
                  </div>

                  {/* SECTION A: Staff Details (Ordered exactly as requested) */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-card-foreground pb-2 border-b border-border flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Section A: Staff Details
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 1. Staff Name */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          1. Staff Name *
                        </label>
                        <CapitalizedInput
                          type="text"
                          casing="words"
                          value={staffName}
                          onChange={e => setStaffName(e.target.value)}
                          className={inputClass}
                          placeholder="John Doe"
                          required
                        />
                      </div>

                      {/* 2. Staff Code * */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          2. Staff Code *
                        </label>
                        <CapitalizedInput
                          type="text"
                          casing="upper"
                          value={staffCode}
                          onChange={e => setStaffCode(e.target.value)}
                          className={inputClass}
                          placeholder="AGT-001"
                          required
                        />
                      </div>

                      {/* 3. Father's Name */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          3. Father&apos;s Name
                        </label>
                        <CapitalizedInput
                          type="text"
                          casing="words"
                          value={fatherName}
                          onChange={e => setFatherName(e.target.value)}
                          className={inputClass}
                          placeholder="Father's Full Name"
                        />
                      </div>

                      {/* 4. Spouse Name */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          4. Spouse Name
                        </label>
                        <CapitalizedInput
                          type="text"
                          casing="words"
                          value={spouseName}
                          onChange={e => setSpouseName(e.target.value)}
                          className={inputClass}
                          placeholder="Spouse Name (if applicable)"
                        />
                      </div>

                      {/* 5. Education */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          5. Education
                        </label>
                        <CapitalizedInput
                          type="text"
                          casing="words"
                          value={education}
                          onChange={e => setEducation(e.target.value)}
                          className={inputClass}
                          placeholder="Bachelor's Degree / Diploma"
                        />
                      </div>

                      {/* 6. Experience (Years) */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          6. Experience (Years)
                        </label>
                        <CapitalizedInput
                          type="number"
                          casing="none"
                          min="0"
                          value={experienceYears}
                          onChange={e => setExperienceYears(parseInt(e.target.value, 10) || 0)}
                          className={inputClass}
                          placeholder="0"
                        />
                      </div>

                      {/* 7. Joining Date */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5">
                          7. Joining Date
                        </label>
                        <DatePicker
                          value={joiningDate}
                          onChange={e => setJoiningDate(e.target.value)}
                          placeholder="Select Joining Date"
                        />
                      </div>

                      {/* 8. Login From Time */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> 8. Login From Time
                        </label>
                        <TimePicker
                          value={loginTimeFrom}
                          onChange={e => setLoginTimeFrom(e.target.value)}
                          placeholder="09:00 AM"
                        />
                      </div>

                      {/* 9. Login To Time */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> 9. Login To Time
                        </label>
                        <TimePicker
                          value={loginTimeTo}
                          onChange={e => setLoginTimeTo(e.target.value)}
                          placeholder="06:00 PM"
                        />
                      </div>

                      {/* 10. Role * */}
                      <div>
                        <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> 10. Role *
                        </label>
                        <select
                          value={role}
                          onChange={e => setRole(e.target.value as any)}
                          className={inputClass}
                          required
                        >
                          <option value="agent">Agent (Field Operations)</option>
                          <option value="staff">Staff (Office Operations)</option>
                          <option value="admin">Admin (Company Manager)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* SECTION B: Company Access */}
                  <div className="space-y-4 pt-2">
                    <h4 className="text-sm font-semibold text-card-foreground pb-2 border-b border-border flex items-center gap-2">
                      <Building className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Section B: Company Access *
                    </h4>

                    <div className="glass-card p-4 rounded-xl border border-border">
                      <label className="flex items-center gap-3 cursor-pointer mb-3 pb-3 border-b border-border/50">
                        <input
                          type="checkbox"
                          checked={selectAllCompanies}
                          onChange={e => handleSelectAllCompanies(e.target.checked)}
                          className="h-4 w-4 rounded border-input text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-card-foreground">Select All Companies</span>
                        <span className="badge-default text-[10px] ml-auto">{companies.length} available</span>
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                        {companies.map(company => {
                          const isSelected = selectedCompanies.includes(String(company.id));
                          const isAlreadyMember = selectedUser.memberships?.some(
                            m => String(m.finance_id) === String(company.id) && m.is_active === 1
                          );

                          return (
                            <label
                              key={company.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-emerald-500/10 border-emerald-500/40'
                                  : 'bg-secondary/30 border-border hover:border-emerald-500/20'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleCompany(String(company.id))}
                                className="h-4 w-4 rounded border-input text-emerald-600 focus:ring-emerald-500 mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-card-foreground truncate">
                                  {company.name}
                                </p>
                                {company.address && (
                                  <p className="text-[11px] text-muted-foreground truncate">{company.address}</p>
                                )}
                                {isAlreadyMember && (
                                  <span className="inline-block mt-1 text-[10px] text-amber-600 font-medium">
                                    Currently active member
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {selectedCompanies.length === 0 && (
                        <p className="mt-2 text-xs text-destructive">
                          Please select at least one company to assign.
                        </p>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  STAGE 3: FINAL CONFIRMATION (Accept & Send Invitation)
              ───────────────────────────────────────────────────────────── */}
              {stage === 'confirm' && selectedUser && (
                <div className="space-y-6">
                  <div className="text-center pb-2">
                    <h4 className="text-lg font-bold text-card-foreground">Review & Confirm Invitation</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Please verify the details below before issuing this company assignment.
                    </p>
                  </div>

                  {/* Summary Card */}
                  <div className="glass-card rounded-2xl p-5 border border-border space-y-5">
                    {/* User profile */}
                    <div className="flex items-center gap-4 pb-4 border-b border-border">
                      {selectedUser.photo ? (
                        <img
                          src={selectedUser.photo}
                          alt={selectedUser.username}
                          className="w-14 h-14 rounded-full object-cover border border-emerald-500/40"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white text-lg"
                          style={{ background: 'var(--gradient-primary)' }}
                        >
                          {(staffName || selectedUser.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h4 className="text-base font-bold text-card-foreground">{staffName}</h4>
                        <p className="text-xs text-muted-foreground font-mono">@{selectedUser.username}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{selectedUser.email}</span>
                          <span>•</span>
                          <span>{selectedUser.phone_no}</span>
                        </div>
                      </div>
                      <span className="ml-auto px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        {role}
                      </span>
                    </div>

                    {/* Staff details list */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-secondary/30">
                        <span className="text-muted-foreground block text-[11px]">Staff Code</span>
                        <span className="font-mono font-bold text-card-foreground">{staffCode}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-secondary/30">
                        <span className="text-muted-foreground block text-[11px]">Joining Date</span>
                        <span className="font-medium text-card-foreground">{joiningDate || 'Immediate'}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-secondary/30">
                        <span className="text-muted-foreground block text-[11px]">Experience</span>
                        <span className="font-medium text-card-foreground">{experienceYears} Years</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-secondary/30">
                        <span className="text-muted-foreground block text-[11px]">Education</span>
                        <span className="font-medium text-card-foreground">{education || 'Not specified'}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-secondary/30">
                        <span className="text-muted-foreground block text-[11px]">Father / Spouse</span>
                        <span className="font-medium text-card-foreground">
                          {[fatherName, spouseName].filter(Boolean).join(' / ') || 'Not specified'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-secondary/30">
                        <span className="text-muted-foreground block text-[11px]">Login Shift Window</span>
                        <span className="font-medium text-card-foreground">
                          {loginTimeFrom || loginTimeTo ? `${loginTimeFrom || 'Any'} – ${loginTimeTo || 'Any'}` : '24/7 Access'}
                        </span>
                      </div>
                    </div>

                    {/* Companies Summary */}
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                        Assigned Companies ({selectedCompanies.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedCompanies.map(cid => {
                          const c = companies.find(comp => String(comp.id) === cid);
                          return (
                            <span
                              key={cid}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20"
                            >
                              <Building className="h-3 w-3" />
                              {c?.name || cid}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Modal Footer Controls */}
        {!isSuccess && (
          <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between z-10">
            {stage === 'search' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                {onSwitchToCreateUser && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSwitchToCreateUser();
                    }}
                    className="text-xs text-primary hover:underline font-medium ml-auto mr-3"
                  >
                    Need to create a new user instead?
                  </button>
                )}
              </>
            )}

            {stage === 'details' && (
              <>
                <button
                  type="button"
                  onClick={() => setStage('search')}
                  className="btn-secondary text-xs inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Search
                </button>
                <button
                  type="submit"
                  form="invite-details-form"
                  className="btn-primary text-xs inline-flex items-center gap-1.5"
                >
                  Review Invitation <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {stage === 'confirm' && (
              <>
                <button
                  type="button"
                  onClick={() => setStage('details')}
                  disabled={isSubmitting}
                  className="btn-secondary text-xs inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Edit
                </button>
                <button
                  type="button"
                  onClick={handleSendInvitation}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending Invitation...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Accept & Send Invitation
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default InviteUserModal;
