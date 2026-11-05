/**
 * areaAllocationApi.ts
 * API service helper functions for Agent Area Allocation.
 */

import apiClient from './apiClient';
import {
  AreaAgent,
  AvailableArea,
  AssignableAgent,
  SaveAllocationPayload,
  AreaAllocationApiResponse,
} from '../types/areaAllocation';

/**
 * Fetch all agents with allocated areas and customer metrics
 */
export const fetchAllocatedAgents = async (
  signal?: AbortSignal
): Promise<AreaAllocationApiResponse<AreaAgent[]>> => {
  const response = await apiClient.get<AreaAllocationApiResponse<AreaAgent[]>>(
    '/agents/area-allocations',
    { signal }
  );
  return response.data;
};

/**
 * Fetch active agents for assignment dropdown selector
 */
export const fetchAssignableAgents = async (
  signal?: AbortSignal
): Promise<AreaAllocationApiResponse<AssignableAgent[]>> => {
  const response = await apiClient.get<AreaAllocationApiResponse<AssignableAgent[]>>(
    '/agents/area-allocations/agents',
    { signal }
  );
  return response.data;
};

/**
 * Fetch distinct customer current address areas with overlap metadata
 */
export const fetchAvailableAreas = async (
  signal?: AbortSignal
): Promise<AreaAllocationApiResponse<AvailableArea[]>> => {
  const response = await apiClient.get<AreaAllocationApiResponse<AvailableArea[]>>(
    '/agents/area-allocations/available-areas',
    { signal }
  );
  return response.data;
};

/**
 * Save or replace area allocations for an agent (Owner only)
 */
export const saveAgentAllocations = async (
  payload: SaveAllocationPayload
): Promise<AreaAllocationApiResponse<{ agentId: string; allocatedCount: number }>> => {
  const response = await apiClient.post<AreaAllocationApiResponse<{ agentId: string; allocatedCount: number }>>(
    '/agents/area-allocations',
    payload
  );
  return response.data;
};

/**
 * Delete all area allocations for an agent (Owner only)
 */
export const deleteAgentAllocations = async (
  agentId: string
): Promise<AreaAllocationApiResponse<{ deletedCount: number }>> => {
  const response = await apiClient.delete<AreaAllocationApiResponse<{ deletedCount: number }>>(
    `/agents/area-allocations/agent/${agentId}`
  );
  return response.data;
};

