import { useEffect, useState } from 'react';
import { Plus, Search, Calendar } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getDaysBetweenDates } from '../utils/calculations';
import axios from 'axios';
import { useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
type PhotoUrl = {
  signed_url?: string;
  original_url?: string;
};

interface Customer {
  id: string;
  hplno: string;
  cname: string;
  caddress: string;
  cphoto?: PhotoUrl;
  contactNumbers: string[];
  guardianNumbers: string[];
  guardianName: string;
  due_date?: string;
  dueDates: string[]; // Changed from string to string[]
  paidDueDates?: string[];
  hasPaidDues?: boolean;
  vehicleNumber: string;
  vehicleName: string;
  modelName: string;
  dueAmount: number;
  loanStatus: 'active' | 'close' | 'seized'; // Added 'seized'
  dueMonth: number;
}

interface CustomerWithDueDate extends Customer {
  daysUntilDue: number | null;
}

interface ApiResponse {
  success: boolean;
  count: number;
  customers: Customer[];
}

const UnpaidLoans = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerWithDueDate[]>([]);
  const [currentFilter, setCurrentFilter] = useState<'all' | 'today' | 'pending' | 'seized'>('all');
  const { user } = useAuth();
  const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
  // Get the customers array from apiData
  const customers = apiData?.customers || [];

  useEffect(() => {
    const path = location.pathname;
    if (path === '/unpaidloans') {
      setCurrentFilter('all');
    } else if (path === '/todayunpaidloans') {
      setCurrentFilter('today');
    } else if (path === '/seizedunpaidloans') { // Added route for seized unpaid loans
      setCurrentFilter('seized');
    } else {
      setCurrentFilter('pending');
    }
  }, [location]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get<ApiResponse>(`${BASE_URL}/api/customers/unpaidcustomers`);
        console.log('response:', response.data)
        if (response.data.success) {
          setApiData(response.data);
        } else {
          setError('Failed to fetch unpaid customers');
        }
      } catch (err: any) {
        console.log(err.response);
        console.log(err.response?.status);
        console.log(err.response?.data);
        setError(err.response?.data?.error || 'Failed to fetch customers');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  function getLastValidDateInOrder(dateArray: string[]) {
    if (!dateArray || dateArray.length === 0) {
      return new Date(Date.now() + 86400000).toISOString().split('T')[0];
    }

    // Filter out any invalid dates
    const validDates = dateArray.filter(date => {
      if (!date || typeof date !== 'string') return false;
      const trimmed = date.trim();
      return trimmed !== '' && trimmed !== 'NULL';
    });

    if (validDates.length === 0) {
      return new Date(Date.now() + 86400000).toISOString().split('T')[0];
    }

    let latestDateStr = validDates[0];
    let [latestYear, latestMonth, latestDay] = latestDateStr.split('-').map(Number);

    for (let i = 1; i < validDates.length; i++) {
      const currentDateStr = validDates[i];
      const [currentYear, currentMonth, currentDay] = currentDateStr.split('-').map(Number);

      if (currentYear > latestYear) {
        latestDateStr = currentDateStr;
        latestYear = currentYear;
        latestMonth = currentMonth;
        latestDay = currentDay;
      } else if (currentYear === latestYear) {
        if (currentMonth > latestMonth) {
          latestDateStr = currentDateStr;
          latestMonth = currentMonth;
          latestDay = currentDay;
        } else if (currentMonth === latestMonth && currentDay > latestDay) {
          latestDateStr = currentDateStr;
          latestDay = currentDay;
        }
      }
    }
    return latestDateStr;
  }

  function getMonthDifference(targetDateStr: string, currentDateStr: string) {
    const targetDate = new Date(targetDateStr);
    const currentDate = new Date(currentDateStr);

    if (isNaN(targetDate.getTime()) || isNaN(currentDate.getTime())) {
      return 0;
    }

    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    let monthsDifference = (currentYear - targetYear) * 12 + (currentMonth - targetMonth);

    if (currentDate.getDate() < targetDate.getDate()) {
      monthsDifference--;
    }

    return Math.max(0, monthsDifference);
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const getImageUrl = (
    photo: PhotoUrl | File | null | undefined,
    fallback: string
  ) => {
    if (!photo) return fallback;
    console.log('photo:', photo)

    // If user just uploaded a file
    if (photo instanceof File) {
      return URL.createObjectURL(photo);
    }

    // If backend returns object
    if (typeof photo === 'object') {
      const url = photo.signed_url || photo.original_url;
      if (!url) return fallback;
      console.log('url:', url)
      // Full URL
      if (url.startsWith('http')) return url;


      // Relative URL
      return `${BASE_URL}${url}`;
    }

    return fallback;
  };

  useEffect(() => {
    if (!customers || customers.length === 0) {
      setFilteredCustomers([]);
      setTotalUnpaidCustomerCount(0);
      setTodayUnpaidCustomerCount(0);
      setPendingUnpaidCustomerCount(0);
      setSeizedUnpaidCustomerCount(0); // Added for seized count
      return;
    }

    let processedCustomers = customers.map(customer => {
      const dueDatesArray = customer.dueDates || [];
      let daysUntilDue: number | null = -1;
      let lastDueDate: string | null = null;
      if (dueDatesArray.length > 0) {
        lastDueDate = getLastValidDateInOrder(dueDatesArray);
      } else if (customer.due_date) {
        lastDueDate = customer.due_date;
      }

      if (lastDueDate) {
        daysUntilDue = getDaysBetweenDates(lastDueDate, new Date());
      }
      return { ...customer, daysUntilDue };
    });

    // Apply active status filter (include seized vehicles too)
    let preDateFiltered = processedCustomers.filter(customer =>
      customer.loanStatus === 'active' || customer.loanStatus === 'seized' // Include seized
    );

    // Apply search filter if search term exists
    if (searchTerm) {
      const searchValue = searchTerm.toLowerCase();
      preDateFiltered = preDateFiltered.filter(customer => {
        // Convert all searchable fields to strings for safe comparison
        const safeToString = (value: any): string => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'string') return value;
          return String(value);
        };

        return (
          safeToString(customer.hplno).toLowerCase().includes(searchValue) ||
          safeToString(customer.vehicleNumber).toLowerCase().includes(searchValue) ||
          safeToString(customer.cname).toLowerCase().includes(searchValue) ||
          safeToString(customer.vehicleName).toLowerCase().includes(searchValue) ||
          safeToString(customer.modelName).toLowerCase().includes(searchValue) ||
          (customer.contactNumbers && customer.contactNumbers.some(contact =>
            safeToString(contact).toLowerCase().includes(searchValue)
          ))
        );
      });
    }

    // Calculate counts from preDateFiltered (before date filter)
    setTotalUnpaidCustomerCount(preDateFiltered.filter(c => (c.daysUntilDue ?? Infinity) >= 0).length);
    setTodayUnpaidCustomerCount(preDateFiltered.filter(c => c.daysUntilDue === 0).length);
    setPendingUnpaidCustomerCount(preDateFiltered.filter(c => (c.daysUntilDue ?? Infinity) > 0).length);
    setSeizedUnpaidCustomerCount(preDateFiltered.filter(c => c.loanStatus === 'seized').length); // Count seized

    // Apply date filter for table display
    let finalFiltered = [...preDateFiltered];
    if (currentFilter === 'today') {
      finalFiltered = finalFiltered.filter(c => c.daysUntilDue === 0);
    } else if (currentFilter === 'pending') {
      finalFiltered = finalFiltered.filter(c => (c.daysUntilDue ?? Infinity) > 0);
    } else if (currentFilter === 'seized') { // Added seized filter
      finalFiltered = finalFiltered.filter(c => c.loanStatus === 'seized');
    } else if (currentFilter === 'all') {
      finalFiltered = finalFiltered.filter(c => (c.daysUntilDue ?? Infinity) >= 0);
    }

    setFilteredCustomers(finalFiltered);
  }, [apiData, searchTerm, currentFilter]);

  const [totalUnpaidCustomerCount, setTotalUnpaidCustomerCount] = useState(0);
  const [todayUnpaidCustomerCount, setTodayUnpaidCustomerCount] = useState(0);
  const [pendingUnpaidCustomerCount, setPendingUnpaidCustomerCount] = useState(0);
  const [seizedUnpaidCustomerCount, setSeizedUnpaidCustomerCount] = useState(0); // Added state

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (printRef.current && filteredCustomers.length > 0) {
      const printTable = document.createElement('div');
      printTable.innerHTML = `
        <div class="print-header">
          <h1 class="print-title">
            ${currentFilter === 'all' ? 'All Unpaid Loans Report' :
          currentFilter === 'today' ? "Today's Unpaid Loans Report" :
            currentFilter === 'seized' ? 'Seized Vehicles Unpaid Loans Report' : // Added
              'Pending Unpaid Loans Report'}
          </h1>
          <p class="print-date">Generated on ${new Date().toLocaleDateString()}</p>
          <p class="print-count">Total: ${filteredCustomers.length} customers</p>
        </div>
        <table class="print-table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Customer Details</th>
              <th>Contact</th>
              <th>Vehicle Info</th>
              <th>Guardian Num</th>
              <th>Due Amount</th>
              <th>Last Due Date</th>
              <th>Total Due Month</th>
              <th>Paid Due Month</th>
              <th>Pending Due Month</th>
              <th>Pending Month</th>
              <th>Status</th> <!-- Added status column -->
            </tr>
          </thead>
          <tbody>
            ${filteredCustomers.map(customer => {
                const paidMonths = customer.hasPaidDues !== undefined
                  ? (customer.hasPaidDues ? (customer.paidDueDates?.length || customer.dueDates?.length || 0) : 0)
                  : (customer.dueDates?.filter(date => date.trim() !== '').length || 0);
                const effectiveDueDates = (customer.dueDates && customer.dueDates.length > 0)
                  ? customer.dueDates
                  : (customer.due_date ? [customer.due_date] : []);
                const pendingMonths = getMonthDifference(getLastValidDateInOrder(effectiveDueDates), currentDate);
                const pendingAmount = Math.max(0, pendingMonths) * (customer.dueAmount || 0);

                return `
                <tr>
                  <td>
                   ${customer.cphoto
                    ? `<img src="${BASE_URL}${customer.cphoto}" 
                          style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" 
                          class="print-photo" 
                          alt="Customer Photo"/>`
                    : '<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px;"></div>'}
                  </td>
                  <td>
                    <strong>${customer.cname || 'N/A'}</strong><br/>
                    HPL: ${customer.hplno || 'N/A'}<br/>
                    ${customer.caddress || 'N/A'}
                  </td>
                  <td>
                    ${customer.contactNumbers?.join('<br/>') || 'N/A'}
                  </td>
                  <td>
                    ${customer.vehicleNumber || 'N/A'}<br/>
                    ${customer.vehicleName || 'N/A'}<br/>
                    ${customer.modelName || 'N/A'}
                  </td>
                  <td>
                    <strong>${customer.guardianName || 'N/A'}</strong><br/>
                    ${customer.guardianNumbers?.join('<br/>') || 'N/A'}
                  </td>
                  <td>
                    ₹${customer.dueAmount || 0}
                  </td>
                  <td>
                    ${getLastValidDateInOrder(effectiveDueDates) || 'N/A'}
                  </td>
                  <td>
                    ${customer.dueMonth || 0}
                  </td>
                  <td>
                    ${paidMonths}
                  </td>
                  <td>
                    ${(customer.dueMonth || 0) - paidMonths}
                  </td>
                  <td>
                    ${pendingMonths}
                  </td>
                  <td>
                    <span style="padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;
                      ${customer.loanStatus === 'seized' ?
                    'background-color: #fef3c7; color: #92400e;' :
                    customer.loanStatus === 'active' ?
                      'background-color: #d1fae5; color: #065f46;' :
                      'background-color: #f3f4f6; color: #6b7280;'}">
                      ${customer.loanStatus}
                    </span>
                  </td>
                </tr>
              `;
              }).join('')}
          </tbody>
        </table>
      `;

      const printWindow = window.open('', '', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Senthur Finance - Unpaid Loans Report</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  padding: 20px;
                  background: white;
                  color: black;
                  line-height: 1.4;
                }
                .print-header {
                  margin-bottom: 20px;
                  border-bottom: 2px solid #333;
                  padding-bottom: 10px;
                }
                .print-title {
                  margin: 0;
                  color: #1a56db;
                }
                .print-date, .print-count {
                  margin: 5px 0;
                  color: #666;
                }
                table {
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 12px;
                }
                th, td {
                  border: 1px solid #ccc;
                  padding: 8px;
                  text-align: left;
                  vertical-align: top;
                }
                th {
                  background-color: #f8f8f8;
                  font-weight: bold;
                }
                tr:nth-child(even) {
                  background-color: #f9f9f9;
                }
              </style>
            </head>
            <body>
              ${printTable.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }
    }
  };

  const handleStatClick = (filterType: 'all' | 'today' | 'pending' | 'seized') => {
    setCurrentFilter(filterType);
    switch (filterType) {
      case 'all':
        navigate('/unpaidloans');
        break;
      case 'today':
        navigate('/todayunpaidloans');
        break;
      case 'seized':
        navigate('/seizedunpaidloans'); // New route
        break;
      default:
        navigate('/pendingunpaidloans');
    }
  };

  const handleRowClick = (customerHplno: string) => {
    console.log(customerHplno);
    const path =
      user?.role === 'owner'
        ? `/owner/customers/${customerHplno}`
        : `/agent/customers/${customerHplno}`;
    navigate(path);
  };

  const getStatusBadge = (daysUntilDue: number, loanStatus: string) => {
    if (loanStatus === 'seized') {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-warning/10 text-warning dark:bg-warning/20">
          Seized
        </span>
      );
    }

    if (daysUntilDue === 0) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          Due Today
        </span>
      );
    } else if (daysUntilDue < 0) {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          Due in {Math.abs(daysUntilDue)} days
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          Overdue by {Math.abs(daysUntilDue)} days
        </span>
      );
    }
  };

  if (loading) return <div className="text-center py-8 dark:text-gray-300">Loading unpaid customers...</div>;
  if (error) return <div className="text-center py-8 text-red-600 dark:text-red-400">{error}</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {currentFilter === 'all' ? 'All Unpaid Loans' :
            currentFilter === 'today' ? "Today's Unpaid Loans" :
              currentFilter === 'seized' ? 'Seized Vehicles Unpaid Loans' : // Added
                'Pending Unpaid Loans'}
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handlePrint}
            disabled={filteredCustomers.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap ${filteredCustomers.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
              : 'bg-primary text-primary-foreground hover:opacity-90'
              }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Print Report</span>
          </button>

          <Link
            to={"/AddCustomersForm"}
            className="flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all duration-200"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Customer</span>
          </Link>
        </div>
      </div>

      {/* Stats Navigation - Updated with 4 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div
          onClick={() => handleStatClick('all')}
          className={`stat-card cursor-pointer ${currentFilter === 'all' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Total Unpaid</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {totalUnpaidCustomerCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            From {apiData?.count || 0} total customers
          </p>
        </div>
        <div
          onClick={() => handleStatClick('today')}
          className={`stat-card cursor-pointer ${currentFilter === 'today' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Today Unpaid</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {todayUnpaidCustomerCount}
          </p>
        </div>
        <div
          onClick={() => handleStatClick('pending')}
          className={`stat-card cursor-pointer ${currentFilter === 'pending' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Pending Unpaid</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {pendingUnpaidCustomerCount}
          </p>
        </div>
        <div
          onClick={() => handleStatClick('seized')}
          className={`stat-card cursor-pointer ${currentFilter === 'seized' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Seized Vehicles</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {seizedUnpaidCustomerCount}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers by HPL No, Vehicle, Name, or Phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary transition-all duration-200"
          />
        </div>
      </div>

      {/* Customer List */}
      <div
        ref={printRef}
        className="card-elevated overflow-hidden"
      >
        {filteredCustomers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">
              {searchTerm
                ? 'No unpaid customers found matching your search criteria.'
                : 'No unpaid customers found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vehicle Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vehicle Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Pending Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredCustomers.map((customer) => {
                  const effectiveDueDates = (customer.dueDates && customer.dueDates.length > 0)
                    ? customer.dueDates
                    : (customer.due_date ? [customer.due_date] : []);
                  const pendingMonths = getMonthDifference(getLastValidDateInOrder(effectiveDueDates), currentDate);
                  const pendingAmount = Math.max(0, pendingMonths) * (customer.dueAmount || 0);

                  return (
                    <tr
                      key={customer.hplno}
                      onClick={() => handleRowClick(customer.id)}
                      className="cursor-pointer hover:bg-muted/30 transition-colors duration-150"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                            {customer.cphoto ? (
                              <img
                                src={getImageUrl(customer.cphoto, 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop')}
                                alt="Customer"
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full rounded-full bg-muted-foreground/20 flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">
                                  {customer.cname?.charAt(0).toUpperCase() || '?'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-foreground">
                              {customer.cname || 'N/A'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span>HPL No: </span>{customer.hplno}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap max-w-[200px]">
                        <div className="text-sm text-foreground">
                          {customer.contactNumbers && customer.contactNumbers.length > 0
                            ? customer.contactNumbers[0]
                            : 'N/A'}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {customer.caddress || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">
                          {customer.vehicleNumber || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {customer.daysUntilDue !== null ?
                          getStatusBadge(customer.daysUntilDue, customer.loanStatus) :
                          <span className="px-2 py-1 text-xs rounded-full bg-warning/10 text-warning dark:bg-warning/20">
                            {customer.loanStatus}
                          </span>
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap max-w-[220px]">
                        <span className="text-sm text-foreground">
                          {customer.vehicleName || 'N/A'}
                          {customer.modelName && ` - ${customer.modelName}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">
                          ₹{pendingAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pendingMonths} month(s) pending
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnpaidLoans;