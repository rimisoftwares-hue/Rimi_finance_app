import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { TextInput } from './TextInput';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { AutoSuggestInput } from './AutoSuggestInput';
import { Addresses } from '../../types/formStore';
import { Crosshair, Loader2, MapPin, Navigation } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import apiClient from '../../api/apiClient';
import { useDeviceLocation, isValidLatLng } from '../common/map';
import type { MapPickResult } from '../common/map';

const GeoMap = lazy(() => import('../common/map/GeoMap').then((m) => ({ default: m.GeoMap })));
const MapPickerDialog = lazy(() =>
  import('../common/map/MapPickerDialog').then((m) => ({ default: m.MapPickerDialog }))
);

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const { locate, modal: permissionModal, busy: locating } = useDeviceLocation();

  const [filters, setFilters] = useState({
    state: value.state || '',
    district: value.district || '',
    city: value.city || ''
  });

  const latNum = !value.latitude || value.latitude.trim() === '' ? null : Number(value.latitude);
  const lngNum = !value.longitude || value.longitude.trim() === '' ? null : Number(value.longitude);
  const coordsPartial = (latNum === null) !== (lngNum === null);
  const coordsOutOfRange =
    latNum !== null && lngNum !== null && (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180);
  const coordsInvalid = (latNum !== null && lngNum !== null && !isValidLatLng(latNum, lngNum)) || coordsOutOfRange;
  const coordsOk = latNum !== null && lngNum !== null && !coordsInvalid;

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

  const useMyLocation = async () => {
    const res = await locate();
    if (res.granted && res.data) {
      const latStr = res.data.latitude.toFixed(7);
      const lngStr = res.data.longitude.toFixed(7);
      onChange({
        ...value,
        latitude: latStr,
        longitude: lngStr,
        location: `${latStr}, ${lngStr}`,
      });
      if ((res.data.accuracy ?? 0) > 500) {
        toast.info('Location is approximate. Fine-tune it on the map.');
      } else {
        toast.success('Current location captured.');
      }
    } else if (res.error && !res.blocked) {
      toast.error('Could not read your location. Use the map to pick it.');
    }
  };

  const applyPick = ({ lat, lng, address }: MapPickResult) => {
    const latStr = lat.toFixed(7);
    const lngStr = lng.toFixed(7);
    const updated: Addresses = {
      ...value,
      latitude: latStr,
      longitude: lngStr,
      location: `${latStr}, ${lngStr}`,
      house_no: value.house_no || address?.houseNo || '',
      street: value.street || address?.street || '',
      village: value.village || address?.village || '',
      city: value.city || address?.city || '',
      district: value.district || address?.district || '',
      state: value.state || address?.state || '',
      pincode: value.pincode || address?.pincode || '',
    };
    onChange(updated);
    if (address?.state || address?.district || address?.city) {
      updateFilters({
        state: updated.state,
        district: updated.district,
        city: updated.city,
      });
    }
    toast.success('Location updated. Empty address fields were filled from the map.');
  };

  const handleLatChange = (latVal: string) => {
    const nextLat = latVal;
    const curLng = value.longitude || '';
    const lNum = nextLat.trim() === '' ? null : Number(nextLat);
    const gNum = curLng.trim() === '' ? null : Number(curLng);
    const valid = lNum !== null && gNum !== null && isValidLatLng(lNum, gNum);
    onChange({
      ...value,
      latitude: nextLat,
      location: valid ? `${lNum.toFixed(7)}, ${gNum.toFixed(7)}` : value.location,
    });
  };

  const handleLngChange = (lngVal: string) => {
    const nextLng = lngVal;
    const curLat = value.latitude || '';
    const lNum = curLat.trim() === '' ? null : Number(curLat);
    const gNum = nextLng.trim() === '' ? null : Number(nextLng);
    const valid = lNum !== null && gNum !== null && isValidLatLng(lNum, gNum);
    onChange({
      ...value,
      longitude: nextLng,
      location: valid ? `${lNum.toFixed(7)}, ${gNum.toFixed(7)}` : value.location,
    });
  };

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

        {/* GPS and Interactive Map Section */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-3 rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              <Label className="text-xs font-semibold text-foreground">
                {prefix?.includes('guardian') ? 'Guardian Location Coordinates' : 'Customer Location Coordinates'}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={useMyLocation}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5 text-primary" />
                )}
                Use my location
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setPickerOpen(true)}
              >
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Pick on map
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Latitude (-90 to 90)</Label>
              <Input
                type="number"
                step="any"
                value={value.latitude || ''}
                onChange={(e) => handleLatChange(e.target.value)}
                placeholder="e.g. 11.016844"
                className="h-8 text-xs font-mono"
              />
              {getError('latitude') && (
                <p className="text-[11px] text-destructive">{getError('latitude')}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Longitude (-180 to 180)</Label>
              <Input
                type="number"
                step="any"
                value={value.longitude || ''}
                onChange={(e) => handleLngChange(e.target.value)}
                placeholder="e.g. 76.955832"
                className="h-8 text-xs font-mono"
              />
              {getError('longitude') && (
                <p className="text-[11px] text-destructive">{getError('longitude')}</p>
              )}
            </div>
          </div>

          {coordsPartial && (
            <p className="text-[11px] text-amber-500 font-medium">
              Enter both latitude and longitude, or leave both empty.
            </p>
          )}
          {coordsInvalid && (
            <p className="text-[11px] text-destructive font-medium">
              Coordinates are out of range (-90 to 90 for latitude, -180 to 180 for longitude).
            </p>
          )}

          {coordsOk && latNum !== null && lngNum !== null && (
            <div className="overflow-hidden rounded-lg border border-border">
              <Suspense fallback={<div className="h-[140px] w-full animate-pulse bg-muted" />}>
                <GeoMap
                  compact
                  height={140}
                  markers={[
                    {
                      id: `${prefix || 'customer'}-addr`,
                      position: [latNum, lngNum],
                      kind: prefix?.includes('guardian') ? 'custom' : 'customer',
                    },
                  ]}
                />
              </Suspense>
            </div>
          )}
        </div>
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

      {/* Permission Modal */}
      {permissionModal}

      {/* Map Picker Dialog (Lazy loaded) */}
      {pickerOpen && (
        <Suspense fallback={null}>
          <MapPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            value={coordsOk && latNum !== null && lngNum !== null ? [latNum, lngNum] : null}
            title={prefix?.includes('guardian') ? 'Pick guardian location' : 'Pick customer location'}
            onConfirm={applyPick}
          />
        </Suspense>
      )}
    </div>
  );
};