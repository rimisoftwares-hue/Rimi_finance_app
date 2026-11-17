// import { useState, useEffect } from 'react';
// import { PaymentFormData, User } from '../../types/customer';
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
// import { useAuth } from '../../contexts/AuthContext'; // Import AuthContext
// import axios from 'axios';
// interface PaymentDialogProps {
//   isOpen: boolean;
//   onClose: () => void;
//   onSubmit: (data: PaymentFormData) => void;
//   initialData: PaymentFormData;
//   isEditing: boolean;
//   penaltyDays: number;
// }
// export interface User_new {
//   id: string;
//   email: string;
//   role: 'owner' | 'agent' | 'staff' | 'admin';
// }

// const paymentModes = [
//   { value: 'cash', label: 'Cash' },
//   { value: 'online', label: 'Online' },
//   { value: 'bank', label: 'Bank Transfer' },
//   { value: 'upi', label: 'UPI' },
//   { value: 'cheque', label: 'Cheque' },
//   { value: 'other', label: 'Other' },
// ];

// const PaymentDialog = ({
//   isOpen,
//   onClose,
//   onSubmit,
//   initialData,
//   isEditing,
//   penaltyDays,
// }: PaymentDialogProps) => {
//   const [formData, setFormData] = useState<PaymentFormData>(initialData);
//   const { user } = useAuth(); // Get current user from AuthContext
//   const [allUsers, setAllUsers] = useState<User_new[]>([])
//   const BASE_URL = `${import.meta.env.VITE_API_URL}`
//   // Initialize form data with current user email if not owner
//   useEffect(() => {
//     if (isOpen) {
//       let updatedFormData = { ...initialData };

//       // If user is not owner, set collected_by to current user's email
//       if (user && user.email) {
//         updatedFormData.collected_by = user.email;
//       }

//       setFormData(updatedFormData);
//       fetchAllUsers()
//     }
//   }, [initialData, isOpen, user]);

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     onSubmit(formData);
//     console.log('formData:', formData.collected_by)
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

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose} key={isEditing ? 'edit' : 'add'}>
//       <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
//         <DialogHeader>
//           <DialogTitle className="font-display">
//             {isEditing ? 'Edit Payment' : 'Add New Payment'}
//           </DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div className="grid grid-cols-2 gap-4">
//             <div className="space-y-2">
//               <Label htmlFor="dueDate">Due Date</Label>
//               <Input
//                 id="dueDate"
//                 type="date"
//                 value={formData.dueDate}
//                 onChange={e => updateField('dueDate', e.target.value)}
//                 readOnly={!isEditing}
//                 className="input-field"
//               />
//             </div>
//             <div className="space-y-2">
//               <Label htmlFor="paymentDate">Payment Date</Label>
//               <Input
//                 id="paymentDate"
//                 type="date"
//                 value={formData.paymentDate}
//                 onChange={e => updateField('paymentDate', e.target.value)}
//                 className="input-field"
//               />
//             </div>
//           </div>

//           <div className="p-3 bg-muted/50 rounded-lg border border-border">
//             <p className="text-sm text-muted-foreground">
//               Penalty Days: <span className={`font-semibold ${penaltyDays > 0 ? 'text-destructive' : 'text-success'}`}>
//                 {penaltyDays} days
//               </span>
//             </p>
//           </div>

//           <div className="space-y-2">
//             <Label htmlFor="billNumber">Bill Number</Label>
//             <Input
//               id="billNumber"
//               value={formData.billNumber}
//               onChange={e => updateField('billNumber', e.target.value)}
//               placeholder="Enter bill number"
//               className="input-field"
//             />
//           </div>

//           <div className="grid grid-cols-2 gap-4">
//             <div className="space-y-2">
//               <Label htmlFor="amount">Amount (₹)</Label>
//               <Input
//                 id="amount"
//                 type="number"
//                 value={formData.amount || ''}
//                 onChange={e => updateField('amount', Number(e.target.value))}
//                 placeholder="0"
//                 className="input-field"
//               />
//             </div>
//             <div className="space-y-2">
//               <Label htmlFor="penalty">Penalty (₹)</Label>
//               <Input
//                 id="penalty"
//                 type="number"
//                 value={(formData.penalty) || ''}
//                 onChange={e => updateField('penalty', Number(e.target.value))}
//                 placeholder="0"
//                 className="input-field"
//               />
//             </div>
//           </div>

//           {/* Conditionally show Collected By dropdown */}


//           <div className="space-y-2">
//             {user?.role === 'owner' ? (
//               // Owner can choose any user
//               <>
//                 <Label htmlFor="collected_by">Collected By</Label>
//                 <Select
//                   value={formData.collected_by || user?.email || ''}
//                   onValueChange={value => updateField('collected_by', value)}
//                 >
//                   <SelectTrigger className="input-field">
//                     <SelectValue placeholder="Select user" />
//                   </SelectTrigger>
//                   <SelectContent>
//                     {allUsers.map(userItem => (
//                       <SelectItem key={userItem.id} value={userItem.email}>
//                         {userItem.email}
//                       </SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </>
//             ) : (
//               // Non-owners see a disabled field with their email
//               <>
//                 <Label htmlFor="collected_by">Collected By</Label>
//                 <Input
//                   id="collected_by"
//                   value={formData.collected_by || user?.email || ''}
//                   readOnly
//                   className="input-field bg-gray-100 cursor-not-allowed"
//                   placeholder="Collector name"
//                 />
//                 <p className="text-xs text-muted-foreground mt-1">
//                   This field is automatically set to your email.
//                 </p>

//               </>
//             )}
//           </div>

//           <div className="grid grid-cols-2 gap-4">
//             <div className="space-y-2">
//               <Label>Payment Mode</Label>
//               <Select
//                 value={formData.payment_mode}
//                 onValueChange={value => updateField('payment_mode', value)}
//               >
//                 <SelectTrigger className="input-field">
//                   <SelectValue placeholder="Select mode" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {paymentModes.map(mode => (
//                     <SelectItem key={mode.value} value={mode.value}>
//                       {mode.label}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//             <div className="space-y-2">
//               <Label>Payment Mode 2 (Optional)</Label>
//               <Select
//                 value={formData.payment_mode_1 || ''}
//                 onValueChange={value => updateField('payment_mode_1', value || undefined)}
//               >
//                 <SelectTrigger className="input-field">
//                   <SelectValue placeholder="Select mode" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="none">None</SelectItem>
//                   {paymentModes.map(mode => (
//                     <SelectItem key={mode.value} value={mode.value}>
//                       {mode.label}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           </div>

//           {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && (
//             <div className="space-y-2">
//               <Label htmlFor="payment_mode_1_amount">Payment Mode 2 Amount (₹)</Label>
//               <Input
//                 id="payment_mode_1_amount"
//                 type="number"
//                 value={formData.payment_mode_1_amount || ''}
//                 onChange={e => updateField('payment_mode_1_amount', Number(e.target.value))}
//                 placeholder="0"
//                 className="input-field"
//               />
//             </div>
//           )}

//           <div className="space-y-2">
//             <Label htmlFor="hand_loan">Hand Loan Amount (₹)</Label>
//             <Input
//               id="hand_loan"
//               type="number"
//               value={formData.hand_loan ?? ''}
//               onChange={e => updateField('hand_loan', Number(e.target.value))}
//               placeholder="0"
//               className="input-field"
//             />
//           </div>

//           {(formData.hand_loan || formData.hand_loan === 0) && formData.hand_loan > 0 && (
//             <div className="space-y-2">
//               <Label htmlFor="hand_loan_remark">Hand Loan Remark</Label>
//               <Textarea
//                 id="hand_loan_remark"
//                 value={formData.hand_loan_remark || ''}
//                 onChange={e => updateField('hand_loan_remark', e.target.value)}
//                 placeholder="Enter remark"
//                 className="input-field min-h-[80px]"
//               />
//             </div>
//           )}

//           <div className="space-y-2">
//             <Label htmlFor="remarks">Remarks</Label>
//             <Textarea
//               id="remarks"
//               value={formData.remarks || ''}
//               onChange={e => updateField('remarks', e.target.value)}
//               placeholder="Enter any additional remarks"
//               className="input-field min-h-[80px]"
//             />
//           </div>

//           <DialogFooter className="gap-3 pt-4">
//             <Button type="button" variant="outline" onClick={onClose}>
//               Cancel
//             </Button>
//             <Button type="submit" className="btn-primary">
//               {isEditing ? 'Update' : 'Add'} Payment
//             </Button>
//           </DialogFooter>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// };

// export default PaymentDialog;

// import { useState, useEffect } from 'react';
// import { PaymentFormData, User } from '../../types/customer';
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
// import { useAuth } from '../../contexts/AuthContext'; // Import AuthContext
// import axios from 'axios';
// interface PaymentDialogProps {
//   isOpen: boolean;
//   onClose: () => void;
//   onSubmit: (data: PaymentFormData) => void;
//   initialData: PaymentFormData;
//   isEditing: boolean;
//   penaltyDays: number;
// }
// export interface User_new {
//   id: string;
//   email: string;
//   role: 'owner' | 'agent' | 'staff' | 'admin';
// }

// const paymentModes = [
//   { value: 'cash', label: 'Cash' },
//   { value: 'online', label: 'Online' },
//   { value: 'bank', label: 'Bank Transfer' },
//   { value: 'upi', label: 'UPI' },
//   { value: 'cheque', label: 'Cheque' },
//   { value: 'other', label: 'Other' },
// ];

// const PaymentDialog = ({
//   isOpen,
//   onClose,
//   onSubmit,
//   initialData,
//   isEditing,
//   penaltyDays,
// }: PaymentDialogProps) => {
//   const [formData, setFormData] = useState<PaymentFormData>(initialData);
//   const { user } = useAuth(); // Get current user from AuthContext
//   const [allUsers , setAllUsers] = useState<User_new[]>([])
//   const BASE_URL = `${import.meta.env.VITE_API_URL}`
//   // Initialize form data with current user email if not owner
//   useEffect(() => {
//     if (isOpen) {
//       let updatedFormData = { ...initialData };

//       // If user is not owner, set collected_by to current user's email
//        if (user && user.email) {
//         updatedFormData.collected_by = user.email;
//       }

//       setFormData(updatedFormData);
//       fetchAllUsers()
//     }
//   }, [initialData, isOpen, user]);

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     onSubmit(formData);
//     console.log('formData:',formData.collected_by)
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

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose} key={isEditing ? 'edit' : 'add'}>
//       <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
//         <DialogHeader>
//           <DialogTitle className="font-display">
//             {isEditing ? 'Edit Payment' : 'Add New Payment'}
//           </DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div className="grid grid-cols-2 gap-4">
//             <div className="space-y-2">
//               <Label htmlFor="dueDate">Due Date</Label>
//               <Input
//                 id="dueDate"
//                 type="date"
//                 value={formData.dueDate}
//                 onChange={e => updateField('dueDate', e.target.value)}
//                 readOnly={!isEditing}
//                 className="input-field"
//               />
//             </div>
//             <div className="space-y-2">
//               <Label htmlFor="paymentDate">Payment Date</Label>
//               <Input
//                 id="paymentDate"
//                 type="date"
//                 value={formData.paymentDate}
//                 onChange={e => updateField('paymentDate', e.target.value)}
//                 className="input-field"
//               />
//             </div>
//           </div>

//           <div className="p-3 bg-muted/50 rounded-lg border border-border">
//             <p className="text-sm text-muted-foreground">
//               Penalty Days: <span className={`font-semibold ${penaltyDays > 0 ? 'text-destructive' : 'text-success'}`}>
//                 {penaltyDays} days
//               </span>
//             </p>
//           </div>

//           <div className="space-y-2">
//             <Label htmlFor="billNumber">Bill Number</Label>
//             <Input
//               id="billNumber"
//               value={formData.billNumber}
//               onChange={e => updateField('billNumber', e.target.value)}
//               placeholder="Enter bill number"
//               className="input-field"
//             />
//           </div>

//           <div className="grid grid-cols-2 gap-4">
//             <div className="space-y-2">
//               <Label htmlFor="amount">Amount (₹)</Label>
//               <Input
//                 id="amount"
//                 type="number"
//                 value={formData.amount || ''}
//                 onChange={e => updateField('amount', Number(e.target.value))}
//                 placeholder="0"
//                 className="input-field"
//               />
//             </div>
//             <div className="space-y-2">
//               <Label htmlFor="penalty">Penalty (₹)</Label>
//               <Input
//                 id="penalty"
//                 type="number"
//                 value={(formData.penalty) || ''}
//                 onChange={e => updateField('penalty', Number(e.target.value))}
//                 placeholder="0"
//                 className="input-field"
//               />
//             </div>
//           </div>

//           {/* Conditionally show Collected By dropdown */}


//           <div className="space-y-2">
//             {user?.role === 'owner' ? (
//               // Owner can choose any user
//               <>
//                 <Label htmlFor="collected_by">Collected By</Label>
//                 <Select
//                   value={formData.collected_by || user?.email || ''}
//                   onValueChange={value => updateField('collected_by', value)}
//                 >
//                   <SelectTrigger className="input-field">
//                     <SelectValue placeholder="Select user" />
//                   </SelectTrigger>
//                   <SelectContent>
//                     {allUsers.map(userItem => (
//                       <SelectItem key={userItem.id} value={userItem.email}>
//                         {userItem.email}
//                       </SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </>
//             ) : (
//               // Non-owners see a disabled field with their email
//               <>
//                 <Label htmlFor="collected_by">Collected By</Label>
//                 <Input
//                   id="collected_by"
//                   value={formData.collected_by || user?.email || ''}
//                   readOnly
//                   className="input-field bg-gray-100 cursor-not-allowed"
//                   placeholder="Collector name"
//                 />
//                 <p className="text-xs text-muted-foreground mt-1">
//                   This field is automatically set to your email.
//                 </p>

//               </>
//             )}
//           </div>

//           <div className="grid grid-cols-2 gap-4">
//             <div className="space-y-2">
//               <Label>Payment Mode</Label>
//               <Select
//                 value={formData.payment_mode}
//                 onValueChange={value => updateField('payment_mode', value)}
//               >
//                 <SelectTrigger className="input-field">
//                   <SelectValue placeholder="Select mode" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {paymentModes.map(mode => (
//                     <SelectItem key={mode.value} value={mode.value}>
//                       {mode.label}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//             <div className="space-y-2">
//               <Label>Payment Mode 2 (Optional)</Label>
//               <Select
//                 value={formData.payment_mode_1 || ''}
//                 onValueChange={value => updateField('payment_mode_1', value || undefined)}
//               >
//                 <SelectTrigger className="input-field">
//                   <SelectValue placeholder="Select mode" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="none">None</SelectItem>
//                   {paymentModes.map(mode => (
//                     <SelectItem key={mode.value} value={mode.value}>
//                       {mode.label}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           </div>

//           {formData.payment_mode_1 && formData.payment_mode_1 !== 'none' && (
//             <div className="space-y-2">
//               <Label htmlFor="payment_mode_1_amount">Payment Mode 2 Amount (₹)</Label>
//               <Input
//                 id="payment_mode_1_amount"
//                 type="number"
//                 value={formData.payment_mode_1_amount || ''}
//                 onChange={e => updateField('payment_mode_1_amount', Number(e.target.value))}
//                 placeholder="0"
//                 className="input-field"
//               />
//             </div>
//           )}

//           <div className="space-y-2">
//             <Label htmlFor="hand_loan">Hand Loan Amount (₹)</Label>
//             <Input
//               id="hand_loan"
//               type="number"
//               value={formData.hand_loan ?? ''}
//               onChange={e => updateField('hand_loan', Number(e.target.value))}
//               placeholder="0"
//               className="input-field"
//             />
//           </div>

//           {(formData.hand_loan || formData.hand_loan === 0) && formData.hand_loan > 0 && (
//             <div className="space-y-2">
//               <Label htmlFor="hand_loan_remark">Hand Loan Remark</Label>
//               <Textarea
//                 id="hand_loan_remark"
//                 value={formData.hand_loan_remark || ''}
//                 onChange={e => updateField('hand_loan_remark', e.target.value)}
//                 placeholder="Enter remark"
//                 className="input-field min-h-[80px]"
//               />
//             </div>
//           )}

//           <div className="space-y-2">
//             <Label htmlFor="remarks">Remarks</Label>
//             <Textarea
//               id="remarks"
//               value={formData.remarks || ''}
//               onChange={e => updateField('remarks', e.target.value)}
//               placeholder="Enter any additional remarks"
//               className="input-field min-h-[80px]"
//             />
//           </div>

//           <DialogFooter className="gap-3 pt-4">
//             <Button type="button" variant="outline" onClick={onClose}>
//               Cancel
//             </Button>
//             <Button type="submit" className="btn-primary">
//               {isEditing ? 'Update' : 'Add'} Payment
//             </Button>
//           </DialogFooter>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// };

// export default PaymentDialog;



import { useState, useEffect, useMemo } from 'react';
import { PaymentFormData, User } from '../../types/customer';
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
import type { SeizingRecord } from './SeizingHistoryTable';
import {
  round2,
  computeAutoPaymentSplit,
  applyManualPrincipalChange,
  applyManualInterestChange,
  buildSubmitPaymentPayload,
  type PaymentDialogLoanContext,
  type OpenDueLedgerItem,
} from './paymentSplitModel';

interface PaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PaymentFormData) => void;
  initialData: PaymentFormData;
  isEditing: boolean;
  penaltyDays: number;
  customer?: { status?: string; loanStatus?: string;[key: string]: any };
  seizingRecords?: SeizingRecord[];
  currentUserName?: string;
  isOwner?: boolean;
  allUsers?: any[];
  loan?: PaymentDialogLoanContext | null;
  openDues?: OpenDueLedgerItem[];
}
export interface User_new {
  id: string;
  email: string;
  username?: string;
  name?: string;
  role: 'owner' | 'agent' | 'staff' | 'admin';
}

const paymentModes = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const PaymentDialog = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing,
  penaltyDays,
  customer,
  seizingRecords = [],
  currentUserName = '',
  isOwner = false,
  allUsers = [],
  loan = null,
  openDues = [],
}: PaymentDialogProps) => {
  const [formData, setFormData] = useState<PaymentFormData>(initialData);
  const [splitError, setSplitError] = useState<string | null>(null);

  const autoPreview = useMemo(
    () =>
      computeAutoPaymentSplit({
        amount: Number(formData.amount) || 0,
        loan,
        openDues,
        isEditing,
      }),
    [formData.amount, loan, openDues, isEditing]
  );

  const isMultiDue = autoPreview.isMultiDue;

  // Unified list of users including fallback for currently selected collector
  const usersList = useMemo(() => {
    const list: User_new[] = [];
    const seenNames = new Set<string>();

    allUsers.forEach((u: any) => {
      const name = (u.username || u.name || u.email || '').trim();
      if (name && !seenNames.has(name)) {
        seenNames.add(name);
        list.push({
          id: String(u.id || name),
          username: u.username || name,
          name: u.name,
          email: u.email || '',
          role: u.role || 'staff'
        });
      }
    });

    // Ensure currently selected or logged in collector is always a selectable option
    const currentCollector = (formData.collected_by || currentUserName).trim();
    if (currentCollector && !seenNames.has(currentCollector)) {
      list.unshift({
        id: 'current_user_collector',
        username: currentCollector,
        name: currentCollector,
        email: '',
        role: 'owner'
      });
    }

    return list;
  }, [allUsers, formData.collected_by, currentUserName]);

  // Initialize form data with current user name & Principal/Interest split
  useEffect(() => {
    if (isOpen) {
      setSplitError(null);
      const initialCollector = initialData.collected_by || currentUserName;
      const initAmt = Math.max(0, round2(initialData.amount || 0));
      const hasValidExplicitPI =
        isEditing &&
        initialData.principal_amount !== undefined &&
        initialData.interest_amount !== undefined &&
        round2((initialData.principal_amount || 0) + (initialData.interest_amount || 0)) === initAmt;

      const computed = computeAutoPaymentSplit({
        amount: initAmt,
        loan,
        openDues,
        isEditing,
      });

      setFormData({
        ...initialData,
        amount: initAmt,
        principal_amount: hasValidExplicitPI
          ? round2(initialData.principal_amount)
          : computed.principal_amount,
        interest_amount: hasValidExplicitPI
          ? round2(initialData.interest_amount)
          : computed.interest_amount,
        collected_by: initialCollector,
      });
    }
  }, [initialData, isOpen, currentUserName, isEditing, loan, openDues]);

  // Keep collected_by updated if currentUserName loads after initial open
  useEffect(() => {
    if (isOpen && !formData.collected_by && currentUserName) {
      setFormData(prev => ({
        ...prev,
        collected_by: currentUserName
      }));
    }
  }, [isOpen, currentUserName, formData.collected_by]);

  const handleAmountChange = (rawVal: string) => {
    const nextAmt = rawVal === '' ? 0 : Math.max(0, round2(rawVal));
    const nextSplit = computeAutoPaymentSplit({
      amount: nextAmt,
      loan,
      openDues,
      isEditing,
    });
    setSplitError(null);
    setFormData(prev => ({
      ...prev,
      amount: nextAmt,
      principal_amount: nextSplit.principal_amount,
      interest_amount: nextSplit.interest_amount,
    }));
  };

  const handlePrincipalChange = (rawVal: string) => {
    if (isMultiDue) return;
    const val = rawVal === '' ? 0 : Math.max(0, round2(rawVal));
    const next = applyManualPrincipalChange(
      Number(formData.amount) || 0,
      val,
      Number(formData.interest_amount) || 0
    );
    setSplitError(null);

    if (!isEditing && autoPreview.singleDueCap > 0 && next.amount > autoPreview.singleDueCap) {
      const autoMulti = computeAutoPaymentSplit({
        amount: next.amount,
        loan,
        openDues,
        isEditing: false,
      });
      setFormData(prev => ({
        ...prev,
        amount: next.amount,
        principal_amount: autoMulti.principal_amount,
        interest_amount: autoMulti.interest_amount,
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      amount: next.amount,
      principal_amount: next.principal_amount,
      interest_amount: next.interest_amount,
    }));
  };

  const handleInterestChange = (rawVal: string) => {
    if (isMultiDue) return;
    const val = rawVal === '' ? 0 : Math.max(0, round2(rawVal));
    const next = applyManualInterestChange(
      Number(formData.amount) || 0,
      val,
      Number(formData.principal_amount) || 0
    );
    setSplitError(null);

    if (!isEditing && autoPreview.singleDueCap > 0 && next.amount > autoPreview.singleDueCap) {
      const autoMulti = computeAutoPaymentSplit({
        amount: next.amount,
        loan,
        openDues,
        isEditing: false,
      });
      setFormData(prev => ({
        ...prev,
        amount: next.amount,
        principal_amount: autoMulti.principal_amount,
        interest_amount: autoMulti.interest_amount,
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      amount: next.amount,
      principal_amount: next.principal_amount,
      interest_amount: next.interest_amount,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const candidate: PaymentFormData = {
      ...formData,
      collected_by: formData.collected_by || currentUserName,
    };
    const result = buildSubmitPaymentPayload(candidate, isMultiDue);
    if (!result.ok || !result.payload) {
      setSplitError(result.error || 'Principal + Interest must equal Amount.');
      return;
    }
    setSplitError(null);
    onSubmit(result.payload);
  };

  const updateField = (field: keyof PaymentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isSeized = customer?.status === 'seized' || customer?.loanStatus === 'seized' || true;
  console.log('is Seized:', isSeized)
  console.log("seizingRecords", seizingRecords)
  const pendingSeizingRecords = seizingRecords.filter(r => r.status === 'Pending');
  const paidSeizingRecords = seizingRecords.filter(r => r.status === 'Paid');
  const totalSeizingCharge = seizingRecords.reduce((sum, r) => sum + (Number(r.seizing_charge) || 0), 0);
  const pendingSeizingCharge = pendingSeizingRecords.reduce((sum, r) => sum + (Number(r.seizing_charge) || 0), 0);
  const paidSeizingCharge = paidSeizingRecords.reduce((sum, r) => sum + (Number(r.seizing_charge) || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose} key={isEditing ? 'edit' : 'add'}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEditing ? 'Edit Payment' : 'Add New Payment'}
          </DialogTitle>
        </DialogHeader>



        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <DatePicker
                id="dueDate"
                value={formData.dueDate}
                onChange={e => updateField('dueDate', e.target.value)}
                readOnly={!isEditing}
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

          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">
              Penalty Days: <span className={`font-semibold ${penaltyDays > 0 ? 'text-destructive' : 'text-success'}`}>
                {penaltyDays} days
              </span>
            </p>
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
                min="0"
                step="0.01"
                value={formData.amount || ''}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="0"
                className="input-field"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="penalty">Penalty (₹)</Label>
              <Input
                id="penalty"
                type="number"
                min="0"
                step="0.01"
                value={(formData.penalty) || ''}
                onChange={e => updateField('penalty', Number(e.target.value))}
                placeholder="0"
                className="input-field"
              />
            </div>
          </div>

          {/* Principal & Interest Split (Editable for Single-Due, Auto-Locked for Multi-Due) */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="principal_amount">Principal (₹)</Label>
                <Input
                  id="principal_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly={isMultiDue}
                  value={
                    (formData.amount || 0) > 0 || (formData.principal_amount || 0) > 0
                      ? (formData.principal_amount ?? 0)
                      : ''
                  }
                  onChange={e => handlePrincipalChange(e.target.value)}
                  placeholder="0"
                  className={`input-field ${isMultiDue ? 'bg-muted/60 cursor-not-allowed' : ''}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interest_amount">Interest (₹)</Label>
                <Input
                  id="interest_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly={isMultiDue}
                  value={
                    (formData.amount || 0) > 0 || (formData.interest_amount || 0) > 0
                      ? (formData.interest_amount ?? 0)
                      : ''
                  }
                  onChange={e => handleInterestChange(e.target.value)}
                  placeholder="0"
                  className={`input-field ${isMultiDue ? 'bg-muted/60 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            {isMultiDue && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                Multi-due payment detected — Principal &amp; Interest will auto-split per due (Interest-First).
              </div>
            )}

            {splitError && (
              <p className="text-xs font-medium text-destructive">{splitError}</p>
            )}
          </div>

          {/* Conditionally show Collected By dropdown */}


          <div className="space-y-2">
            {isOwner ? (
              // Owner / Admin can choose any user
              <>
                <Label htmlFor="collected_by">Collected By</Label>
                <Select
                  value={formData.collected_by || currentUserName}
                  onValueChange={value => updateField('collected_by', value)}
                >
                  <SelectTrigger className="input-field">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersList.map(userItem => {
                      const displayName = userItem.username || userItem.name || userItem.email;
                      return (
                        <SelectItem key={userItem.id} value={displayName}>
                          {displayName}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </>
            ) : (
              // Non-owners see a disabled field with their name
              <>
                <Label htmlFor="collected_by">Collected By</Label>
                <Input
                  id="collected_by"
                  value={formData.collected_by || currentUserName}
                  readOnly
                  className="input-field bg-gray-100 cursor-not-allowed"
                  placeholder="Collector name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This field is automatically set to your username.
                </p>

              </>
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
                value={formData.payment_mode_1 || ''}
                onValueChange={value => updateField('payment_mode_1', value || undefined)}
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
                value={formData.payment_mode_1_amount || ''}
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
              value={formData.hand_loan ?? ''}
              onChange={e => updateField('hand_loan', Number(e.target.value))}
              placeholder="0"
              className="input-field"
            />
            {isSeized && totalSeizingCharge > 0 && (
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <span className="font-medium">Seizing Charge</span>
                <span className="font-bold">₹{totalSeizingCharge.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
          {/* ── Seized Customer Banner ── */}
          {isSeized && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Vehicle Currently Seized
              </div>

              {/* Paid / Pending cards — mirrors the Unseize dialog style */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-green-400 bg-green-50 dark:bg-green-950/40 dark:border-green-700 p-3 text-green-700 dark:text-green-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="text-xs font-medium">Paid</span>
                  <span className="text-sm font-bold">
                    ₹{paidSeizingCharge.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">{paidSeizingRecords.length} record{paidSeizingRecords.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600 p-3 text-amber-700 dark:text-amber-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span className="text-xs font-medium">Pending</span>
                  <span className="text-sm font-bold">
                    ₹{pendingSeizingCharge.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">{pendingSeizingRecords.length} record{pendingSeizingRecords.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {totalSeizingCharge > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  Total seizing charge: <span className="font-semibold text-amber-700 dark:text-amber-400">₹{totalSeizingCharge.toLocaleString('en-IN')}</span>
                </p>
              )}
            </div>
          )}

          {(formData.hand_loan || formData.hand_loan === 0) && formData.hand_loan > 0 && (
            <div className="space-y-2">
              <Label htmlFor="hand_loan_remark">Hand Loan Remark</Label>
              <Textarea
                id="hand_loan_remark"
                value={formData.hand_loan_remark || ''}
                onChange={e => updateField('hand_loan_remark', e.target.value)}
                placeholder="Enter remark"
                className="input-field min-h-[80px]"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={formData.remarks || ''}
              onChange={e => updateField('remarks', e.target.value)}
              placeholder="Enter any additional remarks"
              className="input-field min-h-[80px]"
            />
          </div>

          <DialogFooter className="gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="btn-primary">
              {isEditing ? 'Update' : 'Add'} Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog;