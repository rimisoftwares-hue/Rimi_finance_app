import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Eye, UserCheck, Car, Fuel, Calendar, Gauge, Sparkles } from "lucide-react";
import type { Vehicle } from "@/types/vehicle";
import { cn } from "../lib/utils";

interface Props {
  vehicle: Vehicle;
  layout?: "grid" | "list";
  onViewDetails: () => void;
  onHost: () => void;
}

const statusStyles: Record<string, string> = {
  available: "bg-success/10 text-success border-success/30",
  sold: "bg-destructive/10 text-destructive border-destructive/30",
  hosted: "bg-primary/10 text-primary border-primary/30",
  sales: "bg-warning/10 text-warning border-warning/30",
  seized: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
};

/** Resolve image URL — handles signed_url, absolute URLs, and /uploads paths */
function resolveImageUrl(url: string | undefined | null): string | null {
  if (!url || url.trim() === "") return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/uploads")) return `${(import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '')}${url}`;
  return url;
}

export function VehicleCard({ vehicle, layout = "grid", onViewDetails, onHost }: Props) {
  const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

  // Resolve best available image (signed_url → image_url → primary_image_url)
  const primaryImg = vehicle.images?.find((i) => i.is_primary) ?? vehicle.images?.[0];
  const img =
    resolveImageUrl(primaryImg?.signed_url) ??
    resolveImageUrl(primaryImg?.image_url) ??
    resolveImageUrl(vehicle.primary_image_url) ??
    null;

  // Vehicle name: use vehicle_name if set, otherwise compose from brand + model_name
  const displayName =
    vehicle.vehicle_name ||
    [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") ||
    "—";

  if (layout === "list") {
    return (
      <Card
        className="overflow-hidden shadow-card hover:shadow-card-hover transition-smooth cursor-pointer"
        onClick={onViewDetails}
      >
        <div className="flex items-center gap-4 p-3">
          <div className="h-16 w-24 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
            {img ? (
              <img src={img} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <Car className="h-6 w-6 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate">{displayName}</h3>
              <Badge
                variant="outline"
                className={cn("capitalize text-[10px] px-1.5 py-0", statusStyles[vehicle.status])}
              >
                {vehicle.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {vehicle.brand} · {vehicle.model_name} · {vehicle.make_year} · {vehicle.vehicle_number ?? "—"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-primary">
              ₹{inr.format(vehicle.selling_price || vehicle.final_price || 0)}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase">Selling</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails();
              }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={vehicle.status === "hosted" ? "outline" : "default"}
              className={vehicle.status === "hosted" ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20" : ""}
              onClick={(e) => {
                e.stopPropagation();
                onHost();
              }}
              disabled={vehicle.status === "sold"}
            >
              {vehicle.status === "hosted" ? (
                <>
                  <UserCheck className="h-3.5 w-3.5 mr-1" /> Hosted
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Host
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="group overflow-hidden shadow-card hover:shadow-card-hover transition-smooth border-border/70 hover:border-primary/40 pt-0 pb-0 gap-0 cursor-pointer"
      onClick={onViewDetails}
    >
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {img ? (
          <img
            src={img}
            alt={displayName}
            className="h-full w-full object-cover group-hover:scale-105 transition-smooth"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Car className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge
            variant="outline"
            className={cn("capitalize backdrop-blur-sm", statusStyles[vehicle.status])}
          >
            {vehicle.status}
          </Badge>
        </div>
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="capitalize backdrop-blur-sm bg-background/80">
            {vehicle.deal_type}
          </Badge>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-base leading-tight truncate">{displayName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {vehicle.brand} · {vehicle.model_name}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" /> {vehicle.make_year}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground capitalize">
            <Fuel className="h-3 w-3" /> {vehicle.fuel_type ?? "—"}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Gauge className="h-3 w-3" /> {vehicle.trip_driven || 0} km
          </div>
        </div>
        <div className="pt-2 border-t flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Selling Price</p>
            <p className="text-lg font-bold text-primary">
              ₹{inr.format(vehicle.selling_price || vehicle.final_price || 0)}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            {vehicle.vehicle_number ?? "—"}
          </p>
        </div>
      </CardContent>

      <CardFooter className="p-3 pt-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
        >
          <Eye className="h-3.5 w-3.5" /> View
        </Button>
        <Button
          size="sm"
          variant={vehicle.status === "hosted" ? "outline" : "default"}
          className={cn(
            "flex-1",
            vehicle.status === "hosted"
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "shadow-primary"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onHost();
          }}
          disabled={vehicle.status === "sold"}
        >
          {vehicle.status === "hosted" ? (
            <>
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Hosted
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Host
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
