import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';
import axios from 'axios';

const OwnerLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'connecting' | 'connected' | 'error'>('unknown');

  const { owner, ownerLogin, isLoading: authLoading } = useOwnerAuth();
  const navigate = useNavigate();
  const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

  // Check backend status on component mount
  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      setBackendStatus('connecting');
      console.log('🔍 Checking backend status...');

      const response = await axios.get(`${BASE_URL}/`, {
        timeout: 3000
      });

      if (response.data) {
        console.log('✅ Backend is connected:', response.data.message || 'Server is running');
        setBackendStatus('connected');
        setError(null);
      }
    } catch (error: any) {
      console.error('❌ Backend connection failed:', error.message);
      setBackendStatus('error');
      setError('Backend server is not responding');
      setErrorType('BACKEND_CONNECTION_FAILED');

      setDebugInfo({
        timestamp: new Date().toISOString(),
        error: error.message,
        code: error.code,
        url: `${BASE_URL}/`,
        suggestions: [
          'Check if backend server is running',
          `Verify ${BASE_URL} is running and reachable`,
          'Check if Node.js process is active'
        ]
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    setDebugInfo(null);
    setIsLoading(true);

    console.log('🚀 Starting owner login process...');
    console.log('Username:', username);
    console.log('Password length:', password?.length);

    try {
      // Step 1: Validate inputs
      if (!username.trim() || !password.trim()) {
        throw new Error('Username and password are required');
      }

      // Step 2: Check backend status before attempting login
      if (backendStatus === 'error') {
        await checkBackendStatus();
        if (backendStatus === 'error') {
          throw new Error(`Cannot connect to backend server. Please ensure the server is running on ${BASE_URL}.`);
        }
      }

      // Step 3: Try direct API call for debugging
      console.log('🔐 Attempting owner login via direct API call...');

      const startTime = Date.now();

      // First try direct API call to see raw response
      try {
        const directResponse = await axios.post(`${BASE_URL}/api/auth/owner-login`, {
          username,
          password
        }, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log('📥 Direct API Response:', {
          status: directResponse.status,
          data: directResponse.data,
          duration: `${duration}ms`
        });

        if (directResponse.data.success) {
          console.log('✅ Direct API login successful');

          // Now use the context function to properly handle the login
          console.log('🔄 Using ownerLogin context function...');
          const contextSuccess = await ownerLogin(username, password);

          if (contextSuccess) {
            console.log('✅ Context login successful, navigating...');
            // Navigate to user login
            navigate('/user-login');
          } else {
            console.warn('⚠️ Context login failed despite API success');
            setError('Login successful but session could not be established');
            setErrorType('SESSION_ERROR');
          }
        } else {
          console.warn('⚠️ API returned success: false');
          setError(directResponse.data.message || 'Invalid credentials');
          setErrorType('INVALID_CREDENTIALS');
        }

      } catch (apiError: any) {
        console.error('💥 API Call Error:', {
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status,
          config: {
            url: apiError.config?.url,
            method: apiError.config?.method,
            data: apiError.config?.data
          }
        });

        // Handle specific error cases
        if (apiError.code === 'ECONNREFUSED') {
          setError(`Backend server is not running. Please start the server on ${BASE_URL}.`);
          setErrorType('BACKEND_DOWN');
        } else if (apiError.code === 'ENETUNREACH') {
          setError('Network connection failed. Check your internet connection.');
          setErrorType('NETWORK_ERROR');
        } else if (apiError.code === 'ETIMEDOUT') {
          setError('Request timed out. Server may be busy or not responding.');
          setErrorType('TIMEOUT');
        } else if (apiError.response) {
          // Server responded with error status
          const status = apiError.response.status;
          const data = apiError.response.data;

          switch (status) {
            case 401:
              if (data.error_code === 'OWNER_NOT_FOUND') {
                setError(`Username "${username}" not found`);
                setErrorType('USERNAME_NOT_FOUND');
              } else if (data.error_code === 'INVALID_PASSWORD') {
                setError('Password is incorrect');
                setErrorType('WRONG_PASSWORD');
              } else {
                setError('Invalid username or password');
                setErrorType('INVALID_CREDENTIALS');
              }
              break;

            case 404:
              setError('Login endpoint not found. Check backend routes.');
              setErrorType('ENDPOINT_NOT_FOUND');
              break;

            case 500:
              setError('Server error occurred. Please try again later.');
              setErrorType('SERVER_ERROR');
              break;

            default:
              setError(`Error ${status}: ${data.message || 'Unknown error'}`);
              setErrorType(`HTTP_${status}`);
          }
        } else {
          // Network or other error
          setError(`Connection error: ${apiError.message}`);
          setErrorType('CONNECTION_ERROR');
        }

        // Store debug info
        setDebugInfo({
          timestamp: new Date().toISOString(),
          error: apiError.message,
          code: apiError.code,
          response: apiError.response?.data,
          status: apiError.response?.status,
          config: apiError.config
        });
      }

    } catch (err: any) {
      console.error('💥 Form submission error:', err);
      setError(err.message || 'An unexpected error occurred');
      setErrorType('FORM_ERROR');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickTest = async () => {
    setError(null);
    setErrorType(null);
    setIsLoading(true);

    console.log('🧪 Running quick test...');

    try {
      // Test 1: Backend connectivity
      console.log('1. Testing backend connectivity...');
      const healthResponse = await axios.get(`${BASE_URL}/`, { timeout: 3000 });
      console.log('✅ Backend:', healthResponse.data);

      // Test 2: Auth endpoint
      console.log('2. Testing auth endpoint...');
      const authResponse = await axios.get(`${BASE_URL}/api/auth/health`, { timeout: 3000 });
      console.log('✅ Auth endpoint:', authResponse.data);

      // Test 3: Test login with common test credentials
      console.log('3. Testing with common credentials...');
      const testCredentials = [
        { username: 'admin', password: 'admin123' },
        { username: 'owner', password: 'password' },
        { username: 'test', password: 'test123' }
      ];

      for (const cred of testCredentials) {
        try {
          const testLogin = await axios.post(`${BASE_URL}/api/auth/owner-login`, cred, { timeout: 5000 });
          if (testLogin.data.success) {
            console.log(`✅ Found working credentials: ${cred.username}`);
            setUsername(cred.username);
            setPassword(cred.password);
            setError('Test successful! Using found credentials.');
            setErrorType('TEST_SUCCESS');
            break;
          }
        } catch (testError) {
          console.log(`❌ ${cred.username}: Failed`);
        }
      }

      setDebugInfo({
        backend: healthResponse.data,
        auth: authResponse.data,
        timestamp: new Date().toISOString()
      });

    } catch (testError: any) {
      console.error('❌ Quick test failed:', testError);
      setError('Test failed: ' + testError.message);
      setErrorType('TEST_FAILED');
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = () => {
    if (!error) return null;

    switch (errorType) {
      // case 'BACKEND_CONNECTION_FAILED':
      // case 'BACKEND_DOWN':
      //   return (
      //     <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      //       <div className="flex items-center">
      //         <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      //           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      //         </svg>
      //         <h3 className="text-sm font-medium text-red-800">Backend Server Error</h3>
      //       </div>
      //       <p className="mt-2 text-sm text-red-700">{error}</p>
      //       <div className="mt-3">
      //         <h4 className="text-sm font-medium text-red-800">Troubleshooting Steps:</h4>
      //         <ul className="mt-1 text-sm text-red-700 list-disc pl-5">
      //           <li>Ensure backend server is running</li>
      //           <li>Check if https://autofinex-desktop-api.rimio.in is available</li>
      //           <li>Run <code className="bg-red-100 px-1 py-0.5 rounded">npm start</code> in backend directory</li>
      //           <li>Verify Node.js is installed and running</li>
      //         </ul>
      //       </div>
      //       <button
      //         onClick={checkBackendStatus}
      //         className="mt-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      //       >
      //         Retry Connection
      //       </button>
      //     </div>
      //   );

      case 'USERNAME_NOT_FOUND':
        return (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-medium text-yellow-800">Username Not Found</h3>
            </div>
            <p className="mt-2 text-sm text-yellow-700">{error}</p>
            <div className="mt-2 text-sm text-yellow-600">
              <p>Please check if:</p>
              <ul className="list-disc pl-5 mt-1">
                <li>Username is spelled correctly</li>
                <li>Owner account exists in database</li>
                <li>Account is active (is_active = TRUE)</li>
              </ul>
            </div>
          </div>
        );

      case 'WRONG_PASSWORD':
        return (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h3 className="text-sm font-medium text-red-800">Incorrect Password</h3>
            </div>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <p className="mt-2 text-sm text-red-600">
              Make sure you're using the correct password. Passwords are case-sensitive.
            </p>
          </div>
        );

      case 'NETWORK_ERROR':
      case 'CONNECTION_ERROR':
        return (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <h3 className="text-sm font-medium text-red-800">Network Error</h3>
            </div>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <div className="mt-2 text-sm text-red-600">
              <p>Check your network connection and try again.</p>
            </div>
          </div>
        );

      case 'SERVER_ERROR':
        return (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <h3 className="text-sm font-medium text-red-800">Server Error</h3>
            </div>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <p className="mt-2 text-sm text-red-600">
              The server encountered an error. Please try again or contact support.
            </p>
          </div>
        );

      // default:
      //   return (
      //     <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      //       <div className="flex items-center">
      //         <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      //           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      //         </svg>
      //         <h3 className="text-sm font-medium text-red-800">Error</h3>
      //       </div>
      //       <p className="mt-2 text-sm text-red-700">{error}</p>
      //     </div>
      //   );
    }
  };

  const getBackendStatusBadge = () => {
    switch (backendStatus) {
      case 'connected':
        return (
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 mr-1 bg-green-500 rounded-full"></span>
            Backend Connected
          </div>
        );
      case 'connecting':
        return (
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <span className="w-2 h-2 mr-1 bg-yellow-500 rounded-full animate-pulse"></span>
            Connecting...
          </div>
        );
      case 'error':
        return (
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <span className="w-2 h-2 mr-1 bg-red-500 rounded-full"></span>
            Backend Offline
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <span className="w-2 h-2 mr-1 bg-gray-500 rounded-full"></span>
            Unknown Status
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4" data-tauri-drag-region>
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Owner Login</h2>
          <p className="text-gray-600 mt-2">Access your finance companies dashboard</p>

          <div className="mt-4">
            {getBackendStatusBadge()}
          </div>
        </div>

        {backendStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-sm font-medium text-red-800">Backend Server Offline</span>
              </div>
              <button
                onClick={checkBackendStatus}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Retry
              </button>
            </div>
            <p className="mt-2 text-sm text-red-600">
              The backend server is not responding. You cannot login until the server is running.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Error Display */}
          {error && getErrorMessage()}

          {/* Username Field */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <div className="flex items-center">
                <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Username
              </div>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg focus:ring-2 focus:ring-offset-1 transition-colors ${errorType === 'USERNAME_NOT_FOUND'
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                  }`}
                placeholder="Enter owner username"
                required
                disabled={isLoading || backendStatus === 'error'}
                autoComplete="username"
              />
            </div>
            {errorType === 'USERNAME_NOT_FOUND' && (
              <p className="mt-1 text-xs text-red-600">
                This username was not found in the database.
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <div className="flex items-center">
                <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Password
              </div>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`block w-full pl-10 pr-3 py-3 border rounded-lg focus:ring-2 focus:ring-offset-1 transition-colors ${errorType === 'WRONG_PASSWORD'
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                  }`}
                placeholder="Enter your password"
                required
                disabled={isLoading || backendStatus === 'error'}
                autoComplete="current-password"
              />
            </div>
            {errorType === 'WRONG_PASSWORD' && (
              <p className="mt-1 text-xs text-red-600">
                The password you entered is incorrect.
              </p>
            )}
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading || backendStatus === 'error'}
            className={`w-full py-3 px-4 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center ${isLoading || backendStatus === 'error'
              ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 focus:ring-blue-500 shadow-md hover:shadow-lg'
              }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Logging in...
              </>
            ) : backendStatus === 'error' ? (
              'Server Offline'
            ) : (
              'Login as Owner'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default OwnerLogin;