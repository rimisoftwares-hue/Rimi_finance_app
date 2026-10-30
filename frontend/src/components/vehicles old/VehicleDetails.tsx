import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import {
  ArrowLeft, Calendar, Car, CreditCard, Edit, Eye, X, Plus, Trash2,
  Sparkles, UserCheck, Fuel, Gauge, Shield, FileText, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { Label } from '../ui/label';
import { Vehicle } from '../../types/vehicle';
import { toast } from '../../hooks/use-toast';
import { cn } from '../lib/utils';

interface VehicleDetailsProps {
  vehicle: Vehicle;
  onBack: () => void;
  onEdit: (vehicleId: string) => void;
  onHost: (vehicleId: string) => void;
}

interface VehicleExpense {
  id: number;
  expense_date: string;
  description: string;
  amount: number;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  available: "bg-success/10 text-success border-success/30",
  sold: "bg-destructive/10 text-destructive border-destructive/30",
  hosted: "bg-primary/10 text-primary border-primary/30",
  sales: "bg-warning/10 text-warning border-warning/30",
  seized: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
};

export function VehicleDetails({ vehicle, onBack, onEdit, onHost }: VehicleDetailsProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [openExpenseDialog, setOpenExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<VehicleExpense | null>(null);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [newExpense, setNewExpense] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    description: '',
    amount: 0,
  });

  const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
  const images = vehicle.images || [];
  const mainImage = images[currentImageIndex] || images[0];

  // Helper function to check if image URL is valid
  const isValidImageUrl = (url?: string): boolean => {
    if (!url) return false;
    const trimmedUrl = url.trim();
    return trimmedUrl !== '' && (trimmedUrl.startsWith('http') || trimmedUrl.startsWith('/'));
  };

  // Helper function to get full image URL
  const getFullImageUrl = (imageUrl?: string): string | null => {
    if (!isValidImageUrl(imageUrl)) return null;
    const url = imageUrl!.trim();
    if (url.startsWith('http')) return url;
    if (url.startsWith('/uploads')) return `${BASE_URL}${url}`;
    return url;
  };

  const currentImageUrl = mainImage
    ? getFullImageUrl(mainImage.signed_url || mainImage.image_url)
    : getFullImageUrl(vehicle.primary_image_url);

  const hasValidImage = currentImageUrl !== null;

  const fetchExpenses = async () => {
    try {
      const res = await apiClient.get(`/vehicles/${vehicle.id}/expenses`);
      setExpenses(res.data || []);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    }
  };

  useEffect(() => {
    if (vehicle.id) {
      fetchExpenses();
      setCurrentImageIndex(0);
    }
  }, [vehicle.id]);

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const vehicleSellingPrice = Number(vehicle.selling_price || vehicle.final_price || 0);
  const totalPrice = vehicleSellingPrice + totalExpenses;

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const expenseData = {
        expense_date: newExpense.expense_date,
        description: newExpense.description,
        amount: Number(newExpense.amount) || 0,
      };

      if (editingExpense) {
        await apiClient.put(`/vehicles/${vehicle.id}/expenses/${editingExpense.id}`, expenseData);
        toast({
          title: "Expense Updated",
          description: "Vehicle expense has been updated successfully.",
        });
      } else {
        await apiClient.post(`/vehicles/${vehicle.id}/expenses`, expenseData);
        toast({
          title: "Expense Added",
          description: "New expense has been added to the vehicle.",
        });
      }

      await fetchExpenses();
      handleCloseExpenseDialog();
    } catch (err: any) {
      console.error('Expense error:', err);
      toast({
        title: "Error",
        description: err.response?.data?.message || "Failed to save expense. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditExpense = (expense: VehicleExpense) => {
    setEditingExpense(expense);
    setNewExpense({
      expense_date: expense.expense_date,
      description: expense.description,
      amount: expense.amount,
    });
    setOpenExpenseDialog(true);
  };

  const handleDeleteExpense = async (expenseId: number) => {
    try {
      await apiClient.delete(`/vehicles/${vehicle.id}/expenses/${expenseId}`);
      setExpenses(prev => prev.filter(exp => exp.id !== expenseId));
      toast({
        title: "Expense Deleted",
        description: "The expense has been deleted successfully.",
      });
    } catch (err: any) {
      console.error('Delete error:', err);
      toast({
        title: "Error",
        description: err.response?.data?.message || "Failed to delete expense. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCloseExpenseDialog = () => {
    setOpenExpenseDialog(false);
    setEditingExpense(null);
    setNewExpense({
      expense_date: new Date().toISOString().split('T')[0],
      description: '',
      amount: 0,
    });
  };

  const formatDateForDisplay = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString("en-IN", {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const displayName =
    vehicle.vehicle_name ||
    [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") ||
    vehicle.vehicle_modal ||
    "Vehicle Details";

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div className="flex items-center space-x-3.5">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {displayName}
              </h1>
              <Badge
                variant="outline"
                className={cn("capitalize px-2 py-0.5 text-xs font-semibold", statusStyles[vehicle.status])}
              >
                {vehicle.status}
              </Badge>
              {vehicle.deal_type && (
                <Badge variant="secondary" className="capitalize text-xs font-medium">
                  {vehicle.deal_type}
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {[vehicle.brand, vehicle.model_name || vehicle.model, vehicle.make_year, vehicle.vehicle_number]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <Link
            to={`/vehicles/${vehicle.id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-md border border-input bg-background hover:bg-muted font-medium text-sm transition-colors"
          >
            <Edit className="h-4 w-4" />
            <span>Edit</span>
          </Link>

          {vehicle.status === "hosted" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onHost(vehicle.id)}
              className="h-9 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 shadow-sm"
            >
              <UserCheck className="h-4 w-4" />
              <span>Hosted</span>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onHost(vehicle.id)}
              disabled={vehicle.status === "sold"}
              className="h-9 gap-1.5 shadow-primary"
            >
              <Sparkles className="h-4 w-4" />
              <span>Host</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Grid: Images (Left) + Pricing & Key Info (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Image Gallery (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="overflow-hidden shadow-card border-border/80">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Vehicle Gallery</span>
                {images.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    {currentImageIndex + 1} of {images.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              {/* Main Image Display */}
              <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted group">
                {hasValidImage ? (
                  <>
                    <img
                      src={currentImageUrl!}
                      alt={displayName}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                      onClick={() => setSelectedImage(currentImageUrl)}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2.5 right-2.5 bg-black/60 hover:bg-black/80 text-white rounded-md h-8 w-8"
                      onClick={() => setSelectedImage(currentImageUrl)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/50 p-6">
                    <Car className="h-16 w-16 mb-2 stroke-[1.5]" />
                    <span className="text-xs font-medium">No vehicle image available</span>
                  </div>
                )}
              </div>

              {/* Thumbnails Row */}
              {images.length > 1 && (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pt-1">
                  {images.map((image, index) => {
                    const thumbUrl = getFullImageUrl(image.signed_url || image.image_url);
                    const isSelected = index === currentImageIndex;

                    return (
                      <div
                        key={image.id || index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          "relative aspect-[4/3] rounded-md overflow-hidden cursor-pointer border-2 transition-all bg-muted",
                          isSelected ? "border-primary ring-2 ring-primary/20 scale-[1.02]" : "border-border/60 hover:border-border"
                        )}
                      >
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={`${displayName} ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Car className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Pricing & Financial Highlights + Overview (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="shadow-card border-border/80">
            <CardHeader className="p-4 pb-2 border-b">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Pricing & Vehicle Information</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {vehicle.vehicle_number || "NO NUMBER"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {/* Financial Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg bg-muted/40 border">
                <div>
                  <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                    Selling Price
                  </p>
                  <p className="text-xl font-bold text-primary mt-0.5">
                    ₹{inr.format(vehicleSellingPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                    Total Expenses
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    ₹{inr.format(totalExpenses)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                    Total Cost
                  </p>
                  <p className="text-xl font-bold text-primary mt-0.5">
                    ₹{inr.format(totalPrice)}
                  </p>
                </div>
              </div>

              {/* Two-Column Specification Info List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Status:</span>
                  <Badge variant="outline" className={cn("capitalize text-xs", statusStyles[vehicle.status])}>
                    {vehicle.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Deal Type:</span>
                  <span className="font-medium capitalize">{vehicle.deal_type || '—'}</span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Created Date:</span>
                  <span className="font-medium">{formatDateForDisplay(vehicle.created_date)}</span>
                </div>

                {vehicle.selling_date && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Selling Date:</span>
                    <span className="font-medium">{formatDateForDisplay(vehicle.selling_date)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Vehicle Number:</span>
                  <span className="font-mono font-semibold">{vehicle.vehicle_number || '—'}</span>
                </div>

                {vehicle.variant && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Variant:</span>
                    <span className="font-medium">{vehicle.variant}</span>
                  </div>
                )}

                {vehicle.chassis_number && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Chassis Number:</span>
                    <span className="font-mono text-xs">{vehicle.chassis_number}</span>
                  </div>
                )}

                {vehicle.engine_number && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Engine Number:</span>
                    <span className="font-mono text-xs">{vehicle.engine_number}</span>
                  </div>
                )}

                {vehicle.num_owner !== undefined && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">No. of Owners:</span>
                    <span className="font-medium">{vehicle.num_owner}</span>
                  </div>
                )}

                {Number(vehicle.trip_driven) > 0 && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Trip Driven:</span>
                    <span className="font-medium">{Number(vehicle.trip_driven).toLocaleString('en-IN')} km</span>
                  </div>
                )}

                {vehicle.color && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Color:</span>
                    <span className="font-medium capitalize">{vehicle.color}</span>
                  </div>
                )}

                {vehicle.rc_holder && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">RC Holder:</span>
                    <span className="font-medium capitalize">{vehicle.rc_holder}</span>
                  </div>
                )}

                {vehicle.rc_status && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">RC Status:</span>
                    <span className="font-medium capitalize">{vehicle.rc_status}</span>
                  </div>
                )}

                {vehicle.fc_expriry_date && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">FC Expiry:</span>
                    <span className="font-medium">{formatDateForDisplay(vehicle.fc_expriry_date)}</span>
                  </div>
                )}

                {vehicle.insurance_expriry_date && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Insurance Expiry:</span>
                    <span className="font-medium">{formatDateForDisplay(vehicle.insurance_expriry_date)}</span>
                  </div>
                )}

                {Number(vehicle.base_price) > 0 && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Base Price:</span>
                    <span className="font-medium">₹{inr.format(vehicle.base_price)}</span>
                  </div>
                )}

                {Number(vehicle.final_price) > 0 && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">Final Price:</span>
                    <span className="font-medium">₹{inr.format(vehicle.final_price)}</span>
                  </div>
                )}

                {Number(vehicle.emi_from) > 0 && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground text-xs">EMI From:</span>
                    <span className="font-medium">₹{inr.format(vehicle.emi_from)} / mo</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Technical Specifications Grid */}
      <Card className="shadow-card border-border/80">
        <CardHeader className="p-4 pb-2 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            <span>Technical Specifications</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {vehicle.body_type && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Body Type</p>
                <p className="text-sm font-semibold capitalize mt-0.5">{vehicle.body_type}</p>
              </div>
            )}
            {vehicle.make_year && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Make Year</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.make_year}</p>
              </div>
            )}
            {vehicle.fuel_type && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Fuel Type</p>
                <p className="text-sm font-semibold capitalize mt-0.5">{vehicle.fuel_type}</p>
              </div>
            )}
            {vehicle.transmission && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Transmission</p>
                <p className="text-sm font-semibold uppercase mt-0.5">{vehicle.transmission}</p>
              </div>
            )}
            {vehicle.engine_capacity && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Engine</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.engine_capacity}</p>
              </div>
            )}
            {vehicle.fuel_tank_capacity && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Fuel Tank</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.fuel_tank_capacity}</p>
              </div>
            )}
            {vehicle.max_torque && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Max Torque</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.max_torque}</p>
              </div>
            )}
            {vehicle.mileage && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Mileage</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.mileage}</p>
              </div>
            )}
            {vehicle.seating_capacity && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Seating</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.seating_capacity} Seats</p>
              </div>
            )}
            {vehicle.top_speed && (
              <div className="bg-muted/40 p-3 rounded-lg border">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Top Speed</p>
                <p className="text-sm font-semibold mt-0.5">{vehicle.top_speed}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expenses Section */}
      <Card className="shadow-card border-border/80">
        <CardHeader className="p-4 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Vehicle Expenses</CardTitle>
              {expenses.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {expenses.length}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => setOpenExpenseDialog(true)}
              className="flex items-center gap-1.5 h-8 px-3"
            >
              <Plus className="h-4 w-4" />
              <span>Add Expense</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs sm:text-sm font-medium">
                      {formatDateForDisplay(expense.expense_date)}
                    </td>
                    <td className="px-4 py-3 text-xs sm:text-sm max-w-[400px] truncate text-muted-foreground">
                      {expense.description}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs sm:text-sm text-right font-bold text-foreground">
                      ₹{inr.format(Number(expense.amount) || 0)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditExpense(expense)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="h-7 w-7 text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      <CreditCard className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm font-medium">No expenses recorded yet</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Click "Add Expense" to record maintenance or other costs.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Hosting Information (if vehicle has host record) */}
      {vehicle.hosting_info && Object.keys(vehicle.hosting_info).length > 0 && (
        <Card className="shadow-card border-border/80">
          <CardHeader className="p-4 pb-2 border-b">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Hosting Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {vehicle.hosting_info.agent_id && (
                <div>
                  <span className="text-xs text-muted-foreground">Agent ID</span>
                  <p className="font-medium mt-0.5">{vehicle.hosting_info.agent_id}</p>
                </div>
              )}
              {vehicle.hosting_info.customer_id && (
                <div>
                  <span className="text-xs text-muted-foreground">Customer ID</span>
                  <p className="font-medium mt-0.5">{vehicle.hosting_info.customer_id}</p>
                </div>
              )}
              {vehicle.hosting_info.hosting_date && (
                <div>
                  <span className="text-xs text-muted-foreground">Hosting Date</span>
                  <p className="font-medium mt-0.5">{formatDateForDisplay(vehicle.hosting_info.hosting_date)}</p>
                </div>
              )}
            </div>
            {vehicle.hosting_info.terms && (
              <div className="pt-2 border-t">
                <span className="text-xs text-muted-foreground">Terms</span>
                <p className="mt-1 text-sm bg-muted/30 p-3 rounded border text-muted-foreground">
                  {vehicle.hosting_info.terms}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Expense Dialog */}
      <Dialog open={openExpenseDialog} onOpenChange={setOpenExpenseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpenseSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="expense_date">Expense Date</Label>
              <DatePicker
                id="expense_date"
                value={newExpense.expense_date}
                onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                required
                placeholder="Pick Expense Date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                placeholder="e.g. Engine service, oil change..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                value={newExpense.amount || ''}
                onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                placeholder="0"
                required
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={handleCloseExpenseDialog}>
                Cancel
              </Button>
              <Button type="submit">
                {editingExpense ? 'Update' : 'Add'} Expense
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Full Screen Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-black/90 border-0">
          <div className="relative flex items-center justify-center p-4">
            {selectedImage && (
              <img
                src={selectedImage}
                alt="Vehicle Preview"
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full h-8 w-8"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}