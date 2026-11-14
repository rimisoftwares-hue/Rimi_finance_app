import React, { lazy, Suspense, useState } from 'react';
import {
  Building2,
  CreditCard,
  Crosshair,
  Loader2,
  MapPin,
  Plus,
  Shield,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../api/apiClient';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DatePicker } from '../ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Textarea } from '../ui/textarea';
import { ImageUpload } from '../common/ImageUpload_DK';
import { useDeviceLocation } from '../common/map/useDeviceLocation';
import { isValidLatLng } from '../common/map/geo.utils';
import type { MapPickResult } from '../common/map/MapPickerDialog';

const GeoMap = lazy(() => import('../common/map/GeoMap').then((m) => ({ default: m.GeoMap })));
const MapPickerDialog = lazy(() =>
  import('../common/map/MapPickerDialog').then((m) => ({ default: m.MapPickerDialog }))
);

export interface NewFinanceData {
  financeName: string;
  phoneNumbers: string[];
  emails: string[];
  houseNo: string;
  street: string;
  streetName: string;
  village: string;
  landmark: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  location: string;
  since: string;
  latitude: string;
  longitude: string;
  // Primary Bank details
  bankName: string;
  branch: string;
  ifscCode: string;
  accountNumber: string;
  accountName: string;
  upiId: string;
}

export const emptyFinance: NewFinanceData = {
  financeName: '',
  phoneNumbers: [''],
  emails: [''],
  houseNo: '',
  street: '',
  streetName: '',
  village: '',
  landmark: '',
  address: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  location: '',
  since: '',
  latitude: '',
  longitude: '',
  bankName: '',
  branch: '',
  ifscCode: '',
  accountNumber: '',
  accountName: '',
  upiId: '',
};

export interface AddFinanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authenticatedOwnerId?: string | number;
  authenticatedOwnerName?: string;
  onCreated?: () => Promise<void> | void;
}

export function AddFinanceDialog({
  open,
  onOpenChange,
  authenticatedOwnerId,
  authenticatedOwnerName,
  onCreated,
}: AddFinanceDialogProps) {
  const [form, setForm] = useState<NewFinanceData>({ ...emptyFinance });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { locate, modal: permissionModal, busy: locating } = useDeviceLocation();

  const latNum = form.latitude.trim() === '' ? null : Number(form.latitude);
  const lngNum = form.longitude.trim() === '' ? null : Number(form.longitude);
  const coordsPartial = (latNum === null) !== (lngNum === null);
  const coordsInvalid = latNum !== null && lngNum !== null && !isValidLatLng(latNum, lngNum);
  const coordsOk = latNum !== null && lngNum !== null && !coordsInvalid;

  const handleReset = () => {
    setForm({ ...emptyFinance });
    setLogoFile(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleReset();
    }
    onOpenChange(nextOpen);
  };

  const useMyLocation = async () => {
    const res = await locate();
    if (res.granted && res.data) {
      setForm((f) => ({
        ...f,
        latitude: res.data!.latitude.toFixed(7),
        longitude: res.data!.longitude.toFixed(7),
      }));
      if ((res.data.accuracy ?? 0) > 500) {
        toast.info('Location is approximate. Fine-tune it on the map.');
      }
    } else if (res.error && !res.blocked) {
      toast.error('Could not read your location. Use the map to pick it.');
    }
  };

  const applyPick = ({ lat, lng, address }: MapPickResult) => {
    setForm((f) => ({
      ...f,
      latitude: lat.toFixed(7),
      longitude: lng.toFixed(7),
      houseNo: f.houseNo || address?.houseNo || '',
      street: f.street || address?.street || '',
      village: f.village || address?.village || '',
      city: f.city || address?.city || '',
      district: f.district || address?.district || '',
      pincode: f.pincode || address?.pincode || '',
      // keep state as is
    }));
    toast.success('Location saved. Empty address fields were filled from the map.');
  };

  const handleCreate = async () => {
    if (!form.financeName.trim()) {
      toast.error('Please enter a finance company name');
      return;
    }
    const validPhones = form.phoneNumbers.filter((p) => p.trim());
    if (validPhones.length === 0) {
      toast.error('Please enter at least one phone number');
      return;
    }

    if (coordsPartial) {
      toast.error('Enter both latitude and longitude, or leave both empty.');
      return;
    }
    if (coordsInvalid) {
      toast.error('Coordinates are out of range.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('finance_name', form.financeName.trim());
      formData.append('phone_numbers', JSON.stringify(validPhones));
      formData.append('emails', JSON.stringify(form.emails.filter((e) => e.trim())));
      if (form.since) formData.append('since', form.since);

      if (form.houseNo) formData.append('house_no', form.houseNo);
      if (form.street) formData.append('street', form.street);
      if (form.streetName) formData.append('street_name', form.streetName);
      if (form.village) formData.append('village', form.village);
      if (form.landmark) formData.append('landmark', form.landmark);
      if (form.address) formData.append('address', form.address);
      if (form.city) formData.append('city', form.city);
      if (form.district) formData.append('district', form.district);
      if (form.state) formData.append('state', form.state);
      if (form.pincode) formData.append('pincode', form.pincode);
      if (form.location) formData.append('location', form.location);

      if (coordsOk && latNum !== null && lngNum !== null) {
        formData.append('latitude', String(latNum));
        formData.append('longitude', String(lngNum));
      }

      if (form.bankName) formData.append('bank_name', form.bankName.trim());
      if (form.branch) formData.append('branch', form.branch.trim());
      if (form.ifscCode) formData.append('ifsc_code', form.ifscCode.trim().toUpperCase());
      if (form.accountNumber) formData.append('account_number', form.accountNumber.trim());
      if (form.accountName) formData.append('account_name', form.accountName.trim());
      if (form.upiId) formData.append('upi_id', form.upiId.trim());

      if (authenticatedOwnerId) {
        formData.append('owner_id', String(authenticatedOwnerId));
      }

      if (logoFile) {
        formData.append('company_logo', logoFile);
      }

      const response = await apiClient.post('/finance/create', formData);

      if (response.data?.success) {
        toast.success('New finance company created successfully!');
        handleReset();
        onOpenChange(false);
        if (onCreated) {
          await onCreated();
        }
      } else {
        toast.error(response.data?.error || 'Failed to create finance company');
      }
    } catch (err: any) {
      console.error('Error creating finance:', err);
      toast.error(err?.response?.data?.error || err.message || 'Failed to create finance company');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Create New Finance Company
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Authenticated Owner Context Badge */}
            {authenticatedOwnerName && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <Shield className="h-4 w-4 shrink-0" />
                  <span>
                    License ID: <strong className="text-foreground">{authenticatedOwnerName}</strong>
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-background/50 border-primary/30 text-primary">
                  Owner Authenticated
                </Badge>
              </div>
            )}

            {/* Basic Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Basic Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Finance Name *</Label>
                  <Input
                    value={form.financeName}
                    onChange={(e) => setForm({ ...form, financeName: e.target.value })}
                    placeholder="e.g., ABC Finance Ltd."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Established Since (Date)</Label>
                  <DatePicker
                    value={form.since}
                    onValueChange={(val) => setForm({ ...form, since: val })}
                    placeholder="Pick established date"
                    className="w-full"
                    max={new Date()}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Company Logo Upload */}
            <div className="space-y-1">
              <ImageUpload
                label="Company Logo (1:1 Ratio)"
                value={logoFile}
                onChange={(f) => setLogoFile(f instanceof File ? f : null)}
                enableCrop={true}
                aspectRatio={1}
                className="w-full"
              />
              <p className="text-[11px] text-muted-foreground">
                Uploaded securely to AWS S3 storage under folder{' '}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">finance/</code>
              </p>
            </div>

            <Separator />

            {/* Primary Bank Account Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Primary Bank Account Details</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name</Label>
                  <Input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    placeholder="e.g., State Bank of India"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number</Label>
                  <Input
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                    placeholder="e.g., 50100234567890"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    value={form.ifscCode}
                    onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
                    placeholder="e.g., SBIN0001234"
                    maxLength={11}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Branch</Label>
                  <Input
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="e.g., Main Branch"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Holder Name</Label>
                  <Input
                    value={form.accountName}
                    onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                    placeholder="Defaults to Finance Name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UPI ID (Optional)</Label>
                  <Input
                    value={form.upiId}
                    onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                    placeholder="e.g., abcdfinance@okhdfcbank"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Phone Numbers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Phone Numbers *</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary"
                  onClick={() => setForm({ ...form, phoneNumbers: [...form.phoneNumbers, ''] })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.phoneNumbers.map((ph, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={ph}
                    onChange={(e) => {
                      const p = [...form.phoneNumbers];
                      p[i] = e.target.value;
                      setForm({ ...form, phoneNumbers: p });
                    }}
                    placeholder="+91 9876543210"
                  />
                  {form.phoneNumbers.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-destructive"
                      onClick={() => {
                        const p = [...form.phoneNumbers];
                        p.splice(i, 1);
                        setForm({ ...form, phoneNumbers: p });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Emails */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Email Addresses</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary"
                  onClick={() => setForm({ ...form, emails: [...form.emails, ''] })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.emails.map((em, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={em}
                    onChange={(e) => {
                      const emails = [...form.emails];
                      emails[i] = e.target.value;
                      setForm({ ...form, emails });
                    }}
                    placeholder="contact@finance.com"
                  />
                  {form.emails.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-destructive"
                      onClick={() => {
                        const emails = [...form.emails];
                        emails.splice(i, 1);
                        setForm({ ...form, emails });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Separator />

            {/* Address */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Address Details</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Building No</Label>
                  <Input
                    value={form.houseNo}
                    onChange={(e) => setForm({ ...form, houseNo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Street</Label>
                  <Input
                    value={form.street}
                    onChange={(e) => setForm({ ...form, street: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Street Name</Label>
                  <Input
                    value={form.streetName}
                    onChange={(e) => setForm({ ...form, streetName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Village / Area</Label>
                  <Input
                    value={form.village}
                    onChange={(e) => setForm({ ...form, village: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Landmark</Label>
                  <Input
                    value={form.landmark}
                    onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Additional Info</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Road, building, floor details"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">City *</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">District *</Label>
                  <Input
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">State *</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pincode *</Label>
                  <Input
                    value={form.pincode}
                    onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                    maxLength={6}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location (GPS / Maps Link)</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Google Maps link or coordinates"
                />
              </div>

              {/* Office Location Map Section */}
              <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
                    <Label className="text-xs font-semibold text-foreground">Office Location (Coordinates)</Label>
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      placeholder="e.g. 11.016844"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      placeholder="e.g. 76.955832"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {coordsPartial && (
                  <p className="text-[11px] text-amber-500 font-medium">
                    Enter both latitude and longitude, or leave both empty.
                  </p>
                )}
                {coordsInvalid && (
                  <p className="text-[11px] text-destructive font-medium">
                    Coordinates are out of range.
                  </p>
                )}

                {coordsOk && latNum !== null && lngNum !== null && (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Suspense fallback={<div className="h-40 w-full animate-pulse bg-muted" />}>
                      <GeoMap
                        compact
                        height={160}
                        markers={[{ id: 'office', position: [latNum, lngNum], kind: 'office' }]}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                disabled={isSubmitting}
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  isSubmitting ||
                  !form.financeName.trim() ||
                  form.phoneNumbers.filter((p) => p.trim()).length === 0 ||
                  coordsPartial ||
                  coordsInvalid
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Finance...
                  </>
                ) : (
                  'Create Finance'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permission Modal */}
      {permissionModal}

      {/* Map Picker Dialog (Lazy loaded) */}
      {pickerOpen && (
        <Suspense fallback={null}>
          <MapPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            value={coordsOk && latNum !== null && lngNum !== null ? [latNum, lngNum] : null}
            title="Pick office location"
            onConfirm={applyPick}
          />
        </Suspense>
      )}
    </>
  );
}

