import { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { Vehicle, CreateVehicleRequest } from '../types/vehicle';
import { useToast } from './use-toast';

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
      
      // Map the response to ensure total_expenses is included
      const vehiclesWithExpenses = response.data.map((vehicle: any) => ({
        ...vehicle,
        total_expenses: vehicle.total_expenses || 0,
        price: parseFloat(vehicle.price) || 0,
      }));
      setVehicles(vehiclesWithExpenses);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch vehicles';
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

  const createVehicle = async (vehicleData: CreateVehicleRequest): Promise<Vehicle> => {
    try {
      const formData = new FormData();

      // Add all vehicle data fields
      if (vehicleData.vehicle_info_id) {
        formData.append('vehicle_info_id', String(vehicleData.vehicle_info_id));
      }
      formData.append('vehicle_name', vehicleData.vehicle_name);
      formData.append('vehicle_number', vehicleData.vehicle_number);
      formData.append('vehicle_modal', vehicleData.vehicle_modal);
      formData.append('chassis_number', vehicleData.chassis_number);
      formData.append('engine_number', vehicleData.engine_number || '');
      formData.append('num_owner', vehicleData.num_owner.toString());
      formData.append('trip_driven', vehicleData.trip_driven.toString());
      formData.append('color', vehicleData.color);
      formData.append('variant', vehicleData.variant || '');
      formData.append('selling_price', vehicleData.selling_price.toString());
      formData.append('emi_from', vehicleData.emi_from.toString());
      formData.append('base_price', vehicleData.base_price.toString());
      formData.append('final_price', vehicleData.final_price.toString());
      formData.append('status', vehicleData.status);
      formData.append('created_date', vehicleData.created_date);
      formData.append('selling_date', vehicleData.selling_date || '');
      formData.append('hosting_info', vehicleData.hosting_info || '');
      formData.append('monthly_income_data', vehicleData.monthly_income_data || '');
      formData.append('deal_type', vehicleData.deal_type || 'consulting');
      formData.append('rc_holder', vehicleData.rc_holder || 'Company');
      formData.append('rc_status', vehicleData.rc_status || 'original');
      formData.append('insurance_expiry_date', vehicleData.insurance_expriry_date || '');
      formData.append('remarks', vehicleData.remarks || '');

      // Add images with correct field names
      if (vehicleData.images?.front) {
        formData.append('front', vehicleData.images.front);
      }
      if (vehicleData.images?.side) {
        formData.append('side', vehicleData.images.side);
      }

      if (vehicleData.images.back) {
        formData.append('back', vehicleData.images.back);
      }
      if (vehicleData.images.interior) {
        formData.append('interior', vehicleData.images.interior);
      }
      if (vehicleData.images.additional && vehicleData.images.additional.length > 0) {
        vehicleData.images.additional.forEach((file) => {
          formData.append('additional', file);
        });
      }

      const response = await apiClient.post('/vehicles', formData);

      const newVehicle = {
        ...response.data,
        total_expenses: response.data.total_expenses || 0,
      };

      // Update local state
      setVehicles(prev => [newVehicle, ...prev]);

      toast({
        title: 'Success',
        description: 'Vehicle added successfully!',
      });

      return newVehicle;
    } catch (err: any) {
      console.error('Error creating vehicle:', err.response?.data || err.message);
      const errorMessage = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to create vehicle';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const toggleHostStatus = async (vehicleId: string) => {
    try {
      const response = await apiClient.put(`/vehicles/${vehicleId}/host-toggle`);

      const result = response.data;

      // Update local state
      setVehicles(prevVehicles =>
        prevVehicles.map(vehicle =>
          vehicle.id === vehicleId
            ? {
              ...vehicle,
              status: result.newStatus,
              total_expenses: vehicle.total_expenses || 0
            }
            : vehicle
        )
      );

      return result;
    } catch (error) {
      console.error('Error toggling host status:', error);
      throw error;
    }
  };

  const getVehicleById = (id: string): Vehicle | undefined => {
    return vehicles.find(vehicle => vehicle.id === id);
  };

  const updateVehicleStatus = async (vehicleId: string, status: Vehicle['status'], sellingDate?: string) => {
    try {
      await apiClient.put(`/vehicles/${vehicleId}/status`, {
        status,
        selling_date: sellingDate
      });

      setVehicles(prev =>
        prev.map(vehicle =>
          vehicle.id === vehicleId
            ? {
              ...vehicle,
              status,
              selling_date: sellingDate,
              total_expenses: vehicle.total_expenses || 0
            }
            : vehicle
        )
      );

      toast({
        title: 'Success',
        description: 'Vehicle status updated successfully!',
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update vehicle status';
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
    createVehicle,
    getVehicleById,
    toggleHostStatus,
    updateVehicleStatus,
    refetch: fetchVehicles,
  };
}