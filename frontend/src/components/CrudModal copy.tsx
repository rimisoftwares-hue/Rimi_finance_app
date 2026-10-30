import { useEffect, useState } from 'react';
import axios from 'axios';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
import { 
  X, Plus, Calendar, FileText, User, DollarSign, AlertCircle, 
  Search, Phone, Car, CreditCard, MessageSquare, UserCheck, FileEdit 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext'; // Import the auth context

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
}

const CrudModal = ({ isOpen, onClose }: CrudModalProps) => {
  const { user, currentFinance, allUsers } = useAuth(); // Get auth context
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'hpl' | 'vehicle' | 'contact'>('hpl');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerContacts, setCustomerContacts] = useState<string[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerHplno, setCustomerHplno] = useState('');
  
  const [newPayment, setNewPayment] = useState({
    dueDate: '',
    paymentDate: new Date().toISOString().split('T')[0],
    billNumber: '',
    amount: 0,
    penalty: 0,
    collected_by: user?.username || '', // Initialize with current user's username
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
      // Call search API endpoint
      const response = await axios.get(`${BASE_URL}/api/payments/customers/search`, {
        params: {
          type: searchType,
          query: searchTerm.trim()
        }
      });

      if (response.data.success && response.data.customer) {
        const customer = response.data.customer;
        setCustomerHplno(customer.hplno);
        setCustomerName(customer.cname || '');
        setVehicleNumber(customer.vehicle_number || '');
        setCustomerContacts(customer.contact_numbers || []);
        
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
        
      } else {
        resetCustomerData();
        alert(`No customer found with ${searchType === 'hpl' ? 'HPL number' : 
               searchType === 'vehicle' ? 'vehicle number' : 'contact number'}: ${searchTerm}`);
      }
    } catch (err) {
      console.error('Search error:', err);
      resetCustomerData();
      alert('Error searching for customer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetCustomerData = () => {
    setCustomerName('');
    setCustomerContacts([]);
    setVehicleNumber('');
    setCustomerHplno('');
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
    
    if (!customerHplno || !customerName) {
      alert('Please search and select a valid customer first');
      return;
    }

    if (!newPayment.paymentDate) {
      alert('Please select payment date');
      return;
    }

    if (newPayment.amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const paymentData = {
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

      const response = await axios.post(
        `${BASE_URL}/api/payments/customers/${customerHplno}/payments`,
        paymentData,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Finance-ID': currentFinance?.id.toString()
          }
        }
      );

      if (response.data.success) {
        console.log('Payment submitted:', response.data);
        alert('Payment added successfully!');
        onClose();
      } else {
        throw new Error(response.data.message || 'Failed to save payment');
      }
      
    } catch (err: any) {
      console.error('Payment error:', err);
      alert(err.response?.data?.message || 'Failed to save payment. Please try again.');
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
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
              {customerName && (
                <div className="mt-3 p-3 bg-secondary/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">{customerName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">HPL: {customerHplno}</span>
                  </div>
                  
                  {vehicleNumber && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Car className="w-3 h-3" />
                      <span>{vehicleNumber}</span>
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
                  <input
                    type="date"
                    value={newPayment.dueDate}
                    readOnly
                    className="input-field text-sm py-2 bg-secondary/50 cursor-not-allowed"
                  />
                </div>
                
                <div>
                  <label className="input-label text-xs">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={newPayment.paymentDate}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, paymentDate: e.target.value })
                    }
                    className="input-field text-sm py-2"
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
                  <UserCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    value={newPayment.collected_by}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, collected_by: e.target.value })
                    }
                    className="input-field text-sm py-2 pl-9"
                    required
                  >
                    {/* Show current user as default */}
                    <option value={user?.username || ''}>
                      {user?.username} (Current User)
                    </option>
                    
                    {/* Show all users for this finance (excluding current user) */}
                    {allUsers
                      .filter(u => u.username !== user?.username)
                      .map(user => (
                        <option key={user.id} value={user.username}>
                          {user.username} ({user.role})
                        </option>
                      ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Logged in as: <span className="font-medium">{user?.username}</span> ({user?.role})
                </p>
              </div>
            </div>

            {/* Rest of the form remains the same */}
            {/* Payment Mode Section */}
            <div className="form-section p-4 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Payment Mode</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="input-label text-xs">Primary Payment Mode *</label>
                  <select
                    required
                    value={newPayment.payment_mode}
                    onChange={(e) =>
                      setNewPayment({ 
                        ...newPayment, 
                        payment_mode: e.target.value as any 
                      })
                    }
                    className="input-field text-sm py-2"
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="bank">Bank</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="input-label text-xs">Secondary Payment Mode (Optional)</label>
                  <select
                    value={newPayment.payment_mode_1}
                    onChange={(e) =>
                      setNewPayment({ 
                        ...newPayment, 
                        payment_mode_1: e.target.value as any 
                      })
                    }
                    className="input-field text-sm py-2"
                  >
                    <option value="">None</option>
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="bank">Bank</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
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
                disabled={!customerHplno || !customerName || isSubmitting || !newPayment.paymentDate || !newPayment.amount || !newPayment.collected_by}
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