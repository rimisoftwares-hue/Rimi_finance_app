// import { useState, useEffect } from 'react';
// import { PaymentFormData, LoanDetails } from '../../types/customer';
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogFooter,
// } from '../ui/dialog';
// import { Button } from '../ui/button';
// import { Input } from '../ui/input';
// import { Label } from '../ui/label';
// import { Textarea } from '../ui/textarea';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '../ui/select';
// import { useAuth } from '../../contexts/AuthContext';
// import axios from 'axios';
// import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
// import { Badge } from '../ui/badge';
// import { Separator } from '../ui/separator';
// import { Calculator, DollarSign, AlertCircle, FileText, User, CreditCard, Receipt } from 'lucide-react';

// interface SettlementDialogProps {
//   isOpen: boolean;
//   onClose: () => void;
//   onSubmit: (data: PaymentFormData) => void;
//   initialData: any;
//   loan: LoanDetails;
//   penaltyDays: number;
//   totalPaidAmount: number;
//   totalPenalty: number;
// }

// const paymentModes = [
//   { value: 'cash', label: 'Cash' },
//   { value: 'online', label: 'Online' },
//   { value: 'bank', label: 'Bank Transfer' },
//   { value: 'upi', label: 'UPI' },
//   { value: 'cheque', label: 'Cheque' },
//   { value: 'other', label: 'Other' },
// ];

// const SettlementDialog = ({
//   isOpen,
//   onClose,
//   onSubmit,
//   initialData,
//   loan,
//   penaltyDays,
//   totalPaidAmount,
//   totalPenalty,
// }: SettlementDialogProps) => {
//   const [formData, setFormData] = useState<PaymentFormData>({
//     dueDate: new Date().toISOString().split('T')[0],
//     paymentDate: new Date().toISOString().split('T')[0],
//     billNumber: '',
//     amount: 0,
//     penalty: 0,
//     collected_by: '',
//     payment_mode: '',
//     payment_mode_1: undefined,
//     payment_mode_1_amount: 0,
//     hand_loan: 0,
//     hand_loan_remark: '',
//     remarks: 'Full and final settlement',
//   });

//   const { user } = useAuth();
//   const [allUsers, setAllUsers] = useState<any[]>([]);
//   const [loading, setLoading] = useState(false);
//   const BASE_URL = `${import.meta.env.VITE_API_URL}`;

//   // Calculate settlement amounts
//   const dueMonthNum = typeof loan?.dueMonth === 'string' ? parseInt(loan.dueMonth, 10) : loan?.dueMonth || 0;
//   const totalAmount = dueMonthNum * (loan?.dueAmount || 0);
//   const balanceAmount = totalAmount - totalPaidAmount;
//   const penaltyTotal = (loan?.penaltyAmount || 0) * penaltyDays;
//   const penaltyBalance = Math.max(penaltyTotal - totalPenalty, 0);
//   const settlementTotal = balanceAmount + penaltyBalance;

//   // Initialize form data
//   useEffect(() => {
//     if (isOpen) {
//       let updatedFormData = { ...formData };
      
//       // Auto-generate bill number
//       updatedFormData.billNumber = `SETTLE-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${Date.now().toString().slice(-4)}`;
      
//       // Set collected_by to current user if not owner
//       if (user && user.role !== 'owner' && user.email) {
//         updatedFormData.collected_by = user.email;
//       } else if (user?.role === 'owner') {
//         updatedFormData.collected_by = user.email || '';
//       }
      
//       // Set calculated amounts
//       updatedFormData.amount = balanceAmount;
//       updatedFormData.penalty = penaltyBalance;
      
//       setFormData(updatedFormData);
//       fetchAllUsers();
//     }
//   }, [isOpen, user, balanceAmount, penaltyBalance]);

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setLoading(true);
//     try {
//       await onSubmit(formData);
//       onClose();
//     } catch (error) {
//       console.error('Error submitting settlement:', error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const fetchAllUsers = async () => {
//     try {
//       const response = await axios.get(`${BASE_URL}/auth/allUsers`);
//       if (response.data.success) {
//         setAllUsers(response.data.users);
//       }
//     } catch (error) {
//       console.error('Error fetching users:', error);
//     }
//   };

//   const updateField = (field: keyof PaymentFormData, value: any) => {
//     setFormData(prev => ({ ...prev, [field]: value }));
//   };

//   const formatCurrency = (amount: number) => {
//     return new Intl.NumberFormat('en-IN', {
//       style: 'currency',
//       currency: 'INR',
//       minimumFractionDigits: 0,
//       maximumFractionDigits: 0,
//     }).format(amount);
//   };

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose}>
//       <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2 text-2xl">
//             <FileText className="w-4 h-4 text-primary" />
//             Full Settlement
//             <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
//               Final Payment
//             </Badge>
//           </DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-6">
//           {/* Summary Section */}
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             {/* Loan Summary Card */}
//             <Card className="border-l-4 border-l-blue-500">
//               <CardHeader className="pb-3">
//                 <CardTitle className="flex items-center gap-2 text-lg">
//                   <Calculator className="w-5 h-5 text-blue-600" />
//                   Loan Summary
//                 </CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-3">
//                 <div className="grid grid-cols-2 gap-2">
//                   <div>
//                     <p className="text-sm text-muted-foreground">Total Loan</p>
//                     <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
//                   </div>
//                   <div>
//                     <p className="text-sm text-muted-foreground">Total Paid</p>
//                     <p className="text-lg font-bold text-green-600">{formatCurrency(totalPaidAmount)}</p>
//                   </div>
//                   <div>
//                     <p className="text-sm text-muted-foreground">Balance</p>
//                     <p className="text-lg font-bold text-amber-600">{formatCurrency(balanceAmount)}</p>
//                   </div>
//                   <div>
//                     <p className="text-sm text-muted-foreground">Penalty Due</p>
//                     <p className="text-lg font-bold text-red-600">{formatCurrency(penaltyBalance)}</p>
//                   </div>
//                 </div>
//                 <Separator />
//                 <div className="flex justify-between items-center pt-2">
//                   <p className="text-sm font-medium text-muted-foreground">Settlement Total</p>
//                   <p className="text-2xl font-bold text-primary">
//                     {formatCurrency(settlementTotal)}
//                   </p>
//                 </div>
//                 <div className="text-xs text-muted-foreground">
//                   {penaltyDays > 0 ? (
//                     <span className="text-red-600">⚠️ Includes {penaltyDays} days penalty</span>
//                   ) : (
//                     <span className="text-green-600">✓ No penalty applied</span>
//                   )}
//                 </div>
//               </CardContent>
//             </Card>

//             {/* Payment Details Card */}
//             <Card className="border-l-4 border-l-green-500">
//               <CardHeader className="pb-3">
//                 <CardTitle className="flex items-center gap-2 text-lg">
//                   <CreditCard className="w-5 h-5 text-green-600" />
//                   Payment Details
//                 </CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-3">
//                 <div className="grid grid-cols-2 gap-2">
//                   <div className="space-y-2">
//                     <Label htmlFor="dueDate" className="flex items-center gap-1">
//                       Due Date
//                     </Label>
//                     <Input
//                       id="dueDate"
//                       type="date"
//                       value={formData.dueDate}
//                       onChange={e => updateField('dueDate', e.target.value)}
//                       className="input-field"
//                     />
//                   </div>
//                   <div className="space-y-2">
//                     <Label htmlFor="paymentDate" className="flex items-center gap-1">
//                       Payment Date
//                     </Label>
//                     <Input
//                       id="paymentDate"
//                       type="date"
//                       value={formData.paymentDate}
//                       onChange={e => updateField('paymentDate', e.target.value)}
//                       className="input-field"
//                     />
//                   </div>
//                 </div>
                
//                 <div className="space-y-2">
//                   <Label htmlFor="billNumber" className="flex items-center gap-1">
//                     Bill Number
//                   </Label>
//                   <Input
//                     id="billNumber"
//                     value={formData.billNumber}
//                     onChange={e => updateField('billNumber', e.target.value)}
//                     className="input-field font-mono"
//                   />
//                 </div>
//               </CardContent>
//             </Card>
//           </div>

//           {/* Amount Details Card */}
//           <Card>
//             <CardHeader className="pb-3">
//               <CardTitle className="text-lg">Amount Breakdown</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               <div className="grid grid-cols-2 gap-4">
//                 <div className="space-y-2">
//                   <Label htmlFor="amount" className="flex items-center gap-1">
//                     <DollarSign className="w-4 h-4" />
//                     Principal Amount (₹)
//                   </Label>
//                   <Input
//                     id="amount"
//                     type="number"
//                     value={formData.amount || balanceAmount}
//                     onChange={e => updateField('amount', Number(e.target.value))}
//                     className="input-field text-lg font-medium"
//                   />
//                   <p className="text-xs text-muted-foreground">
//                     Remaining loan balance
//                   </p>
//                 </div>
//                 <div className="space-y-2">
//                   <Label htmlFor="penalty" className="flex items-center gap-1">
//                     <AlertCircle className="w-4 h-4 text-red-600" />
//                     Penalty (₹)
//                   </Label>
//                   <Input
//                     id="penalty"
//                     type="number"
//                     value={formData.penalty || penaltyBalance}
//                     onChange={e => updateField('penalty', Number(e.target.value))}
//                     className="input-field text-lg font-medium"
//                   />
//                   <p className="text-xs text-muted-foreground">
//                     {penaltyBalance > 0 ? 'Penalty for late payments' : 'No penalty'}
//                   </p>
//                 </div>
//               </div>

//               {/* Hand Loan Section */}
//               <div className="space-y-2">
//                 <Label htmlFor="hand_loan" className="flex items-center gap-1">
//                   <DollarSign className="w-4 h-4" />
//                   Hand Loan (Optional)
//                 </Label>
//                 <Input
//                   id="hand_loan"
//                   type="number"
//                   value={formData.hand_loan || ''}
//                   onChange={e => updateField('hand_loan', Number(e.target.value))}
//                   placeholder="0"
//                   className="input-field"
//                 />
//               </div>

//               {formData.hand_loan > 0 && (
//                 <div className="space-y-2">
//                   <Label htmlFor="hand_loan_remark" className="flex items-center gap-1">
//                     <Receipt className="w-4 h-4" />
//                     Hand Loan Remark
//                   </Label>
//                   <Textarea
//                     id="hand_loan_remark"
//                     value={formData.hand_loan_remark || ''}
//                     onChange={e => updateField('hand_loan_remark', e.target.value)}
//                     placeholder="Enter hand loan remarks"
//                     className="input-field min-h-[60px]"
//                   />
//                 </div>
//               )}
//             </CardContent>
//           </Card>

//           {/* Payment Modes Section */}
//           <Card>
//             <CardHeader className="pb-3">
//               <CardTitle className="text-lg">Payment Modes</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <div className="space-y-2">
//                   <Label>Primary Payment Mode</Label>
//                   <Select
//                     value={formData.payment_mode}
//                     onValueChange={value => updateField('payment_mode', value)}
//                   >
//                     <SelectTrigger className="input-field">
//                       <SelectValue placeholder="Select payment mode" />
//                     </SelectTrigger>
//                     <SelectContent>
//                       {paymentModes.map(mode => (
//                         <SelectItem key={mode.value} value={mode.value}>
//                           {mode.label}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 </div>

//                 <div className="space-y-2">
//                   <Label>Secondary Payment Mode (Optional)</Label>
//                   <Select
//                     value={formData.payment_mode_1 || 'none'}
//                     onValueChange={value => updateField('payment_mode_1', value === 'none' ? undefined : value)}
//                   >
//                     <SelectTrigger className="input-field">
//                       <SelectValue placeholder="Select mode" />
//                     </SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="none">None</SelectItem>
//                       {paymentModes.map(mode => (
//                         <SelectItem key={mode.value} value={mode.value}>
//                           {mode.label}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 </div>
//               </div>

//               {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && (
//                 <div className="space-y-2">
//                   <Label htmlFor="payment_mode_1_amount" className="flex items-center gap-1">
//                     <DollarSign className="w-4 h-4" />
//                     Secondary Mode Amount (₹)
//                   </Label>
//                   <Input
//                     id="payment_mode_1_amount"
//                     type="number"
//                     value={formData.payment_mode_1_amount || ''}
//                     onChange={e => updateField('payment_mode_1_amount', Number(e.target.value))}
//                     placeholder="Enter amount for secondary payment mode"
//                     className="input-field"
//                   />
//                 </div>
//               )}
//             </CardContent>
//           </Card>

//           {/* Collector Information */}
//           <Card>
//             <CardHeader className="pb-3">
//               <CardTitle className="text-lg">Collection Details</CardTitle>
//             </CardHeader>
//             <CardContent>
//               {user?.role === 'owner' ? (
//                 <div className="space-y-2">
//                   <Label htmlFor="collected_by" className="flex items-center gap-1">
//                     <User className="w-4 h-4" />
//                     Collected By
//                   </Label>
//                   <Select
//                     value={formData.collected_by}
//                     onValueChange={value => updateField('collected_by', value)}
//                   >
//                     <SelectTrigger className="input-field">
//                       <SelectValue placeholder="Select user" />
//                     </SelectTrigger>
//                     <SelectContent>
//                       {allUsers.map(user => (
//                         <SelectItem key={user.id} value={user.email}>
//                           {user.email}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 </div>
//               ) : (
//                 <div className="space-y-2">
//                   <Label htmlFor="collected_by" className="flex items-center gap-1">
//                     <User className="w-4 h-4" />
//                     Collected By
//                   </Label>
//                   <Input
//                     id="collected_by"
//                     value={formData.collected_by || user?.email || ''}
//                     readOnly
//                     className="input-field bg-muted"
//                   />
//                   <p className="text-xs text-muted-foreground mt-1">
//                     This field is automatically set to your account
//                   </p>
//                 </div>
//               )}
//             </CardContent>
//           </Card>

//           {/* Remarks & Warning */}
//           <div className="space-y-4">
//             <div className="space-y-2">
//               <Label htmlFor="remarks" className="flex items-center gap-1">
//                 <Receipt className="w-4 h-4" />
//                 Settlement Remarks
//               </Label>
//               <Textarea
//                 id="remarks"
//                 value={formData.remarks}
//                 onChange={e => updateField('remarks', e.target.value)}
//                 placeholder="Enter settlement remarks (e.g., 'Full and final settlement')"
//                 className="input-field min-h-[80px]"
//               />
//             </div>

//             <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
//               <div className="flex gap-3">
//                 <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
//                 <div>
//                   <h4 className="font-medium text-amber-800 mb-1">Important Notice</h4>
//                   <ul className="text-sm text-amber-700 space-y-1">
//                     <li>• After settlement, the customer's loan status will be updated to 'closed'</li>
//                     <li>• No further payments will be accepted after settlement</li>
//                     <li>• This action cannot be undone</li>
//                     <li>• Please verify all amounts before confirming</li>
//                   </ul>
//                 </div>
//               </div>
//             </div>
//           </div>

//           {/* Total Summary */}
//           <Card className="bg-green-50 border-green-200">
//             <CardContent className="pt-4">
//               <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
//                 <div>
//                   <h3 className="font-semibold text-green-800 mb-1">Final Settlement Amount</h3>
//                   <p className="text-sm text-green-700">
//                     {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && formData.payment_mode_1_amount ? (
//                       <>
//                         {formatCurrency(formData.amount + formData.penalty - (formData.payment_mode_1_amount || 0))} via {formData.payment_mode} + 
//                         {formatCurrency(formData.payment_mode_1_amount || 0)} via {formData.payment_mode_1}
//                       </>
//                     ) : (
//                       `${formatCurrency(formData.amount + formData.penalty)} via ${formData.payment_mode || 'N/A'}`
//                     )}
//                   </p>
//                 </div>
//                 <div className="text-right">
//                   <div className="text-2xl font-bold text-green-800">
//                     {formatCurrency(formData.amount + formData.penalty)}
//                   </div>
//                   <p className="text-sm text-green-700">Total payable amount</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <DialogFooter className="gap-3 pt-4">
//             <Button 
//               type="button" 
//               variant="outline" 
//               onClick={onClose}
//               disabled={loading}
//             >
//               Cancel
//             </Button>
//             <Button 
//               type="submit" 
//               className="bg-green-600 hover:bg-green-700 px-6"
//               disabled={loading || formData.amount <= 0 || !formData.payment_mode}
//             >
//               {loading ? (
//                 <>
//                   <span className="animate-spin mr-2">⟳</span>
//                   Processing Settlement...
//                 </>
//               ) : (
//                 'Confirm Full Settlement'
//               )}
//             </Button>
//           </DialogFooter>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// };

// export default SettlementDialog;


import { useState, useEffect } from 'react';
import { PaymentFormData, LoanDetails } from '../../types/customer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
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
import apiClient from '../../api/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Calculator, DollarSign, AlertCircle, FileText, User, CreditCard, Receipt } from 'lucide-react';

interface SettlementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PaymentFormData) => void;
  initialData: any;
  loan: LoanDetails;
  penaltyDays: number;
  totalPaidAmount: number;
  totalPenalty: number;
}

const paymentModes = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const SettlementDialog = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  loan,
  penaltyDays,
  totalPaidAmount,
  totalPenalty,
}: SettlementDialogProps) => {
  const [formData, setFormData] = useState<PaymentFormData>({
    dueDate: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    billNumber: '',
    amount: 0,
    penalty: 0,
    collected_by: '',
    payment_mode: 'cash', // Set default to 'cash'
    payment_mode_1: undefined,
    payment_mode_1_amount: 0,
    hand_loan: 0,
    hand_loan_remark: '',
    remarks: 'Full and final settlement',
  });

  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const BASE_URL = `${import.meta.env.VITE_API_URL}`;

  // Calculate settlement amounts
  const dueMonthNum = typeof loan?.dueMonth === 'string' ? parseInt(loan.dueMonth, 10) : loan?.dueMonth || 0;
  const totalAmount = dueMonthNum * (loan?.dueAmount || 0);
  const balanceAmount = totalAmount - totalPaidAmount;
  const penaltyTotal = (loan?.penaltyAmount || 0) * penaltyDays;
  const penaltyBalance = Math.max(penaltyTotal - totalPenalty, 0);
  const settlementTotal = balanceAmount + penaltyBalance;

  // Calculate next due date based on last payment or HP date
  const calculateNextDueDate = () => {
    if (!loan?.hpDate) return new Date().toISOString().split('T')[0];

    const payments = initialData || [];
    const lastPayment = payments
      .filter((p: any) => p.dueDate && p.dueDate !== '-')
      .sort((a: any, b: any) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];
    
    const baseDate = lastPayment?.dueDate || loan.hpDate;
    const parts = baseDate.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };

  // Initialize form data
  useEffect(() => {
    if (isOpen) {
      const nextDueDate = calculateNextDueDate();
      const currentUserEmail = user?.email || '';
      
      let updatedFormData = { ...formData };
      
      // Calculate due date
      updatedFormData.dueDate = nextDueDate;
      
      // Auto-generate bill number
      updatedFormData.billNumber = `SETTLE-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${Date.now().toString().slice(-4)}`;
      
      // Set collected_by based on user role
      if (user) {
        if (user.role !== 'owner') {
          // Non-owner: set to current user's email
          updatedFormData.collected_by = currentUserEmail;
        } else if (user.role === 'owner') {
          // Owner: set to current user's email as default
          updatedFormData.collected_by = currentUserEmail;
        }
      }
      
      // Set payment mode to 'cash' as default
      updatedFormData.payment_mode = 'cash';
      
      // Set calculated amounts
      updatedFormData.amount = balanceAmount;
      updatedFormData.penalty = penaltyBalance;
      
      setFormData(updatedFormData);
      fetchAllUsers();
    }
  }, [isOpen, user, balanceAmount, penaltyBalance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Error submitting settlement:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await apiClient.get('/auth/allUsers');
      if (response.data.success) {
        setAllUsers(response.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const updateField = (field: keyof PaymentFormData, value: any) => {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <FileText className="w-4 h-4 text-primary" />
            Full Settlement
            <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
              Final Payment
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Summary Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Loan Summary Card */}
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="w-5 h-5 text-blue-600" />
                  Loan Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Loan</p>
                    <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(totalPaidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Balance</p>
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(balanceAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Penalty Due</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(penaltyBalance)}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between items-center pt-2">
                  <p className="text-sm font-medium text-muted-foreground">Settlement Total</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(settlementTotal)}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {penaltyDays > 0 ? (
                    <span className="text-red-600">⚠️ Includes {penaltyDays} days penalty</span>
                  ) : (
                    <span className="text-green-600">✓ No penalty applied</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Details Card */}
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="w-5 h-5 text-green-600" />
                  Payment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="dueDate" className="flex items-center gap-1">
                      Due Date
                    </Label>
                    <DatePicker
                      id="dueDate"
                      value={formData.dueDate}
                      onChange={e => updateField('dueDate', e.target.value)}
                      placeholder="Due Date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate" className="flex items-center gap-1">
                      Payment Date
                    </Label>
                    <DatePicker
                      id="paymentDate"
                      value={formData.paymentDate}
                      onChange={e => updateField('paymentDate', e.target.value)}
                      placeholder="Payment Date"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="billNumber" className="flex items-center gap-1">
                    Bill Number
                  </Label>
                  <Input
                    id="billNumber"
                    value={formData.billNumber}
                    onChange={e => updateField('billNumber', e.target.value)}
                    className="input-field font-mono"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Amount Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Amount Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    Principal Amount (₹)
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    value={formData.amount || balanceAmount}
                    onChange={e => updateField('amount', Number(e.target.value))}
                    className="input-field text-lg font-medium"
                  />
                  <p className="text-xs text-muted-foreground">
                    Remaining loan balance
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="penalty" className="flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    Penalty (₹)
                  </Label>
                  <Input
                    id="penalty"
                    type="number"
                    value={formData.penalty || penaltyBalance}
                    onChange={e => updateField('penalty', Number(e.target.value))}
                    className="input-field text-lg font-medium"
                  />
                  <p className="text-xs text-muted-foreground">
                    {penaltyBalance > 0 ? 'Penalty for late payments' : 'No penalty'}
                  </p>
                </div>
              </div>

              {/* Hand Loan Section */}
              <div className="space-y-2">
                <Label htmlFor="hand_loan" className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  Hand Loan (Optional)
                </Label>
                <Input
                  id="hand_loan"
                  type="number"
                  value={formData.hand_loan || ''}
                  onChange={e => updateField('hand_loan', Number(e.target.value))}
                  placeholder="0"
                  className="input-field"
                />
              </div>

              {formData.hand_loan > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="hand_loan_remark" className="flex items-center gap-1">
                    <Receipt className="w-4 h-4" />
                    Hand Loan Remark
                  </Label>
                  <Textarea
                    id="hand_loan_remark"
                    value={formData.hand_loan_remark || ''}
                    onChange={e => updateField('hand_loan_remark', e.target.value)}
                    placeholder="Enter hand loan remarks"
                    className="input-field min-h-[60px]"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Modes Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Payment Modes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Payment Mode</Label>
                  <Select
                    value={formData.payment_mode}
                    onValueChange={value => updateField('payment_mode', value)}
                  >
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentModes.map(mode => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Default set to Cash
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Secondary Payment Mode (Optional)</Label>
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
                  <Label htmlFor="payment_mode_1_amount" className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    Secondary Mode Amount (₹)
                  </Label>
                  <Input
                    id="payment_mode_1_amount"
                    type="number"
                    value={formData.payment_mode_1_amount || ''}
                    onChange={e => updateField('payment_mode_1_amount', Number(e.target.value))}
                    placeholder="Enter amount for secondary payment mode"
                    className="input-field"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collector Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Collection Details</CardTitle>
            </CardHeader>
            <CardContent>
              {user?.role === 'owner' ? (
                <div className="space-y-2">
                  <Label htmlFor="collected_by" className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    Collected By
                  </Label>
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
                  <p className="text-xs text-muted-foreground">
                    Owner can select any user
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="collected_by" className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    Collected By
                  </Label>
                  <Input
                    id="collected_by"
                    value={formData.collected_by || user?.email || ''}
                    readOnly
                    className="input-field bg-muted"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically set to your account
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Remarks & Warning */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="remarks" className="flex items-center gap-1">
                <Receipt className="w-4 h-4" />
                Settlement Remarks
              </Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={e => updateField('remarks', e.target.value)}
                placeholder="Enter settlement remarks (e.g., 'Full and final settlement')"
                className="input-field min-h-[80px]"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-amber-800 mb-1">Important Notice</h4>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• After settlement, the customer's loan status will be updated to 'closed'</li>
                    <li>• No further payments will be accepted after settlement</li>
                    <li>• This action cannot be undone</li>
                    <li>• Please verify all amounts before confirming</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Total Summary */}
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-green-800 mb-1">Final Settlement Amount</h3>
                  <p className="text-sm text-green-700">
                    {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && formData.payment_mode_1_amount ? (
                      <>
                        {formatCurrency(formData.amount + formData.penalty - (formData.payment_mode_1_amount || 0))} via {formData.payment_mode} + 
                        {formatCurrency(formData.payment_mode_1_amount || 0)} via {formData.payment_mode_1}
                      </>
                    ) : (
                      `${formatCurrency(formData.amount + formData.penalty)} via ${formData.payment_mode || 'N/A'}`
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Collected by: {formData.collected_by || 'Not set'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-800">
                    {formatCurrency(formData.amount + formData.penalty)}
                  </div>
                  <p className="text-sm text-green-700">Total payable amount</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <DialogFooter className="gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-green-600 hover:bg-green-700 px-6"
              disabled={loading || formData.amount <= 0 || !formData.payment_mode}
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Processing Settlement...
                </>
              ) : (
                'Confirm Full Settlement'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SettlementDialog;