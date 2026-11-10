import apiClient from '../../api/apiClient';
import type { CustomerDetails, VehicleDetails, LoanDetails, GuardianDetails } from '../../types/formStore';

export interface SubmitFormDataParams {
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
 * Submits the customer multi-step form data (customer, vehicle, loan, guardian)
 * along with uploaded photo files via multipart/form-data to POST /customers.
 */
export const submitFormData = async (params: SubmitFormDataParams): Promise<SubmitFormResponse> => {
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
    if (vehicle.frontImage instanceof File) {
      formData.append('frontImage', vehicle.frontImage);
      delete (vehicleData as any).frontImage;
    }
    if (vehicle.sideImage instanceof File) {
      formData.append('sideImage', vehicle.sideImage);
      delete (vehicleData as any).sideImage;
    }

    formData.append('customer', JSON.stringify(customerData));
    formData.append('guardian', JSON.stringify(guardianData));
    formData.append('loan', JSON.stringify(loan));
    formData.append('vehicle', JSON.stringify(vehicleData));

    const response = await apiClient.post('/customers', formData);

    return {
      success: response.data?.success ?? true,
      message: response.data?.message || 'Customer added successfully!',
      data: response.data,
    };
  } catch (error: any) {
    console.error('Error submitting form data:', error);
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Failed to submit form';
    return {
      success: false,
      message,
      error: message,
    };
  }
};
