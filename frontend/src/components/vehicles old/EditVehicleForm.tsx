// EditVehicleForm.tsx - UPDATED WITH THEME SUPPORT
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Search, Car, X, Check } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ImageUpload } from '../common/ImageUpload_DK';
import { useToast } from '../../hooks/use-toast';
import { Vehicle, VehicleImage } from '../../types/vehicle';
import apiClient from '../../api/apiClient';
// import {getVehicleById} from '../../hooks/useVehiclesLocal'

// Extended vehicle schema for editing
const editVehicleSchema = z.object({
  // Basic Information
  vehicle_info_id: z.number().optional(),
  vehicle_name: z.string().min(1, 'Vehicle name is required').max(100, 'Vehicle name must be less than 100 characters'),
  vehicle_number: z.string().min(1, 'Vehicle number is required').max(50, 'Vehicle number must be less than 50 characters'),
  vehicle_modal: z.string().min(1, 'Vehicle model is required'),
  chassis_number: z.string().optional(),
  engine_number: z.string().optional(),
  
  // Vehicle Details
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  make_year: z.number().min(1900, 'Year must be after 1900').max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  fuel_type: z.enum(['petrol', 'diesel', 'electric', 'cng', 'hybrid']).optional(),
  engine_capacity: z.string().optional(),
  body_type: z.enum(['bike', 'car', 'scooter', 'sedan', 'hatchback', 'suv', 'muv', 'coupe', 'convertible']).optional(),
  
  // Ownership Details
  num_owner: z.number().min(1, 'Number of owners must be at least 1').default(1),
  trip_driven: z.number().min(0, 'Trip driven cannot be negative').default(0),
  
  // Appearance
  color: z.string().min(1, 'Color is required'),
  variant: z.string().optional(),
  
  // Pricing
  base_price: z.number().min(0, 'Base price must be greater than 0').default(0),
  final_price: z.number().min(0, 'Final price must be greater than 0').default(0),
  selling_price: z.number().min(0, 'Selling price cannot be negative').default(0),
  emi_from: z.number().min(0, 'EMI from cannot be negative').default(0),
  
  // Vehicle Status
  status: z.enum(['available', 'hosted', 'sales', 'sold', 'seized']).default('available'),
  deal_type: z.enum(['finance', 'consulting']).default('consulting'),
  rc_holder: z.enum(['Company', 'customer', 'third_party', 'pending']).default('Company'),
  rc_status: z.enum(['original', 'duplicate', 'not_available']).default('original'),
  fc_expiry_date: z.string().optional(),
  insurance_expiry_date: z.string().optional(),
  remarks: z.string().optional(),
  created_date: z.string(),
  selling_date: z.string().optional(),
});

type EditVehicleFormData = z.infer<typeof editVehicleSchema>;

interface VehicleInfo {
  id: number;
  brand: string;
  model_name: string;
  make_year: number;
  fuel_type: string;
  engine_capacity: string;
  body_type: string;
  base_price: number;
}

interface EditVehicleFormProps {
  vehicle: Vehicle;
  onSuccess?: (updatedVehicle: Vehicle) => void;
  onCancel?: () => void;
}

export function EditVehicleForm({vehicle, onSuccess, onCancel }: EditVehicleFormProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Image states
  const [frontImage, setFrontImage] = useState<File | undefined>();
  const [sideImage, setSideImage] = useState<File | undefined>();
  const [backImage, setBackImage] = useState<File | undefined>();
  const [interiorImage, setInteriorImage] = useState<File | undefined>();
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<VehicleImage[]>(vehicle.images || []);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  
  // State for vehicle info search
  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [vehicleInfoList, setVehicleInfoList] = useState<VehicleInfo[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [selectedVehicleInfo, setSelectedVehicleInfo] = useState<VehicleInfo | null>(null);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  // Refs for dropdown closing
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

  const form = useForm<EditVehicleFormData>({
    resolver: zodResolver(editVehicleSchema) as any,
    defaultValues: {
      // Basic Information
      vehicle_info_id: vehicle.vehicle_info_id ? parseInt(vehicle.vehicle_info_id) : undefined,
      vehicle_name: vehicle.brand && vehicle.model_name ? `${vehicle.brand} ${vehicle.model_name}` : '',
      vehicle_number: vehicle.vehicle_number || '',
      vehicle_modal: vehicle.vehicle_modal || '',
      chassis_number: vehicle.chassis_number || '',
      engine_number: vehicle.engine_number || '',
      
      // Vehicle Details
      brand: vehicle.brand || '',
      model: vehicle.model_name || '',
      make_year: vehicle.make_year || new Date().getFullYear(),
      fuel_type: vehicle.fuel_type as any || 'petrol',
      engine_capacity: vehicle.engine_capacity || '',
      body_type: vehicle.body_type as any || 'car',
      
      // Ownership Details
      num_owner: vehicle.num_owner || 1,
      trip_driven: vehicle.trip_driven || 0,
      
      // Appearance
      color: vehicle.color || '',
      variant: vehicle.variant || '',
      
      // Pricing
      base_price: vehicle.base_price || 0,
      final_price: vehicle.final_price || 0,
      selling_price: vehicle.selling_price || 0,
      emi_from: vehicle.emi_from || 0,
      
      // Vehicle Status
      deal_type: vehicle?.deal_type || 'consulting',
      rc_holder: vehicle?.rc_holder || 'Company',
      rc_status: vehicle?.rc_status || 'original',
      fc_expiry_date: vehicle.fc_expriry_date || '',
      insurance_expiry_date: vehicle.insurance_expriry_date || '',
      remarks: vehicle?.remarks || '',
      created_date: vehicle.created_date || new Date().toISOString().split('T')[0],
      selling_date: vehicle.selling_date || '',
    },
  });

  // Initialize brand and model search
  useEffect(() => {
    if (vehicle.brand) {
      setBrandSearch(vehicle.brand);
    }
    if (vehicle.model_name) {
      setModelSearch(vehicle.model_name);
    }
  }, [vehicle.brand, vehicle.model_name]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch all vehicle info from API
  const fetchVehicleInfo = async () => {
    try {
      const response = await apiClient.get('/vehicle-info');
      setVehicleInfoList(response.data);
      
      // Extract unique brands
      const uniqueBrands = [...new Set(response.data.map((item: VehicleInfo) => item.brand))] as string[];
      setFilteredBrands(uniqueBrands);
      
      // If vehicle has brand and model, find the vehicle info
      if (vehicle.brand && vehicle.model_name) {
        const vehicleInfo = response.data.find(
          (item: VehicleInfo) => 
            item.brand === vehicle.brand && 
            item.model_name === vehicle.model_name
        );
        if (vehicleInfo) {
          setSelectedVehicleInfo(vehicleInfo);
        }
      }
    } catch (error) {
      console.error('Error fetching vehicle info:', error);
      toast({
        title: "Error",
        description: "Failed to fetch vehicle information",
        variant: "destructive",
      });
    }
  };

  // Fetch vehicle info data on component mount
  useEffect(() => {
    fetchVehicleInfo();
  }, []);

  // Handle brand search
  useEffect(() => {
    if (brandSearch.trim() === '') {
      setFilteredBrands([...new Set(vehicleInfoList.map(item => item.brand))]);
    } else {
      const filtered = [...new Set(vehicleInfoList
        .filter(item => item.brand.toLowerCase().includes(brandSearch.toLowerCase()))
        .map(item => item.brand)
      )];
      setFilteredBrands(filtered);
    }
  }, [brandSearch, vehicleInfoList]);

  // Handle model search
  useEffect(() => {
    const brand = form.getValues('brand');
    if (brand && modelSearch.trim() === '') {
      const models = [...new Set(vehicleInfoList
        .filter(item => item.brand === brand)
        .map(item => item.model_name)
      )];
      setFilteredModels(models);
    } else if (brand && modelSearch.trim() !== '') {
      const filtered = vehicleInfoList
        .filter(item => item.brand === brand && item.model_name.toLowerCase().includes(modelSearch.toLowerCase()))
        .map(item => item.model_name);
      setFilteredModels(filtered);
    } else {
      setFilteredModels([]);
    }
  }, [modelSearch, form.getValues('brand'), vehicleInfoList]);

  // Handle brand selection
  const handleBrandSelect = (brand: string) => {
    form.setValue('brand', brand);
    form.setValue('vehicle_name', `${brand} ${form.getValues('model') || ''}`.trim());
    setBrandSearch(brand);
    setShowBrandDropdown(false);
    setFilteredModels([]);
    setModelSearch('');
    setSelectedVehicleInfo(null);
    
    // Clear model related fields when brand changes
    form.setValue('model', '');
    form.setValue('make_year', new Date().getFullYear());
    form.setValue('fuel_type', 'petrol');
    form.setValue('engine_capacity', '');
    form.setValue('body_type', 'car');
    form.setValue('base_price', 0);
    
    // Focus on model input
    setTimeout(() => {
      modelInputRef.current?.focus();
    }, 100);
  };

  const isValidImageUrl = (url?: string): boolean => {
    if (!url) return false;
    const trimmedUrl = url.trim();
    return trimmedUrl !== '' && (trimmedUrl.startsWith('http') || trimmedUrl.startsWith('/'));
  };

  // Helper function to get full image URL
  const getFullImageUrl = (imageUrl?: string): string | null => {
    if (!isValidImageUrl(imageUrl)) return null;
    
    const url = imageUrl!.trim();
    if (url.startsWith('http')) {
      return url;
    }
    
    const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
    if (url.startsWith('/uploads')) {
      return `${baseUrl}${url}`;
    }
    
    return `${baseUrl}${url}`;
  };

  // Handle brand clear
  const handleBrandClear = () => {
    form.setValue('brand', '');
    form.setValue('vehicle_name', '');
    setBrandSearch('');
    setSelectedVehicleInfo(null);
    setFilteredModels([]);
    setModelSearch('');
    
    // Clear model related fields
    form.setValue('model', '');
    form.setValue('make_year', new Date().getFullYear());
    form.setValue('fuel_type', 'petrol');
    form.setValue('engine_capacity', '');
    form.setValue('body_type', 'car');
    form.setValue('base_price', 0);
  };

  // Handle model selection
  const handleModelSelect = (modelName: string) => {
    const brand = form.getValues('brand');
    const vehicleInfo = vehicleInfoList.find(
      item => item.brand === brand && item.model_name === modelName
    );
    
    if (vehicleInfo) {
      setSelectedVehicleInfo(vehicleInfo);
      form.setValue('model', modelName);
      form.setValue('make_year', vehicleInfo.make_year);
      form.setValue('fuel_type', vehicleInfo.fuel_type as any);
      form.setValue('engine_capacity', vehicleInfo.engine_capacity);
      form.setValue('body_type', vehicleInfo.body_type as any);
      form.setValue('base_price', vehicleInfo.base_price);
      form.setValue('vehicle_info_id', vehicleInfo.id);
      
      setModelSearch(modelName);
      setShowModelDropdown(false);
    }
  };

  // Handle model clear
  const handleModelClear = () => {
    form.setValue('model', '');
    form.setValue('vehicle_name', form.getValues('brand') || '');
    setModelSearch('');
    setSelectedVehicleInfo(null);
    
    // Reset vehicle specific fields
    form.setValue('make_year', new Date().getFullYear());
    form.setValue('fuel_type', 'petrol');
    form.setValue('engine_capacity', '');
    form.setValue('body_type', 'car');
    form.setValue('base_price', 0);
    form.setValue('vehicle_info_id', undefined);
  };

  // Handle image removal
  const handleRemoveImage = (imageId: string) => {
    setImagesToDelete(prev => [...prev, imageId]);
    setExistingImages(prev => prev.filter(img => img.id !== imageId));
  };

  const onSubmit = async (data: EditVehicleFormData) => {
  console.log('Form submitted:', data);
  console.log('Selected vehicle info:', selectedVehicleInfo);
  console.log('Existing images to keep:', existingImages.map(img => img.id));
  console.log('Images to delete:', imagesToDelete);

  // Validate that at least front and side images exist (either existing or new)
  const hasFrontImage = existingImages.some(img => img.image_type === 'front') || frontImage;
  const hasSideImage = existingImages.some(img => img.image_type === 'side') || sideImage;
  
  if (!hasFrontImage || !hasSideImage) {
    toast({
      title: "Missing Required Images",
      description: "Please ensure both front and side images are provided (either existing or new uploads).",
      variant: "destructive",
    });
    return;
  }

  setIsSubmitting(true);
  
  try {
    const formData = new FormData();
    
    // Add all vehicle data fields
    if (data.vehicle_info_id) {
      formData.append('vehicle_info_id', data.vehicle_info_id.toString());
    }
    // FIX: Add vehicle_name is not in your backend schema
    // formData.append('vehicle_name', data.vehicle_name); // Remove this line
    
    // FIX: The backend expects vehicle_modal not vehicle_name
    formData.append('vehicle_number', data.vehicle_number);
    formData.append('vehicle_modal', data.vehicle_modal); // This is correct
    
    // FIX: Add missing fields that backend expects
    formData.append('chassis_number', data.chassis_number || '');
    formData.append('engine_number', data.engine_number || '');
    formData.append('num_owner', data.num_owner.toString());
    formData.append('trip_driven', data.trip_driven.toString());
    formData.append('color', data.color);
    formData.append('variant', data.variant || '');
    formData.append('selling_price', data.selling_price.toString());
    formData.append('emi_from', data.emi_from.toString());
    formData.append('base_price', data.base_price.toString());
    formData.append('final_price', data.final_price.toString());
    formData.append('status', data.status);
    formData.append('created_date', data.created_date);
    formData.append('selling_date', data.selling_date || '');
    
    // FIX: Add hosting_info and monthly_income_data if they exist
    if (vehicle.hosting_info) {
      formData.append('hosting_info', JSON.stringify(vehicle.hosting_info));
    } else {
      formData.append('hosting_info', '');
    }
    
    if (vehicle.monthly_income_data) {
      formData.append('monthly_income_data', JSON.stringify(vehicle.monthly_income_data));
    } else {
      formData.append('monthly_income_data', '');
    }
    
    formData.append('deal_type', data.deal_type);
    formData.append('rc_holder', data.rc_holder || 'Company');
    formData.append('rc_status', data.rc_status || 'original');
    formData.append('fc_expiry_date', data.fc_expiry_date || '');
    formData.append('insurance_expiry_date', data.insurance_expiry_date || '');
    formData.append('remarks', data.remarks || '');
    
    // Add existing images to keep
    formData.append('existing_images', JSON.stringify(existingImages.map(img => img.id)));

    // Add new images
    if (frontImage) formData.append('front', frontImage);
    if (sideImage) formData.append('side', sideImage);
    if (backImage) formData.append('back', backImage);
    if (interiorImage) formData.append('interior', interiorImage);
    
    if (additionalImages && additionalImages.length > 0) {
      additionalImages.forEach((file, index) => {
        formData.append('additional', file);
      });
    }

    // Debug log FormData
    console.log('FormData entries for update:');
    for (let pair of formData.entries()) {
      console.log(pair[0], pair[1] instanceof File ? `${pair[1].name} (${pair[1].type})` : pair[1]);
    }

    const response = await apiClient.put(
      `/vehicles/${vehicle.id}`,
      formData
    );

    console.log('Response from server:', response.data);

    toast({
      title: "Success",
      description: "Vehicle updated successfully!",
    });

    if (onSuccess) {
      onSuccess(response.data);
    }

  } catch (err: any) {
    console.error('Error updating vehicle:', err.response?.data || err.message);
    const errorMessage = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to update vehicle';
    toast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  } finally {
    setIsSubmitting(false);
  }
};

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/vehicle');
    }
  };

  // Format existing images for display
  const frontImageExists = existingImages.find(img => img.image_type === 'front');
  const sideImageExists = existingImages.find(img => img.image_type === 'side');
  const backImageExists = existingImages.find(img => img.image_type === 'back');
  const interiorImageExists = existingImages.find(img => img.image_type === 'interior');
  const additionalImagesExist = existingImages.filter(img => img.image_type === 'additional');

  return (
     <div className="w-full bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="mb-4 hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Edit Vehicle</h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">
            Update the details for {vehicle.vehicle_number}
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8 p-4 md:p-6">
              
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                  Basic Information
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  
                  {/* Brand with search suggestions */}
                  <div className="relative" ref={brandDropdownRef}>
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-foreground">Brand *</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            ref={brandInputRef}
                            placeholder="Search brand (e.g., Honda, Toyota)"
                            value={brandSearch}
                            onChange={(e) => {
                              setBrandSearch(e.target.value);
                              setShowBrandDropdown(true);
                            }}
                            onFocus={() => setShowBrandDropdown(true)}
                            className="pr-10 bg-background border-input"
                          />
                        </FormControl>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                          {brandSearch && (
                            <button
                              type="button"
                              onClick={handleBrandClear}
                              className="p-1 hover:bg-secondary rounded transition-colors"
                            >
                              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </button>
                          )}
                          <Search className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      {showBrandDropdown && filteredBrands.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredBrands.map((brand) => (
                            <div
                              key={brand}
                              className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer border-b border-border last:border-b-0 transition-colors"
                              onClick={() => handleBrandSelect(brand)}
                            >
                              <div className="flex items-center">
                                <Car className="h-4 w-4 mr-2 text-muted-foreground" />
                                <span className="font-medium text-foreground">{brand}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  </div>

                  {/* Model with search suggestions */}
                  <div className="relative" ref={modelDropdownRef}>
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-foreground">Vehicle Model *</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            ref={modelInputRef}
                            placeholder="Search model"
                            value={modelSearch}
                            onChange={(e) => {
                              setModelSearch(e.target.value);
                              setShowModelDropdown(true);
                            }}
                            onFocus={() => setShowModelDropdown(true)}
                            disabled={!form.getValues('brand')}
                            className="pr-10 bg-background border-input disabled:bg-muted disabled:cursor-not-allowed"
                          />
                        </FormControl>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                          {modelSearch && (
                            <button
                              type="button"
                              onClick={handleModelClear}
                              className="p-1 hover:bg-secondary rounded transition-colors"
                            >
                              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </button>
                          )}
                          <Search className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      {showModelDropdown && filteredModels.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredModels.map((modelName) => (
                            <div
                              key={modelName}
                              className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer border-b border-border last:border-b-0 transition-colors"
                              onClick={() => handleModelSelect(modelName)}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-foreground">{modelName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {vehicleInfoList.find(item => 
                                    item.brand === form.getValues('brand') && 
                                    item.model_name === modelName
                                  )?.make_year}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  </div>

                  <FormField
                    control={form.control}
                    name="vehicle_modal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Vehicle Model *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Civic, Corolla" 
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField 
                    control={form.control}
                    name="vehicle_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Vehicle Number *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="KL-10-AB-1234" 
                            {...field}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase());
                            }}
                            value={field.value || ''}
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="chassis_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Chassis Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="HA6G2024001 (optional)" 
                            {...field} 
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="engine_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Engine Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Engine number (optional)" 
                            {...field} 
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Color *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Red" 
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value;
                              const formatted = value.length > 0
                                ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
                                : '';
                              field.onChange(formatted);
                            }}
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              {/* Selected Vehicle Details */}
              {selectedVehicleInfo && (
                <div className="p-4 bg-accent/10 border border-accent rounded-lg">
                  <h4 className="font-semibold text-foreground mb-3 flex items-center">
                    <Car className="h-4 w-4 mr-2 text-primary" />
                    Selected Vehicle Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    {selectedVehicleInfo.body_type && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Body type:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.body_type}</span>
                      </div>
                    )}
                    {selectedVehicleInfo.make_year && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Make year:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.make_year}</span>
                      </div>
                    )}
                    {selectedVehicleInfo.fuel_type && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Fuel type:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.fuel_type}</span>
                      </div>
                    )}
                    {selectedVehicleInfo.engine_capacity && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Engine:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.engine_capacity}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Ownership and Pricing Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                  Ownership & Pricing
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="num_owner"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Number of Owners</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="trip_driven"
                    render={({ field }) => {
                      const formattedValue = field.value !== undefined
                        ? Number(field.value).toLocaleString('en-IN')
                        : '';

                      return (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">Trip Driven (km)</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="0"
                              value={formattedValue}
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                const numericValue = Number(rawValue) || 0;
                                field.onChange(numericValue);
                              }}
                              className="bg-background border-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="variant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Variant</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., EX, LX, Sport" 
                            {...field} 
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="base_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Base Price (₹) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="75000"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="final_price"
                    render={({ field }) => {
                      const formattedValue = field.value !== undefined
                        ? Number(field.value).toLocaleString('en-IN')
                        : '';

                      return (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">Final Price (₹) *</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="0"
                              value={formattedValue}
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                const numericValue = Number(rawValue) || 0;
                                field.onChange(numericValue);
                              }}
                              className="bg-background border-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="selling_price"
                    render={({ field }) => {
                      const formattedValue = field.value !== undefined
                        ? Number(field.value).toLocaleString('en-IN')
                        : '';

                      return (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">Selling Price (₹)</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="0"
                              value={formattedValue}
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                const numericValue = Number(rawValue) || 0;
                                field.onChange(numericValue);
                              }}
                              className="bg-background border-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </div>

              {/* Vehicle Status and Documents */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                  Vehicle Status & Documents
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background border-input">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover border-border">
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="hosted">Hosted</SelectItem>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="sold">Sold</SelectItem>
                            <SelectItem value="seized">Seized</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Deal Type */}
                  <FormField
                    control={form.control}
                    name="deal_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Deal Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background border-input">
                              <SelectValue placeholder="Select Deal type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover border-border">
                            <SelectItem value="consulting">Consulting</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* RC Holder */}
                  <FormField
                    control={form.control}
                    name="rc_holder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">RC Holder</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background border-input">
                              <SelectValue placeholder="Select RC Holder" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover border-border">
                            <SelectItem value="Company">Company</SelectItem>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="third_party">Third party</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* RC Status */}
                  <FormField
                    control={form.control}
                    name="rc_status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">RC Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background border-input">
                              <SelectValue placeholder="Select RC Status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover border-border">
                            <SelectItem value="original">Original</SelectItem>
                            <SelectItem value="duplicate">Duplicate</SelectItem>
                            <SelectItem value="not_available">Not available</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fc_expiry_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">FC Expiry Date</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder="Pick FC Expiry Date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="insurance_expiry_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">Insurance Expiry Date</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder="Pick Insurance Expiry Date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emi_from"
                    render={({ field }) => {
                      const formattedValue = field.value !== undefined
                        ? Number(field.value).toLocaleString('en-IN')
                        : '';

                      return (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">EMI From (₹)</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="0"
                              value={formattedValue}
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                const numericValue = Number(rawValue) || 0;
                                field.onChange(numericValue);
                              }}
                              className="bg-background border-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 lg:col-span-3">
                        <FormLabel className="text-sm font-medium text-foreground">Remarks</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Additional notes..." 
                            {...field} 
                            className="bg-background border-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Image Uploads */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                  Vehicle Images
                </h3>
                
                <div className="space-y-6">
                  {/* Existing Images */}
                  {existingImages.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3">Existing Images</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {existingImages.map((image) => {
                          const imageUrl = getFullImageUrl(image.signed_url || image.image_url);
                          
                          const hasValidImage = imageUrl !== null;
                    
                          return (
                            <div key={image.id} className="relative group">
                              {hasValidImage ? (
                                <>
                                  <img
                                    src={imageUrl}
                                    alt={`${image.image_type} image`}
                                    className="w-full h-32 object-cover rounded-lg border border-border"
                                    // onError={(e) => {
                                    //   // Fallback if image fails to load
                                    //   e.currentTarget.style.display = 'none';
                                    //   const parent = e.currentTarget.parentElement;
                                    //   if (parent) {
                                    //     const fallbackDiv = document.createElement('div');
                                    //     fallbackDiv.className = 'w-full h-32 bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black rounded-lg border border-border flex flex-col items-center justify-center p-2';
                                    //     fallbackDiv.innerHTML = `
                                    //       <div class="text-gray-400 dark:text-gray-500 mb-1">
                                    //         <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    //           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    //         </svg>
                                    //       </div>
                                    //       <span class="text-xs text-gray-300 dark:text-gray-400 text-center capitalize">${image.image_type}</span>
                                    //       <span class="text-xs text-gray-400 dark:text-gray-500 mt-1">Image not available</span>
                                    //     `;
                                    //     parent.appendChild(fallbackDiv);
                                    //   }
                                    // }}
                                  />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                    <div className="text-center p-2">
                                      <p className="text-white text-sm font-medium capitalize">{image.image_type}</p>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRemoveImage(image.id)}
                                        className="mt-2"
                                      >
                                        <X className="h-3 w-3 mr-1" />
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-32 bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black rounded-lg border border-border flex flex-col items-center justify-center p-2">
                                  <div className="text-gray-400 dark:text-gray-500 mb-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                  <span className="text-xs text-gray-300 dark:text-gray-400 text-center capitalize">{image.image_type}</span>
                                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">No image available</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* New Images Upload */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Upload New Images (Optional)</h4>
                    <div className="space-y-4">
                      {/* Required Images */}
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Required Images *</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <ImageUpload
                            label="Front Image"
                            value={frontImage}
                            onChange={(file) => setFrontImage(file as File)}
                            className="h-48"
                          />
                          
                          <ImageUpload
                            label="Side Image"
                            value={sideImage}
                            onChange={(file) => setSideImage(file as File)}
                            className="h-48"
                          />

                          <ImageUpload
                            label="Back Image"
                            value={backImage}
                            onChange={(file) => setBackImage(file as File)}
                            className="h-48"
                          />
                          
                          <ImageUpload
                            label="Interior Image"
                            value={interiorImage}
                            onChange={(file) => setInteriorImage(file as File)}
                            className="h-48"
                          />
                        </div>
                      </div>

                      {/* Additional Images */}
                      <div>
                        <ImageUpload
                          label="Additional Images"
                          multiple
                          value={additionalImages}
                          onChange={(files) => setAdditionalImages(files as File[])}
                          enableCrop={false}
                          className="min-h-32"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t border-border gap-4 mb-4">
                <div className="w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto hover:bg-secondary"
                  >
                    Cancel
                  </Button>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      form.reset();
                      setFrontImage(undefined);
                      setSideImage(undefined);
                      setBackImage(undefined);
                      setInteriorImage(undefined);
                      setAdditionalImages([]);
                      setBrandSearch('');
                      setModelSearch('');
                      setSelectedVehicleInfo(null);
                      setShowBrandDropdown(false);
                      setShowModelDropdown(false);
                      setImagesToDelete([]);
                      setExistingImages(vehicle.images || []);
                      
                      toast({
                        title: "Form Reset",
                        description: "Changes have been cleared.",
                      });
                    }}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto hover:bg-secondary/80"
                  >
                    Reset Changes
                  </Button>
                  
                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-primary hover:bg-primary-dark text-primary-foreground"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSubmitting ? 'Updating...' : 'Update Vehicle'}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
        <div className="h-6"></div>
      </div>
    </div>
  );
}