import apiClient from '../../api/apiClient';
import type { CustomerDetails, VehicleDetails, LoanDetails, GuardianDetails } from '../../types/formStore';
export * from './api';

export interface SubmitVehicleLoanFormDataParams {
  customer: CustomerDetails;
  vehicle: VehicleDetails;
  loan: LoanDetails;
  guardian: GuardianDetails;
  financeId?: number | string;
}

export interface SubmitFormResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

/**
 * Submits the vehicle loan multi-step form data (customer, vehicle, loan, guardian)
 * along with uploaded photo files via multipart/form-data to POST /customers/vehicleLoan.
 */
export const submitVehicleLoanFormData = async (
  params: SubmitVehicleLoanFormDataParams
): Promise<SubmitFormResponse> => {
  try {
    const { customer, vehicle, loan, guardian } = params;
    const formData = new FormData();

    // Clone data to avoid mutating store state
    const customerData = { ...customer };
    const guardianData = { ...guardian };
    const vehicleData = { ...vehicle };

    // Append file instances to FormData and strip File objects from JSON payloads
    if (customer.cphoto instanceof File) {
      formData.append('customerPhoto', customer.cphoto);
      delete (customerData as any).cphoto;
    }
    if (customer.cvehiclePhoto instanceof File) {
      formData.append('customerVehiclePhoto', customer.cvehiclePhoto);
      delete (customerData as any).cvehiclePhoto;
    }
    if (customer.cpropertyPhoto instanceof File) {
      formData.append('customerPropertyPhoto', customer.cpropertyPhoto);
      delete (customerData as any).cpropertyPhoto;
    }

    if (guardian.gphoto instanceof File) {
      formData.append('guardianPhoto', guardian.gphoto);
      delete (guardianData as any).gphoto;
    }
    if (guardian.gpropertyPhoto instanceof File) {
      formData.append('guardianPropertyPhoto', guardian.gpropertyPhoto);
      delete (guardianData as any).gpropertyPhoto;
    }

    if (vehicle.vehiclePhoto instanceof File) {
      formData.append('vehiclePhoto', vehicle.vehiclePhoto);
      delete (vehicleData as any).vehiclePhoto;
    }

    if (vehicleData.vehicle_info_id !== undefined) {
      vehicleData.vehicle_info_id = vehicleData.vehicle_info_id?.trim() || null;
    }

    formData.append('customer', JSON.stringify(customerData));
    formData.append('guardian', JSON.stringify(guardianData));
    formData.append('loan', JSON.stringify(loan));
    formData.append('vehicle', JSON.stringify(vehicleData));

    const response = await apiClient.post('/customers/vehicleLoan', formData);

    return {
      success: response.data?.success ?? true,
      message: response.data?.message || 'Vehicle loan customer created successfully!',
      data: response.data,
    };
  } catch (error: any) {
    console.error('Error submitting vehicle loan form data:', error);
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Failed to submit vehicle loan form';
    return {
      success: false,
      message,
      error: message,
    };
  }
};

// Default export alias for drop-in compatibility
export const submitFormData = submitVehicleLoanFormData;
