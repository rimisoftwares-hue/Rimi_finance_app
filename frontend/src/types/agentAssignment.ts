/**
 * agentAssignment.ts
 * Type definitions for customer-agent assignment, agent workloads, and field run-sheets.
 */

export type RiskLevel = 'low' | 'medium' | 'high';
export type AssignmentPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AssignmentStatus = 'pending' | 'visited' | 'collected' | 'failed' | 'reassigned';

export interface AssignableCustomer {
  customerId: string;
  loanId: string;
  hplNo: string;
  hplRaw?: number | string;
  name: string;
  phone: string;
  vehicleNumber: string;
  vehicleName: string;
  area: string;
  street: string;
  village: string;
  city: string;
  broker: string;
  hpDate: string;
  balance: number;
  overdueDays: number;
  riskLevel: RiskLevel;
  currentAgentId: string | null;
  currentAgentName: string | null;
  currentPriority: AssignmentPriority | null;
  assignmentStatus: AssignmentStatus | null;
  loanStatus?: string;
}

export interface CustomersListResponse {
  success: boolean;
  data: AssignableCustomer[];
  total: number;
  error?: string;
}

export interface AgentWorkload {
  id: string;
  name: string;
  phone: string;
  area: string;
  assignedCount: number;
  pendingCount: number;
}

export interface AgentsResponse {
  success: boolean;
  data: AgentWorkload[];
  error?: string;
}

export interface AssignCustomersPayload {
  customerIds: string[];
  agentId: string;
  priority: AssignmentPriority;
  targetDate?: string;
  notes?: string;
}

export interface AssignSkippedItem {
  customerId: string;
  reason: string;
}

export interface AssignCustomersResponse {
  success: boolean;
  assignedCount: number;
  skipped: AssignSkippedItem[];
  reassignedFromOthers: number;
  error?: string;
}

export interface RunSheetRow {
  sNo: number;
  customerId: string;
  hplNo: string;
  hplRaw?: number | string;
  customerName: string;
  phone: string;
  vehicleNumber: string;
  vehicleModel: string;
  fullAddress: string;
  city: string;
  village: string;
  street: string;
  balance: number;
  overdueDays: number;
  priority: string;
  targetDate: string;
  notes: string;
}

export interface RunSheetFinance {
  name: string;
  address: string;
  phones: string[];
}

export interface RunSheetAgent {
  id: string;
  name: string;
  phone: string;
  area: string;
}

export interface RunSheetTotals {
  customersCount: number;
  totalBalance: number;
}

export interface RunSheetData {
  finance: RunSheetFinance;
  agent: RunSheetAgent;
  printedAt: string;
  totals: RunSheetTotals;
  rows: RunSheetRow[];
}

export interface RunSheetResponse {
  success: boolean;
  data: RunSheetData;
  error?: string;
}

export interface AssignableCustomersFilterParams {
  search?: string;
  city?: string;
  street?: string;
  village?: string;
  broker?: string;
  vehicleType?: string;
  hpDateFrom?: string;
  hpDateTo?: string;
  dueDaysMin?: string | number;
  dueDaysMax?: string | number;
  dueAmountMin?: string | number;
  dueAmountMax?: string | number;
  riskLevel?: 'all' | 'low' | 'medium' | 'high';
  assignment?: 'all' | 'assigned' | 'unassigned';
  limit?: number;
  offset?: number;
}

// ─── Assignment History & Batch Types ──────────────────────────────────────────
export type EffectiveStatus =
  | 'pending'
  | 'visited'
  | 'collected'
  | 'partial'
  | 'failed'
  | 'reassigned'
  | 'seized';

export interface AssignmentHistoryKpis {
  totalAssignments: number;
  pendingCount: number;
  collectedCount: number;
  seizedCount: number;
}

export interface AssignmentBatch {
  agentId: string;
  assignedDate: string;
  targetDate: string | null;
  assignedBy: string | null;
  assignedByName: string;
  agentName: string;
  agentPhone: string;
  allocatedAreas: string[];
  customerCount: number;
  seizedCount: number;
  targetDueAmount: number;
  collectedDueAmount: number;
  penaltyCollected: number;
  batchStatus: EffectiveStatus;
}

export interface AssignmentHistoryData {
  kpis: AssignmentHistoryKpis;
  batches: AssignmentBatch[];
}

export interface AssignmentHistoryResponse {
  success: boolean;
  data: AssignmentHistoryData;
  error?: string;
}

export interface AssignmentHistoryFilterParams {
  dateFrom?: string;
  dateTo?: string;
  agentId?: string;
}

export interface BatchDetailCustomer {
  assignmentId: string;
  customerId: string;
  hplno: number | string;
  customerName: string;
  phone: string;
  customerAddress: string;
  vehicleNumber: string;
  vehicleModel: string;
  targetDue: number;
  collectedAmount: number;
  penaltyAmount: number;
  lastPaymentDate: string | null;
  assignmentStatus: AssignmentStatus;
  effectiveStatus: EffectiveStatus;
  priority: AssignmentPriority;
  notes: string;
  isSeized: boolean;
  seizingDate: string | null;
  seizedBy: string | null;
  seizingCharge: number | null;
}

export interface AssignmentBatchDetails {
  agent: {
    id: string;
    name: string;
    phone: string;
    allocatedAreas: string[];
  };
  assignmentMeta: {
    assignedDate: string;
    targetDate: string | null;
    assignedByName: string;
  };
  totals: {
    customerCount: number;
    targetDue: number;
    collectedAmount: number;
    penaltyAmount: number;
    seizedCount: number;
  };
  customers: BatchDetailCustomer[];
}

export interface AssignmentBatchDetailsResponse {
  success: boolean;
  data: AssignmentBatchDetails;
  error?: string;
}


