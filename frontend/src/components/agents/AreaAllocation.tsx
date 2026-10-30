import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { MapPin, Plus, Edit2, Trash2, Users, AlertTriangle } from "lucide-react";

interface AreaAgent {
  id: number;
  name: string;
  phone: string;
  areas: { city: string; village: string; street: string }[];
  totalCustomers: number;
  activeAssignments: number;
}

const initialAgents: AreaAgent[] = [
  { id: 1, name: "Suresh Kumar", phone: "9876543210", areas: [{ city: "Chennai", village: "N/A", street: "Anna Nagar" }, { city: "Chennai", village: "N/A", street: "T Nagar" }], totalCustomers: 45, activeAssignments: 12 },
  { id: 2, name: "Ramesh S", phone: "9876543211", areas: [{ city: "Chennai", village: "N/A", street: "Velachery" }, { city: "Chennai", village: "N/A", street: "Adyar" }], totalCustomers: 32, activeAssignments: 8 },
  { id: 3, name: "Vijay R", phone: "9876543212", areas: [{ city: "Chennai", village: "Mudichur", street: "Tambaram" }, { city: "Chennai", village: "N/A", street: "Chrompet" }], totalCustomers: 55, activeAssignments: 15 },
  { id: 4, name: "Ganesh M", phone: "9876543213", areas: [{ city: "Chennai", village: "Pattabiram", street: "Avadi" }, { city: "Chennai", village: "N/A", street: "Porur" }], totalCustomers: 28, activeAssignments: 6 },
];

const allAreas = [
  { city: "Chennai", village: "N/A", street: "Anna Nagar" },
  { city: "Chennai", village: "N/A", street: "T Nagar" },
  { city: "Chennai", village: "N/A", street: "Velachery" },
  { city: "Chennai", village: "N/A", street: "Adyar" },
  { city: "Chennai", village: "Mudichur", street: "Tambaram" },
  { city: "Chennai", village: "N/A", street: "Chrompet" },
  { city: "Chennai", village: "Pattabiram", street: "Avadi" },
  { city: "Chennai", village: "N/A", street: "Porur" },
  { city: "Chennai", village: "N/A", street: "Mylapore" },
  { city: "Chennai", village: "N/A", street: "Guindy" },
];

export default function AreaAllocation() {
  const [agents, setAgents] = useState(initialAgents);
  const [editAgent, setEditAgent] = useState<AreaAgent | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const openEdit = (agent: AreaAgent) => {
    setEditAgent(agent);
    setSelectedAreas(agent.areas.map((a) => a.street));
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!editAgent) return;
    setAgents((prev) => prev.map((a) =>
      a.id === editAgent.id ? { ...a, areas: allAreas.filter((ar) => selectedAreas.includes(ar.street)) } : a
    ));
    setShowDialog(false);
    setEditAgent(null);
  };

  const toggleArea = (street: string) => {
    setSelectedAreas((prev) => prev.includes(street) ? prev.filter((s) => s !== street) : [...prev, street]);
  };

  // Check overlapping areas
  const getOverlap = (street: string, agentId: number) => {
    return agents.filter((a) => a.id !== agentId && a.areas.some((ar) => ar.street === street)).map((a) => a.name);
  };

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.areas.some((ar) => ar.street.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Area Allocation</h1>
          <p className="text-sm text-muted-foreground">Assign collection areas to agents</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-1" />Add Allocation</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Agents", value: agents.length, icon: Users, color: "text-primary" },
          { label: "Total Areas", value: allAreas.length, icon: MapPin, color: "text-green-500" },
          { label: "Allocated", value: new Set(agents.flatMap((a) => a.areas.map((ar) => ar.street))).size, icon: MapPin, color: "text-blue-500" },
          { label: "Unallocated", value: allAreas.length - new Set(agents.flatMap((a) => a.areas.map((ar) => ar.street))).size, icon: AlertTriangle, color: "text-yellow-500" },
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
            <CapitalizedInput casing="words" placeholder="Search agent or area..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-64" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Areas</TableHead>
                <TableHead className="text-center">Customers</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents.map((agent, i) => (
                <motion.tr key={agent.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="border-b transition-colors hover:bg-muted/50">
                  <TableCell>
                    <div className="font-semibold text-sm text-foreground">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{agent.phone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {agent.areas.map((a) => (
                        <Badge key={a.street} variant="secondary" className="text-[10px]">
                          <MapPin className="h-2.5 w-2.5 mr-0.5" />{a.street}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-semibold">{agent.totalCustomers}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{agent.activeAssignments}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(agent)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Areas — {editAgent?.name}</DialogTitle>
            <DialogDescription>Select the areas to assign to this agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-auto">
            {allAreas.map((area) => {
              const overlap = editAgent ? getOverlap(area.street, editAgent.id) : [];
              return (
                <div key={area.street} className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${selectedAreas.includes(area.street) ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={selectedAreas.includes(area.street)} onCheckedChange={() => toggleArea(area.street)} />
                    <div>
                      <p className="text-sm font-medium">{area.street}</p>
                      <p className="text-[10px] text-muted-foreground">{area.city}{area.village !== "N/A" ? ` · ${area.village}` : ""}</p>
                    </div>
                  </div>
                  {overlap.length > 0 && (
                    <Badge variant="outline" className="text-[9px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{overlap[0]}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Areas ({selectedAreas.length})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
