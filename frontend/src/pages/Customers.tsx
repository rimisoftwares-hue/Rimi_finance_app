import { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useClientPagination } from '../hooks/useClientPagination';
import { TablePagination, PageTableSkeleton } from '../components/common/table';

interface CustomerContact {
  type: string;
  number: string;
}

type PhotoUrl = {
  signed_url?: string;
  original_url?: string;
};

interface Customer {
  id: string;
  hplno: string;
  cname: string;
  loanStatus: 'active' | 'close' | 'seized';
  brokerName: string;
  cphoto: PhotoUrl;
  cvehiclePhoto: PhotoUrl;
  cpropertyPhoto: PhotoUrl;
  contacts: CustomerContact[];
  cfname: {
    value: string;
    unit: 'S/O' | 'W/O' | 'D/O' | 'H/O';
  };
  aadhar_id: string;
  other_govt_id_type: 'pan_card' | 'voter_id' | 'driving_license' | 'other';
  other_govt_id_number: string;
  profession: string;
  work_office_address: string;
  work_office_phone: string;
  current_vehicle_id: string;
  caddress: string;
  vehicle_number: string;
  vehicleName: string;
  vehicle_modal: string;
  modelName?: string; // Added for compatibility
}


const Customers = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentFilter, setCurrentFilter] = useState<'all' | 'active' | 'close' | 'seized'>('active');
  const { user } = useAuth();
  const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
  useEffect(() => {
    // Check URL or location state for filter type
    const path = location.pathname;
    if (path === '/allcustomers') {
      setCurrentFilter('all');
    } else if (path === '/closeloancustomer') {
      setCurrentFilter('close');
    } else if (path === '/seizedcustomer') {
      setCurrentFilter('seized');
    } else {
      setCurrentFilter('active');
    }
  }, [location]);

  const { currentFinance } = useAuth();

  // In Customers.tsx, update the useEffect:
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        // Remove ALL headers - let AuthContext handle them
        const response = await axios.get<Customer[]>(`${BASE_URL}/api/customers`);
        setCustomers(response.data);
        console.log('response.data:', response.data);
      } catch (err: any) {
        console.error('Fetch customers error:', err.response?.data || err.message);
        setError(err.response?.data?.error || 'Failed to fetch customers');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const searchValue = searchTerm.toLowerCase().trim();

    return customers.filter(customer => {
      // First, check if the customer matches the current loan status filter
      const matchesLoanStatus =
        currentFilter === 'all' ||
        customer.loanStatus === currentFilter;

      if (!matchesLoanStatus) return false;

      // If no search term, return all matching loan status
      if (!searchValue) return true;

      // Safely convert all values to strings
      const safeToString = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        return String(value);
      };

      // Check if it matches the search term
      const matchesSearch =
        safeToString(customer.hplno).toLowerCase().includes(searchValue) ||
        safeToString(customer.vehicle_number).toLowerCase().includes(searchValue) ||
        safeToString(customer.cname).toLowerCase().includes(searchValue) ||
        safeToString(customer.caddress).toLowerCase().includes(searchValue) ||
        safeToString(customer.vehicleName).toLowerCase().includes(searchValue) ||
        safeToString(customer.vehicle_modal || customer.modelName).toLowerCase().includes(searchValue) ||
        safeToString(customer.brokerName).toLowerCase().includes(searchValue) ||
        (customer.contacts || []).some(contact =>
          safeToString(contact?.number).toLowerCase().includes(searchValue)
        );

      return matchesSearch;
    });
  }, [customers, searchTerm, currentFilter]);

  const {
    paginatedItems: pagedCustomers,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(filteredCustomers, { initialPageSize: 15 });


  const getImageUrl = (
    photo: PhotoUrl | File | null | undefined,
    fallback: string
  ) => {
    if (!photo) return fallback;

    // If user just uploaded a file
    if (photo instanceof File) {
      return URL.createObjectURL(photo);
    }

    // If backend returns object
    if (typeof photo === 'object') {
      const url = photo.signed_url || photo.original_url;
      if (!url) return fallback;

      // Full URL
      if (url.startsWith('http')) return url;

      // Relative URL
      return `${BASE_URL}${url}`;
    }

    return fallback;
  };

  const handleStatClick = (filterType: 'all' | 'active' | 'close' | 'seized') => {
    setCurrentFilter(filterType);
    switch (filterType) {
      case 'all':
        navigate('/allcustomers');
        break;
      case 'close':
        navigate('/closeloancustomer');
        break;
      case 'seized':
        navigate('/seizedcustomer');
        break;
      default:
        navigate('/customers');
    }
  };

  const handleRowClick = (customerHplno: string) => {
    const path =
      user?.role === 'owner'
        ? `/owner/customers/${customerHplno}`
        : `/agent/customers/${customerHplno}`;
    navigate(path);
    console.log('customerid :', customerHplno)
  };

  if (loading) return (
    <PageTableSkeleton statCardsCount={4} columns={6} rows={6} showSearch />
  );

  if (error) return (
    <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
      <p className="text-destructive">{error}</p>
    </div>
  );

  // Calculate statistics
  const totalCustomers = customers.length;
  const activeLoans = customers.filter(c => c.loanStatus === 'active').length;
  const closedLoans = customers.filter(c => c.loanStatus === 'close').length;
  const seizedVehicles = customers.filter(c => c.loanStatus === 'seized').length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {currentFilter === 'all'
              ? 'All Customers'
              : currentFilter === 'close'
                ? 'Closed Loans'
                : currentFilter === 'seized'
                  ? 'Seized Vehicles'
                  : 'Active Loans'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {currentFilter === 'all'
              ? 'Directory of all active, closed, and seized borrower accounts'
              : currentFilter === 'close'
                ? 'Customer accounts with fully settled and closed loan agreements'
                : currentFilter === 'seized'
                  ? 'Customer records with seized and godown-stored vehicles'
                  : 'Active borrower accounts, loan schedules, and customer profiles'}
          </p>
        </div>
      </div>

      {/* Stats Navigation - Updated for dark mode with 4 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div
          onClick={() => handleStatClick('all')}
          className={`stat-card cursor-pointer ${currentFilter === 'all' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Total Customers</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {totalCustomers}
          </p>
        </div>
        <div
          onClick={() => handleStatClick('active')}
          className={`stat-card cursor-pointer ${currentFilter === 'active' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Active Loans</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {activeLoans}
          </p>
        </div>
        <div
          onClick={() => handleStatClick('close')}
          className={`stat-card cursor-pointer ${currentFilter === 'close' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Closed Loans</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {closedLoans}
          </p>
        </div>
        <div
          onClick={() => handleStatClick('seized')}
          className={`stat-card cursor-pointer ${currentFilter === 'seized' ? 'ring-2 ring-primary/20' : 'hover:shadow-card-hover'}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">Seized Vehicles</h3>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {seizedVehicles}
          </p>
        </div>
      </div>

      {/* Search and Filter - Updated for dark mode */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers by HPL No, Vehicle, Name, Phone, Address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary transition-all duration-200"
          />
          {searchTerm && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <span className="text-xs text-muted-foreground">
                {filteredCustomers.length} results
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Customer List - Updated for dark mode */}
      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        {filteredCustomers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">
              {searchTerm
                ? 'No customers found matching your search criteria.'
                : 'No customers found.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Vehicle Number
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Vehicle Name
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Vehicle Model
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Loan Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {pagedCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => handleRowClick(customer.id)}
                      className="cursor-pointer hover:bg-secondary/40 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
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
                      <td className="px-4 py-3 text-sm whitespace-nowrap max-w-[200px]">
                        <div className="text-sm text-foreground">
                          {customer.contacts && customer.contacts.length > 0
                            ? customer.contacts[0].number
                            : 'N/A'}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {customer.caddress || 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">
                          {customer.vehicle_number || 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className="text-sm text-foreground">
                          {customer.vehicleName || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className="text-sm text-foreground">
                          {customer.vehicle_modal || customer.modelName || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${customer.loanStatus === 'active'
                            ? 'bg-success/10 text-success dark:bg-success/20'
                            : customer.loanStatus === 'close'
                              ? 'bg-muted text-muted-foreground dark:bg-muted-foreground/20'
                              : customer.loanStatus === 'seized'
                                ? 'bg-warning/10 text-warning dark:bg-warning/20'
                                : 'bg-destructive/10 text-destructive dark:bg-destructive/20'
                          }`}>
                          {customer.loanStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default Customers;