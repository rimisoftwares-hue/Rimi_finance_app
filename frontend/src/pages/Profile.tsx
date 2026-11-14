import React, { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import { useFinanceAuth } from '../contexts/FinanceAuthContext';
import { useAuth } from '../contexts/AuthContext';
import { Building, User, Mail, Phone, MapPin, Calendar, LogOut, Shield, AlertCircle, Loader } from 'lucide-react';

interface FinanceProfile {
  id: number;
  name: string;
  owner: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
  total_customers: number;
  active_loans: number;
  total_loan_amount: number;
  recent_activities: number;
  total_payments: number;
  total_payment_amount: number;
}

interface UserProfile {
  id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
  managed_customers?: number;
  managed_agents?: number;
  managed_vehicles?: number;
  recent_activities?: number;
}

export function Profile() {
  const { finance, financeLogout } = useFinanceAuth();
  const { user, userLogout } = useAuth();
  const [financeProfile, setFinanceProfile] = useState<FinanceProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfileData();
  }, [finance, user]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch finance profile if finance is authenticated
      if (finance) {
        const financeResponse = await apiClient.get('/finance/profile');
        if (financeResponse.data.success) {
          setFinanceProfile(financeResponse.data.finance);
        }
      }

      // Fetch user profile if user is authenticated
      if (user) {
        const userResponse = await apiClient.get('/user/profile');
        if (userResponse.data.success) {
          setUserProfile(userResponse.data.user);
        }
      }
    } catch (err) {
      console.error('Error fetching profile data:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleFinanceLogout = () => {
    financeLogout();
    setFinanceProfile(null);
  };

  const handleUserLogout = () => {
    userLogout();
    setUserProfile(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading profile data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Profile</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage your account and organization details
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Finance Information Card */}
          {financeProfile && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Card Header */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-6 py-8 text-white">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <Building className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{financeProfile.name}</h2>
                    <p className="text-purple-100 opacity-90">Finance Organization</p>
                  </div>
                  <div className="bg-white/20 rounded-lg px-3 py-1 backdrop-blur-sm">
                    <span className="text-sm font-medium">ID: {financeProfile.id}</span>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-6">
                {/* Organization Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-purple-600" />
                    <span>Organization Details</span>
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <User className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">Owner</p>
                        <p className="text-gray-900 dark:text-white">{financeProfile.owner}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <Phone className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <p className="text-gray-900 dark:text-white">{financeProfile.phone || 'Not provided'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <MapPin className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">Address</p>
                        <p className="text-gray-900 dark:text-white">{financeProfile.address || 'Not provided'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <Calendar className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">Member Since</p>
                        <p className="text-gray-900 dark:text-white">{formatDate(financeProfile.created_at)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{financeProfile.total_customers}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Customers</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{financeProfile.active_loans}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Active Loans</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{financeProfile.recent_activities}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Recent Activities</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{formatCurrency(financeProfile.total_loan_amount)}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Loan Amount</p>
                  </div>
                </div>

                {/* Payment Stats */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">Payment Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Total Payments:</span>
                      <span className="font-semibold text-gray-900 dark:text-white ml-2">{financeProfile.total_payments}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Amount Collected:</span>
                      <span className="font-semibold text-gray-900 dark:text-white ml-2">
                        {formatCurrency(financeProfile.total_payment_amount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Finance Logout Button */}
                <button
                  onClick={handleFinanceLogout}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout Finance Account</span>
                </button>
              </div>
            </div>
          )}

          {/* User Information Card */}
          {userProfile && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Card Header */}
              <div className="bg-gradient-to-r from-blue-600 to-cyan-700 px-6 py-8 text-white">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <User className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{userProfile.email}</h2>
                    <p className="text-blue-100 opacity-90 capitalize">{userProfile.role} Account</p>
                  </div>
                  <div className="bg-white/20 rounded-lg px-3 py-1 backdrop-blur-sm">
                    <span className="text-sm font-medium capitalize">{userProfile.role}</span>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-6">
                {/* User Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-blue-600" />
                    <span>Account Information</span>
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <Mail className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-gray-900 dark:text-white">{userProfile.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <User className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Role</p>
                        <p className="text-gray-900 dark:text-white capitalize">{userProfile.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300">
                      <Calendar className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Member Since</p>
                        <p className="text-gray-900 dark:text-white">{formatDate(userProfile.created_at)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Role-specific Stats */}
                {userProfile.role === 'owner' && (
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{userProfile.managed_customers || 0}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Managed Customers</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{userProfile.managed_agents || 0}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Managed Agents</p>
                    </div>
                  </div>
                )}

                {userProfile.role === 'agent' && userProfile.recent_activities && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-2xl font-bold text-blue-600">{userProfile.recent_activities}</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">Activities This Week</p>
                  </div>
                )}

                {/* Permissions */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Permissions</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${userProfile.role === 'owner' ? 'bg-green-500' : 'bg-blue-500'}`} />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {userProfile.role === 'owner' ? 'Full system access' : 'Limited customer access'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {userProfile.role === 'owner' ? 'Manage agents and customers' : 'View and update customer data'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* User Logout Button */}
                <button
                  onClick={handleUserLogout}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout User Account</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* No Active Session Message */}
        {!financeProfile && !userProfile && (
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <User className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No Active Session
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Please log in to view your profile information and manage your account settings.
            </p>
          </div>
        )}
      </div>
  );
}

export default Profile;