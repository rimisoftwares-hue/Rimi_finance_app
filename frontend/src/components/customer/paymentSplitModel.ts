import type { PaymentFormData } from '../../types/customer';

export interface PaymentDialogLoanContext {
  dueAmount?: number | string;
  due_amount?: number | string;
  principle_part?: number | string;
  interest_part?: number | string;
  hpAmount?: number | string;
  hp_amount?: number | string;
  net_payable?: number | string;
  interestRate?: string | number;
  interest_rate?: string | number;
  dueMonth?: string | number;
  due_month?: string | number;
}

export interface OpenDueLedgerItem {
  id: string | number;
  dueDate: string;
  paidAmount: number;
  paidInterest: number;
}

export function round2(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

export function resolveLoanInstallmentParts(loan?: PaymentDialogLoanContext | null): {
  dueAmount: number;
  duePrincipal: number;
  dueInterest: number;
} {
  if (!loan) {
    return { dueAmount: 0, duePrincipal: 0, dueInterest: 0 };
  }

  const rawDue = round2(loan.due_amount ?? loan.dueAmount ?? 0);
  const rawTenure = Math.max(0, Math.trunc(Number(loan.due_month ?? loan.dueMonth ?? 0) || 0));
  const rawNetPayable = round2(loan.net_payable ?? 0);
  const rawHp = round2(loan.hp_amount ?? loan.hpAmount ?? 0);
  const rawPrinciplePart = round2(loan.principle_part ?? 0);
  const rawInterestPart = round2(loan.interest_part ?? 0);
  const rawRate = Number(loan.interest_rate ?? loan.interestRate ?? 0) || 0;

  let dueAmount = 0;
  if (rawDue > 0) {
    dueAmount = rawDue;
  } else if (rawTenure > 0 && (rawNetPayable > 0 || rawHp > 0)) {
    const basis = rawNetPayable > 0 ? rawNetPayable : rawHp;
    dueAmount = round2(basis / rawTenure);
  } else if (rawPrinciplePart + rawInterestPart > 0) {
    dueAmount = round2(rawPrinciplePart + rawInterestPart);
  }

  let candidateInt = 0;
  if (rawInterestPart > 0) {
    candidateInt = rawInterestPart;
  } else if (rawHp > 0 && rawRate > 0) {
    candidateInt = round2((rawHp * rawRate) / 100);
  } else if (rawPrinciplePart > 0 && dueAmount > rawPrinciplePart) {
    candidateInt = round2(dueAmount - rawPrinciplePart);
  }

  const dueInterest = Math.min(dueAmount, Math.max(0, candidateInt));
  const duePrincipal = Math.max(0, round2(dueAmount - dueInterest));

  return { dueAmount, duePrincipal, dueInterest };
}

export function splitAmountInterestFirst(
  amount: number,
  dueAmount: number,
  dueInterest: number,
  alreadyPaidInterest = 0
): { principalAmount: number; interestAmount: number } {
  const amt = Math.max(0, round2(amount));
  const due = Math.max(0, round2(dueAmount));
  if (amt === 0 || due === 0) {
    return { principalAmount: amt, interestAmount: 0 };
  }
  const intCap = Math.min(due, Math.max(0, round2(dueInterest)));
  const paidInt = Math.max(0, round2(alreadyPaidInterest));

  if (amt <= due || paidInt > 0) {
    const remInt = Math.max(0, round2(intCap - paidInt));
    const interestAmount = Math.min(amt, remInt);
    return {
      principalAmount: round2(amt - interestAmount),
      interestAmount,
    };
  }

  const fullDues = Math.floor(amt / due);
  const remAmt = round2(amt - fullDues * due);
  const interestAmount = Math.min(amt, round2(fullDues * intCap + Math.min(remAmt, intCap)));
  return {
    principalAmount: round2(amt - interestAmount),
    interestAmount,
  };
}

export function computeAutoPaymentSplit({
  amount,
  loan,
  openDues = [],
  isEditing = false,
}: {
  amount: number;
  loan?: PaymentDialogLoanContext | null;
  openDues?: OpenDueLedgerItem[];
  isEditing?: boolean;
}): {
  principal_amount: number;
  interest_amount: number;
  singleDueCap: number;
  isMultiDue: boolean;
  dueAmount: number;
  dueInterest: number;
  duePrincipal: number;
} {
  const totalReceived = Math.max(0, round2(amount));
  const { dueAmount, duePrincipal, dueInterest } = resolveLoanInstallmentParts(loan);

  const activeOpenDues =
    dueAmount > 0
      ? (openDues || []).filter((od) => round2(od.paidAmount) < dueAmount)
      : [];

  const singleDueCap = isEditing
    ? Infinity
    : activeOpenDues.length > 0
      ? Math.max(0, round2(dueAmount - round2(activeOpenDues[0].paidAmount)))
      : dueAmount;

  const isMultiDue = !isEditing && singleDueCap > 0 && totalReceived > singleDueCap;

  if (totalReceived === 0) {
    return {
      principal_amount: 0,
      interest_amount: 0,
      singleDueCap,
      isMultiDue,
      dueAmount,
      dueInterest,
      duePrincipal,
    };
  }

  if (isEditing || dueAmount <= 0) {
    const split = splitAmountInterestFirst(totalReceived, dueAmount, dueInterest, 0);
    return {
      principal_amount: split.principalAmount,
      interest_amount: split.interestAmount,
      singleDueCap,
      isMultiDue,
      dueAmount,
      dueInterest,
      duePrincipal,
    };
  }

  let remaining = totalReceived;
  let totalPrincipal = 0;
  let totalInterest = 0;

  for (const od of activeOpenDues) {
    if (remaining <= 0) break;
    const shortfall = Math.max(0, round2(dueAmount - round2(od.paidAmount)));
    const chunk = Math.min(remaining, shortfall);
    const split = splitAmountInterestFirst(chunk, dueAmount, dueInterest, od.paidInterest || 0);
    totalPrincipal = round2(totalPrincipal + split.principalAmount);
    totalInterest = round2(totalInterest + split.interestAmount);
    remaining = round2(remaining - chunk);
  }

  while (remaining > 0) {
    const chunk = Math.min(remaining, dueAmount);
    const split = splitAmountInterestFirst(chunk, dueAmount, dueInterest, 0);
    totalPrincipal = round2(totalPrincipal + split.principalAmount);
    totalInterest = round2(totalInterest + split.interestAmount);
    remaining = round2(remaining - chunk);
  }

  return {
    principal_amount: totalPrincipal,
    interest_amount: totalInterest,
    singleDueCap,
    isMultiDue,
    dueAmount,
    dueInterest,
    duePrincipal,
  };
}

export function applyManualPrincipalChange(
  currentAmount: number,
  newPrincipal: number,
  currentInterest: number
): { amount: number; principal_amount: number; interest_amount: number } {
  const amt = Math.max(0, round2(currentAmount));
  const val = Math.max(0, round2(newPrincipal));
  const curI = Math.max(0, round2(currentInterest));

  if (val <= amt) {
    return {
      amount: amt,
      principal_amount: val,
      interest_amount: Math.max(0, round2(amt - val)),
    };
  }

  return {
    amount: round2(val + curI),
    principal_amount: val,
    interest_amount: curI,
  };
}

export function applyManualInterestChange(
  currentAmount: number,
  newInterest: number,
  currentPrincipal: number
): { amount: number; principal_amount: number; interest_amount: number } {
  const amt = Math.max(0, round2(currentAmount));
  const val = Math.max(0, round2(newInterest));
  const curP = Math.max(0, round2(currentPrincipal));

  if (val <= amt) {
    return {
      amount: amt,
      principal_amount: Math.max(0, round2(amt - val)),
      interest_amount: val,
    };
  }

  return {
    amount: round2(curP + val),
    principal_amount: curP,
    interest_amount: val,
  };
}

export function buildSubmitPaymentPayload(
  formData: PaymentFormData,
  isMultiDue: boolean
): { ok: boolean; error?: string; payload?: PaymentFormData } {
  const amt = Math.max(0, round2(formData.amount || 0));
  const prin = Math.max(0, round2(formData.principal_amount || 0));
  const intr = Math.max(0, round2(formData.interest_amount || 0));

  if (round2(prin + intr) !== amt) {
    return {
      ok: false,
      error: `Principal (₹${prin.toLocaleString('en-IN')}) + Interest (₹${intr.toLocaleString('en-IN')}) must equal Amount (₹${amt.toLocaleString('en-IN')}).`,
    };
  }

  return {
    ok: true,
    payload: {
      ...formData,
      amount: amt,
      principal_amount: isMultiDue ? undefined : prin,
      interest_amount: isMultiDue ? undefined : intr,
    },
  };
}
