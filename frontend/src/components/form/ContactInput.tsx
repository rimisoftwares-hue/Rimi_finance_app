import React, { useEffect } from 'react';
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
  // Defensive initialization: guarantee at least one contact row
  const defaultContact: CustomerContact = {
    contact_type: contactType,
    type: 'mobile',
    number: '',
  };

  const effectiveContacts: CustomerContact[] =
    Array.isArray(contacts) && contacts.length > 0
      ? contacts
      : [defaultContact];

  // Auto-sync default row to parent if empty or undefined
  useEffect(() => {
    if (!Array.isArray(contacts) || contacts.length === 0) {
      onChange([defaultContact]);
    }
  }, [contacts, contactType, onChange]);

  const handleAdd = () => {
    onChange([
      ...effectiveContacts,
      { contact_type: contactType, type: 'mobile', number: '' },
    ]);
  };

  const handleRemove = (index: number) => {
    if (effectiveContacts.length > 1) {
      onChange(effectiveContacts.filter((_, i) => i !== index));
    }
  };

  const handleChange = (
    index: number,
    field: 'type' | 'number',
    value: string
  ) => {
    const updated: CustomerContact[] = [...effectiveContacts];
    if (field === 'type') {
      updated[index] = {
        ...updated[index],
        type: value as CustomerContact['type'],
      };
    } else {
      updated[index] = {
        ...updated[index],
        number: value,
      };
    }
    onChange(updated);
  };

  const typeOptions = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'landline', label: 'Landline' },
    { value: 'work', label: 'Work' },
  ];

  return (
    <div className="space-y-4">
      {effectiveContacts.map((contact, index) => {
        const fieldError =
          errors[`${contactType}.contacts.${index}`] ||
          errors[`ccontacts.${index}`] ||
          errors[`gcontacts.${index}`] ||
          errors[`guardian.contacts.${index}`] ||
          errors[`contacts.${index}`] ||
          (index === 0
            ? errors[`${contactType}.contacts`] ||
              errors[`ccontacts.0`] ||
              errors[`gcontacts.0`] ||
              errors[`guardian.contacts.0`] ||
              errors.contacts ||
              errors.gcontacts
            : undefined);

        return (
          <div key={index} className="flex items-start gap-2">
            <SelectInput
              label={`Contact Type ${index + 1}`}
              value={contact.type}
              onChange={(e) =>
                handleChange(index, 'type', e.target.value as 'mobile' | 'landline' | 'work')
              }
              options={typeOptions}
              containerClassName="w-32 shrink-0 sm:w-36"
              className="h-[42px] py-2 text-sm leading-normal"
            />
            <div className="flex-1 min-w-0">
              <CapitalizedInput
                label={`Phone Number ${index + 1}${index === 0 ? ' *' : ''}`}
                casing="none"
                value={contact.number}
                onChange={(e) => handleChange(index, 'number', e.target.value)}
                error={fieldError}
                placeholder="Enter 10-digit phone number"
                type="tel"
                maxLength={15}
                className="h-[42px] text-sm"
              />
            </div>
            {effectiveContacts.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="mt-7 h-[42px] w-[42px] shrink-0 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-lg transition-colors border border-transparent hover:border-destructive/20"
                title="Remove Contact"
                aria-label={`Remove Contact ${index + 1}`}
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
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Another Contact
      </button>
    </div>
  );
};