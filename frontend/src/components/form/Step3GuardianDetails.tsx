// import { useRef }from 'react';
// import { TextInput } from './TextInput';
// import { SelectInput } from './SelectInput';
// import { FileInput } from './FileInput';
// import { AddressForm } from './AddressForm';
// import { ContactInput } from './ContactInput';
// import { useFormStore } from '../../types/formStore';
// import { Shield, MapPin, Phone, Camera, Briefcase, User } from 'lucide-react';

// interface Step3Props {
//   errors: Record<string, string>;
// }

// const fatherNameUnits = [
//   { value: 'S/O', label: 'S/O (Son of)' },
//   { value: 'D/O', label: 'D/O (Daughter of)' },
//   { value: 'W/O', label: 'W/O (Wife of)' },
//   { value: 'H/O', label: 'H/O (Husband of)' },
// ];

// const govtIdOptions = [
//   { value: 'pan_card', label: 'PAN Card' },
//   { value: 'voter_id', label: 'Voter ID' },
//   { value: 'driving_license', label: 'Driving License' },
//   { value: 'other', label: 'Other' },
// ];

// export const Step3GuardianDetails: React.FC<Step3Props> = ({ errors }) => {
//   const { guardian, updateGuardian } = useFormStore();
//   const formRef = useRef<HTMLDivElement>(null);
  
//   const handleContactChange = (contacts: any[]) => {
//     updateGuardian({ gcontacts: contacts });
//   };

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

//   return (
//     <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
//       {/* Personal Details */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Shield className="w-5 h-5 text-primary" />
//           Guardian Personal Details
//         </h3>
//         <div className="grid grid-cols-2 gap-2">
//           <TextInput
//             label="Guardian Name"
//             value={guardian.gname}
//             onChange={(e) => updateGuardian({ gname: e.target.value })}
//             error={errors.gname}
//             placeholder="Enter guardian name"
//             required
//           />
//           <div className="col-span-2 flex gap-1">
//             <SelectInput
//               label="Relation"
//               value={guardian.gfname.unit}
//               onChange={(e) => updateGuardian({ 
//                 gfname: { ...guardian.gfname, unit: e.target.value as any }
//               })}
//               options={fatherNameUnits}
//               containerClassName="w-32"
//             />
//             <TextInput
//               label="Guardian relation Name"
//               value={guardian.gfname.value}
//               onChange={(e) => updateGuardian({ 
//                 gfname: { ...guardian.gfname, value: e.target.value }
//               })}
//               error={errors['gfname.value']}
//               placeholder="Enter father's name"
//               containerClassName="flex-1"
//               required
//             />
//           </div>
//           <div className="col-span-2">
//             <TextInput
//               label="Remarks"
//               value={guardian.remarks}
//               onChange={(e) => updateGuardian({ remarks: e.target.value })}
//               error={errors.remarks}
//               placeholder="Enter remarks"
//             />
//           </div>
//         </div>
//       </section>
//       {/* Address - Simplified for now */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <MapPin className="w-5 h-4 text-primary" />
//           Address
//         </h3>
//         <AddressForm
//           value={guardian.gaddress}
//           onChange={(address) => updateGuardian({ gaddress: address })}
//           errors={errors}
//           prefix="guardian"
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
//             value={guardian.profession}
//             onChange={(e) => updateGuardian({ profession: e.target.value })}
//             error={errors.profession}
//             placeholder="Enter profession"
//           />
//           <TextInput
//             label="Work Office Address"
//             value={guardian.work_office_address}
//             onChange={(e) => updateGuardian({ work_office_address: e.target.value })}
//             error={errors.work_office_address}
//             placeholder="Enter office address"
//             className="lg:col-span-2"
//           />
//           <TextInput
//             label="Work Office Phone"
//             value={guardian.work_office_phone}
//             onChange={(e) => updateGuardian({ work_office_phone: e.target.value })}
//             error={errors.work_office_phone}
//             placeholder="Enter office phone"
//             maxLength={15}
//           />
          
//         </div>
//       </section>
//       {/* Photos */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Camera className="w-5 h-5 text-primary" />
//           Guardian Photos
//         </h3>
//         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//           <FileInput
//             label="Guardian Photo"
//             value={typeof guardian.gphoto === 'string' ? null : guardian.gphoto}
//             onChange={(file) => updateGuardian({ gphoto: file })}
//             error={errors.gphoto}
//             existingUrl={typeof guardian.gphoto === 'string' ? guardian.gphoto : undefined}
//           />

//           <FileInput
//             label="Guardian Property Photo"
//             value={typeof guardian.gpropertyPhoto === 'string' ? null : guardian.gpropertyPhoto}
//             onChange={(file) => updateGuardian({ gpropertyPhoto: file })}
//             error={errors.gpropertyPhoto}
//             existingUrl={typeof guardian.gpropertyPhoto === 'string' ? guardian.gpropertyPhoto : undefined}
//           />
//         </div>
//       </section>

//       {/* Contacts */}
//       <section className="form-section">
//         <h3 className="form-section-title">
//           <Phone className="w-5 h-5 text-primary" />
//           Guardian Contact Numbers
//         </h3>
//         <ContactInput
//           contacts={guardian.gcontacts}
//           onChange={handleContactChange}
//           errors={errors}
//           contactType="guardian"
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
//             value={guardian.aadhar_id}
//             onChange={(e) => updateGuardian({ aadhar_id: e.target.value })}
//             error={errors.aadhar_id}
//             placeholder="Enter 12-digit Aadhar"
//             maxLength={12}
//           />
//           <div className="grid grid-cols-2 gap-1">
//             <SelectInput
//               label="Other Govt ID Type"
//               value={guardian.other_govt_id_type}
//               onChange={(e) => updateGuardian({ other_govt_id_type: e.target.value as any })}
//               options={govtIdOptions}
//               error={errors.other_govt_id_type}
//             />
//             <TextInput
//               label="Other Govt ID Number"
//               value={guardian.other_govt_id_number}
//               onChange={(e) => updateGuardian({ other_govt_id_number: e.target.value })}
//               error={errors.other_govt_id_number}
//               placeholder="Enter ID number"
//             />
//           </div>
//         </div>
//       </section>

      

      

      

      
//     </div>
//   );
// };


import { useRef } from 'react';
import { TextInput } from './TextInput';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { SelectInput } from './SelectInput';
import { FileInput } from './FileInput';
import { AddressForm } from './AddressForm';
import { ContactInput } from './ContactInput';
import { useFormStore } from '../../types/formStore';
import { Shield, MapPin, Phone, Camera, Briefcase, User } from 'lucide-react';

interface Step3Props {
  errors: Record<string, string>;
}

const fatherNameUnits = [
  { value: 'S/O', label: 'S/O (Son of)' },
  { value: 'D/O', label: 'D/O (Daughter of)' },
  { value: 'W/O', label: 'W/O (Wife of)' },
  { value: 'H/O', label: 'H/O (Husband of)' },
  { value: 'M/O', label: 'M/O (Mother of)' },
  { value: 'F/O', label: 'F/O (Father of)' },
];

const govtIdOptions = [
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'other', label: 'Other' },
];

export const Step3GuardianDetails: React.FC<Step3Props> = ({ errors }) => {
  const { guardian, updateGuardian } = useFormStore();
  const formRef = useRef<HTMLDivElement>(null);
  
  const handleContactChange = (contacts: any[]) => {
    updateGuardian({ gcontacts: contacts });
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

  return (
    <div ref={formRef} onKeyDown={handleKeyDown} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Left Column - Personal Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <User className="w-5 h-4 text-primary" />
          Guardian Personal Details
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <CapitalizedInput
            casing="words"
            label="Guardian Name"
            value={guardian.gname}
            onChange={(e) => updateGuardian({ gname: e.target.value })}
            error={errors.gname}
            placeholder="Enter guardian name"
            required
            containerClassName="col-span-2"
          />
          
          <div className="col-span-2 flex gap-2">
            <SelectInput
              label="Relation"
              value={guardian.gfname.unit}
              onChange={(e) => updateGuardian({ 
                gfname: { ...guardian.gfname, unit: e.target.value as any }
              })}
              options={fatherNameUnits}
              containerClassName="w-32"
            />
            <CapitalizedInput
              casing="words"
              label="Guardian Relation Name"
              value={guardian.gfname.value}
              onChange={(e) => updateGuardian({ 
                gfname: { ...guardian.gfname, value: e.target.value }
              })}
              error={errors['gfname.value']}
              placeholder="Enter relation name"
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
              contacts={guardian.gcontacts}
              onChange={handleContactChange}
              errors={errors}
              contactType="guardian"
            />
          </div>
        </div>
      </section>

      {/* Right Column - Address (spans 2 columns) */}
      <section className="form-section lg:col-span-2">
        <h3 className="form-section-title">
          <MapPin className="w-5 h-4 text-primary" />
          Address
        </h3>
        <AddressForm
          value={guardian.gaddress}
          onChange={(address) => updateGuardian({ gaddress: address })}
          errors={errors}
          prefix="guardian"
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
            label="Guardian Photo"
            value={typeof guardian.gphoto === 'string' ? null : (guardian.gphoto as any) instanceof File ? (guardian.gphoto as File) : null}
            onChange={(file) => updateGuardian({ gphoto: file })}
            error={errors.gphoto}
            existingUrl={
              typeof guardian.gphoto === 'string'
                ? guardian.gphoto
                : (guardian.gphoto as any)?.signed_url || (guardian.gphoto as any)?.original_url
            }
            enableCamera={true}
            enableCrop={true}
            aspectRatio={3 / 4}
          />

          <FileInput
            label="Property Photo"
            value={typeof guardian.gpropertyPhoto === 'string' ? null : (guardian.gpropertyPhoto as any) instanceof File ? (guardian.gpropertyPhoto as File) : null}
            onChange={(file) => updateGuardian({ gpropertyPhoto: file })}
            error={errors.gpropertyPhoto}
            existingUrl={
              typeof guardian.gpropertyPhoto === 'string'
                ? guardian.gpropertyPhoto
                : (guardian.gpropertyPhoto as any)?.signed_url || (guardian.gpropertyPhoto as any)?.original_url
            }
            enableCamera={true}
            enableCrop={true}
            aspectRatio={4 / 3}
          />
        </div>
      </section>

      {/* Professional Details */}
      <section className="form-section">
        <h3 className="form-section-title">
          <Briefcase className="w-4 h-4 text-primary" />
          Professional Details
        </h3>
        <div className="grid gap-2">
          <CapitalizedInput
            casing="words"
            label="Profession"
            value={guardian.profession}
            onChange={(e) => updateGuardian({ profession: e.target.value })}
            error={errors.profession}
            placeholder="Enter profession"
          />
          <TextInput
            label="Work Office Phone"
            value={guardian.work_office_phone}
            onChange={(e) => updateGuardian({ work_office_phone: e.target.value })}
            error={errors.work_office_phone}
            placeholder="Enter office phone"
            maxLength={15}
          />
          <CapitalizedInput
            casing="words"
            label="Work Office Address"
            value={guardian.work_office_address}
            onChange={(e) => updateGuardian({ work_office_address: e.target.value })}
            error={errors.work_office_address}
            placeholder="Enter office address"
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
            value={guardian.aadhar_id}
            onChange={(e) => updateGuardian({ aadhar_id: e.target.value })}
            error={errors.aadhar_id}
            placeholder="Enter 12-digit Aadhar"
            maxLength={12}
          />
          <div className="grid grid-cols-2 gap-1">
            <SelectInput
              label="Other Govt ID Type"
              value={guardian.other_govt_id_type}
              onChange={(e) => updateGuardian({ other_govt_id_type: e.target.value as any })}
              options={govtIdOptions}
              error={errors.other_govt_id_type}
            />
            <CapitalizedInput
              casing="upper"
              label="Other Govt ID Number"
              value={guardian.other_govt_id_number}
              onChange={(e) => updateGuardian({ other_govt_id_number: e.target.value })}
              error={errors.other_govt_id_number}
              placeholder="Enter ID number"
            />
          </div>
          <CapitalizedInput
            casing="words"
            label="Remarks"
            value={guardian.remarks}
            onChange={(e) => updateGuardian({ remarks: e.target.value })}
            error={errors.remarks}
            placeholder="Enter remarks"
          />
        </div>
      </section>
    </div>
  );
};