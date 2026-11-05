/**
 * areaAllocation.ts
 * Type definitions for Agent Area Allocation module.
 */

export interface AllocatedArea {
  id?: string;
  city: string;
  village: string;
  street: string;
  district?: string;
  is_primary?: boolean;
}

export interface AreaAgent {
  id: string;
  name: string;
  phone: string;
  areas: AllocatedArea[];
  totalCustomers: number;
  activeAssignments: number;
  unpaidCustomers?: number;
}

export interface AvailableArea {
  city: string;
  district: string;
  village: string;
  street: string;
  customerCount: number;
  unpaidCount: number;
  allocatedAgents: {
    id: string;
    name: string;
  }[];
}

export interface AssignableAgent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  staff_code?: string;
}

export interface SaveAllocationPayload {
  agentId: string;
  areas: {
    city: string;
    district?: string;
    village?: string;
    street: string;
    is_primary?: boolean;
  }[];
}

export interface AreaAllocationApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

