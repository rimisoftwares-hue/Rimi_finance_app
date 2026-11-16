import React, { useState, useEffect } from 'react';
import { StepperNavigation } from './StepperNavigation';
import { Step1CustomerDetails } from './Step1CustomerDetails';
import { Step2ConsuldingLoan } from './Step2ConsultingLoan';
import { Step2VehicleLoan } from './Step2VehicleLoan';
import { Step3GuardianDetails } from './Step3GuardianDetails';
import { useFormStore } from '../../types/formStore';
import { toast } from '../../hooks/use-toast';
import { ChevronLeft, ChevronRight, Save, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { useOwnerAuth } from '../../contexts/OwnerAuthContext';
import { useAuth } from '../../contexts/AuthContext';

import { normalizeCustomerData } from '../../utils/normalizeCustomer';
import {
  validateCustomerStep,
  validateVehicleLoanStep2,
  validateGuardianStep,
} from '../../utils/validation';

interface MultiStepFormEditProps {
  initialData: any;
  onSubmit: (formData: any) => void;
  isSubmitting: boolean;
}

export const MultiStepFormEdit: React.FC<MultiStepFormEditProps> = ({
  initialData,
  onSubmit,
  isSubmitting,
}) => {
  const {
    currentStep,
    completedSteps,
    customer,
    vehicle,
    loan,
    guardian,
    setCurrentStep,
    markStepCompleted,
    resetForm,
    updateCustomer,
    updateVehicle,
    updateLoan,
    updateGuardian,
  } = useFormStore();

  const { owner } = useOwnerAuth();
  const { currentFinance } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [loadedCustomerId, setLoadedCustomerId] = useState<string | null>(null);
  const [dealType, setDealType] = useState<'consulting' | 'finance'>('finance');

  // Reset form store on unmount to prevent state leakage to other pages
  useEffect(() => {
    return () => {
      resetForm();
    };
  }, [resetForm]);

  // Initialize or re-synchronize form when customer identity changes or new initialData arrives
  useEffect(() => {
    if (!initialData || !initialData.customer) return;

    const currentCustomerId = String(initialData.customer.id || initialData.customer.hplno || '');
    if (!currentCustomerId) return;

    // Only re-initialize if this is a newly loaded customer or form not yet initialized
    if (currentCustomerId !== loadedCustomerId) {
      // 1. Reset any stale state from previous customer
      resetForm();

      // 2. Safe normalization of incoming data (handles camelCase and snake_case)
      const normalized = normalizeCustomerData(initialData);

      // 3. Set deal type
      setDealType(normalized.dealType);

      // 4. Populate Zustand store
      updateCustomer(normalized.customer);

      if (normalized.guardian) {
        updateGuardian(normalized.guardian);
      }

      updateLoan(normalized.loan);

      if (normalized.vehicle) {
        updateVehicle(normalized.vehicle);
      }

      // 5. Store snapshot for pristine change tracking
      const pristineSnapshot = {
        customer: normalized.customer,
        guardian: normalized.guardian || {
          customer_hplno: normalized.customer.hplno,
          gname: '',
          gphoto: null,
          gpropertyPhoto: null,
          gcontacts: [],
          gfname: { value: '', unit: 'S/O' },
          aadhar_id: '',
          other_govt_id_type: 'pan_card',
          other_govt_id_number: '',
          profession: '',
          work_office_address: '',
          work_office_phone: '',
          current_vehicle_id: '',
          remarks: '',
          gaddress: {
            house_no: '',
            street: '',
            street_name: '',
            village: '',
            land_mark: '',
            address: '',
            city: '',
            district: '',
            state: '',
            pincode: '',
            location: ''
          }
        },
        loan: normalized.loan,
        vehicle: normalized.vehicle || {
          id: '',
          vehicle_info_id: '',
          vehicleNumber: '',
          vehicleName: '',
          modelName: '',
          color: '',
          type: '',
          selling_price: 0,
          engine_number: '',
          chassis_number: '',
          base_price: 0,
          emi_from: 0,
          rc_holder: 'Company',
          rc_status: 'original',
          brand: '',
          model_name: '',
          fuel_type: 'petrol',
          deal_type: 'consulting',
          remarks: '',
          variant: '',
          vehiclePhoto: null
        },
      };

      setInitialFormData(pristineSnapshot);
      setLoadedCustomerId(currentCustomerId);
      setHasChanges(false);
      setErrors({});

      // Mark all steps completed since this is an edit of an existing record
      markStepCompleted(1);
      markStepCompleted(2);
      markStepCompleted(3);
    }
  }, [
    initialData,
    loadedCustomerId,
    resetForm,
    updateCustomer,
    updateGuardian,
    updateLoan,
    updateVehicle,
    markStepCompleted,
  ]);

  // Check for changes
  useEffect(() => {
    if (initialFormData) {
      const currentFormData = {
        customer,
        guardian,
        loan,
        vehicle,
      };

      // Simple deep comparison
      const hasChanged = JSON.stringify(currentFormData) !== JSON.stringify(initialFormData);
      setHasChanges(hasChanged);
    }
  }, [customer, guardian, loan, vehicle, initialFormData]);

  const validateStep1 = (): boolean => {
    const newErrors = validateCustomerStep(customer);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors = validateVehicleLoanStep2(vehicle, loan, dealType === 'finance');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = (): boolean => {
    const newErrors = validateGuardianStep(guardian);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1:
        return validateStep1();
      case 2:
        return validateStep2();
      case 3:
        return validateStep3();
      default:
        return false;
    }
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep < currentStep) return true;
    if (targetStep === currentStep) return true;
    
    // Can only go to next step if all previous steps are completed
    for (let i = 1; i < targetStep; i++) {
      if (!completedSteps.includes(i)) return false;
    }
    return true;
  };

  const handleStepClick = (step: number) => {
    if (step < currentStep) {
      setCurrentStep(step);
      setErrors({});
    } else if (step > currentStep && canNavigateToStep(step)) {
      if (validateCurrentStep()) {
        markStepCompleted(currentStep);
        setCurrentStep(step);
        setErrors({});
      } else {
        toast({
          variant: 'destructive',
          title: `Step ${currentStep} Validation Error`,
          description: 'Please fill in all required fields correctly.',
        });
      }
    }
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      markStepCompleted(currentStep);
      setCurrentStep(currentStep + 1);
      setErrors({});
    } else {
      toast({
        variant: 'destructive',
        title: `Step ${currentStep} Validation Error`,
        description: 'Please fill in all required fields correctly.',
      });
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setErrors({});
  };

  const handleSubmit = () => {
    const errs1 = validateCustomerStep(customer);
    const errs2 = validateVehicleLoanStep2(vehicle, loan, dealType === 'finance');
    const errs3 = validateGuardianStep(guardian);

    if (Object.keys(errs1).length > 0 || Object.keys(errs2).length > 0 || Object.keys(errs3).length > 0) {
      if (Object.keys(errs1).length > 0) {
        setCurrentStep(1);
        setErrors(errs1);
      } else if (Object.keys(errs2).length > 0) {
        setCurrentStep(2);
        setErrors(errs2);
      } else {
        setCurrentStep(3);
        setErrors(errs3);
      }
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fill in all required fields correctly before submitting.",
      });
      return;
    }


    // Set guardian's customer_hplno
    const guardianWithHplno = {
      ...guardian,
      customer_hplno: customer.hplno
    };

    const hasVehicle = vehicle && (vehicle.id || vehicle.vehicleNumber?.trim() || vehicle.brand?.trim());

    // Prepare the form data
    const formData = {
      customer,
      guardian: guardianWithHplno,
      loan,
      vehicle: hasVehicle ? vehicle : null,
      financeId: currentFinance?.id ?? owner?.id
    };

    // Call the parent's submit handler
    onSubmit(formData);
  };

  if (!initialFormData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading form data...</span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      {/* Header with status */}
      <div className="mb-3 flex items-center justify-between px-4 pt-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Edit Customer Details</h2>
          <p className="text-sm text-muted-foreground">
            Update customer information • {dealType === 'consulting' ? 'Consulting Loan' : 'Vehicle Loan'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Unsaved Changes
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              No Changes
            </span>
          )}
        </div>
      </div>

      <div className="px-4">
        <StepperNavigation
          onStepClick={handleStepClick}
          canNavigateToStep={canNavigateToStep}
        />
      </div>

      <div className="flex-1 overflow-auto min-h-0 px-4 py-2">
        {currentStep === 1 && (
          <Step1CustomerDetails
            errors={errors}
            excludeCustomerId={customer.id || initialData?.customer?.id}
          />
        )}
        {currentStep === 2 && (
          dealType === 'consulting' 
            ? <Step2ConsuldingLoan errors={errors} />
            : <Step2VehicleLoan errors={errors} />
        )}
        {currentStep === 3 && (
          <Step3GuardianDetails
            errors={errors}
            excludeCustomerId={customer.id || initialData?.customer?.id}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center px-4 pt-3 pb-4 border-t border-border shrink-0">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="flex items-center gap-1.5 text-sm py-2 px-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>

        {currentStep < 3 ? (
          <Button
            onClick={handleNext}
            className="flex items-center gap-1.5 text-sm py-2 px-4"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasChanges}
            className="flex items-center gap-1.5 text-sm py-2 px-4 bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </Button>
        )}
      </div>

      {/* Change Indicator */}
      {hasChanges && (
        <div className="mx-4 mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Unsaved Changes</h3>
              <div className="mt-1 text-sm text-yellow-700">
                <p>You have made changes. Don't forget to save before leaving.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};