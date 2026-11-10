import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ImageUpload } from '../common/ImageUpload_DK';
import { DatePickerInput } from './DatePickerInput';
import { useToast } from '../../hooks/use-toast';
import { Loader2 } from 'lucide-react';
import apiClient from '../../api/apiClient';

interface VehicleInfoMaster {
  id: string | number;
  brand: string;
  model_name: string;
  make_year: number;
  fuel_type: string;
  engine_capacity: string;
  body_type?: string;
  base_price: number;
}

export interface SelectedVehicleOutput {
  id: string;
  vehicle_number: string;
  vehicle_modal: string;
  color: string;
  model_name: string;
  brand: string;
  type: string;
  isNewVehicle?: boolean;
  deal_type?: string;
  chassis_number?: string;
  engine_number?: string;
  base_price?: number;
  selling_price?: number;
  rc_status?: 'original' | 'duplicate' | 'not_available';
  rc_holder?: 'Company' | 'customer' | 'third_party' | 'pending';
  insurance_expiry_date?: string;
  vehicle_info_id?: string;
  frontImage?: File;
  sideImage?: File;
}

interface AddConsultingVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVehicleNumber?: string;
  onVehicleCreated: (vehicle: SelectedVehicleOutput) => void;
}

export const AddConsultingVehicleDialog: React.FC<AddConsultingVehicleDialogProps> = ({
  open,
  onOpenChange,
  initialVehicleNumber = '',
  onVehicleCreated,
}) => {
  const { toast } = useToast();

  // Master vehicle info state
  const [vehicleInfoList, setVehicleInfoList] = useState<VehicleInfoMaster[]>([]);
  const [uniqueBrands, setUniqueBrands] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<VehicleInfoMaster[]>([]);

  // Form Fields
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [selectedVehicleInfo, setSelectedVehicleInfo] = useState<VehicleInfoMaster | null>(null);
  const [vehicleModal, setVehicleModal] = useState('');
  const [color, setColor] = useState('');
  const [fuelType, setFuelType] = useState('petrol');
  const [chassisNumber, setChassisNumber] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [basePrice, setBasePrice] = useState<number | string>(0);
  const [sellingPrice, setSellingPrice] = useState<number | string>(0);
  const [rcStatus, setRcStatus] = useState<'original' | 'duplicate' | 'not_available'>('original');
  const [rcHolder, setRcHolder] = useState<'Company' | 'customer' | 'third_party' | 'pending'>('Company');
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState('');

  // Photos
  const [frontImage, setFrontImage] = useState<File | undefined>(undefined);
  const [sideImage, setSideImage] = useState<File | undefined>(undefined);

  // Status & Validation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch vehicle master info on mount
  useEffect(() => {
    let isMounted = true;
    const fetchMasterInfo = async () => {
      try {
        const response = await apiClient.get('/vehicles/info');
        if (isMounted && Array.isArray(response.data)) {
          setVehicleInfoList(response.data);
          const brands = [...new Set(response.data.map((item: VehicleInfoMaster) => item.brand).filter(Boolean))].sort();
          setUniqueBrands(brands);
        }
      } catch (err) {
        console.error('Failed to fetch vehicle info master:', err);
      }
    };
    fetchMasterInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  // Reset form whenever dialog opens
  useEffect(() => {
    if (open) {
      setVehicleNumber((initialVehicleNumber || '').trim().toUpperCase());
      setBrand('');
      setModel('');
      setSelectedVehicleInfo(null);
      setAvailableModels([]);
      setVehicleModal('');
      setColor('');
      setFuelType('petrol');
      setChassisNumber('');
      setEngineNumber('');
      setBasePrice(0);
      setSellingPrice(0);
      setRcStatus('original');
      setRcHolder('Company');
      setInsuranceExpiryDate('');
      setFrontImage(undefined);
      setSideImage(undefined);
      setFormErrors({});
      setIsSubmitting(false);
    }
  }, [open, initialVehicleNumber]);

  // Handle Brand selection
  const handleBrandChange = (selectedBrand: string) => {
    setBrand(selectedBrand);
    setModel('');
    setSelectedVehicleInfo(null);
    setVehicleModal('');
    setBasePrice(0);
    setSellingPrice(0);

    const models = vehicleInfoList.filter((item) => item.brand === selectedBrand);
    setAvailableModels(models);

    if (formErrors.brand) {
      setFormErrors((prev) => ({ ...prev, brand: '' }));
    }
  };

  // Handle Model selection
  const handleModelChange = (modelName: string) => {
    setModel(modelName);
    const matched = availableModels.find((m) => m.model_name === modelName) || null;
    setSelectedVehicleInfo(matched);

    if (matched) {
      const yearStr = matched.make_year ? String(matched.make_year) : '';
      setVehicleModal(yearStr);
      if (matched.fuel_type) {
        setFuelType(matched.fuel_type.toLowerCase());
      }
      const bPrice = matched.base_price || 0;
      setBasePrice(bPrice);
      setSellingPrice(bPrice);
    }

    if (formErrors.model) {
      setFormErrors((prev) => ({ ...prev, model: '' }));
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    const cleanNum = vehicleNumber.trim().toUpperCase();
    if (!cleanNum) {
      errors.vehicleNumber = 'Vehicle number is required';
    } else if (cleanNum.length < 5) {
      errors.vehicleNumber = 'Vehicle number is too short';
    }

    if (!brand) {
      errors.brand = 'Brand is required';
    }

    if (!model || !selectedVehicleInfo) {
      errors.model = 'Model is required from master list';
    }

    if (!vehicleModal.trim()) {
      errors.vehicleModal = 'Year / Model is required';
    }

    if (!color.trim()) {
      errors.color = 'Color is required';
    }

    if (!fuelType) {
      errors.fuelType = 'Fuel type is required';
    }

    if (basePrice === '' || Number(basePrice) < 0) {
      errors.basePrice = 'Base price must be a valid number';
    }

    if (sellingPrice === '' || Number(sellingPrice) < 0) {
      errors.sellingPrice = 'Selling price must be a valid number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!validate()) {
      toast({
        title: 'Validation Error',
        description: 'Please correct the highlighted fields before saving.',
        variant: 'destructive',
      });
      return;
    }

    const cleanNum = vehicleNumber.trim().toUpperCase();
    const numBasePrice = Number(basePrice) || 0;
    const numSellingPrice = Number(sellingPrice) || numBasePrice;
    const tempId = `temp_${Date.now()}`;

    // Construct format matching autocomplete search results + deferred fields
    const selectedVehicleData: SelectedVehicleOutput = {
      id: tempId,
      vehicle_number: cleanNum,
      vehicle_modal: vehicleModal.trim(),
      color: color.trim(),
      model_name: selectedVehicleInfo?.model_name || model,
      brand: selectedVehicleInfo?.brand || brand,
      type: selectedVehicleInfo?.body_type || (selectedVehicleInfo as any)?.type || 'scooter',
      isNewVehicle: true,
      deal_type: 'consulting',
      chassis_number: (chassisNumber || '').trim().toUpperCase(),
      engine_number: (engineNumber || '').trim().toUpperCase(),
      base_price: numBasePrice,
      selling_price: numSellingPrice,
      rc_status: rcStatus,
      rc_holder: rcHolder,
      insurance_expiry_date: insuranceExpiryDate || '',
      vehicle_info_id: selectedVehicleInfo?.id ? String(selectedVehicleInfo.id) : undefined,
      frontImage,
      sideImage,
    };

    toast({
      title: 'Vehicle Added & Selected',
      description: 'Vehicle details will be registered when the loan is submitted.',
    });

    onVehicleCreated(selectedVehicleData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent
        className="max-w-3xl w-full max-h-[90vh] flex flex-col p-4 sm:p-5"
        onPointerDownOutside={(e) => {
          if (isSubmitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 pb-2 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base sm:text-lg font-bold">Add Vehicle</DialogTitle>
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 font-medium text-xs">
              Deal Type: Consulting
            </Badge>
          </div>
        </DialogHeader>

        {/* Dialog Form Body - Div container to avoid nested HTML form submission */}
        <div className="flex-1 overflow-y-auto py-2 space-y-3.5 pr-1">
          {/* Section 1: Basic & Model Details */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Basic & Model Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Vehicle Number */}
              <div>
                <Label className="text-xs font-medium">Vehicle Number *</Label>
                <Input
                  className="h-8 text-xs uppercase"
                  placeholder="MH12AB1234"
                  value={vehicleNumber}
                  onChange={(e) => {
                    setVehicleNumber(e.target.value.toUpperCase());
                    if (formErrors.vehicleNumber) setFormErrors((p) => ({ ...p, vehicleNumber: '' }));
                  }}
                  disabled={isSubmitting}
                />
                {formErrors.vehicleNumber && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.vehicleNumber}</p>
                )}
              </div>

              {/* Brand */}
              <div>
                <Label className="text-xs font-medium">Brand *</Label>
                <Select value={brand} onValueChange={handleBrandChange} disabled={isSubmitting}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Brand" />
                  </SelectTrigger>
                  <SelectContent className="max-h-48">
                    {uniqueBrands.map((b) => (
                      <SelectItem key={b} value={b} className="text-xs">
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.brand && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.brand}</p>
                )}
              </div>

              {/* Model */}
              <div>
                <Label className="text-xs font-medium">Model *</Label>
                <Select
                  value={model}
                  onValueChange={handleModelChange}
                  disabled={isSubmitting || !brand || availableModels.length === 0}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={brand ? 'Select Model' : 'Choose Brand first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-48">
                    {availableModels.map((m) => (
                      <SelectItem key={m.id} value={m.model_name} className="text-xs">
                        {m.model_name} ({m.make_year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.model && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.model}</p>
                )}
              </div>

              {/* Year / Modal */}
              <div>
                <Label className="text-xs font-medium">Year / Modal *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="2024"
                  value={vehicleModal}
                  onChange={(e) => {
                    setVehicleModal(e.target.value);
                    if (formErrors.vehicleModal) setFormErrors((p) => ({ ...p, vehicleModal: '' }));
                  }}
                  disabled={isSubmitting}
                />
                {formErrors.vehicleModal && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.vehicleModal}</p>
                )}
              </div>

              {/* Color */}
              <div>
                <Label className="text-xs font-medium">Color *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Red, Black"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    if (formErrors.color) setFormErrors((p) => ({ ...p, color: '' }));
                  }}
                  disabled={isSubmitting}
                />
                {formErrors.color && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.color}</p>
                )}
              </div>

              {/* Fuel Type */}
              <div>
                <Label className="text-xs font-medium">Fuel Type *</Label>
                <Select value={fuelType} onValueChange={setFuelType} disabled={isSubmitting}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Fuel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="petrol" className="text-xs">Petrol</SelectItem>
                    <SelectItem value="diesel" className="text-xs">Diesel</SelectItem>
                    <SelectItem value="electric" className="text-xs">Electric</SelectItem>
                    <SelectItem value="cng" className="text-xs">CNG</SelectItem>
                    <SelectItem value="hybrid" className="text-xs">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Chassis Number */}
              <div>
                <Label className="text-xs font-medium">Chassis Number</Label>
                <Input
                  className="h-8 text-xs uppercase"
                  placeholder="Optional"
                  value={chassisNumber}
                  onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                />
              </div>

              {/* Engine Number */}
              <div>
                <Label className="text-xs font-medium">Engine Number</Label>
                <Input
                  className="h-8 text-xs uppercase"
                  placeholder="Optional"
                  value={engineNumber}
                  onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Pricing & Documents */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Pricing & Document Status
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Base Price */}
              <div>
                <Label className="text-xs font-medium">Base Price (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  className="h-8 text-xs"
                  placeholder="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  disabled={isSubmitting}
                />
                {formErrors.basePrice && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.basePrice}</p>
                )}
              </div>

              {/* Selling Price */}
              <div>
                <Label className="text-xs font-medium">Selling Price (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  className="h-8 text-xs"
                  placeholder="0"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  disabled={isSubmitting}
                />
                {formErrors.sellingPrice && (
                  <p className="text-[10px] text-destructive mt-0.5">{formErrors.sellingPrice}</p>
                )}
              </div>

              {/* RC Status */}
              <div>
                <Label className="text-xs font-medium">RC Status *</Label>
                <Select
                  value={rcStatus}
                  onValueChange={(val: any) => setRcStatus(val)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="RC Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original" className="text-xs">Original</SelectItem>
                    <SelectItem value="duplicate" className="text-xs">Duplicate</SelectItem>
                    <SelectItem value="not_available" className="text-xs">Not Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RC Holder */}
              <div>
                <Label className="text-xs font-medium">RC Holder *</Label>
                <Select
                  value={rcHolder}
                  onValueChange={(val: any) => setRcHolder(val)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="RC Holder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Company" className="text-xs">Company</SelectItem>
                    <SelectItem value="customer" className="text-xs">Customer</SelectItem>
                    <SelectItem value="third_party" className="text-xs">Third Party</SelectItem>
                    <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Insurance Expiry Date */}
              <div className="col-span-2">
                <DatePickerInput
                  label="Insurance Expiry Date"
                  value={insuranceExpiryDate}
                  onChange={(val) => setInsuranceExpiryDate(val)}
                  placeholder="Select expiry date"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Photos (Compact ~80-90px) */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Vehicle Photos (Optional)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border/60 rounded-lg p-2.5 bg-muted/20">
                <ImageUpload
                  label="Front Image"
                  value={frontImage}
                  onChange={(file) => setFrontImage(file as File)}
                  enableCrop={false}
                  enableCamera={true}
                />
              </div>
              <div className="border border-border/60 rounded-lg p-2.5 bg-muted/20">
                <ImageUpload
                  label="Side Image"
                  value={sideImage}
                  onChange={(file) => setSideImage(file as File)}
                  enableCrop={false}
                  enableCamera={true}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t flex flex-row items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-xs h-8 px-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="text-xs h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Vehicle</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
