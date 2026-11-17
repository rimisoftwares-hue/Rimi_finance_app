import { useNavigate, useParams } from 'react-router-dom';
import { Plus, ArrowLeft, Edit, History } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Customer, GuardianDetails, LoanDetails, Payment,
  VehicleDetails, PaymentFormData, CustomerFormData,
  HistoryEntry,
} from '../types/customer';
import { Button } from '../components/ui/button';
import { toast } from '../hooks/use-toast';
import CustomerHeader from '../components/customer/CustomerHeader';
import VehicleCard from '../components/customer/VehicleCard';
import LoanSummary from '../components/customer/LoanSummary';
import PaymentTable from '../components/customer/PaymentTable';
import SeizingHistoryTable, { SeizingRecord } from '../components/customer/SeizingHistoryTable';
import PaymentDialog from '../components/customer/PaymentDialog';
import HistoryInputSection from '../components/customer/HistoryInputSection';
import HistoryListDialog from '../components/customer/HistoryListDialog';
import AccountActionsDropdown from '../components/customer/AccountActionsDropdown';
import PrintLettersDropdown from '../components/customer/PrintLettersDropdown';
import axios from 'axios';
import apiClient from '../api/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';

export type LoanStatus = 'active' | 'seized' | 'close';

const CustomerDetails = () => {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [customerData, setCustomerData] = useState<CustomerFormData | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [customerLoanStatus, setCustomerLoanStatus] = useState<string>('active');
  const [seizingPendingTotal, setSeizingPendingTotal] = useState<number>(0);
  const [seizingRecords, setSeizingRecords] = useState<SeizingRecord[]>([]);
  const [activeTable, setActiveTable] = useState<'payments' | 'seizing'>('payments');
  const { user } = useAuth();
  const { owner } = useOwnerAuth();

  const currentUserName = useMemo(() => {
    if (user?.username) return user.username;
    if ((user as any)?.name) return (user as any).name;
    if (user?.email) return user.email;
    if (owner?.username) return owner.username;
    if ((owner as any)?.name) return (owner as any).name;
    try {
      const stored = sessionStorage.getItem('userData') || localStorage.getItem('userData');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.username) return parsed.username;
        if (parsed.name) return parsed.name;
        if (parsed.email) return parsed.email;
      }
      const storedOwner = localStorage.getItem('owner');
      if (storedOwner) {
        const parsed = JSON.parse(storedOwner);
        if (parsed.username) return parsed.username;
      }
    } catch (e) { }
    return '';
  }, [user, owner]);

  const isOwner = useMemo(() => {
    if (user?.role === 'owner' || user?.role === 'admin') return true;
    if (owner) return true;
    try {
      const storedUserData = sessionStorage.getItem('userData') || localStorage.getItem('userData');
      if (storedUserData) {
        const parsed = JSON.parse(storedUserData);
        if (parsed.role === 'owner' || parsed.role === 'admin') return true;
      }
      if (localStorage.getItem('ownerToken')) return true;
    } catch (e) { }
    return false;
  }, [user, owner]);

  const [allUsers, setAllUsers] = useState<any[]>([]);

  const customer = customerData?.customer
    ? {
      ...customerData.customer,
      loanStatus: (customerLoanStatus || customerData.customer.loanStatus || (customerData.customer as any).loan_status || 'active') as LoanStatus,
    }
    : undefined;
  const guardian = customerData?.guardian;
  // Safely map and normalize loan data from backend (handling snake_case, string numbers, and undefined)
  const loan = useMemo(() => {
    const rawLoan = customerData?.loan;
    if (!rawLoan) return undefined;

    const hpAmount = Number(rawLoan.hp_amount ?? rawLoan.hpAmount ?? 0) || 0;
    const hpDate = String(rawLoan.hp_date ?? rawLoan.hpDate ?? '');
    const dueDate = String(rawLoan.due_date ?? rawLoan.dueDate ?? '');
    const dueMonth = String(rawLoan.due_month ?? rawLoan.dueMonth ?? '0');
    const interestRate = String(rawLoan.interest_rate ?? rawLoan.interestRate ?? '0');
    const interestPart = Number(rawLoan.interest_part ?? (rawLoan as any).interestPart ?? 0) || 0;
    const principlePart = Number(rawLoan.principle_part ?? (rawLoan as any).principlePart ?? 0) || 0;
    const dueAmount = Number(rawLoan.due_amount ?? rawLoan.dueAmount ?? 0) || 0;
    const documentationCharge = Number(rawLoan.documentation_charge ?? (rawLoan as any).documentationCharge ?? 0) || 0;
    const netPayable = Number(rawLoan.net_payable ?? (rawLoan as any).netPayable ?? 0) || (dueAmount * (parseInt(dueMonth, 10) || 0));
    const penaltyAmount = Number(rawLoan.penalty_amount ?? rawLoan.penaltyAmount ?? 0) || 0;
    const penaltyDays = Number(rawLoan.penalty_days ?? (rawLoan as any).penaltyDays ?? 0) || 0;

    return {
      ...rawLoan,
      // CamelCase mappings for UI components
      hpAmount,
      hpDate,
      due_date: dueDate,
      dueDate,
      dueMonth,
      interestRate,
      interest_part: interestPart,
      principle_part: principlePart,
      dueAmount,
      documentation_charge: documentationCharge,
      net_payable: netPayable,
      penaltyAmount,
      penalty_days: penaltyDays,

      // Snake_Case mappings to ensure full backward & forward compatibility
      hp_amount: hpAmount,
      hp_date: hpDate,
      due_month: dueMonth,
      interest_rate: interestRate,
      due_amount: dueAmount,
      penalty_amount: penaltyAmount,
    } as LoanDetails;
  }, [customerData?.loan]);

  const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

  // Fetch all users for collector selection in dialogs
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/auth/allUsers');
        if (response.data && response.data.success && Array.isArray(response.data.users)) {
          setAllUsers(response.data.users);
        }
      } catch (error) {
        console.error('Error fetching users in CustomerDetails:', error);
      }
    };

    fetchUsers();
  }, []);

  // ─── Default payment form ────────────────────────────────────────────────
  const defaultPaymentForm: PaymentFormData = useMemo(() => ({
    dueDate: '',
    paymentDate: new Date().toISOString().split('T')[0],
    billNumber: '',
    amount: 0,
    dueAmount: Number(loan?.due_amount ?? loan?.dueAmount ?? 0),
    last_payment_id: null,
    last_due_paid: 0,
    penalty: 0,
    collected_by: currentUserName,
    payment_mode: 'cash',
    payment_mode_1: undefined,
    payment_mode_1_amount: 0,
    hand_loan: 0,
    hand_loan_remark: '',
    remarks: '',
  }), [loan?.dueAmount, loan?.due_amount, currentUserName]);

  const [paymentFormData, setPaymentFormData] = useState<PaymentFormData>(defaultPaymentForm);

  // ─── Fetch customer ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setLoading(true);
        const customerResponse = await apiClient.get(`/customers/${customerId}`);
        if (!customerResponse.data?.customer) throw new Error('Customer not found');

        const rawLoan = customerResponse.data?.loan;
        const normalizedLoan = rawLoan ? {
          ...rawLoan,
          hpAmount: Number(rawLoan.hp_amount ?? rawLoan.hpAmount ?? 0) || 0,
          hp_amount: Number(rawLoan.hp_amount ?? rawLoan.hpAmount ?? 0) || 0,
          hpDate: String(rawLoan.hp_date ?? rawLoan.hpDate ?? ''),
          hp_date: String(rawLoan.hp_date ?? rawLoan.hpDate ?? ''),
          due_date: String(rawLoan.due_date ?? rawLoan.dueDate ?? ''),
          dueDate: String(rawLoan.due_date ?? rawLoan.dueDate ?? ''),
          dueMonth: String(rawLoan.due_month ?? rawLoan.dueMonth ?? '0'),
          due_month: String(rawLoan.due_month ?? rawLoan.dueMonth ?? '0'),
          interestRate: String(rawLoan.interest_rate ?? rawLoan.interestRate ?? '0'),
          interest_rate: String(rawLoan.interest_rate ?? rawLoan.interestRate ?? '0'),
          interest_part: Number(rawLoan.interest_part ?? rawLoan.interestPart ?? 0) || 0,
          principle_part: Number(rawLoan.principle_part ?? rawLoan.principlePart ?? 0) || 0,
          dueAmount: Number(rawLoan.due_amount ?? rawLoan.dueAmount ?? 0) || 0,
          due_amount: Number(rawLoan.due_amount ?? rawLoan.dueAmount ?? 0) || 0,
          documentation_charge: Number(rawLoan.documentation_charge ?? rawLoan.documentationCharge ?? 0) || 0,
          net_payable: Number(rawLoan.net_payable ?? rawLoan.netPayable ?? 0) || 0,
          penaltyAmount: Number(rawLoan.penalty_amount ?? rawLoan.penaltyAmount ?? 0) || 0,
          penalty_amount: Number(rawLoan.penalty_amount ?? rawLoan.penaltyAmount ?? 0) || 0,
          penalty_days: Number(rawLoan.penalty_days ?? rawLoan.penaltyDays ?? 0) || 0,
        } : null;

        const resolvedLoanStatus = (customerResponse.data.customer?.loanStatus || customerResponse.data.customer?.loan_status || 'active') as LoanStatus;

        const data = {
          ...customerResponse.data,
          loan: normalizedLoan,
          customer: {
            ...customerResponse.data.customer,
            loanStatus: resolvedLoanStatus,
            ccontacts: customerResponse.data.customer.ccontacts || [],
          },
          guardian: customerResponse.data.guardian ? {
            ...customerResponse.data.guardian,
            gcontacts: customerResponse.data.guardian?.gcontacts || [],
          } : null,
        };
        setCustomerData(data);
        setCustomerLoanStatus(resolvedLoanStatus);
        if (customerResponse.data.vehicle) setVehicleDetails(customerResponse.data.vehicle);
        await fetchPayments();
      } catch (err) {
        console.error('Error fetching customer details:', err);
        const errorMessage =
          axios.isAxiosError(err)
            ? err.response?.data?.error || err.response?.data?.message || err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load customer data';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
    fetchSeizingTotal();
  }, [customerId]);

  // ─── Fetch payments ──────────────────────────────────────────────────────
  const fetchPayments = async () => {
    try {
      const response = await apiClient.get(`/customers/${customerId}/payments`);
      const paymentsData: any[] = Array.isArray(response.data)
        ? response.data
        : response.data.payments || [];

      const formatted: Payment[] = paymentsData.map(p => {
        const rawSubs: any[] = p.sub_dues || p.sub_due || [];
        const formattedSubs = rawSubs.map((sd: any) => ({
          ...sd,
          paid_amount: Number(sd.paid_amount ?? sd.amount) || 0,
          principal_amount: Number(sd.principal_amount) || 0,
          interest_amount: Number(sd.interest_amount) || 0,
          payment_mode_amount: Number(sd.payment_mode_amount) || 0,
          payment_mode_1_amount: Number(sd.payment_mode_1_amount) || 0,
        }));

        return {
          ...p,
          amount: Number(p.amount) || 0,
          principal_amount: Number(p.principal_amount) || 0,
          interest_amount: Number(p.interest_amount) || 0,
          penalty: Number(p.penalty) || 0,
          payment_mode_amount: Number(p.payment_mode_amount) || 0,
          payment_mode_1_amount: Number(p.payment_mode_1_amount) || 0,
          hand_loan: Number(p.hand_loan) || 0,
          collected_by: p.collected_by || '',
          payment_mode: p.payment_mode || 'cash',
          payment_mode_1: p.payment_mode_1,
          hand_loan_remark: p.hand_loan_remark || '',
          remarks: p.remarks || '',
          status: p.status || 'pending',
          payment_status: p.payment_status || 'active',
          sub_dues: formattedSubs,
        };
      });

      setPayments(formatted);
    } catch (err) {
      console.error('Error fetching payments:', err);
      setPayments([]);
    }
  };

  const fetchSeizingTotal = async () => {
    try {
      const response = await apiClient.get(`/customers/${customerId}/seizing`);
      if (response.data.success) {
        setSeizingPendingTotal(response.data.pendingTotal || 0);
        setSeizingRecords(response.data.records || []);
      }
    } catch (err) {
      console.error('Error fetching seizing info:', err);
      setSeizingPendingTotal(0);
      setSeizingRecords([]);
    }
  };

  const isPaymentCancelled = (p: any) =>
    String(p?.payment_status || 'active').toLowerCase() === 'cancelled' ||
    String(p?.status || 'paid').toLowerCase() === 'cancelled';

  // ─── Totals (excludes cancelled receipts & includes active sub_due top-ups) ─
  const totalPaidAmount = useMemo(
    () =>
      payments.reduce((sum, p: any) => {
        if (isPaymentCancelled(p)) return sum;
        const subDueSum = Array.isArray(p.sub_dues)
          ? p.sub_dues.reduce((s: number, sd: any) => {
              if (String(sd?.status || 'active').toLowerCase() === 'cancelled') return s;
              return s + (Number(sd?.paid_amount ?? sd?.amount) || 0);
            }, 0)
          : 0;
        return sum + (Number(p.amount) || 0) + subDueSum;
      }, 0),
    [payments]
  );
  const totalPenalty = useMemo(
    () =>
      payments.reduce((sum, p: any) => {
        if (isPaymentCancelled(p)) return sum;
        return sum + (Number(p.penalty) || 0);
      }, 0),
    [payments]
  );

  const calculatePenaltyDays = (index: number) => {
    const payment: any = payments[index];
    if (!payment || isPaymentCancelled(payment) || !payment?.dueDate || !payment?.paymentDate) return 0;
    const due = new Date(payment.dueDate);
    const paid = new Date(payment.paymentDate);
    if (paid > due && payment.amount > 0) {
      return Math.ceil((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    }
    return 0;
  };

  const totalPenaltyDays = useMemo(
    () => payments.reduce((total, _, i) => total + calculatePenaltyDays(i), 0),
    [payments]
  );

  // ─── Next due date (+1 clamped calendar month from anchor / last valid due) ─
  const calculateNextDueDate = () => {
    const anchorDate = loan?.due_date || loan?.dueDate || loan?.hp_date || loan?.hpDate;
    if (!anchorDate) return new Date().toISOString().split('T')[0];
    const lastPayment = payments
      .filter((p: any) => !isPaymentCancelled(p) && p.dueDate && p.dueDate !== '-')
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];
    const baseDate = String(lastPayment?.dueDate || anchorDate).split('T')[0];
    const parts = baseDate.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return new Date().toISOString().split('T')[0];
    }
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const clampedDay = Math.min(day, maxDay);
    return `${year}-${month.toString().padStart(2, '0')}-${clampedDay.toString().padStart(2, '0')}`;
  };

  const calculateFormPenaltyDays = (dueDate: string, paymentDate: string) => {
    if (!dueDate || !paymentDate) return 0;
    const due = new Date(dueDate);
    const payment = new Date(paymentDate);
    return payment > due
      ? Math.ceil((payment.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
  };

  const PenaltyDays = calculateFormPenaltyDays(
    paymentFormData.dueDate,
    paymentFormData.paymentDate
  );

  // ─── History ─────────────────────────────────────────────────────────────
  const fetchHistoryEntries = useCallback(async () => {
    try {
      const response = await apiClient.get(`/customers/${customerId}/history`);
      if (response.data.success) setHistoryEntries(response.data.history || []);
    } catch (err) {
      console.error('Error fetching history entries:', err);
    }
  }, [customerId]);

  useEffect(() => { fetchHistoryEntries(); }, [customerId]);

  // ─── Resolve last partial payment info ───────────────────────────────────
  /**
   * Find the most recent payment that is still 'pending' or 'partial'.
   * Return the payment_id and how much has already been paid via sub_due
   * so the dialog can show the outstanding balance banner.
   */
  // const getLastPartialInfo = (): { last_payment_id: number | null; last_due_paid: number } => {
  //   const lastPartial = [...payments]
  //     .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
  //     .find(p => p.status === 'pending' || p.status === 'partial');

  //   if (!lastPartial) return { last_payment_id: null, last_due_paid: 0 };

  //   // Sum all active sub_due paid_amounts for that payment
  //   const alreadyPaid = (lastPartial.sub_dues || [])
  //     .filter((sd: any) => sd.status === 'active')
  //     .reduce((sum: number, sd: any) => sum + (Number(sd.paid_amount) || 0), 0);

  //   return { last_payment_id: lastPartial.id, last_due_paid: alreadyPaid };
  // };

  const getLastPartialInfo = (): { last_payment_id: string | number | null; last_due_paid: number } => {
    // Sort payments by dueDate descending and find the first one that matches criteria
    const dueAmount = Number(loan?.due_amount ?? loan?.dueAmount ?? 0);
    const lastPayment = [...Object.values(payments)]
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
      .find(p => p.status !== 'paid' && p.payment_status !== 'cancelled');

    if (!lastPayment) return { last_payment_id: null, last_due_paid: 0 };

    // Sum payment.amount + all active sub_due paid_amounts
    const totalAmount = (Number(lastPayment.amount) || 0) +
      (lastPayment.sub_dues || [])
        .filter((sd: any) => sd.status === 'active')
        .reduce((sum: number, sd: any) => sum + (Number(sd.paid_amount) || 0), 0);

    if (totalAmount >= dueAmount) {
      return { last_payment_id: null, last_due_paid: 0 };
    }
    return { last_payment_id: lastPayment.id, last_due_paid: totalAmount };

  };

  const openDues = useMemo(() => {
    const dueAmt = Number(loan?.due_amount ?? loan?.dueAmount ?? 0);
    if (dueAmt <= 0) return [];
    return payments
      .filter((p) => !isPaymentCancelled(p) && p.status !== 'paid')
      .map((p) => {
        const activeSubs = (p.sub_dues || []).filter(
          (sd) => String(sd.status || 'active').toLowerCase() !== 'cancelled'
        );
        const paidAmount =
          (Number(p.amount) || 0) +
          activeSubs.reduce((s, sd) => s + (Number(sd.paid_amount) || 0), 0);
        const paidInterest =
          (Number(p.interest_amount) || 0) +
          activeSubs.reduce((s, sd) => s + (Number(sd.interest_amount) || 0), 0);
        return { id: p.id, dueDate: p.dueDate, paidAmount, paidInterest };
      })
      .filter((od) => od.paidAmount < dueAmt)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [payments, loan]);

  // ─── Open payment dialog ──────────────────────────────────────────────────
  const handleOpenPaymentDialog = (payment?: Payment) => {
    if (payment) {
      // Edit mode — pre-fill with existing payment data including Principal & Interest
      setEditingPayment(payment);
      setPaymentFormData({
        dueDate: payment.dueDate,
        paymentDate: payment.paymentDate || '',
        billNumber: payment.billNumber,
        amount: payment.amount,
        principal_amount: payment.principal_amount,
        interest_amount: payment.interest_amount,
        penalty: payment.penalty,
        collected_by: payment.collected_by || currentUserName,
        payment_mode: payment.payment_mode || 'cash',
        payment_mode_1: payment.payment_mode_1,
        payment_mode_1_amount: payment.payment_mode_1_amount || 0,
        hand_loan: payment.hand_loan || 0,
        hand_loan_remark: payment.hand_loan_remark || '',
        remarks: payment.remarks || '',
      });
    } else {
      // Add mode — inject next due date & default EMI amount
      setEditingPayment(null);
      setPaymentFormData({
        ...defaultPaymentForm,
        dueDate: calculateNextDueDate(),
        amount: Number(loan?.due_amount ?? loan?.dueAmount ?? 0),
        collected_by: currentUserName,
      });
    }
    setPaymentDialogOpen(true);
  };

  // ─── Submit payment ───────────────────────────────────────────────────────
  const handlePaymentSubmit = async (data: PaymentFormData) => {
    try {
      const { last_payment_id, last_due_paid } = getLastPartialInfo();
      if (editingPayment) {
        await apiClient.put(`/payments/${editingPayment.id}`, {
          ...data,
          amount: Number(data.amount),
          principal_amount:
            data.principal_amount !== undefined ? Number(data.principal_amount) : undefined,
          interest_amount:
            data.interest_amount !== undefined ? Number(data.interest_amount) : undefined,
          penalty: Number(data.penalty),
          payment_mode_1_amount: Number(data.payment_mode_1_amount),
          hand_loan: Number(data.hand_loan),
        });
        toast({ title: 'Payment updated successfully' });
      } else {
        await apiClient.post(`/customers/${customerId}/payments`, {
          ...data,
          hplno: customer?.hplno,
          amount: Number(data.amount),
          principal_amount:
            data.principal_amount !== undefined ? Number(data.principal_amount) : undefined,
          interest_amount:
            data.interest_amount !== undefined ? Number(data.interest_amount) : undefined,
          dueAmount: Number(loan?.due_amount ?? loan?.dueAmount ?? 0),
          last_payment_id: last_payment_id,
          last_due_paid: Number(last_due_paid),
          penalty: Number(data.penalty),
          payment_mode_1_amount: Number(data.payment_mode_1_amount),
          hand_loan: Number(data.hand_loan),
        });
        toast({ title: 'Payment added successfully' });
      }

      await fetchPayments();
      setPaymentDialogOpen(false);
      setEditingPayment(null);
    } catch (err) {
      toast({
        title: 'Error saving payment',
        description: axios.isAxiosError(err)
          ? err.response?.data?.message || err.response?.data?.error || err.message
          : 'Failed to save payment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // ─── Delete payment ───────────────────────────────────────────────────────
  const handleDeletePayment = async (paymentId: number | string) => {
    if (!confirm('Are you sure you want to delete this payment? This action cannot be undone.')) return;
    try {
      const response = await apiClient.delete(`/payments/${paymentId}`);
      if (response.data.success) {
        setPayments(payments.filter(p => String(p.id) !== String(paymentId)));
        toast({ title: 'Payment deleted successfully' });
        await fetchPayments();
      } else {
        throw new Error(response.data.error || 'Failed to delete payment');
      }
    } catch (err) {
      toast({
        title: 'Error deleting payment',
        description: axios.isAxiosError(err)
          ? err.response?.data?.error || err.response?.data?.message || err.message
          : 'Failed to delete payment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // ─── Render guards ────────────────────────────────────────────────────────
  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading customer details...</div>;
  if (error) return <div className="py-12 text-center text-destructive">{error}</div>;
  if (!customerData || !customer) return <div className="py-12 text-center text-muted-foreground">Customer not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="w-full space-y-6">

        <CustomerHeader
          customer={customer}
          guardian={guardian || {} as GuardianDetails}
          loan={loan || {} as LoanDetails}
          baseUrl={BASE_URL}
        />

        {vehicleDetails && <VehicleCard vehicle={vehicleDetails} />}

        {loan && (
          <LoanSummary
            loan={loan}
            payments={payments}
            totalPaidAmount={totalPaidAmount}
            totalPenalty={totalPenalty}
            totalPenaltyDays={totalPenaltyDays}
            seizingPendingTotal={seizingPendingTotal}
          />
        )}

        {/* Call & RC History */}
        <div className="space-y-4 animate-slide-up" style={{ animationDelay: '0.25s' }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-display font-semibold text-foreground">
              Call & RC Book History
            </h2>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(true)} className="gap-2">
              <History className="w-4 h-4" />
              View History ({historyEntries.length})
            </Button>
          </div>
          <HistoryInputSection
            customerId={customerId!}
            hplNo={customer.hplno}
            onHistoryAdded={fetchHistoryEntries}
          />
        </div>

        {/* Payment / Seized History */}
        <div className="space-y-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-display font-semibold text-foreground">
                {activeTable === 'payments' ? 'EMI Payment History' : 'Seized History'}
              </h2>
              <div className="inline-flex rounded-lg border border-border bg-muted p-1 text-sm gap-1">
                <button
                  onClick={() => setActiveTable('payments')}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${activeTable === 'payments'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  EMI
                </button>
                <button
                  onClick={() => { setActiveTable('seizing'); fetchSeizingTotal(); }}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${activeTable === 'seizing'
                    ? 'bg-amber-500 shadow-sm text-white'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Seized {seizingRecords.length > 0 && `(${seizingRecords.length})`}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <PrintLettersDropdown
                customerName={customer.cname}
                hplNo={customer.hplno}
                customerData={{ customer, guardian, loan, vehicle: vehicleDetails, payments }}
                baseUrl={BASE_URL}
              />
              <AccountActionsDropdown
                customerName={customer.cname}
                hplNo={customer.hplno}
                customerId={customerId!}
                onActionCompleted={() => { fetchPayments(); fetchSeizingTotal(); }}
                customerData={{ customer, guardian, loan, vehicle: vehicleDetails, payments }}
                totalPaidAmount={totalPaidAmount}
                totalPenalty={totalPenalty}
                PenaltyDays={totalPenaltyDays}
                loanStatus={customerLoanStatus}
                onStatusChange={setCustomerLoanStatus}
              />
              {isOwner && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const dealType = vehicleDetails?.deal_type || 'consulting';
                    navigate(
                      dealType === 'finance'
                        ? `/customers/VehicleLoanedit/${customerId}`
                        : `/customers/Cunsultingedit/${customerId}`
                    );
                  }}
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Customer
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
              {activeTable === 'payments' && (
                <Button onClick={() => handleOpenPaymentDialog()} className="btn-accent gap-2">
                  <Plus className="w-4 h-4" />
                  Add Payment
                </Button>
              )}
            </div>
          </div>

          {activeTable === 'payments' ? (
            <PaymentTable
              payments={payments}
              onEdit={handleOpenPaymentDialog}
              onDelete={handleDeletePayment}
              dueAmount={Number(loan?.due_amount ?? loan?.dueAmount ?? 0)}
              calculatePenaltyDays={calculatePenaltyDays}
            />
          ) : (
            <SeizingHistoryTable
              records={seizingRecords}
              customerId={customerId!}
              onRefresh={fetchSeizingTotal}
            />
          )}
        </div>

        {/* Payment Dialog */}
        <PaymentDialog
          isOpen={paymentDialogOpen}
          onClose={() => { setPaymentDialogOpen(false); setEditingPayment(null); }}
          onSubmit={handlePaymentSubmit}
          initialData={paymentFormData}
          isEditing={!!editingPayment}
          penaltyDays={PenaltyDays}
          customer={customer}
          seizingRecords={seizingRecords}
          currentUserName={currentUserName}
          isOwner={isOwner}
          allUsers={allUsers}
          loan={loan}
          openDues={openDues}
        />

        {/* History Dialog */}
        <HistoryListDialog
          isOpen={historyDialogOpen}
          onClose={() => { setHistoryDialogOpen(false); fetchHistoryEntries(); }}
          customerId={customerId!}
        />
      </div>
    </div>
  );
};

export default CustomerDetails;