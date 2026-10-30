import { useState } from 'react';
import { Edit, Trash2, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { Payment, SubDue } from '../../types/customer';
import { format, parseISO } from 'date-fns';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { useAuth } from '../../contexts/AuthContext';

// ---------- helpers ----------

const formatDate = (dateString: string) => {
  if (!dateString || dateString === '-') return '-';
  try {
    return format(parseISO(dateString), 'dd/MM/yyyy');
  } catch {
    return '-';
  }
};

const getPaymentModeLabel = (mode?: string) => {
  const map: Record<string, string> = {
    cash: 'Cash', online: 'Online', bank: 'Bank Transfer',
    upi: 'UPI', cheque: 'Cheque', other: 'Other',
  };
  return mode ? map[mode] || mode : 'Not specified';
};

// ---------- sub-components ----------

const StatusBadge = ({ status }: { status: string }) => {
  const classes: Record<string, string> = {
    pending: 'badge-pending',
    partial: 'badge-warning',
    paid: 'badge-success',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    partial: 'Partial',
    paid: 'Paid',
  };
  return <span className={classes[status] || 'badge-pending'}>{labels[status] || status}</span>;
};

// ---------- props ----------

interface PaymentTableProps {
  payments: Payment[];
  dueAmount?: number;
  onEdit: (payment: Payment) => void;
  onDelete: (paymentId: number) => void;
  calculatePenaltyDays: (index: number) => number;
}

const PaymentTable = ({
  payments,
  dueAmount,
  onEdit,
  onDelete,
  calculatePenaltyDays,
}: PaymentTableProps) => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [collapsedDates, setCollapsedDates] = useState<Set<number>>(new Set());
  const [viewPayment, setViewPayment] = useState<Payment | null>(null);
  const [viewSubDue, setViewSubDue] = useState<{ sub: SubDue; parent: Payment } | null>(null);

  const toggleExpand = (id: number) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getPenaltyDays = (payment: Payment) => {
    const idx = payments.indexOf(payment);
    return idx >= 0 ? calculatePenaltyDays(idx) : 0;
  };
  const getBalance = (payment: Payment) => {
    if (payment.status !== 'paid') {
      const expected = Number(dueAmount) || 0;
      const subTotal = (payment.sub_dues || []).reduce((s, sd) => s + (sd.paid_amount || 0), 0);
      const totalPaid = (payment.amount || 0) + subTotal;
      return Math.max(expected - totalPaid, 0);
    }
    return 0;
  };

  const getComputedStatus = (payment: Payment) => {
    const balance = getBalance(payment);
    if (payment.amount === 0 && (!payment.sub_dues || payment.sub_dues.length === 0)) return 'pending';
    if (balance <= 0) return 'paid';
    return 'partial';
  };

  if (payments.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg border border-border/50">
        <p className="text-muted-foreground">No payment records found</p>
      </div>
    );
  }

  const totalPaidAll = payments.reduce((s, p) => {
    const subTotal = (p.sub_dues || []).reduce((ss, sd) => ss + (sd.paid_amount || 0), 0);
    return s + (p.amount || 0) + subTotal;
  }, 0);
  const totalBalanceAll = payments.reduce((s, p) => s + getBalance(p), 0);

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden bg-card animate-slide-up">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="table-header bg-muted/80 hover:bg-muted/50">
                <TableHead className="w-[40px]" />
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Bill No</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead className="hidden md:table-cell">Collected By</TableHead>
                <TableHead className="hidden lg:table-cell">Penalty Days</TableHead>
                <TableHead>Penalty</TableHead>
                {isOwner && <TableHead className="w-[140px] text-center">Actions</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {payments.map((payment, idx) => {
                const hasSubs = payment.sub_dues && payment.sub_dues.length > 0;
                const isExpanded = !collapsedDates.has(payment.id);
                const penaltyDays = getPenaltyDays(payment);
                const balance = getBalance(payment);
                const status = payment.status || getComputedStatus(payment);

                return (
                  <>
                    {/* ── Primary Payment Row ── */}
                    <TableRow
                      key={`pay-${payment.id}`}
                      className={`transition-colors ${hasSubs ? 'cursor-pointer hover:bg-muted/40' : 'table-row-hover'} ${status === 'pending' ? 'bg-destructive/[0.03]' : ''}`}
                      onClick={() => hasSubs && toggleExpand(payment.id)}
                    >
                      <TableCell className="px-2">
                        {hasSubs && (
                          <span className="text-muted-foreground">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{formatDate(payment.dueDate)}</TableCell>
                      <TableCell>{formatDate(String(payment.paymentDate))}</TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {payment.billNumber || '-'}
                      </TableCell>
                      <TableCell className="font-semibold text-success">
                        ₹{(payment.amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {balance > 0 ? (
                          <span className="font-medium text-destructive">₹{balance.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">₹0</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {payment.collected_by || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {penaltyDays > 0
                          ? <span className="badge-destructive">{penaltyDays} days</span>
                          : <span className="badge-success">On time</span>}
                      </TableCell>
                      <TableCell>
                        {payment.penalty > 0
                          ? <span className="text-destructive font-medium">₹{payment.penalty.toLocaleString()}</span>
                          : <span className="text-muted-foreground">₹0</span>}
                      </TableCell>
                      {isOwner && (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="View Details"
                              onClick={() => setViewPayment(payment)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                              title="Edit Payment"
                              onClick={() => onEdit(payment)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete Payment"
                              onClick={() => onDelete(payment.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>

                    {/* ── Sub-due rows ── */}
                    {hasSubs && isExpanded && payment.sub_dues?.map((sub, si) => (
                      <TableRow
                        key={`sub-${sub.id}-${si}`}
                        className="payment-sub-row bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setViewSubDue({ sub, parent: payment })}
                      >
                        <TableCell />
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}.{si + 1}</TableCell>
                        <TableCell className="text-muted-foreground text-sm pl-6">↳ sub due</TableCell>
                        <TableCell>{formatDate(sub.payment_date)}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${sub.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                            {sub.status || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{sub.bill_number || '-'}</TableCell>
                        <TableCell className="font-semibold text-success">
                          ₹{(sub.paid_amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell />
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {sub.collected_by || '-'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">-</TableCell>
                        <TableCell className="text-muted-foreground">-</TableCell>
                        {isOwner && <TableCell />}
                      </TableRow>
                    ))}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary footer */}
        <div className="border-t border-border bg-muted/40 px-4 py-3 flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Total Dues:</span>{' '}
            <span className="font-semibold">{payments.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Paid:</span>{' '}
            <span className="font-semibold text-success">
              ₹{totalPaidAll.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Balance:</span>{' '}
            <span className="font-semibold text-destructive">
              ₹{totalBalanceAll.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="badge-success">Paid</span>
            <span className="badge-warning">Partial</span>
            <span className="badge-pending">Pending</span>
          </div>
        </div>
      </div>

      {/* ── View Payment Dialog ── */}
      <Dialog open={!!viewPayment} onOpenChange={(open) => !open && setViewPayment(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Payment Details</DialogTitle>
            <DialogDescription>
              Complete payment information including remarks and hand loan details
            </DialogDescription>
          </DialogHeader>
          {viewPayment && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(viewPayment.dueDate)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Payment Date</p>
                  <p className="font-medium">{formatDate(String(viewPayment.paymentDate))}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Bill Number</p>
                  <p className="font-medium">{viewPayment.billNumber || '-'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Collected By</p>
                  <p className="font-medium">{viewPayment.collected_by || '-'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <StatusBadge status={viewPayment.status || getComputedStatus(viewPayment)} />
                </div>
              </div>

              {/* Amount Details */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Amount Paid</p>
                  <p className="font-semibold text-success text-lg">
                    ₹{(viewPayment.amount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Penalty</p>
                  <p className={`font-semibold text-lg ${viewPayment.penalty > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    ₹{(viewPayment.penalty || 0).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Total</p>
                  <p className="font-semibold text-primary text-lg">
                    ₹{((viewPayment.amount || 0) + (viewPayment.penalty || 0)).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Payment Modes */}
              <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                <p className="text-sm font-semibold text-foreground">Payment Modes</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Primary Mode</p>
                    <Badge variant="outline" className="font-normal">
                      {getPaymentModeLabel(viewPayment.payment_mode)}
                    </Badge>
                    {(viewPayment as any).payment_mode_amount > 0 && (
                      <p className="text-sm text-success">₹{(viewPayment as any).payment_mode_amount.toLocaleString()}</p>
                    )}
                  </div>
                  {viewPayment.payment_mode_1 && (
                    <>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Secondary Mode</p>
                        <Badge variant="outline" className="font-normal">
                          {getPaymentModeLabel(viewPayment.payment_mode_1)}
                        </Badge>
                        {viewPayment.payment_mode_1_amount > 0 && (
                          <p className="text-sm text-success">₹{viewPayment.payment_mode_1_amount.toLocaleString()}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Hand Loan */}
              {viewPayment.hand_loan > 0 && (
                <div className="space-y-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="font-medium text-amber-800">Hand Loan Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-700">Hand Loan Amount</p>
                      <p className="font-semibold text-amber-900 text-lg">
                        ₹{viewPayment.hand_loan.toLocaleString()}
                      </p>
                    </div>
                    {viewPayment.hand_loan_remark && (
                      <div className="space-y-1 col-span-2">
                        <p className="text-sm font-medium text-amber-700">Hand Loan Remark</p>
                        <p className="text-amber-900 bg-amber-100 p-3 rounded-md">
                          {viewPayment.hand_loan_remark}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Remarks */}
              {viewPayment.remarks && (
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Remarks</h4>
                  <div className="bg-muted/50 p-4 rounded-lg border border-border">
                    <p className="text-foreground whitespace-pre-wrap">{viewPayment.remarks}</p>
                  </div>
                </div>
              )}

              {/* Payment Status */}
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">Payment Status</h4>
                <div className="flex items-center gap-2">
                  {getPenaltyDays(viewPayment) > 0 ? (
                    <>
                      <Badge variant="destructive" className="text-sm">Late Payment</Badge>
                      <span className="text-sm text-muted-foreground">
                        {getPenaltyDays(viewPayment)} days late
                      </span>
                    </>
                  ) : (
                    <Badge className="text-sm border-transparent bg-green-500 text-white hover:bg-green-600">
                      On Time
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPayment(null)}>Close</Button>
            {isOwner && viewPayment && (
              <Button onClick={() => { onEdit(viewPayment); setViewPayment(null); }}>
                Edit Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Sub-Due Dialog ── */}
      <Dialog open={!!viewSubDue} onOpenChange={(open) => !open && setViewSubDue(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sub-Due Payment Details</DialogTitle>
            <DialogDescription>Payment detail for sub-due entry</DialogDescription>
          </DialogHeader>
          {viewSubDue && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(viewSubDue.parent.dueDate)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Payment Date</p>
                  <p className="font-medium">{formatDate(viewSubDue.sub.payment_date)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Bill Number</p>
                  <p className="font-medium">{viewSubDue.sub.bill_number || '-'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Collected By</p>
                  <p className="font-medium">{viewSubDue.sub.collected_by || '-'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium">{viewSubDue.sub.status || '-'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Amount Paid</p>
                  <p className="text-lg font-semibold text-success">
                    ₹{(viewSubDue.sub.paid_amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Payment Modes */}
              <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                <p className="text-sm font-semibold text-foreground">Payment Modes</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Mode 1</p>
                    <p className="font-medium">{getPaymentModeLabel(viewSubDue.sub.payment_mode)}</p>
                    {viewSubDue.sub.payment_mode_amount > 0 && (
                      <p className="text-sm text-success">₹{viewSubDue.sub.payment_mode_amount.toLocaleString()}</p>
                    )}
                  </div>
                  {viewSubDue.sub.payment_mode_1 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Mode 2</p>
                      <p className="font-medium">{getPaymentModeLabel(viewSubDue.sub.payment_mode_1)}</p>
                      {viewSubDue.sub.payment_mode_1_amount > 0 && (
                        <p className="text-sm text-success">₹{viewSubDue.sub.payment_mode_1_amount.toLocaleString()}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewSubDue(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PaymentTable;
