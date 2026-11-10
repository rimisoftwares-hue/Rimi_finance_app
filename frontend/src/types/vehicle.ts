// export interface Vehicle {
//   id: string;
//   vehicle_name: string;
//   vehicle_number: string;
//   chassis_number: string;
//   engine_number: string;
//   num_owner: number;
//   trip_driven: number;
//   fuel_type: 'petrol' | 'diesel' | 'electric' | 'cng' | 'hybrid';
//   color: string;
//   selling_price: number;
//   FC: string;
//   make_year: number;
//   engine_capacity: string;
//   fuel_tank_capacity: string;
//   max_torque: string;
//   top_speed: string;
//   emi_from: number;
//   model: string;
//   price: number;
//   status: 'available' |'hosted' | 'sales' |'seized' | 'sold' ;
//   type: 'bike' | 'car' | 'scooter';
//   created_date: string;
//   selling_date?: string;
//   monthly_income_data: any;
//   hosting_info: any;
//   images: VehicleImage[];
//   created_at: string;
//   updated_at: string;
//   expenses?: VehicleExpense[];
//   total_expenses?: number;
// }

export interface VehicleInfo {
  id: string;
  brand: string;
  model_name: string;
  make_year: number;
  fuel_type: 'petrol' | 'diesel' | 'electric' | 'cng' | 'hybrid';
  engine_capacity: string;
  fuel_tank_capacity: string;
  max_torque: string;
  top_speed: string;
  mileage: string;
  transmission?: 'manual' | 'automatic' | 'cvt' | 'amt';
  seating_capacity?: number;
  body_type?: 'sedan' | 'hatchback' | 'suv' | 'muv' | 'coupe' | 'convertible' | 'scooter' | 'bike';
  base_price: number;
  created_at: string;
  updated_at: string;
}
export interface HostingInfo {
  agent_id?: string;
  customer_id?: string;
  hosting_date?: string;
  terms?: string;
  [key: string]: any;
}

export interface Vehicle {
  id: string;
  finance_id: string;
  vehicle_info_id: string;
  vehicle_number: string;
  vehicle_modal: string;
  /** Human-readable display name (e.g. "Honda CB Shine 2022") */
  vehicle_name?: string;
  /** Alias/shorthand model field — prefer model_name for display */
  model?: string;
  /** Direct image URL stored on the vehicle record (optional) */
  primary_image_url?: string;
  chassis_number: string;
  engine_number: string;
  num_owner: number;
  trip_driven: number;
  color: string;
  variant?: string;
  selling_price: number;
  emi_from: number;
  base_price: number;
  final_price: number;
  status: 'available' | 'hosted' | 'sales' | 'seized' | 'sold';
  created_date: string;
  selling_date?: string;
  deal_type: 'finance' | 'consulting';
  rc_holder: 'Company' | 'customer' | 'third_party' | 'pending';
  rc_status: 'original' | 'duplicate' | 'not_available';
  fc_expriry_date: string;
  insurance_expriry_date: string;
  remarks: string;
  images: VehicleImage[];
  expenses?: VehicleExpense[];
  total_expenses?: number;
  brand: string;
  model_name: string;
  make_year: number;
  minimum_down_payment: string;
  fuel_type: 'petrol' | 'diesel' | 'electric' | 'cng' | 'hybrid';
  engine_capacity: string;
  fuel_tank_capacity: string;
  max_torque: string;
  top_speed: string;
  mileage: string;
  transmission?: 'manual' | 'automatic' | 'cvt' | 'amt';

  seating_capacity?: number;
  body_type?: 'sedan' | 'hatchback' | 'suv' | 'muv' | 'coupe' | 'convertible' | 'scooter' | 'bike' | 'car';
  hosting_info?: HostingInfo | null;
  monthly_income_data?: any;
  created_at: string;
  updated_at: string;
}

export interface VehicleExpense {
  id: number;
  expense_date: string;
  description: string;
  amount: number;
  created_at: string;
}

export interface VehicleImage {
  id: string;
  vehicle_id: string;
  image_url: string;
  signed_url: string;
  image_type: string; // Allow any string type from database
  is_primary: boolean;
  upload_date: string;
  file_size?: number;
  created_at: string;
}

// export interface CreateVehicleRequest {
//   vehicle_name: string;
//   vehicle_number: string;
//   chassis_number: string;
//   model: string;
//   price: number;
//   type: 'bike' | 'car' | 'scooter';
//   images: {
//     front: File;
//     side: File;
//     back?: File;
//     interior?: File;
//     additional?: File[];
//   };
// }
export interface CreateVehicleRequest {
  vehicle_info_id?: string | number;
  vehicle_name: string;
  vehicle_number: string;
  vehicle_modal: string;
  chassis_number: string;
  engine_number: string;
  num_owner: number;
  trip_driven: number;
  color: string;
  variant: string;

  selling_price: number;
  emi_from: number;
  base_price: number;
  final_price: number;

  status: 'available' | 'hosted' | 'sales' | 'sold';
  created_date: string;
  selling_date: string;
  hosting_info: string;
  monthly_income_data: string;
  deal_type: 'finance' | 'consulting';
  rc_holder: 'Company' | 'customer' | 'third_party' | 'pending';
  rc_status: 'original' | 'duplicate' | 'not_available';
  fc_expiry_date: string;
  insurance_expriry_date: string;
  remarks: string;

  images?: {
    front?: File;
    side?: File;
    back?: File;
    interior?: File;
    additional?: File[];
  };

  created_at: string;
  updated_at: string
}

/**
 * Input type used by VehicleForm when creating / editing a vehicle.
 * Matches the vehicleSchema zod shape from VehicleForm.tsx.
 */
export type VehicleInput = {
  vehicle_name: string;
  vehicle_number?: string | null;
  vehicle_modal?: string | null;
  chassis_number?: string | null;
  engine_number?: string | null;
  brand: string;
  model: string;
  make_year: number;
  fuel_type?: 'petrol' | 'diesel' | 'electric' | 'cng' | 'hybrid' | null;
  engine_capacity?: string | null;
  fuel_tank_capacity?: string | null;
  max_torque?: string | null;
  top_speed?: string | null;
  mileage?: string | null;
  transmission?: string | null;
  seating_capacity?: number | null;
  body_type?: 'bike' | 'car' | 'scooter' | 'sedan' | 'hatchback' | 'suv' | 'muv' | 'coupe' | 'convertible' | null;
  num_owner: number;
  trip_driven: number;
  color?: string | null;
  variant?: string | null;
  base_price: number;
  final_price: number;
  selling_price: number;
  emi_from: number;
  deal_type: 'consulting' | 'finance';
  status: 'available' | 'sold' | 'hosted' | 'sales' | 'seized';
  primary_image_url?: string | null;
};