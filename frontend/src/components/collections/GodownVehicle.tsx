

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Warehouse, Plus, Search, Calendar, Truck, MapPin, Power, PowerOff, Edit, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { TablePagination } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { useOwnerAuth } from "../../contexts/OwnerAuthContext";
import axios from "axios";
import { toast } from "sonner";
import { validateIndianPhoneNumber, validateRequired } from "../../utils/validation";

interface Godown {
  id: number;
  name: string;
  address: string;
  contact_number?: string;
  contact_person?: string;
  city?: string;
  is_active: boolean;
  finance_id: number;
  owner_id: number;
}

interface Vehicle {
  id: number;
  vehicleNo: string;
  customerName: string;
  seizingDate: string;
  charges: number;
  status: string;
  loanNo: string;
  vehicleName: string;
  godownId: number;
  godownName?: string;
}

export default function GodownVehicle() {
  const [searchTerm, setSearchTerm] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [godownModalOpen, setGodownModalOpen] = useState(false);
  const [editingGodown, setEditingGodown] = useState<Godown | null>(null);
  const [newGodown, setNewGodown] = useState({
    name: "",
    address: "",
    contact_number: "",
    contact_person: "",
    city: ""
  });
  //process.env.REACT_APP_API_URL ||
  const { owner } = useOwnerAuth();
  const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

  const [godownErrors, setGodownErrors] = useState<{
    name?: string;
    address?: string;
    contact_number?: string;
  }>({});

  const validateGodownForm = (data: { name: string; address: string; contact_number?: string }): boolean => {
    const errs: { name?: string; address?: string; contact_number?: string } = {};

    const nameRes = validateRequired(data.name, 'Godown name');
    if (!nameRes.isValid) {
      errs.name = nameRes.error;
    }

    const addrRes = validateRequired(data.address, 'Address');
    if (!addrRes.isValid) {
      errs.address = addrRes.error;
    }

    const phoneRes = validateIndianPhoneNumber(data.contact_number);
    if (!phoneRes.isValid) {
      errs.contact_number = phoneRes.error;
    }

    setGodownErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Fetch godowns from API
  const fetchGodowns = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/godowns/get-godowns`);
      if (response.data.success) {
        setGodowns(response.data.godowns);
      }
    } catch (error) {
      console.error("Error fetching godowns:", error);
      toast.error("Failed to fetch godowns");
    }
  };

  // Fetch vehicles from API (you'll need to implement this endpoint)
  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/godowns/seized-vehicles`);
      if (response.data.success) {
        setVehicles(response.data.vehicles);
      }
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      // Use mock data if API not ready
      setVehicles(initialVehicles);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGodowns();
    fetchVehicles();
  }, []);

  // Create new godown
  const handleCreateGodown = async () => {
    if (!validateGodownForm(newGodown)) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      const payload = {
        owner_id: owner?.id,
        name: newGodown.name.trim(),
        address: newGodown.address.trim(),
        contact_number: newGodown.contact_number.trim(),
        contact_person: newGodown.contact_person.trim(),
        city: newGodown.city.trim()
      };

      const response = await axios.post(`${API_URL}/api/godowns/add-godown`, payload);

      if (response.data.success) {
        toast.success("Godown created successfully");
        setNewGodown({ name: "", address: "", contact_number: "", contact_person: "", city: "" });
        setGodownModalOpen(false);
        fetchGodowns(); // Refresh the list
      }
    } catch (error) {
      console.error("Error creating godown:", error);
      toast.error("Failed to create godown");
    }
  };

  // Deactivate godown
  const handleDeactivateGodown = async (godownId: number) => {
    if (!confirm("Are you sure you want to deactivate this godown? This will mark it as inactive.")) {
      return;
    }

    try {
      const response = await axios.put(`${API_URL}/api/godowns/deactive-godown`,
        { id: godownId }
      );

      if (response.data.success) {
        toast.success("Godown deactivated successfully");
        fetchGodowns(); // Refresh the list
      }
    } catch (error) {
      console.error("Error deactivating godown:", error);
      toast.error("Failed to deactivate godown");
    }
  };

  // Activate godown
  const handleActivateGodown = async (godownId: number) => {
    try {
      const response = await axios.put(`${API_URL}/api/godowns/active-godown`,
        { id: godownId }
      );

      if (response.data.success) {
        toast.success("Godown activated successfully");
        fetchGodowns(); // Refresh the list
      }
    } catch (error) {
      console.error("Error activating godown:", error);
      toast.error("Failed to activate godown");
    }
  };

  // Update godown
  const handleUpdateGodown = async () => {
    if (!editingGodown) return;
    if (!validateGodownForm(editingGodown)) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      const response = await axios.put(`${API_URL}/api/godowns/update-godown`,
        {
          id: editingGodown.id,
          name: editingGodown.name.trim(),
          address: editingGodown.address.trim(),
          contact_number: (editingGodown.contact_number || '').trim(),
          contact_person: (editingGodown.contact_person || '').trim(),
          city: (editingGodown.city || '').trim()
        }
      );

      if (response.data.success) {
        toast.success("Godown updated successfully");
        setEditingGodown(null);
        setGodownErrors({});
        setGodownModalOpen(false);
        fetchGodowns(); // Refresh the list
      }
    } catch (error) {
      console.error("Error updating godown:", error);
      toast.error("Failed to update godown");
    }
  };

  const getGodownVehicleCount = (godownId: number) => {
    return vehicles.filter(v => v.godownId === godownId && v.status !== "Released").length;
  };

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          v.vehicleNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [vehicles, searchTerm]
  );

  const {
    paginatedItems,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
  } = useClientPagination(filteredVehicles, { initialPageSize: 15, resetKey: searchTerm });

  const totalSeized = vehicles.filter(v => v.status !== "Released").length;
  const pendingRelease = vehicles.filter(v => v.status === "Pending Release").length;
  const totalCharges = vehicles.reduce((s, v) => s + (v.charges || 0), 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Godown Vehicles</h1>
          <p className="text-muted-foreground mt-1 text-sm">Seized and stored vehicles management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => {
            setEditingGodown(null);
            setGodownErrors({});
            setNewGodown({ name: "", address: "", contact_number: "", contact_person: "", city: "" });
            setGodownModalOpen(true);
          }}>
            <Warehouse className="h-4 w-4" /> Create Godown
          </Button>
          <Button className="gap-2" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="h-4 w-4" /> Add Vehicle
          </Button>
        </div>
      </motion.div>

      {/* Godown List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="dashboard-card animate-pulse">
              <div className="h-24 bg-secondary/50 rounded"></div>
            </div>
          ))
        ) : (
          godowns.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className={`dashboard-card border-t-4 ${g.is_active ? 'border-t-primary' : 'border-t-muted'}`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{g.name}</h3>
                      {!g.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {g.address}
                    </p>
                    {g.contact_person && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Contact: {g.contact_person} {g.contact_number && `(${g.contact_number})`}
                      </p>
                    )}
                  </div>
                  <div className="text-center shrink-0 ml-2">
                    <p className="text-2xl font-bold text-foreground">{getGodownVehicleCount(g.id)}</p>
                    <p className="text-[10px] text-muted-foreground">Vehicles</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  {g.is_active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeactivateGodown(g.id)}
                    >
                      <PowerOff className="h-3 w-3 mr-1" /> Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-success hover:text-success"
                      onClick={() => handleActivateGodown(g.id)}
                    >
                      <Power className="h-3 w-3 mr-1" /> Activate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setEditingGodown(g);
                      setGodownErrors({});
                      setGodownModalOpen(true);
                    }}
                  >
                    <Edit className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Seized", value: totalSeized, icon: Warehouse, color: "border-t-warning" },
          { label: "Pending Release", value: pendingRelease, icon: Truck, color: "border-t-primary" },
          { label: "Total Charges", value: `₹${totalCharges.toLocaleString()}`, icon: Calendar, color: "border-t-expense" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className={`dashboard-card border-t-4 ${item.color}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{item.value}</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary">
                <item.icon className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="dashboard-card !p-4 hover:translate-y-0">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vehicle or customer..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                {["Customer", "Vehicle", "Vehicle No", "Loan No", "Godown", "Seizing Date", "Charges", "Seized By", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No vehicles found
                  </td>
                </tr>
              ) : (
                paginatedItems.map((v, i) => (
                  <motion.tr
                    key={v.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i }}
                    className="hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm">
                      <p className="text-sm font-semibold text-foreground">{v.customerName}</p>
                      <p className="text-xs font-semibold text-primary">{v.loanNo}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{v.vehicleName}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{v.vehicleNo}</td>
                    <td className="px-4 py-3 text-sm text-primary font-medium">{v.loanNo}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{v.godownName || 'test name'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{v.seizingDate}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">₹{v.charges.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{v.customerName}</td>
                    <td className="px-4 py-3 text-sm">
                      {v.status !== "Released" && (
                        <Button size="sm" variant="outline" className="text-xs">
                          Release
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </motion.div>

      {/* Create/Edit Godown Modal */}
      <Dialog open={godownModalOpen} onOpenChange={setGodownModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGodown ? "Edit Godown" : "Create New Godown"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <CapitalizedInput
                label="Godown Name"
                required
                casing="words"
                placeholder="Enter godown name"
                value={editingGodown ? editingGodown.name : newGodown.name}
                error={godownErrors.name}
                onChange={e => {
                  const val = e.target.value;
                  if (editingGodown) {
                    setEditingGodown({ ...editingGodown, name: val });
                  } else {
                    setNewGodown(p => ({ ...p, name: val }));
                  }
                  const res = validateRequired(val, 'Godown name');
                  setGodownErrors(p => ({ ...p, name: res.error }));
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Address <span className="text-destructive">*</span>
              </label>
              <Textarea
                placeholder="Enter full address"
                value={editingGodown ? editingGodown.address : newGodown.address}
                onChange={e => {
                  const val = e.target.value;
                  if (editingGodown) {
                    setEditingGodown({ ...editingGodown, address: val });
                  } else {
                    setNewGodown(p => ({ ...p, address: val }));
                  }
                  const res = validateRequired(val, 'Address');
                  setGodownErrors(p => ({ ...p, address: res.error }));
                }}
                rows={3}
                className={godownErrors.address ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {godownErrors.address && (
                <p className="mt-1 text-xs text-destructive">{godownErrors.address}</p>
              )}
            </div>
            <div>
              <CapitalizedInput
                label="City"
                casing="words"
                placeholder="Enter city"
                value={editingGodown ? editingGodown.city || "" : newGodown.city}
                onChange={e => {
                  const val = e.target.value;
                  if (editingGodown) {
                    setEditingGodown({ ...editingGodown, city: val });
                  } else {
                    setNewGodown(p => ({ ...p, city: val }));
                  }
                }}
              />
            </div>
            <div>
              <CapitalizedInput
                label="Contact Person"
                casing="words"
                placeholder="Enter contact person name"
                value={editingGodown ? editingGodown.contact_person || "" : newGodown.contact_person}
                onChange={e => {
                  const val = e.target.value;
                  if (editingGodown) {
                    setEditingGodown({ ...editingGodown, contact_person: val });
                  } else {
                    setNewGodown(p => ({ ...p, contact_person: val }));
                  }
                }}
              />
            </div>
            <div>
              <CapitalizedInput
                label="Contact Number"
                required
                casing="none"
                type="tel"
                placeholder="Enter 10-digit contact number"
                value={editingGodown ? editingGodown.contact_number || "" : newGodown.contact_number}
                error={godownErrors.contact_number}
                onChange={e => {
                  const val = e.target.value;
                  if (editingGodown) {
                    setEditingGodown({ ...editingGodown, contact_number: val });
                  } else {
                    setNewGodown(p => ({ ...p, contact_number: val }));
                  }
                  const res = validateIndianPhoneNumber(val);
                  setGodownErrors(p => ({ ...p, contact_number: res.error }));
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setGodownModalOpen(false);
              setEditingGodown(null);
            }}>
              Cancel
            </Button>
            <Button onClick={editingGodown ? handleUpdateGodown : handleCreateGodown}>
              {editingGodown ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Mock data for fallback when API is not available
const initialVehicles: Vehicle[] = [
  { id: 1, vehicleNo: "TN-45-AB-1234", customerName: "Manoj Singh", seizingDate: "2024-12-15", charges: 8500, status: "In Godown", loanNo: "OWN-0056", vehicleName: "Bajaj Pulsar 150", godownId: 1 },
  { id: 2, vehicleNo: "TN-38-CD-5678", customerName: "Venkatesh Raman", seizingDate: "2024-11-28", charges: 12000, status: "In Godown", loanNo: "OWN-0091", vehicleName: "TVS Apache RTR", godownId: 1 },
  { id: 3, vehicleNo: "TN-52-EF-9012", customerName: "Ashok Kumar", seizingDate: "2025-01-05", charges: 6500, status: "Released", loanNo: "FR-0031", vehicleName: "Suzuki Access 125", godownId: 2 },
  { id: 4, vehicleNo: "TN-41-GH-3456", customerName: "Gopal Krishna", seizingDate: "2024-10-20", charges: 15000, status: "In Godown", loanNo: "OWN-0005", vehicleName: "Bajaj CT 110", godownId: 1 },
  { id: 5, vehicleNo: "TN-60-IJ-7890", customerName: "Murugan S", seizingDate: "2025-02-02", charges: 9000, status: "Pending Release", loanNo: "OWN-0019", vehicleName: "TVS Raider", godownId: 2 },
  { id: 6, vehicleNo: "TN-33-KL-2345", customerName: "Saritha Bai", seizingDate: "2024-09-12", charges: 18000, status: "In Godown", loanNo: "FR-0003", vehicleName: "Honda Dio", godownId: 1 },
];