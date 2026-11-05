/**
 * agentAssignmentApi.ts
 * API helpers for customer-agent assignment module using apiClient.
 */

import apiClient from './apiClient';
import {
  AssignableCustomersFilterParams,
  CustomersListResponse,
  AgentsResponse,
  AssignCustomersPayload,
  AssignCustomersResponse,
  RunSheetResponse,
  AssignmentHistoryFilterParams,
  AssignmentHistoryResponse,
  AssignmentBatchDetailsResponse,
} from '../types/agentAssignment';

/**
 * Fetches unpaid customers eligible for agent assignment with filters & search
 */
export const fetchAssignableCustomers = async (
  params?: AssignableCustomersFilterParams,
  signal?: AbortSignal
): Promise<CustomersListResponse> => {
  const response = await apiClient.get<CustomersListResponse>(
    '/agent-assignments/customers',
    { params, signal }
  );
  return response.data;
};

/**
 * Fetches active agents with their current assignment workloads
 */
export const fetchAgentsWorkload = async (
  signal?: AbortSignal
): Promise<AgentsResponse> => {
  const response = await apiClient.get<AgentsResponse>(
    '/agent-assignments/agents',
    { signal }
  );
  return response.data;
};

/**
 * Bulk assigns customers to an agent
 */
export const assignCustomers = async (
  payload: AssignCustomersPayload
): Promise<AssignCustomersResponse> => {
  const response = await apiClient.post<AssignCustomersResponse>(
    '/agent-assignments/assign',
    payload
  );
  return response.data;
};

/**
 * Fetches printable run-sheet data for a specific agent
 */
export const fetchRunSheet = async (
  agentId: string,
  signal?: AbortSignal
): Promise<RunSheetResponse> => {
  const response = await apiClient.get<RunSheetResponse>(
    `/agent-assignments/agents/${agentId}/run-sheet`,
    { signal }
  );
  return response.data;
};

/**
 * Fetches batch assignment history and summary KPIs
 */
export const fetchAssignmentHistory = async (
  params?: AssignmentHistoryFilterParams,
  signal?: AbortSignal
): Promise<AssignmentHistoryResponse> => {
  const response = await apiClient.get<AssignmentHistoryResponse>(
    '/agent-assignments/history',
    { params, signal }
  );
  return response.data;
};

/**
 * Fetches details for a specific batch assignment
 */
export const fetchAssignmentHistoryDetails = async (
  params: {
    agentId: string;
    date: string;
    targetDate?: string | null;
    assignedBy?: string | null;
  },
  signal?: AbortSignal
): Promise<AssignmentBatchDetailsResponse> => {
  const { agentId, date, targetDate, assignedBy } = params;
  const response = await apiClient.get<AssignmentBatchDetailsResponse>(
    `/agent-assignments/history/${agentId}/details`,
    {
      params: {
        date,
        targetDate: targetDate || undefined,
        assignedBy: assignedBy || undefined,
      },
      signal,
    }
  );
  return response.data;
};


