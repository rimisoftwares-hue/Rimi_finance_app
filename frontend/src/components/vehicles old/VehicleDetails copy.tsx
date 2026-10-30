import React, { useState, useEffect } from 'react';
import axios from "axios";

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');
import { ArrowLeft, Calendar, Car, CreditCard, Edit, Eye, X, Plus, Trash2} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Vehicle } from '../../types/vehicle';
import { number } from 'zod';

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

  const images = vehicle.images || [];
  const mainImage = images[currentImageIndex] || images[0];
  
  function getImageUrl(imageUrl?: string): string | undefined {
    if (!imageUrl) return undefined;

    return imageUrl.startsWith('http')
      ? imageUrl
      : `${BASE_URL}${imageUrl}`;
  }

  const fetchExpenses = async () => {
    try {
      const token = localStorage.getItem("financeToken");

      const res = await axios.get(
        `${BASE_URL}/api/vehicles/${vehicle.id}/expenses`,
        {
          headers: {
            "finance-authorization": `Bearer ${token}`,
          },
          withCredentials: true,
        }
      );

      setExpenses(res.data);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    }
  };


  useEffect(() => {
    if (vehicle.id) {
      fetchExpenses();
    }
  }, [vehicle.id]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200">Available</Badge>;
      case "sold":
        return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200">Sold</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200">Pending</Badge>;
      case "hosted":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200">Hosted</Badge>;
      default:
        return null;
    }
  };
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalPrice = Number(vehicle.selling_price || 0) + (totalExpenses);

  const handleExpenseSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    const expenseData = {
      expense_date: newExpense.expense_date,
      description: newExpense.description,
      amount: Number(newExpense.amount) || 0,
    };

    const token = localStorage.getItem('financeToken');
    const url = editingExpense 
      ? `${BASE_URL}/api/vehicles/${vehicle.id}/expenses/${editingExpense.id}`
      : `${BASE_URL}/api/vehicles/${vehicle.id}/expenses`;

    const method = editingExpense ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'finance-authorization': `Bearer ${token}`, // ✅ Correct header
      },
      credentials: 'include',
      body: JSON.stringify(expenseData),
    });

    if (response.ok) {
      await fetchExpenses();
      handleCloseExpenseDialog();
    } else {
      console.error('Failed to save expense:', response.status);
    }
  } catch (err) {
    console.error('Expense error:', err);
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

const handleDeleteExpense = async ( expenseId : number) => {
  try {
    const token = localStorage.getItem("financeToken");

    const res = await axios.delete(
      `${BASE_URL}/api/vehicles/${vehicle.id}/expenses/${expenseId}`,
      {
        headers: {
          "finance-authorization": `Bearer ${token}`,
        },
        withCredentials: true,
      }
    );
    setExpenses((prev) => prev.filter((exp) => exp.id !== expenseId));
    console.log("Deleted:", res.data);
    return res.data;
  } catch (err) {
    console.error('Delete error:', err);
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

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{`${vehicle.model_name} (${vehicle.vehicle_modal})`}</h1>
            {/* <p className="text-muted-foreground">{vehicle.make_year}</p> */}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {getStatusBadge(vehicle.status)}
          {/* <Button variant="outline" onClick={() => onEdit(vehicle.id)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button> */}
          <Link to={`/vehicles/${vehicle.id}/edit`}  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"  >
            <Plus className="h-4 w-4 mr-2" />
            Edit
          </Link>
          <Button 
            onClick={() => onHost(vehicle.id)} 
            disabled={vehicle.status === 'sold'}
            variant={vehicle.status === 'hosted' ? "outline" : "default"}
          >
            {vehicle.status === 'hosted' ? 'Hosted' : 'Host Vehicle'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicle Images */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Gallery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Main Image */}
            {mainImage ? (
              <div className="relative">
                <img
                  src={getImageUrl(mainImage.signed_url ? mainImage.signed_url : mainImage.image_url )}
                  alt={`${vehicle.model_name} - ${mainImage.image_type}`}
                  className="w-full h-64 object-cover rounded-lg cursor-pointer"
                  onClick={() => setSelectedImage(mainImage.signed_url ? mainImage.signed_url : mainImage.image_url )}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setSelectedImage(mainImage.signed_url ? mainImage.signed_url : mainImage.image_url )}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
                <span className="text-muted-foreground">No Images Available</span>
              </div>
            )}

            {/* Image Thumbnails */}
            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    className={`relative cursor-pointer rounded border-2 transition-colors ${
                      index === currentImageIndex ? 'border-primary' : 'border-border'
                    }`}
                    onClick={() => setCurrentImageIndex(index)}
                  >
                    <img
                      src={getImageUrl(image.signed_url ? image.signed_url : image.image_url )}
                      alt={`${vehicle.model_name} - ${image.image_type}`}
                      className="w-full h-16 object-cover rounded"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 rounded-b">
                      {image.image_type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vehicle Information */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(vehicle.status)}
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created Date:</span>
                <span className="font-medium">
                  {new Date(vehicle.created_date).toLocaleDateString()}
                </span>
              </div>

              {vehicle.selling_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Selling Date:</span>
                  <span className="font-medium">{vehicle.selling_date || 'N/A'}</span>
                </div>
              )}

              {/* <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle Name:</span>
                <span className="font-medium">{`${vehicle.model_name} (${vehicle.vehicle_modal})`} </span>
              </div> */}
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle Number:</span>
                <span className="font-medium">{vehicle.vehicle_number}</span>
              </div>
              
              {vehicle.chassis_number && (
                <div className="flex justify-between">
                <span className="text-muted-foreground">Chassis Number:</span>
                <span className="font-medium">{vehicle.chassis_number || 'N/A'}</span>
                </div>
              )}

              {vehicle.engine_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engine Number:</span>
                  <span className="font-medium">{vehicle.engine_number || 'N/A'}</span>
                </div>
              )}

              {vehicle.num_owner && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">No Owners:</span>
                  <span className="font-medium">{vehicle.num_owner || 'N/A'}</span>
                </div>
              )}

              {vehicle.trip_driven !<=0 &&  (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trip Driven :</span>
                  <span className="font-medium">{Number(vehicle.trip_driven).toLocaleString('en-IN') || 'N/A'}</span>
                </div>
              )}

              {vehicle.color && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Color :</span>
                  <span className="font-medium">{vehicle.color || 'N/A'}</span>
                </div>
              )}
              
              {vehicle.deal_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deal type:</span>
                  <span className="font-medium">{vehicle.deal_type || 'N/A'}</span>
                </div>
              )}

              {vehicle.rc_holder && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RC Holder:</span>
                  <span className="font-medium">{vehicle.rc_holder || 'N/A'}</span>
                </div>
              )}

              {vehicle.rc_status && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RC Status:</span>
                  <span className="font-medium">{vehicle.rc_status || 'N/A'}</span>
                </div>
              )}

              {vehicle.fc_expriry_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FC Expriry:</span>
                  <span className="font-medium">{vehicle.fc_expriry_date || 'N/A'}</span>
                </div>
              )}

              {vehicle.insurance_expriry_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Insurance Expriry:</span>
                  <span className="font-medium">{vehicle.insurance_expriry_date || 'N/A'}</span>
                </div>
              )}

              {vehicle.variant && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Variant:</span>
                  <span className="font-medium">{vehicle.variant || 'N/A'}</span>
                </div>
              )}

              {vehicle.base_price && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base price:</span>
                  <span className="font-medium">{Number(vehicle.base_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2,})}</span>
                </div>
              )}

              {vehicle.final_price > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Final price:</span>
                  <span className="font-medium">{Number(vehicle.final_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2,})}</span>
                </div>
              ) : ''}

              {vehicle.selling_price && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Selling price:</span>
                  <span className="font-medium">{Number(vehicle.selling_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2,})}</span>
                </div>
              )}
              
              {/* <div className="flex justify-between">
                <span className="text-muted-foreground">Purchase Price:</span>
                <span className="font-semibold text-lg">₹{vehicle.final_price.toLocaleString('en-IN')}</span>
              </div> */}
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Expenses:</span>
                <span className="font-semibold text-lg">₹{totalExpenses.toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground font-semibold">Total Cost:</span>
                {/* <span className="font-semibold text-lg text-primary">₹{totalPrice.toLocaleString()}</span> */}
                <span className="font-semibold text-lg text-primary">
                  ₹{totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {vehicle.selling_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Selling Date:</span>
                  <span className="font-medium">
                    {new Date(vehicle.selling_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Selected Vehicle Details */}
      {vehicle && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            {/* <Car className="h-4 w-4 mr-2 text-blue-600" /> */}
            Vehicle Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {vehicle.body_type && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Body type:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.body_type}</span>
              </div>
            )}
            {vehicle.make_year && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Make year:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.make_year}</span>
              </div>
            )}
            {vehicle.fuel_type && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Fuel type:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.fuel_type}</span>
              </div>
            )}
            {vehicle.engine_capacity && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Engine:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.engine_capacity}</span>
              </div>
            )}
            {vehicle.fuel_tank_capacity && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Fuel Tank:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.fuel_tank_capacity}</span>
              </div>
            )}
            {vehicle.max_torque && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Max Torque:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.max_torque}</span>
              </div>
            )}
            {vehicle.mileage && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Mileage:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.mileage}</span>
              </div>
            )}
            {vehicle.seating_capacity && (
              <div className="bg-white p-2 rounded border">
                <span className="text-gray-500">Seating:</span>
                <span className="ml-2 font-medium text-gray-800">{vehicle.seating_capacity} seats</span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Expenses Section - Replacing Monthly Income Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Vehicle Expenses</span>
            </div>
            <Button
              onClick={() => setOpenExpenseDialog(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Expenses Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.map((expense, index) => (
                  <tr key={expense.id} >
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {formatDateForDisplay(expense.expense_date)}
                    </td>
                    <td className="px-4 py-3 text-sm max-w[500px] ">{expense.description}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      ₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2,})}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditExpense(expense)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No expenses recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Expense Dialog */}
      <Dialog open={openExpenseDialog} onOpenChange={setOpenExpenseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpenseSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="expense_date">Expense Date</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={newExpense.expense_date}
                  onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  placeholder="Enter expense description"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={newExpense.amount || ''}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
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

      {/* Hosting Information */}
      {vehicle.hosting_info && Object.keys(vehicle.hosting_info).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hosting Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vehicle.hosting_info.agent_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent ID:</span>
                <span className="font-medium">{vehicle.hosting_info.agent_id}</span>
              </div>
            )}
            {vehicle.hosting_info.customer_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer ID:</span>
                <span className="font-medium">{vehicle.hosting_info.customer_id}</span>
              </div>
            )}
            {vehicle.hosting_info.hosting_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hosting Date:</span>
                <span className="font-medium">
                  {new Date(vehicle.hosting_info.hosting_date).toLocaleDateString()}
                </span>
              </div>
            )}
            {vehicle.hosting_info.terms && (
              <div>
                <span className="text-muted-foreground">Terms:</span>
                <p className="mt-1 text-sm">{vehicle.hosting_info.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full Screen Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Vehicle Image</DialogTitle>
          </DialogHeader>
          <div className="relative p-6">
            {selectedImage && (
              <img
                src={getImageUrl(selectedImage)}
                alt="Vehicle"
                className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
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