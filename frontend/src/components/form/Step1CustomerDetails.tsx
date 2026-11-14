
// import { useEffect, useState, useRef } from 'react';
// import { TextInput } from './TextInput';
// import { SelectInput } from './SelectInput';
// import { FileInput } from './FileInput';
// import { AddressForm } from './AddressForm';
// import { ContactInput } from './ContactInput'; // We'll create this
// import { ContactList } from './ContactList';
// import { useFormStore } from '../../types/formStore';
// import { User, MapPin, Phone, Camera, Briefcase, Shield } from 'lucide-react';
// // import { useFinanceAuth } from '../../contexts/FinanceAuthContext';
// import { useOwnerAuth } from '../../contexts/OwnerAuthContext';
// import { useAuth } from '../../contexts/AuthContext';

// import { useNextHplno } from '../../hooks/useNextHplno'; // Import the hook

// interface Step1Props {
//   errors: Record<string, string>;
// }

// const loanStatusOptions = [
//   { value: 'active', label: 'Active' },
//   { value: 'close', label: 'Closed' },
//   { value: 'seized', label: 'Seized' },
// ];

// const fatherNameUnits = [
//   { value: 'S/O', label: 'S/O (Son of)' },
//   { value: 'H/O', label: 'H/O (Husband of)' },
//   { value: 'D/O', label: 'D/O (Daughter of)' },
//   { value: 'W/O', label: 'W/O (Wife of)' },
  
// ];

// const govtIdOptions = [
//   { value: 'pan_card', label: 'PAN Card' },
//   { value: 'voter_id', label: 'Voter ID' },
//   { value: 'driving_license', label: 'Driving License' },
//   { value: 'other', label: 'Other' },
// ];

// // Step1CustomerDetails.tsx
// export const Step1CustomerDetails: React.FC<Step1Props> = ({ errors }) => {
//   const { customer, updateCustomer } = useFormStore();
//   const { owner } = useOwnerAuth();
//   const { nextHplno, loading, error } = useNextHplno();
//   const [hasManuallyEdited, setHasManuallyEdited] = useState(false);
//   const formRef = useRef<HTMLDivElement>(null);
  
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
  
//   // Only set auto-generated value if user hasn't manually edited
//   useEffect(() => {
//     if (nextHplno && !hasManuallyEdited && !customer.hplno.trim()) {
//       updateCustomer({ hplno: nextHplno });
//     }
//   }, [nextHplno, hasManuallyEdited, customer.hplno, updateCustomer]);

//   const handleHplnoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const value = e.target.value.replace(/\D/g, '');
//     if (!hasManuallyEdited && value !== nextHplno) {
//       setHasManuallyEdited(true);
//     }
//     updateCustomer({ hplno: value });
//   };

//   const handleResetToAuto = () => {
//     setHasManuallyEdited(false);
//     if (nextHplno) {
//       updateCustomer({ hplno: nextHplno });
//     }
//   };

//   // Rest of the component...
// const handleContactChange = (contacts: any[]) => {
//     updateCustomer({ ccontacts: contacts });
//   };


//   return (
//      <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
//       {/* Personal Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <User className="w-5 h-4 text-primary" />
//           Personal Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <div>
//             <TextInput
//               label="HPL Number"
//               value={customer.hplno}
//               onChange={handleHplnoChange}
//               error={errors.hplno}
//               placeholder="Enter HPL Number"
//               required
//               disabled={loading}
//               inputMode="numeric"
//               pattern="[0-9]*"
//             />
//             {loading && (
//               <p className="text-xs text-muted-foreground mt-1">Loading next HPL number...</p>
//             )}
//             {error && (
//               <p className="text-xs text-destructive mt-1">{error}</p>
//             )}
//             {!loading && !error && nextHplno === customer.hplno && (
//               <p className="text-xs text-green-600 mt-1">
//                 Auto-generated HPL number
//               </p>
//             )}
//           </div>
//           <TextInput
//             label="Customer Name"
//             value={customer.cname}
//             onChange={(e) => updateCustomer({ cname: e.target.value })}
//             error={errors.cname}
//             placeholder="Enter customer name"
//             required
//           />
//           <div className="col-span-2 flex gap-1">
//             <SelectInput
//               label="Relation"
//               value={customer.cfname.unit}
//               onChange={(e) => updateCustomer({ 
//                 cfname: { ...customer.cfname, unit: e.target.value as any }
//               })}
//               options={fatherNameUnits}
//               containerClassName="w-32"
//             />
//             <TextInput
//               label="Father/Husband Name"
//               value={customer.cfname.value}
//               onChange={(e) => updateCustomer({ 
//                 cfname: { ...customer.cfname, value: e.target.value }
//               })}
//               error={errors['cfname.value']}
//               placeholder="Enter name"
//               containerClassName="flex-1"
//               required
//             />
//           </div>
//           <h3 className="form-section-title">
//           <Phone className="w-5 h-5 text-primary" />
//           Contact Numbers
//         </h3>
//         <ContactInput
//           contacts={customer.ccontacts}
//           onChange={handleContactChange}
//           errors={errors}
//           contactType="customer"
//         />
//         </div>
//       </section>
//       {/* Address */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <MapPin className="w-5 h-4 text-primary" />
//           Address
//         </h3>
//         <AddressForm
//           value={customer.caddress}
//           onChange={(address) => updateCustomer({ caddress: address })}
//           errors={errors}
//           financeId={String(owner?.id)}
//         />
//       </section>

//       {/* Profession Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Briefcase className="w-4 h-4 text-primary" />
//           Profession Details
//         </h3>
//         <div className="grid grid-cols-1 gap-2">
//           <TextInput
//             label="Profession"
//             value={customer.profession}
//             onChange={(e) => updateCustomer({ profession: e.target.value })}
//             error={errors.profession}
//             placeholder="Enter profession"
//           />
//           <TextInput
//             label="Work Office Address"
//             value={customer.work_office_address}
//             onChange={(e) => updateCustomer({ work_office_address: e.target.value })}
//             error={errors.work_office_address}
//             placeholder="Enter office address"
//             className="lg:col-span-2"
//           />
//           <TextInput
//             label="Work Office Phone"
//             value={customer.work_office_phone}
//             onChange={(e) => updateCustomer({ work_office_phone: e.target.value })}
//             error={errors.work_office_phone}
//             placeholder="Enter office phone"
//             maxLength={15}
//           />
//         </div>
//       </section>
//       {/* Photos */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Camera className="w-4 h-4 text-primary" />
//           Photos
//         </h3>
//         <div className="grid grid-cols-3 gap-2">
//           <FileInput
//             label="Customer Photo"
//             value={typeof customer.cphoto === 'string' ? null : customer.cphoto}
//             onChange={(file) => updateCustomer({ cphoto: file })}
//             error={errors.cphoto}
//             existingUrl={typeof customer.cphoto === 'string' ? customer.cphoto : undefined}
//           />

//           <FileInput
//             label="Vehicle Photo"
//             value={typeof customer.cvehiclePhoto === 'string' ? null : customer.cvehiclePhoto}
//             onChange={(file) => updateCustomer({ cvehiclePhoto: file })}
//             error={errors.cvehiclePhoto}
//             existingUrl={typeof customer.cvehiclePhoto === 'string' ? customer.cvehiclePhoto : undefined}
//           />

//           <FileInput
//             label="Property Photo"
//             value={typeof customer.cpropertyPhoto === 'string' ? null : customer.cpropertyPhoto}
//             onChange={(file) => updateCustomer({ cpropertyPhoto: file })}
//             error={errors.cpropertyPhoto}
//             existingUrl={typeof customer.cpropertyPhoto === 'string' ? customer.cpropertyPhoto : undefined}
//           />
//         </div>
//       </section>

      

//       {/* Contacts */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Phone className="w-5 h-5 text-primary" />
//           Contact Numbers
//         </h3>
//         <ContactInput
//           contacts={customer.ccontacts}
//           onChange={handleContactChange}
//           errors={errors}
//           contactType="customer"
//         />
//       </section>

//       {/* Government ID */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Shield className="w-4 h-4 text-primary" />
//           Government Identification
//         </h3>
//         <div className="grid grid-cols-1 gap-2">
//           <TextInput
//             label="Aadhar Number"
//             value={customer.aadhar_id}
//             onChange={(e) => updateCustomer({ aadhar_id: e.target.value })}
//             error={errors.aadhar_id}
//             placeholder="Enter 12-digit Aadhar"
//             maxLength={12}
//           />
//           <div className="grid grid-cols-2 gap-1">
//           <SelectInput
//             label="Other Govt ID Type"
//             value={customer.other_govt_id_type}
//             onChange={(e) => updateCustomer({ other_govt_id_type: e.target.value as any })}
//             options={govtIdOptions}
//             error={errors.other_govt_id_type}
//           />
//           <TextInput
//             label="Other Govt ID Number"
//             value={customer.other_govt_id_number}
//             onChange={(e) => updateCustomer({ other_govt_id_number: e.target.value })}
//             error={errors.other_govt_id_number}
//             placeholder="Enter ID number"
//           />
//           </div>
//         </div>
//       </section>
//     </div>
//   );
// };


// import { useEffect,useState } from 'react';
// import { TextInput } from './TextInput';
// import { SelectInput } from './SelectInput';
// import { FileInput } from './FileInput';
// import { AddressForm } from './AddressForm';
// import { ContactInput } from './ContactInput'; // We'll create this
// import { useFormStore } from '../../types/formStore';
// import { User, MapPin, Phone, Camera, Briefcase, Shield } from 'lucide-react';
// // import { useFinanceAuth } from '../../contexts/FinanceAuthContext';
// import { useOwnerAuth } from '../../contexts/OwnerAuthContext';
// import { useAuth } from '../../contexts/AuthContext';

// import { useNextHplno } from '../../hooks/useNextHplno'; // Import the hook

// interface Step1Props {
//   errors: Record<string, string>;
// }

// const loanStatusOptions = [
//   { value: 'active', label: 'Active' },
//   { value: 'close', label: 'Closed' },
//   { value: 'seized', label: 'Seized' },
// ];

// const fatherNameUnits = [
//   { value: 'S/O', label: 'S/O (Son of)' },
//   { value: 'H/O', label: 'H/O (Husband of)' },
//   { value: 'D/O', label: 'D/O (Daughter of)' },
//   { value: 'W/O', label: 'W/O (Wife of)' },
  
// ];

// const govtIdOptions = [
//   { value: 'pan_card', label: 'PAN Card' },
//   { value: 'voter_id', label: 'Voter ID' },
//   { value: 'driving_license', label: 'Driving License' },
//   { value: 'other', label: 'Other' },
// ];

// // Step1CustomerDetails.tsx
// export const Step1CustomerDetails: React.FC<Step1Props> = ({ errors }) => {
//   const { customer, updateCustomer } = useFormStore();
//   const { owner } = useOwnerAuth();
//   const { nextHplno, loading, error } = useNextHplno();
//   const [hasManuallyEdited, setHasManuallyEdited] = useState(false);
  
//   // Only set auto-generated value if user hasn't manually edited
//   useEffect(() => {
//     if (nextHplno && !hasManuallyEdited && !customer.hplno.trim()) {
//       updateCustomer({ hplno: nextHplno });
//     }
//   }, [nextHplno, hasManuallyEdited, customer.hplno, updateCustomer]);

//   const handleHplnoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const value = e.target.value.replace(/\D/g, '');
//     if (!hasManuallyEdited && value !== nextHplno) {
//       setHasManuallyEdited(true);
//     }
//     updateCustomer({ hplno: value });
//   };

//   const handleResetToAuto = () => {
//     setHasManuallyEdited(false);
//     if (nextHplno) {
//       updateCustomer({ hplno: nextHplno });
//     }
//   };

//   // Rest of the component...
// const handleContactChange = (contacts: any[]) => {
//     updateCustomer({ ccontacts: contacts });
//   };


//   return (
//      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
//       {/* Personal Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <User className="w-5 h-4 text-primary" />
//           Personal Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <div>
//             <TextInput
//               label="HPL Number"
//               value={customer.hplno}
//               onChange={handleHplnoChange}
//               error={errors.hplno}
//               placeholder="Enter HPL Number"
//               required
//               disabled={loading}
//               inputMode="numeric"
//               pattern="[0-9]*"
//             />
//             {loading && (
//               <p className="text-xs text-muted-foreground mt-1">Loading next HPL number...</p>
//             )}
//             {error && (
//               <p className="text-xs text-destructive mt-1">{error}</p>
//             )}
//             {!loading && !error && nextHplno === customer.hplno && (
//               <p className="text-xs text-green-600 mt-1">
//                 Auto-generated HPL number
//               </p>
//             )}
//           </div>
//           <TextInput
//             label="Customer Name"
//             value={customer.cname}
//             onChange={(e) => updateCustomer({ cname: e.target.value })}
//             error={errors.cname}
//             placeholder="Enter customer name"
//             required
//           />
//           <div className="col-span-2 flex gap-1">
//             <SelectInput
//               label="Relation"
//               value={customer.cfname.unit}
//               onChange={(e) => updateCustomer({ 
//                 cfname: { ...customer.cfname, unit: e.target.value as any }
//               })}
//               options={fatherNameUnits}
//               containerClassName="w-32"
//             />
//             <TextInput
//               label="Father/Husband Name"
//               value={customer.cfname.value}
//               onChange={(e) => updateCustomer({ 
//                 cfname: { ...customer.cfname, value: e.target.value }
//               })}
//               error={errors['cfname.value']}
//               placeholder="Enter name"
//               containerClassName="flex-1"
//               required
//             />
//           </div>
//           {/* <SelectInput
//             label="Loan Status"
//             value={customer.loanStatus}
//             onChange={(e) => updateCustomer({ loanStatus: e.target.value as any })}
//             options={loanStatusOptions}
//             error={errors.loanStatus}
//             required
//           />
//           <TextInput
//             label="Broker Name"
//             value={customer.brokerName}
//             onChange={(e) => updateCustomer({ brokerName: e.target.value })}
//             error={errors.brokerName}
//             placeholder="Enter broker name"
//           /> */}
//         </div>
//       </section>
//       {/* Address */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <MapPin className="w-5 h-4 text-primary" />
//           Address
//         </h3>
//         <AddressForm
//           value={customer.caddress}
//           onChange={(address) => updateCustomer({ caddress: address })}
//           errors={errors}
//           financeId={String(owner?.id)}
//         />
//       </section>

//       {/* Profession Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Briefcase className="w-4 h-4 text-primary" />
//           Profession Details
//         </h3>
//         <div className="grid grid-cols-1 gap-2">
//           <TextInput
//             label="Profession"
//             value={customer.profession}
//             onChange={(e) => updateCustomer({ profession: e.target.value })}
//             error={errors.profession}
//             placeholder="Enter profession"
//           />
//           <TextInput
//             label="Work Office Address"
//             value={customer.work_office_address}
//             onChange={(e) => updateCustomer({ work_office_address: e.target.value })}
//             error={errors.work_office_address}
//             placeholder="Enter office address"
//             className="lg:col-span-2"
//           />
//           <TextInput
//             label="Work Office Phone"
//             value={customer.work_office_phone}
//             onChange={(e) => updateCustomer({ work_office_phone: e.target.value })}
//             error={errors.work_office_phone}
//             placeholder="Enter office phone"
//             maxLength={15}
//           />
//         </div>
//       </section>
//       {/* Photos */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Camera className="w-4 h-4 text-primary" />
//           Photos
//         </h3>
//         <div className="grid grid-cols-3 gap-2">
//           <FileInput
//             label="Customer Photo"
//             value={typeof customer.cphoto === 'string' ? null : customer.cphoto}
//             onChange={(file) => updateCustomer({ cphoto: file })}
//             error={errors.cphoto}
//             existingUrl={typeof customer.cphoto === 'string' ? customer.cphoto : undefined}
//           />

//           <FileInput
//             label="Vehicle Photo"
//             value={typeof customer.cvehiclePhoto === 'string' ? null : customer.cvehiclePhoto}
//             onChange={(file) => updateCustomer({ cvehiclePhoto: file })}
//             error={errors.cvehiclePhoto}
//             existingUrl={typeof customer.cvehiclePhoto === 'string' ? customer.cvehiclePhoto : undefined}
//           />

//           <FileInput
//             label="Property Photo"
//             value={typeof customer.cpropertyPhoto === 'string' ? null : customer.cpropertyPhoto}
//             onChange={(file) => updateCustomer({ cpropertyPhoto: file })}
//             error={errors.cpropertyPhoto}
//             existingUrl={typeof customer.cpropertyPhoto === 'string' ? customer.cpropertyPhoto : undefined}
//           />
//         </div>
//       </section>

      

//       {/* Contacts */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Phone className="w-5 h-5 text-primary" />
//           Contact Numbers
//         </h3>
//         <ContactInput
//           contacts={customer.ccontacts}
//           onChange={handleContactChange}
//           errors={errors}
//           contactType="customer"
//         />
//       </section>

//       {/* Government ID */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Shield className="w-4 h-4 text-primary" />
//           Government Identification
//         </h3>
//         <div className="grid grid-cols-1 gap-2">
//           <TextInput
//             label="Aadhar Number"
//             value={customer.aadhar_id}
//             onChange={(e) => updateCustomer({ aadhar_id: e.target.value })}
//             error={errors.aadhar_id}
//             placeholder="Enter 12-digit Aadhar"
//             maxLength={12}
//           />
//           <div className="grid grid-cols-2 gap-1">
//           <SelectInput
//             label="Other Govt ID Type"
//             value={customer.other_govt_id_type}
//             onChange={(e) => updateCustomer({ other_govt_id_type: e.target.value as any })}
//             options={govtIdOptions}
//             error={errors.other_govt_id_type}
//           />
//           <TextInput
//             label="Other Govt ID Number"
//             value={customer.other_govt_id_number}
//             onChange={(e) => updateCustomer({ other_govt_id_number: e.target.value })}
//             error={errors.other_govt_id_number}
//             placeholder="Enter ID number"
//           />
//           </div>
//         </div>
//       </section>
//     </div>
//   );
// };

import { useEffect, useState, useRef } from 'react';
import { TextInput } from './TextInput';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { SelectInput } from './SelectInput';
import { FileInput } from './FileInput';
import { AddressForm } from './AddressForm';
import { ContactInput } from './ContactInput'; // We'll create this
import { ContactList } from './ContactList';
import { useFormStore } from '../../types/formStore';
import { User, MapPin, Phone, Camera, Briefcase, Shield } from 'lucide-react';
// import { useFinanceAuth } from '../../contexts/FinanceAuthContext';
import { useOwnerAuth } from '../../contexts/OwnerAuthContext';
import { useAuth } from '../../contexts/AuthContext';

import { useNextHplno } from '../../hooks/useNextHplno'; // Import the hook

interface Step1Props {
  errors: Record<string, string>;
}

const loanStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'close', label: 'Closed' },
  { value: 'seized', label: 'Seized' },
];

const fatherNameUnits = [
  { value: 'S/O', label: 'S/O (Son of)' },
  { value: 'H/O', label: 'H/O (Husband of)' },
  { value: 'D/O', label: 'D/O (Daughter of)' },
  { value: 'W/O', label: 'W/O (Wife of)' },
  
];

const govtIdOptions = [
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'other', label: 'Other' },
];

// Step1CustomerDetails.tsx
export const Step1CustomerDetails: React.FC<Step1Props> = ({ errors }) => {
  const { customer, updateCustomer } = useFormStore();
  const { owner } = useOwnerAuth();
  const { currentFinance } = useAuth();
  const { nextHplno, loading, error } = useNextHplno();
  const [hasManuallyEdited, setHasManuallyEdited] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  
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
  
  // Only set auto-generated value if user hasn't manually edited
  useEffect(() => {
    if (nextHplno && !hasManuallyEdited && !customer.hplno.trim()) {
      updateCustomer({ hplno: nextHplno });
    }
  }, [nextHplno, hasManuallyEdited, customer.hplno, updateCustomer]);

  const handleHplnoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (!hasManuallyEdited && value !== nextHplno) {
      setHasManuallyEdited(true);
    }
    updateCustomer({ hplno: value });
  };

  const handleResetToAuto = () => {
    setHasManuallyEdited(false);
    if (nextHplno) {
      updateCustomer({ hplno: nextHplno });
    }
  };

  // Rest of the component...
const handleContactChange = (contacts: any[]) => {
    updateCustomer({ ccontacts: contacts });
  };


  return (
     <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Left Column - Personal Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <User className="w-5 h-4 text-primary" />
          Personal Details
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <TextInput
              label="HPL Number"
              value={customer.hplno}
              onChange={handleHplnoChange}
              error={errors.hplno}
              placeholder="Enter HPL Number"
              required
              disabled={loading}
              inputMode="numeric"
              pattern="[0-9]*"
            />
            {loading && (
              <p className="text-xs text-muted-foreground mt-1">Loading next HPL number...</p>
            )}
            {error && (
              <p className="text-xs text-destructive mt-1">{error}</p>
            )}
            {!loading && !error && nextHplno === customer.hplno && (
              <p className="text-xs text-green-600 mt-1">
                Auto-generated HPL number
              </p>
            )}
          </div>
          <CapitalizedInput
            label="Customer Name"
            casing="words"
            value={customer.cname}
            onChange={(e) => updateCustomer({ cname: e.target.value })}
            error={errors.cname}
            placeholder="Enter customer name"
            required
          />
          <div className="col-span-2 flex gap-2">
            <SelectInput
              label="Relation"
              value={customer.cfname.unit}
              onChange={(e) => updateCustomer({ 
                cfname: { ...customer.cfname, unit: e.target.value as any }
              })}
              options={fatherNameUnits}
              containerClassName="w-32"
            />
            <CapitalizedInput
              label="Father/Husband Name"
              casing="words"
              value={customer.cfname.value}
              onChange={(e) => updateCustomer({ 
                cfname: { ...customer.cfname, value: e.target.value }
              })}
              error={errors['cfname.value']}
              placeholder="Enter name"
              containerClassName="flex-1"
              required
            />
          </div>
          
          {/* Contact Numbers - inside Personal Details */}
          <div className="col-span-2 mt-4">
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              Contact Numbers
            </h4>
            <ContactInput
              contacts={customer.ccontacts}
              onChange={handleContactChange}
              errors={errors}
              contactType="customer"
            />
          </div>
        </div>
      </section>

      {/* Right Column - Address */}
      <section className="form-section lg:col-span-2">
        <h3 className="form-section-title">
          <MapPin className="w-5 h-4 text-primary" />
          Address
        </h3>
        <AddressForm
          value={customer.caddress}
          onChange={(address) => updateCustomer({ caddress: address })}
          errors={errors}
          financeId={String(currentFinance?.id ?? owner?.id ?? '')}
        />
      </section>

      {/* Photos */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Camera className="w-4 h-4 text-primary" />
          Photos
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <FileInput
            label="Customer Photo"
            value={typeof customer.cphoto === 'string' ? null : (customer.cphoto as any)}
            onChange={(file) => updateCustomer({ cphoto: file })}
            error={errors.cphoto}
            existingUrl={typeof customer.cphoto === 'string' ? customer.cphoto : (customer.cphoto as any)?.signed_url || (customer.cphoto as any)?.original_url}
            enableCamera={true}
            enableCrop={true}
            aspectRatio={3 / 4}
          />

          <FileInput
            label="Property Photo"
            value={typeof customer.cpropertyPhoto === 'string' ? null : (customer.cpropertyPhoto as any)}
            onChange={(file) => updateCustomer({ cpropertyPhoto: file })}
            error={errors.cpropertyPhoto}
            existingUrl={typeof customer.cpropertyPhoto === 'string' ? customer.cpropertyPhoto : (customer.cpropertyPhoto as any)?.signed_url || (customer.cpropertyPhoto as any)?.original_url}
            enableCamera={true}
            enableCrop={true}
            aspectRatio={4 / 3}
          />
        </div>
      </section>

      {/* Full Width Bottom - Professional Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Briefcase className="w-4 h-4 text-primary" />
          Professional Details
        </h3>
        <div className="grid gap-2">
          <CapitalizedInput
            label="Profession"
            casing="words"
            value={customer.profession}
            onChange={(e) => updateCustomer({ profession: e.target.value })}
            error={errors.profession}
            placeholder="Enter profession"
          />
          <TextInput
            label="Work Office Phone"
            value={customer.work_office_phone}
            onChange={(e) => updateCustomer({ work_office_phone: e.target.value })}
            error={errors.work_office_phone}
            placeholder="Enter office phone"
            maxLength={15}
            type="tel"
          />
          <CapitalizedInput
            label="Work Office Address"
            casing="words"
            value={customer.work_office_address}
            onChange={(e) => updateCustomer({ work_office_address: e.target.value })}
            error={errors.work_office_address}
            placeholder="Enter office address"
            containerClassName="col-span-2"
          />
        </div>
      </section>

      {/* Government ID */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Shield className="w-4 h-4 text-primary" />
          Government Identification
        </h3>
        <div className="grid grid-cols-1 gap-2">
          <TextInput
            label="Aadhar Number"
            value={customer.aadhar_id}
            onChange={(e) => updateCustomer({ aadhar_id: e.target.value })}
            error={errors.aadhar_id}
            placeholder="Enter 12-digit Aadhar"
            maxLength={12}
            inputMode="numeric"
          />
          <div className="grid grid-cols-2 gap-1">
          <SelectInput
            label="Other Govt ID Type"
            value={customer.other_govt_id_type}
            onChange={(e) => updateCustomer({ other_govt_id_type: e.target.value as any })}
            options={govtIdOptions}
            error={errors.other_govt_id_type}
          />
          <CapitalizedInput
            label="Other Govt ID Number"
            casing="upper"
            value={customer.other_govt_id_number}
            onChange={(e) => updateCustomer({ other_govt_id_number: e.target.value })}
            error={errors.other_govt_id_number}
            placeholder="Enter ID number"
          />
          </div>
        </div>
      </section>
    </div>
  );
};