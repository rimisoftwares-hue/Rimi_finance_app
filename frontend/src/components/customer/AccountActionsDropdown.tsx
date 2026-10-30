
import { useState, useEffect } from 'react';
import {
  MoreHorizontal,
  CheckCircle2,
  RefreshCw,
  XCircle,
  DollarSign,
  Key,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '../ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import SettlementDialog from './SettlementDialog';
import ReloanDialog from './ReloanDialog';
import { toast } from '../../hooks/use-toast';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { useAuth } from '../../contexts/AuthContext';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

interface AccountActionsDropdownProps {
  customerName: string;
  hplNo: string | number;
  customerId: string;
  onActionCompleted?: () => void;
  customerData?: any;
  PenaltyDays: number;
  totalPaidAmount: number;
  totalPenalty: number;
  loanStatus?: string;
  onStatusChange?: (status: string) => void;
}

type ActionType = 'delete' | 'settlement' | 'reloan' | 'selling-vehicle' | null;

interface SettlementData {
  payableBalance: number;
  interest: number;
  penalty: number;
  totalAmount: number;
  remarks: string;
}

interface ReloanData {
  oldHplNo: string;
  newHplNo: string;
  reloanAmount: number;
  remarks: string;
}

interface ReloanPaymentData {
  dueDate: string;
  paymentDate: string;
  billNumber: string;
  amount: number;
  penalty: number;
  collected_by: string;
  payment_mode: string;
  payment_mode_1?: string;
  payment_mode_1_amount?: number;
  hand_loan?: number;
  hand_loan_remark?: string;
  remarks: string;
}

interface SeizeFormData {
  seized_by: string;
  seizing_charge: string;
  seizing_date: string;
  godown_id: string;
  description: string;
}

interface Godown {
  id: number;
  name: string;
  address?: string;
  city?: string;
}

interface UnseizeFormData {
  status: 'Pending' | 'Paid' | 'Cancelled';
  seizing_id: string;
}

const AccountActionsDropdown = ({
  customerName,
  hplNo,
  customerId,
  onActionCompleted,
  customerData,
  PenaltyDays,
  totalPaidAmount,
  totalPenalty,
  loanStatus,
  onStatusChange,
}: AccountActionsDropdownProps) => {
  const { user } = useAuth();
  const [confirmAction, setConfirmAction] = useState<ActionType>(null);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [showReloanDialog, setShowReloanDialog] = useState(false);
  const [showSeizeDialog, setShowSeizeDialog] = useState(false);
  const [showUnseizeDialog, setShowUnseizeDialog] = useState(false);
  const [vehicleDetails, setVehicleDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [nextHplNo, setNextHplNo] = useState<string>('');
  const [latestSeizingId, setLatestSeizingId] = useState<string>('');
  const [godownList, setGodownList] = useState<Godown[]>([]);

  // Seize form state
  const [seizeForm, setSeizeForm] = useState<SeizeFormData>({
    seized_by: '',
    seizing_charge: '',
    seizing_date: new Date().toISOString().split('T')[0],
    godown_id: '',
    description: '',
  });

  // Unseize form state
  const [unseizeForm, setUnseizeForm] = useState<UnseizeFormData>({
    status: 'Paid',
    seizing_id: '',
  });

  const [settlementData, setSettlementData] = useState<SettlementData>({
    payableBalance: 0,
    interest: 0,
    penalty: 0,
    totalAmount: 0,
    remarks: '',
  });
  console.log('customer data:', customerData)
  const [reloanData, setReloanData] = useState<ReloanData>({
    oldHplNo: String(hplNo ?? ''),
    newHplNo: '',
    reloanAmount: 0,
    remarks: '',
  });

  const [reloanPaymentData, setReloanPaymentData] = useState<ReloanPaymentData>({
    dueDate: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    billNumber: `REL-${hplNo}-${Date.now()}`,
    amount: 0,
    penalty: 0,
    collected_by: '',
    payment_mode: 'cash',
    remarks: '',
  });
  const selectedGodown = godownList.find(
    g => g.id === Number(seizeForm.godown_id)
  );
  // Auto-fill seized_by with current user and fetch godown list when seize dialog opens
  useEffect(() => {
    if (showSeizeDialog) {
      if (user) {
        setSeizeForm(prev => ({
          ...prev,
          seized_by: user.username || '',
        }));
      }
      // Fetch active godowns
      const fetchGodowns = async () => {
        try {
          const response = await axios.get(`${BASE_URL}/api/godowns/get-active-godowns`);
          if (response.data.success) {
            setGodownList(response.data.godowns || []);
          }
        } catch (error) {
          console.error('Error fetching godowns:', error);
          toast({ title: 'Error', description: 'Failed to load godown list', variant: 'destructive' });
        }
      };
      fetchGodowns();
    }
  }, [showSeizeDialog, user]);

  // Calculate balance
  const calculateBalance = () => {
    if (!customerData?.loan) return 0;
    const dueMonthNum = typeof customerData.loan.dueMonth === 'string'
      ? parseInt(customerData.loan.dueMonth, 10)
      : customerData.loan.dueMonth || 0;
    const totalAmount = dueMonthNum * customerData.loan.dueAmount;
    return totalAmount - totalPaidAmount;
  };

  // Fetch customer data on mount
  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/customers/${customerId}`);
        if (response.data.success) {
          if (response.data.vehicle) {
            setVehicleDetails(response.data.vehicle);
          }
        }
      } catch (error) {
        console.error('Error fetching customer data:', error);
      }
    };
    fetchCustomerData();
  }, [hplNo]);

  // Fetch latest pending seizing record when unseize dialog opens
  useEffect(() => {
    if (showUnseizeDialog) {
      const fetchSeizingRecords = async () => {
        try {
          const response = await axios.get(`${BASE_URL}/api/customers/${customerId}/seizing`);
          if (response.data.success && response.data.records.length > 0) {
            const pendingRecord = response.data.records.find((r: any) => r.status === 'Pending');
            if (pendingRecord) {
              setUnseizeForm(prev => ({ ...prev, seizing_id: String(pendingRecord.id) }));
              setLatestSeizingId(String(pendingRecord.id));
            }
          }
        } catch (error) {
          console.error('Error fetching seizing records:', error);
        }
      };
      fetchSeizingRecords();
    }
  }, [showUnseizeDialog]);

  // Fetch next HPL number when needed
  const fetchNextHplNo = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/customers/next-hplno`);
      if (response.data.success) {
        const newHplNo = response.data.nextHplno.toString();
        setNextHplNo(newHplNo);
        setReloanData(prev => ({
          ...prev,
          newHplNo,
          reloanAmount: calculateBalance() || 0
        }));
        setReloanPaymentData(prev => ({
          ...prev,
          billNumber: `REL-${newHplNo}-${Date.now()}`,
          amount: calculateBalance() || 0
        }));
      }
    } catch (error) {
      console.error('Error fetching next HPL number:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch next HPL number',
        variant: 'destructive',
      });
    }
  };

  const actionConfig = {
    delete: {
      title: 'Delete Customer',
      description: `Are you sure you want to delete ${customerName} (${hplNo})? This action cannot be undone and will permanently remove all customer data, payments, and history.`,
      confirmText: 'Delete Customer',
      variant: 'destructive' as const,
      onConfirm: async () => {
        try {
          setLoading(true);
          const response = await axios.delete(`${BASE_URL}/api/customers/${hplNo}`);
          if (response.data.success) {
            toast({
              title: 'Customer Deleted',
              description: `${customerName} has been permanently deleted.`,
              variant: 'destructive',
            });
            onActionCompleted?.();
          }
        } catch (error) {
          console.error('Error deleting customer:', error);
          toast({ title: 'Error', description: 'Failed to delete customer', variant: 'destructive' });
        } finally {
          setLoading(false);
        }
      },
    },
    settlement: {
      title: 'Full Settlement',
      description: `Are you sure you want to proceed with full settlement for ${customerName}?`,
      confirmText: 'Proceed to Settlement',
      variant: 'default' as const,
      onConfirm: () => {
        const balance = calculateBalance();
        const penaltyBalance = (customerData?.loan?.penaltyAmount || 0) * PenaltyDays - totalPenalty;
        setSettlementData(prev => ({
          ...prev,
          payableBalance: balance,
          penalty: penaltyBalance > 0 ? penaltyBalance : 0,
          totalAmount: balance + (penaltyBalance > 0 ? penaltyBalance : 0)
        }));
        setShowSettlementDialog(true);
      },
    },
    reloan: {
      title: 'Create Reloan',
      description: `Are you sure you want to create a reloan for ${customerName}?`,
      confirmText: 'Proceed to Reloan',
      variant: 'default' as const,
      onConfirm: () => {
        fetchNextHplNo();
        setShowReloanDialog(true);
      },
    },
    'selling-vehicle': {
      title: 'Sell Seized Vehicle',
      description: `Are you sure you want to sell the seized vehicle for ${customerName}? This will close the loan and make the vehicle available.`,
      confirmText: 'Sell Vehicle',
      variant: 'destructive' as const,
      onConfirm: async () => {
        try {
          setLoading(true);
          const customerResponse = await axios.put(`${BASE_URL}/api/customers/${customerId}/update-status`, {
            loanStatus: 'close',
            vehicle_number: `${customerData?.vehicle.vehicle_number}`,
            status: 'available'
          });

          if (customerResponse.data.success) {
            if (vehicleDetails) {
              const updateData: any = { status: 'available' };
              if (vehicleDetails.deal_type === 'finance') {
                updateData.deal_type = 'consulting';
              }
              await axios.put(`${BASE_URL}/api/vehicles/${vehicleDetails.id}`, updateData);
            }
            if (onStatusChange) onStatusChange('close');
            toast({
              title: 'Vehicle Sold',
              description: `Seized vehicle has been sold for ${customerName}. Loan closed and vehicle made available.`,
            });
            onActionCompleted?.();
          }
        } catch (error) {
          console.error('Error selling vehicle:', error);
          toast({ title: 'Error', description: 'Failed to sell vehicle', variant: 'destructive' });
        } finally {
          setLoading(false);
        }
      },
    },
  };

  const currentAction = confirmAction ? actionConfig[confirmAction] : null;

  // Handle seize submission
  const handleSubmitSeize = async () => {
    if (!seizeForm.seizing_charge || !seizeForm.godown_id || !seizeForm.seizing_date || !seizeForm.seized_by) {
      toast({ title: 'Validation Error', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }
    try {
      setLoading(true);
      const response = await axios.put(`${BASE_URL}/api/customers/${customerId}/seize`, {
        loanStatus: 'seized',
        vehicle_number: `${customerData?.vehicle?.vehicle_number}`,
        status: 'seized',
        hplno: hplNo,
        seizing_charge: parseFloat(seizeForm.seizing_charge),
        description: seizeForm.description,
        godown_id: Number(seizeForm.godown_id),
        godown_name: selectedGodown?.name,
        seized_by: seizeForm.seized_by,
        seizing_date: seizeForm.seizing_date,
      });

      if (response.data.success) {
        if (onStatusChange) onStatusChange('seized');
        toast({ title: 'Vehicle Seized', description: `Vehicle has been seized for ${customerName}.` });
        setShowSeizeDialog(false);
        onActionCompleted?.();
      }
    } catch (error) {
      console.error('Error seizing vehicle:', error);
      toast({ title: 'Error', description: 'Failed to seize vehicle', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Handle unseize submission
  const handleSubmitUnseize = async () => {
    try {
      setLoading(true);
      const response = await axios.put(`${BASE_URL}/api/customers/${customerId}/unseize`, {
        seizing_id: unseizeForm.seizing_id || latestSeizingId,
        status: unseizeForm.status,
        loanStatus: 'active',
        vehicle_number: `${customerData?.vehicle?.vehicle_number}`,
        vehicleStatus: 'sales',
      });

      if (response.data.success) {
        if (onStatusChange) onStatusChange('active');
        toast({ title: 'Vehicle Unseized', description: `Vehicle has been unseized for ${customerName}.` });
        setShowUnseizeDialog(false);
        onActionCompleted?.();
      }
    } catch (error) {
      console.error('Error unseizing vehicle:', error);
      toast({ title: 'Error', description: 'Failed to unseize vehicle', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Handle settlement submission
  const handleSubmitSettlement = async () => {
    try {
      setLoading(true);
      const paymentResponse = await axios.post(`${BASE_URL}/api/customers/${customerId}/payments`, {
        dueDate: new Date().toISOString().split('T')[0],
        paymentDate: new Date().toISOString().split('T')[0],
        billNumber: `SETTLE-${hplNo}-${Date.now()}`,
        amount: settlementData.payableBalance,
        penalty: settlementData.penalty,
        remarks: `Full settlement: ${settlementData.remarks}`,
        collected_by: 'System',
        payment_mode: 'settlement'
      });

      if (paymentResponse.data.success) {
        const customerResponse = await axios.put(`${BASE_URL}/api/customers/${customerId}/update-status`, {
          loanStatus: 'close',
          vehicle_number: `${customerData?.vehicle.vehicle_number}`,
          status: 'sold'
        });

        if (customerResponse.data.success) {
          toast({
            title: 'Full Settlement Completed',
            description: `Customer ${customerName} has been fully settled. Loan status updated to 'close'.`,
          });
          if (onStatusChange) onStatusChange('close');
          setShowSettlementDialog(false);
          onActionCompleted?.();
        }
      }
    } catch (error) {
      console.error('Error processing settlement:', error);
      toast({ title: 'Error', description: 'Failed to process settlement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReloan = async (reloanData: any) => {
    try {
      setLoading(true);
      const reloanResponse = await axios.post(`${BASE_URL}/api/customers/reloan`, {
        oldCustomerId: customerId,
        oldHplNo: hplNo,
        newHplNo: reloanData.newHplNo,
        reloanAmount: reloanData.reloanAmount,
        loanDetails: reloanData.loanDetails,
        settlementPayment: reloanData.settlementPayment,
        customerName: customerName,
        vehicleId: vehicleDetails?.id || null,
        customerData: customerData
      });

      if (reloanResponse.data.success) {
        toast({
          title: 'Reloan Created',
          description: `Reloan created successfully. New HPL No: ${reloanData.newHplNo}`,
        });
        setShowReloanDialog(false);
        onActionCompleted?.();
      }
    } catch (error) {
      console.error('Error creating reloan:', error);
      toast({ title: 'Error', description: 'Failed to create reloan', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };



  // Render actions based on loan status
  const getAvailableActions = () => {
    if (loanStatus === 'seized') {
      return (
        <>
          <DropdownMenuItem onClick={() => setShowUnseizeDialog(true)}>
            <Key className="w-4 h-4 mr-2 text-blue-500" />
            <div className="flex flex-col">
              <span>Unseize Vehicle</span>
              <span className="text-xs text-muted-foreground">Change status back to active</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirmAction('selling-vehicle')}>
            <DollarSign className="w-4 h-4 mr-2 text-green-500" />
            <div className="flex flex-col">
              <span>Sell Seized Vehicle</span>
              <span className="text-xs text-muted-foreground">Close loan &amp; make vehicle available</span>
            </div>
          </DropdownMenuItem>
        </>
      );
    }

    if (loanStatus === 'close') {
      return (
        <DropdownMenuItem onClick={() => setConfirmAction('reloan')}>
          <RefreshCw className="w-4 h-4 mr-2 text-blue-500" />
          <div className="flex flex-col">
            <span>Create Reloan</span>
            <span className="text-xs text-muted-foreground">Create new loan with new HPL number</span>
          </div>
        </DropdownMenuItem>
      );
    }

    return (
      <>
        <DropdownMenuItem onClick={() => setConfirmAction('settlement')}>
          <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
          <div className="flex flex-col">
            <span>Full Settlement</span>
            <span className="text-xs text-muted-foreground">Close loan with final payment</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setConfirmAction('reloan')}>
          <RefreshCw className="w-4 h-4 mr-2 text-blue-500" />
          <div className="flex flex-col">
            <span>Create Reloan</span>
            <span className="text-xs text-muted-foreground">Create new loan with new HPL number</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowSeizeDialog(true)}>
          <ShieldAlert className="w-4 h-4 mr-2 text-amber-500" />
          <div className="flex flex-col">
            <span>Seize Vehicle</span>
            <span className="text-xs text-muted-foreground">Mark vehicle as seized</span>
          </div>
        </DropdownMenuItem>
      </>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={loading}>
          <Button variant="outline" className="gap-2">
            <MoreHorizontal className="w-4 h-4" />
            Actions
            {loading && <span className="ml-2 animate-spin">⟳</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5 border-b">
            <div className="text-xs font-medium text-muted-foreground">Loan Status</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={
                loanStatus === 'active' ? 'default' :
                  loanStatus === 'seized' ? 'destructive' : 'secondary'
              }>
                {loanStatus?.toUpperCase()}
              </Badge>
              {vehicleDetails && (
                <Badge variant="outline">
                  {vehicleDetails.deal_type || 'finance'}
                </Badge>
              )}
            </div>
          </div>

          <DropdownMenuGroup className="p-1">
            {getAvailableActions()}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation Dialog for Simple Actions */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{currentAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{currentAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={currentAction?.onConfirm}
              disabled={loading}
              className={
                currentAction?.variant === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {loading ? 'Processing...' : currentAction?.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Seize Vehicle Dialog ── */}
      <Dialog open={showSeizeDialog} onOpenChange={setShowSeizeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Seize Vehicle
            </DialogTitle>
            <DialogDescription>
              Record seizure details for <strong>{customerName}</strong> ({hplNo})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Seized By */}
            <div className="space-y-1.5">
              <Label htmlFor="seized_by">
                Seized By <span className="text-destructive">*</span>
              </Label>
              <Input
                id="seized_by"
                value={seizeForm.seized_by}
                onChange={e => setSeizeForm(prev => ({ ...prev, seized_by: e.target.value }))}
                placeholder="Enter name"
              />
            </div>

            {/* Seizing Charge */}
            <div className="space-y-1.5">
              <Label htmlFor="seizing_charge">
                Seizing Charge (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="seizing_charge"
                type="number"
                min="0"
                step="0.01"
                value={seizeForm.seizing_charge}
                onChange={e => setSeizeForm(prev => ({ ...prev, seizing_charge: e.target.value }))}
                placeholder="0.00"
              />
            </div>

            {/* Seizing Date */}
            <div className="space-y-1.5">
              <Label htmlFor="seizing_date">
                Seizing Date <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                id="seizing_date"
                value={seizeForm.seizing_date}
                onChange={e => setSeizeForm(prev => ({ ...prev, seizing_date: e.target.value }))}
                placeholder="Seizing Date"
              />
            </div>

            {/* Godown */}
            <div className="space-y-1.5">
              <Label htmlFor="godown_id">
                Godown <span className="text-destructive">*</span>
              </Label>
              <select
                id="godown_id"
                value={seizeForm.godown_id}
                onChange={e => setSeizeForm(prev => ({ ...prev, godown_id: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">-- Select Godown --</option>
                {godownList.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g.city ? ` (${g.city})` : ''}
                  </option>
                ))}
              </select>
              {godownList.length === 0 && (
                <p className="text-xs text-muted-foreground">No active godowns found.</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="sz_description">Description</Label>
              <Textarea
                id="sz_description"
                value={seizeForm.description}
                onChange={e => setSeizeForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeizeDialog(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSeize}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {loading ? 'Processing...' : 'Seize Vehicle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unseize Vehicle Dialog ── */}
      <Dialog open={showUnseizeDialog} onOpenChange={setShowUnseizeDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-500" />
              Unseize Vehicle
            </DialogTitle>
            <DialogDescription>
              Update the seizure status for <strong>{customerName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Seizing Resolution Status <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setUnseizeForm(prev => ({ ...prev, status: 'Pending' }))}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 transition-all ${unseizeForm.status === 'Pending'
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'border-border hover:border-amber-300'
                    }`}
                >
                  <ShieldAlert className="w-5 h-5" />
                  <span className="text-sm font-medium">Pending</span>
                  <span className="text-xs text-muted-foreground text-center">Still pending</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnseizeForm(prev => ({ ...prev, status: 'Paid' }))}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 transition-all ${unseizeForm.status === 'Paid'
                    ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'border-border hover:border-green-300'
                    }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Paid</span>
                  <span className="text-xs text-muted-foreground text-center">Charge was paid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnseizeForm(prev => ({ ...prev, status: 'Cancelled' }))}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 transition-all ${unseizeForm.status === 'Cancelled'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border hover:border-destructive/50'
                    }`}
                >
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Cancelled</span>
                  <span className="text-xs text-muted-foreground text-center">Seizure cancelled</span>
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <p>This will set the vehicle status back to <strong>active</strong> and update the loan status.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnseizeDialog(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmitUnseize} disabled={loading}>
              {loading ? 'Processing...' : 'Confirm Unseize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settlement Dialog */}
      <SettlementDialog
        isOpen={showSettlementDialog}
        onClose={() => setShowSettlementDialog(false)}
        loan={customerData?.loan}
        onSubmit={handleSubmitSettlement}
        initialData={customerData?.payments || []}
        totalPenalty={totalPenalty}
        totalPaidAmount={totalPaidAmount}
        penaltyDays={PenaltyDays}
      />

      {/* Reloan Dialog */}
      <ReloanDialog
        isOpen={showReloanDialog}
        onClose={() => setShowReloanDialog(false)}
        onSubmit={handleCreateReloan}
        customerData={customerData}
        nextHplNo={nextHplNo}
        PenaltyDays={PenaltyDays}
      />
    </>
  );
};

export default AccountActionsDropdown;