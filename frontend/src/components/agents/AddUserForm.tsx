import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  User, Mail, Phone, Key, Briefcase, Clock, GraduationCap,
  Building, Plus, X, CheckCircle, AlertCircle, Camera,
  UserCheck, UserPlus, Loader2, ArrowRight
} from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { FileInput } from '../form/FileInput';
import { DatePicker } from '../ui/date-picker';
import { TimePicker } from '../ui/time-picker';
import { CapitalizedInput } from '../common/CapitalizedInput';

import type { FinanceCompany, UserData } from './UserDetailModal';

interface AddUserFormProps {
  onClose: () => void;
  financeCompanies: FinanceCompany[];
  onSubmit: (user: any) => void;
  onSwitchToInvite?: (preloadedUser?: any) => void;
}

interface ExistingUserIdentity {
  id: string;
  username: string;
  email: string;
  phone_no: string;
  is_active: number | boolean;
}

const AddUserForm: React.FC<AddUserFormProps> = ({
  onClose,
  financeCompanies,
  onSubmit,
  onSwitchToInvite,
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [selectedAllCompanies, setSelectedAllCompanies] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photo file state
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Identity lookup & conflict states
  const [existingUser, setExistingUser] = useState<ExistingUserIdentity | null>(null);
  const [identityConflict, setIdentityConflict] = useState<string | null>(null);

  // Live validation states
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [matchedEmailUser, setMatchedEmailUser] = useState<ExistingUserIdentity | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [matchedPhoneUser, setMatchedPhoneUser] = useState<ExistingUserIdentity | null>(null);
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user: currentUser, financeList } = useAuth();

  // Derive companies
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

  const [newUser, setNewUser] = useState({
    // Staff details
    staff_name: '',
    staff_code: '',
    father_name: '',
    education_qualification: '',
    experience_years: 0,
    joining_date: new Date().toISOString().split('T')[0],
    login_time_from: '',
    login_time_to: '',
    role: 'agent' as 'owner' | 'admin' | 'agent' | 'staff',

    // Company Access
    allowed_companies: [] as (number | string)[],
    finance_id: '' as string | number,

    // Account details
    email: '',
    phone_no: '',
    username: '',
    password: '',
  });

  // Track if staff_name was manually modified to auto-sync with username
  const [staffNameTouched, setStaffNameTouched] = useState(false);

  // ── Debounced Username Availability Check ──
  const checkUsername = useCallback(async (username: string) => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 3) {
      setUsernameAvailable(null);
      setUsernameChecking(false);
      return;
    }
    setUsernameChecking(true);
    try {
      const res = await apiClient.get('/auth/users/check-username', {
        params: { username: trimmed },
      });
      if (res.data.success) {
        setUsernameAvailable(res.data.available);
      }
    } catch {
      setUsernameAvailable(null);
    } finally {
      setUsernameChecking(false);
    }
  }, []);

  const scheduleUsernameCheck = useCallback((username: string) => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    usernameTimerRef.current = setTimeout(() => checkUsername(username), 400);
  }, [checkUsername]);

  // ── Debounced Email Availability Check ──
  const checkEmail = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailAvailable(null);
      setEmailChecking(false);
      setMatchedEmailUser(null);
      return;
    }
    setEmailChecking(true);
    try {
      const res = await apiClient.get('/auth/users/check-email', {
        params: { email: trimmed },
      });
      if (res.data.success) {
        setEmailAvailable(res.data.available);
        setMatchedEmailUser(res.data.user || null);
      }
    } catch {
      setEmailAvailable(null);
      setMatchedEmailUser(null);
    } finally {
      setEmailChecking(false);
    }
  }, []);

  const scheduleEmailCheck = useCallback((email: string) => {
    if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
    emailTimerRef.current = setTimeout(() => checkEmail(email), 500);
  }, [checkEmail]);

  // ── Debounced Phone Availability Check ──
  const checkPhone = useCallback(async (phone: string) => {
    const trimmed = phone.trim();
    if (!trimmed || !/^[0-9]{10}$/.test(trimmed)) {
      setPhoneAvailable(null);
      setPhoneChecking(false);
      setMatchedPhoneUser(null);
      return;
    }
    setPhoneChecking(true);
    try {
      const res = await apiClient.get('/auth/users/check-phone', {
        params: { phone: trimmed },
      });
      if (res.data.success) {
        setPhoneAvailable(res.data.available);
        setMatchedPhoneUser(res.data.user || null);
      }
    } catch {
      setPhoneAvailable(null);
      setMatchedPhoneUser(null);
    } finally {
      setPhoneChecking(false);
    }
  }, []);

  const schedulePhoneCheck = useCallback((phone: string) => {
    if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    phoneTimerRef.current = setTimeout(() => checkPhone(phone), 500);
  }, [checkPhone]);

  // Combined cross-account conflict verification
  useEffect(() => {
    if (matchedEmailUser && matchedPhoneUser) {
      if (String(matchedEmailUser.id) !== String(matchedPhoneUser.id)) {
        setIdentityConflict('Email and phone number belong to different accounts. Please resolve manually.');
        setExistingUser(null);
      } else {
        setIdentityConflict(null);
        setExistingUser(matchedEmailUser);
      }
    } else if (matchedEmailUser) {
      setIdentityConflict(null);
      setExistingUser(matchedEmailUser);
    } else if (matchedPhoneUser) {
      setIdentityConflict(null);
      setExistingUser(matchedPhoneUser);
    } else {
      setIdentityConflict(null);
      setExistingUser(null);
    }
  }, [matchedEmailUser, matchedPhoneUser]);

  // ── Handlers ──
  const handleSelectAllCompanies = (checked: boolean) => {
    setSelectedAllCompanies(checked);
    if (checked) {
      const allCompanyIds = companies.map(company => company.id);
      setNewUser(prev => ({
        ...prev,
        allowed_companies: allCompanyIds,
        finance_id: allCompanyIds[0] || prev.finance_id || '',
      }));
    } else {
      setNewUser(prev => ({ ...prev, allowed_companies: [], finance_id: '' }));
    }
  };

  const handleCompanyToggle = (companyId: number | string) => {
    setSelectedAllCompanies(false);
    setNewUser(prev => {
      const newCompanies = prev.allowed_companies.some(id => String(id) === String(companyId))
        ? prev.allowed_companies.filter(id => String(id) !== String(companyId))
        : [...prev.allowed_companies, companyId];
      return {
        ...prev,
        allowed_companies: newCompanies,
        finance_id: newCompanies[0] || '',
      };
    });
  };

  const handleRoleChange = (role: 'owner' | 'admin' | 'agent' | 'staff') => {
    setNewUser(prev => ({
      ...prev,
      role,
      allowed_companies: role === 'owner' ? companies.map(c => c.id) : prev.allowed_companies,
      finance_id: role === 'owner' ? (companies[0]?.id || '') : (prev.allowed_companies[0] || prev.finance_id || ''),
    }));
    if (role === 'owner') setSelectedAllCompanies(true);
  };

  const handleStaffNameChange = (val: string) => {
    setStaffNameTouched(true);
    setNewUser(prev => ({
      ...prev,
      staff_name: val,
      username: !prev.username || prev.username === prev.staff_name ? val : prev.username,
    }));
  };

  const handleUsernameChange = (val: string) => {
    setNewUser(prev => ({
      ...prev,
      username: val,
      staff_name: !staffNameTouched && !prev.staff_name ? val : prev.staff_name,
    }));
    scheduleUsernameCheck(val);
  };

  const handleEmailChange = (val: string) => {
    setNewUser(prev => ({ ...prev, email: val }));
    scheduleEmailCheck(val);
  };

  const handlePhoneChange = (val: string) => {
    setNewUser(prev => ({ ...prev, phone_no: val }));
    schedulePhoneCheck(val);
  };

  const generateUserId = (role: string): string => {
    const timestamp = Date.now().toString().slice(-6);
    const prefix = role.toUpperCase().slice(0, 3);
    return `${prefix}${timestamp}`;
  };

  // ── Switch to Invite Existing User Flow ──
  const handleTriggerInvite = (targetUser: ExistingUserIdentity) => {
    if (onSwitchToInvite) {
      onClose();
      onSwitchToInvite(targetUser);
    }
  };

  // ── Workflow A: Create New User ──
  const handleCreateNewUser = async () => {
    const token = localStorage.getItem('ownerToken');
    if (!token) {
      setFormError('Owner session expired. Please login as owner again.');
      return;
    }

    // 1. Validate Staff Details
    if (!newUser.staff_name.trim() || !newUser.staff_code.trim()) {
      setFormError('Staff Name and Staff Code are required');
      return;
    }

    // 2. Validate Company Access
    if (newUser.role !== 'owner' && newUser.allowed_companies.length === 0) {
      setFormError('Please select at least one company in Company Access');
      return;
    }

    // 3. Validate Account Details
    if (!newUser.email || !newUser.phone_no || !newUser.username || !newUser.password) {
      setFormError('All Account Details (Email, Phone, Username, Password) are required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(newUser.phone_no)) {
      setFormError('Phone number must be exactly 10 digits');
      return;
    }

    if (newUser.username.trim().length < 3) {
      setFormError('Username must be at least 3 characters long');
      return;
    }

    if (newUser.password.length < 4) {
      setFormError('Password must be at least 4 characters long');
      return;
    }

    if (usernameAvailable === false) {
      setFormError('This username is already taken. Please choose another username.');
      return;
    }

    if (emailAvailable === false) {
      setFormError('An account with this email already exists.');
      return;
    }

    if (phoneAvailable === false) {
      setFormError('An account with this phone number already exists.');
      return;
    }

    const user_id = generateUserId(newUser.role);
    const formData = new FormData();

    if (photoFile) {
      formData.append('userPhoto', photoFile);
    }

    const userData = {
      user_id,
      email: newUser.email.trim().toLowerCase(),
      username: newUser.username.trim(),
      phone_no: newUser.phone_no.trim(),
      password: newUser.password,
      user_role: newUser.role,
      allowed_companies:
        newUser.role === 'owner'
          ? companies.map(c => c.id)
          : newUser.allowed_companies.length > 0
            ? newUser.allowed_companies
            : [],
      login_time_from: newUser.login_time_from || null,
      login_time_to: newUser.login_time_to || null,
      is_active: 1,
    };

    formData.append('user', JSON.stringify(userData));

    const primaryFinanceId = newUser.finance_id || newUser.allowed_companies[0];

    const staffDetails = {
      user_id,
      finance_id: primaryFinanceId,
      staff_name: newUser.staff_name.trim(),
      staff_code: newUser.staff_code.trim().toUpperCase(),
      father_spouse_name: newUser.father_name.trim() || null,
      experience_years: Number(newUser.experience_years) || 0,
      education_qualification: newUser.education_qualification.trim() || null,
      joining_date: newUser.joining_date || new Date().toISOString().split('T')[0],
    };

    formData.append('staff_details', JSON.stringify(staffDetails));

    const response = await apiClient.post('/auth/users/create', formData);

    if (response.data.success) {
      onSubmit(response.data.user);
      setFormSuccess(`User created successfully! User ID: ${response.data.user.user_id}`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setFormError(response.data.message || 'Failed to create user');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentUser?.role !== 'owner') {
      setFormError('Only owners can create users');
      return;
    }

    setFormError(null);
    setFormSuccess(null);

    try {
      setIsSubmitting(true);
      await handleCreateNewUser();
    } catch (err: any) {
      console.error('Create user error:', err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || 'Operation failed. Please try again.';
      setFormError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'input-field text-sm';

  return (
    <div className="fixed inset-0 bg-foreground/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-border overflow-hidden">
        
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-5 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-card-foreground flex items-center gap-2">
                Create New User
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Register a new user account with staff details and company assignments
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

        {/* Scrollable Form Body */}
        <form id="add-user-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Error Banner */}
          {formError && (
            <div className="bg-destructive/10 border-l-4 border-destructive p-4 rounded-lg flex items-start gap-3 animate-fade-in">
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
          {formSuccess && (
            <div className="bg-success/10 border-l-4 border-success p-4 rounded-lg flex items-start gap-3 animate-fade-in">
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-success text-sm">Success!</p>
                <p className="text-xs text-success/90 mt-1">{formSuccess}</p>
              </div>
            </div>
          )}

          {/* Identity Conflict Warning */}
          {identityConflict && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm">Identity Conflict</p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">{identityConflict}</p>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              1. STAFF DETAILS (Ordered exactly as requested)
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-card-foreground pb-2 border-b border-border flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              1. Staff Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Staff Name */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5">
                  Staff Name *
                </label>
                <CapitalizedInput
                  type="text"
                  casing="words"
                  value={newUser.staff_name}
                  onChange={e => handleStaffNameChange(e.target.value)}
                  className={inputClass}
                  placeholder="John Doe"
                  required
                />
              </div>

              {/* Staff Code * */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5">
                  Staff Code *
                </label>
                <CapitalizedInput
                  type="text"
                  casing="upper"
                  value={newUser.staff_code}
                  onChange={e => setNewUser({ ...newUser, staff_code: e.target.value })}
                  className={inputClass}
                  placeholder="EMP001"
                  required
                />
              </div>

              {/* Father's Name */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5">
                  Father&apos;s Name
                </label>
                <CapitalizedInput
                  type="text"
                  casing="words"
                  value={newUser.father_name}
                  onChange={e => setNewUser({ ...newUser, father_name: e.target.value })}
                  className={inputClass}
                  placeholder="Father's Full Name"
                />
              </div>


              {/* Education */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5">
                  Education
                </label>
                <CapitalizedInput
                  type="text"
                  casing="words"
                  value={newUser.education_qualification}
                  onChange={e => setNewUser({ ...newUser, education_qualification: e.target.value })}
                  className={inputClass}
                  placeholder="Bachelor's Degree / Diploma"
                />
              </div>

              {/* Experience (Years) */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5">
                  Experience (Years)
                </label>
                <CapitalizedInput
                  type="number"
                  casing="none"
                  min="0"
                  value={newUser.experience_years}
                  onChange={e =>
                    setNewUser({ ...newUser, experience_years: parseInt(e.target.value, 10) || 0 })
                  }
                  className={inputClass}
                  placeholder="0"
                />
              </div>

              {/* Joining Date */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5">
                  Joining Date
                </label>
                <DatePicker
                  value={newUser.joining_date}
                  onChange={e => setNewUser({ ...newUser, joining_date: e.target.value })}
                  placeholder="Select Joining Date"
                />
              </div>

              {/* Login From Time */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Login From Time
                </label>
                <TimePicker
                  value={newUser.login_time_from}
                  onChange={e => setNewUser({ ...newUser, login_time_from: e.target.value })}
                  placeholder="09:00 AM"
                />
              </div>

              {/* Login To Time */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Login To Time
                </label>
                <TimePicker
                  value={newUser.login_time_to}
                  onChange={e => setNewUser({ ...newUser, login_time_to: e.target.value })}
                  placeholder="06:00 PM"
                />
              </div>

              {/* Role * */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> Role *
                </label>
                <select
                  value={newUser.role}
                  onChange={e => handleRoleChange(e.target.value as any)}
                  className={inputClass}
                  required
                >
                  <option value="agent">Agent (Field Operations)</option>
                  <option value="staff">Staff (Office Operations)</option>
                  <option value="admin">Admin (Company Manager)</option>
                  <option value="owner">Owner (Full System Access)</option>
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {newUser.role === 'owner'
                    ? 'Full access across all companies'
                    : newUser.role === 'admin'
                      ? 'Company-level management'
                      : newUser.role === 'agent'
                        ? 'Field collections and operations'
                        : 'Office staff'}
                </p>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              2. COMPANY ACCESS
          ───────────────────────────────────────────────────────────── */}
          {newUser.role !== 'owner' && (
            <div className="space-y-4">
              <h4 className="text-base font-semibold text-card-foreground pb-2 border-b border-border flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                2. Company Access *
              </h4>

              <div className="glass-card p-5 rounded-xl border border-border">
                <label className="flex items-center gap-3 cursor-pointer mb-4 pb-3 border-b border-border/60">
                  <input
                    type="checkbox"
                    checked={selectedAllCompanies}
                    onChange={e => handleSelectAllCompanies(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  <span className="text-xs font-semibold text-card-foreground">Select All Companies</span>
                  <span className="badge-default text-[10px] ml-auto">{companies.length} companies available</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-52 overflow-y-auto pr-1">
                  {companies.map(company => {
                    const isSelected = newUser.allowed_companies.some(id => String(id) === String(company.id));

                    return (
                      <label
                        key={company.id}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary/40'
                            : 'bg-secondary/30 border-border hover:border-primary/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleCompanyToggle(company.id)}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-ring mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-card-foreground truncate">{company.name}</p>
                          {company.address && (
                            <p className="text-[11px] text-muted-foreground truncate">{company.address}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {companies.length === 0 && (
                    <p className="col-span-full text-xs text-muted-foreground text-center py-4">
                      No companies available in system.
                    </p>
                  )}
                </div>

                {newUser.allowed_companies.length === 0 && (
                  <p className="mt-2.5 text-xs text-destructive">
                    Please select at least one company or select &ldquo;Select All Companies&rdquo;.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              3. ACCOUNT DETAILS (With Live Backend Validation)
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-card-foreground pb-2 border-b border-border flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              3. Account Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Email Address */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email Address *
                  {emailChecking && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />}
                </label>
                <CapitalizedInput
                  type="email"
                  casing="lower"
                  value={newUser.email}
                  onChange={e => handleEmailChange(e.target.value)}
                  className={`${inputClass} ${
                    emailAvailable === true
                      ? 'border-emerald-500/60 focus:ring-emerald-500/30'
                      : emailAvailable === false
                        ? 'border-destructive/60 focus:ring-destructive/30'
                        : ''
                  }`}
                  placeholder="user@example.com"
                  required
                />
                
                {/* Email Availability & Existing User Action */}
                {emailAvailable === true && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Email address available.
                  </p>
                )}
                {emailAvailable === false && (
                  <div className="mt-1.5 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs space-y-1.5">
                    <p className="text-destructive font-medium flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> An account with this email already exists.
                    </p>
                    {matchedEmailUser && (
                      <button
                        type="button"
                        onClick={() => handleTriggerInvite(matchedEmailUser)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                      >
                        <UserPlus className="h-3 w-3" /> Invite Existing User ({matchedEmailUser.username})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Phone Number *
                  {phoneChecking && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />}
                </label>
                <CapitalizedInput
                  type="tel"
                  casing="none"
                  value={newUser.phone_no}
                  onChange={e => handlePhoneChange(e.target.value)}
                  className={`${inputClass} ${
                    phoneAvailable === true
                      ? 'border-emerald-500/60 focus:ring-emerald-500/30'
                      : phoneAvailable === false
                        ? 'border-destructive/60 focus:ring-destructive/30'
                        : ''
                  }`}
                  placeholder="9876543210"
                  required
                />

                {/* Phone Availability & Existing User Action */}
                {phoneAvailable === true && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Phone number available.
                  </p>
                )}
                {phoneAvailable === false && (
                  <div className="mt-1.5 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs space-y-1.5">
                    <p className="text-destructive font-medium flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> An account with this phone number already exists.
                    </p>
                    {matchedPhoneUser && (
                      <button
                        type="button"
                        onClick={() => handleTriggerInvite(matchedPhoneUser)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                      >
                        <UserPlus className="h-3 w-3" /> Invite Existing User ({matchedPhoneUser.username})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" /> Username *
                  {usernameChecking && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />}
                </label>
                <CapitalizedInput
                  type="text"
                  casing="words"
                  value={newUser.username}
                  onChange={e => handleUsernameChange(e.target.value)}
                  className={`${inputClass} ${
                    usernameAvailable === true
                      ? 'border-emerald-500/60 focus:ring-emerald-500/30'
                      : usernameAvailable === false
                        ? 'border-destructive/60 focus:ring-destructive/30'
                        : ''
                  }`}
                  placeholder="johndoe"
                  required
                />
                {usernameAvailable === true && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Username available.
                  </p>
                )}
                {usernameAvailable === false && (
                  <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> This username is already taken.
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-card-foreground mb-1.5 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" /> Password *
                </label>
                <CapitalizedInput
                  type="password"
                  casing="none"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  className={inputClass}
                  placeholder="••••••••"
                  required
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Minimum 4 characters</p>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              4. PROFILE PHOTO (Optional Upload)
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-card-foreground pb-2 border-b border-border flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              4. Profile Photo (Optional)
            </h4>

            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                <FileInput
                  label="Upload Staff / User Photo"
                  value={photoFile}
                  onChange={(file: File | null) => setPhotoFile(file)}
                  existingUrl={undefined}
                  enableCrop={true}
                  aspectRatio={1}
                />
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer Controls */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between z-10">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs"
            disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            type="submit"
            form="add-user-form"
            disabled={
              isSubmitting ||
              usernameAvailable === false ||
              emailAvailable === false ||
              phoneAvailable === false
            }
            className="btn-primary text-xs inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating User...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Create User
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AddUserForm;
