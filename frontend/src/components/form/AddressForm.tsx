import React, { useState, useEffect, useCallback } from 'react';
import { TextInput } from './TextInput';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { AutoSuggestInput } from './AutoSuggestInput';
import { Addresses } from '../../types/formStore';
import { Building, MapPin, Navigation } from 'lucide-react';
import apiClient from '../../api/apiClient';

interface AddressFormProps {
  value: Addresses;
  onChange: (address: Addresses) => void;
  errors?: Partial<Record<keyof Addresses, string>>;
  prefix?: string;
  financeId?: string; // Pass financeId from parent
}

export const AddressForm: React.FC<AddressFormProps> = ({
  value,
  onChange,
  errors = {},
  prefix = '',
  financeId
}) => {
  const [isLoadingDefault, setIsLoadingDefault] = useState(false);
  const [filters, setFilters] = useState({
    state: value.state || '',
    district: value.district || '',
    city: value.city || ''
  });

  // Fetch default address from finance on component mount
  useEffect(() => {
    if (financeId) {
      fetchDefaultAddress();
    }
  }, [financeId]);

  const fetchDefaultAddress = async () => {
    setIsLoadingDefault(true);
    try {
      const response = await apiClient.get('/finance/default-address');
      
      const { data } = response;
      
      if (data.success && data.defaultAddress) {
        const { city, district, state } = data.defaultAddress;
        const updatedAddress = {
          ...value,
          city: city || value.city,
          district: district || value.district,
          state: state || value.state
        };
        onChange(updatedAddress);
        updateFilters({ city, district, state });
      }
    } catch (error: any) {
      console.error('Error fetching default address:', error);
      if (error?.response?.status === 401) {
        // Handle unauthorized access
        console.error('Unauthorized access - token might be invalid');
      } else if (error?.response?.status === 404) {
        // Handle not found
        console.error('Finance default address not found');
      }
    } finally {
      setIsLoadingDefault(false);
    }
  };

  // Update filters when address changes
  const updateFilters = useCallback((newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Handle field changes with filter updates
  const handleFieldChange = useCallback((field: keyof Addresses, newValue: string) => {
    const updatedAddress = { ...value, [field]: newValue };
    onChange(updatedAddress);

    // Update filters based on field hierarchy
    if (field === 'state') {
      updateFilters({ state: newValue, district: '', city: '' });
      // Clear dependent fields
      onChange({ ...updatedAddress, district: '', city: '' });
    } else if (field === 'district') {
      updateFilters({ district: newValue, city: '' });
      // Clear dependent field
      onChange({ ...updatedAddress, city: '' });
    } else if (field === 'city') {
      updateFilters({ city: newValue });
    }
  }, [value, onChange, updateFilters]);

  // Handle pincode change - auto-fill city, district, state
  const handlePincodeChange = useCallback(async (pincode: string) => {
    const updatedAddress = { ...value, pincode };
    onChange(updatedAddress);

    if (pincode.length === 6) {
      try {
        const response = await apiClient.get(`/address/by-pincode/${pincode}`);
        if (response.data.success && response.data.address) {
          const { city, district, state } = response.data.address;
          const newAddress = {
            ...updatedAddress,
            city: city || updatedAddress.city,
            district: district || updatedAddress.district,
            state: state || updatedAddress.state
          };
          onChange(newAddress);
          updateFilters({ city, district, state });
        }
      } catch (error) {
        console.error('Error fetching address by pincode:', error);
      }
    }
  }, [value, onChange, updateFilters]);

  // Build full field name for errors with prefix
  const getError = useCallback((field: keyof Addresses) => {
    const fieldName = prefix ? `${prefix}.${String(field)}` : String(field);
    return errors[field] || (errors as any)[fieldName];
  }, [errors, prefix]);

  return (
    <div className="space-y-4">
      {isLoadingDefault && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Navigation className="w-4 h-4 animate-spin" />
          Loading default address from finance...
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Basic Fields (No Suggestions) */}
        <div className="grid grid-cols-2 col-span-1 gap-2">
          <CapitalizedInput
            label="House No."
            casing="upper"
            value={value.house_no || ''}
            onChange={(e) => onChange({ ...value, house_no: e.target.value })}
            error={getError('house_no')}
            placeholder="House no"
          />
          
          <CapitalizedInput
            label="Street"
            casing="words"
            value={value.street || ''}
            onChange={(e) => onChange({ ...value, street: e.target.value })}
            error={getError('street')}
            placeholder="Street no"
          />
        </div>
        {/* Auto-suggest Fields */}
        <div className="col-span-2">
        <AutoSuggestInput
          label="Street Name"
          value={value.street_name || ''}
          onChange={(newValue) => handleFieldChange('street_name', newValue)}
          error={getError('street_name')}
          placeholder="Street Name"
          field="street_name"
          filters={filters}
        />
        </div>
        <AutoSuggestInput
          label="Village/Area"
          value={value.village || ''}
          onChange={(newValue) => handleFieldChange('village', newValue)}
          error={getError('village')}
          placeholder="Village/Area"
          field="village"
          filters={filters}
        />
        
        <CapitalizedInput
          label="Land Mark"
          casing="words"
          value={value.land_mark || ''}
          onChange={(e) => onChange({ ...value, land_mark : e.target.value })}
          error={getError('land_mark')}
          placeholder="Land Mark"
        />
        <div className="col-span-3">
          <CapitalizedInput
            label="Additional Info"
            casing="words"
            value={value.address || ''}
            onChange={(e) => onChange({ ...value, address : e.target.value })}
            error={getError('address')}
            placeholder="Enter any Additional Info Road, Building, House etc.."
          />
        </div>

        <TextInput
          label="Pincode"
          value={value.pincode || ''}
          onChange={(e) => handlePincodeChange(e.target.value)}
          error={getError('pincode')}
          placeholder="Pincode"
          maxLength={6}
          required
        />
        
        <CapitalizedInput
          label="Location"
          casing="words"
          value={value.location || ''}
          onChange={(e) => onChange({ ...value, location: e.target.value })}
          error={getError('location')}
          placeholder="Location"
          containerClassName="lg:col-span-2"
        />
        <AutoSuggestInput
          label="City"
          value={value.city || ''}
          onChange={(newValue) => handleFieldChange('city', newValue)}
          error={getError('city')}
          placeholder="City"
          field="city"
          filters={{ state: filters.state, district: filters.district }}
          disabled={!filters.state || !filters.district}
        />
        
        <AutoSuggestInput
          label="District"
          value={value.district || ''}
          onChange={(newValue) => handleFieldChange('district', newValue)}
          error={getError('district')}
          placeholder="District"
          field="district"
          filters={{ state: filters.state }}
          disabled={!filters.state}
        />
        
        <AutoSuggestInput
          label="State"
          value={value.state || ''}
          onChange={(newValue) => handleFieldChange('state', newValue)}
          error={getError('state')}
          placeholder="State"
          field="state"
        />
        
        
      </div>

      {/* Filter Status Display */}
      {(filters.state || filters.district || filters.city) && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
          <MapPin className="w-3 h-3" />
          <span>Suggestions filtered by: </span>
          {filters.state && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">
              State: {filters.state}
            </span>
          )}
          {filters.district && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">
              District: {filters.district}
            </span>
          )}
          {filters.city && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">
              City: {filters.city}
            </span>
          )}
        </div>
      )}
    </div>
  );
};