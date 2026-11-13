import React, { useState, useEffect } from 'react';
import {
  User, Edit, Trash2, Plus, X, CheckCircle, AlertCircle, Building,
  Mail, Phone, Key, Briefcase, Calendar, GraduationCap, Users,
  Clock, Eye, Sun, Moon, LogOut, ChevronDown, ChevronUp,
  Smartphone, MapPin, CreditCard, FileText,
  Shield, Activity, TrendingUp, UserPlus
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/apiClient';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '../components/ui/date-picker';
import { AppSelect } from '../components/common/AppSelect';

const AGENT_MGMT_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'agent', label: 'Agent' },
  { value: 'staff', label: 'Staff' },
];

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

//BriefcaseBusiness,
interface UserData {
  id: number;
  user_id: string;
  email: string;
  username: string;
  phone_no: string;
  role: 'owner' | 'admin' | 'agent' | 'staff';
  allowed_companies: (string | number)[];
  login_time_from: string | null;
  login_time_to: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  staff_details?: StaffDetails;
}

interface StaffDetails {
  id: string;
  finance_id: string | number;
  staff_name: string;
  staff_code: string;
  father_spouse_name: string;
  experience_years: number;
  education_qualification: string;
  photo: string | null;
  joining_date: string;
}

// Update the FinanceCompany interface to match your actual data structure
interface FinanceCompany {
  id: string | number;
  name: string;
  owner_id?: string | number;
  phone_number?: string | string[]; // Changed to support both string and array
  phone_numbers?: string[]; // Optional for compatibility
  address?: string;
}

// Create a UserDetailModal component
const UserDetailModal = ({ user, onClose, financeCompanies }: {
  user: UserData,
  onClose: () => void,
  financeCompanies: FinanceCompany[]
}) => {
  const getCompanyNames = (companyIds: (string | number)[]) => {
    return companyIds.map(id => {
      const company = financeCompanies.find(c => String(c.id) === String(id));
      return company ? company.name : `Company ${id}`;
    });
  };

  const formatTime = (time: string | null) => {
    if (!time) return 'Not set';
    const [hours, minutes] = time.split(':');
    return `${parseInt(hours) % 12 || 12}:${minutes} ${parseInt(hours) >= 12 ? 'PM' : 'AM'}`;
  };

  return (
    <div className="fixed inset-0 backdrop-blur-[1px] bg-black/25 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-between items-center rounded-t-2xl">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">User Details</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{user.username} ({user.user_id})</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Header with avatar and basic info */}
          <div className="flex items-start space-x-6 mb-8">
            <div className="h-24 w-24 flex-shrink-0 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 rounded-full flex items-center justify-center">
              <User className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{user.username}</h2>
                  <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
                </div>
                <span className={`inline-flex px-4 py-2 rounded-full text-sm font-semibold ${user.role === 'owner' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                    user.role === 'admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      user.role === 'agent' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                  {user.role.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{user.phone_no}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Joined {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-gray-400" />
                  <span className={`text-sm ${user.is_active ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Last login: {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Login Time Restrictions */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-blue-600" />
              Login Time Restrictions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Login From</span>
                  <Sun className="h-5 w-5 text-yellow-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTime(user.login_time_from)}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Login To</span>
                  <Moon className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTime(user.login_time_to)}
                </p>
              </div>
            </div>
            {user.login_time_from && user.login_time_to ? (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                User can only log in between {formatTime(user.login_time_from)} and {formatTime(user.login_time_to)}
              </p>
            ) : (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                No login time restrictions set
              </p>
            )}
          </div>

          {/* Company Access */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Building className="h-5 w-5 mr-2 text-blue-600" />
              Company Access
            </h3>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
              {user.role === 'owner' ? (
                <div className="flex items-center space-x-3">
                  <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  <div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">Full System Access</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Access to all companies and features</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    This user has access to {user.allowed_companies?.length || 0} companies
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {user.allowed_companies?.map(companyId => {
                      const company = financeCompanies.find(c => c.id === companyId);
                      return company ? (
                        <div key={companyId} className="flex items-center space-x-4 p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                          <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <Building className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{company.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{company.address}</p>
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Staff Details Section (if available) */}
          {user.staff_details && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
                Staff Details
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Staff Name</p>
                    <p className="font-medium text-gray-900 dark:text-white">{user.staff_details.staff_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Staff Code</p>
                    <p className="font-medium text-gray-900 dark:text-white">{user.staff_details.staff_code}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Father/Spouse</p>
                    <p className="font-medium text-gray-900 dark:text-white">{user.staff_details.father_spouse_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Experience</p>
                    <p className="font-medium text-gray-900 dark:text-white">{user.staff_details.experience_years} years</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Education</p>
                    <p className="font-medium text-gray-900 dark:text-white">{user.staff_details.education_qualification || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Joining Date</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {new Date(user.staff_details.joining_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
              User Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                <p className="text-sm text-blue-600 dark:text-blue-400">Assigned Companies</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{user.allowed_companies?.length || 0}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <p className="text-sm text-green-600 dark:text-green-400">Account Status</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-300">
                  {user.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
                <p className="text-sm text-purple-600 dark:text-purple-400">Role Level</p>
                <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                  {user.role === 'owner' ? 'Full Access' :
                    user.role === 'admin' ? 'Administrator' :
                      user.role === 'agent' ? 'Field Agent' : 'Staff'}
                </p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">Member Since</p>
                <p className="text-xl font-bold text-yellow-700 dark:text-yellow-300">
                  {new Date(user.created_at).getFullYear()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Main AgentManagement component
const AgentManagement = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [financeCompanies, setFinanceCompanies] = useState<FinanceCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  // const [darkMode, setDarkMode] = useState(false);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  const [newUser, setNewUser] = useState({
    email: '',
    username: '',
    phone_no: '',
    password: '',
    role: 'agent' as 'owner' | 'admin' | 'agent' | 'staff',
    allowed_companies: [] as (string | number)[],
    user_id: '',
    login_time_from: '',
    login_time_to: '',
    // Staff details
    staff_name: '',
    staff_code: '',
    father_spouse_name: '',
    experience_years: 0,
    education_qualification: '',
    photo: '',
    joining_date: '',
    // Set current finance ID
    finance_id: '' as string | number,
  });

  const [selectedAllCompanies, setSelectedAllCompanies] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const { user: currentUser, financeList } = useAuth();
  const navigate = useNavigate();

  // Toggle dark mode
  // useEffect(() => {
  //   const isDarkMode = localStorage.getItem('darkMode') === 'true';
  //   setDarkMode(isDarkMode);
  //   if (isDarkMode) {
  //     document.documentElement.classList.add('dark');
  //   }
  // }, []);



  // Fetch all users with their details
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch users from new endpoint
        const response = await apiClient.get('/auth/allUsers');
        // Handle response
        if (response.data.success && response.data.users) {
          // Fetch additional staff details for each user
          const usersWithDetails = await Promise.all(
            response.data.users.map(async (user: UserData) => {
              try {
                const staffResponse = await apiClient.get(`/users/${user.user_id}/staff-details`);
                if (staffResponse.data.success) {
                  return { ...user, staff_details: staffResponse.data.staff_details };
                }
              } catch (error) {
                console.error('Error fetching staff details:', error);
              }
              return user;
            })
          );

          setUsers(usersWithDetails);
        } else {
          setUsers([]);
        }

        // Use finance list from AuthContext
        if (financeList && financeList.length > 0) {
          setFinanceCompanies(financeList.map(f => ({
            id: f.id,
            name: f.name || f.finance_name || '',
            owner_id: f.owner_id,
            phone_number: Array.isArray(f.phone_numbers)
              ? f.phone_numbers[0]
              : f.phone || '',
            phone_numbers: Array.isArray(f.phone_numbers)
              ? f.phone_numbers
              : f.phone
                ? [f.phone]
                : [],
            address: f.address || ''
          })));

          // Set default finance_id for new user form
          if (financeList.length > 0) {
            setNewUser(prev => ({ ...prev, finance_id: financeList[0].id }));
          }
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [financeList]);

  // Add endpoint to get staff details
  // useEffect(() => {
  //   // Add this to your index.js routes
  //   app.get('/api/users/:userId/staff-details', async (req, res) => {
  //     try {
  //       const { userId } = req.params;
  //       const [details] = await db.query(
  //         'SELECT * FROM users_details WHERE id = ?',
  //         [userId]
  //       );

  //       res.json({
  //         success: true,
  //         staff_details: details[0] || null
  //       });
  //     } catch (err) {
  //       console.error('Error fetching staff details:', err);
  //       res.status(500).json({ 
  //         success: false, 
  //         error: 'Failed to fetch staff details' 
  //       });
  //     }
  //   });
  // }, []);

  // If current user is not an owner, show unauthorized
  if (currentUser?.role !== 'owner') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 border-l-4 border-red-500 transform transition-all duration-300 hover:scale-105">
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">Access Denied</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Owner privileges required</p>
            </div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              You don't have permission to access this page. Only owners can manage users.
            </p>
          </div>
          <div className="mt-6">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors duration-200"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle "Select All" checkbox
  const handleSelectAllCompanies = (checked: boolean) => {
    setSelectedAllCompanies(checked);
    if (checked) {
      const allCompanyIds = financeCompanies.map(company => company.id);
      setNewUser({ ...newUser, allowed_companies: allCompanyIds });
    } else {
      setNewUser({ ...newUser, allowed_companies: [] });
    }
  };

  // Handle individual company selection
  const handleCompanyToggle = (companyId: string | number) => {
    setSelectedAllCompanies(false);
    const newCompanies = newUser.allowed_companies.includes(companyId)
      ? newUser.allowed_companies.filter(id => id !== companyId)
      : [...newUser.allowed_companies, companyId];

    setNewUser({ ...newUser, allowed_companies: newCompanies });
  };

  // Generate user_id based on role and timestamp
  const generateUserId = (role: string): string => {
    const timestamp = Date.now().toString().slice(-6);
    const prefix = role.toUpperCase().slice(0, 3);
    return `${prefix}${timestamp}`;
  };

  // Handle form submission
  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();

  //   if (currentUser?.role !== 'owner') {
  //     setFormError('Only owners can create users');
  //     return;
  //   }

  //   // Reset form status
  //   setFormError(null);
  //   setFormSuccess(null);

  //   // Validate required fields
  //   if (!newUser.email || !newUser.password || !newUser.username || !newUser.phone_no) {
  //     setFormError('All basic information fields are required');
  //     return;
  //   }

  //   if (newUser.password.length < 4) {
  //     setFormError('Password must be at least 4 characters long');
  //     return;
  //   }

  //   // Validate phone number format
  //   const phoneRegex = /^[0-9]{10}$/;
  //   if (!phoneRegex.test(newUser.phone_no)) {
  //     setFormError('Phone number must be 10 digits');
  //     return;
  //   }

  //   // Validate email format
  //   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  //   if (!emailRegex.test(newUser.email)) {
  //     setFormError('Please enter a valid email address');
  //     return;
  //   }

  //   // Validate login times
  //   if (newUser.login_time_from && newUser.login_time_to) {
  //     if (newUser.login_time_from >= newUser.login_time_to) {
  //       setFormError('Login end time must be after start time');
  //       return;
  //     }
  //   }

  //   // For staff/agent roles, validate required staff details
  //   if (newUser.role === 'staff' || newUser.role === 'agent') {
  //     if (!newUser.staff_name || !newUser.staff_code) {
  //       setFormError('Staff name and staff code are required for staff/agent roles');
  //       return;
  //     }
  //     if (!newUser.finance_id) {
  //       setFormError('Finance ID is required for staff/agent roles');
  //       return;
  //     }
  //   }

  //   // Validate allowed companies
  //   if (newUser.role !== 'owner' && newUser.allowed_companies.length === 0) {
  //     setFormError('Please select at least one company or select "All Companies"');
  //     return;
  //   }

  //   try {
  //     // Generate user_id
  //     const user_id = generateUserId(newUser.role);

  //     // Prepare user data for users_new table
  //     const userData = {
  //       user_id,
  //       email: newUser.email,
  //       username: newUser.username,
  //       phone_no: newUser.phone_no,
  //       password: newUser.password,
  //       user_role: newUser.role,
  //       allowed_companies: newUser.allowed_companies,
  //       login_time_from: newUser.login_time_from || null,
  //       login_time_to: newUser.login_time_to || null,
  //       is_active: true
  //     };

  //     // Prepare staff details for users_details table (if applicable)
  //     let staffDetails = null;
  //     if (newUser.role === 'staff' || newUser.role === 'agent') {
  //       staffDetails = {
  //         user_id,
  //         finance_id: newUser.finance_id, // Set the current finance ID
  //         staff_name: newUser.staff_name,
  //         staff_code: newUser.staff_code,
  //         father_spouse_name: newUser.father_spouse_name || null,
  //         experience_years: newUser.experience_years || 0,
  //         education_qualification: newUser.education_qualification || null,
  //         photo: newUser.photo || null,
  //         joining_date: newUser.joining_date || new Date().toISOString().split('T')[0]
  //       };
  //     }

  //     // Make API call with both user data and staff details
  //     const response = await axios.post('https://autofinex-desktop-api.rimio.in/auth/users/create', {
  //       user: userData,
  //       staff_details: staffDetails
  //     }, {
  //       headers: {
  //         'owner-authorization': `Bearer ${localStorage.getItem('ownerToken')}`
  //       }
  //     });

  //     if (response.data.success) {
  //       // Add new user to list
  //       const createdUser = response.data.user;
  //       setUsers([...users, { ...createdUser, staff_details: staffDetails }]);

  //       // Show success message
  //       setFormSuccess(`User created successfully! User ID: ${createdUser.user_id}`);

  //       // Clear form
  //       setNewUser({
  //         email: '',
  //         username: '',
  //         phone_no: '',
  //         password: '',
  //         role: 'agent',
  //         allowed_companies: [],
  //         user_id: '',
  //         login_time_from: '',
  //         login_time_to: '',
  //         staff_name: '',
  //         staff_code: '',
  //         father_spouse_name: '',
  //         experience_years: 0,
  //         education_qualification: '',
  //         photo: '',
  //         joining_date: '',
  //         finance_id: financeCompanies.length > 0 ? financeCompanies[0].id : '',
  //       });
  //       setSelectedAllCompanies(false);

  //       // Close form after delay
  //       setTimeout(() => {
  //         setShowAddForm(false);
  //         setFormSuccess(null);
  //       }, 3000);
  //     }
  //   } catch (err: any) {
  //     console.error('Error creating user:', err);
  //     setFormError(err.response?.data?.message || err.response?.data?.error || 'Failed to create user');
  //   }
  // };
  // In AgentManagement.tsx, update the handleSubmit function:

  // Add this near the top of the component after other state declarations


  // Add useEffect to get ownerToken
  useEffect(() => {
    const token = localStorage.getItem('ownerToken');
    setOwnerToken(token);
  }, []);

  // Update the handleSubmit function around line 594:
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentUser?.role !== 'owner') {
      setFormError('Only owners can create users');
      return;
    }

    // Get owner token
    const token = localStorage.getItem('ownerToken');
    if (!token) {
      setFormError('Owner session expired. Please login as owner again.');
      return;
    }

    // Reset form status
    setFormError(null);
    setFormSuccess(null);

    // Validate required fields
    if (!newUser.email || !newUser.password || !newUser.username || !newUser.phone_no) {
      setFormError('All basic information fields are required');
      return;
    }

    if (newUser.password.length < 4) {
      setFormError('Password must be at least 4 characters long');
      return;
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(newUser.phone_no)) {
      setFormError('Phone number must be 10 digits');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    // Validate login times
    if (newUser.login_time_from && newUser.login_time_to) {
      if (newUser.login_time_from >= newUser.login_time_to) {
        setFormError('Login end time must be after start time');
        return;
      }
    }

    // For staff/agent roles, validate required staff details
    if (newUser.role === 'staff' || newUser.role === 'agent') {
      if (!newUser.staff_name || !newUser.staff_code) {
        setFormError('Staff name and staff code are required for staff/agent roles');
        return;
      }
      if (!newUser.finance_id) {
        setFormError('Finance ID is required for staff/agent roles');
        return;
      }
    }

    // Validate allowed companies
    if (newUser.role !== 'owner' && newUser.allowed_companies.length === 0) {
      setFormError('Please select at least one company or select "All Companies"');
      return;
    }

    try {
      // Generate user_id
      const user_id = generateUserId(newUser.role);

      // Prepare user data for users_new table
      const userData = {
        user_id,
        email: newUser.email,
        username: newUser.username,
        phone_no: newUser.phone_no,
        password: newUser.password,
        user_role: newUser.role,
        allowed_companies: newUser.role === 'owner'
          ? financeCompanies.map(c => c.id)  // Owner gets all companies
          : newUser.allowed_companies.length > 0
            ? newUser.allowed_companies
            : [],  // Empty array instead of null
        login_time_from: newUser.login_time_from || null,
        login_time_to: newUser.login_time_to || null,
        is_active: true
      };

      // Prepare staff details for users_details table (if applicable)
      let staffDetails = null;
      if (newUser.role === 'staff' || newUser.role === 'agent') {
        staffDetails = {
          user_id,
          finance_id: newUser.finance_id,
          staff_name: newUser.staff_name,
          staff_code: newUser.staff_code,
          father_spouse_name: newUser.father_spouse_name || null,
          experience_years: newUser.experience_years || 0,
          education_qualification: newUser.education_qualification || null,
          photo: newUser.photo || null,
          joining_date: newUser.joining_date || new Date().toISOString().split('T')[0]
        };
      }

      // Make API call with both user data and staff details
      const response = await apiClient.post('/auth/users/create', {
        user: userData,
        staff_details: staffDetails
      });

      if (response.data.success) {
        // Add new user to list
        const createdUser = response.data.user;

        // Fetch updated user list
        const usersResponse = await apiClient.get('/auth/allUsers');
        if (usersResponse.data.success && usersResponse.data.users) {
          // Fetch staff details for the new user
          try {
            const staffResponse = await apiClient.get(`/users/${user_id}/staff-details`);
            if (staffResponse.data.success) {
              setUsers(usersResponse.data.users.map((u: UserData) =>
                u.user_id === user_id ? { ...u, staff_details: staffResponse.data.staff_details } : u
              ));
            } else {
              setUsers(usersResponse.data.users);
            }
          } catch (staffError) {
            console.error('Error fetching staff details:', staffError);
            setUsers(usersResponse.data.users);
          }
        }

        // Show success message
        setFormSuccess(`User created successfully! User ID: ${createdUser.user_id}`);

        // Clear form
        setNewUser({
          email: '',
          username: '',
          phone_no: '',
          password: '',
          role: 'agent',
          allowed_companies: [],
          user_id: '',
          login_time_from: '',
          login_time_to: '',
          staff_name: '',
          staff_code: '',
          father_spouse_name: '',
          experience_years: 0,
          education_qualification: '',
          photo: '',
          joining_date: '',
          finance_id: financeCompanies.length > 0 ? financeCompanies[0].id : '',
        });
        setSelectedAllCompanies(false);
        // toast({
        //   title: 'Success!',
        //   description:`User created successfully! User ID: ${username}`,
        // });
        // Close form after delay
        setTimeout(() => {
          setShowAddForm(false);
          setFormSuccess(null);
        }, 3000);
      }
    } catch (err: any) {
      console.error('Error creating user:', err);
      // toast({
      //   variant: 'destructive',
      //   title: 'Submission Failed',
      //   description: result.message || 'Failed to submit form. Please try again.',
      // });
      // Better error handling
      if (err.response?.data) {
        const errorData = err.response.data;
        setFormError(errorData.message || errorData.error || 'Failed to create user');

        // Log detailed error for debugging
        console.log('Detailed error response:', errorData);
      } else {
        setFormError('Failed to create user. Please try again.');
      }
    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to deactivate this user?')) {
      return;
    }

    try {
      const response = await apiClient.delete(`/auth/users/${userId}`);

      if (response.data.success) {
        // Update user status in list
        setUsers(users.map(user =>
          user.id === userId ? { ...user, is_active: false } : user
        ));
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to deactivate user');
    }
  };

  const handleRoleChange = (selectedRole: 'owner' | 'admin' | 'agent' | 'staff') => {
    const updatedAllowedCompanies = selectedRole === 'owner'
      ? financeCompanies.map(c => c.id)
      : newUser.allowed_companies;

    setNewUser({
      ...newUser,
      role: selectedRole,
      allowed_companies: updatedAllowedCompanies
    });

    // Update the "Select All" checkbox
    if (selectedRole === 'owner') {
      setSelectedAllCompanies(true);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get role badge color
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'agent': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'staff': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Toggle user details expansion
  const toggleUserExpansion = (userId: number) => {
    setExpandedUser(expandedUser === userId ? null : userId);
  };

  // Format time for display
  const formatTimeDisplay = (time: string | null) => {
    if (!time) return 'Any time';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 bg-background'}`}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6">
        {/* Header with dark mode toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              User Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage all users across your finance companies
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/invite')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-emerald-950 dark:text-emerald-100 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all duration-200"
            >
              <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Invite
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors duration-200"
            >
              <LogOut className="h-4 w-4 mr-2 rotate-180" />
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
              </div>
              <Users className="h-10 w-10 text-blue-500 dark:text-blue-400" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Users</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {users.filter(u => u.is_active).length}
                </p>
              </div>
              <User className="h-10 w-10 text-green-500 dark:text-green-400" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Companies</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{financeCompanies.length}</p>
              </div>
              <Building className="h-10 w-10 text-purple-500 dark:text-purple-400" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center justify-center w-full h-full space-x-3 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg transition-colors duration-200 group"
            >
              <Plus className="h-8 w-8 text-yellow-600 dark:text-yellow-400 group-hover:text-yellow-700 dark:group-hover:text-yellow-300" />
              <div className="text-left">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Add New User</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Click to create user</p>
              </div>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Table Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2 sm:mb-0">
                All Users
              </h2>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="px-6 py-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
              <p className="mt-4 text-lg font-medium text-gray-700 dark:text-gray-300">Loading users...</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Please wait while we fetch the data</p>
            </div>
          ) : error ? (
            <div className="px-6 py-6">
              <div className="bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 border-l-4 border-red-500 p-4 rounded-lg shadow-md">
                <div className="flex items-start">
                  <AlertCircle className="h-6 w-6 text-red-500 dark:text-red-400 mt-0.5 mr-3" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-300">Error Loading Data</p>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition-colors text-sm"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      User Details
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Role & Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Login Times
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map(user => (
                    <React.Fragment key={user.id}>
                      <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ${expandedUser === user.id ? 'bg-blue-50 dark:bg-gray-700' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 rounded-full flex items-center justify-center cursor-pointer"
                              onClick={() => setSelectedUser(user)}>
                              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="ml-4 cursor-pointer" onClick={() => setSelectedUser(user)}>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {user.username}
                                {user.user_id && (
                                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                                    ({user.user_id})
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                                <Mail className="h-3 w-3 mr-1" />
                                {user.email}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                                <Phone className="h-3 w-3 mr-1" />
                                {user.phone_no}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getRoleColor(user.role)}`}>
                              {user.role.toUpperCase()}
                            </span>
                            <div>
                              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${user.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                                {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-300">
                            <div className="flex items-center space-x-2">
                              <Clock className="h-4 w-4 text-gray-400" />
                              <span>
                                {formatTimeDisplay(user.login_time_from)} - {formatTimeDisplay(user.login_time_to)}
                              </span>
                            </div>
                            {user.last_login && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Last login: {new Date(user.last_login).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => toggleUserExpansion(user.id)}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              title={expandedUser === user.id ? "Hide details" : "Show details"}
                            >
                              {expandedUser === user.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => setSelectedUser(user)}
                              className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                              title="View full details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              disabled={!user.is_active || user.id === Number(currentUser?.id)}
                              title={user.id === Number(currentUser?.id) ? "Cannot delete yourself" : user.is_active ? "Deactivate user" : "Already deactivated"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded details row */}
                      {expandedUser === user.id && (
                        <tr>
                          <td colSpan={4} className="px-6 py-4 bg-blue-50 dark:bg-gray-700 border-t border-blue-100 dark:border-gray-600">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Company Access</h4>
                                <div className="space-y-1">
                                  {user.allowed_companies && user.allowed_companies.length > 0 ? (
                                    user.allowed_companies.map(companyId => {
                                      const company = financeCompanies.find(c => c.id === companyId);
                                      return (
                                        <div key={companyId} className="flex items-center">
                                          <Building className="h-3 w-3 mr-2 text-gray-400" />
                                          <span className="text-sm text-gray-700 dark:text-gray-300">
                                            {company ? company.name : `Company ${companyId}`}
                                          </span>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <span className="text-sm text-gray-500 dark:text-gray-400 italic">No companies assigned</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Staff Details</h4>
                                {user.staff_details ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center">
                                      <Briefcase className="h-3 w-3 mr-2 text-gray-400" />
                                      <span className="text-sm text-gray-700 dark:text-gray-300">
                                        {user.staff_details.staff_name} ({user.staff_details.staff_code})
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      Experience: {user.staff_details.experience_years} years
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-500 dark:text-gray-400 italic">No staff details</span>
                                )}
                              </div>

                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Account Info</h4>
                                <div className="space-y-1">
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    Created: {formatDate(user.created_at)}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    User ID: {user.user_id}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <div className="h-16 w-16 mx-auto bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No users found</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">Get started by creating your first user</p>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First User
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal with Login Time Fields */}
      {showAddForm && (
        <div className="fixed inset-0 backdrop-blur-[1px] bg-black/25 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Create New User</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Add a new user to your system</p>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {formError && (
                <div className="mb-6 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 border-l-4 border-red-500 p-4 rounded-lg">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-300">Error</p>
                      <p className="text-sm text-red-700 dark:text-red-400 mt-1">{formError}</p>
                    </div>
                  </div>
                </div>
              )}

              {formSuccess && (
                <div className="mb-6 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border-l-4 border-green-500 p-4 rounded-lg">
                  <div className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-300">Success!</p>
                      <p className="text-sm text-green-700 dark:text-green-400 mt-1">{formSuccess}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {/* Basic Information Section */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <User className="h-5 w-5 inline-block mr-2 text-blue-600 dark:text-blue-400" />
                    Basic Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Mail className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="user@example.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <User className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Username *
                      </label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="john_doe"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Phone className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={newUser.phone_no}
                        onChange={(e) => setNewUser({ ...newUser, phone_no: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="9876543210"
                        pattern="[0-9]{10}"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">10 digits only</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Key className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Password *
                      </label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="••••••••"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minimum 4 characters</p>
                    </div>

                    {/* Login Time Restrictions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Login Time From
                      </label>
                      <input
                        type="time"
                        value={newUser.login_time_from}
                        onChange={(e) => setNewUser({ ...newUser, login_time_from: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Login Time To
                      </label>
                      <input
                        type="time"
                        value={newUser.login_time_to}
                        onChange={(e) => setNewUser({ ...newUser, login_time_to: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Briefcase className="h-4 w-4 inline-block mr-1 text-gray-500" />
                        Role *
                      </label>
                      <AppSelect
                        value={newUser.role}
                        onValueChange={(val) => {
                          handleRoleChange(val as any);
                        }}
                        options={AGENT_MGMT_ROLE_OPTIONS}
                        triggerClassName="w-full h-[46px] px-4 py-3 rounded-lg text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {newUser.role === 'owner' ? 'Full system access' :
                          newUser.role === 'admin' ? 'Manage all except owners' :
                            newUser.role === 'agent' ? 'Field operations' : 'Office staff'}
                      </p>
                    </div>

                    {/* Finance ID for staff/agent */}
                    {(newUser.role === 'staff' || newUser.role === 'agent') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          <Building className="h-4 w-4 inline-block mr-1 text-gray-500" />
                          Assign to Finance Company *
                        </label>
                        <AppSelect
                          value={String(newUser.finance_id ?? '')}
                          onValueChange={(val) => setNewUser({ ...newUser, finance_id: val })}
                          options={[
                            { value: '', label: 'Select Finance Company' },
                            ...financeCompanies.map((company) => ({
                              value: String(company.id),
                              label: `${company.name} - ${company.address}`,
                            })),
                          ]}
                          placeholder="Select Finance Company"
                          triggerClassName="w-full h-[46px] px-4 py-3 rounded-lg text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          This will be the user's default finance company
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Company Access Section */}
                {(newUser.role === 'admin' || newUser.role === 'agent' || newUser.role === 'staff') && (
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <Building className="h-5 w-5 inline-block mr-2 text-blue-600 dark:text-blue-400" />
                      Company Access
                    </h4>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
                      <div className="mb-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAllCompanies}
                            onChange={(e) => handleSelectAllCompanies(e.target.checked)}
                            className="h-5 w-5 text-blue-600 dark:text-blue-400 rounded focus:ring-blue-500 dark:focus:ring-blue-400"
                          />
                          <span className="text-lg font-medium text-gray-900 dark:text-white">Select All Companies</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full">
                            {financeCompanies.length} companies
                          </span>
                        </label>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          Grant access to all finance companies under your ownership
                        </p>
                      </div>

                      {!selectedAllCompanies && (
                        <>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                            Or select specific companies:
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-60 overflow-y-auto p-2">
                            {financeCompanies.map(company => (
                              <label
                                key={company.id}
                                className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${newUser.allowed_companies.includes(company.id)
                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600'
                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                                  }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={newUser.allowed_companies.includes(company.id)}
                                  onChange={() => handleCompanyToggle(company.id)}
                                  className="h-4 w-4 text-blue-600 dark:text-blue-400 rounded focus:ring-blue-500 dark:focus:ring-blue-400"
                                />
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900 dark:text-white">{company.name}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{company.address}</p>
                                  <div className="flex items-center mt-2 text-xs text-gray-400 dark:text-gray-500">
                                    <Phone className="h-3 w-3 mr-1" />
                                    {company.phone_numbers}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          Selected Companies: {newUser.allowed_companies.length} of {financeCompanies.length}
                        </p>
                        {newUser.allowed_companies.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {newUser.allowed_companies.map(companyId => {
                              const company = financeCompanies.find(c => c.id === companyId);
                              return company ? (
                                <span
                                  key={companyId}
                                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                                >
                                  <Building className="h-3 w-3 mr-1" />
                                  {company.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Staff Details Section (for staff/agent roles) */}
                {(newUser.role === 'staff' || newUser.role === 'agent') && (
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <GraduationCap className="h-5 w-5 inline-block mr-2 text-blue-600 dark:text-blue-400" />
                      Staff Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Staff Name *
                        </label>
                        <input
                          type="text"
                          value={newUser.staff_name}
                          onChange={(e) => setNewUser({ ...newUser, staff_name: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="John Doe"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Staff Code *
                        </label>
                        <input
                          type="text"
                          value={newUser.staff_code}
                          onChange={(e) => setNewUser({ ...newUser, staff_code: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="EMP001"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Father/Spouse Name
                        </label>
                        <input
                          type="text"
                          value={newUser.father_spouse_name}
                          onChange={(e) => setNewUser({ ...newUser, father_spouse_name: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="James Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Experience (Years)
                        </label>
                        <input
                          type="number"
                          value={newUser.experience_years}
                          onChange={(e) => setNewUser({ ...newUser, experience_years: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="5"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Education Qualification
                        </label>
                        <input
                          type="text"
                          value={newUser.education_qualification}
                          onChange={(e) => setNewUser({ ...newUser, education_qualification: e.target.value })}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="Bachelor's Degree"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Joining Date
                        </label>
                        <DatePicker
                          value={newUser.joining_date}
                          onChange={(e) => setNewUser({ ...newUser, joining_date: e.target.value })}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 transition-all hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 border border-transparent rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 transition-all shadow-md hover:shadow-lg"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          financeCompanies={financeCompanies}
        />
      )}
    </div>
  );
};

export default AgentManagement;