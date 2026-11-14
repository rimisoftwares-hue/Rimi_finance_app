import { useState, useMemo } from "react";
import apiClient from '../api/apiClient';
import { Search, Filter, Car, Bike, Zap, ChevronDown, Plus, Grid, List } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { VehicleCard } from "../components/vehicles old/VehicleCard";
import { VehicleDetails } from "../components/vehicles old/VehicleDetails";
import { useVehicles } from "../hooks/useVehiclesLocal";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { useToast } from '../hooks/use-toast';
import { Badge } from "../components/ui/badge";
import { Toggle } from "../components/ui/toggle";

export default function Vehicles() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"consulting" | "finance">("consulting");
  const { vehicles, isLoading, getVehicleById } = useVehicles();
  const { toast } = useToast();

  // All available statuses including seized
  const allStatuses = ["available", "sold", "hosted", "sales", "seized"];

  // Get vehicle count for each tab (UNFILTERED - shows all vehicles for that tab)
  const getVehicleCount = (type: string) => {
    if (type === "all") return vehicles.length;
    if (type === "bike") return vehicles.filter(v => v.body_type === "bike").length;
    if (type === "scooter") return vehicles.filter(v => v.body_type === "scooter").length;
    if (type === "car") return vehicles.filter(v => v.body_type !== "bike" && v.body_type !== "scooter").length;
    return 0;
  };

  // Get vehicles for current tab (UNFILTERED - for tab switching)
  const tabVehicles = useMemo(() => {
    if (activeTab === "all") return vehicles;
    if (activeTab === "bike") return vehicles.filter(v => v.body_type === "bike");
    if (activeTab === "scooter") return vehicles.filter(v => v.body_type === "scooter");
    if (activeTab === "car") return vehicles.filter(v => v.body_type !== "bike" && v.body_type !== "scooter");
    return vehicles;
  }, [vehicles, activeTab]);

  // Filter vehicles based on search, tab, and status filters
  const filteredVehicles = useMemo(() => {
    return tabVehicles.filter((vehicle) => {
      const matchesSearch =
        vehicle.model_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vehicle.make_year?.toLocaleString().toLowerCase().includes(searchQuery.toLowerCase()) ||
        vehicle.chassis_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vehicle.vehicle_number?.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter logic
      const matchesStatus = statusFilters.length === 0 || statusFilters.includes(vehicle.status);

      return matchesSearch && matchesStatus;
    });
  }, [tabVehicles, searchQuery, statusFilters]);

  const handleStatusFilterChange = (status: string) => {
    setStatusFilters(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearAllFilters = () => {
    setStatusFilters([]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs px-2 py-0.5">Available</Badge>;
      case "sold":
        return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs px-2 py-0.5">Sold</Badge>;
      case "sales":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs px-2 py-0.5">Sales</Badge>;
      case "hosted":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-2 py-0.5">Hosted</Badge>;
      case "seized":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs px-2 py-0.5">Seized</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs px-2 py-0.5">{status}</Badge>;
    }
  };

  const handleViewDetails = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
  };

  const handleHost = async (vehicleId: string) => {
    try {
      const response = await apiClient.put(
        `/vehicles/${vehicleId}/host-toggle`
      );
      toast({
        title: "Success",
        description: response.data.message,
      });

      // Refresh the page to show updated status
      window.location.reload();
    } catch (error) {
      console.error('Error hosting vehicle:', error);
      toast({
        title: "Error",
        description: "Failed to update vehicle status",
        variant: "destructive",
      });
    }
  };

  const handleBackToList = () => {
    setSelectedVehicleId(null);
  };

  const selectedVehicle = selectedVehicleId ? getVehicleById(selectedVehicleId) : null;
  const getTabIcon = (tab: string) => {
    switch (tab) {
      case "bike":
        return <Bike className="h-4 w-4" />;
      case "car":
        return <Car className="h-4 w-4" />;
      case "scooter":
        return <Zap className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (selectedVehicle) {
    return (
      <VehicleDetails
        vehicle={selectedVehicle}
        onBack={handleBackToList}
        onEdit={(id) => console.log("Edit vehicle:", id)}
        onHost={handleHost}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Page Header - Compact and responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">Vehicles</h1>
          <p className="text-muted-foreground mt-1 text-sm truncate">
            Manage your vehicle inventory and sales
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Deal Type Toggle - Consulting (Grid) / Finance (List) */}
          <div className="hidden sm:flex items-center gap-1 border rounded-md p-1">
            <Toggle
              pressed={viewMode === "consulting"}
              onPressedChange={() => setViewMode("consulting")}
              size="sm"
              className="h-8 px-3 text-xs font-medium gap-1.5"
              aria-label="Consulting view"
            >
              <Grid className="h-4 w-4" />
              Consulting
            </Toggle>
            <Toggle
              pressed={viewMode === "finance"}
              onPressedChange={() => setViewMode("finance")}
              size="sm"
              className="h-8 px-3 text-xs font-medium gap-1.5"
              aria-label="Finance view"
            >
              <List className="h-4 w-4" />
              Finance
            </Toggle>
          </div>

          <Link
            to={"/AddVehicleForm"}
            className="flex items-center justify-center px-3 py-2 md:px-4 md:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs xs:text-sm md:text-base w-full sm:w-auto flex-shrink-0 whitespace-nowrap"
          >
            <Plus className="h-3 w-3 xs:h-4 xs:w-4 mr-1 md:mr-2" />
            <span>Add Vehicle</span>
          </Link>
        </div>
      </div>

      {/* Search and Filters - Responsive layout */}
      <div className="dashboard-card p-3 xs:p-4 md:p-6">
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 xs:h-4 xs:w-4 text-muted-foreground" />
            <Input
              placeholder="Search vehicles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 xs:pl-10 text-xs xs:text-sm md:text-base h-9 xs:h-10 md:h-11"
            />
          </div>

          {/* Filter Dropdown - Responsive button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto h-9 xs:h-10 md:h-11 text-xs xs:text-sm px-3">
                <Filter className="h-3 w-3 xs:h-4 xs:w-4 mr-1 xs:mr-2" />
                <span className="hidden xs:inline">Status</span>
                <span className="xs:hidden">Filter</span>
                <ChevronDown className="h-3 w-3 xs:h-4 xs:w-4 ml-1 xs:ml-2" />
                {statusFilters.length > 0 && (
                  <Badge variant="secondary" className="ml-1 xs:ml-2 h-4 w-4 xs:h-5 xs:w-5 p-0 flex items-center justify-center text-[10px] xs:text-xs">
                    {statusFilters.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 xs:w-56">
              <div className="flex items-center justify-between p-2">
                <span className="text-xs xs:text-sm font-medium">Filter by Status</span>
                {statusFilters.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-auto p-0 text-[10px] xs:text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </Button>
                )}
              </div>
              <DropdownMenuSeparator />
              {allStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilters.includes(status)}
                  onCheckedChange={() => handleStatusFilterChange(status)}
                  className="capitalize text-xs xs:text-sm py-1.5 xs:py-2"
                >
                  <div className="flex items-center gap-1 xs:gap-2">
                    {getStatusBadge(status)}
                    <span>{status}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Active Filters Display - Responsive */}
        {statusFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 xs:gap-2 mt-3 pt-3 border-t">
            <span className="text-[10px] xs:text-xs md:text-sm text-muted-foreground whitespace-nowrap">Active filters:</span>
            {statusFilters.map((status) => (
              <Badge
                key={status}
                variant="secondary"
                className="flex items-center gap-0.5 xs:gap-1 capitalize text-[10px] xs:text-xs h-5 xs:h-6 px-1.5 xs:px-2"
              >
                <span className="truncate max-w-[60px] xs:max-w-none">{status}</span>
                <button
                  onClick={() => handleStatusFilterChange(status)}
                  className="ml-0.5 xs:ml-1 hover:text-destructive text-xs"
                  aria-label={`Remove ${status} filter`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-5 xs:h-6 text-[10px] xs:text-xs px-2"
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      {/* Vehicle Tabs - Responsive tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 bg-muted h-8 xs:h-9 sm:h-10 md:h-11">
          <TabsTrigger value="all" className="flex items-center justify-center gap-0.5 xs:gap-1 sm:gap-2 text-[10px] xs:text-xs sm:text-sm px-1 xs:px-2">
            <span className="truncate">All ({getVehicleCount("all")})</span>
          </TabsTrigger>
          <TabsTrigger value="bike" className="flex items-center justify-center gap-0.5 xs:gap-1 sm:gap-2 text-[10px] xs:text-xs sm:text-sm px-1 xs:px-2">
            {getTabIcon("bike")}
            <span className="truncate">Bikes ({getVehicleCount("bike")})</span>
          </TabsTrigger>
          <TabsTrigger value="car" className="flex items-center justify-center gap-0.5 xs:gap-1 sm:gap-2 text-[10px] xs:text-xs sm:text-sm px-1 xs:px-2">
            {getTabIcon("car")}
            <span className="truncate">Cars ({getVehicleCount("car")})</span>
          </TabsTrigger>
          <TabsTrigger value="scooter" className="flex items-center justify-center gap-0.5 xs:gap-1 sm:gap-2 text-[10px] xs:text-xs sm:text-sm px-1 xs:px-2">
            {getTabIcon("scooter")}
            <span className="truncate">Scooters ({getVehicleCount("scooter")})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-3 xs:mt-4 md:mt-6">
          {isLoading ? (
            // Responsive loading skeleton
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredVehicles.length > 0 ? (
            <>
              {/* Filter vehicles by selected deal_type */}
              {(() => {
                const displayVehicles = filteredVehicles.filter(v => v.deal_type === viewMode);

                if (displayVehicles.length === 0) {
                  return (
                    <div className="dashboard-card text-center py-8">
                      <h3 className="text-base font-semibold text-foreground mb-1">
                        No {viewMode} vehicles found
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Switch to {viewMode === "consulting" ? "Finance" : "Consulting"} to see other vehicles
                      </p>
                    </div>
                  );
                }

                return (
                  <>
                    {/* Mobile: Always list view */}
                    <div className="block sm:hidden space-y-3">
                      {displayVehicles.map((vehicle) => (
                        <div
                          key={vehicle.id}
                          className="dashboard-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleViewDetails(vehicle.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-sm truncate">
                                  {vehicle.model_name || "Unnamed Vehicle"}
                                </h3>
                                {getStatusBadge(vehicle.status)}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="truncate">{vehicle.vehicle_number}</span>
                                <span>•</span>
                                <span>{vehicle.make_year}</span>
                                <span>•</span>
                                <span className="capitalize">{vehicle.body_type}</span>
                              </div>
                            </div>
                            <div className="ml-2 flex flex-col items-end gap-1">
                              <span className="font-bold text-sm">
                                ₹{vehicle.selling_price?.toLocaleString() || "N/A"}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleHost(vehicle.id);
                                }}
                              >
                                {vehicle.status === "hosted" ? "Unhost" : "Host"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tablet and up */}
                    <div className="hidden sm:block">
                      {viewMode === "consulting" ? (
                        // Consulting → Grid View
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                          {displayVehicles.map((vehicle) => (
                            <div key={vehicle.id} className="min-w-0">
                              <VehicleCard
                                vehicle={vehicle}
                                onViewDetails={handleViewDetails}
                                onHost={handleHost}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Finance → List View
                        <div className="space-y-3">
                          {displayVehicles.map((vehicle) => (
                            <div
                              key={vehicle.id}
                              className="dashboard-card p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => handleViewDetails(vehicle.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                  {/* Vehicle Image/Icon */}
                                  <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                                    {vehicle.body_type === "car" ? (
                                      <Car className="h-8 w-8 text-muted-foreground" />
                                    ) : vehicle.body_type === "bike" ? (
                                      <Bike className="h-8 w-8 text-muted-foreground" />
                                    ) : vehicle.body_type === "scooter" ? (
                                      <Zap className="h-8 w-8 text-muted-foreground" />
                                    ) : (
                                      <Car className="h-8 w-8 text-muted-foreground" />
                                    )}
                                  </div>

                                  {/* Vehicle Details */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                      <h3 className="font-semibold text-lg truncate">
                                        {vehicle.model_name || "Unnamed Vehicle"}
                                      </h3>
                                      {getStatusBadge(vehicle.status)}
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                                      <div>
                                        <span className="font-medium">Vehicle No:</span>
                                        <span className="ml-1">{vehicle.vehicle_number || "N/A"}</span>
                                      </div>
                                      <div>
                                        <span className="font-medium">Year:</span>
                                        <span className="ml-1">{vehicle.make_year || "N/A"}</span>
                                      </div>
                                      <div>
                                        <span className="font-medium">Chassis:</span>
                                        <span className="ml-1 truncate">{vehicle.chassis_number?.slice(0, 10) || "N/A"}...</span>
                                      </div>
                                      <div>
                                        <span className="font-medium">Type:</span>
                                        <span className="ml-1 capitalize">{vehicle.body_type}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Price and Actions */}
                                  <div className="flex flex-col items-end gap-2 min-w-[120px]">
                                    <span className="font-bold text-lg">
                                      ₹{vehicle.selling_price?.toLocaleString() || "N/A"}
                                    </span>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewDetails(vehicle.id);
                                        }}
                                      >
                                        Details
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleHost(vehicle.id);
                                        }}
                                      >
                                        {vehicle.status === "hosted" ? "Unhost" : "Host"}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            // Empty state - Responsive
            <div className="dashboard-card text-center py-6 xs:py-8 md:py-12">
              {activeTab === "bike" ? (
                <Bike className="h-8 w-8 xs:h-10 xs:w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-2 xs:mb-3 md:mb-4" />
              ) : activeTab === "car" ? (
                <Car className="h-8 w-8 xs:h-10 xs:w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-2 xs:mb-3 md:mb-4" />
              ) : activeTab === "scooter" ? (
                <Zap className="h-8 w-8 xs:h-10 xs:w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-2 xs:mb-3 md:mb-4" />
              ) : (
                <Car className="h-8 w-8 xs:h-10 xs:w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-2 xs:mb-3 md:mb-4" />
              )}
              <h3 className="text-sm xs:text-base md:text-lg font-semibold text-foreground mb-1 xs:mb-2">
                No {activeTab !== "all" ? activeTab + "s" : "vehicles"} found
              </h3>
              <p className="text-xs xs:text-sm md:text-base text-muted-foreground px-2">
                {searchQuery || statusFilters.length > 0
                  ? "Try adjusting your search criteria or filters"
                  : activeTab === "all"
                    ? "Add your first vehicle to get started"
                    : `Add your first ${activeTab} to get started`
                }
              </p>
              {(searchQuery || statusFilters.length > 0) && (
                <Button
                  variant="outline"
                  className="mt-2 xs:mt-3 md:mt-4 text-xs xs:text-sm h-7 xs:h-8 md:h-9"
                  onClick={() => {
                    setSearchQuery("");
                    clearAllFilters();
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Mobile-friendly info */}
      <div className="block sm:hidden pt-2 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {activeTab === "all"
              ? `Showing ${filteredVehicles.length} of ${getVehicleCount("all")} vehicles`
              : `Showing ${filteredVehicles.length} of ${getVehicleCount(activeTab)} ${activeTab}${getVehicleCount(activeTab) !== 1 ? 's' : ''}`
            }
          </span>
          <span className="text-right">Tap for details</span>
        </div>
      </div>
    </div>
  );
}