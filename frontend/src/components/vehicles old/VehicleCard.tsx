// import { Badge } from "../ui/badge";
// import { Button } from "../ui/button";
// import { Card, CardContent, CardFooter } from "../ui/card";
// import { Eye, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";
// import { useState } from "react";
// import { Vehicle } from "../../types/vehicle";

// interface VehicleCardProps {
//   vehicle: Vehicle;
//   onViewDetails: (vehicleId: string) => void;
//   onHost: (vehicleId: string) => void;
// }

// export function VehicleCard({ vehicle, onViewDetails, onHost }: VehicleCardProps) {
//   const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
//   const images = vehicle.images || [];
//   const primaryImage = images.find(img => img.is_primary) || images[0];
//   const displayImages = images.length > 0 ? images : [];

//   const getStatusBadge = (status: string) => {
//     switch (status) {
//       case "available":
//         return (
//           <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50">
//             Available
//           </Badge>
//         );
//       case "sold":
//         return (
//           <Badge variant="outline" className="text-red-600 border-red-600 bg-red-50">
//             Sold
//           </Badge>
//         );
//       case "sales" :
//         return (
//           <Badge variant="outline" className="text-yellow-600 border-yellow-600 bg-yellow-50">
//             Sales
//           </Badge>
//         );
//       case "seized" :
//         return (
//           <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs px-2 py-0.5">
//             Seized
//           </Badge>
//         );
//       case "hosted":
//         return (
//           <Badge variant="outline" className="text-blue-600 border-blue-600 bg-blue-50">
//             Hosted
//           </Badge>
//         );
//       default:
//         return null;
//     }
//   };

//   const getTypeColor = (type: string) => {
//     switch (type) {
//       case "bike":
//         return "text-blue-600";
//       case "scooter":
//         return "text-green-600";
//       case "sedan":
//       case "hatchback":
//       case "suv":
//       case "muv":
//       case "coupe":
//       case "convertible":
//         return "text-purple-600";
//       default:
//         return "text-muted-foreground";
//     }
//   };
//   const getImageUrl = (imageUrl: string) => {
//   if (!imageUrl) return '';
  
//   // If it's already a full URL, return as is
//   if (imageUrl.startsWith('http')) {
//     return imageUrl;
//   }
  
//   // If it's a relative path, prepend the backend URL
//   if (imageUrl.startsWith('/uploads')) {
//     return `https://autofinex-desktop-api.rimio.in${imageUrl}`;
//   }
  
//   // For any other cases, just return the original
//   return imageUrl;
// };
//   const nextImage = () => {
//     if (displayImages.length > 1) {
//       setCurrentImageIndex((prev) => (prev + 1) % displayImages.length);
//     }
//   };

//   const prevImage = () => {
//     if (displayImages.length > 1) {
//       setCurrentImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
//     }
//   };
 

//   const currentImage = displayImages[currentImageIndex] || primaryImage;
//   return (
//     <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover-scale">
//       {/* Vehicle Image with Navigation */}
//       <div className="relative h-48 w-full overflow-hidden">
//         {currentImage ? (
//           <img
//             src={getImageUrl(currentImage.signed_url ? currentImage.signed_url : currentImage.image_url)}
//             alt={`${vehicle.model_name} - ${currentImage.image_type}`}
//             className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
//           />
//         ) : (
//           <div className="h-full w-full bg-muted flex items-center justify-center">
//             <span className="text-muted-foreground">No Image</span>
//           </div>
//         )}
        
//         {/* Image Navigation */}
//         {displayImages.length > 1 && (
//           <>
//             <Button
//               variant="ghost"
//               size="icon"
//               className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
//               onClick={prevImage}
//             >
//               <ChevronLeft className="h-4 w-4" />
//             </Button>
//             <Button
//               variant="ghost"
//               size="icon"
//               className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
//               onClick={nextImage}
//             >
//               <ChevronRight className="h-4 w-4" />
//             </Button>
//             <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1">
//               {displayImages.map((_, index) => (
//                 <div
//                   key={index}
//                   className={`h-2 w-2 rounded-full ${
//                     index === currentImageIndex ? 'bg-white' : 'bg-white/50'
//                   }`}
//                 />
//               ))}
//             </div>
//           </>
//         )}
        
//         {/* Status Badge */}
//         <div className="absolute top-3 right-3">
//           {getStatusBadge(vehicle.status)}
//         </div>
//       </div>

//       <CardContent 
//         onClick={(e) => 
//           {e.preventDefault();
//           onViewDetails(vehicle.id);
//           }} 
//         className="p-4 space-y-3 cursor-pointer"
//       >
//         <div>
//           <h3 className="text-lg font-semibold text-foreground">{`${vehicle.brand} ${vehicle.model_name} (${vehicle.vehicle_modal})`} </h3>
//           {/* <p className="text-sm text-muted-foreground">{vehicle.vehicle_modal}</p> */}
//         </div>

//         <div className="space-y-2">
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Vehicle No:</span>
//             <span className="font-medium text-foreground">{vehicle.vehicle_number}</span>
//           </div>
          
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">KMs:</span>
//             <span className="font-medium text-foreground">{vehicle.trip_driven} km</span>
//           </div>

//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Owners:</span>
//             <span className="font-medium text-foreground">{vehicle.num_owner}</span>
//           </div>
          
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">EMI from:</span>
//             <span className="font-medium text-foreground">{Number(vehicle.emi_from).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2,})}</span>
//           </div>
//           {/* <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Type:</span>
//             <span className={`font-medium ${getTypeColor(vehicle.body_type)}`}>
//               {vehicle.body_type.charAt(0).toUpperCase() + vehicle.body_type.slice(1)}
//             </span>
//           </div> */}
          
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Price:</span>
//             <span className="font-semibold text-foreground">₹{Number(vehicle.final_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
//           </div>
//         </div>

//         <div className="pt-2 border-t border-border">
//           <div className="flex justify-between text-xs text-muted-foreground">
//             <span>Added: {new Date(vehicle.created_date).toLocaleDateString()}</span>
//             {vehicle.selling_date && (
//               <span>Sold: {new Date(vehicle.selling_date).toLocaleDateString()} </span>
//             )}
//           </div>
//         </div>
//       </CardContent>

//       {/* <CardFooter className="p-4 pt-0 space-x-2">
        
        
//         <Button
//           onClick={() => onHost(vehicle.id)}
//           className="flex-1"
//           disabled={vehicle.status === 'sold'}
//           variant={vehicle.status === 'hosted' ? "outline" : "default"}
//         >
//           <UserCheck className="h-4 w-4 mr-2" />
//           {vehicle.status === 'hosted' ? 'Hosted' : 'Host'}
//         </Button>
//       </CardFooter> */}
//       {/* <CardFooter className="p-4 pt-0">
//         <div className="flex items-center justify-between w-full gap-2">
         
//           <div className="text-sm font-semibold text-foreground">
//             ₹{vehicle.price?.toLocaleString() || '0'}
//           </div>
          
          
//           <Button
//             onClick={() => onHost(vehicle.id)}
//             disabled={vehicle.status === 'sold'}
//             variant={vehicle.status === 'hosted' ? "outline" : "default"}
//             size="sm"
//           >
//             <UserCheck className="h-4 w-4 mr-2" />
//             {vehicle.status === 'hosted' ? 'Hosted' : 'Host'}
//           </Button>
//         </div>
//       </CardFooter> */}
//       <CardFooter className="p-4 pt-0 space-x-2">
//         <div className="flex-1 flex items-center justify-between">
//           {/* Price Display - Vehicle Price + Total Expenses */}
//           <div className="text-right">
//             <div className="text-xl text-left font-bold text-foreground">
//               ₹{(
//                 Number(vehicle.selling_price || 0) +
//                 Number(vehicle.total_expenses || 0)
//               ).toLocaleString('en-IN')}
//             </div>

//             {(vehicle.total_expenses || 0) > 0 && (
//               <div className="text-xs text-muted-foreground">
//                 (₹{Number(vehicle.final_price || 0).toLocaleString('en-IN')} + ₹{Number(vehicle.total_expenses || 0).toLocaleString('en-IN')})
//               </div>
//             )}
//           </div>

          
//           {/* Host Button */}
//           <Button
//             onClick={(e) => {
//               e.preventDefault(); // Prevent default behavior
//               e.stopPropagation(); // Stop event bubbling
//               onHost(vehicle.id);
//             }}
//             disabled={vehicle.status === 'sold'}
//             variant={vehicle.status === 'hosted' ? "outline" : "default"}
//             className="ml-2"
//           >
//             <UserCheck className="h-4 w-4 mr-2" />
//             {vehicle.status === 'hosted' ? 'Hosted' : 'Host'}
//           </Button>
//         </div>
//       </CardFooter>
//     </Card>
//   );
// }

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Eye, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Vehicle } from "../../types/vehicle";

interface VehicleCardProps {
  vehicle: Vehicle;
  onViewDetails: (vehicleId: string) => void;
  onHost: (vehicleId: string) => void;
}

export function VehicleCard({ vehicle, onViewDetails, onHost }: VehicleCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  
  const images = vehicle.images || [];
  const primaryImage = images.find(img => img.is_primary) || images[0];
  const displayImages = images.length > 0 ? images : [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50">
            Available
          </Badge>
        );
      case "sold":
        return (
          <Badge variant="outline" className="text-red-600 border-red-600 bg-red-50">
            Sold
          </Badge>
        );
      case "sales" :
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600 bg-yellow-50">
            Sales
          </Badge>
        );
      case "seized" :
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs px-2 py-0.5">
            Seized
          </Badge>
        );
      case "hosted":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-600 bg-blue-50">
            Hosted
          </Badge>
        );
      default:
        return null;
    }
  };

  const getImageUrl = (imageUrl: string) => {
    if (!imageUrl || imageUrl.trim() === '') return '';
    
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }
    
    if (imageUrl.startsWith('/uploads')) {
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
      return `${baseUrl}${imageUrl}`;
    }
    
    return imageUrl;
  };

  const nextImage = () => {
    if (displayImages.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % displayImages.length);
      setImageError(false);
    }
  };

  const prevImage = () => {
    if (displayImages.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
      setImageError(false);
    }
  };

  const currentImage = displayImages[currentImageIndex] || primaryImage;
  const imageUrl = currentImage ? getImageUrl(currentImage.signed_url || currentImage.image_url) : '';
  const hasValidImage = imageUrl && imageUrl.trim() !== '';

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover-scale">
      {/* Vehicle Image with Navigation */}
      <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black">
        {hasValidImage && !imageError ? (
          <>
            <img
              src={imageUrl}
              alt={`${vehicle.model_name} - ${currentImage.image_type}`}
              className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
              onError={() => setImageError(true)}
              loading="lazy"
            />
            
            {/* Image Navigation */}
            {displayImages.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
                  onClick={prevImage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
                  onClick={nextImage}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1">
                  {displayImages.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 w-2 rounded-full ${
                        index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center p-4">
            <div className="text-gray-400 dark:text-gray-500 mb-2">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-12 w-12" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1.5} 
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                />
              </svg>
            </div>
            <span className="text-sm text-gray-300 dark:text-gray-400 text-center">
              No vehicle image available
            </span>
          </div>
        )}
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          {getStatusBadge(vehicle.status)}
        </div>
      </div>

      <CardContent 
        onClick={(e) => { 
          e.preventDefault();
          onViewDetails(vehicle.id);
        }} 
        className="p-4 space-y-3 cursor-pointer"
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {`${vehicle.brand} ${vehicle.model_name} (${vehicle.vehicle_modal})`}
          </h3>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Vehicle No:</span>
            <span className="font-medium text-foreground">{vehicle.vehicle_number}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">KMs:</span>
            <span className="font-medium text-foreground">{vehicle.trip_driven} km</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Owners:</span>
            <span className="font-medium text-foreground">{vehicle.num_owner}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">EMI from:</span>
            <span className="font-medium text-foreground">
              {Number(vehicle.emi_from).toLocaleString('en-IN', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price:</span>
            <span className="font-semibold text-foreground">
              ₹{Number(vehicle.final_price).toLocaleString('en-IN', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Added: {new Date(vehicle.created_date).toLocaleDateString()}</span>
            {vehicle.selling_date && (
              <span>Sold: {new Date(vehicle.selling_date).toLocaleDateString()} </span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 space-x-2">
        <div className="flex-1 flex items-center justify-between">
          {/* Price Display - Vehicle Price + Total Expenses */}
          <div className="text-right">
            <div className="text-xl text-left font-bold text-foreground">
              ₹{(
                Number(vehicle.selling_price || 0) +
                Number(vehicle.total_expenses || 0)
              ).toLocaleString('en-IN')}
            </div>

            {(vehicle.total_expenses || 0) > 0 && (
              <div className="text-xs text-muted-foreground">
                (₹{Number(vehicle.final_price || 0).toLocaleString('en-IN')} + ₹{Number(vehicle.total_expenses || 0).toLocaleString('en-IN')})
              </div>
            )}
          </div>

          {/* Host Button */}
          <Button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onHost(vehicle.id);
            }}
            disabled={vehicle.status === 'sold'}
            variant={vehicle.status === 'hosted' ? "outline" : "default"}
            className="ml-2"
          >
            <UserCheck className="h-4 w-4 mr-2" />
            {vehicle.status === 'hosted' ? 'Hosted' : 'Host'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}