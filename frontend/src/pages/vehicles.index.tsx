import { useMemo, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { Search, Car, Bike, Zap, Grid, List, Filter, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVehicles } from "@/hooks/useVehicles";
import { VehicleCard } from "@/components/vehicle/VehicleCard";
import { VehicleDetails } from "@/components/vehicles old/VehicleDetails";
import { HostVehiclePage } from "@/components/vehicle/HostVehiclePage";
import type { Vehicle } from "@/types/vehicle";

const ALL_STATUSES = ["available", "sold", "hosted", "sales", "seized"];

export default function VehiclesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { vehicles, isLoading, refetch } = useVehicles();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "car" | "bike" | "scooter">("all");
  const [dealType, setDealType] = useState<"all" | "consulting" | "finance">("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [detailsVehicle, setDetailsVehicle] = useState<Vehicle | null>(null);
  const [hostVehicle, setHostVehicle] = useState<Vehicle | null>(null);

  const isHostView = location.pathname.endsWith("/host") || Boolean(hostVehicle);

  const activeVehicle = useMemo(() => {
    if (detailsVehicle) return detailsVehicle;
    if (id) {
      return vehicles.find((v) => String(v.id) === String(id)) || null;
    }
    return null;
  }, [detailsVehicle, id, vehicles]);

  const targetHostVehicle = useMemo(() => {
    if (hostVehicle) return hostVehicle;
    if (isHostView) {
      if (activeVehicle) return activeVehicle;
      if (id) return vehicles.find((v) => String(v.id) === String(id)) || null;
    }
    return null;
  }, [hostVehicle, isHostView, activeVehicle, id, vehicles]);

  const counts = useMemo(() => ({
    all: vehicles.length,
    car: vehicles.filter((v) => v.body_type && !["bike", "scooter"].includes(v.body_type)).length,
    bike: vehicles.filter((v) => v.body_type === "bike").length,
    scooter: vehicles.filter((v) => v.body_type === "scooter").length,
  }), [vehicles]);

  const dealCounts = useMemo(() => ({
    all: vehicles.length,
    consulting: vehicles.filter((v) => v.deal_type === "consulting").length,
    finance: vehicles.filter((v) => v.deal_type === "finance").length,
  }), [vehicles]);

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (tab === "bike" && v.body_type !== "bike") return false;
      if (tab === "scooter" && v.body_type !== "scooter") return false;
      if (tab === "car" && (v.body_type === "bike" || v.body_type === "scooter")) return false;
      if (dealType !== "all" && v.deal_type !== dealType) return false;
      if (statuses.length && !statuses.includes(v.status)) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          (v.vehicle_name ?? "").toLowerCase().includes(s) ||
          (v.brand ?? "").toLowerCase().includes(s) ||
          (v.model_name ?? v.model ?? "").toLowerCase().includes(s) ||
          (v.vehicle_number ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [vehicles, tab, dealType, statuses, q]);

  if (id && isLoading) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-muted animate-pulse rounded-lg" />
          <div className="h-96 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  if (id && !isLoading && !activeVehicle && !targetHostVehicle) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto text-center py-24 border-2 border-dashed rounded-lg space-y-3">
        <Car className="h-10 w-10 mx-auto text-muted-foreground/60" />
        <p className="text-base font-semibold">Vehicle Not Found</p>
        <p className="text-xs text-muted-foreground">The requested vehicle could not be found.</p>
        <Button onClick={() => { setDetailsVehicle(null); setHostVehicle(null); navigate("/vehicle"); }}>
          Back to Vehicles
        </Button>
      </div>
    );
  }

  // Render Host Vehicle as a full page
  if (isHostView && targetHostVehicle) {
    return (
      <HostVehiclePage
        vehicle={targetHostVehicle}
        onBack={() => {
          setHostVehicle(null);
          if (detailsVehicle || id) {
            navigate(`/vehicles/${targetHostVehicle.id}`);
          } else {
            navigate("/vehicle");
          }
        }}
        onSuccess={() => {
          setHostVehicle(null);
          refetch();
          navigate(`/vehicles/${targetHostVehicle.id}`);
        }}
      />
    );
  }

  // Render Vehicle Details as a full page
  if (activeVehicle) {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <VehicleDetails
          vehicle={activeVehicle}
          onBack={() => {
            setDetailsVehicle(null);
            navigate("/vehicle");
          }}
          onEdit={(vehicleId) => navigate(`/vehicles/${vehicleId}/edit`)}
          onHost={(vehicleId) => {
            const v = vehicles.find((item) => String(item.id) === String(vehicleId)) || activeVehicle;
            setHostVehicle(v);
            navigate(`/vehicles/${v.id}/host`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Vehicles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inventory, consulting and finance-hosted vehicles
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={dealType} onValueChange={(v) => setDealType(v as any)}>
            <TabsList className="h-10 bg-muted/60 p-1">
              <TabsTrigger value="all" className="text-xs sm:text-sm px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                All Deals
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] font-semibold">
                  {dealCounts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="consulting" className="text-xs sm:text-sm px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Consulting
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] font-semibold">
                  {dealCounts.consulting}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="finance" className="text-xs sm:text-sm px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Finance
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] font-semibold">
                  {dealCounts.finance}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Link
            to="/AddVehicleForm"
            className="inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-primary text-primary-foreground font-medium text-sm rounded-md shadow-sm hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Vehicle</span>
          </Link>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4 shadow-card space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, brand, model, or number..."
              className="pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4" /> Status
                {statuses.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{statuses.length}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ALL_STATUSES.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={statuses.includes(s)}
                  onCheckedChange={(v) =>
                    setStatuses((prev) => v ? [...prev, s] : prev.filter((x) => x !== s))
                  }
                  className="capitalize"
                >
                  {s}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button variant={view === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setView("grid")}>
              <Grid className="h-4 w-4" />
            </Button>
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{counts.all}</Badge></TabsTrigger>
            <TabsTrigger value="car"><Car className="h-3.5 w-3.5" /> Cars <Badge variant="secondary" className="ml-2">{counts.car}</Badge></TabsTrigger>
            <TabsTrigger value="bike"><Bike className="h-3.5 w-3.5" /> Bikes <Badge variant="secondary" className="ml-2">{counts.bike}</Badge></TabsTrigger>
            <TabsTrigger value="scooter"><Zap className="h-3.5 w-3.5" /> Scooters <Badge variant="secondary" className="ml-2">{counts.scooter}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed rounded-lg">
          <Car className="h-10 w-10 mx-auto text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No vehicles found</p>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className={view === "grid"
          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          : "space-y-3"}>
          {filtered.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              layout={view}
              onViewDetails={() => {
                setDetailsVehicle(v);
                navigate(`/vehicles/${v.id}`);
              }}
              onHost={() => {
                setHostVehicle(v);
                navigate(`/vehicles/${v.id}/host`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
