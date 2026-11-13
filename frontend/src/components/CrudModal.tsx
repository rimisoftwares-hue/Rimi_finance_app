import { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import { 
  X, Plus, Calendar, FileText, User, DollarSign, AlertCircle, 
  Search, Phone, Car, CreditCard, MessageSquare, UserCheck, FileEdit 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/use-toast'; // Use your custom toast hook
import { DatePicker } from './ui/date-picker';
import { AppSelect } from './common/AppSelect';

const PRIMARY_PAYMENT_MODE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const SECONDARY_PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'None' },
  ...PRIMARY_PAYMENT_MODE_OPTIONS,
];

interface CrudModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Payment {
  hplno: string;
  cname: string;
  dueAmount: string;
  hpDate: string;
  lastDueDate: string;
  created_at: string;
  vehicle_number?: string;
  contact_numbers?: string[];
  loanStatus?: string;
}

interface Customer {
  id: string;
  hplno: string;
  cname: string;
  loanStatus: string;
  vehicle_number: string;
  hpDate: string;
  dueAmount: number;
  dueMonth: number;
  interestRate: number;
  contact_numbers: string[];
  lastDueDate: string;
}

const CrudModal = ({ isOpen, onClose }: CrudModalProps) => {
  const { user, currentFinance, allUsers } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'hpl' | 'vehicle' | 'contact'>('hpl');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerContacts, setCustomerContacts] = useState<string[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerHplno, setCustomerHplno] = useState('');
  const [loanStatus, setLoanStatus] = useState<string>('active');
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [newPayment, setNewPayment] = useState({
    dueDate: '',
    paymentDate: new Date().toISOString().split('T')[0],
    billNumber: '',
    amount: 0,
    penalty: 0,
    collected_by: user?.username || '',
    payment_mode: 'cash' as 'cash' | 'online' | 'bank' | 'upi' | 'cheque' | 'other',
    payment_mode_1: '' as '' | 'cash' | 'online' | 'bank' | 'upi' | 'cheque' | 'other',
    payment_mode_1_amount: 0,
    hand_loan: 0,
    hand_loan_remark: '',
    remarks: ''
  });

  // Update collected_by when user changes
  useEffect(() => {
    if (user?.username) {
      setNewPayment(prev => ({
        ...prev,
        collected_by: user.username
      }));
    }
  }, [user]);

  // Calculate next due date with validation
  const calculateNextDueDate = (baseDate: string): string => {
    if (!baseDate) return new Date().toISOString().split('T')[0];

    function parseDateString(dateStr: string) {
      const parts = dateStr.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      
      const date = new Date(year, month, day);
      
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month ||
        date.getDate() !== day
      ) {
        return {
          original: { year, month: month + 1, day },
          corrected: {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate()
          },
          isValid: false
        };
      }
      
      return {
        original: { year, month: month + 1, day },
        corrected: null,
        isValid: true
      };
    }
    
    const dueDate = parseDateString(baseDate);
    
    let originalDay = dueDate.original.day;
    let nextMonth = dueDate.original.month + 1;
    let nextYear = dueDate.original.year;

    if (nextMonth === 13) {
      nextMonth -= 12;
      nextYear++;
    }
    
    let result = nextYear+'-'+nextMonth+'-'+originalDay;
    if (originalDay <= 9 && nextMonth <= 9){
      result = nextYear+'-0'+nextMonth+'-0'+originalDay;
    } else if(originalDay <=9){
      result = nextYear+'-'+nextMonth+'-0'+originalDay;
    } else if (nextMonth <=9){
      result = nextYear+'-0'+nextMonth+'-'+originalDay;
    } else {
      result = nextYear+'-'+nextMonth+'-'+originalDay;
    }
    
    return result;
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Search customer function
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      resetCustomerData();
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.get('/payments/customers/search', {
        params: {
          type: searchType,
          query: searchTerm.trim()
        }
      });
      console.log('response.data.customer:',response.data.customer)
      if (response.data.success && response.data.customer) {
        setCustomer(response.data.customer)
        const customer: Customer = response.data.customer;
        setCustomerHplno(customer.hplno);
        setCustomerName(customer.cname || '');
        setVehicleNumber(customer.vehicle_number || '');
        setCustomerContacts(customer.contact_numbers || []);
        setLoanStatus(customer.loanStatus || 'active');
        
        // Calculate next due date based on last payment or loan start date
        let baseDate = new Date().toISOString().split('T')[0];
        
        if (customer.lastDueDate) {
          baseDate = customer.lastDueDate;
        } else if (customer.hpDate) {
          baseDate = customer.hpDate;
        }
        
        const nextDueDate = calculateNextDueDate(baseDate);
        
        setNewPayment(prev => ({
          ...prev,
          dueDate: nextDueDate,
          amount: customer.dueAmount ? Number(customer.dueAmount) : 0,
        }));
        
        // Use your custom toast
        toast({
          title: 'Customer Found',
          description: `Customer: ${customer.cname}`,
          variant: 'default'
        });
        
      } else {
        resetCustomerData();
        toast({
          variant: 'destructive',
          title: 'Customer Not Found',
          description: `No customer found with ${searchType === 'hpl' ? 'HPL number' : 
                 searchType === 'vehicle' ? 'vehicle number' : 'contact number'}: ${searchTerm}`,
        });
      }
    } catch (err) {
      console.error('Search error:', err);
      resetCustomerData();
      toast({
        variant: 'destructive',
        title: 'Search Error',
        description: 'Error searching for customer. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetCustomerData = () => {
    setCustomerName('');
    setCustomerContacts([]);
    setVehicleNumber('');
    setCustomerHplno('');
    setLoanStatus('active');
    setNewPayment(prev => ({
      ...prev,
      dueDate: '',
      amount: 0,
    }));
  };

  // Handle Enter key press for search
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement?.id === 'search-input') {
        handleSearch();
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [searchTerm, searchType]);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customer?.hplno || !customer?.cname) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please search and select a valid customer first',
      });
      return;
    }

    if (!newPayment.paymentDate) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please select payment date',
      });
      return;
    }

    if (newPayment.amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter a valid amount',
      });
      return;
    }

    // Check loan status
    if (customer?.loanStatus
 !== 'active') {
      const confirmPayment = window.confirm(
        `Customer loan status is "${customer?.loanStatus
}". Are you sure you want to add a payment?`
      );
      if (!confirmPayment) {
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      const paymentData = {
        hplno : customer.hplno,
        dueDate: newPayment.dueDate,
        paymentDate: newPayment.paymentDate,
        billNumber: newPayment.billNumber,
        amount: Number(newPayment.amount) || 0,
        penalty: Number(newPayment.penalty) || 0,
        collected_by: newPayment.collected_by,
        payment_mode: newPayment.payment_mode,
        payment_mode_1: newPayment.payment_mode_1 || null,
        payment_mode_1_amount: Number(newPayment.payment_mode_1_amount) || 0,
        hand_loan: Number(newPayment.hand_loan) || 0,
        hand_loan_remark: newPayment.hand_loan_remark || null,
        remarks: newPayment.remarks || null
      };
      console.log('customer?.id:',customer?.id, customer.hplno)
      const response = await apiClient.post(
        `/customers/${customer?.id}/payments`,
        paymentData
      );

      if (response.data.success) {
        console.log('Payment submitted:', response.data);
        
        toast({
          title: 'Payment Successful',
          description: `Payment of ₹${newPayment.amount} added successfully for ${customer?.cname} (HPL: ${customer?.hplno
})`,
          variant: 'default'
        });
        
        // Reset form after successful submission
        resetCustomerData();
        setNewPayment({
          dueDate: '',
          paymentDate: new Date().toISOString().split('T')[0],
          billNumber: '',
          amount: 0,
          penalty: 0,
          collected_by: user?.username || '',
          payment_mode: 'cash',
          payment_mode_1: '',
          payment_mode_1_amount: 0,
          hand_loan: 0,
          hand_loan_remark: '',
          remarks: ''
        });
        
        // Close modal after a delay
        setTimeout(() => {
          onClose();
        }, 2000);
        
      } else {
        throw new Error(response.data.message || 'Failed to save payment');
      }
      
    } catch (err: any) {
      console.error('Payment error:', err);
      
      const errorMessage = err.response?.data?.message || 'Failed to save payment. Please try again.';
      toast({
        variant: 'destructive',
        title: 'Payment Error',
        description: errorMessage,
      });
      
    } finally {
      setIsSubmitting(false);
    }
  };

  const penaltyDay = (dueDates: string, paymentDates: string) => {
    if (!dueDates || !paymentDates) return 0;
    
    const dueDate = new Date(dueDates);
    const paymentDate = new Date(paymentDates);
    
    if (isNaN(dueDate.getTime()) || isNaN(paymentDate.getTime())) {
      return 0;
    }
    
    if (paymentDate > dueDate) {
      const diffTime = Math.abs(paymentDate.getTime() - dueDate.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return 0;
  };

  const penaltyDays = penaltyDay(newPayment.dueDate, newPayment.paymentDate);
  const hasPenalty = penaltyDays > 0;
  const totalAmount = (Number(newPayment.amount) + Number(newPayment.penalty)).toFixed(2);

  // Loan status badge color
  const getLoanStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'close':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'seized':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[1px] bg-black/25 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Container */}
        <div className="card-elevated overflow-hidden max-h-[95vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50 sticky top-0 bg-card z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">New Payment</h2>
                <p className="text-xs text-muted-foreground">Add payment record</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors duration-200"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handlePaymentSubmit} className="p-4 space-y-4">
            {/* Customer Search Section */}
            <div className="form-section p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Find Customer</h3>
              </div>
              
              {/* Search Type Toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setSearchType('hpl')}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${searchType === 'hpl' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                >
                  HPL No
                </button>
                <button
                  type="button"
                  onClick={() => setSearchType('vehicle')}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${searchType === 'vehicle' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                >
                  <Car className="w-3 h-3 inline mr-1" />
                  Vehicle
                </button>
                <button
                  type="button"
                  onClick={() => setSearchType('contact')}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${searchType === 'contact' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                >
                  <Phone className="w-3 h-3 inline mr-1" />
                  Contact
                </button>
              </div>

              {/* Search Input */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    id="search-input"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-field text-sm py-2 pl-9"
                    placeholder={
                      searchType === 'hpl' ? 'Enter HPL number...' :
                      searchType === 'vehicle' ? 'Enter vehicle number...' :
                      'Enter contact number...'
                    }
                  />
                  {searchType === 'hpl' && (
                    <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  {searchType === 'vehicle' && (
                    <Car className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  {searchType === 'contact' && (
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
                >
                  {isLoading ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Search className="w-3 h-3" />
                  )}
                  Search
                </button>
              </div>

              {/* Customer Info Display */}
              {customer?.cname && (
                <div className="mt-3 p-3 bg-secondary/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">{customer?.cname}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">HPL: {customer?.hplno
}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getLoanStatusColor(customer?.loanStatus)}`}>
                        {customer?.loanStatus?.toUpperCase() || 'ACTIVE'}
                      </span>
                    </div>
                  </div>
                  
                  {customer?.vehicle_number
 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Car className="w-3 h-3" />
                      <span>{customer?.vehicle_number
}</span>
                    </div>
                  )}
                  
                  {customerContacts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {customerContacts.map((contact, index) => (
                        <span 
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          {contact}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {customer?.loanStatus !== 'active' && (
                    <div className="mt-2 p-2 rounded bg-yellow-50 border border-yellow-200">
                      <p className="text-xs text-yellow-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span className="font-medium">Note:</span> Customer loan status is <span className="font-bold">{customer?.loanStatus}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Details Section */}
            <div className="form-section p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Payment Details</h3>
              </div>

              {/* Bill Number */}
              <div>
                <label className="input-label text-xs">Bill Number</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={newPayment.billNumber}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, billNumber: e.target.value })
                    }
                    className="input-field text-sm py-2 pl-9"
                    placeholder="Enter bill number"
                  />
                </div>
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="input-label text-xs">Due Date</label>
                  <DatePicker
                    value={newPayment.dueDate}
                    readOnly
                    placeholder="Due Date"
                  />
                </div>
                
                <div>
                  <label className="input-label text-xs">Payment Date *</label>
                  <DatePicker
                    required
                    value={newPayment.paymentDate}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, paymentDate: e.target.value })
                    }
                    placeholder="Payment Date"
                  />
                </div>
              </div>

              {/* Penalty Indicator */}
              {hasPenalty && (
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">Late Payment: {penaltyDays} day{penaltyDays !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}

              {/* Collected By */}
              <div>
                <label className="input-label text-xs">Collected By *</label>
                <div className="relative">
                  <UserCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                  <AppSelect
                    value={newPayment.collected_by}
                    onValueChange={(val) =>
                      setNewPayment({ ...newPayment, collected_by: val })
                    }
                    options={[
                      {
                        value: user?.username || '',
                        label: `${user?.username} (Current User)`,
                      },
                      ...allUsers
                        .filter((u) => u.username !== user?.username)
                        .map((u) => ({
                          value: u.username,
                          label: `${u.username} (${u.role})`,
                        })),
                    ]}
                    triggerClassName="w-full pl-9 text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Logged in as: <span className="font-medium">{user?.username}</span> ({user?.role})
                </p>
              </div>
            </div>

            {/* Payment Mode Section */}
            <div className="form-section p-4 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Payment Mode</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="input-label text-xs">Primary Payment Mode *</label>
                  <AppSelect
                    value={newPayment.payment_mode}
                    onValueChange={(val) =>
                      setNewPayment({
                        ...newPayment,
                        payment_mode: val as any,
                      })
                    }
                    options={PRIMARY_PAYMENT_MODE_OPTIONS}
                    triggerClassName="w-full text-sm"
                  />
                </div>
                
                <div>
                  <label className="input-label text-xs">Secondary Payment Mode (Optional)</label>
                  <AppSelect
                    value={newPayment.payment_mode_1}
                    onValueChange={(val) =>
                      setNewPayment({
                        ...newPayment,
                        payment_mode_1: val as any,
                      })
                    }
                    options={SECONDARY_PAYMENT_MODE_OPTIONS}
                    placeholder="None"
                    triggerClassName="w-full text-sm"
                  />
                </div>
              </div>

              {/* Secondary Payment Amount */}
              {newPayment.payment_mode_1 && (
                <div>
                  <label className="input-label text-xs">Secondary Payment Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newPayment.payment_mode_1_amount || ''}
                      onChange={(e) =>
                        setNewPayment({ 
                          ...newPayment, 
                          payment_mode_1_amount: Number(e.target.value) 
                        })
                      }
                      className="input-field text-sm py-2 pl-9"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Amount Section */}
            <div className="form-section p-4 space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Amount Details</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="input-label text-xs">Amount *</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={newPayment.amount || ''}
                      onChange={(e) =>
                        setNewPayment({ ...newPayment, amount: Number(e.target.value) })
                      }
                      className="input-field text-sm py-2 pl-9"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="input-label text-xs">Penalty</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newPayment.penalty || ''}
                      onChange={(e) =>
                        setNewPayment({ ...newPayment, penalty: Number(e.target.value) })
                      }
                      className="input-field text-sm py-2 pl-9"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Hand Loan */}
              <div>
                <label className="input-label text-xs">Hand Loan Amount (Optional)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPayment.hand_loan || ''}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, hand_loan: Number(e.target.value) })
                    }
                    className="input-field text-sm py-2 pl-9"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Hand Loan Remark */}
              {newPayment.hand_loan > 0 && (
                <div>
                  <label className="input-label text-xs">Hand Loan Remark</label>
                  <div className="relative">
                    <FileEdit className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <textarea
                      value={newPayment.hand_loan_remark}
                      onChange={(e) =>
                        setNewPayment({ ...newPayment, hand_loan_remark: e.target.value })
                      }
                      className="input-field text-sm py-2 pl-9 min-h-[80px]" 
                      placeholder="Enter hand loan remark..."
                    />
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="input-label text-xs">Remarks (Optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <textarea
                    value={newPayment.remarks}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, remarks: e.target.value })
                    }
                    className="input-field text-sm py-2 pl-9 min-h-[80px]"
                    placeholder="Enter any additional remarks..."
                  />
                </div>
              </div>

              {/* Total Amount Display */}
              <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">Total Amount</span>
                  <div className="text-lg font-bold text-primary">
                    ₹{totalAmount}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-sm px-4 py-2"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!customer?.hplno
 || !customer?.cname || isSubmitting || !newPayment.paymentDate || !newPayment.amount || !newPayment.collected_by}
                className="btn-success text-sm px-4 py-2 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    Add Payment
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CrudModal;