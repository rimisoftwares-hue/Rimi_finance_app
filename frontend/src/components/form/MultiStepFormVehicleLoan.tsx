import { useState, useEffect } from 'react';
import { StepperNavigation } from './StepperNavigation';
import { Step1CustomerDetails } from './Step1CustomerDetails';
import { Step2VehicleLoan } from './Step2VehicleLoan';
import { Step3GuardianDetails } from './Step3GuardianDetails';
import { useFormStore } from '../../types/formStore';
import { submitFormData } from '../lib/vehicle_api';
import { toast } from '../../hooks/use-toast';
import { ChevronLeft, ChevronRight, Send, Loader2 } from 'lucide-react';
import { useOwnerAuth } from '../../contexts/OwnerAuthContext';
import {
  validateCustomerStep,
  validateVehicleLoanStep2,
  validateGuardianStep,
} from '../../utils/validation';

export const MultiStepForm: React.FC = () => {
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
  } = useFormStore();

  const { owner } = useOwnerAuth();

  useEffect(() => {
    return () => {
      resetForm();
    };
  }, [resetForm]);

  // Reset form when component mounts (fresh start)
  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateStep1 = (): boolean => {
    const newErrors = validateCustomerStep(customer);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getStepErrors = (step: number): Record<string, string> => {
    if (step === 1) {
      return validateCustomerStep(customer);
    } else if (step === 2) {
      return validateVehicleLoanStep2(vehicle, loan, true);
    } else if (step === 3) {
      return validateGuardianStep(guardian);
    }
    return {};
  };

  const validateStep2 = (): boolean => {
    const newErrors = getStepErrors(2);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = (): boolean => {
    const newErrors = getStepErrors(3);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateCurrentStep = (): boolean => {
    const newErrors = getStepErrors(currentStep);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
      }
    }
  };

  const handleNext = () => {
    const stepErrors = getStepErrors(currentStep);
    if (Object.keys(stepErrors).length === 0) {
      markStepCompleted(currentStep);
      setCurrentStep(currentStep + 1);
      setErrors({});
    } else {
      setErrors(stepErrors);
      const uniqueMessages = Array.from(new Set(Object.values(stepErrors)));
      const desc = uniqueMessages.length > 0
        ? uniqueMessages.slice(0, 3).join(', ') + (uniqueMessages.length > 3 ? ` (+${uniqueMessages.length - 3} more)` : '')
        : 'Please fill in all required fields correctly.';
      toast({
        variant: 'destructive',
        title: `Validation Error`,
        description: desc,
      });
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setErrors({});
  };

  const handleSubmit = async () => {
    const errs1 = getStepErrors(1);
    const errs2 = getStepErrors(2);
    const errs3 = getStepErrors(3);

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
      const allUnique = Array.from(new Set([...Object.values(errs1), ...Object.values(errs2), ...Object.values(errs3)]));
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: allUnique.slice(0, 3).join(', ') + (allUnique.length > 3 ? ` (+${allUnique.length - 3} more)` : '') || 'Please fill in all required fields correctly before submitting.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Set guardian's customer_hplno
      const guardianWithHplno = {
        ...guardian,
        customer_hplno: customer.hplno
      };

      const result = await submitFormData({ 
        customer, 
        vehicle, 
        loan, 
        guardian: guardianWithHplno,
        financeId: Number(owner?.id)
      });
      
      if (result.success) {
        markStepCompleted(3);
        toast({
          title: 'Success!',
          description: result.message || 'Customer added successfully!',
        });
        resetForm();
        setCurrentStep(1);
      } else {
        toast({
          variant: 'destructive',
          title: 'Submission Failed',
          description: result.message || 'Failed to submit form. Please try again.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'An error occurred while submitting the form.',
      });
    } finally {
      setIsSubmitting(false);
    } 
  };

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      <StepperNavigation
        onStepClick={handleStepClick}
        canNavigateToStep={canNavigateToStep}
      />

      <div className="min-h-[500px]">
        {currentStep === 1 && <Step1CustomerDetails errors={errors} />}
        {currentStep === 2 && <Step2VehicleLoan errors={errors} />}
        {currentStep === 3 && <Step3GuardianDetails errors={errors} />}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t border-border">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {currentStep < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="btn-primary flex items-center gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-success flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};