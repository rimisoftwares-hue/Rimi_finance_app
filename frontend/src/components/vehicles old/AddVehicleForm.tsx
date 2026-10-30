// AddVehiclePage.tsx - UPDATED WITH THEME SUPPORT
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Search, Car, X, CalendarIcon } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from "../ui/calendar";
import { ImageUpload } from '../common/ImageUpload_DK';
import { useToast } from '../../hooks/use-toast';
import { CreateVehicleRequest } from '../../types/vehicle';
import { useVehicles } from '../../hooks/useVehiclesLocal';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import apiClient from '../../api/apiClient';

// Extended vehicle schema to include ALL required fields
const vehicleSchema = z.object({
  // Basic Information
  vehicle_name: z.string().min(1, 'Vehicle name is required').max(100, 'Vehicle name must be less than 100 characters'),
  vehicle_number: z.string().min(1, 'Vehicle number is required').max(50, 'Vehicle number must be less than 50 characters'),
  vehicle_modal: z.string().min(1, 'Model is required'),
  chassis_number: z.string().optional(),
  engine_number: z.string().optional(),

  // Vehicle Details
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  make_year: z.number().min(1900, 'Year must be after 1900').max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  fuel_type: z.enum(['petrol', 'diesel', 'electric', 'cng', 'hybrid'], { required_error: 'Fuel type is required' }),
  engine_capacity: z.string().min(1, 'Engine capacity is required'),
  body_type: z.enum(['bike', 'car', 'scooter', 'sedan', 'hatchback', 'suv', 'muv', 'coupe', 'convertible'], { required_error: 'Body type is required' }),

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
  deal_type: z.enum(['finance', 'consulting']).default('consulting'),
  rc_holder: z.enum(['Company', 'customer', 'third_party', 'pending']).default('Company'),
  rc_status: z.enum(['original', 'duplicate', 'not_available']).default('original'),
  fc_expiry_date: z.string().optional(),
  insurance_expiry_date: z.string().optional(),
  remarks: z.string().optional(),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

interface VehicleInfo {
  id: number;
  brand: string;
  model_name: string;
  make_year: number;
  fuel_type: string;
  engine_capacity: string;
  fuel_tank_capacity?: string;
  max_torque?: string;
  top_speed?: string;
  mileage?: string;
  transmission?: string;
  seating_capacity?: number;
  body_type: string;
  base_price: number;
}


export function AddVehiclePage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [frontImage, setFrontImage] = useState<File>();
  const [sideImage, setSideImage] = useState<File>();
  const [backImage, setBackImage] = useState<File>();
  const [interiorImage, setInteriorImage] = useState<File>();
  const [additionalImages, setAdditionalImages] = useState<File[]>();

  // State for vehicle info search
  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [vehicleInfoList, setVehicleInfoList] = useState<VehicleInfo[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [selectedVehicleInfo, setSelectedVehicleInfo] = useState<VehicleInfo | null>(null);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [fcOpen, setFcOpen] = useState(false);
  const [insuranceOpen, setInsuranceOpen] = useState(false);

  // Refs for dropdown closing
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const { createVehicle } = useVehicles();

  const { toast } = useToast();

  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema) as any,
    defaultValues: {
      // Basic Information
      vehicle_name: '',
      vehicle_number: '',
      vehicle_modal: '',
      chassis_number: '',
      engine_number: '',

      // Vehicle Details
      brand: '',
      make_year: new Date().getFullYear(),
      fuel_type: 'petrol',
      engine_capacity: '',
      body_type: 'car',

      // Ownership Details
      num_owner: 1,
      trip_driven: 0,

      // Appearance
      color: '',
      variant: '',

      // Pricing
      base_price: 0,
      final_price: 0,
      selling_price: 0,
      emi_from: 0,

      // Vehicle Status
      deal_type: 'consulting',
      rc_holder: 'Company',
      rc_status: 'original',
      fc_expiry_date: '',
      insurance_expiry_date: '',
      remarks: '',
    },
  });

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
      const response = await apiClient.get('/vehicles/info');
      setVehicleInfoList(response.data);

      // Extract unique brands
      const uniqueBrands = [...new Set(response.data.map((item: VehicleInfo) => item.brand))] as string[];
      setFilteredBrands(uniqueBrands);
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
    form.setValue('final_price', 0);
    form.setValue('selling_price', 0);

    // Focus on model input
    setTimeout(() => {
      modelInputRef.current?.focus();
    }, 100);
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
    form.setValue('final_price', 0);
    form.setValue('selling_price', 0);
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
      form.setValue('vehicle_modal', vehicleInfo.make_year.toString());
      form.setValue('vehicle_name', `${vehicleInfo.brand} ${vehicleInfo.model_name}`);

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
    form.setValue('final_price', 0);
    form.setValue('selling_price', 0);
  };

  const onSubmit = async (data: VehicleFormData) => {
    //debug log
    console.log('Form submitted:', data);
    console.log('Selected vehicle info:', selectedVehicleInfo);

    // if (!frontImage || !sideImage) {
    //    console.error('Missing images:', { frontImage, sideImage }); //debug log
    //   toast({
    //     title: "Missing Required Images",
    //     description: "Please upload both front and side images.",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    // Validate that vehicle info is selected
    if (!selectedVehicleInfo) {
      toast({
        title: "Missing Vehicle Information",
        description: "Please select a vehicle model from the list.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Format dates
      const today = new Date().toISOString().split('T')[0];
      const fcExpiryDate = data.fc_expiry_date
        ? (data.fc_expiry_date.includes('T') ? new Date(data.fc_expiry_date).toISOString().split('T')[0] : data.fc_expiry_date)
        : '';
      const insuranceExpiryDate = data.insurance_expiry_date
        ? (data.insurance_expiry_date.includes('T') ? new Date(data.insurance_expiry_date).toISOString().split('T')[0] : data.insurance_expiry_date)
        : '';

      // Map form data to CreateVehicleRequest interface
      const vehicleData: CreateVehicleRequest = {
        vehicle_info_id: selectedVehicleInfo.id, // Add this
        vehicle_name: data.vehicle_name,
        vehicle_number: data.vehicle_number,
        vehicle_modal: data.vehicle_modal,
        chassis_number: (data.chassis_number || '').toUpperCase(),
        engine_number: (data.engine_number || '').toUpperCase(),
        num_owner: data.num_owner,
        trip_driven: data.trip_driven,
        color: data.color,
        variant: data.variant || '',
        selling_price: data.selling_price,
        emi_from: data.emi_from,
        base_price: data.base_price,
        final_price: data.final_price,
        status: 'available',
        created_date: today,
        selling_date: '',
        hosting_info: '',
        monthly_income_data: '',
        deal_type: data.deal_type || 'none',
        rc_holder: data.rc_holder || 'Company',
        rc_status: data.rc_status || 'original',
        fc_expiry_date: fcExpiryDate,
        insurance_expriry_date: insuranceExpiryDate,
        remarks: data.remarks || '',
        images: {
          front: frontImage!,
          side: sideImage!,
          back: backImage,
          interior: interiorImage,
          additional: additionalImages,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      console.log('vehicleData', vehicleData)//debug log
      await createVehicle(vehicleData);

      // Reset form
      form.reset();
      setFrontImage(undefined);
      setSideImage(undefined);
      setBackImage(undefined);
      setInteriorImage(undefined);
      setAdditionalImages(undefined);
      setBrandSearch('');
      setModelSearch('');
      setSelectedVehicleInfo(null);
      setShowBrandDropdown(false);
      setShowModelDropdown(false);

      toast({
        title: "Vehicle Added",
        description: "Vehicle has been successfully added to your inventory.",
      });

      // Navigate back or to vehicle list
      navigate('/vehicle');

    } catch (error: any) {
      console.error('Error adding vehicle:', error);
      console.error('Error response:', error.response);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.message || "Failed to add vehicle. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle base price change
  const handleBasePriceChange = (value: number) => {
    form.setValue('base_price', value);
  };

  // Handle final price change
  const handleFinalPriceChange = (value: any) => {
    form.setValue('final_price', value);
  };

  // Handle selling price change
  const handleSellingPriceChange = (value: any) => {
    form.setValue('selling_price', value);
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      navigate(-1);
    }
  };

  return (
    <div className="w-full bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="mb-4 hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>

          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Add New Vehicle</h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">
            Fill in the details below to add a new vehicle to your inventory.
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8 p-4 md:p-6">

              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Basic Information</h3>

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
                      <FormLabel className="text-sm font-medium text-foreground">Vehicle name *</FormLabel>
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
                        <FormLabel className="text-sm font-medium text-foreground">Vehicle Model*</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0000"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value || '')}
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
                            value={field.value || ''}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase());
                            }}
                            className="bg-background border-input uppercase"
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
                            value={field.value || ''}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase());
                            }}
                            className="bg-background border-input uppercase"
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
                        <FormLabel className="text-sm font-medium text-foreground"> Color *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Red"
                            value={field.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const formatted =
                                value.length > 0
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
                    {selectedVehicleInfo.fuel_tank_capacity && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Fuel Tank:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.fuel_tank_capacity}</span>
                      </div>
                    )}
                    {selectedVehicleInfo.max_torque && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Max Torque:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.max_torque}</span>
                      </div>
                    )}
                    {selectedVehicleInfo.mileage && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Mileage:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.mileage}</span>
                      </div>
                    )}
                    {selectedVehicleInfo.seating_capacity && (
                      <div className="bg-background p-3 rounded-lg border border-border">
                        <span className="text-muted-foreground">Seating:</span>
                        <span className="ml-2 font-medium text-foreground">{selectedVehicleInfo.seating_capacity} seats</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ownership and Pricing Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Ownership & Pricing</h3>

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
                      const formattedValue =
                        field.value !== undefined
                          ? Number(field.value).toLocaleString('en-IN')
                          : '';

                      return (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-foreground">
                            Trip Driven (km)
                          </FormLabel>

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
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0;
                              field.onChange(value);
                              handleBasePriceChange(value);
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
                    name="final_price"
                    render={({ field }) => {
                      const formattedValue =
                        field.value !== undefined ? Number(field.value).toLocaleString('en-IN') : '';
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
                      const formattedValue =
                        field.value !== undefined ? Number(field.value).toLocaleString('en-IN') : '';
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

              {/* Vehicle Documents Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Vehicle Documents</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    render={({ field }) => {
                      const selectedDate = field.value
                        ? new Date(field.value.includes('T') ? field.value : `${field.value}T00:00:00`)
                        : undefined;
                      const isValidDate = selectedDate && !isNaN(selectedDate.getTime());

                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-sm font-medium text-foreground">FC Expiry Date</FormLabel>
                          <Popover open={fcOpen} onOpenChange={setFcOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-between text-left font-normal bg-background border-input",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <span className="flex items-center">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {isValidDate ? (
                                      format(selectedDate, "dd MMM yyyy")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                  </span>
                                  {field.value && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      className="p-0.5 hover:bg-muted rounded-full pointer-events-auto"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        field.onChange("");
                                      }}
                                    >
                                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                    </span>
                                  )}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={isValidDate ? selectedDate : undefined}
                                onSelect={(date) => {
                                  field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                                  setFcOpen(false);
                                }}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                              {field.value && (
                                <div className="p-2 border-t border-border flex justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => {
                                      field.onChange("");
                                      setFcOpen(false);
                                    }}
                                  >
                                    Clear
                                  </Button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="insurance_expiry_date"
                    render={({ field }) => {
                      const selectedDate = field.value
                        ? new Date(field.value.includes('T') ? field.value : `${field.value}T00:00:00`)
                        : undefined;
                      const isValidDate = selectedDate && !isNaN(selectedDate.getTime());

                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-sm font-medium text-foreground">Insurance Expiry Date</FormLabel>
                          <Popover open={insuranceOpen} onOpenChange={setInsuranceOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-between text-left font-normal bg-background border-input",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <span className="flex items-center">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {isValidDate ? (
                                      format(selectedDate, "dd MMM yyyy")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                  </span>
                                  {field.value && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      className="p-0.5 hover:bg-muted rounded-full pointer-events-auto"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        field.onChange("");
                                      }}
                                    >
                                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                    </span>
                                  )}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={isValidDate ? selectedDate : undefined}
                                onSelect={(date) => {
                                  field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                                  setInsuranceOpen(false);
                                }}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                              {field.value && (
                                <div className="p-2 border-t border-border flex justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => {
                                      field.onChange("");
                                      setInsuranceOpen(false);
                                    }}
                                  >
                                    Clear
                                  </Button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="emi_from"
                    render={({ field }) => {
                      const formattedValue =
                        field.value !== undefined ? Number(field.value).toLocaleString('en-IN') : '';
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
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Vehicle Images</h3>

                <div className="space-y-6">
                  {/* Required Images */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Required Images *</h4>
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

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t border-border gap-4 mb-4">
                <div className="w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isLoading}
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
                      setAdditionalImages(undefined);
                      setBrandSearch('');
                      setModelSearch('');
                      setSelectedVehicleInfo(null);
                      setShowBrandDropdown(false);
                      setShowModelDropdown(false);
                      toast({
                        title: "Form Reset",
                        description: "All fields have been cleared.",
                      });
                    }}
                    disabled={isLoading}
                    className="w-full sm:w-auto hover:bg-secondary/80"
                  >
                    Reset Form
                  </Button>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full sm:w-auto bg-primary hover:bg-primary-dark text-primary-foreground"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Vehicle
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