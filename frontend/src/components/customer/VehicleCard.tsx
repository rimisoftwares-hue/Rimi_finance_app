import { useNavigate } from 'react-router-dom';
import { Car, Fuel, Gauge, Settings2, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { VehicleDetails } from '../../types/customer';

interface VehicleCardProps {
  vehicle: VehicleDetails;
}

const VehicleCard = ({ vehicle }: VehicleCardProps) => {
  const navigate = useNavigate();
  const vehicleId = vehicle.id || (vehicle as any)?.vehicle_id || (vehicle as any)?.vehicle_info_id;

  const details = [
    { label: 'Brand', value: vehicle.brand },
    { label: 'Model', value: vehicle.model_name },
    { label: 'Vehicle No', value: vehicle.vehicle_number },
    { label: 'Make Year', value: vehicle.make_year?.toString() },
    { label: 'Body Type', value: vehicle.body_type },
    { label: 'Engine', value: vehicle.engine_capacity },
    { label: 'Color', value: vehicle.color },
    { label: 'Variant', value: vehicle.variant },
  ].filter(d => d.value);

  return (
    <div className="card-elevated p-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
      <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <Car className="h-5 w-5 text-primary" />
        </div>
        Vehicle Details
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {details.map((detail, index) => (
          <div
            key={index}
            className="p-3 bg-muted/50 rounded-lg border border-border/50 hover:bg-muted transition-colors"
          >
            <p className="text-xs text-muted-foreground mb-0.5">{detail.label}</p>
            <p className="font-medium text-foreground text-sm">{detail.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {vehicle.fuel_type && (
            <div className="flex items-center gap-2 text-sm">
              <Fuel className="w-4 h-4 text-success" />
              <span className="text-muted-foreground capitalize">{vehicle.fuel_type}</span>
              {vehicle.fuel_tank_capacity && (
                <span className="text-muted-foreground capitalize">({vehicle.fuel_tank_capacity})</span>
              )}
            </div>
          )}
          {vehicle.mileage && (
            <div className="flex items-center gap-2 text-sm">
              <Gauge className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">{vehicle.mileage}</span>
            </div>
          )}
          {vehicle.top_speed && (
            <div className="flex items-center gap-2 text-sm">
              <Settings2 className="w-4 h-4 text-accent" />
              <span className="text-muted-foreground">{vehicle.top_speed}</span>
            </div>
          )}
        </div>

        {vehicleId && (
          <Button
            size="sm"
            className="gap-2 ml-auto"
            onClick={() => navigate(`/vehicles/${vehicleId}`)}
          >
            <span>View Vehicle</span>
            <ExternalLink className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default VehicleCard;
