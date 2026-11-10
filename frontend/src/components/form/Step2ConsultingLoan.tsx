import { useEffect, useState, useRef } from 'react';
import { TextInput } from './TextInput';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { SelectInput } from './SelectInput';
import { AutocompleteInput } from './AutocompleteInput'; // Add this import
import { DatePickerInput } from './DatePickerInput';
import { AddConsultingVehicleDialog } from './AddConsultingVehicleDialog';
import { useFormStore } from '../../types/formStore';
import { Car, CreditCard, Wallet, FileText, Users, MessageSquare, Check } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { useVehicleSearch } from '../../hooks/useVehicleSearch'; // Add this import
import { calculateLoanDetails } from '../../utils/calculations'
interface Step2Props {
  errors: Record<string, string>;
  allowAddNewVehicle?: boolean;
}

const loan_type = [
  { value: '', label: 'Select Loan Type' },
  { value: 'refinance', label: 'Refinance' },
  { value: 'two_wheeler', label: 'Two Wheeler' },
  { value: 'four_wheeler', label: 'Four Wheeler' },
  { value: 'three_wheeler', label: 'Three Wheeler' },
  { value: 'rc_book_loan', label: 'RC Book' },
  { value: 'duplicate_rc_loan', label: 'Duplicate RC Book' },
  { value: 'insurance_loan', label: 'Insurance Loan' },
  { value: 'noc_loan', label: 'NOC loan' },
  { value: 'document_security', label: 'Document Security' },
  { value: 'vehicle_security', label: 'Vehicle Security' },
  { value: 'guarantor_security', label: 'Guarantor Security' },
];

const paymode_type = [
  { value: '', label: 'Select Mode' },
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export const Step2ConsuldingLoan: React.FC<Step2Props> = ({ errors, allowAddNewVehicle = false }) => {
  const { vehicle, loan, updateVehicle, updateLoan } = useFormStore();
  const { suggestions, loading, error, searchVehicles, getVehicleById, clearSuggestions } = useVehicleSearch();
  const [isVehicleSelected, setIsVehicleSelected] = useState(!!vehicle.isNewVehicle || !!vehicle.id);
  const [yearlyInterestRate, setYearlyInterestRate] = useState<string>('');
  const [isDueDateModified, setIsDueDateModified] = useState<boolean>(false);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [pendingVehicleQuery, setPendingVehicleQuery] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVehicleSelected(!!vehicle.isNewVehicle || !!vehicle.id);
  }, [vehicle.id, vehicle.isNewVehicle]);

  // Set default values on component mount
  useEffect(() => {
    // Set default loan_type to three_wheeler if not already set
    if (!loan.loan_type) {
      updateLoan({ loan_type: 'three_wheeler' });
    }
  }, []);

  // Synchronize yearly interest rate display with loaded loan interest rate
  useEffect(() => {
    if (loan.interestRate !== undefined && loan.interestRate !== null && String(loan.interestRate).trim() !== '') {
      const monthlyRate = parseFloat(String(loan.interestRate));
      if (!isNaN(monthlyRate) && monthlyRate >= 0) {
        setYearlyInterestRate((monthlyRate * 12).toFixed(1));
      } else {
        setYearlyInterestRate('');
      }
    } else {
      setYearlyInterestRate('');
    }
  }, [loan.interestRate]);

  // Auto-calculate net_payment when down_payment or pay_mode_1_amount changes
  useEffect(() => {
    const downPayment = Number(loan.down_payment) || 0;
    const payMode1Amount = Number(loan.pay_mode_1_amount) || 0;
    const calculatedNetPayment = downPayment + payMode1Amount;

    if (calculatedNetPayment !== loan.net_payment) {
      updateLoan({ net_payment: calculatedNetPayment });
    }
  }, [loan.down_payment, loan.pay_mode_1_amount]);

  // Auto-calculate net_payable when dueAmount or dueMonth changes
  useEffect(() => {
    const dueAmount = Number(loan.dueAmount) || 0;
    const dueMonth = Number(loan.dueMonth) || 0;
    const calculatedNetPayable = dueAmount * dueMonth;

    if (dueAmount > 0 && dueMonth > 0 && calculatedNetPayable !== loan.net_payable) {
      updateLoan({ net_payable: calculatedNetPayable });
    }
  }, [loan.dueAmount, loan.dueMonth]);

  // Main calculation function
  const calculateLoanValues = (hpAmount: number, interestRate: number | string, dueMonth: number | string) => {
    const principal = Number(hpAmount) || 0;
    const rate = typeof interestRate === 'string' ? parseFloat(interestRate) : interestRate || 0;
    const months = typeof dueMonth === 'string' ? parseInt(dueMonth) : dueMonth || 0;

    if (!principal || !rate || !months) return;

    const calculated = calculateLoanDetails(principal, rate, months);
    if (calculated) {
      // Calculate net_payable = due_amount * due_month
      const netPayable = calculated.dueAmount * months;

      updateLoan({
        dueAmount: calculated.dueAmount,
        principle_part: calculated.principlePart,
        interest_part: calculated.interestPart,
        net_payable: netPayable,
      });
    }
  };

  // Handle HP amount change with calculation
  const handleHpAmountChange = (value: number) => {
    updateLoan({ hpAmount: value });
    calculateLoanValues(value, loan.interestRate, loan.dueMonth);
  };

  // Handle Due Amount change - recalculate interest_part, interest_rate, and net_payable
  const handleDueAmountChange = (value: number) => {
    const dueAmount = Number(value) || 0;
    const principlePart = Number(loan.principle_part) || 0;
    const hpAmount = Number(loan.hpAmount) || 0;
    const dueMonth = Number(loan.dueMonth) || 0;

    // Calculate interest_part
    const newInterestPart = dueAmount - principlePart;

    // Calculate net_payable = due_amount * due_month
    const netPayable = dueAmount * dueMonth;

    // Recalculate interest rate based on new due amount
    // Formula: interest = (dueAmount - principal) / principal / months * 100
    let newInterestRate = loan.interestRate;
    if (hpAmount > 0 && dueMonth > 0) {
      const totalInterest = newInterestPart;
      const monthlyInterestRate = (totalInterest / hpAmount) * 100;
      newInterestRate = monthlyInterestRate.toFixed(1);

      // Update yearly interest rate display
      const yearlyRate = monthlyInterestRate * 12;
      setYearlyInterestRate(yearlyRate.toFixed(1));
    }

    updateLoan({
      dueAmount: dueAmount,
      interest_part: newInterestPart >= 0 ? newInterestPart : 0,
      interestRate: newInterestRate,
      net_payable: netPayable
    });
  };


  // Handle monthly interest rate change
  const handleMonthlyInterestChange = (value: string) => {
    const monthlyRate = parseFloat(value) || 0;
    updateLoan({ interestRate: value });

    // Calculate yearly interest (monthly * 12)
    const yearlyRate = monthlyRate * 12;
    setYearlyInterestRate(yearlyRate.toFixed(1));

    calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
  };

  // Handle due month change
  const handleDueMonthChange = (value: string) => {
    const months = parseInt(value) || 0;
    updateLoan({ dueMonth: value });
    calculateLoanValues(loan.hpAmount, loan.interestRate, months);

    // Also update net_payable
    const dueAmount = Number(loan.dueAmount) || 0;
    if (dueAmount > 0 && months > 0) {
      updateLoan({ net_payable: dueAmount * months });
    }
  };

  // Format number with Indian locale
  const formatIndianNumber = (num: number | string): string => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(value) ? '' : value.toLocaleString('en-IN');
  };

  // Handle vehicle number input with search suggestions
  const handleVehicleNumberChange = async (value: string) => {
    updateVehicle({
      vehicleNumber: value.toUpperCase(),
      isNewVehicle: false,
    });

    // Only search if length is at least 2 characters
    if (value.trim().length >= 2) {
      searchVehicles(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && formRef.current) {
      const target = e.target as HTMLElement;

      // Only trigger navigation if currently in a text input
      if (target.tagName === 'INPUT' && target.getAttribute('type') !== 'file') {
        e.preventDefault();

        // Get only text inputs (not file inputs)
        const textInputs = formRef.current.querySelectorAll(
          'input[type="text"]:not([disabled]), input[type="number"]:not([disabled]), input:not([type]):not([disabled]), input[inputmode="numeric"]:not([disabled])'
        );

        const currentIndex = Array.from(textInputs).indexOf(target);

        if (currentIndex > -1 && currentIndex < textInputs.length - 1) {
          (textInputs[currentIndex + 1] as HTMLElement).focus();
        }
      }
    }
  };

  // When a vehicle is selected from suggestions or created from dialog
  const handleVehicleSelect = async (selectedVehicle: any) => {
    if (selectedVehicle) {
      // Update all vehicle fields from the selected vehicle
      updateVehicle({
        vehicleNumber: selectedVehicle.vehicle_number || '',
        vehicleName: selectedVehicle.brand ? `${selectedVehicle.brand} ${selectedVehicle.model_name || ''}`.trim() : (selectedVehicle.vehicleName || ''),
        modelName: selectedVehicle.model_name || selectedVehicle.vehicle_modal || selectedVehicle.modelName || '',
        vehicle_modal: selectedVehicle.vehicle_modal || '',
        type: selectedVehicle.type || '',
        color: selectedVehicle.color || '',
        id: selectedVehicle.id,
        isNewVehicle: !!selectedVehicle.isNewVehicle,
        deal_type: 'consulting',
        chassis_number: selectedVehicle.chassis_number || '',
        engine_number: selectedVehicle.engine_number || '',
        insurance_expiry_date: selectedVehicle.insurance_expiry_date || '',
        base_price: selectedVehicle.base_price !== undefined ? selectedVehicle.base_price : 0,
        selling_price: selectedVehicle.selling_price !== undefined ? selectedVehicle.selling_price : 0,
        rc_status: selectedVehicle.rc_status || 'original',
        rc_holder: selectedVehicle.rc_holder || 'Company',
        vehicle_info_id: selectedVehicle.vehicle_info_id || '',
        brand: selectedVehicle.brand || '',
        model_name: selectedVehicle.model_name || '',
        frontImage: selectedVehicle.frontImage,
        sideImage: selectedVehicle.sideImage,
      });
      setIsVehicleSelected(true);
    }
  };

  // If user manually changes a field, mark as not auto-selected (unless it is a new deferred vehicle)
  const handleManualFieldChange = (field: keyof typeof vehicle, value: string) => {
    if (field === 'modelName') {
      updateVehicle({ modelName: value, model_name: value });
    } else {
      updateVehicle({ [field]: value });
    }
    if (isVehicleSelected && !vehicle.isNewVehicle) {
      setIsVehicleSelected(false);
    }
  };

  // Load vehicle details if vehicleNumber is in store (e.g. existing customer edit) but other fields are empty
  useEffect(() => {
    const cleanNumber = String(vehicle.vehicleNumber || '').trim();
    // Valid vehicle registration number has at least 6 alphanumeric characters
    if (!cleanNumber || cleanNumber.length < 6 || vehicle.isNewVehicle || vehicle.id?.startsWith('temp_')) {
      return;
    }

    // Skip if core fields are already filled
    if (vehicle.vehicleName && vehicle.modelName && vehicle.type) {
      return;
    }

    const timer = setTimeout(async () => {
      const vehicleData = await getVehicleById(cleanNumber);
      if (vehicleData) {
        updateVehicle({
          id: vehicleData.id,
          vehicleName: vehicleData.brand || '',
          modelName: vehicleData.model_name || vehicleData.vehicle_modal || '',
          type: vehicleData.type || '',
          color: vehicleData.color || ''
        });
        setIsVehicleSelected(true);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [vehicle.vehicleNumber]);

  // Handle HP Date change - auto-set due_date if not manually modified
  const handleHpDateChange = (value: string) => {
    updateLoan({ hpDate: value });

    // If due_date hasn't been manually modified, set it to match hpDate
    if (!isDueDateModified && value) {
      updateLoan({ due_date: value });
    }
  };

  // Handle Due Date change - mark as manually modified
  const handleDueDateChange = (value: string) => {
    updateLoan({ due_date: value });
    setIsDueDateModified(true);
  };

  // Reset due_date modification flag if hpDate changes to match due_date
  useEffect(() => {
    if (loan.hpDate && loan.due_date && loan.hpDate === loan.due_date) {
      setIsDueDateModified(false);
    }
  }, [loan.hpDate, loan.due_date]);

  return (
    <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-3 gap-3" >
      {/* Vehicle Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Car className="w-4 h-4 text-primary" />
          Vehicle Details
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <AutocompleteInput
            label="Vehicle Number *"
            value={vehicle.vehicleNumber}
            onChange={handleVehicleNumberChange}
            onSelect={handleVehicleSelect}
            suggestions={suggestions}
            loading={loading}
            error={errors['vehicle.vehicleNumber'] || errors.vehicleNumber || (error ? error.toString() : undefined)}
            placeholder="MH12AB1234"
            required
            containerClassName="col-span-2"
            onAddNew={allowAddNewVehicle ? (query) => {
              setPendingVehicleQuery(query);
              setIsAddVehicleOpen(true);
            } : undefined}
            addNewText="+ Add Vehicle"
          />

          {isVehicleSelected && (
            <div className="col-span-2 mb-2 p-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded text-sm flex items-center justify-between">
              <div className="flex items-center text-green-700 dark:text-green-300">
                <Check className="w-4 h-4 mr-2" />
                {vehicle.isNewVehicle ? 'New vehicle details added (will be saved with loan)' : 'Vehicle details auto-filled from database'}
              </div>
              {vehicle.isNewVehicle && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  New
                </span>
              )}
            </div>
          )}

          <CapitalizedInput
            casing="words"
            label="Vehicle Name *"
            value={vehicle.vehicleName}
            onChange={(e) => handleManualFieldChange('vehicleName', e.target.value)}
            error={errors['vehicle.vehicleName'] || errors.vehicleName}
            placeholder="Honda Activa"
            required
          />
          <CapitalizedInput
            casing="words"
            label="Model"
            value={vehicle.modelName}
            onChange={(e) => handleManualFieldChange('modelName', e.target.value)}
            error={errors['vehicle.modelName'] || errors.modelName}
            placeholder="6G DLX"
          />
          <CapitalizedInput
            casing="words"
            label="Color"
            value={vehicle.color}
            onChange={(e) => handleManualFieldChange('color', e.target.value)}
            placeholder="Enter Colour"
            error={errors['vehicle.color'] || errors.color}
          />
          <CapitalizedInput
            casing="words"
            label="Type *"
            value={vehicle.type}
            onChange={(e) => handleManualFieldChange('type', e.target.value)}
            error={errors['vehicle.type'] || errors.type}
            placeholder="Types Bike, Car, Scooter etc.."
            required
          />
        </div>
      </section>



      {/* Loan Details */}
      <section className="form-section lg:col-span-2">
        <h3 className="form-section-title">
          <Wallet className="w-4 h-4 text-primary" />
          Payment Details
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <SelectInput
            label="Pay Mode *"
            value={loan.pay_mode}
            onChange={(e) => updateLoan({ pay_mode: e.target.value as any })}
            options={paymode_type}
            error={errors['loan.pay_mode'] || errors.pay_mode}
            required
          />
          <TextInput
            label="Down Payment (₹)"
            value={formatIndianNumber(loan.down_payment)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ down_payment: parseFloat(value) || 0 });
            }}
            error={errors['loan.down_payment'] || errors.down_payment}
            placeholder="Amount"
            type="text"
          />

          <SelectInput
            label="Pay Mode 1"
            value={loan.pay_mode_1}
            onChange={(e) => updateLoan({ pay_mode_1: e.target.value as any })}
            options={paymode_type}
            error={errors['loan.pay_mode_1'] || errors.pay_mode_1}
          />
          <TextInput
            label="Pay Mode Amt 1(₹)"
            value={formatIndianNumber(loan.pay_mode_1_amount)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ pay_mode_1_amount: parseFloat(value) || 0 });
            }}
            error={errors['loan.pay_mode_1_amount'] || errors.pay_mode_1_amount}
            placeholder="Amount"
            type="text"
          />
          <TextInput
            label="Net Payment (₹)"
            value={formatIndianNumber(loan.net_payment)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ net_payment: parseFloat(value) || 0 });
            }}
            error={errors['loan.net_payment'] || errors.net_payment}
            placeholder="Amount"
            type="text"
            readOnly
          />
        </div>
        <h3 className="form-section-title mt-4">
          <CreditCard className="w-4 h-4 text-primary" />
          Loan Details
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <SelectInput
            label="Loan Type *"
            value={loan.loan_type}
            onChange={(e) => updateLoan({ loan_type: e.target.value as any })}
            options={loan_type}
            error={errors['loan.loan_type'] || errors.loan_type}
            required
          />
          <TextInput
            label="HP Amount (₹) *"
            value={formatIndianNumber(loan.hpAmount)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              const numValue = parseFloat(value) || 0;
              handleHpAmountChange(numValue);
            }}
            error={errors['loan.hpAmount'] || errors.hpAmount}
            placeholder="Amount"
            type="text"
            required
          />
          <DatePickerInput
            label="HP Date *"
            value={loan.hpDate}
            onChange={(val) => handleHpDateChange(val)}
            error={errors['loan.hpDate'] || errors.hpDate}
            required
          />
          <DatePickerInput
            label="Due Date"
            value={loan.due_date}
            onChange={(val) => handleDueDateChange(val)}
            error={errors['loan.due_date'] || errors.due_date}
          />
          <TextInput
            label="Due Month *"
            value={loan.dueMonth}
            onChange={(e) => handleDueMonthChange(e.target.value)}
            error={errors['loan.dueMonth'] || errors.dueMonth}
            type="number"
            placeholder="Number of months"
            required
          />

          <div className="grid grid-cols-2 gap-2">
            <TextInput
              label="Penalty (₹)"
              value={formatIndianNumber(loan.penaltyAmount)}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, '');
                updateLoan({ penaltyAmount: parseFloat(value) || 0 });
              }}
              error={errors['loan.penaltyAmount'] || errors.penaltyAmount}
              placeholder="Amount"
              type="text"
            />
            <TextInput
              label="Penalty Days"
              value={formatIndianNumber(loan.penalty_days)}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, '');
                updateLoan({ penalty_days: parseFloat(value) || 0 });
              }}
              error={errors['loan.penalty_days'] || errors.penalty_days}
              placeholder="Amount"
              type="text"
            />
          </div>
          <div className="col-span-2 flex gap-2">
            <TextInput
              label="Interest M(%) *"
              value={loan.interestRate}
              onChange={(e) => handleMonthlyInterestChange(e.target.value)}
              error={errors['loan.interestRate'] || errors.interestRate}
              placeholder="Monthly Rate"
              type="number"
              step="0.1"
              required
            />
            <TextInput
              label="Interest Y(%) *"
              value={yearlyInterestRate}
              onChange={(e) => {
                const yearlyRate = parseFloat(e.target.value) || 0;
                const monthlyRate = yearlyRate / 12;
                setYearlyInterestRate(e.target.value);
                updateLoan({ interestRate: monthlyRate.toFixed(1) });
                calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
              }}
              error={errors['loan.interestRate'] || errors.interestRate}
              placeholder="Yearly Rate"
              type="number"
              step="0.1"
              required
            />
          </div>
          <TextInput
            label="Principle (₹)"
            value={formatIndianNumber(loan.principle_part)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ principle_part: parseFloat(value) || 0 });
            }}
            error={errors['loan.principle_part'] || errors.principle_part}
            placeholder="Amount"
            type="text"
            readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
          />

          <TextInput
            label="Interest Part (₹)"
            value={formatIndianNumber(loan.interest_part)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ interest_part: parseFloat(value) || 0 });
            }}
            error={errors['loan.interest_part'] || errors.interest_part}
            placeholder="Amount"
            type="text"
            readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
          />
          <TextInput
            label="Due Amount (₹) *"
            value={formatIndianNumber(loan.dueAmount)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              const numValue = parseFloat(value) || 0;
              handleDueAmountChange(numValue);
            }}
            error={errors['loan.dueAmount'] || errors.dueAmount}
            placeholder="Amount"
            type="text"
            required
          />
          <TextInput
            label="Net Payable (₹)"
            value={formatIndianNumber(loan.net_payable)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ net_payable: parseFloat(value) || 0 });
            }}
            error={errors['loan.net_payable'] || errors.net_payable}
            placeholder="Amount"
            type="text"
            readOnly
          />

        </div>
      </section>

      {/* Charges & Hand Loan */}
      <section className="form-section">
        <h3 className="form-section-title">
          <FileText className="w-4 h-4 text-primary" />
          Charges & Hand Loan
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            label="Hand Loan (₹)"
            value={formatIndianNumber(loan.hand_loan)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ hand_loan: parseFloat(value) || 0 });
            }}
            error={errors['loan.hand_loan'] || errors.hand_loan}
            placeholder="Amount"
            type="text"
          />
          <TextInput
            label="Doc Charge (₹)"
            value={formatIndianNumber(loan.documentation_charge)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ documentation_charge: parseFloat(value) || 0 });
            }}
            error={errors['loan.documentation_charge'] || errors.documentation_charge}
            placeholder="Amount"
            type="text"
          />

          <div className="col-span-2">
            <label className="input-label">Hand Loan Remarks</label>
            <Textarea
              value={loan.hand_loan_remarks}
              onChange={(e) => updateLoan({ hand_loan_remarks: e.target.value })}

              placeholder="Remarks for hand loan"
              className="input-field min-h-[50px] resize-none"
            />
          </div>
        </div>
      </section>

      {/* Third-Party Information */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Users className="w-4 h-4 text-primary" />
          Third-Party Info
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <CapitalizedInput
            casing="words"
            label="Broker Name"
            value={loan.broker_name}
            onChange={(e) => updateLoan({ broker_name: e.target.value })}
            error={errors['loan.broker_name'] || errors.broker_name}
            placeholder="Broker name"
          />
          <CapitalizedInput
            casing="words"
            label="Dealer Name"
            value={loan.dealer_name}
            onChange={(e) => updateLoan({ dealer_name: e.target.value })}
            error={errors['loan.dealer_name'] || errors.dealer_name}
            placeholder="Dealer name"
          />
          <TextInput
            label="Broker Comm (₹)"
            value={formatIndianNumber(loan.broker_commission)}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, '');
              updateLoan({ broker_commission: parseFloat(value) || 0 });
            }}
            error={errors['loan.broker_commission'] || errors.broker_commission}
            placeholder="Amount"
            type="text"
          />
        </div>
      </section>

      {/* Remarks */}
      <section className="form-section">
        <h3 className="form-section-title">
          <MessageSquare className="w-4 h-4 text-primary" />
          Remarks
        </h3>
        <div>
          <label className="input-label">Additional Remarks</label>
          <Textarea
            value={loan.remarks}
            onChange={(e) => updateLoan({ remarks: e.target.value })}

            placeholder="Any additional notes or comments"
            className="input-field min-h-[60px] resize-none"
          />
        </div>
      </section>

      {allowAddNewVehicle && (
        <AddConsultingVehicleDialog
          open={isAddVehicleOpen}
          onOpenChange={setIsAddVehicleOpen}
          initialVehicleNumber={pendingVehicleQuery || vehicle.vehicleNumber || ''}
          onVehicleCreated={(newVehicle) => {
            handleVehicleSelect(newVehicle);
            clearSuggestions();
          }}
        />
      )}
    </div>
  );
};