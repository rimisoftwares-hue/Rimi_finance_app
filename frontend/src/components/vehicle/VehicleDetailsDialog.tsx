import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Car, Bike, Zap, Calendar, Fuel, Gauge, Users, Palette,
  Hash, Cog, Shield, FileText, DollarSign, CreditCard,
} from "lucide-react";
import type { Vehicle } from "@/types/vehicle";
import { cn } from "../lib/utils";

/** Resolve image URL — supports signed_url, absolute URLs and /uploads paths */
function resolveImageUrl(url: string | undefined | null): string | null {
  if (!url || url.trim() === "") return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/uploads")) return `${(import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '')}${url}`;
  return url;
}

const statusStyles: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  sold: "bg-red-100 text-red-800 border-red-200",
  hosted: "bg-blue-100 text-blue-800 border-blue-200",
  sales: "bg-yellow-100 text-yellow-800 border-yellow-200",
  seized: "bg-purple-100 text-purple-800 border-purple-200",
};

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/40 border p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value ?? "—"}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon, title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <h4 className="text-sm font-semibold">{title}</h4>
    </div>
  );
}

export function VehicleDetailsDialog({
  vehicle,
  onOpenChange,
}: {
  vehicle: Vehicle | null;
  onOpenChange: (o: boolean) => void;
}) {
  if (!vehicle) return null;

  const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

  // Resolve best image
  const primaryImg = vehicle.images?.find((i) => i.is_primary) ?? vehicle.images?.[0];
  const img =
    resolveImageUrl(primaryImg?.signed_url) ??
    resolveImageUrl(primaryImg?.image_url) ??
    resolveImageUrl(vehicle.primary_image_url) ??
    null;

  // All vehicle images for gallery
  const allImages = vehicle.images ?? [];

  const displayName =
    vehicle.vehicle_name ||
    [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") ||
    "Vehicle Details";

  const BodyIcon =
    vehicle.body_type === "bike"
      ? Bike
      : vehicle.body_type === "scooter"
      ? Zap
      : Car;

  return (
    <Dialog open={!!vehicle} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <BodyIcon className="h-5 w-5 text-primary" />
            <span>{displayName}</span>
            <Badge
              variant="outline"
              className={cn("capitalize ml-1", statusStyles[vehicle.status] ?? "")}
            >
              {vehicle.status}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {vehicle.deal_type}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* ── Image Gallery ─────────────────────────────────────────────── */}
        {(img || allImages.length > 0) && (
          <div className="space-y-2">
            <div className="aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center">
              {img ? (
                <img
                  src={img}
                  className="h-full w-full object-cover"
                  alt={displayName}
                />
              ) : (
                <BodyIcon className="h-12 w-12 text-muted-foreground/40" />
              )}
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allImages.map((im) => {
                  const url =
                    resolveImageUrl(im.signed_url) ??
                    resolveImageUrl(im.image_url) ??
                    null;
                  return url ? (
                    <img
                      key={im.id}
                      src={url}
                      alt={im.image_type}
                      className="h-16 w-24 object-cover rounded-md border shrink-0"
                    />
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* ── Basic Info ────────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={Car} title="Vehicle Information" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Spec label="Brand" value={vehicle.brand} />
            <Spec label="Model" value={vehicle.model_name} />
            <Spec label="Year" value={vehicle.make_year} />
            <Spec label="Body Type" value={vehicle.body_type} />
            <Spec label="Fuel Type" value={vehicle.fuel_type} />
            <Spec label="Transmission" value={vehicle.transmission} />
            <Spec label="Color" value={vehicle.color} />
            <Spec label="Variant" value={vehicle.variant} />
          </div>
        </section>

        <Separator />

        {/* ── Ownership & Condition ─────────────────────────────────────── */}
        <section>
          <SectionHeader icon={Users} title="Ownership & Condition" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Spec label="Owners" value={vehicle.num_owner} />
            <Spec label="KM Driven" value={vehicle.trip_driven ? `${vehicle.trip_driven} km` : "—"} />
            <Spec label="Vehicle No" value={vehicle.vehicle_number} />
            <Spec
              label="Added On"
              value={
                vehicle.created_date
                  ? new Date(vehicle.created_date).toLocaleDateString("en-IN")
                  : "—"
              }
            />
          </div>
        </section>

        <Separator />

        {/* ── Specifications ────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={Cog} title="Specifications" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Spec label="Engine Capacity" value={vehicle.engine_capacity} />
            <Spec label="Fuel Tank" value={vehicle.fuel_tank_capacity} />
            <Spec label="Max Torque" value={vehicle.max_torque} />
            <Spec label="Top Speed" value={vehicle.top_speed} />
            <Spec label="Mileage" value={vehicle.mileage} />
            <Spec label="Seating" value={vehicle.seating_capacity} />
          </div>
        </section>

        <Separator />

        {/* ── Registration ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={Shield} title="Registration & Documents" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Spec label="Chassis No" value={vehicle.chassis_number} />
            <Spec label="Engine No" value={vehicle.engine_number} />
            <Spec label="RC Holder" value={vehicle.rc_holder} />
            <Spec label="RC Status" value={vehicle.rc_status} />
            <Spec
              label="FC Expiry"
              value={
                vehicle.fc_expriry_date
                  ? new Date(vehicle.fc_expriry_date).toLocaleDateString("en-IN")
                  : "—"
              }
            />
            <Spec
              label="Insurance Expiry"
              value={
                vehicle.insurance_expriry_date
                  ? new Date(vehicle.insurance_expriry_date).toLocaleDateString("en-IN")
                  : "—"
              }
            />
          </div>
        </section>

        <Separator />

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={DollarSign} title="Pricing" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Spec label="Base Price" value={vehicle.base_price ? `₹${inr.format(vehicle.base_price)}` : "—"} />
            <Spec label="Final Price" value={vehicle.final_price ? `₹${inr.format(vehicle.final_price)}` : "—"} />
            <Spec label="Selling Price" value={vehicle.selling_price ? `₹${inr.format(vehicle.selling_price)}` : "—"} />
            <Spec label="EMI From" value={vehicle.emi_from ? `₹${inr.format(vehicle.emi_from)}` : "—"} />
            {(vehicle.total_expenses ?? 0) > 0 && (
              <Spec
                label="Total Expenses"
                value={`₹${inr.format(vehicle.total_expenses ?? 0)}`}
              />
            )}
          </div>
        </section>

        {/* ── Remarks ───────────────────────────────────────────────────── */}
        {vehicle.remarks && (
          <>
            <Separator />
            <section>
              <SectionHeader icon={FileText} title="Remarks" />
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3 border">
                {vehicle.remarks}
              </p>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
