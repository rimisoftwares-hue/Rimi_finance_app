import { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { Vehicle } from '../types/vehicle';
import { useToast } from './use-toast';

// ─── helpers used by HostVehicleDialog ───────────────────────────────────────

export interface MediaAsset {
  path: string;
  url: string;
}

/**
 * Upload files to the backend vehicle-images / vehicle-videos endpoint.
 * The bucket param maps to the upload route (e.g. "vehicle-images").
 */
export async function uploadVehicleFiles(
  bucket: string,
  files: File[]
): Promise<MediaAsset[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));

  const res = await apiClient.post(`/upload/${bucket}`, formData);

  // Backend should return [{ path, url }]
  return res.data as MediaAsset[];
}

/**
 * Persist a host record for a vehicle.
 */
export async function saveHostRecord(payload: Record<string, unknown>): Promise<void> {
  await apiClient.post('/vehicles/host-records', payload);
}

/**
 * React-Query–style mutation hook for updating a vehicle.
 * Returns a { mutateAsync } object so HostVehicleDialog can call it directly.
 */
export function useUpdateVehicle() {
  const { toast } = useToast();

  const mutateAsync = async ({
    id,
    ...patch
  }: { id: string } & Partial<Vehicle>): Promise<Vehicle> => {
    const res = await apiClient.put(`/vehicles/${id}`, patch);

    toast({ title: 'Success', description: 'Vehicle updated successfully!' });
    return res.data as Vehicle;
  };

  return { mutateAsync };
}

// ─── main hook ────────────────────────────────────────────────────────────────

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchVehicles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get('/vehicles');

      const vehiclesWithDefaults = response.data.map((vehicle: any) => ({
        ...vehicle,
        total_expenses: vehicle.total_expenses || 0,
      }));

      setVehicles(vehiclesWithDefaults);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch vehicles';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getVehicleById = (id: string): Vehicle | undefined => {
    return vehicles.find((vehicle) => vehicle.id === id);
  };

  const toggleHostStatus = async (vehicleId: string) => {
    try {
      const response = await apiClient.put(`/vehicles/${vehicleId}/host-toggle`);

      const result = response.data;

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicleId
            ? { ...v, status: result.newStatus }
            : v
        )
      );

      return result;
    } catch (error) {
      console.error('Error toggling host status:', error);
      throw error;
    }
  };

  const updateVehicleStatus = async (
    vehicleId: string,
    status: Vehicle['status'],
    sellingDate?: string
  ) => {
    try {
      await apiClient.put(`/vehicles/${vehicleId}/status`, {
        status,
        selling_date: sellingDate,
      });

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicleId ? { ...v, status, selling_date: sellingDate } : v
        )
      );

      toast({
        title: 'Success',
        description: 'Vehicle status updated successfully!',
      });
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || 'Failed to update vehicle status';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  return {
    vehicles,
    isLoading,
    error,
    getVehicleById,
    toggleHostStatus,
    updateVehicleStatus,
    refetch: fetchVehicles,
  };
}