// hooks/useVehicleSearch.ts
import { useState, useCallback } from 'react';
import apiClient from '../api/apiClient';

interface VehicleSuggestion {
  id: string;
  vehicle_number: string;
  vehicle_modal: string;
  color: string;
  model_name: string;
  brand: string;
  type: string;
}

export const useVehicleSearch = () => {
  const [suggestions, setSuggestions] = useState<VehicleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchVehicles = useCallback(async (query: string) => {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 1) {
      setSuggestions([]);
      return;
    }
     
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.get(`/vehicles/search/${encodeURIComponent(trimmed)}`);
      setSuggestions(response.data || []);
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        console.warn('Failed to search vehicles:', err?.response?.data?.error || err?.message || err);
        setError(err.response?.data?.error || 'Failed to search vehicles');
      } else {
        setError(null);
      }
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getVehicleById = useCallback(async (vehicleId: string): Promise<VehicleSuggestion | null> => {
    const cleanId = String(vehicleId || '').trim();
    // Valid UUID is 36 chars; valid vehicle registration number is at least 6 alphanumeric chars
    if (!cleanId || cleanId.length < 6) {
      return null;
    }

    try {
      const response = await apiClient.get(`/vehicles/${encodeURIComponent(cleanId)}`);
      const vehicle = response.data;
      if (!vehicle) return null;

      return {
        id: vehicle.id,
        vehicle_number: vehicle.vehicle_number,
        vehicle_modal: vehicle.vehicle_modal,
        color: vehicle.color,
        model_name: vehicle.model_name || '',
        brand: vehicle.brand || '',
        type: vehicle.body_type || vehicle.type || ''
      };
    } catch (err: any) {
      // 404 is normal when typing a new or unrecorded vehicle number
      if (err?.response?.status !== 404) {
        console.warn('Failed to fetch vehicle:', err?.response?.data?.error || err?.message || err);
      }
      return null;
    }
  }, []);

  return {
    suggestions,
    loading,
    error,
    searchVehicles,
    getVehicleById,
    clearSuggestions: () => setSuggestions([])
  };
};