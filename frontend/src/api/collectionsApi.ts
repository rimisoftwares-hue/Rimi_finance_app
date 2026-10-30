// src/api/collectionsApi.ts
import apiClient from './apiClient';
import {
  PendingCollectionsFilterParams,
  PendingCollectionsResponse,
} from '../types/pendingCollections';

/**
 * Fetches pending collections data from the PostgreSQL database via /api/customers/pending-collections
 */
export const fetchPendingCollections = async (
  params?: PendingCollectionsFilterParams
): Promise<PendingCollectionsResponse> => {
  const response = await apiClient.get<PendingCollectionsResponse>(
    '/customers/pending-collections',
    { params }
  );
  return response.data;
};