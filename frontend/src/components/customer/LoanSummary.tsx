import { CreditCard, TrendingUp, AlertCircle } from 'lucide-react';
import { LoanDetails, Payment } from '../../types/customer';
import { format, parseISO } from 'date-fns';

interface LoanSummaryProps {
  loan: LoanDetails;
  payments: Payment[];
  totalPaidAmount: number;
  totalPenalty: number;
  totalPenaltyDays: number;
  seizingPendingTotal?: number;
}

const LoanSummary = ({
  loan,
  payments = [],
  totalPaidAmount = 0,
  totalPenalty = 0,
  totalPenaltyDays = 0,
  seizingPendingTotal = 0,
}: LoanSummaryProps) => {
  // Safe extraction with snake_case and camelCase fallbacks + Number conversions
  const hpAmount = Number(loan?.hp_amount ?? loan?.hpAmount ?? 0) || 0;
  const hpDate = String(loan?.hp_date ?? loan?.hpDate ?? '');
  const due_date = String(loan?.due_date ?? (loan as any)?.dueDate ?? '');
  const dueMonthNum = Number(loan?.due_month ?? loan?.dueMonth ?? 0) || 0;
  const interestRateNum = parseFloat(String(loan?.interest_rate ?? loan?.interestRate ?? '0')) || 0;
  const interestPart = Number(loan?.interest_part ?? (loan as any)?.interestPart ?? 0) || 0;
  const principlePart = Number(loan?.principle_part ?? (loan as any)?.principlePart ?? 0) || 0;
  const dueAmount = Number(loan?.due_amount ?? loan?.dueAmount ?? 0) || 0;
  const documentationCharge = Number(loan?.documentation_charge ?? (loan as any)?.documentationCharge ?? 0) || 0;
  const netPayable = Number(loan?.net_payable ?? (loan as any)?.netPayable ?? 0) || 0;
  const penaltyAmount = Number(loan?.penalty_amount ?? loan?.penaltyAmount ?? 0) || 0;
  const penaltyDays = Number(loan?.penalty_days ?? (loan as any)?.penaltyDays ?? 0) || 0;

  // Safe Total & Progress calculations
  const totalAmount = netPayable > 0 ? netPayable : (dueMonthNum * dueAmount);
  const safeTotalPaid = Number(totalPaidAmount) || 0;
  const balanceAmount = Math.max(0, totalAmount - safeTotalPaid);

  const effectivePenaltyDays = totalPenaltyDays > 0 ? totalPenaltyDays : penaltyDays;
  const penaltyTotal = penaltyAmount * effectivePenaltyDays;
  const safeTotalPenalty = Number(totalPenalty) || 0;
  const penaltyBalance = Math.max(0, penaltyTotal - safeTotalPenalty);

  const progressPercent = totalAmount > 0
    ? Math.min(Math.max(0, (safeTotalPaid / totalAmount) * 100), 100)
    : 0;

  // Interest and Principal breakdown
  const interestTotal = interestPart > 0
    ? interestPart
    : (((hpAmount * interestRateNum * dueMonthNum) / 100) || 0);

  const paidInterest = interestRateNum > 0 && dueMonthNum > 0
    ? Math.min(safeTotalPaid, (((safeTotalPaid * interestRateNum * dueMonthNum) / 100) || 0))
    : 0;
  const paidPrincipal = Math.max(0, safeTotalPaid - paidInterest);
  const balanceInterest = Math.max(0, interestTotal - paidInterest);
  const balancePrincipal = Math.max(0, hpAmount - paidPrincipal);

  const paymentsCount = Array.isArray(payments) ? payments.length : 0;

  const formatDate = (dateString?: string | null) => {
    if (!dateString || dateString === '-') return '-';
    try {
      return format(parseISO(dateString), 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  const formatCurrency = (amount: number | string | undefined | null) => {
    const num = Number(amount);
    if (isNaN(num)) return '0';
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
      {/* Loan Details Card */}
      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-display font-semibold text-foreground">Loan Details</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">HP Date</span>
            <span className="text-foreground">{formatDate(hpDate)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Due Date</span>
            <span className="text-foreground">{formatDate(due_date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Due Month</span>
            <span className="text-foreground">{dueMonthNum} months</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Interest Rate</span>
            <span className="font-medium text-primary">{interestRateNum}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Interest Amt</span>
            <span className="font-semibold text-primary">₹{formatCurrency(interestTotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Principle Part</span>
            <span className="font-semibold text-foreground">
              ₹{formatCurrency(principlePart > 0 ? principlePart : (dueMonthNum > 0 ? hpAmount / dueMonthNum : hpAmount))}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">EMI Amount</span>
            <span className="font-semibold text-foreground">₹{formatCurrency(dueAmount)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Document Charge</span>
            <span className="font-semibold text-foreground">₹{formatCurrency(documentationCharge)}</span>
          </div>
        </div>
      </div>

      {/* Payment Progress Card */}
      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-success/10">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <h3 className="font-display font-semibold text-foreground">Payment Progress</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">HP Amount</span>
            <span className="font-semibold text-foreground">₹{formatCurrency(hpAmount)}</span>
          </div>
          {/* Total Amount */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-base font-semibold text-foreground">₹{formatCurrency(totalAmount)}</span>
          </div>

          {/* Paid Amount */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Paid</span>
            <div className="text-right">
              <span className="font-semibold text-success">₹{formatCurrency(safeTotalPaid)}</span>
              <span className="text-xs text-muted-foreground ml-2">
                ({formatCurrency(paidPrincipal)} + {formatCurrency(paidInterest)})
              </span>
            </div>
          </div>

          {/* Balance */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Balance</span>
            <div className="text-right">
              <span className={`font-semibold ${balanceAmount > 0 ? 'text-warning-foreground' : 'text-success'}`}>
                ₹{formatCurrency(balanceAmount)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ({formatCurrency(balancePrincipal)} + {formatCurrency(balanceInterest)})
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="pt-2">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium text-foreground">{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPercent}%`,
                  background: 'var(--gradient-primary)',
                }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-sm text-muted-foreground">Payments Made</span>
            <span className="font-medium text-foreground">{paymentsCount} / {dueMonthNum}</span>
          </div>
        </div>
      </div>

      {/* Penalty Summary Card */}
      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-destructive/10">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <h3 className="font-display font-semibold text-foreground">Penalty Summary</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Penalty Rate</span>
            <span className="font-semibold text-destructive">₹{formatCurrency(penaltyAmount)}/day</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Penalty Days</span>
            <span className={`font-medium ${effectivePenaltyDays > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {effectivePenaltyDays} days
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Penalty Amount</span>
            <span className="font-semibold text-destructive">₹{formatCurrency(penaltyTotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Penalty Paid</span>
            <span className="font-medium text-success">₹{formatCurrency(safeTotalPenalty)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-sm font-medium text-foreground">Penalty Balance</span>
            <span className={`font-bold ${penaltyBalance > 0 ? 'text-destructive' : 'text-success'}`}>
              ₹{formatCurrency(penaltyBalance)}
            </span>
          </div>
          {seizingPendingTotal > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Seizing Charges</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                ₹{formatCurrency(seizingPendingTotal)}
              </span>
            </div>
          )}
        </div>

        {effectivePenaltyDays === 0 && (
          <div className="mt-4 p-3 bg-success/10 rounded-lg">
            <p className="text-sm text-success font-medium">✓ No penalties - All payments on time!</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default LoanSummary;
