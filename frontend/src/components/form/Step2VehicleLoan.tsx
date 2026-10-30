// import {useState} from 'react';
// import { TextInput } from './TextInput';
// import { SelectInput } from './SelectInput';
// import { useFormStore } from '../../types/formStore';
// import { Car, CreditCard, Wallet, FileText, Users, MessageSquare } from 'lucide-react';
// import { Textarea } from '../ui/textarea';
// import {calculateLoanDetails} from '../../utils/calculations'

// interface Step2Props {
//   errors: Record<string, string>;
// }

// const loan_type = [
//   { value: '', label: 'Select Loan Type' },
//   { value: 'refinance', label: 'Refinance' },
//   { value: 'two_wheeler', label: 'Two Wheeler' },
//   { value: 'four_wheeler', label: 'Four Wheeler' },
//   { value: 'three_wheeler', label: 'Three Wheeler' },
//   { value: 'rc_book_loan', label: 'RC Book' },
//   { value: 'duplicate_rc_loan', label: 'Duplicate RC Book' },
//   { value: 'insurance_loan', label: 'Insurance Loan' },
//   { value: 'noc_loan', label: 'NOC loan' },
//   { value: 'document_security', label: 'Document Security' },
//   { value: 'vehicle_security', label: 'Vehicle Security' },
//   { value: 'guarantor_security', label: 'Guarantor Security' },
// ];

// const vehicleTypes = [
//   { value: '', label: 'Select Type' },
//   { value: 'two_wheeler', label: 'Two Wheeler' },
//   { value: 'three_wheeler', label: 'Three Wheeler' },
//   { value: 'four_wheeler', label: 'Four Wheeler' },
//   { value: 'heavy_vehicle', label: 'Heavy Vehicle' },
//   { value: 'commercial', label: 'Commercial Vehicle' },
// ];

// const colorOptions = [
//   { value: '', label: 'Select Color' },
//   { value: 'white', label: 'White' },
//   { value: 'black', label: 'Black' },
//   { value: 'silver', label: 'Silver' },
//   { value: 'red', label: 'Red' },
//   { value: 'blue', label: 'Blue' },
//   { value: 'grey', label: 'Grey' },
//   { value: 'green', label: 'Green' },
//   { value: 'other', label: 'Other' },
// ];

// const paymode_type = [
//   { value: '', label: 'Select Mode' },
//   { value: 'cash', label: 'Cash' },
//   { value: 'online', label: 'Online' },
//   { value: 'bank', label: 'Bank' },
//   { value: 'upi', label: 'UPI' },
//   { value: 'cheque', label: 'Cheque' },
//   { value: 'other', label: 'Other' },
// ];

// export const Step2VehicleLoan: React.FC<Step2Props> = ({ errors }) => {
//   const { vehicle, loan, updateVehicle, updateLoan } = useFormStore();
//   const [yearlyInterestRate, setYearlyInterestRate] = useState<string>('');
//   const [isDueDateModified, setIsDueDateModified] = useState<boolean>(false);


//   const calculateLoanValues = (hpAmount: number, interestRate: number | string, dueMonth: number | string) => {
//       const principal = Number(hpAmount) || 0;
//       const rate = typeof interestRate === 'string' ? parseFloat(interestRate) : interestRate || 0;
//       const months = typeof dueMonth === 'string' ? parseInt(dueMonth) : dueMonth || 0;
  
//       if (!principal || !rate || !months) return;
  
//       const calculated = calculateLoanDetails(principal, rate, months);
//       if (calculated) {
//         updateLoan({
//           dueAmount: calculated.dueAmount,
//           principle_part: calculated.principlePart,
//           interest_part: calculated.interestPart,
//           net_payable : calculated.net_payable,
//         });
//       }
//     };
//     // Format number with Indian locale
//   const formatIndianNumber = (num: number | string): string => {
//     const value = typeof num === 'string' ? parseFloat(num) : num;
//     return isNaN(value) ? '' : value.toLocaleString('en-IN');
//   };

//     // Handle HP amount change with calculation
//   const handleHpAmountChange = (value: number) => {
//     updateLoan({ hpAmount: value });
//     calculateLoanValues(value, loan.interestRate, loan.dueMonth);
//   };
 
//     // Handle HP Date change - auto-set due_date if not manually modified
//   const handleHpDateChange = (value: string) => {
//     updateLoan({ hpDate: value });
    
//     // If due_date hasn't been manually modified, set it to match hpDate
//     if (!isDueDateModified && value) {
//       updateLoan({ due_date: value });
//     }
//   };

//     // Handle Due Date change - mark as manually modified
//   const handleDueDateChange = (value: string) => {
//     updateLoan({ due_date: value });
//     setIsDueDateModified(true);
//   };

//      // Handle monthly interest rate change
//   const handleMonthlyInterestChange = (value: string) => {
//     const monthlyRate = parseFloat(value) || 0;
//     updateLoan({ interestRate: value });
    
//     // Calculate yearly interest (monthly * 12)
//     const yearlyRate = monthlyRate * 12;
//     setYearlyInterestRate(yearlyRate.toFixed(1));
    
//     calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
//   };

//   const handleDueMonthChange = (value: string) => {
//     const months = parseInt(value) || 0;
//     updateLoan({ dueMonth: value });
//     calculateLoanValues(loan.hpAmount, loan.interestRate, months);
//   };

//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
//       {/* Vehicle Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Car className="w-4 h-4 text-primary" />
//           Vehicle Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Vehicle Number"
//             value={vehicle.vehicleNumber}
//             onChange={(e) => updateVehicle({ vehicleNumber: e.target.value.toUpperCase() })}
//             error={errors['vehicle.vehicleNumber']}
//             placeholder="MH12AB1234"
//           />
//           <TextInput
//             label="Vehicle Name"
//             value={vehicle.vehicleName}
//             onChange={(e) => updateVehicle({ vehicleName: e.target.value })}
//             error={errors['vehicle.vehicleName']}
//             placeholder="Honda Activa"
//           />
//           <TextInput
//             label="Model"
//             value={vehicle.modelName}
//             onChange={(e) => updateVehicle({ modelName: e.target.value })}
//             error={errors['vehicle.modelName']}
//             placeholder="6G DLX"
//           />
//           <SelectInput
//             label="Type"
//             value={vehicle.type}
//             onChange={(e) => updateVehicle({ type: e.target.value })}
//             options={vehicleTypes}
//             error={errors['vehicle.type']}
//           />
//           <SelectInput
//             label="Color"
//             value={vehicle.color}
//             onChange={(e) => updateVehicle({ color: e.target.value })}
//             options={colorOptions}
//             error={errors['vehicle.color']}
//           />
//         </div>
//       </section>
//       {/* Charges & Hand Loan */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <FileText className="w-4 h-4 text-primary" />
//           Charges & Hand Loan
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Hand Loan (₹)"
//             value={formatIndianNumber(loan.hand_loan)}
//             onChange={(e) => updateLoan({ hand_loan: Number(e.target.value) })}
//             error={errors['loan.hand_loan']}
//             placeholder="Amount"
//             type="text"
//           />
//           <TextInput
//             label="Doc Charge (₹)"
//             value={formatIndianNumber(loan.documentation_charge)}
//             onChange={(e) => updateLoan({ documentation_charge: Number(e.target.value) })}
//             error={errors['loan.documentation_charge']}
//             placeholder="Amount"
//             type="text"
//           />
          
//           <div className="col-span-2">
//             <label className="input-label">Hand Loan Remarks</label>
//             <Textarea
//               value={loan.hand_loan_remarks}
//               onChange={(e) => updateLoan({ hand_loan_remarks: e.target.value })}
              
//               placeholder="Remarks for hand loan"
//               className="input-field min-h-[50px] resize-none"
//             />
//           </div>
//         </div>
//       </section>
      
//       {/* Payment Details */}
//       {/* 
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Wallet className="w-4 h-4 text-primary" />
//           Payment Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <SelectInput
//             label="Pay Mode *"
//             value={loan.pay_mode}
//             onChange={(e) => updateLoan({ pay_mode: e.target.value as any })}
//             options={paymode_type}
//             error={errors.pay_mode}
//             required
//           />
//           <TextInput
//             label="Down Payment (₹)"
//             value={loan.down_payment}
//             onChange={(e) => updateLoan({ down_payment: Number(e.target.value) })}
//             error={errors['loan.down_payment']}
//             placeholder="Amount"
//             type="number"
//           />
          
//           <SelectInput
//             label="Pay Mode 1"
//             value={loan.pay_mode_1}
//             onChange={(e) => updateLoan({ pay_mode_1: e.target.value as any })}
//             options={paymode_type}
//             error={errors.pay_mode_1}
//           />
//           <TextInput
//             label="Pay Mode Amt 1(₹)"
//             value={loan.pay_mode_1_amount}
//             onChange={(e) => updateLoan({ pay_mode_1_amount: Number(e.target.value) })}
//             error={errors['loan.pay_mode_1_amount']}
//             placeholder="Amount"
//             type="number"
//           />
//           <TextInput
//             label="Net Payment (₹)"
//             value={loan.net_payment}
//             onChange={(e) => updateLoan({ net_payment: Number(e.target.value) })}
//             error={errors['loan.net_payment']}
//             placeholder="Amount"
//             type="number"
//           />
//         </div>
//       </section> */}

//       {/* Loan Details */}
//       <section className="form-section">
//               <h3 className="form-section-title">
//                 <CreditCard className="w-4 h-4 text-primary" />
//                 Loan Details
//               </h3>
//               <div className="grid grid-cols-2 gap-2">
//                 <SelectInput
//                   label="Loan Type *"
//                   value={loan.loan_type}
//                   onChange={(e) => updateLoan({ loan_type: e.target.value as any })}
//                   options={loan_type}
//                   error={errors.loan_type}
//                   required
//                 />
//                 {/* <TextInput
//                   label="HP Amount (₹)"
//                   value={loan.hpAmount}
//                   onChange={(e) => updateLoan({ hpAmount: Number(e.target.value ).toLocaleString('en-IN')})}
//                   error={errors['loan.hpAmount']}
//                   placeholder="Amount"
//                   type="number"
//                   required
//                 /> */}
//                 <TextInput
//                   label="HP Amount (₹)"
//                   value={formatIndianNumber(loan.hpAmount)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     const numValue = parseFloat(value) || 0;
//                     handleHpAmountChange(numValue);
//                   }}
//                   error={errors['loan.hpAmount']}
//                   placeholder="Amount"
//                   type="text"
//                   required
//                 />
//                 <TextInput
//                   label="HP Date"
//                   value={loan.hpDate}
//                   onChange={(e) => handleHpDateChange(e.target.value)}
//                   error={errors['loan.hpDate']}
//                   type="date"
//                   required
//                 />
//                 <TextInput
//                   label="Due Date"
//                   value={loan.due_date}
//                   onChange={(e) => handleDueDateChange(e.target.value)}
//                   error={errors['loan.due_date']}
//                   type="date"
//                 />
//                 <TextInput
//                   label="Due Month *"
//                   value={loan.dueMonth}
//                   onChange={(e) => handleDueMonthChange(e.target.value)}
//                   error={errors['loan.dueMonth']}
//                   type="number"
//                   placeholder="Number of months"
//                 />
                
//                 <div className="grid grid-cols-2 gap-2">
//                   <TextInput
//                     label="Penalty (₹)"
//                     value={formatIndianNumber(loan.penaltyAmount)}
//                     onChange={(e) => {
//                       const value = e.target.value.replace(/,/g, '');
//                       updateLoan({ penaltyAmount: parseFloat(value) || 0 });
//                     }}
//                     error={errors['loan.penaltyAmount']}
//                     placeholder="Amount"
//                     type="text"
//                   />
//                 <TextInput
//                   label="Penalty Days"
//                   value={formatIndianNumber(loan.penalty_days)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ penalty_days: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.penalty_days']}
//                   placeholder="Amount"
//                   type="text"
//                 />
//                 </div>
//                 <div className="col-span-2 flex gap-1">
//                   <TextInput
//                     label="Interest M(%)"
//                     value={loan.interestRate}
//                     onChange={(e) => handleMonthlyInterestChange(e.target.value)}
//                     error={errors['loan.interestRate']}
//                     placeholder="Monthly Rate"
//                     type="number"
//                     step="0.1"
//                     required
//                   />
//                   <TextInput
//                     label="Interest Y(%)"
//                     value={yearlyInterestRate}
//                     onChange={(e) => {
//                       const yearlyRate = parseFloat(e.target.value) || 0;
//                       const monthlyRate = yearlyRate / 12;
//                       setYearlyInterestRate(e.target.value);
//                       updateLoan({ interestRate: monthlyRate.toFixed(1) });
//                       calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
//                     }}
//                     error={errors['loan.interestRate']}
//                     placeholder="Yearly Rate"
//                     type="number"
//                     step="0.1"
//                     required
//                   />
//                 </div>
//                 <TextInput
//                   label="Principle (₹)"
//                   value={formatIndianNumber(loan.principle_part)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ principle_part: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.principle_part']}
//                   placeholder="Amount"
//                   type="text"
//                   readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//                 />
                
//                 <TextInput
//                   label="Interest Part (₹)"
//                   value={formatIndianNumber(loan.interest_part)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ interest_part: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.interest_part']}
//                   placeholder="Amount"
//                   type="text"
//                   readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//                 />
//                  <TextInput
//                   label="Due Amount (₹)"
//                   value={formatIndianNumber(loan.dueAmount)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ dueAmount: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.dueAmount']}
//                   placeholder="Amount"
//                   type="text"
//                   required
//                   readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//                 />
//                 <TextInput
//                   label="Net Payable (₹)"
//                   value={formatIndianNumber(loan.net_payable)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ net_payable: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.net_payable']}
//                   placeholder="Amount"
//                   type="text"
//                 />
      
//               </div>
//             </section>

      

//       {/* Third-Party Information */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Users className="w-4 h-4 text-primary" />
//           Third-Party Info
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Broker Name"
//             value={loan.broker_name}
//             onChange={(e) => updateLoan({ broker_name: e.target.value })}
//             error={errors.broker_name}
//             placeholder="Broker name"
//           />
//           <TextInput
//             label="Dealer Name"
//             value={loan.dealer_name}
//             onChange={(e) => updateLoan({ dealer_name: e.target.value })}
//             error={errors.dealer_name}
//             placeholder="Dealer name"
//           />
//           <TextInput
//             label="Broker Comm (₹)"
//             value={formatIndianNumber(loan.broker_commission)}
//             onChange={(e) => updateLoan({ broker_commission: Number(e.target.value) })}
//             error={errors['loan.broker_commission']}
//             placeholder="Amount"
//             type="text"
//           />
//         </div>
//       </section>

//       {/* Remarks */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <MessageSquare className="w-4 h-4 text-primary" />
//           Remarks
//         </h3>
//         <div>
//           <label className="input-label">Additional Remarks</label>
//           <Textarea
//             value={loan.remarks}
//             onChange={(e) => updateLoan({ remarks: e.target.value })}
           
//             placeholder="Any additional notes or comments"
//             className="input-field min-h-[60px] resize-none"
//           />
//         </div>
//       </section>
//     </div>
//   );
// };

// import { useState, useEffect, useRef } from 'react';
// import { TextInput } from './TextInput';
// import { SelectInput } from './SelectInput';
// import { useFormStore } from '../../types/formStore';
// import { Car, CreditCard, Wallet, FileText, Users, MessageSquare } from 'lucide-react';
// import { Textarea } from '../ui/textarea';
// import { calculateLoanDetails } from '../../utils/calculations';
// import axios from 'axios';
// import { X } from 'lucide-react';

// interface Step2Props {
//   errors: Record<string, string>;
// }

// interface VehicleInfo {
//   id: number;
//   brand: string;
//   model_name: string;
//   make_year: number;
//   fuel_type: string;
//   engine_capacity: string;
//   body_type: string;
//   base_price: number;
// }


// const loan_type = [
//   { value: '', label: 'Select Loan Type' },
//   { value: 'refinance', label: 'Refinance' },
//   { value: 'two_wheeler', label: 'Two Wheeler' },
//   { value: 'four_wheeler', label: 'Four Wheeler' },
//   { value: 'three_wheeler', label: 'Three Wheeler' },
//   { value: 'rc_book_loan', label: 'RC Book' },
//   { value: 'duplicate_rc_loan', label: 'Duplicate RC Book' },
//   { value: 'insurance_loan', label: 'Insurance Loan' },
//   { value: 'noc_loan', label: 'NOC loan' },
//   { value: 'document_security', label: 'Document Security' },
//   { value: 'vehicle_security', label: 'Vehicle Security' },
//   { value: 'guarantor_security', label: 'Guarantor Security' },
// ];

// const rcTypeOptions = [
//   { value: '', label: 'Select RC Type' },
//   { value: 'original', label: 'Original' },
//   { value: 'duplicate', label: 'Duplicate' },
//   { value: 'not_available', label: 'Not Available' },
// ];

// const rcHolderOptions = [
//   { value: '', label: 'Select RC Holder' },
//   { value: 'Company', label: 'Company' },
//   { value: 'customer', label: 'Customer' },
//   { value: 'third_party', label: 'Third Party' },
//   { value: 'pending', label: 'Pending' },
// ];

// const paymode_type = [
//   { value: '', label: 'Select Mode' },
//   { value: 'cash', label: 'Cash' },
//   { value: 'online', label: 'Online' },
//   { value: 'bank', label: 'Bank' },
//   { value: 'upi', label: 'UPI' },
//   { value: 'cheque', label: 'Cheque' },
//   { value: 'other', label: 'Other' },
// ];

// export const Step2VehicleLoan: React.FC<Step2Props> = ({ errors }) => {
//   const { vehicle, loan, updateVehicle, updateLoan } = useFormStore();
//   const [yearlyInterestRate, setYearlyInterestRate] = useState<string>('');
//   const [isDueDateModified, setIsDueDateModified] = useState<boolean>(false);
//   const formRef = useRef<HTMLDivElement>(null);

//   // Auto-suggestion states
//   const [brandSearch, setBrandSearch] = useState('');
//   const [modelSearch, setModelSearch] = useState('');
//   const [vehicleInfoList, setVehicleInfoList] = useState<VehicleInfo[]>([]);
//   const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
//   const [filteredModels, setFilteredModels] = useState<string[]>([]);
//   const [selectedVehicleInfo, setSelectedVehicleInfo] = useState<VehicleInfo | null>(null);
//   const [showBrandDropdown, setShowBrandDropdown] = useState(false);
//   const [showModelDropdown, setShowModelDropdown] = useState(false);

//   // Refs for dropdown closing
//   const brandDropdownRef = useRef<HTMLDivElement>(null);
//   const modelDropdownRef = useRef<HTMLDivElement>(null);

//   // Handle Enter key to move to next text input only
//   const handleKeyDown = (e: React.KeyboardEvent) => {
//     if (e.key === 'Enter' && formRef.current) {
//       const target = e.target as HTMLElement;
      
//       // Only trigger navigation if currently in a text input
//       if (target.tagName === 'INPUT' && target.getAttribute('type') !== 'file') {
//         e.preventDefault();
        
//         // Get only text inputs (not file inputs)
//         const textInputs = formRef.current.querySelectorAll(
//           'input[type="text"]:not([disabled]), input[type="number"]:not([disabled]), input:not([type]):not([disabled]), input[inputmode="numeric"]:not([disabled])'
//         );
        
//         const currentIndex = Array.from(textInputs).indexOf(target);
        
//         if (currentIndex > -1 && currentIndex < textInputs.length - 1) {
//           (textInputs[currentIndex + 1] as HTMLElement).focus();
//         }
//       }
//     }
//   };

//   // Click outside to close dropdowns
//   useEffect(() => {
//     const handleClickOutside = (event: MouseEvent) => {
//       if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
//         setShowBrandDropdown(false);
//       }
//       if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
//         setShowModelDropdown(false);
//       }
//     };

//     document.addEventListener('mousedown', handleClickOutside);
//     return () => {
//       document.removeEventListener('mousedown', handleClickOutside);
//     };
//   }, []);

//   // Fetch all vehicle info from API
//   const fetchVehicleInfo = async () => {
//     try {
//       const response = await axios.get('https://autofinex-desktop-api.rimio.in/api/vehicle-info');
//       setVehicleInfoList(response.data);
      
//       // Extract unique brands
//       const uniqueBrands = [...new Set(response.data.map((item: VehicleInfo) => item.brand))] as string[];
//       setFilteredBrands(uniqueBrands);
//     } catch (error) {
//       console.error('Error fetching vehicle info:', error);
//     }
//   };

//   // Fetch vehicle info data on component mount
//   useEffect(() => {
//     fetchVehicleInfo();
//   }, []);

//   // Handle brand search
//   useEffect(() => {
//     if (brandSearch.trim() === '') {
//       setFilteredBrands([...new Set(vehicleInfoList.map(item => item.brand))]);
//     } else {
//       const filtered = [...new Set(vehicleInfoList
//         .filter(item => item.brand.toLowerCase().includes(brandSearch.toLowerCase()))
//         .map(item => item.brand)
//       )];
//       setFilteredBrands(filtered);
//     }
//   }, [brandSearch, vehicleInfoList]);

//   // Handle model search
//   useEffect(() => {
//     if (!vehicle.brand) {
//       setFilteredModels([]);
//       return;
//     }

//     const brandVehicles = vehicleInfoList.filter(item => item.brand === vehicle.brand);
    
//     if (modelSearch.trim() === '') {
//       setFilteredModels([...new Set(brandVehicles.map(item => item.model_name))]);
//     } else {
//       const filtered = [...new Set(brandVehicles
//         .filter(item => item.model_name.toLowerCase().includes(modelSearch.toLowerCase()))
//         .map(item => item.model_name)
//       )];
//       setFilteredModels(filtered);
//     }
//   }, [modelSearch, vehicle.brand, vehicleInfoList]);

//   // Handle brand selection
//   const handleBrandSelect = (brand: string) => {
//     setBrandSearch(brand);
//     updateVehicle({ brand: brand, vehicleName: '', modelName: '' });
//     setShowBrandDropdown(false);
//     setSelectedVehicleInfo(null);
//   };

//   // Handle model selection
//   const handleModelSelect = (modelName: string) => {
//     setModelSearch(modelName);
//     updateVehicle({ vehicleName: modelName });
    
//     // Find the selected vehicle info
//     const vehicleInfo = vehicleInfoList.find(
//       item => item.brand === vehicle.brand && item.model_name === modelName
//     );
    
//     if (vehicleInfo) {
//       setSelectedVehicleInfo(vehicleInfo);
//       // Auto-fill vehicle type based on body_type
//       const bodyTypeMap: Record<string, string> = {
//         'bike': 'two_wheeler',
//         'scooter': 'two_wheeler',
//         'car': 'four_wheeler',
//         'sedan': 'four_wheeler',
//         'hatchback': 'four_wheeler',
//         'suv': 'four_wheeler',
//         'muv': 'four_wheeler',
//         'coupe': 'four_wheeler',
//         'convertible': 'four_wheeler',
//       };
//       const vehicleType = bodyTypeMap[vehicleInfo.body_type.toLowerCase()] || '';
//       updateVehicle({ type: vehicleType });
//     }
    
//     setShowModelDropdown(false);
//   };

//   const calculateLoanValues = (hpAmount: number, interestRate: number | string, dueMonth: number | string) => {
//     const principal = Number(hpAmount) || 0;
//     const rate = typeof interestRate === 'string' ? parseFloat(interestRate) : interestRate || 0;
//     const months = typeof dueMonth === 'string' ? parseInt(dueMonth) : dueMonth || 0;

//     if (!principal || !rate || !months) return;

//     const calculated = calculateLoanDetails(principal, rate, months);
//     if (calculated) {
//       updateLoan({
//         dueAmount: calculated.dueAmount,
//         principle_part: calculated.principlePart,
//         interest_part: calculated.interestPart,
//         net_payable: calculated.net_payable,
//       });
//     }
//   };

//   // Format number with Indian locale
//   const formatIndianNumber = (num: number | string): string => {
//     const value = typeof num === 'string' ? parseFloat(num) : num;
//     return isNaN(value) ? '' : value.toLocaleString('en-IN');
//   };

//   // Handle HP amount change with calculation
//   const handleHpAmountChange = (value: number) => {
//     updateLoan({ hpAmount: value });
//     calculateLoanValues(value, loan.interestRate, loan.dueMonth);
//   };

//   // Handle HP Date change - auto-set due_date if not manually modified
//   const handleHpDateChange = (value: string) => {
//     updateLoan({ hpDate: value });
    
//     // If due_date hasn't been manually modified, set it to match hpDate
//     if (!isDueDateModified && value) {
//       updateLoan({ due_date: value });
//     }
//   };

//   // Handle Due Date change - mark as manually modified
//   const handleDueDateChange = (value: string) => {
//     updateLoan({ due_date: value });
//     setIsDueDateModified(true);
//   };

//   // Handle monthly interest rate change
//   const handleMonthlyInterestChange = (value: string) => {
//     const monthlyRate = parseFloat(value) || 0;
//     updateLoan({ interestRate: value });
    
//     // Calculate yearly interest (monthly * 12)
//     const yearlyRate = monthlyRate * 12;
//     setYearlyInterestRate(yearlyRate.toFixed(1));
    
//     calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
//   };

//   const handleDueMonthChange = (value: string) => {
//     const months = parseInt(value) || 0;
//     updateLoan({ dueMonth: value });
//     calculateLoanValues(loan.hpAmount, loan.interestRate, months);
//   };

//   const handleDueAmountChange = (value: number) => {
//     const dueAmount = Number(value) || 0;
//     const principlePart = Number(loan.principle_part) || 0;
//     const hpAmount = Number(loan.hpAmount) || 0;
//     const dueMonth = Number(loan.dueMonth) || 0;
    
//     // Calculate interest_part
//     const newInterestPart = dueAmount - principlePart;
    
//     // Calculate net_payable = due_amount * due_month
//     const netPayable = dueAmount * dueMonth;
    
//     // Recalculate interest rate based on new due amount
//     // Formula: interest = (dueAmount - principal) / principal / months * 100
//     let newInterestRate = loan.interestRate;
//     if (hpAmount > 0 && dueMonth > 0) {
//       const totalInterest = newInterestPart;
//       const monthlyInterestRate = (totalInterest / hpAmount) * 100;
//       newInterestRate = monthlyInterestRate.toFixed(1);
      
//       // Update yearly interest rate display
//       const yearlyRate = monthlyInterestRate * 12;
//       setYearlyInterestRate(yearlyRate.toFixed(1));
//     }
    
//     updateLoan({ 
//       dueAmount: dueAmount,
//       interest_part: newInterestPart >= 0 ? newInterestPart : 0,
//       interestRate: newInterestRate,
//       net_payable: netPayable
//     });
//   };

//   // Capitalize first letter
//   const capitalizeFirstLetter = (value: string) => {
//     if (!value) return value;
//     return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
//   };

//   return (
//     <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
//       {/* Left Column - Vehicle Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Car className="w-4 h-4 text-primary" />
//           Vehicle Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           {/* Brand with Auto-suggestion */}
//           <div className="relative" ref={brandDropdownRef}>
//             <label className="input-label">Brand *</label>
//             <div className="relative">
//               <input
//                 type="text"
//                 value={brandSearch || vehicle.brand}
//                 onChange={(e) => {
//                   setBrandSearch(e.target.value);
//                   updateVehicle({ brand: e.target.value });
//                   setShowBrandDropdown(true);
//                 }}
//                 onFocus={() => setShowBrandDropdown(true)}
//                 placeholder="Search brand..."
//                 className="input-field w-full pr-8"
//               />
//               {brandSearch && (
//                 <button
//                   type="button"
//                   onClick={() => {
//                     setBrandSearch('');
//                     updateVehicle({ brand: '', vehicleName: '', modelName: '' });
//                     setSelectedVehicleInfo(null);
//                   }}
//                   className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
//                 >
//                   <X className="w-4 h-4" />
//                 </button>
//               )}
//             </div>
            
//             {showBrandDropdown && filteredBrands.length > 0 && (
//               <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
//                 {filteredBrands.map((brand) => (
//                   <div
//                     key={brand}
//                     onClick={() => handleBrandSelect(brand)}
//                     className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
//                   >
//                     {brand}
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Vehicle Name (Model) with Auto-suggestion */}
//           <div className="relative" ref={modelDropdownRef}>
//             <label className="input-label">Vehicle Name *</label>
//             <div className="relative">
//               <input
//                 type="text"
//                 value={modelSearch || vehicle.vehicleName}
//                 onChange={(e) => {
//                   setModelSearch(e.target.value);
//                   updateVehicle({ vehicleName: e.target.value });
//                   setShowModelDropdown(true);
//                 }}
//                 onFocus={() => setShowModelDropdown(true)}
//                 placeholder="Search vehicle name..."
//                 className="input-field w-full pr-8"
//                 disabled={!vehicle.brand}
//               />
//               {modelSearch && (
//                 <button
//                   type="button"
//                   onClick={() => {
//                     setModelSearch('');
//                     updateVehicle({ vehicleName: '', modelName: '' });
//                     setSelectedVehicleInfo(null);
//                   }}
//                   className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
//                 >
//                   <X className="w-4 h-4" />
//                 </button>
//               )}
//             </div>
            
//             {showModelDropdown && filteredModels.length > 0 && vehicle.brand && (
//               <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
//                 {filteredModels.map((model) => (
//                   <div
//                     key={model}
//                     onClick={() => handleModelSelect(model)}
//                     className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
//                   >
//                     {model}
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Auto-filled info display */}
//           {selectedVehicleInfo && (
//             <div className="col-span-2 p-2 bg-muted/50 rounded text-xs space-y-1">
//               <div className="flex justify-between">
//                 <span className="text-muted-foreground">Body Type:</span>
//                 <span className="font-medium">{selectedVehicleInfo.body_type}</span>
//               </div>
//               <div className="flex justify-between">
//                 <span className="text-muted-foreground">Fuel Type:</span>
//                 <span className="font-medium">{selectedVehicleInfo.fuel_type}</span>
//               </div>
//               <div className="flex justify-between">
//                 <span className="text-muted-foreground">Engine CC:</span>
//                 <span className="font-medium">{selectedVehicleInfo.engine_capacity}</span>
//               </div>
//             </div>
//           )}

//           <TextInput
//             label="Vehicle Number"
//             value={vehicle.vehicleNumber}
//             onChange={(e) => updateVehicle({ vehicleNumber: e.target.value.toUpperCase() })}
//             error={errors['vehicle.vehicleNumber']}
//             placeholder="MH12AB1234"
//           />
          
//           <TextInput
//             label="Vehicle Model"
//             value={vehicle.modelName}
//             onChange={(e) => updateVehicle({ modelName: e.target.value })}
//             error={errors['vehicle.modelName']}
//             placeholder="Enter model"
//           />


//           <TextInput
//             label="Color"
//             value={vehicle.color}
//             onChange={(e) => updateVehicle({ color: capitalizeFirstLetter(e.target.value) })}
//             error={errors['vehicle.color']}
//             placeholder="Enter color"
//           />

//           <SelectInput
//             label="RC Type"
//             value={vehicle.rc_status || ''}
//             onChange={(e) => updateVehicle({ rc_status: e.target.value as any })}
//             options={rcTypeOptions}
//             error={errors['vehicle.rc_status']}
//           />

//           <SelectInput
//             label="RC Holder"
//             value={vehicle.rc_holder || ''}
//             onChange={(e) => updateVehicle({ rc_holder: e.target.value as any })}
//             options={rcHolderOptions}
//             error={errors['vehicle.rc_holder']}
//           />

//           <TextInput
//             label="Engine Number"
//             value={vehicle.engine_number || ''}
//             onChange={(e) => updateVehicle({ engine_number: e.target.value.toUpperCase() })}
//             error={errors['vehicle.engine_number']}
//             placeholder="Enter engine number"
//           />

//           <div className="col-span-2">
//             <label className="input-label">Vehicle Remarks</label>
//             <Textarea
//               value={vehicle.remarks || ''}
//               onChange={(e) => updateVehicle({ remarks: e.target.value })}
//               placeholder="Vehicle remarks"
//               className="input-field min-h-[50px] resize-none"
//             />
//           </div>
//         </div>
//       </section>

//       {/* Top Right - Loan Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <CreditCard className="w-4 h-4 text-primary" />
//           Loan Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <SelectInput
//             label="Loan Type"
//             value={loan.loan_type}
//             onChange={(e) => updateLoan({ loan_type: e.target.value as any })}
//             options={loan_type}
//             error={errors.loan_type}
//             containerClassName="col-span-2"
//             required
//           />
//           <TextInput
//             label="HP Amount (₹)"
//             value={formatIndianNumber(loan.hpAmount)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               const numValue = parseFloat(value) || 0;
//               handleHpAmountChange(numValue);
//             }}
//             error={errors['loan.hpAmount']}
//             placeholder="Amount"
//             type="text"
//             required
//           />
//           <TextInput
//             label="Due Month *"
//             value={loan.dueMonth}
//             onChange={(e) => handleDueMonthChange(e.target.value)}
//             error={errors['loan.dueMonth']}
//             type="number"
//             placeholder="Months"
//           />
//           <TextInput
//             label="HP Date"
//             value={loan.hpDate}
//             onChange={(e) => handleHpDateChange(e.target.value)}
//             error={errors['loan.hpDate']}
//             type="date"
//             required
//           />
//           <TextInput
//             label="Due Date"
//             value={loan.due_date}
//             onChange={(e) => handleDueDateChange(e.target.value)}
//             error={errors['loan.due_date']}
//             type="date"
//           />
          
//           <TextInput
//             label="Interest M(%)"
//             value={loan.interestRate}
//             onChange={(e) => handleMonthlyInterestChange(e.target.value)}
//             error={errors['loan.interestRate']}
//             placeholder="Monthly"
//             type="number"
//             step="0.1"
//             required
//           />
//           <TextInput
//             label="Interest Y(%)"
//             value={yearlyInterestRate}
//             onChange={(e) => {
//               const yearlyRate = parseFloat(e.target.value) || 0;
//               const monthlyRate = yearlyRate / 12;
//               setYearlyInterestRate(e.target.value);
//               updateLoan({ interestRate: monthlyRate.toFixed(1) });
//               calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
//             }}
//             error={errors['loan.interestRate']}
//             placeholder="Yearly"
//             type="number"
//             step="0.1"
//             required
//           />
          
//           <TextInput
//             label="Principle (₹)"
//             value={formatIndianNumber(loan.principle_part)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ principle_part: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.principle_part']}
//             placeholder="Amount"
//             type="text"
//             readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//           />
          
//           <TextInput
//             label="Interest Part (₹)"
//             value={formatIndianNumber(loan.interest_part)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ interest_part: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.interest_part']}
//             placeholder="Amount"
//             type="text"
//             readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//           />
//           <TextInput
//             label="Due Amount (₹)"
//             value={formatIndianNumber(loan.dueAmount)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               const numValue = parseFloat(value) || 0;
//               handleDueAmountChange(numValue);
//             }}
//             error={errors['loan.dueAmount']}
//             placeholder="Amount"
//             type="text"
//             required
//           />
//           <TextInput
//             label="Net Payable (₹)"
//             value={formatIndianNumber(loan.net_payable)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ net_payable: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.net_payable']}
//             placeholder="Amount"
//             type="text"
//           />
//           <TextInput
//             label="Penalty (₹)"
//             value={formatIndianNumber(loan.penaltyAmount)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ penaltyAmount: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.penaltyAmount']}
//             placeholder="Amount"
//             type="text"
//           />
//           <TextInput
//             label="Penalty Days"
//             value={formatIndianNumber(loan.penalty_days)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ penalty_days: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.penalty_days']}
//             placeholder="Days"
//             type="text"
//           />
//         </div>
//       </section>

//       {/* Full Width Bottom - Charges & Additional Info */}
//       <section className="form-section lg:col-span-2">
//         <h3 className="form-section-title">
//           <FileText className="w-4 h-4 text-primary" />
//           Charges & Additional Info
//         </h3>
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
//           <TextInput
//             label="Hand Loan (₹)"
//             value={formatIndianNumber(loan.hand_loan)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ hand_loan: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.hand_loan']}
//             placeholder="Amount"
//             type="text"
//           />
//           <TextInput
//             label="Doc Charge (₹)"
//             value={formatIndianNumber(loan.documentation_charge)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ documentation_charge: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.documentation_charge']}
//             placeholder="Amount"
//             type="text"
//           />
//           <TextInput
//             label="Broker Name"
//             value={loan.broker_name}
//             onChange={(e) => updateLoan({ broker_name: e.target.value })}
//             error={errors.broker_name}
//             placeholder="Broker name"
//           />
//           <TextInput
//             label="Broker Comm (₹)"
//             value={formatIndianNumber(loan.broker_commission)}
//             onChange={(e) => {
//               const value = e.target.value.replace(/,/g, '');
//               updateLoan({ broker_commission: parseFloat(value) || 0 });
//             }}
//             error={errors['loan.broker_commission']}
//             placeholder="Amount"
//             type="text"
//           />
          
//           <div className="col-span-2">
//             <label className="input-label">Hand Loan Remarks</label>
//             <Textarea
//               value={loan.hand_loan_remarks}
//               onChange={(e) => updateLoan({ hand_loan_remarks: e.target.value })}
//               placeholder="Remarks for hand loan"
//               className="input-field min-h-[40px] resize-none"
//             />
//           </div>

//           <TextInput
//             label="Dealer Name"
//             value={loan.dealer_name}
//             onChange={(e) => updateLoan({ dealer_name: e.target.value })}
//             error={errors.dealer_name}
//             placeholder="Dealer name"
//             containerClassName="col-span-2"
//           />

//           {/* Additional Remarks */}
//           <div className="col-span-2 md:col-span-4">
//             <label className="input-label">Additional Remarks</label>
//             <Textarea
//               value={loan.remarks}
//               onChange={(e) => updateLoan({ remarks: e.target.value })}
//               placeholder="Any additional notes or comments"
//               className="input-field min-h-[40px] resize-none"
//             />
//           </div>
//         </div>
//       </section>
//     </div>
//   );
// };


// import {useState} from 'react';
// import { TextInput } from './TextInput';
// import { SelectInput } from './SelectInput';
// import { useFormStore } from '../../types/formStore';
// import { Car, CreditCard, Wallet, FileText, Users, MessageSquare } from 'lucide-react';
// import { Textarea } from '../ui/textarea';
// import {calculateLoanDetails} from '../../utils/calculations'

// interface Step2Props {
//   errors: Record<string, string>;
// }

// const loan_type = [
//   { value: '', label: 'Select Loan Type' },
//   { value: 'refinance', label: 'Refinance' },
//   { value: 'two_wheeler', label: 'Two Wheeler' },
//   { value: 'four_wheeler', label: 'Four Wheeler' },
//   { value: 'three_wheeler', label: 'Three Wheeler' },
//   { value: 'rc_book_loan', label: 'RC Book' },
//   { value: 'duplicate_rc_loan', label: 'Duplicate RC Book' },
//   { value: 'insurance_loan', label: 'Insurance Loan' },
//   { value: 'noc_loan', label: 'NOC loan' },
//   { value: 'document_security', label: 'Document Security' },
//   { value: 'vehicle_security', label: 'Vehicle Security' },
//   { value: 'guarantor_security', label: 'Guarantor Security' },
// ];

// const vehicleTypes = [
//   { value: '', label: 'Select Type' },
//   { value: 'two_wheeler', label: 'Two Wheeler' },
//   { value: 'three_wheeler', label: 'Three Wheeler' },
//   { value: 'four_wheeler', label: 'Four Wheeler' },
//   { value: 'heavy_vehicle', label: 'Heavy Vehicle' },
//   { value: 'commercial', label: 'Commercial Vehicle' },
// ];

// const colorOptions = [
//   { value: '', label: 'Select Color' },
//   { value: 'white', label: 'White' },
//   { value: 'black', label: 'Black' },
//   { value: 'silver', label: 'Silver' },
//   { value: 'red', label: 'Red' },
//   { value: 'blue', label: 'Blue' },
//   { value: 'grey', label: 'Grey' },
//   { value: 'green', label: 'Green' },
//   { value: 'other', label: 'Other' },
// ];

// const paymode_type = [
//   { value: '', label: 'Select Mode' },
//   { value: 'cash', label: 'Cash' },
//   { value: 'online', label: 'Online' },
//   { value: 'bank', label: 'Bank' },
//   { value: 'upi', label: 'UPI' },
//   { value: 'cheque', label: 'Cheque' },
//   { value: 'other', label: 'Other' },
// ];

// export const Step2VehicleLoan: React.FC<Step2Props> = ({ errors }) => {
//   const { vehicle, loan, updateVehicle, updateLoan } = useFormStore();
//   const [yearlyInterestRate, setYearlyInterestRate] = useState<string>('');
//   const [isDueDateModified, setIsDueDateModified] = useState<boolean>(false);


//   const calculateLoanValues = (hpAmount: number, interestRate: number | string, dueMonth: number | string) => {
//       const principal = Number(hpAmount) || 0;
//       const rate = typeof interestRate === 'string' ? parseFloat(interestRate) : interestRate || 0;
//       const months = typeof dueMonth === 'string' ? parseInt(dueMonth) : dueMonth || 0;
  
//       if (!principal || !rate || !months) return;
  
//       const calculated = calculateLoanDetails(principal, rate, months);
//       if (calculated) {
//         updateLoan({
//           dueAmount: calculated.dueAmount,
//           principle_part: calculated.principlePart,
//           interest_part: calculated.interestPart,
//           net_payable : calculated.net_payable,
//         });
//       }
//     };
//     // Format number with Indian locale
//   const formatIndianNumber = (num: number | string): string => {
//     const value = typeof num === 'string' ? parseFloat(num) : num;
//     return isNaN(value) ? '' : value.toLocaleString('en-IN');
//   };

//     // Handle HP amount change with calculation
//   const handleHpAmountChange = (value: number) => {
//     updateLoan({ hpAmount: value });
//     calculateLoanValues(value, loan.interestRate, loan.dueMonth);
//   };
 
//     // Handle HP Date change - auto-set due_date if not manually modified
//   const handleHpDateChange = (value: string) => {
//     updateLoan({ hpDate: value });
    
//     // If due_date hasn't been manually modified, set it to match hpDate
//     if (!isDueDateModified && value) {
//       updateLoan({ due_date: value });
//     }
//   };

//     // Handle Due Date change - mark as manually modified
//   const handleDueDateChange = (value: string) => {
//     updateLoan({ due_date: value });
//     setIsDueDateModified(true);
//   };

//      // Handle monthly interest rate change
//   const handleMonthlyInterestChange = (value: string) => {
//     const monthlyRate = parseFloat(value) || 0;
//     updateLoan({ interestRate: value });
    
//     // Calculate yearly interest (monthly * 12)
//     const yearlyRate = monthlyRate * 12;
//     setYearlyInterestRate(yearlyRate.toFixed(1));
    
//     calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
//   };

//   const handleDueMonthChange = (value: string) => {
//     const months = parseInt(value) || 0;
//     updateLoan({ dueMonth: value });
//     calculateLoanValues(loan.hpAmount, loan.interestRate, months);
//   };

//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
//       {/* Vehicle Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Car className="w-4 h-4 text-primary" />
//           Vehicle Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Vehicle Number"
//             value={vehicle.vehicleNumber}
//             onChange={(e) => updateVehicle({ vehicleNumber: e.target.value.toUpperCase() })}
//             error={errors['vehicle.vehicleNumber']}
//             placeholder="MH12AB1234"
//           />
//           <TextInput
//             label="Vehicle Name"
//             value={vehicle.vehicleName}
//             onChange={(e) => updateVehicle({ vehicleName: e.target.value })}
//             error={errors['vehicle.vehicleName']}
//             placeholder="Honda Activa"
//           />
//           <TextInput
//             label="Model"
//             value={vehicle.modelName}
//             onChange={(e) => updateVehicle({ modelName: e.target.value })}
//             error={errors['vehicle.modelName']}
//             placeholder="6G DLX"
//           />
//           <SelectInput
//             label="Type"
//             value={vehicle.type}
//             onChange={(e) => updateVehicle({ type: e.target.value })}
//             options={vehicleTypes}
//             error={errors['vehicle.type']}
//           />
//           <SelectInput
//             label="Color"
//             value={vehicle.color}
//             onChange={(e) => updateVehicle({ color: e.target.value })}
//             options={colorOptions}
//             error={errors['vehicle.color']}
//           />
//         </div>
//       </section>
//       {/* Charges & Hand Loan */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <FileText className="w-4 h-4 text-primary" />
//           Charges & Hand Loan
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Hand Loan (₹)"
//             value={formatIndianNumber(loan.hand_loan)}
//             onChange={(e) => updateLoan({ hand_loan: Number(e.target.value) })}
//             error={errors['loan.hand_loan']}
//             placeholder="Amount"
//             type="text"
//           />
//           <TextInput
//             label="Doc Charge (₹)"
//             value={formatIndianNumber(loan.documentation_charge)}
//             onChange={(e) => updateLoan({ documentation_charge: Number(e.target.value) })}
//             error={errors['loan.documentation_charge']}
//             placeholder="Amount"
//             type="text"
//           />
          
//           <div className="col-span-2">
//             <label className="input-label">Hand Loan Remarks</label>
//             <Textarea
//               value={loan.hand_loan_remarks}
//               onChange={(e) => updateLoan({ hand_loan_remarks: e.target.value })}
              
//               placeholder="Remarks for hand loan"
//               className="input-field min-h-[50px] resize-none"
//             />
//           </div>
//         </div>
//       </section>
      
//       {/* Payment Details */}
//       {/* 
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Wallet className="w-4 h-4 text-primary" />
//           Payment Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <SelectInput
//             label="Pay Mode *"
//             value={loan.pay_mode}
//             onChange={(e) => updateLoan({ pay_mode: e.target.value as any })}
//             options={paymode_type}
//             error={errors.pay_mode}
//             required
//           />
//           <TextInput
//             label="Down Payment (₹)"
//             value={loan.down_payment}
//             onChange={(e) => updateLoan({ down_payment: Number(e.target.value) })}
//             error={errors['loan.down_payment']}
//             placeholder="Amount"
//             type="number"
//           />
          
//           <SelectInput
//             label="Pay Mode 1"
//             value={loan.pay_mode_1}
//             onChange={(e) => updateLoan({ pay_mode_1: e.target.value as any })}
//             options={paymode_type}
//             error={errors.pay_mode_1}
//           />
//           <TextInput
//             label="Pay Mode Amt 1(₹)"
//             value={loan.pay_mode_1_amount}
//             onChange={(e) => updateLoan({ pay_mode_1_amount: Number(e.target.value) })}
//             error={errors['loan.pay_mode_1_amount']}
//             placeholder="Amount"
//             type="number"
//           />
//           <TextInput
//             label="Net Payment (₹)"
//             value={loan.net_payment}
//             onChange={(e) => updateLoan({ net_payment: Number(e.target.value) })}
//             error={errors['loan.net_payment']}
//             placeholder="Amount"
//             type="number"
//           />
//         </div>
//       </section> */}

//       {/* Loan Details */}
//       <section className="form-section">
//               <h3 className="form-section-title">
//                 <CreditCard className="w-4 h-4 text-primary" />
//                 Loan Details
//               </h3>
//               <div className="grid grid-cols-2 gap-2">
//                 <SelectInput
//                   label="Loan Type *"
//                   value={loan.loan_type}
//                   onChange={(e) => updateLoan({ loan_type: e.target.value as any })}
//                   options={loan_type}
//                   error={errors.loan_type}
//                   required
//                 />
//                 {/* <TextInput
//                   label="HP Amount (₹)"
//                   value={loan.hpAmount}
//                   onChange={(e) => updateLoan({ hpAmount: Number(e.target.value ).toLocaleString('en-IN')})}
//                   error={errors['loan.hpAmount']}
//                   placeholder="Amount"
//                   type="number"
//                   required
//                 /> */}
//                 <TextInput
//                   label="HP Amount (₹)"
//                   value={formatIndianNumber(loan.hpAmount)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     const numValue = parseFloat(value) || 0;
//                     handleHpAmountChange(numValue);
//                   }}
//                   error={errors['loan.hpAmount']}
//                   placeholder="Amount"
//                   type="text"
//                   required
//                 />
//                 <TextInput
//                   label="HP Date"
//                   value={loan.hpDate}
//                   onChange={(e) => handleHpDateChange(e.target.value)}
//                   error={errors['loan.hpDate']}
//                   type="date"
//                   required
//                 />
//                 <TextInput
//                   label="Due Date"
//                   value={loan.due_date}
//                   onChange={(e) => handleDueDateChange(e.target.value)}
//                   error={errors['loan.due_date']}
//                   type="date"
//                 />
//                 <TextInput
//                   label="Due Month *"
//                   value={loan.dueMonth}
//                   onChange={(e) => handleDueMonthChange(e.target.value)}
//                   error={errors['loan.dueMonth']}
//                   type="number"
//                   placeholder="Number of months"
//                 />
                
//                 <div className="grid grid-cols-2 gap-2">
//                   <TextInput
//                     label="Penalty (₹)"
//                     value={formatIndianNumber(loan.penaltyAmount)}
//                     onChange={(e) => {
//                       const value = e.target.value.replace(/,/g, '');
//                       updateLoan({ penaltyAmount: parseFloat(value) || 0 });
//                     }}
//                     error={errors['loan.penaltyAmount']}
//                     placeholder="Amount"
//                     type="text"
//                   />
//                 <TextInput
//                   label="Penalty Days"
//                   value={formatIndianNumber(loan.penalty_days)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ penalty_days: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.penalty_days']}
//                   placeholder="Amount"
//                   type="text"
//                 />
//                 </div>
//                 <div className="col-span-2 flex gap-1">
//                   <TextInput
//                     label="Interest M(%)"
//                     value={loan.interestRate}
//                     onChange={(e) => handleMonthlyInterestChange(e.target.value)}
//                     error={errors['loan.interestRate']}
//                     placeholder="Monthly Rate"
//                     type="number"
//                     step="0.1"
//                     required
//                   />
//                   <TextInput
//                     label="Interest Y(%)"
//                     value={yearlyInterestRate}
//                     onChange={(e) => {
//                       const yearlyRate = parseFloat(e.target.value) || 0;
//                       const monthlyRate = yearlyRate / 12;
//                       setYearlyInterestRate(e.target.value);
//                       updateLoan({ interestRate: monthlyRate.toFixed(1) });
//                       calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
//                     }}
//                     error={errors['loan.interestRate']}
//                     placeholder="Yearly Rate"
//                     type="number"
//                     step="0.1"
//                     required
//                   />
//                 </div>
//                 <TextInput
//                   label="Principle (₹)"
//                   value={formatIndianNumber(loan.principle_part)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ principle_part: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.principle_part']}
//                   placeholder="Amount"
//                   type="text"
//                   readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//                 />
                
//                 <TextInput
//                   label="Interest Part (₹)"
//                   value={formatIndianNumber(loan.interest_part)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ interest_part: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.interest_part']}
//                   placeholder="Amount"
//                   type="text"
//                   readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//                 />
//                  <TextInput
//                   label="Due Amount (₹)"
//                   value={formatIndianNumber(loan.dueAmount)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ dueAmount: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.dueAmount']}
//                   placeholder="Amount"
//                   type="text"
//                   required
//                   readOnly={!!loan.hpAmount && !!loan.interestRate && !!loan.dueMonth}
//                 />
//                 <TextInput
//                   label="Net Payable (₹)"
//                   value={formatIndianNumber(loan.net_payable)}
//                   onChange={(e) => {
//                     const value = e.target.value.replace(/,/g, '');
//                     updateLoan({ net_payable: parseFloat(value) || 0 });
//                   }}
//                   error={errors['loan.net_payable']}
//                   placeholder="Amount"
//                   type="text"
//                 />
      
//               </div>
//             </section>

      

//       {/* Third-Party Information */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Users className="w-4 h-4 text-primary" />
//           Third-Party Info
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Broker Name"
//             value={loan.broker_name}
//             onChange={(e) => updateLoan({ broker_name: e.target.value })}
//             error={errors.broker_name}
//             placeholder="Broker name"
//           />
//           <TextInput
//             label="Dealer Name"
//             value={loan.dealer_name}
//             onChange={(e) => updateLoan({ dealer_name: e.target.value })}
//             error={errors.dealer_name}
//             placeholder="Dealer name"
//           />
//           <TextInput
//             label="Broker Comm (₹)"
//             value={formatIndianNumber(loan.broker_commission)}
//             onChange={(e) => updateLoan({ broker_commission: Number(e.target.value) })}
//             error={errors['loan.broker_commission']}
//             placeholder="Amount"
//             type="text"
//           />
//         </div>
//       </section>

//       {/* Remarks */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <MessageSquare className="w-4 h-4 text-primary" />
//           Remarks
//         </h3>
//         <div>
//           <label className="input-label">Additional Remarks</label>
//           <Textarea
//             value={loan.remarks}
//             onChange={(e) => updateLoan({ remarks: e.target.value })}
           
//             placeholder="Any additional notes or comments"
//             className="input-field min-h-[60px] resize-none"
//           />
//         </div>
//       </section>
//     </div>
//   );
// };

import { useState, useEffect, useRef } from 'react';
import { TextInput } from './TextInput';
import { CapitalizedInput, formatCasing } from '../common/CapitalizedInput';
import { SelectInput } from './SelectInput';
import { FileInput } from './FileInput';
import { DatePickerInput } from './DatePickerInput';
import { useFormStore } from '../../types/formStore';
import { Car, CreditCard, Wallet, FileText, Users, MessageSquare } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { calculateLoanDetails } from '../../utils/calculations';
import axios from 'axios';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { bodyTypeMap } from '../../utils/validation';

interface Step2Props {
  errors: Record<string, string>;
}

interface VehicleInfo {
  id: number;
  brand: string;
  model_name: string;
  make_year: number;
  fuel_type: string;
  engine_capacity: string;
  body_type: string;
  base_price: number;
}

const vehicleTypes = [
  { value: '', label: 'Select Type' },
  { value: 'two_wheeler', label: 'Two Wheeler' },
  { value: 'three_wheeler', label: 'Three Wheeler' },
  { value: 'four_wheeler', label: 'Four Wheeler' },
  { value: 'heavy_vehicle', label: 'Heavy Vehicle' },
  { value: 'commercial', label: 'Commercial Vehicle' },
];

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

const rcTypeOptions = [
  { value: '', label: 'Select RC Type' },
  { value: 'original', label: 'Original' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'not_available', label: 'Not Available' },
];

const rcHolderOptions = [
  { value: '', label: 'Select RC Holder' },
  { value: 'Company', label: 'Company' },
  { value: 'customer', label: 'Customer' },
  { value: 'third_party', label: 'Third Party' },
  { value: 'pending', label: 'Pending' },
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

export const Step2VehicleLoan: React.FC<Step2Props> = ({ errors }) => {
  const { vehicle, loan, updateVehicle, updateLoan } = useFormStore();
  const [yearlyInterestRate, setYearlyInterestRate] = useState<string>('');
  const [isDueDateModified, setIsDueDateModified] = useState<boolean>(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Auto-suggestion states
  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [vehicleInfoList, setVehicleInfoList] = useState<VehicleInfo[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [selectedVehicleInfo, setSelectedVehicleInfo] = useState<VehicleInfo | null>(null);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Refs for dropdown closing
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Handle Enter key to move to next text input only
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

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch all vehicle info from API
  const fetchVehicleInfo = async () => {
    try {
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
      let response;
      try {
        response = await axios.get(`${baseUrl}/api/vehicle-info`);
      } catch (err) {
        response = await axios.get(`${baseUrl}/api/vehicles/info`);
      }

      const list = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setVehicleInfoList(list);
      
      // Extract unique brands
      const uniqueBrands = [...new Set(list.map((item: VehicleInfo) => item.brand))] as string[];
      setFilteredBrands(uniqueBrands);
    } catch (error) {
      console.error('Error fetching vehicle info:', error);
    }
  };

  // Fetch vehicle info data on component mount
  useEffect(() => {
    fetchVehicleInfo();
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

  // Synchronize brand and model search inputs with vehicle state from store
  useEffect(() => {
    setBrandSearch(vehicle.brand || '');
    if (!vehicle.brand) {
      setSelectedVehicleInfo(null);
      setFilteredModels([]);
    }
  }, [vehicle.brand]);

  useEffect(() => {
    const currentName = vehicle.vehicleName || vehicle.model_name || vehicle.modelName || '';
    setModelSearch(currentName);
  }, [vehicle.vehicleName, vehicle.model_name, vehicle.modelName]);

  // Automatically find and populate matching vehicle info specifications when loaded
  useEffect(() => {
    if (vehicleInfoList.length > 0 && vehicle.brand) {
      const currentModel = vehicle.vehicleName || vehicle.model_name || vehicle.modelName;
      let matched: VehicleInfo | undefined;
      if (vehicle.vehicle_info_id) {
        matched = vehicleInfoList.find(item => String(item.id) === String(vehicle.vehicle_info_id));
      }
      if (!matched && currentModel) {
        matched = vehicleInfoList.find(
          item => item.brand?.trim().toLowerCase() === vehicle.brand?.trim().toLowerCase() &&
                  item.model_name?.trim().toLowerCase() === currentModel.trim().toLowerCase()
        );
      }
      if (matched) {
        setSelectedVehicleInfo(matched);
        const rawBody = (matched.body_type || '').toLowerCase().trim();
        const autoType = bodyTypeMap[rawBody] || vehicle.type || '';
        if (vehicle.vehicle_info_id !== String(matched.id) || (autoType && !vehicle.type)) {
          updateVehicle({
            vehicle_info_id: String(matched.id),
            ...(autoType && !vehicle.type ? { type: autoType } : {})
          });
        }
      }
    }
  }, [vehicleInfoList, vehicle.brand, vehicle.vehicle_info_id, vehicle.vehicleName, vehicle.model_name, vehicle.modelName, vehicle.type, updateVehicle]);

  // Handle brand search
  useEffect(() => {
    if (brandSearch.trim() === '') {
      setFilteredBrands([...new Set(vehicleInfoList.map(item => item.brand))]);
    } else {
      const filtered = [...new Set(vehicleInfoList
        .filter(item => item.brand.toLowerCase().includes(brandSearch.toLowerCase()))
        .map(item => item.brand)
      )];
      setFilteredBrands(filtered);
    }
  }, [brandSearch, vehicleInfoList]);

  // Handle model search
  useEffect(() => {
    if (!vehicle.brand) {
      setFilteredModels([]);
      return;
    }

    const brandVehicles = vehicleInfoList.filter(item => item.brand?.toLowerCase() === vehicle.brand?.toLowerCase());
    
    if (modelSearch.trim() === '') {
      setFilteredModels([...new Set(brandVehicles.map(item => item.model_name))]);
    } else {
      const filtered = [...new Set(brandVehicles
        .filter(item => item.model_name.toLowerCase().includes(modelSearch.toLowerCase()))
        .map(item => item.model_name)
      )];
      setFilteredModels(filtered);
    }
  }, [modelSearch, vehicle.brand, vehicleInfoList]);

  // Handle brand selection
  const handleBrandSelect = (brand: string) => {
    setBrandSearch(brand);
    updateVehicle({ brand: brand, vehicleName: '', modelName: '', model_name: '', vehicle_info_id: '' });
    setShowBrandDropdown(false);
    setSelectedVehicleInfo(null);
  };

  // Handle model selection
  const handleModelSelect = (modelName: string) => {
    setModelSearch(modelName);
    
    // Find the selected vehicle info with case-insensitive comparison
    const vehicleInfo = vehicleInfoList.find(
      item => item.brand?.trim().toLowerCase() === (vehicle.brand || brandSearch)?.trim().toLowerCase() &&
              item.model_name?.trim().toLowerCase() === modelName?.trim().toLowerCase()
    );
    
    if (vehicleInfo) {
      setSelectedVehicleInfo(vehicleInfo);
      const rawBodyType = (vehicleInfo.body_type || '').toLowerCase().trim();
      const vehicleType = bodyTypeMap[rawBodyType] || vehicle.type || '';
      // Store brand, model, type, and vehicle_info_id
      updateVehicle({
        brand: vehicleInfo.brand,
        vehicleName: `${vehicleInfo.brand} ${vehicleInfo.model_name}`,
        modelName: vehicleInfo.model_name,
        model_name: vehicleInfo.model_name,
        type: vehicleType,
        vehicle_info_id: String(vehicleInfo.id)
      });
    } else {
      updateVehicle({
        vehicleName: modelName,
        modelName: modelName,
        model_name: modelName,
        vehicle_info_id: ''
      });
    }
    
    setShowModelDropdown(false);
  };

  const calculateLoanValues = (hpAmount: number, interestRate: number | string, dueMonth: number | string) => {
    const principal = Number(hpAmount) || 0;
    const rate = typeof interestRate === 'string' ? parseFloat(interestRate) : interestRate || 0;
    const months = typeof dueMonth === 'string' ? parseInt(dueMonth) : dueMonth || 0;

    if (!principal || !rate || !months) return;

    const calculated = calculateLoanDetails(principal, rate, months);
    if (calculated) {
      updateLoan({
        dueAmount: calculated.dueAmount,
        principle_part: calculated.principlePart,
        interest_part: calculated.interestPart,
        net_payable: calculated.net_payable,
      });
    }
  };

  // Format number with Indian locale
  const formatIndianNumber = (num: number | string): string => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(value) ? '' : value.toLocaleString('en-IN');
  };

  // Handle HP amount change with calculation
  const handleHpAmountChange = (value: number) => {
    updateLoan({ hpAmount: value });
    calculateLoanValues(value, loan.interestRate, loan.dueMonth);
  };

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

  // Handle monthly interest rate change
  const handleMonthlyInterestChange = (value: string) => {
    const monthlyRate = parseFloat(value) || 0;
    updateLoan({ interestRate: value });
    
    // Calculate yearly interest (monthly * 12)
    const yearlyRate = monthlyRate * 12;
    setYearlyInterestRate(yearlyRate.toFixed(1));
    
    calculateLoanValues(loan.hpAmount, monthlyRate, loan.dueMonth);
  };

  const handleDueMonthChange = (value: string) => {
    const months = parseInt(value) || 0;
    updateLoan({ dueMonth: value });
    calculateLoanValues(loan.hpAmount, loan.interestRate, months);
  };

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

  // Capitalize first letter
  const capitalizeFirstLetter = (value: string) => {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  };

  return (
    <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Left Column - Vehicle Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Car className="w-4 h-4 text-primary" />
          Vehicle Details
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {/* Brand with Auto-suggestion */}
          <div className="relative" ref={brandDropdownRef}>
            <label className="input-label">Brand *</label>
            <div className="relative">
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => {
                  const val = formatCasing(e.target.value, 'words');
                  setBrandSearch(val);
                  updateVehicle({ brand: val, vehicleName: '', modelName: '', model_name: '', vehicle_info_id: '' });
                  setShowBrandDropdown(true);
                }}
                onFocus={() => setShowBrandDropdown(true)}
                placeholder="Search brand..."
                className={cn('input-field w-full pr-8', (errors['vehicle.brand'] || errors.brand) && 'input-error')}
              />
              {brandSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setBrandSearch('');
                    updateVehicle({ brand: '', vehicleName: '', modelName: '', model_name: '', vehicle_info_id: '' });
                    setSelectedVehicleInfo(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {showBrandDropdown && filteredBrands.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredBrands.map((brand) => (
                  <div
                    key={brand}
                    onClick={() => handleBrandSelect(brand)}
                    className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                  >
                    {brand}
                  </div>
                ))}
              </div>
            )}
            {(errors['vehicle.brand'] || errors.brand) && (
              <p className="error-message">{errors['vehicle.brand'] || errors.brand}</p>
            )}
          </div>

          {/* Vehicle Name (Model) with Auto-suggestion */}
          <div className="relative" ref={modelDropdownRef}>
            <label className="input-label">Vehicle Name *</label>
            <div className="relative">
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => {
                  const val = formatCasing(e.target.value, 'words');
                  setModelSearch(val);
                  const activeBrand = (vehicle.brand || brandSearch || '').trim();
                  const matched = vehicleInfoList.find(
                    item => item.brand?.trim().toLowerCase() === activeBrand.toLowerCase() &&
                            item.model_name?.trim().toLowerCase() === val.trim().toLowerCase()
                  );
                  if (matched) {
                    setSelectedVehicleInfo(matched);
                    const rawBody = (matched.body_type || '').toLowerCase().trim();
                    const autoType = bodyTypeMap[rawBody] || vehicle.type || '';
                    updateVehicle({
                      vehicleName: `${matched.brand} ${matched.model_name}`,
                      modelName: matched.model_name,
                      model_name: matched.model_name,
                      type: autoType,
                      vehicle_info_id: String(matched.id)
                    });
                  } else {
                    setSelectedVehicleInfo(null);
                    updateVehicle({ vehicleName: val, modelName: val, model_name: val, vehicle_info_id: '' });
                  }
                  setShowModelDropdown(true);
                }}
                onBlur={() => {
                  const activeBrand = (vehicle.brand || brandSearch || '').trim();
                  if (modelSearch && activeBrand) {
                    const matched = vehicleInfoList.find(
                      item => item.brand?.trim().toLowerCase() === activeBrand.toLowerCase() &&
                              (item.model_name?.trim().toLowerCase() === modelSearch.trim().toLowerCase() ||
                               `${item.brand} ${item.model_name}`.toLowerCase() === modelSearch.trim().toLowerCase())
                    );
                    if (matched) {
                      setSelectedVehicleInfo(matched);
                      const rawBody = (matched.body_type || '').toLowerCase().trim();
                      const autoType = bodyTypeMap[rawBody] || vehicle.type || '';
                      updateVehicle({
                        vehicleName: `${matched.brand} ${matched.model_name}`,
                        modelName: matched.model_name,
                        model_name: matched.model_name,
                        type: autoType,
                        vehicle_info_id: String(matched.id)
                      });
                    }
                  }
                }}
                onFocus={() => setShowModelDropdown(true)}
                placeholder="Search vehicle name..."
                className={cn('input-field w-full pr-8', (errors['vehicle.vehicleName'] || errors.vehicleName) && 'input-error')}
              />
              {modelSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setModelSearch('');
                    updateVehicle({ vehicleName: '', modelName: '', model_name: '', vehicle_info_id: '' });
                    setSelectedVehicleInfo(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {showModelDropdown && filteredModels.length > 0 && vehicle.brand && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredModels.map((model) => (
                  <div
                    key={model}
                    onClick={() => handleModelSelect(model)}
                    className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                  >
                    {model}
                  </div>
                ))}
              </div>
            )}
            {(errors['vehicle.vehicleName'] || errors.vehicleName) && (
              <p className="error-message">{errors['vehicle.vehicleName'] || errors.vehicleName}</p>
            )}
          </div>

          {/* Auto-filled info display */}
          {selectedVehicleInfo && (
            <div className="col-span-2 p-2 bg-muted/50 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Body Type:</span>
                <span className="font-medium">{selectedVehicleInfo.body_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fuel Type:</span>
                <span className="font-medium">{selectedVehicleInfo.fuel_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Engine CC:</span>
                <span className="font-medium">{selectedVehicleInfo.engine_capacity}</span>
              </div>
            </div>
          )}

          <CapitalizedInput
            casing="upper"
            label="Vehicle Number *"
            value={vehicle.vehicleNumber}
            onChange={(e) => updateVehicle({ vehicleNumber: e.target.value.toUpperCase() })}
            error={errors['vehicle.vehicleNumber'] || errors.vehicleNumber}
            placeholder="MH12AB1234"
            required
          />

          <SelectInput
            label="Vehicle Type *"
            value={vehicle.type}
            onChange={(e) => updateVehicle({ type: e.target.value })}
            options={vehicleTypes}
            error={errors['vehicle.type'] || errors.type}
            required
          />
          
          <CapitalizedInput
            casing="words"
            label="Vehicle Model"
            value={vehicle.modelName}
            onChange={(e) => updateVehicle({ modelName: e.target.value })}
            error={errors['vehicle.modelName'] || errors.modelName}
            placeholder="Enter model"
          />

          <CapitalizedInput
            casing="words"
            label="Color"
            value={vehicle.color}
            onChange={(e) => updateVehicle({ color: e.target.value })}
            error={errors['vehicle.color'] || errors.color}
            placeholder="Enter color"
          />

          <SelectInput
            label="RC Type"
            value={vehicle.rc_status || ''}
            onChange={(e) => updateVehicle({ rc_status: e.target.value as any })}
            options={rcTypeOptions}
            error={errors['vehicle.rc_status'] || errors.rc_status}
          />

          <SelectInput
            label="RC Holder"
            value={vehicle.rc_holder || ''}
            onChange={(e) => updateVehicle({ rc_holder: e.target.value as any })}
            options={rcHolderOptions}
            error={errors['vehicle.rc_holder'] || errors.rc_holder}
          />

          <CapitalizedInput
            casing="upper"
            label="Engine Number"
            value={vehicle.engine_number || ''}
            onChange={(e) => updateVehicle({ engine_number: e.target.value })}
            error={errors['vehicle.engine_number'] || errors.engine_number}
            placeholder="Enter engine number"
          />

          <div className="col-span-2">
            <FileInput
              label="Vehicle Photo"
              value={typeof vehicle.vehiclePhoto === 'string' ? null : (vehicle.vehiclePhoto as any) instanceof File ? (vehicle.vehiclePhoto as File) : null}
              onChange={(file) => updateVehicle({ vehiclePhoto: file })}
              error={errors['vehicle.vehiclePhoto'] || errors.vehiclePhoto}
              existingUrl={
                typeof vehicle.vehiclePhoto === 'string'
                  ? vehicle.vehiclePhoto
                  : (vehicle.vehiclePhoto as any)?.signed_url || (vehicle.vehiclePhoto as any)?.original_url
              }
              enableCamera={true}
              enableCrop={true}
              aspectRatio={4 / 3}
            />
          </div>

          <div className="col-span-2">
            <label className="input-label">Vehicle Remarks</label>
            <Textarea
              value={vehicle.remarks || ''}
              onChange={(e) => updateVehicle({ remarks: e.target.value })}
              placeholder="Vehicle remarks"
              className="input-field min-h-[50px] resize-none"
            />
          </div>
        </div>
      </section>

      {/* Top Right - Loan Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <CreditCard className="w-4 h-4 text-primary" />
          Loan Details
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <SelectInput
            label="Loan Type *"
            value={loan.loan_type}
            onChange={(e) => updateLoan({ loan_type: e.target.value as any })}
            options={loan_type}
            error={errors['loan.loan_type'] || errors.loan_type}
            containerClassName="col-span-2"
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
          <TextInput
            label="Due Month *"
            value={loan.dueMonth}
            onChange={(e) => handleDueMonthChange(e.target.value)}
            error={errors['loan.dueMonth'] || errors.dueMonth}
            type="number"
            placeholder="Months"
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
            label="Interest M(%) *"
            value={loan.interestRate}
            onChange={(e) => handleMonthlyInterestChange(e.target.value)}
            error={errors['loan.interestRate'] || errors.interestRate}
            placeholder="Monthly"
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
            placeholder="Yearly"
            type="number"
            step="0.1"
            required
          />
          
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
          />
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
            placeholder="Days"
            type="text"
          />
        </div>
      </section>

      {/* Full Width Bottom - Charges & Additional Info */}
      <section className="form-section lg:col-span-2">
        <h3 className="form-section-title">
          <FileText className="w-4 h-4 text-primary" />
          Charges & Additional Info
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
          <CapitalizedInput
            casing="words"
            label="Broker Name"
            value={loan.broker_name}
            onChange={(e) => updateLoan({ broker_name: e.target.value })}
            error={errors['loan.broker_name'] || errors.broker_name}
            placeholder="Broker name"
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
          
          <div className="col-span-2">
            <label className="input-label">Hand Loan Remarks</label>
            <Textarea
              value={loan.hand_loan_remarks}
              onChange={(e) => updateLoan({ hand_loan_remarks: e.target.value })}
              placeholder="Remarks for hand loan"
              className="input-field min-h-[40px] resize-none"
            />
          </div>

          <CapitalizedInput
            casing="words"
            label="Dealer Name"
            value={loan.dealer_name}
            onChange={(e) => updateLoan({ dealer_name: e.target.value })}
            error={errors['loan.dealer_name'] || errors.dealer_name}
            placeholder="Dealer name"
            containerClassName="col-span-2"
          />

          {/* Additional Remarks */}
          <div className="col-span-2 md:col-span-4">
            <label className="input-label">Additional Remarks</label>
            <Textarea
              value={loan.remarks}
              onChange={(e) => updateLoan({ remarks: e.target.value })}
              placeholder="Any additional notes or comments"
              className="input-field min-h-[40px] resize-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
};