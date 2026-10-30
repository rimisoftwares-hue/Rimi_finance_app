//import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CustomerContact } from '../types/customer';

interface ContactFieldsProps {
  contacts: CustomerContact[];
  onChange: (contacts: CustomerContact[]) => void;
}

export function ContactFields({ contacts =[], onChange }: ContactFieldsProps) {
  const addContact = () => {
    if (contacts.length < 3) {
      onChange([...contacts, { 
        contact_type: contacts[0]?.contact_type || 'customer', // Maintain contact type
        type: 'mobile', 
        number: '' 
      }]);
    }
  };

  const removeContact = (index: number) => {
    onChange(contacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof CustomerContact, value: string) => {
    const newContacts = [...contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    onChange(newContacts);
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Contact Numbers 
      </label>
      {contacts.map((contact, index) => (
        <div key={index} className="flex items-center space-x-4">
          <select
            value={contact.type}
            onChange={(e) => updateContact(index, 'type', e.target.value as CustomerContact['type'])}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          >
            <option value="mobile">Mobile</option>
            <option value="landline">Landline</option>
            <option value="work">Work</option>
          </select>
          <input
            type="tel"
            value={contact.number}
            onChange={(e) => updateContact(index, 'number', e.target.value)}
            placeholder="Enter contact number"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
          <button
            type="button"
            onClick={() => removeContact(index)}
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      ))}
      {contacts.length < 3 && (
        <button
          type="button"
          onClick={addContact}
          className="flex items-center text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Contact
        </button>
      )}
    </div>
  );
}