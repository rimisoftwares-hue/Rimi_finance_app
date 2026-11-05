import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { MapPin, Plus, Edit2, Trash2, Users, AlertTriangle, X, Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useOwnerAuth } from "../../contexts/OwnerAuthContext";
import { useToast } from "../ui/use-toast";
import { AreaAgent, AvailableArea, AssignableAgent } from "../../types/areaAllocation";
import {
  fetchAllocatedAgents,
  fetchAssignableAgents,
  fetchAvailableAreas,
  saveAgentAllocations,
  deleteAgentAllocations,
} from "../../api/areaAllocationApi";

export default function AreaAllocation() {
  const { user, currentFinance } = useAuth();
  const { owner } = useOwnerAuth();
  const { toast } = useToast();

  const isOwner = Boolean(owner || user?.role === "owner");

  // Main state from PostgreSQL
  const [agents, setAgents] = useState<AreaAgent[]>([]);
  const [availableAreas, setAvailableAreas] = useState<AvailableArea[]>([]);
  const [assignableAgents, setAssignableAgents] = useState<AssignableAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal state
  const [showDialog, setShowDialog] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("edit");
  const [editAgent, setEditAgent] = useState<AreaAgent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [modalSearch, setModalSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<AreaAgent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load live data from backend
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allocatedRes, areasRes, assignableRes] = await Promise.all([
        fetchAllocatedAgents(),
        fetchAvailableAreas(),
        fetchAssignableAgents(),
      ]);

      if (allocatedRes.success) {
        setAgents(allocatedRes.data || []);
      }
      if (areasRes.success) {
        setAvailableAreas(areasRes.data || []);
      }
      if (assignableRes.success) {
        setAssignableAgents(assignableRes.data || []);
      }
    } catch (err: any) {
      console.error("Error loading area allocations:", err);
      toast({
        title: "Failed to Load Data",
        description: err?.response?.data?.error || err?.message || "Could not retrieve allocation records.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData, currentFinance?.id]);

  // Auto-select first assignable agent if none selected in add mode
  useEffect(() => {
    if (modalMode === "add" && !selectedAgentId && assignableAgents.length > 0) {
      setSelectedAgentId(assignableAgents[0].id);
    }
  }, [modalMode, selectedAgentId, assignableAgents]);

  // Open modal for adding a new allocation
  const openAdd = () => {
    setModalMode("add");
    setEditAgent(null);
    setSelectedAgentId(assignableAgents[0]?.id || "");
    setSelectedAreas([]);
    setModalSearch("");
    setShowDialog(true);
  };

  // Open modal for editing an existing agent's allocations
  const openEdit = (agent: AreaAgent) => {
    setModalMode("edit");
    setEditAgent(agent);
    setSelectedAgentId(agent.id);
    setSelectedAreas(agent.areas.map((a) => a.street));
    setModalSearch("");
    setShowDialog(true);
  };

  // Toggle selection of a specific area street
  const toggleArea = (street: string) => {
    setSelectedAreas((prev) =>
      prev.includes(street) ? prev.filter((s) => s !== street) : [...prev, street]
    );
  };

  // Modal area filtering
  const filteredModalAreas = useMemo(() => {
    if (!modalSearch.trim()) return availableAreas;
    const term = modalSearch.toLowerCase().trim();
    return availableAreas.filter(
      (a) =>
        a.street.toLowerCase().includes(term) ||
        a.city.toLowerCase().includes(term) ||
        (a.village && a.village.toLowerCase().includes(term))
    );
  }, [availableAreas, modalSearch]);

  const areAllFilteredSelected = useMemo(() => {
    if (filteredModalAreas.length === 0) return false;
    return filteredModalAreas.every((a) => selectedAreas.includes(a.street));
  }, [filteredModalAreas, selectedAreas]);

  // Select / Deselect All filtered areas in modal
  const handleSelectAllFiltered = () => {
    if (areAllFilteredSelected) {
      const filteredStreets = new Set(filteredModalAreas.map((a) => a.street));
      setSelectedAreas((prev) => prev.filter((street) => !filteredStreets.has(street)));
    } else {
      const combined = new Set([...selectedAreas, ...filteredModalAreas.map((a) => a.street)]);
      setSelectedAreas(Array.from(combined));
    }
  };

  // Save allocations via API
  const handleSave = async () => {
    const targetAgentId = modalMode === "add" ? selectedAgentId : editAgent?.id;
    if (!targetAgentId) {
      toast({
        title: "Select Agent",
        description: "Please choose an agent to assign areas.",
        variant: "destructive",
      });
      return;
    }

    const payloadAreas = availableAreas
      .filter((a) => selectedAreas.includes(a.street))
      .map((a) => ({
        city: a.city,
        district: a.district,
        village: a.village,
        street: a.street,
      }));

    setIsSaving(true);
    try {
      const res = await saveAgentAllocations({
        agentId: targetAgentId,
        areas: payloadAreas,
      });

      if (res.success) {
        toast({
          title: "Allocations Saved",
          description: `Successfully allocated ${payloadAreas.length} area(s).`,
        });
        setShowDialog(false);
        setEditAgent(null);
        await loadData();
      } else {
        toast({
          title: "Save Failed",
          description: res.error || "Failed to save area allocations.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || err?.message || "Failed to save allocations.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete of an agent's allocations
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteAgentAllocations(deleteTarget.id);
      if (res.success) {
        toast({
          title: "Allocations Deleted",
          description: `Removed area allocations for ${deleteTarget.name}.`,
        });
        setDeleteTarget(null);
        await loadData();
      } else {
        toast({
          title: "Delete Failed",
          description: res.error || "Failed to delete allocations.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || err?.message || "Failed to delete allocations.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter agents by search term for the main table
  const filteredAgents = useMemo(() => {
    if (!searchTerm.trim()) return agents;
    const term = searchTerm.toLowerCase().trim();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        (a.phone && a.phone.toLowerCase().includes(term)) ||
        a.areas.some(
          (ar) =>
            ar.street.toLowerCase().includes(term) ||
            ar.city.toLowerCase().includes(term) ||
            (ar.village && ar.village.toLowerCase().includes(term))
        )
    );
  }, [agents, searchTerm]);

  // Derived KPI metrics
  const allocatedStreetSet = useMemo(() => {
    return new Set(agents.flatMap((a) => a.areas.map((ar) => ar.street)));
  }, [agents]);

  const allocatedCount = allocatedStreetSet.size;
  const totalAreasCount = availableAreas.length;
  const unallocatedCount = Math.max(0, totalAreasCount - allocatedCount);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Area Allocation</h1>
          <p className="text-sm text-muted-foreground">Assign collection areas to agents</p>
        </div>
        {isOwner && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Allocation
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Agents", value: agents.length, icon: Users, color: "text-primary" },
          { label: "Total Areas", value: totalAreasCount, icon: MapPin, color: "text-green-500" },
          { label: "Allocated", value: allocatedCount, icon: MapPin, color: "text-blue-500" },
          { label: "Unallocated", value: unallocatedCount, icon: AlertTriangle, color: "text-yellow-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}><kpi.icon className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold text-foreground">{kpi.value}</p><p className="text-xs text-muted-foreground">{kpi.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Agent Area Mapping</CardTitle>
            <CapitalizedInput
              casing="words"
              placeholder="Search agent or area..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Areas</TableHead>
                <TableHead className="text-center">Customers</TableHead>
                <TableHead className="text-center">Unpaid</TableHead>
                {isOwner && <TableHead className="text-center">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isOwner ? 5 : 4} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading area allocations...
                  </TableCell>
                </TableRow>
              ) : filteredAgents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isOwner ? 5 : 4} className="h-32 text-center text-muted-foreground">
                    {searchTerm
                      ? "No agents or areas match your search."
                      : "No area allocations found. Click \"Add Allocation\" to assign areas."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAgents.map((agent, i) => (
                  <motion.tr
                    key={agent.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      <div className="font-semibold text-sm text-foreground">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.phone || "No phone"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {agent.areas.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">No areas assigned</span>
                        ) : (
                          agent.areas.map((a) => (
                            <Badge key={a.street} variant="secondary" className="text-[10px]">
                              <MapPin className="h-2.5 w-2.5 mr-0.5" />
                              {a.street}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{agent.totalCustomers}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                        {agent.unpaidCustomers ?? agent.activeAssignments}
                      </Badge>
                    </TableCell>
                    {isOwner && (
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(agent)}
                            title="Edit Areas"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteTarget(agent)}
                            title="Delete Allocations"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </motion.tr>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Allocation Edit / Add Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "add" ? "Add Area Allocation" : `Edit Areas — ${editAgent?.name}`}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "add"
                ? "Select an agent and choose the collection areas to assign."
                : "Select the areas to assign to this agent."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Agent Selector (Add mode only) */}
            {modalMode === "add" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Agent
                </label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.phone ? `(${a.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Selected Areas Badges with Removable X */}
            {selectedAreas.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Selected Areas ({selectedAreas.length})</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAreas([])}
                    className="text-xs text-muted-foreground hover:text-destructive underline"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 p-2 rounded-lg border bg-muted/30 max-h-24 overflow-y-auto">
                  {selectedAreas.map((street) => (
                    <Badge key={street} variant="secondary" className="text-xs gap-1 py-0.5 pr-1">
                      <MapPin className="h-3 w-3" />
                      <span>{street}</span>
                      <button
                        type="button"
                        onClick={() => toggleArea(street)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 hover:text-destructive"
                        aria-label={`Remove ${street}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Search and Bulk Selection Controls */}
            <div className="flex items-center justify-between gap-2">
              <CapitalizedInput
                casing="words"
                placeholder="Search areas by street, village, city..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAllFiltered}
                className="whitespace-nowrap"
              >
                {areAllFilteredSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>

            {/* Scrollable Area List with Overlap Warnings */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredModalAreas.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {modalSearch ? `No areas match "${modalSearch}".` : "No available customer areas found."}
                </div>
              ) : (
                filteredModalAreas.map((area) => {
                  const isSelected = selectedAreas.includes(area.street);
                  const currentAgentId = modalMode === "add" ? selectedAgentId : editAgent?.id;
                  const otherAgents = (area.allocatedAgents || []).filter(
                    (a) => a.id !== currentAgentId
                  );

                  return (
                    <div
                      key={area.street}
                      onClick={() => toggleArea(area.street)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleArea(area.street)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <p className="text-sm font-medium leading-none mb-1">{area.street}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {area.city}
                            {area.village && area.village !== "N/A" ? ` · ${area.village}` : ""}
                            {area.customerCount > 0 &&
                              ` (${area.customerCount} customers, ${area.unpaidCount} unpaid)`}
                          </p>
                        </div>
                      </div>
                      {otherAgents.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                        >
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          {otherAgents[0].name}
                          {otherAgents.length > 1 ? ` +${otherAgents.length - 1}` : ""}
                        </Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || (modalMode === "add" && !selectedAgentId)}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Areas ({selectedAreas.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Area Allocations</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove all area allocations for{" "}
              <strong>{deleteTarget?.name}</strong>? This action will unassign all areas from this agent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete Allocations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
