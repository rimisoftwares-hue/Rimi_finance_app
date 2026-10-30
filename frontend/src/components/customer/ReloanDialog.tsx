import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { toast } from '../../hooks/use-toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { 
  Calculator, 
  DollarSign, 
  AlertCircle, 
  FileText, 
  User, 
  CreditCard, 
  Receipt,
  RefreshCw,
  Car,
  User as UserIcon,
  Calendar,
  TrendingUp,
  Percent,
  Clock
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { string } from 'zod';

interface ReloanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  customerData: any;
  nextHplNo: string;
  PenaltyDays:number;
}

interface ReloanFormData {
  // Payments
  dueDate: string;
  paymentDate: string;
  billNumber: string;
  amount: number;
  penalty: number;
  collected_by: string;
  payment_mode: string;
  payment_mode_1?: string;
  payment_mode_1_amount: number;
  hand_loan: number;
  hand_loan_remarks: string;
  remarks: string;

  // Loan details
  oldHplNo: string;
  newHplNo: string;
  reloanAmount: number;
  loan_type: string;
  
  hpAmount: number;
  hpDate: string;
  due_date: string;
  dueMonth: number;
  interestRate: number; // Monthly rate
  //yearlyInterestRate: number; // Yearly rate
  penaltyAmount: number;
  principle_part: number;
  interest_part: number;
  dueAmount: number;
  broker_name: string;
  documentation_charge: number;
  broker_commission: number;
  net_payable: number;
  net_payment: number;
  down_payment: number;
  pay_mode: string;
  pay_mode_1?: string;
  pay_mode_1_amount: number;
  penalty_days: number;
  [key: string]: any;
}

const paymentModes = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const loanTypes = [
  'two_wheeler',
  'three_wheeler',
  'four_wheeler',
  'commercial_vehicle',
  'tractor',
  'electric_vehicle',
  'auto_rickshaw',
  'van',
  'lorry_truck',
  'pickup_vehicle',
  'rc_book_loan',
  'duplicate_rc_loan',
  'insurance_loan',
  'noc_loan',
  'hypothecation_loan',
  'refinance',
  'top_up',
  'engine_chassis_loan',
  'body_build_loan',
  'document_security',
  'vehicle_security',
  'guarantor_security'
];

const ReloanDialog = ({
  isOpen,
  onClose,
  onSubmit,
  customerData,
  nextHplNo,
  PenaltyDays,
}: ReloanDialogProps) => {
  const [formData, setFormData] = useState<ReloanFormData>({
    // Payments
    dueDate: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    billNumber: '',
    amount: 0,
    penalty: 0,
    collected_by: '',
    payment_mode: '',
    payment_mode_1: undefined,
    payment_mode_1_amount: 0,
    hand_loan: 0,
    hand_loan_remarks: '',
    remarks: `Reloan from HPL ${customerData?.customer?.hplno || ''}`,
    
    // Loan details
    oldHplNo: customerData?.customer?.hplno || '',
    newHplNo: nextHplNo,
    reloanAmount: 0,
    loan_type: customerData?.loan?.loan_type || 'two_wheeler',
    
    hpAmount: 0,
    hpDate: new Date().toISOString().split('T')[0],
    due_date: '',
    dueMonth: parseInt(customerData?.loan?.dueMonth || '24', 10),
    interestRate: parseFloat(customerData?.loan?.interestRate || '1.5'), // Monthly rate (1.5% default)
    //yearlyInterestRate: parseFloat(customerData?.loan?.interestRate || '1.5') * 12, // Calculate yearly from monthly
    penaltyAmount: parseFloat(customerData?.loan?.penaltyAmount || '0'),
    penalty_days: parseFloat(customerData?.loan?.penalty_days || '0'),
    principle_part: 0,
    interest_part: 0,
    dueAmount: 0,
    
    // Other details
    broker_name: customerData?.customer?.brokerName || '',
    documentation_charge: parseFloat(customerData?.loan?.documentation_charge || '2000'),
    broker_commission: parseFloat(customerData?.loan?.broker_commission || '5000'),
    net_payable: 0,
    net_payment: 0,
    down_payment: 0,
    pay_mode: 'cash',
    pay_mode_1: undefined,
    pay_mode_1_amount: 0,
  });

  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('payment');
  const [calculatedValues, setCalculatedValues] = useState({
    monthlyEmi: 0,
    totalInterest: 0,
    totalAmount: 0,
  });
  
  // Balance calculations
  const [currentBalance, setCurrentBalance] = useState({
    principal: 0,
    interest: 0,
    penalty: 0,
    total_balance: 0
  });
  
  const [oldLoanInterest, setOldLoanInterest] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  
  const BASE_URL = `${import.meta.env.VITE_API_URL}`;



  // Calculate current balance with principal and interest breakdown
  const calculateCurrentBalance = () => {
    if (!customerData?.loan || !customerData?.payments) {
      return { principal: 0, interest: 0, penalty: 0, total_balance: 0 };
    }

    const loan = customerData.loan;
    const payments = customerData.payments || [];
    const dueAmount = loan.dueAmount
    const dueMonthNum = typeof loan.dueMonth === 'string' 
      ? parseInt(loan.dueMonth, 10) 
      : loan.dueMonth || 0;
    
    const hpAmount = Number(loan.hpAmount) || 0;
    const monthlyRate = parseFloat(loan.interestRate) || 0;
    
    // Calculate total loan amount (HP + Interest)
    const totalInterest = (hpAmount * monthlyRate * dueMonthNum) / 100;
    const totalLoanAmount = hpAmount + totalInterest;
   
    // Calculate monthly EMI
    const monthlyEmi = totalLoanAmount / dueMonthNum;
    
    // Calculate total paid
    const totalPaid = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
    const paymentsCount = payments.length;
    const balanceAmount = (dueMonthNum*dueAmount) - totalPaid
    
    //const balanceAmount = Math.round((totalLoanAmount - totalPaid)/10) * 10
    // Calculate principal and interest paid using amortization
    
    let interestPaid = (totalPaid * dueMonthNum * monthlyRate) / 100;
    let principalPaid = totalPaid - interestPaid;
    // Simple amortization calculation
    const monthlyPrincipal = hpAmount / dueMonthNum;
    const monthlyInterestRate = monthlyRate / 100;
    
    // for (let i = 0; i < paymentsCount; i++) {
    //   const remainingPrincipal = hpAmount - (monthlyPrincipal * i);
    //   const interestForMonth = remainingPrincipal * monthlyInterestRate;
    //   principalPaid += monthlyPrincipal;
    //   interestPaid += interestForMonth;
    // }
    
    // Calculate remaining
    const remainingPrincipal = hpAmount - principalPaid;
    const remainingInterest = totalInterest - interestPaid;
    // Calculate penalty
    const totalPenalty = payments.reduce((sum: number, p: any) => sum + (Number(p.penalty) || 0), 0) || 0;
    const penaltyBalance = (loan.penaltyAmount * PenaltyDays) - totalPenalty;
    
    return {
      principal: remainingPrincipal,
      interest: remainingInterest,
      penalty: penaltyBalance,
      total_balance: balanceAmount
    };
  };

  // Initialize form data
  useEffect(() => {
    if (isOpen) {
      // Calculate current balance
      const balance = calculateCurrentBalance();
      setCurrentBalance(balance);
      
      // Calculate old loan interest
      if (customerData?.loan) {
        const loan = customerData.loan;
        const dueMonthNum = typeof loan.dueMonth === 'string' 
          ? parseInt(loan.dueMonth, 10) 
          : loan.dueMonth || 0;
        const hpAmount = Number(loan.hpAmount) || 0;
        const interestRate = parseFloat(loan.interestRate) || 0;
        const interest = (hpAmount * interestRate * dueMonthNum) / 100;
        setOldLoanInterest(interest);
        
        // Calculate progress
        const totalPaid = customerData.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
        const totalAmount = dueMonthNum * loan.dueAmount;
        const progress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
        setProgressPercent(Math.min(progress, 100));
      }
      
      // Calculate next due date for payment
      const calculateNextDueDateForPayment = () => {
        if (!customerData?.loan?.hpDate) return new Date().toISOString().split('T')[0];

        const payments = customerData?.payments || [];
        const lastPayment = payments
          .filter((p: any) => p.dueDate && p.dueDate !== '-')
          .sort((a: any, b: any) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];

        const baseDate = lastPayment?.dueDate || customerData.loan.hpDate;
        const parts = baseDate.split('-');
        let year = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        console.log('baseDate:',baseDate)
        console.log('lastPayment:',lastPayment)
        console.log('dpaymentsay:',payments)

        console.log('day:',day)

        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }

        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      };

      const nextDueDate = calculateNextDueDateForPayment();
      
      // Set reloan amount as the current balance total
      const initialAmount = balance.total_balance > 0 ? balance.total_balance : 10000;
      
      // Get current user email from auth context
      const currentUserEmail = user?.email || '';
      
      // Initialize form data
      const initialFormData = {
        ...formData,
        newHplNo: nextHplNo,
        reloanAmount: initialAmount,
        hpAmount: initialAmount,
        net_payment: initialAmount,
        net_payable: initialAmount,
        yearlyInterestRate: formData.interestRate * 12, // Calculate yearly from monthly
        // Set payment defaults
        dueDate: nextDueDate,
        collected_by: currentUserEmail
      };
      
      setFormData(initialFormData);
      
      // Calculate loan values
      calculateLoanValues(initialAmount, initialFormData.dueMonth, initialFormData.interestRate);
      fetchAllUsers();
      calculateNextDueDate();
    }
  }, [isOpen, nextHplNo, user?.email]);

  const calculateNextDueDate = () => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    setFormData(prev => ({
      ...prev,
      due_date: nextMonth.toISOString().split('T')[0]
    }));
  };

  const calculateLoanValues = (amount: number, months: number, monthlyRate: number) => {
    // Direct calculation
    const monthlyRateDecimal = monthlyRate / 100;
    const totalInterest = amount * monthlyRateDecimal * months;
    const totalAmount = amount + totalInterest;
    const monthlyEmi = totalAmount / months;
    const principlePart = Math.round(amount / months);
    const interestPart = Math.round(totalInterest / months);
    
    setCalculatedValues({
      monthlyEmi: Math.round(monthlyEmi),
      totalInterest: Math.round(totalInterest),
      totalAmount: Math.round(totalAmount),
    });

    setFormData(prev => ({
      ...prev,
      principle_part: principlePart,
      interest_part: interestPart,
      dueAmount: Math.round(monthlyEmi),
      net_payable: Math.round(totalAmount),
    }));
  };

  // Recalculate when reloanAmount, dueMonth, or interestRate changes
  useEffect(() => {
    if (formData.reloanAmount > 0 && formData.dueMonth > 0 && formData.interestRate > 0) {
      calculateLoanValues(formData.reloanAmount, formData.dueMonth, formData.interestRate);
    }
  }, [formData.reloanAmount, formData.dueMonth, formData.interestRate]);

  // Handle monthly interest rate change
  const handleMonthlyInterestChange = (value: string) => {
    const monthlyRate = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      interestRate: monthlyRate,
      yearlyInterestRate: monthlyRate * 12
    }));
    
    calculateLoanValues(formData.reloanAmount, formData.dueMonth, monthlyRate);
  };

  // Handle yearly interest rate change
  const handleYearlyInterestChange = (value: string) => {
    const yearlyRate = parseFloat(value) || 0;
    const monthlyRate = yearlyRate / 12;
    setFormData(prev => ({
      ...prev,
      interestRate: monthlyRate,
      yearlyInterestRate: yearlyRate
    }));
    
    calculateLoanValues(formData.reloanAmount, formData.dueMonth, monthlyRate);
  };
// In ReloanDialog.tsx, update the handleSubmit function:

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Prepare the data to send to backend
      const reloanData = {
        // Main reloan data
        oldHplNo: customerData?.customer?.hplno || '',
        newHplNo: formData.newHplNo,
        reloanAmount: formData.reloanAmount,
        
        // Loan details for new loan
        loanDetails: {
          loan_type: formData.loan_type,
          hpAmount: formData.hpAmount,
          hpDate: formData.hpDate,
          due_date: formData.due_date,
          dueMonth: formData.dueMonth,
          interestRate: formData.interestRate,
          penaltyAmount: formData.penaltyAmount,
          principle_part: formData.principle_part,
          interest_part: formData.interest_part,
          dueAmount: formData.dueAmount,
          down_payment: formData.down_payment,
          pay_mode: formData.pay_mode,
          net_payment: formData.net_payment,
          net_payable: formData.net_payable,
          pay_mode_1: formData.pay_mode_1,
          pay_mode_1_amount: formData.pay_mode_1_amount,
          hand_loan: formData.hand_loan,
          hand_loan_remarks: formData.hand_loan_remarks,
          broker_name: formData.broker_name,
          documentation_charge: formData.documentation_charge,
          broker_commission: formData.broker_commission,
          remarks: formData.remarks
        },
        
        // Settlement payment for old loan
        settlementPayment: {
          dueDate: formData.dueDate,
          paymentDate: formData.paymentDate,
          billNumber: formData.billNumber || `REL-${customerData?.customer?.hplno}-${Date.now()}`,
          amount: formData.amount,
          penalty: formData.penalty,
          collected_by: formData.collected_by || user?.email || '',
          payment_mode: formData.payment_mode,
          payment_mode_1: formData.payment_mode_1,
          payment_mode_1_amount: formData.payment_mode_1_amount,
          hand_loan: formData.hand_loan,
          hand_loan_remark: formData.hand_loan_remarks,
          remarks: `Reloan settlement - New HPL: ${formData.newHplNo}`
        },
        
        // Customer details (for reference)
        customerName: customerData?.customer?.cname || '',
        vehicleId: customerData?.vehicle?.id || null
      };
      
      await onSubmit(reloanData);
      toast({
        title: "Reloan Created Successfully",
        description: `New loan HPL ${formData.newHplNo} created from HPL ${customerData?.customer?.hplno}`,
      });
      onClose();
    } catch (error) {
      console.error('Error creating reloan:', error);
      toast({
        title: "Error Creating Reloan",
        description: "Failed to create reloan. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };


  const fetchAllUsers = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/auth/allUsers`);
      if (response.data.success) {
        setAllUsers(response.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatIndianNumber = (num: number | string): string => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(value) ? '' : value.toLocaleString('en-IN');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <RefreshCw className="w-6 h-6 text-blue-600" />
            Create Reloan
            <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200">
              New Loan
            </Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Creating new loan account from HPL {customerData?.customer?.hplno} - {customerData?.customer?.cname}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Summary Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Original Customer Info */}
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    Customer
                  </span>
                  <Badge variant="secondary">{customerData?.customer?.hplno}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium truncate">{customerData?.customer?.cname}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vehicle</p>
                  <p className="text-sm font-medium">
                    {customerData?.vehicle?.vehicle_number || 'N/A'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Current Balance Breakdown */}
            <Card className="border-l-4 border-l-red-500 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Calculator className="w-4 h-4" />
                  Current Balance Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(currentBalance.total_balance)}
                    </p>
                  </div>

                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Principal Due</p>
                    <p className="text-lg font-bold text-blue-600">
                      {formatCurrency(currentBalance.principal)}
                    </p>
                  </div>
                  
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Interest Due</p>
                    <p className="text-lg font-bold text-purple-600">
                      {formatCurrency(currentBalance.interest)}
                    </p>
                  </div>
                  
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Penalty</p>
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(currentBalance.penalty)}
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    Reloan Amount will be set to: <span className="font-bold text-green-600">
                      {formatCurrency(currentBalance.total_balance)}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for different sections */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="payment">Payment Setup</TabsTrigger>
              <TabsTrigger value="details">Loan Details</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>

            {/* Loan Details Tab */}
            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Loan Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="newHplNo" className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        New HPL Number *
                      </Label>
                      <Input
                        id="newHplNo"
                        value={formData.newHplNo}
                        onChange={e => updateField('newHplNo', e.target.value)}
                        className="input-field font-mono text-lg"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loan_type" className="flex items-center gap-1">
                        <Car className="w-4 h-4" />
                        Loan Type *
                      </Label>
                      <Select
                        value={formData.loan_type}
                        onValueChange={value => updateField('loan_type', value)}
                      >
                        <SelectTrigger className="input-field">
                          <SelectValue placeholder="Select loan type" />
                        </SelectTrigger>
                        <SelectContent>
                          {loanTypes.map(type => (
                            <SelectItem key={type} value={type}>
                              {type.replace(/_/g, ' ').toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="reloanAmount" className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        Loan Amount (₹) *
                      </Label>
                      <Input
                        id="reloanAmount"
                        type="number"
                        value={formData.reloanAmount}
                        onChange={e => {
                          const amount = Number(e.target.value);
                          updateField('reloanAmount', amount);
                          updateField('hpAmount', amount);
                          updateField('net_payment', amount);
                          updateField('net_payable', amount);
                          calculateLoanValues(amount, formData.dueMonth, formData.interestRate);
                        }}
                        className="input-field text-lg"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Current balance: {formatCurrency(currentBalance.total_balance)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dueMonth" className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Tenure (Months) *
                      </Label>
                      <Input
                        id="dueMonth"
                        type="number"
                        value={formData.dueMonth}
                        onChange={e => {
                          const months = Number(e.target.value);
                          updateField('dueMonth', months);
                          calculateLoanValues(formData.reloanAmount, months, formData.interestRate);
                        }}
                        className="input-field"
                        min="1"
                        max="60"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="penaltyAmount"> Penalty Amount (₹)</Label>
                      <Input
                        id="penaltyAmount"
                        type="number"
                        value={formData.penaltyAmount}
                        onChange={e => updateField('penaltyAmount', Number(e.target.value))}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                    {/* Interest Rate Fields - Monthly and Yearly */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="interestRate" className="text-xs flex gap-2">
                            Monthly Interest <Percent className="w-3 h-3 bottom-0" />
                          </Label>
                          <Input
                            id="interestRate"
                            type="number"
                            step="0.1"
                            value={formData.interestRate}
                            onChange={(e) => handleMonthlyInterestChange(e.target.value)}
                            className="input-field text-sm"
                            min="0.1"
                            max="5"
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="yearlyInterestRate" className="text-xs flex gap-2">
                            Yearly Interest <Percent className="w-3 h-3 bottom-0" />
                          </Label>
                          
                          <Input
                            id="yearlyInterestRate"
                            type="number"
                            step="0.1"
                            value={formData.yearlyInterestRate}
                            onChange={(e) => handleYearlyInterestChange(e.target.value)}
                            className="input-field text-sm"
                            min="1"
                            max="60"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hpDate" className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        HP Date *
                      </Label>
                      <DatePicker
                        id="hpDate"
                        value={formData.hpDate}
                        onChange={e => updateField('hpDate', e.target.value)}
                        placeholder="HP Date"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="due_date" className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Due Date *
                      </Label>
                      <DatePicker
                        id="due_date"
                        value={formData.due_date}
                        onChange={e => updateField('due_date', e.target.value)}
                        placeholder="Due Date"
                        required
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Loan Calculations */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Loan Calculations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Due Amount</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatCurrency(calculatedValues.monthlyEmi)}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-amber-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Interest</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {formatCurrency(calculatedValues.totalInterest)}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Payable</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(calculatedValues.totalAmount)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Breakdown */}
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Principal Part (Monthly):</span>
                        <span className="font-medium">{formatCurrency(formData.principle_part)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Interest Part (Monthly):</span>
                        <span className="font-medium">{formatCurrency(formData.interest_part)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment Setup Tab */}
            <TabsContent value="payment" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Payment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Due Date</Label>
                      <DatePicker
                        id="dueDate"
                        value={formData.dueDate}
                        onChange={e => updateField('dueDate', e.target.value)}
                        placeholder="Due Date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paymentDate">Payment Date</Label>
                      <DatePicker
                        id="paymentDate"
                        value={formData.paymentDate}
                        onChange={e => updateField('paymentDate', e.target.value)}
                        placeholder="Payment Date"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="billNumber">Bill Number</Label>
                    <Input
                      id="billNumber"
                      value={formData.billNumber}
                      onChange={e => updateField('billNumber', e.target.value)}
                      placeholder="Enter bill number"
                      className="input-field"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount (₹)</Label>
                      <Input
                        id="amount"
                        type="number"
                        value={formData.amount}
                        onChange={e => updateField('amount', Number(e.target.value))}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="penalty">Penalty (₹)</Label>
                      <Input
                        id="penalty"
                        type="number"
                        value={formData.penalty}
                        onChange={e => updateField('penalty', Number(e.target.value))}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="collected_by">Collected By</Label>
                    {user?.role === 'owner' ? (
                      <Select
                        value={formData.collected_by}
                        onValueChange={value => updateField('collected_by', value)}
                      >
                        <SelectTrigger className="input-field">
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUsers.map(user => (
                            <SelectItem key={user.id} value={user.email}>
                              {user.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={formData.collected_by || user?.email || ''}
                        readOnly
                        className="input-field bg-muted"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Mode</Label>
                      <Select
                        value={formData.payment_mode}
                        onValueChange={value => updateField('payment_mode', value)}
                      >
                        <SelectTrigger className="input-field">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentModes.map(mode => (
                            <SelectItem key={mode.value} value={mode.value}>
                              {mode.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Mode 2 (Optional)</Label>
                      <Select
                        value={formData.payment_mode_1 || 'none'}
                        onValueChange={value => updateField('payment_mode_1', value === 'none' ? undefined : value)}
                      >
                        <SelectTrigger className="input-field">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {paymentModes.map(mode => (
                            <SelectItem key={mode.value} value={mode.value}>
                              {mode.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && (
                    <div className="space-y-2">
                      <Label htmlFor="payment_mode_1_amount">Payment Mode 2 Amount (₹)</Label>
                      <Input
                        id="payment_mode_1_amount"
                        type="number"
                        value={formData.payment_mode_1_amount}
                        onChange={e => updateField('payment_mode_1_amount', Number(e.target.value))}
                        placeholder="0"
                        className="input-field"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="hand_loan">Hand Loan Amount (₹)</Label>
                    <Input
                      id="hand_loan"
                      type="number"
                      value={formData.hand_loan}
                      onChange={e => updateField('hand_loan', Number(e.target.value))}
                      placeholder="0"
                      className="input-field"
                    />
                  </div>

                  {formData.hand_loan > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="hand_loan_remarks">Hand Loan Remarks</Label>
                      <Textarea
                        id="hand_loan_remarks"
                        value={formData.hand_loan_remarks}
                        onChange={e => updateField('hand_loan_remarks', e.target.value)}
                        placeholder="Enter hand loan remarks"
                        className="input-field min-h-[60px]"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Additional Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="documentation_charge" className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        Documentation Charge (₹)
                      </Label>
                      <Input
                        id="documentation_charge"
                        type="number"
                        value={formData.documentation_charge}
                        onChange={e => updateField('documentation_charge', Number(e.target.value))}
                        className="input-field"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="broker_commission" className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        Broker Commission (₹)
                      </Label>
                      <Input
                        id="broker_commission"
                        type="number"
                        value={formData.broker_commission}
                        onChange={e => updateField('broker_commission', Number(e.target.value))}
                        className="input-field"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Review Tab */}
            <TabsContent value="review" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Reloan Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Customer Information */}
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <UserIcon className="w-4 h-4" />
                      Customer Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Original HPL:</span>
                        <p className="font-medium">{customerData?.customer?.hplno}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">New HPL:</span>
                        <p className="font-medium">{formData.newHplNo}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Customer Name:</span>
                        <p className="font-medium">{customerData?.customer?.cname}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Broker:</span>
                        <p className="font-medium">{formData.broker_name}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Loan Information */}
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <Calculator className="w-4 h-4" />
                      Loan Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Loan Amount:</span>
                        <p className="font-medium text-green-600">{formatCurrency(formData.reloanAmount)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tenure:</span>
                        <p className="font-medium">{formData.dueMonth} months</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interest Rate (M):</span>
                        <p className="font-medium">{formData.interestRate}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interest Rate (Y):</span>
                        <p className="font-medium">{formData.yearlyInterestRate}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Monthly EMI:</span>
                        <p className="font-medium">{formatCurrency(calculatedValues.monthlyEmi)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Payable:</span>
                        <p className="font-medium">{formatCurrency(calculatedValues.totalAmount)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Loan Type:</span>
                        <p className="font-medium">{formData.loan_type.replace(/_/g, ' ').toUpperCase()}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Current Balance Settlement */}
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Current Balance Settlement
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-blue-50 rounded">
                        <span className="text-muted-foreground">Principal Due:</span>
                        <p className="font-medium text-blue-600">{formatCurrency(currentBalance.principal)}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded">
                        <span className="text-muted-foreground">Interest Due:</span>
                        <p className="font-medium text-purple-600">{formatCurrency(currentBalance.interest)}</p>
                      </div>
                      <div className="p-3 bg-red-50 rounded">
                        <span className="text-muted-foreground">Penalty:</span>
                        <p className="font-medium text-red-600">{formatCurrency(currentBalance.penalty)}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded">
                        <span className="text-muted-foreground">Total Settled:</span>
                        <p className="font-bold text-green-600">{formatCurrency(currentBalance.total_balance)}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Payment Information */}
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Payment Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Down Payment:</span>
                        <p className="font-medium">{formatCurrency(formData.down_payment)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Primary Mode:</span>
                        <p className="font-medium">
                          {paymentModes.find(m => m.value === formData.payment_mode)?.label || 'Not set'}
                        </p>
                      </div>
                      {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && (
                        <div>
                          <span className="text-muted-foreground">Secondary Mode:</span>
                          <p className="font-medium">
                            {paymentModes.find(m => m.value === formData.payment_mode_1)?.label} - 
                            {formatCurrency(formData.payment_mode_1_amount)}
                          </p>
                        </div>
                      )}
                      {formData.hand_loan > 0 && (
                        <div>
                          <span className="text-muted-foreground">Hand Loan:</span>
                          <p className="font-medium">{formatCurrency(formData.hand_loan)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Important Notes */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-amber-800 mb-1">Important Notes</h4>
                        <ul className="text-sm text-amber-700 space-y-1">
                          <li>• Original loan will be closed with balance settlement of {formatCurrency(currentBalance.total_balance)}</li>
                          <li>• New loan account will be created</li>
                          <li>• All customer data will be copied to new account</li>
                          <li>• This action cannot be undone</li>
                          <li>• Vehicle assignment will be transferred</li>
                          <li>• Old loan balance breakdown: Principal {formatCurrency(currentBalance.principal)} + Interest {formatCurrency(currentBalance.interest)} + Penalty {formatCurrency(currentBalance.penalty)}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Remarks Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Remarks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="remarks" className="flex items-center gap-1">
                  <Receipt className="w-4 h-4" />
                  Reloan Remarks
                </Label>
                <Textarea
                  id="remarks"
                  value={formData.remarks}
                  onChange={e => updateField('remarks', e.target.value)}
                  placeholder="Enter reloan remarks"
                  className="input-field min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  This will be recorded in the loan history
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Settling old balance: {formatCurrency(currentBalance.total_balance)} → Creating new loan: HPL {formData.newHplNo}
            </div>
            
            <div className="flex gap-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              
              {activeTab !== 'review' && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (activeTab === 'payment') setActiveTab('details');
                    if (activeTab === 'details') setActiveTab('review');
                  }}
                >
                  Next: {activeTab === 'payment' ? 'Loan Details' : 'Review'}
                </Button>
              )}
              
              {activeTab === 'review' && (
                <Button 
                  type="submit" 
                  className="bg-blue-600 hover:bg-blue-700 px-6"
                  disabled={loading || !formData.newHplNo || formData.reloanAmount <= 0}
                >
                  {loading ? (
                    <>
                      <span className="animate-spin mr-2">⟳</span>
                      Creating Reloan...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Create Reloan
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReloanDialog;