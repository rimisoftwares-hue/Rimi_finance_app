import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StepperNavigation } from './StepperNavigation';
import { Step1CustomerDetails } from './Step1CustomerDetails';
import { Step2ConsuldingLoan } from './Step2ConsultingLoan';
import { Step2VehicleLoan } from './Step2VehicleLoan';
import { Step3GuardianDetails } from './Step3GuardianDetails';
import { LoanTypeToggle, LoanType } from './LoanTypeToggle';
import { useFormStore, VehicleDetails, LoanDetails, initialFormValues } from '../../types/formStore';
import { submitFormData as submitConsultingFormData } from '../lib/api';
import { submitVehicleLoanFormData } from '../lib/vehicle_api';
import { toast } from '../../hooks/use-toast';
import { ChevronLeft, ChevronRight, Send, Loader2 } from 'lucide-react';
import { useOwnerAuth } from '../../contexts/OwnerAuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { AiEntryDialog } from './AiEntryDialog';
import { getOcrConfig, checkVehicleAvailability } from '../../api/ocrApi';
import type { OcrConfig } from '../../types/ocr';
import { buildAtomicApplyPatch, type OcrApplyRequest } from '../../utils/ocrMapper';
import {
  validateCustomerStep,
  validateVehicleLoanStep2,
  validateGuardianStep,
} from '../../utils/validation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface MultiStepLoanEntryFormProps {
  initialType?: LoanType;
}

const defaultVehicleConsulting: Partial<VehicleDetails> = {
  id: '',
  vehicle_info_id: '',
  vehicleNumber: '',
  vehicleName: '',
  modelName: '',
  vehicle_modal: '',
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
  isNewVehicle: false,
  remarks: '',
  variant: '',
  vehiclePhoto: null,
};

const defaultLoanConsulting: Partial<LoanDetails> = {
  loan_type: 'three_wheeler',
  hpAmount: 0,
  hpDate: '',
  due_date: '',
  dueMonth: '',
  interestRate: '',
  penaltyAmount: 0,
  penalty_days: 5,
  principle_part: 0,
  interest_part: 0,
  dueAmount: 0,
  net_payable: 0,
  down_payment: 0,
  pay_mode: 'cash',
  net_payment: 0,
  pay_mode_1: 'online',
  pay_mode_1_amount: 0,
  hand_loan: 0,
  hand_loan_remarks: '',
  broker_name: '',
  dealer_name: '',
  documentation_charge: 0,
  broker_commission: 0,
  remarks: '',
};

const defaultVehicleLoan: Partial<VehicleDetails> = {
  id: '',
  vehicle_info_id: '',
  vehicleNumber: '',
  vehicleName: '',
  modelName: '',
  vehicle_modal: '',
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
  deal_type: 'finance',
  isNewVehicle: false,
  remarks: '',
  variant: '',
  vehiclePhoto: null,
};

const defaultLoanVehicle: Partial<LoanDetails> = {
  loan_type: '',
  hpAmount: 0,
  hpDate: '',
  due_date: '',
  dueMonth: '',
  interestRate: '',
  penaltyAmount: 0,
  penalty_days: 5,
  principle_part: 0,
  interest_part: 0,
  dueAmount: 0,
  net_payable: 0,
  down_payment: 0,
  pay_mode: 'cash',
  net_payment: 0,
  pay_mode_1: 'online',
  pay_mode_1_amount: 0,
  hand_loan: 0,
  hand_loan_remarks: '',
  broker_name: '',
  dealer_name: '',
  documentation_charge: 0,
  broker_commission: 0,
  remarks: '',
};

const hasEnteredStep2Data = (
  type: LoanType,
  v: VehicleDetails,
  l: LoanDetails
): boolean => {
  if (v.vehicleNumber?.trim()) return true;
  if (v.vehicleName?.trim()) return true;
  if (v.brand?.trim()) return true;
  if (v.modelName?.trim() || v.model_name?.trim()) return true;
  if (v.color?.trim()) return true;
  if (v.type?.trim()) return true;
  if (v.engine_number?.trim()) return true;
  if (v.chassis_number?.trim()) return true;
  if (v.vehiclePhoto) return true;
  if (v.remarks?.trim()) return true;

  if (Number(l.hpAmount) > 0) return true;
  if (l.hpDate?.trim()) return true;
  if (l.due_date?.trim()) return true;
  if (l.dueMonth !== '' && l.dueMonth !== 0 && l.dueMonth !== undefined && l.dueMonth !== null) return true;
  if (l.interestRate !== '' && l.interestRate !== 0 && l.interestRate !== undefined && l.interestRate !== null) return true;
  if (Number(l.dueAmount) > 0) return true;
  if (Number(l.down_payment) > 0) return true;
  if (Number(l.net_payment) > 0) return true;
  if (Number(l.net_payable) > 0) return true;
  if (Number(l.hand_loan) > 0) return true;
  if (l.broker_name?.trim()) return true;
  if (l.dealer_name?.trim()) return true;
  if (l.remarks?.trim()) return true;

  if (type === 'consulting') {
    if (l.loan_type && l.loan_type !== 'three_wheeler') return true;
  } else {
    if (l.loan_type && l.loan_type !== '') return true;
  }

  return false;
};

const getOcrDisabledTooltip = (reason?: string): string => {
  switch (reason) {
    case 'OCR_DISABLED':
      return 'AI Scan is not enabled on this server';
    case 'OCR_NOT_PROVISIONED':
    case 'NOT_PROVISIONED':
      return 'AI Scan is not set up on this server';
    case 'NO_API_KEY':
      return 'AI Scan API key is not configured on this server';
    case 'WORKER_DISABLED':
      return 'AI Scan worker is not running on this server';
    case 'MODEL_UNAVAILABLE':
      return 'AI Scan model is currently unavailable on this server';
    default:
      return 'AI Scan is not enabled on this server';
  }
};

export const MultiStepLoanEntryForm: React.FC<MultiStepLoanEntryFormProps> = ({
  initialType = 'consulting',
}) => {
  const [loanType, setLoanType] = useState<LoanType>(initialType);
  const [pendingLoanType, setPendingLoanType] = useState<LoanType | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [ocrConfig, setOcrConfig] = useState<OcrConfig | null>(null);
  const [ocrConfigState, setOcrConfigState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingOcrApply, setPendingOcrApply] = useState<{
    req: OcrApplyRequest;
    fromLoanType: LoanType;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    currentStep,
    completedSteps,
    customer,
    vehicle,
    loan,
    guardian,
    setCurrentStep,
    markStepCompleted,
    updateCustomer,
    updateVehicle,
    updateLoan,
    updateGuardian,
    resetForm,
  } = useFormStore();

  const { owner } = useOwnerAuth();
  const { currentFinance } = useAuth();

  const applyModeDefaults = (targetType: LoanType) => {
    if (targetType === 'consulting') {
      updateVehicle(defaultVehicleConsulting);
      updateLoan(defaultLoanConsulting);
    } else {
      updateVehicle(defaultVehicleLoan);
      updateLoan(defaultLoanVehicle);
    }
    useFormStore.setState((s) => ({
      completedSteps: s.completedSteps.filter((st) => st !== 2),
    }));
    setErrors({});
  };

  // Fresh start on mount, cleanup on unmount
  useEffect(() => {
    resetForm();
    applyModeDefaults(initialType);
    let active = true;
    setOcrConfigState('loading');
    getOcrConfig()
      .then((cfg) => {
        if (!active) return;
        setOcrConfig(cfg);
        setOcrConfigState('ready');
      })
      .catch(() => {
        if (!active) return;
        setOcrConfigState('error');
      });
    return () => {
      active = false;
      resetForm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAiScanClick = async () => {
    if (isSubmitting) return;
    if (ocrConfigState === 'error' || !ocrConfig?.enabled) {
      setOcrConfigState('loading');
      try {
        const cfg = await getOcrConfig();
        setOcrConfig(cfg);
        setOcrConfigState('ready');
        if (cfg.enabled) {
          setIsAiModalOpen(true);
        } else {
          toast({
            variant: 'destructive',
            title: 'AI Scan Unavailable',
            description: getOcrDisabledTooltip(cfg.reason),
          });
        }
      } catch (err: any) {
        setOcrConfigState('error');
        toast({
          variant: 'destructive',
          title: 'AI Scan Unavailable',
          description: err?.message || 'Could not reach AI Scan service. Please try again.',
        });
      }
      return;
    }
    setIsAiModalOpen(true);
  };

  // Atomic OCR apply effect: executes when loanType matches pendingOcrApply.req.targetLoanType
  useEffect(() => {
    if (!pendingOcrApply || pendingOcrApply.req.targetLoanType !== loanType) return;
    const { req, fromLoanType } = pendingOcrApply;
    const storeState = useFormStore.getState();

    const result = buildAtomicApplyPatch(
      {
        customer: storeState.customer,
        vehicle: storeState.vehicle,
        loan: storeState.loan,
        guardian: storeState.guardian,
        completedSteps: storeState.completedSteps,
      },
      fromLoanType,
      req,
      {
        customer: initialFormValues.customer,
        guardian: initialFormValues.guardian,
        vehicle: {
          consulting: defaultVehicleConsulting,
          vehicle: defaultVehicleLoan,
        },
        loan: {
          consulting: defaultLoanConsulting,
          vehicle: defaultLoanVehicle,
        },
      }
    );

    if (Object.keys(result.customerPatch).length > 0) {
      updateCustomer(result.customerPatch);
    }
    if (Object.keys(result.vehiclePatch).length > 0) {
      updateVehicle(result.vehiclePatch);
    }
    if (Object.keys(result.loanPatch).length > 0) {
      updateLoan(result.loanPatch);
    }
    if (Object.keys(result.guardianPatch).length > 0) {
      updateGuardian(result.guardianPatch);
    }
    useFormStore.setState({ completedSteps: result.completedSteps });
    setErrors({});
    setPendingOcrApply(null);

    toast({
      title: 'AI Scan Applied',
      description: 'Extracted fields have been applied to the form. Please review before submitting.',
    });
  }, [pendingOcrApply, loanType, updateCustomer, updateVehicle, updateLoan, updateGuardian]);

  const applyOcrResult = (req: OcrApplyRequest) => {
    setPendingOcrApply({ req, fromLoanType: loanType });
    if (req.targetLoanType !== loanType) {
      setLoanType(req.targetLoanType);
    }
  };

  const handleToggleRequest = (newType: LoanType) => {
    if (newType === loanType || isSubmitting) return;

    if (hasEnteredStep2Data(loanType, vehicle, loan)) {
      setPendingLoanType(newType);
      setShowSwitchConfirm(true);
    } else {
      setLoanType(newType);
      applyModeDefaults(newType);
    }
  };

  const handleConfirmSwitch = () => {
    if (pendingLoanType) {
      setLoanType(pendingLoanType);
      applyModeDefaults(pendingLoanType);
      setPendingLoanType(null);
    }
    setShowSwitchConfirm(false);
  };

  const handleCancelSwitch = () => {
    setPendingLoanType(null);
    setShowSwitchConfirm(false);
  };

  const getStepErrors = (step: number): Record<string, string> => {
    if (step === 1) {
      return validateCustomerStep(customer);
    } else if (step === 2) {
      if (loanType === 'consulting') {
        const newErrors: Record<string, string> = {};
        if (!vehicle.vehicleNumber?.trim()) {
          newErrors['vehicle.vehicleNumber'] = 'Vehicle number is required';
          newErrors.vehicleNumber = 'Vehicle number is required';
        }
        if (!vehicle.vehicleName?.trim()) {
          newErrors['vehicle.vehicleName'] = 'Vehicle name is required';
          newErrors.vehicleName = 'Vehicle name is required';
        }
        if (!loan.loan_type) {
          newErrors['loan.loan_type'] = 'Loan type is required';
          newErrors.loan_type = 'Loan type is required';
        }
        if (!loan.hpAmount) {
          newErrors['loan.hpAmount'] = 'HP amount is required';
          newErrors.hpAmount = 'HP amount is required';
        }
        if (!loan.dueMonth || !String(loan.dueMonth).trim()) {
          newErrors['loan.dueMonth'] = 'Due month is required';
          newErrors.dueMonth = 'Due month is required';
        }
        if (!loan.hpDate) {
          newErrors['loan.hpDate'] = 'HP date is required';
          newErrors.hpDate = 'HP date is required';
        }
        if (!loan.interestRate || !String(loan.interestRate).trim()) {
          newErrors['loan.interestRate'] = 'Interest rate is required';
          newErrors.interestRate = 'Interest rate is required';
        }
        if (!loan.dueAmount) {
          newErrors['loan.dueAmount'] = 'Due amount is required';
          newErrors.dueAmount = 'Due amount is required';
        }
        return newErrors;
      } else {
        return validateVehicleLoanStep2(vehicle, loan, true);
      }
    } else if (step === 3) {
      return validateGuardianStep(guardian);
    }
    return {};
  };

  const validateCurrentStep = (): boolean => {
    const newErrors = getStepErrors(currentStep);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep < currentStep) return true;
    if (targetStep === currentStep) return true;

    for (let i = 1; i < targetStep; i++) {
      if (!completedSteps.includes(i)) return false;
    }
    return true;
  };

  const verifyConsultingVehicleBeforeStep3 = async (): Promise<boolean> => {
    if (loanType !== 'consulting') return true;
    const isDeferred =
      vehicle.isNewVehicle === true ||
      !vehicle.id ||
      String(vehicle.id).startsWith('temp_');
    if (!isDeferred || !vehicle.vehicleNumber?.trim()) return true;

    try {
      const avail = await checkVehicleAvailability(
        vehicle.vehicleNumber,
        vehicle.engine_number,
        vehicle.chassis_number
      );
      if (avail.state === 'in_use') {
        const msg = 'Vehicle is already sold or linked to another customer';
        setErrors({ 'vehicle.vehicleNumber': msg, vehicleNumber: msg });
        toast({ variant: 'destructive', title: 'Vehicle Unavailable', description: msg });
        return false;
      }
      if (avail.state === 'unavailable') {
        const msg = 'Registration number belongs to another record';
        setErrors({ 'vehicle.vehicleNumber': msg, vehicleNumber: msg });
        toast({ variant: 'destructive', title: 'Vehicle Unavailable', description: msg });
        return false;
      }
      if (avail.conflicts && avail.conflicts.length > 0) {
        const msg = `Conflict on ${avail.conflicts.join(' & ')} with an existing vehicle`;
        setErrors({ 'vehicle.vehicleNumber': msg, vehicleNumber: msg });
        toast({ variant: 'destructive', title: 'Vehicle Conflict', description: msg });
        return false;
      }
      if (avail.state === 'available' && avail.vehicleId) {
        updateVehicle({ id: avail.vehicleId, isNewVehicle: false });
      }
      return true;
    } catch {
      // Do not block navigation if availability check network call fails; backend enforces inside transaction
      return true;
    }
  };

  const handleStepClick = async (step: number) => {
    if (step < currentStep) {
      setCurrentStep(step);
      setErrors({});
    } else if (step > currentStep && canNavigateToStep(step)) {
      if (validateCurrentStep()) {
        if (currentStep === 2 && !(await verifyConsultingVehicleBeforeStep3())) {
          return;
        }
        markStepCompleted(currentStep);
        setCurrentStep(step);
        setErrors({});
      }
    }
  };

  const handleNext = async () => {
    const stepErrors = getStepErrors(currentStep);
    if (Object.keys(stepErrors).length === 0) {
      if (currentStep === 2 && !(await verifyConsultingVehicleBeforeStep3())) {
        return;
      }
      markStepCompleted(currentStep);
      setCurrentStep(currentStep + 1);
      setErrors({});
    } else {
      setErrors(stepErrors);
      const uniqueMessages = Array.from(new Set(Object.values(stepErrors)));
      const desc =
        uniqueMessages.length > 0
          ? uniqueMessages.slice(0, 3).join(', ') +
            (uniqueMessages.length > 3 ? ` (+${uniqueMessages.length - 3} more)` : '')
          : 'Please fill in all required fields correctly.';
      toast({
        variant: 'destructive',
        title: 'Validation Error',
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

    if (
      Object.keys(errs1).length > 0 ||
      Object.keys(errs2).length > 0 ||
      Object.keys(errs3).length > 0
    ) {
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
      const allUnique = Array.from(
        new Set([...Object.values(errs1), ...Object.values(errs2), ...Object.values(errs3)])
      );
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description:
          allUnique.slice(0, 3).join(', ') +
            (allUnique.length > 3 ? ` (+${allUnique.length - 3} more)` : '') ||
          'Please fill in all required fields correctly before submitting.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const guardianWithHplno = {
        ...guardian,
        customer_hplno: customer.hplno,
      };

      const financeId = currentFinance?.id ? String(currentFinance.id) : (owner?.id ? String(owner.id) : undefined);

      let result;
      if (loanType === 'consulting') {
        result = await submitConsultingFormData({
          customer,
          vehicle,
          loan,
          guardian: guardianWithHplno,
          financeId,
        });
      } else {
        result = await submitVehicleLoanFormData({
          customer,
          vehicle,
          loan,
          guardian: guardianWithHplno,
          financeId,
        });
      }

      if (result.success) {
        markStepCompleted(3);
        toast({
          title: 'Success!',
          description: result.message || 'Customer added successfully!',
        });
        resetForm();
        applyModeDefaults(loanType);
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
      {/* Top Bar: Stepper on Left, Loan Type Switcher on Right (No Header Title Text) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6 pb-2 border-b border-border/40">
        <div className="flex-1 min-w-0">
          <StepperNavigation
            align="left"
            onStepClick={handleStepClick}
            canNavigateToStep={canNavigateToStep}
          />
        </div>
        <div className="flex items-center gap-2.5 justify-end shrink-0 self-end lg:self-center">
          {!(ocrConfigState === 'ready' && ocrConfig?.enabled === false) && (
            <button
              type="button"
              disabled={isSubmitting || ocrConfigState === 'loading'}
              onClick={handleAiScanClick}
              className="h-9 px-3.5 rounded-xl border border-border bg-background hover:bg-muted/80 text-foreground text-xs font-medium shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={
                ocrConfigState === 'loading'
                  ? 'Checking AI Scan availability...'
                  : 'Scan ledger card using AI'
              }
            >
              AI Scan
            </button>
          )}
          <LoanTypeToggle
            value={loanType}
            onChange={handleToggleRequest}
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {currentStep === 1 && <Step1CustomerDetails errors={errors} />}

        {currentStep === 2 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={loanType}
              initial={{ opacity: 0, x: loanType === 'vehicle' ? 8 : -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: loanType === 'vehicle' ? -8 : 8 }}
              transition={{ duration: 0.15 }}
            >
              {loanType === 'consulting' ? (
                <Step2ConsuldingLoan errors={errors} allowAddNewVehicle={true} />
              ) : (
                <Step2VehicleLoan errors={errors} />
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {currentStep === 3 && <Step3GuardianDetails errors={errors} />}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center pt-3 mt-4 border-t border-border shrink-0">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {currentStep < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-4"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-success flex items-center gap-1.5 text-sm py-2 px-4"
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

      {/* Step 2 Discard Confirmation Dialog */}
      <AlertDialog open={showSwitchConfirm} onOpenChange={setShowSwitchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Loan Type?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching loan type will clear any data entered in Step 2 (Vehicle & Loan). Customer (Step 1) and Guardian (Step 3) details will be preserved. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelSwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSwitch}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Ledger Scan Dialog */}
      <AiEntryDialog
        open={isAiModalOpen}
        onOpenChange={setIsAiModalOpen}
        activeLoanType={loanType}
        ocrConfig={ocrConfig}
        onApply={applyOcrResult}
      />
    </div>
  );
};

