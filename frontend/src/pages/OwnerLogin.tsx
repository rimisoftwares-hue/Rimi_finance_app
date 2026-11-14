import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';
import { useAuth, LocationLoginPayload } from '../contexts/AuthContext';
import apiClient from '../api/apiClient';
import { useLoginLocation } from '../hooks/useLoginLocation';
import { PermissionModal } from '../components/common/PermissionModal';
import { ImageSlider, ImageSlideItem } from '../components/ui/image-slider';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../components/lib/utils';

type LoginMethodTab = 'license' | 'user';

const SIGNUP_URL =
  (import.meta.env.VITE_SIGNUP_URL as string | undefined)?.trim() ||
  'https://rimio.in/autofinex';

const SHOWCASE_SLIDES: ImageSlideItem[] = [
  {
    url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
    title: 'Unified Lending & Collection Operations',
    subtitle:
      'Manage vehicle loans, consulting finance, EMI schedules, and daily field collections in one workspace.',
  },
  {
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
    title: 'Real-Time Multi-Company Accounting',
    subtitle:
      'Switch seamlessly across finance branches with Tally-grade ledgers, daybooks, and executive analytics.',
  },
  {
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
    title: 'Enterprise-Grade Access & Attendance Control',
    subtitle:
      'Role-scoped permissions, geofenced staff attendance, and instant security revocation built for scale.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 14, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 120,
      damping: 16,
    },
  },
};

const OwnerLogin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LoginMethodTab>('license');
  const [licenseId, setLicenseId] = useState('');
  const [userIdentifier, setUserIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [policy, setPolicy] = useState<'strict' | 'prefer' | 'off'>('prefer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { ownerLoginDetailed } = useOwnerAuth();
  const { directUserLogin } = useAuth();
  const navigate = useNavigate();
  const loginLoc = useLoginLocation();

  // Fetch login location policy when User tab is selected
  useEffect(() => {
    if (activeTab !== 'user') return;
    let cancelled = false;

    apiClient
      .get<{ policy?: 'strict' | 'prefer' | 'off'; locationPolicy?: 'strict' | 'prefer' | 'off' }>(
        '/auth/login-policy'
      )
      .then((res) => {
        if (cancelled) return;
        const resolved = res.data?.policy || res.data?.locationPolicy;
        if (resolved === 'strict' || resolved === 'prefer' || resolved === 'off') {
          setPolicy(resolved);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPolicy('prefer');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleSelectTab = (tab: LoginMethodTab) => {
    if (tab === activeTab || isSubmitting) return;
    setActiveTab(tab);
    setPassword('');
    setShowPassword(false);
    setError(null);
    setInfoNotice(null);
    setLocationNotice(null);
  };

  const handleForgotPassword = () => {
    setError(null);
    setInfoNotice('Password recovery will be available soon.');
  };

  const handleOpenSignUp = async () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(SIGNUP_URL);
        return;
      }
    } catch (err) {
      console.warn('Tauri shell open fallback to browser:', err);
    }

    if (typeof window !== 'undefined') {
      window.open(SIGNUP_URL, '_blank', 'noopener,noreferrer');
    }
  };

  const handleLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    const trimmedLicenseId = licenseId.trim();
    if (!trimmedLicenseId || !password) {
      setError('License ID and password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await ownerLoginDetailed(trimmedLicenseId, password);
      if (result.success) {
        navigate('/user-login', { replace: true });
      } else {
        setError(result.message || 'Invalid License ID or password.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify License credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);
    setLocationNotice(null);

    const trimmedIdentifier = userIdentifier.trim();
    if (!trimmedIdentifier || !password) {
      setError('Username or phone number and password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      let locationPayload: LocationLoginPayload | undefined = undefined;

      if (policy !== 'off') {
        const locResult = await loginLoc.captureForLogin();
        const hasCoords = locResult.latitude != null && locResult.longitude != null;

        if (policy === 'strict' && !hasCoords) {
          setError('Location access is required by your organization policy to log in.');
          setIsSubmitting(false);
          return;
        }

        if (policy === 'prefer' && !hasCoords) {
          setLocationNotice('Location is off; approximate location was recorded.');
        }

        locationPayload = {
          latitude: locResult.latitude,
          longitude: locResult.longitude,
          accuracyM: locResult.accuracyM,
          locationPermission: locResult.locationPermission,
        };
      }

      const result = await directUserLogin(trimmedIdentifier, password, locationPayload);
      if (result.success) {
        navigate('/', { replace: true });
      } else if (result.error_code === 'LOCATION_REQUIRED') {
        setError(result.message || 'Location access is required by policy.');
        void loginLoc.captureForLogin();
      } else {
        setError(result.message || 'Invalid credentials or company access denied.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-6 overflow-x-hidden select-none"
      data-tauri-drag-region
    >
      <motion.div
        className="w-full max-w-5xl lg:h-[640px] grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl border border-border bg-card"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Left Side: Branded Visual Showcase Slider */}
        <div className="hidden lg:block h-full">
          <ImageSlider
            images={SHOWCASE_SLIDES}
            interval={4500}
            overlayContent={
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold tracking-wide text-white">
                  AutoFinex &middot; Rimi Software
                </span>
              </div>
            }
          />
        </div>

        {/* Right Side: Unified Authentication Card */}
        <div className="w-full h-full bg-card text-card-foreground flex flex-col items-center justify-center p-6 sm:p-8 md:p-10">
          <motion.div
            className="w-full max-w-sm"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Mobile Brand Pill */}
            <motion.div variants={itemVariants} className="lg:hidden mb-5 flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>AutoFinex</span>
              </div>
            </motion.div>

            {/* Heading & Dynamic Subtitle */}
            <motion.div variants={itemVariants} className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Welcome Back
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {activeTab === 'license'
                  ? 'Enter your License ID to activate your workspace.'
                  : 'Sign in directly with your username or phone number.'}
              </p>
            </motion.div>

            {/* Authentication Method Selector Tabs */}
            <motion.div
              variants={itemVariants}
              role="tablist"
              aria-label="Authentication Mode"
              className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/70 border border-border mb-6"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'license'}
                onClick={() => handleSelectTab('license')}
                className={cn(
                  'flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
                  activeTab === 'license'
                    ? 'bg-background text-foreground shadow-sm border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <KeyRound className="h-4 w-4 shrink-0" />
                <span>License</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'user'}
                onClick={() => handleSelectTab('user')}
                className={cn(
                  'flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
                  activeTab === 'user'
                    ? 'bg-background text-foreground shadow-sm border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <User className="h-4 w-4 shrink-0" />
                <span>User</span>
              </button>
            </motion.div>

            {/* Error Banner */}
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 flex items-start gap-2.5 text-xs sm:text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Info Banner (Forgot Password Notice) */}
            {infoNotice && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-2.5 flex items-start gap-2.5 text-xs sm:text-sm text-foreground"
              >
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span className="leading-snug">{infoNotice}</span>
              </div>
            )}

            {/* Mode A: License Login Form */}
            {activeTab === 'license' ? (
              <motion.form
                key="license-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleLicenseSubmit}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="license-id">License ID</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="license-id"
                      name="licenseId"
                      type="text"
                      autoComplete="username"
                      value={licenseId}
                      onChange={(e) => setLicenseId(e.target.value)}
                      placeholder="Enter your License ID"
                      className="pl-9 h-10 rounded-xl"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="license-password">Password</Label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-primary hover:underline focus:outline-none cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="license-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pl-9 pr-10 h-10 rounded-xl"
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 rounded-xl font-medium mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying License...
                    </>
                  ) : (
                    'Continue with License'
                  )}
                </Button>
              </motion.form>
            ) : (
              /* Mode B: Direct User Login Form */
              <motion.form
                key="direct-user-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleDirectUserSubmit}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="user-identifier">Username or Phone Number</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="user-identifier"
                      name="identifier"
                      type="text"
                      autoComplete="username"
                      value={userIdentifier}
                      onChange={(e) => setUserIdentifier(e.target.value)}
                      placeholder="Enter username or phone number"
                      className="pl-9 h-10 rounded-xl"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="user-password">Password</Label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-primary hover:underline focus:outline-none cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="user-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pl-9 pr-10 h-10 rounded-xl"
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Location Status Indicator (when attendance location policy is active) */}
                {policy !== 'off' && (
                  <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          loginLoc.status === 'granted' ? 'bg-emerald-500' : 'bg-amber-500'
                        )}
                      />
                      <span>
                        Location:{' '}
                        <strong className="font-semibold text-foreground">
                          {loginLoc.status === 'granted' ? 'Enabled' : 'Off'}
                        </strong>
                      </span>
                    </div>
                    {loginLoc.status !== 'granted' && (
                      <button
                        type="button"
                        onClick={() => void loginLoc.captureForLogin()}
                        className="text-primary hover:underline font-medium cursor-pointer"
                      >
                        Enable
                      </button>
                    )}
                  </div>
                )}

                {locationNotice && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {locationNotice}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 rounded-xl font-medium mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Log In'
                  )}
                </Button>
              </motion.form>
            )}

            {/* Sign Up External Link */}
            <motion.p
              variants={itemVariants}
              className="text-center text-sm text-muted-foreground mt-6"
            >
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={handleOpenSignUp}
                className="font-semibold text-primary hover:underline focus:outline-none cursor-pointer"
              >
                Sign up
              </button>
            </motion.p>
          </motion.div>
        </div>
      </motion.div>

      <PermissionModal
        open={loginLoc.flow.phase === 'soft' || loginLoc.flow.phase === 'blocked'}
        type="location"
        mode={loginLoc.flow.phase === 'blocked' ? 'blocked' : 'soft'}
        busy={loginLoc.flow.phase === 'requesting'}
        onAllow={loginLoc.flow.onAllow}
        onCancel={loginLoc.flow.onCancel}
        onRetry={loginLoc.flow.retryAfterSettings}
      />
    </div>
  );
};

export default OwnerLogin;
