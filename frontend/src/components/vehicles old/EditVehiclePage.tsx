// // EditVehiclePage.tsx - FIXED
// import { useParams, useNavigate } from 'react-router-dom';
// import { useEffect, useState, useCallback } from 'react';
// import { EditVehicleForm } from './EditVehicleForm';
// import { Vehicle } from '../../types/vehicle';
// import { useVehicles } from '../../hooks/useVehiclesLocal';
// import { Loader2 } from 'lucide-react';
// import { useToast } from '../../hooks/use-toast';
// import axios from 'axios';

// export function EditVehiclePage() {
//   const { id } = useParams<{ id: string }>();
//   const navigate = useNavigate();
//   const { toast } = useToast();
//   const { getVehicleById, refetch } = useVehicles();
//   const [vehicle, setVehicle] = useState<Vehicle | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [isMounted, setIsMounted] = useState(true);

//   // Memoize the fetchData function
//   const fetchData = useCallback(async (signal?: AbortSignal) => {
//     if (!id) {
//       if (isMounted) {
//         toast({
//           title: "Error",
//           description: "Vehicle ID is missing",
//           variant: "destructive",
//         });
//         navigate('/vehicle');
//       }
//       return;
//     }

//     try {
//       // Try to get from local state first
//       const vehicleData = getVehicleById(id);
//       if (vehicleData) {
//         if (isMounted) {
//           setVehicle(vehicleData);
//           setLoading(false);
//         }
//         return;
//       }

//       // Create axios config with cancel token
//       const config = signal ? { signal } : {};
      
//       // Using axios with abort signal
//       const response = await axios.get(`https://autofinex-desktop-api.rimio.in/api/vehicles/${id}`, config);
      
//       if (isMounted) {
//         setVehicle(response.data);
//         setLoading(false);
//       }
//     } catch (error: any) {
//       if (!isMounted) return; // Don't update state if component is unmounted
      
//       console.error('Error fetching vehicle:', error);
      
//       // Check if error is due to abort
//       if (axios.isCancel(error)) {
//         console.log('Request cancelled:', error.message);
//         return;
//       }
      
//       if (axios.isAxiosError(error)) {
//         if (error.response?.status === 404) {
//           toast({
//             title: "Error",
//             description: "Vehicle not found",
//             variant: "destructive",
//           });
//           navigate('/vehicles');
//         } else {
//           toast({
//             title: "Error",
//             description: error.response?.data?.message || "Failed to fetch vehicle data",
//             variant: "destructive",
//           });
//         }
//       } else {
//         toast({
//           title: "Error",
//           description: "Failed to load vehicle",
//           variant: "destructive",
//         });
//       }
      
//       if (isMounted) {
//         setLoading(false);
//       }
//     }
//   }, [id, navigate, toast, getVehicleById, isMounted]);

//   useEffect(() => {
//     setIsMounted(true);
//     const abortController = new AbortController();
    
//     // Fetch data only once
//     fetchData(abortController.signal);

//     // Cleanup function
//     return () => {
//       setIsMounted(false);
//       abortController.abort('Component unmounted');
//     };
//   }, [fetchData]); // Only depend on fetchData which is memoized

//   const handleSuccess = (updatedVehicle: Vehicle) => {
//     // Refetch vehicles to update the list
//     refetch();
    
//     // Show success message
//     toast({
//       title: "Success",
//       description: "Vehicle updated successfully!",
//     });
    
//     // Navigate back to vehicle list
//     if (id) {
//       navigate('/vehicle');
//     } else {
//       navigate('/vehicle');
//     }
//   };

//   const handleCancel = () => {
//     if (id) {
//       navigate('/vehicle');
//     } else {
//       navigate('/vehicle');
//     }
//   };

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center h-screen">
//         <Loader2 className="h-8 w-8 animate-spin" />
//       </div>
//     );
//   }

//   if (!vehicle) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <p className="text-lg font-medium text-gray-700 mb-2">Vehicle not found</p>
//         <button
//           onClick={() => navigate('/vehicles')}
//           className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
//         >
//           Go Back
//         </button>
//       </div>
//     );
//   }

//   return (
//     <EditVehicleForm 
//       vehicle={vehicle} 
//       onSuccess={handleSuccess}
//       onCancel={handleCancel}
//     />
//   );
// }

// import { useParams, useNavigate } from 'react-router-dom';
// import { useEffect, useState, useCallback, useRef } from 'react';
// import { EditVehicleForm } from './EditVehicleForm';
// import { Vehicle } from '../../types/vehicle';
// import { useVehicles } from '../../hooks/useVehiclesLocal';
// import { Loader2 } from 'lucide-react';
// import { useToast } from '../../hooks/use-toast';
// import axios from 'axios';

// export function EditVehiclePage() {
//   const { id } = useParams<{ id: string }>();
//   const navigate = useNavigate();
//   const { toast } = useToast();
//   const { getVehicleById, refetch } = useVehicles();
//   const [vehicle, setVehicle] = useState<Vehicle | null>(null);
//   const [loading, setLoading] = useState(true);
//   const abortControllerRef = useRef<AbortController | null>(null);

//   // Memoize the fetchData function with stable dependencies
//   const fetchData = useCallback(async () => {
//     if (!id) {
//       toast({
//         title: "Error",
//         description: "Vehicle ID is missing",
//         variant: "destructive",
//       });
//       navigate('/vehicle');
//       return;
//     }

//     try {
//       // Cancel previous request if exists
//       if (abortControllerRef.current) {
//         abortControllerRef.current.abort('New request started');
//       }

//       // Create new abort controller
//       abortControllerRef.current = new AbortController();
//       const signal = abortControllerRef.current.signal;

//       // Try to get from local state first
//       const vehicleData = getVehicleById(id);
//       if (vehicleData) {
//         setVehicle(vehicleData);
//         setLoading(false);
//         return;
//       }

//       // Using axios with abort signal
//       const response = await axios.get(`https://autofinex-desktop-api.rimio.in/api/vehicles/${id}`, { signal });
    
//       setVehicle(response.data);
//       setLoading(false);
//     } catch (error: any) {
//       // Ignore abort errors
//       if (axios.isCancel(error)) {
//         console.log('Request cancelled:', error.message);
//         return;
//       }
      
//       console.error('Error fetching vehicle:', error);
      
//       if (axios.isAxiosError(error)) {
//         if (error.response?.status === 404) {
//           toast({
//             title: "Error",
//             description: "Vehicle not found",
//             variant: "destructive",
//           });
//           navigate('/vehicle');
//         } else {
//           toast({
//             title: "Error",
//             description: error.response?.data?.message || "Failed to fetch vehicle data",
//             variant: "destructive",
//           });
//         }
//       } else {
//         toast({
//           title: "Error",
//           description: "Failed to load vehicle",
//           variant: "destructive",
//         });
//       }
      
//       setLoading(false);
//     }
//   }, [id, navigate, toast, getVehicleById]); // Remove isMounted from dependencies

//   useEffect(() => {
//     fetchData();

//     // Cleanup function
//     return () => {
//       if (abortControllerRef.current) {
//         abortControllerRef.current.abort('Component unmounted');
//       }
//     };
//   }, [fetchData]); // fetchData is memoized with stable dependencies

//   const handleSuccess = (updatedVehicle: Vehicle) => {
//     // Refetch vehicles to update the list
//     refetch();
    
//     // Show success message
//     toast({
//       title: "Success",
//       description: "Vehicle updated successfully!",
//     });
    
//     // Navigate back to vehicle list
//     navigate('/vehicle');
//   };

//   const handleCancel = () => {
//     navigate('/vehicle');
//   };

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center h-screen">
//         <Loader2 className="h-8 w-8 animate-spin" />
//       </div>
//     );
//   }

//   if (!vehicle) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <p className="text-lg font-medium text-gray-700 mb-2">Vehicle not found</p>
//         <button
//           onClick={() => navigate('/vehicle')}
//           className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
//         >
//           Go Back
//         </button>
//       </div>
//     );
//   }

//   return (
//     <EditVehicleForm 
//       vehicle={vehicle} 
//       onSuccess={handleSuccess}
//       onCancel={handleCancel}
//     />
//   );
// }

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react'; // Only need useState and useEffect
import { EditVehicleForm } from './EditVehicleForm';
import { Vehicle } from '../../types/vehicle';
import { useVehicles } from '../../hooks/useVehiclesLocal';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import apiClient from '../../api/apiClient';

export function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getVehicleById, refetch } = useVehicles();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      toast({
        title: "Error",
        description: "Vehicle ID is missing",
        variant: "destructive",
      });
      navigate('/vehicle');
      return;
    }

    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        // Try to get from local state first
        const vehicleData = getVehicleById(id);
        if (vehicleData) {
          setVehicle(vehicleData);
          setLoading(false);
          return;
        }

        const response = await apiClient.get(`/vehicles/${id}`, {
          signal: abortController.signal
        });
        console.log('response:', response);
        setVehicle(response.data);
        setLoading(false);
      } catch (error: any) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
          console.log('Request cancelled');
          return;
        }
        
        console.error('Error fetching vehicle:', error);
        
        if (error?.response?.status === 404) {
          toast({
            title: "Error",
            description: "Vehicle not found",
            variant: "destructive",
          });
          navigate('/vehicle');
        } else {
          toast({
            title: "Error",
            description: error?.response?.data?.message || "Failed to fetch vehicle data",
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Cleanup function
    return () => {
      abortController.abort();
    };
  }, [id]); // Only depend on id

  const handleSuccess = (updatedVehicle: Vehicle) => {
    refetch();
    toast({
      title: "Success",
      description: "Vehicle updated successfully!",
    });
    navigate('/vehicle');
  };

  const handleCancel = () => {
    navigate('/vehicle');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-lg font-medium text-gray-700 mb-2">Vehicle not found</p>
        <button
          onClick={() => navigate('/vehicle')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <EditVehicleForm 
      vehicle={vehicle} 
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );
}