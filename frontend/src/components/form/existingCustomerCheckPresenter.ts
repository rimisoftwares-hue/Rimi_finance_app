import type {
  ExistingCustomerMatch,
  ExistingCustomerMatchedField,
  IdentityMatchField,
  IdentityMatchStrength,
} from '../../api/customerCheckApi.ts';
import type { RiskLevel } from '../../api/riskApi.ts';
import type { FieldMatchSummary } from '../../hooks/existingCustomerCheckModel.ts';

export type StepCheckContext = 'customer' | 'guardian';

export interface DeepViewSeedShape {
  id: string | number;
  name: string;
  hplNumber?: string;
  vehicleNumber?: string;
  riskLevel?: RiskLevel;
}

export interface ReasonBadgeView {
  key: IdentityMatchField;
  label: string;
  strength: IdentityMatchStrength;
  maskedValue: string;
}

export function formatStepContextLabel(context: StepCheckContext): string {
  return context === 'customer'
    ? 'Matched in Customer details'
    : 'Matched in Guardian details';
}

export function formatMatchRoleHeadline(match: ExistingCustomerMatch): {
  primary: string;
  secondary: string | null;
} {
  const roles = match.matchedRoles || [];
  const hasCustomer = roles.includes('customer');
  const hasGuardian = roles.includes('guardian');
  const hplText = match.hplno != null && match.hplno !== '' ? String(match.hplno) : '—';
  const borrower = (match.borrowerName || match.customerName || 'Borrower').trim();
  const guarantorHeadline = `Already a guarantor on HPL #${hplText} (${borrower})`;

  if (hasCustomer && hasGuardian) {
    return {
      primary: 'Existing customer found',
      secondary: guarantorHeadline,
    };
  }
  if (hasGuardian) {
    return {
      primary: guarantorHeadline,
      secondary: null,
    };
  }
  return {
    primary: 'Existing customer found',
    secondary: null,
  };
}

export function formatMatchedReasonBadges(
  matchedFields: ExistingCustomerMatchedField[]
): ReasonBadgeView[] {
  const seen = new Set<IdentityMatchField>();
  const out: ReasonBadgeView[] = [];

  for (const mf of matchedFields || []) {
    if (!mf || seen.has(mf.field)) continue;
    seen.add(mf.field);

    let label: string;
    if (mf.field === 'aadhar') {
      label = `Aadhaar match - ${mf.strength}`;
    } else if (mf.field === 'other_govt_id') {
      label = `Govt ID match - ${mf.strength}`;
    } else {
      label = `Phone match - ${mf.strength}`;
    }

    out.push({
      key: mf.field,
      label,
      strength: mf.strength,
      maskedValue: mf.maskedValue,
    });
  }

  return out;
}

export function formatExtraMatchesLabel(
  matchCount: number,
  shownCount: number
): string | null {
  const extra = matchCount - shownCount;
  if (extra <= 0) return null;
  return `and ${extra} more`;
}

export function formatInlineFieldChipText(summary: FieldMatchSummary): string {
  if (summary.matchCount > 1) {
    return `${summary.matchCount} existing matches (${summary.strength})`;
  }
  const first = summary.matches[0];
  const hpl = first && first.hplno != null && first.hplno !== '' ? `HPL #${first.hplno}` : 'Existing record';
  const isBorrower = summary.roles.includes('customer');
  if (isBorrower) {
    return `Existing customer · ${hpl} (${summary.strength})`;
  }
  return `Already a guarantor · ${hpl} (${summary.strength})`;
}

export function toDeepViewCustomerSeed(match: ExistingCustomerMatch): DeepViewSeedShape {
  return {
    id: match.customerId,
    name: match.customerName,
    hplNumber:
      match.hplno !== null && match.hplno !== undefined && match.hplno !== ''
        ? `HPL ${match.hplno}`
        : undefined,
    vehicleNumber: match.vehicleNumber || undefined,
    riskLevel: match.risk?.riskLevel ?? undefined,
  };
}

export function formatPoliteMatchAnnouncement(
  matches: ExistingCustomerMatch[],
  matchCount: number,
  stepContext: StepCheckContext
): string {
  if (!matches.length) return '';
  const contextLabel = formatStepContextLabel(stepContext);
  const firstHeadline = formatMatchRoleHeadline(matches[0]).primary;
  const countWord = matchCount === 1 ? '1 existing record' : `${matchCount} existing records`;
  return `${contextLabel}: ${countWord}. ${firstHeadline}.`;
}

