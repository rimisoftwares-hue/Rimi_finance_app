import React from 'react';
import { SelectInput } from './SelectInput';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { Plus, Trash2 } from 'lucide-react';
import { CustomerContact } from '../../types/formStore';

interface ContactInputProps {
  contacts: CustomerContact[];
  onChange: (contacts: CustomerContact[]) => void;
  errors?: Record<string, string>;
  contactType: 'customer' | 'guardian';
}

export const ContactInput: React.FC<ContactInputProps> = ({
  contacts,
  onChange,
  errors = {},
  contactType,
}) => {
  const handleAdd = () => {
    onChange([...contacts, { contact_type: contactType, type: 'mobile', number: '' }]);
  };

  const handleRemove = (index: number) => {
    if (contacts.length > 1) {
      onChange(contacts.filter((_, i) => i !== index));
    }
  };

  const handleChange = (index: number, field: keyof CustomerContact, value: string) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const typeOptions = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'landline', label: 'Landline' },
    { value: 'work', label: 'Work' },
  ];

  return (
    <div className="space-y-4">
      {contacts.map((contact, index) => {
        const fieldError =
          errors[`${contactType}.contacts.${index}`] ||
          errors[`guardian.contacts.${index}`] ||
          errors[`contacts.${index}`] ||
          (index === 0 ? (errors[`${contactType}.contacts`] || errors.contacts) : undefined);

        return (
          <div key={index} className="flex items-end gap-2">
            <SelectInput
              label={`Contact Type ${index + 1}`}
              value={contact.type}
              onChange={(e) => handleChange(index, 'type', e.target.value)}
              options={typeOptions}
              containerClassName="w-32"
            />
            <div className="flex-1">
              <CapitalizedInput
                label={`Phone Number ${index + 1}${index === 0 ? ' *' : ''}`}
                casing="none"
                value={contact.number}
                onChange={(e) => handleChange(index, 'number', e.target.value)}
                error={fieldError}
                placeholder="Enter 10-digit phone number"
                type="tel"
                maxLength={15}
              />
            </div>
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="p-2.5 mb-0.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Remove Contact"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Another Contact
      </button>
    </div>
  );
};