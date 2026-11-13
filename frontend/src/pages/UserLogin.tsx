import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, Building, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';
import apiClient from '../api/apiClient';
import { useLoginLocation } from '../hooks/useLoginLocation';
import { PermissionModal } from '../components/common/PermissionModal';
import { AppSelect } from '../components/common/AppSelect';


interface Finance {
  id: string,
  name: string
}
const UserLogin = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedFinance, setSelectedFinance] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [policy, setPolicy] = useState<'strict' | 'prefer' | 'off'>('prefer');
  const [isLoading, setIsLoading] = useState(false);
  const [financeList, setFinanceList] = useState<Finance[]>([]);
  const { userLogin } = useAuth();
  const { owner, isLoading: ownerLoading, ownerLogout } = useOwnerAuth();
  const navigate = useNavigate();
  const loginLoc = useLoginLocation();

  // Load login policy on mount
  useEffect(() => {
    apiClient.get('/auth/login-policy')
      .then((r) => {
        if (r.data?.policy) {
          setPolicy(r.data.policy);
        }
      })
      .catch(() => {
        setPolicy('prefer');
      });
  }, []);

  // Redirect to owner login if no owner session
  useEffect(() => {
    if (!ownerLoading && !owner) {
      navigate('/owner-login');
    }
  }, [owner, ownerLoading, navigate]);

  useEffect(() => {
    // Instead of fetching directly, check if finances are in localStorage
    const storedFinances = localStorage.getItem('ownerFinances');
    if (storedFinances) {
      try {
        const finances = JSON.parse(storedFinances);
        setFinanceList(finances);

        // Auto-select first finance
        if (finances.length > 0 && !selectedFinance) {
          setSelectedFinance(String(finances[0].id));
        }
      } catch (err) {
        console.error('Error parsing stored finances:', err);
      }
    } else {
      // If not in localStorage, fetch from API via apiClient
      const fetchOwnerFinances = async () => {
        try {
          const response = await apiClient.get('/auth/owner-finances');

          if (response.data.success) {
            setFinanceList(response.data.finances);
            localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));

            // Auto-select first finance
            if (response.data.finances.length > 0 && !selectedFinance) {
              setSelectedFinance(String(response.data.finances[0].id));
            }
          }
        } catch (error) {
          console.error('Error fetching owner finances:', error);
        }
      };

      fetchOwnerFinances();
    }
  }, [selectedFinance]);

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

      // Location capture gate
      let locationPayload: {
        latitude?: number;
        longitude?: number;
        accuracyM?: number;
        locationPermission?: 'granted' | 'declined' | 'blocked' | 'unavailable' | 'not_asked';
      } | undefined = undefined;

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
        navigate('/');
      } else {
        if (res?.error_code === 'LOCATION_REQUIRED') {
          setError(res?.message || 'Location is required by policy.');
          // Re-open permission flow
          loginLoc.captureForLogin();
        } else {
          setError(res?.message || 'Invalid credentials or finance access denied');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOwnerLogout = () => {
    ownerLogout();
    navigate('/owner-login');
  };

  if (ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Make sure owner is logged in
  if (!owner) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" data-tauri-drag-region>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-8 space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">User Login</h2>
            <p className="text-sm text-gray-600 mt-1">
              Welcome back, {owner?.username}
            </p>
            <button
              onClick={handleOwnerLogout}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700"
            >
              Switch Owner Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-2">
                  Username or Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Enter username or phone number"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="••••••••"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-500 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="finance" className="block text-sm font-medium text-gray-700 mb-2">
                Select Finance Company
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <Building className="h-5 w-5 text-gray-400" />
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
                  triggerClassName="w-full h-[46px] pl-10 pr-4 border-gray-300 rounded-lg shadow-sm text-sm bg-white text-gray-900"
                />
              </div>
              {financeList.length === 0 && (
                <p className="mt-2 text-sm text-yellow-600">
                  Loading finance companies...
                </p>
              )}
            </div>

            {/* Location Status Row (Hidden if policy is off) */}
            {policy !== 'off' && (
              <div className="flex items-center justify-between text-xs px-1 text-gray-600">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      loginLoc.status === 'granted' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    Location:{' '}
                    <strong className="font-semibold text-gray-700">
                      {loginLoc.status === 'granted' ? 'Enabled' : 'Off'}
                    </strong>
                  </span>
                </div>
                {loginLoc.status !== 'granted' && (
                  <button
                    type="button"
                    onClick={() => loginLoc.captureForLogin()}
                    className="text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    Enable
                  </button>
                )}
              </div>
            )}

            {/* Non-blocking Notice */}
            {notice && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-md text-xs text-amber-800">
                {notice}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading || financeList.length === 0}
                className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 ${isLoading || financeList.length === 0 ? "opacity-70 cursor-not-allowed" : ""
                  }`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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