import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, Building, AlertCircle, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';
import apiClient from '../api/apiClient';
import { useLoginLocation } from '../hooks/useLoginLocation';
import { PermissionModal } from '../components/common/PermissionModal';
import { AppSelect } from '../components/common/AppSelect';

interface FinanceOption {
  id: string;
  name: string;
}

const UserLogin: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedFinance, setSelectedFinance] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [policy, setPolicy] = useState<'strict' | 'prefer' | 'off'>('prefer');
  const [isLoading, setIsLoading] = useState(false);
  const [financeList, setFinanceList] = useState<FinanceOption[]>([]);

  const { user, userLogin } = useAuth();
  const { owner, isLoading: ownerLoading } = useOwnerAuth();
  const navigate = useNavigate();
  const loginLoc = useLoginLocation();

  // Load login policy on mount
  useEffect(() => {
    apiClient
      .get<{ policy?: 'strict' | 'prefer' | 'off'; locationPolicy?: 'strict' | 'prefer' | 'off' }>(
        '/auth/login-policy'
      )
      .then((r) => {
        const resolved = r.data?.policy || r.data?.locationPolicy;
        if (resolved === 'strict' || resolved === 'prefer' || resolved === 'off') {
          setPolicy(resolved);
        }
      })
      .catch(() => {
        setPolicy('prefer');
      });
  }, []);

  // Redirect to dashboard if user session is already active, or to License login if no License session
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
      return;
    }
    if (!ownerLoading && !owner) {
      navigate('/owner-login', { replace: true });
    }
  }, [user, owner, ownerLoading, navigate]);

  useEffect(() => {
    const storedFinances = localStorage.getItem('ownerFinances');
    if (storedFinances) {
      try {
        const finances = JSON.parse(storedFinances) as FinanceOption[];
        if (Array.isArray(finances) && finances.length > 0) {
          setFinanceList(finances);
          if (!selectedFinance) {
            setSelectedFinance(String(finances[0].id));
          }
          return;
        }
      } catch (err) {
        console.error('Error parsing stored finances:', err);
      }
    }

    const fetchOwnerFinances = async () => {
      try {
        const response = await apiClient.get<{ success?: boolean; finances?: FinanceOption[] }>(
          '/auth/owner-finances'
        );

        if (response.data?.success && Array.isArray(response.data.finances)) {
          setFinanceList(response.data.finances);
          localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));

          if (response.data.finances.length > 0 && !selectedFinance) {
            setSelectedFinance(String(response.data.finances[0].id));
          }
        }
      } catch (fetchErr) {
        console.error('Error fetching owner finances:', fetchErr);
      }
    };

    if (owner) {
      void fetchOwnerFinances();
    }
  }, [owner, selectedFinance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice(null);
    setIsLoading(true);

    try {
      if (!selectedFinance) {
        throw new Error('Please select a finance company');
      }

      if (!identifier.trim() || !password.trim()) {
        throw new Error('Username/phone number and password are required');
      }

      let locationPayload:
        | {
            latitude?: number;
            longitude?: number;
            accuracyM?: number;
            locationPermission?: 'granted' | 'declined' | 'blocked' | 'unavailable' | 'not_asked';
          }
        | undefined = undefined;

      if (policy !== 'off') {
        const locResult = await loginLoc.captureForLogin();
        const hasCoords = locResult.latitude != null && locResult.longitude != null;

        if (policy === 'strict' && !hasCoords) {
          setError('Location is required to log in');
          setIsLoading(false);
          return;
        }

        if (policy === 'prefer' && !hasCoords) {
          setNotice('Location is off; approximate location was recorded');
        }

        locationPayload = {
          latitude: locResult.latitude,
          longitude: locResult.longitude,
          accuracyM: locResult.accuracyM,
          locationPermission: locResult.locationPermission,
        };
      }

      const res = await userLogin(identifier, password, selectedFinance, locationPayload);

      if (res && res.success) {
        navigate('/', { replace: true });
      } else if (res?.error_code === 'LOCATION_REQUIRED') {
        setError(res?.message || 'Location is required by policy.');
        void loginLoc.captureForLogin();
      } else {
        setError(res?.message || 'Invalid credentials or finance access denied');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  if (ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
        </div>
      </div>
    );
  }

  if (!owner) {
    return null;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4 select-none"
      data-tauri-drag-region
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">User Login</h2>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              <span>License ID: {owner.username}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 p-3.5 rounded-xl flex items-start space-x-2.5">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="text-sm text-destructive">{error}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="identifier"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Username or Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="appearance-none block w-full pl-9 pr-3 py-2.5 border border-input bg-background text-foreground rounded-xl shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    placeholder="Enter username or phone number"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full pl-9 pr-10 py-2.5 border border-input bg-background text-foreground rounded-xl shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    placeholder="••••••••"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="finance"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Select Finance Company
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <Building className="h-4 w-4 text-muted-foreground" />
                </div>
                <AppSelect
                  id="finance"
                  value={selectedFinance}
                  onValueChange={(val) => setSelectedFinance(val)}
                  options={
                    financeList.length === 0
                      ? [{ value: '', label: 'Loading finance companies...' }]
                      : [
                          { value: '', label: 'Choose a finance company' },
                          ...financeList.map((finance) => ({
                            value: String(finance.id),
                            label: finance.name,
                          })),
                        ]
                  }
                  placeholder={
                    financeList.length === 0
                      ? 'Loading finance companies...'
                      : 'Choose a finance company'
                  }
                  triggerClassName="w-full h-[44px] pl-9 pr-4 border-input rounded-xl shadow-sm text-sm bg-background text-foreground"
                />
              </div>
              {financeList.length === 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Loading finance companies...
                </p>
              )}
            </div>

            {/* Location Status Row (Hidden if policy is off) */}
            {policy !== 'off' && (
              <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      loginLoc.status === 'granted' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
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

            {notice && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                {notice}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading || financeList.length === 0}
                className={`w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-200 cursor-pointer ${
                  isLoading || financeList.length === 0 ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  'Sign in to Dashboard'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

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

export default UserLogin;
