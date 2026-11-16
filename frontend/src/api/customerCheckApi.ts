/**
 * customerCheckApi.ts
 *
 * API client & types for POST /api/customers/check-existing.
 * Sends identifiers ONLY in the JSON POST body (never in URLs or query strings).
 */

import apiClient from './apiClient';
import type { CreditBand, RiskLevel } from './riskApi';

export type IdentityMatchField = 'phone' | 'aadhar' | 'other_govt_id';
export type IdentityEntityRole = 'customer' | 'guardian';
export type IdentityMatchStrength = 'strong' | 'possible';

export interface ExistingCustomerCheckRequest {
  phones?: string[];
  aadhar?: string;
  otherGovtIdType?: string;
  otherGovtIdNumber?: string;
  excludeCustomerId?: string;
}

export interface ExistingCustomerMatchedField {
  field: IdentityMatchField;
  maskedValue: string;
  entityRole: IdentityEntityRole;
  entityName: string | null;
  strength: IdentityMatchStrength;
  govtIdType?: string | null;
  matchedInputIndex?: number;
}

export interface ExistingCustomerGuardianSummary {
  id: string | null;
  name: string | null;
  relationLabel: string | null;
  maskedAadhar: string | null;
}

export interface ExistingCustomerLoanSummary {
  hpAmount: number;
  totalLoan: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueDays: number;
  hasSeizure: boolean;
}

export interface ExistingCustomerRiskSummary {
  creditScore: number;
  creditBand: CreditBand;
  dueRiskScore: number;
  riskLevel: RiskLevel;
}

export interface ExistingCustomerMatch {
  customerId: string;
  hplno: number | string | null;
  customerName: string;
  borrowerName: string;
  relationLabel: string | null;
  loanStatus: string | null;
  hasLoan: boolean;
  loanType: string | null;
  vehicleNumber: string | null;
  vehicleName: string | null;
  primaryPhone: string | null;
  address: string | null;
  matchedRoles: IdentityEntityRole[];
  matchedFields: ExistingCustomerMatchedField[];
  guardianSummary: ExistingCustomerGuardianSummary | null;
  loanSummary: ExistingCustomerLoanSummary | null;
  risk: ExistingCustomerRiskSummary | null;
}

export interface ExistingCustomerCheckResponse {
  success: boolean;
  found: boolean;
  matchCount: number;
  highestRiskLevel?: RiskLevel | null;
  overallCreditScore?: number | null;
  overallCreditBand?: CreditBand | null;
  matches: ExistingCustomerMatch[];
}

/**
 * Checks whether personal phone(s), Aadhaar, or other govt ID already exist
 * among customers or guardians in the active finance company.
 */
export async function fetchExistingCustomerCheck(
  body: ExistingCustomerCheckRequest,
  signal?: AbortSignal
): Promise<ExistingCustomerCheckResponse> {
  const response = await apiClient.post<ExistingCustomerCheckResponse>(
    '/customers/check-existing',
    body,
    { signal }
  );
  return response.data;
}
