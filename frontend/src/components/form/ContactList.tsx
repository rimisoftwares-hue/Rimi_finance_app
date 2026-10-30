import React from 'react';
import { TextInput } from './TextInput';
import { Plus, Trash2 } from 'lucide-react';

interface ContactListProps {
  contacts: string[];
  onChange: (contacts: string[]) => void;
  errors?: string[];
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  onChange,
  errors = [],
}) => {
  const handleAdd = () => {
    onChange([...contacts, '']);
  };

  const handleRemove = (index: number) => {
    if (contacts.length > 1) {
      onChange(contacts.filter((_, i) => i !== index));
    }
  };

  const handleChange = (index: number, value: string) => {
    const updated = [...contacts];
    updated[index] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {contacts.map((contact, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextInput
            label={index === 0 ? 'Mobile Number' : `Mobile ${index + 1}`}
            value={contact}
            onChange={(e) => handleChange(index, e.target.value)}
            error={errors[index]}
            placeholder="Enter mobile number"
            type="tel"
            maxLength={10}
            containerClassName="flex-1"
          />
          {contacts.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="p-2.5 mb-0.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      ))}
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
