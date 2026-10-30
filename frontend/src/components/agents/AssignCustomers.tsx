import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { DatePicker } from "../ui/date-picker";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import {
  Search, Filter, ChevronDown, UserPlus, Users, AlertTriangle,
  CheckCircle2, X, Zap, Download,
} from "lucide-react";

const mockCustomers = [
  { id: 1, hplNo: "HPL 931", name: "SELVA PRABU", vehicle: "TN 01 AB 1234", phone: "9876543210", area: "Anna Nagar", city: "Chennai", village: "N/A", street: "3rd Main Road", dueAmount: 15200, overdueDays: 45, riskLevel: "high" as const, broker: "Kumar", vehicleType: "Two Wheeler", dealer: "TVS Motors", financeName: "RIM Finance", accountNo: "ACC001", hpDate: "2025-01-15", dueDate: "2025-03-01", balance: 85000 },
  { id: 2, hplNo: "HPL 932", name: "MURUGAN K", vehicle: "TN 02 CD 5678", phone: "9876543211", area: "T Nagar", city: "Chennai", village: "N/A", street: "South Usman Rd", dueAmount: 8500, overdueDays: 20, riskLevel: "medium" as const, broker: "Ravi", vehicleType: "Four Wheeler", dealer: "Maruti", financeName: "Star Gold", accountNo: "ACC002", hpDate: "2025-02-01", dueDate: "2025-04-01", balance: 120000 },
  { id: 3, hplNo: "HPL 933", name: "LAKSHMI S", vehicle: "TN 03 EF 9012", phone: "9876543212", area: "Velachery", city: "Chennai", village: "N/A", street: "100 Feet Road", dueAmount: 22000, overdueDays: 60, riskLevel: "high" as const, broker: "Kumar", vehicleType: "Two Wheeler", dealer: "Honda", financeName: "RIM Finance", accountNo: "ACC003", hpDate: "2024-12-10", dueDate: "2025-02-10", balance: 65000 },
  { id: 4, hplNo: "HPL 934", name: "RAJESH M", vehicle: "TN 04 GH 3456", phone: "9876543213", area: "Tambaram", city: "Chennai", village: "Mudichur", street: "Main Road", dueAmount: 5000, overdueDays: 10, riskLevel: "low" as const, broker: "Senthil", vehicleType: "Two Wheeler", dealer: "Bajaj", financeName: "Star Gold", accountNo: "ACC004", hpDate: "2025-03-01", dueDate: "2025-05-01", balance: 45000 },
  { id: 5, hplNo: "HPL 935", name: "PRIYA V", vehicle: "TN 05 IJ 7890", phone: "9876543214", area: "Porur", city: "Chennai", village: "N/A", street: "Mount Poonamallee Rd", dueAmount: 18500, overdueDays: 35, riskLevel: "medium" as const, broker: "Ravi", vehicleType: "Four Wheeler", dealer: "Hyundai", financeName: "RIM Finance", accountNo: "ACC005", hpDate: "2025-01-20", dueDate: "2025-03-20", balance: 95000 },
  { id: 6, hplNo: "HPL 936", name: "KARTHIK R", vehicle: "TN 06 KL 2345", phone: "9876543215", area: "Adyar", city: "Chennai", village: "N/A", street: "LB Road", dueAmount: 32000, overdueDays: 75, riskLevel: "high" as const, broker: "Kumar", vehicleType: "Four Wheeler", dealer: "Toyota", financeName: "Star Gold", accountNo: "ACC006", hpDate: "2024-11-15", dueDate: "2025-01-15", balance: 200000 },
  { id: 7, hplNo: "HPL 937", name: "DEEPA N", vehicle: "TN 07 MN 6789", phone: "9876543216", area: "Chrompet", city: "Chennai", village: "N/A", street: "GST Road", dueAmount: 7800, overdueDays: 15, riskLevel: "low" as const, broker: "Senthil", vehicleType: "Two Wheeler", dealer: "Hero", financeName: "RIM Finance", accountNo: "ACC007", hpDate: "2025-02-20", dueDate: "2025-04-20", balance: 38000 },
  { id: 8, hplNo: "HPL 938", name: "ARUN P", vehicle: "TN 08 OP 1122", phone: "9876543217", area: "Avadi", city: "Chennai", village: "Pattabiram", street: "CTH Road", dueAmount: 25000, overdueDays: 50, riskLevel: "high" as const, broker: "Ravi", vehicleType: "Four Wheeler", dealer: "Mahindra", financeName: "Star Gold", accountNo: "ACC008", hpDate: "2024-12-25", dueDate: "2025-02-25", balance: 150000 },
];

const mockAgents = [
  { id: 1, name: "Suresh Kumar", area: "Anna Nagar, T Nagar", assigned: 12, pending: 5 },
  { id: 2, name: "Ramesh S", area: "Velachery, Adyar", assigned: 8, pending: 3 },
  { id: 3, name: "Vijay R", area: "Tambaram, Chrompet", assigned: 15, pending: 8 },
  { id: 4, name: "Ganesh M", area: "Porur, Avadi", assigned: 6, pending: 2 },
];

const riskColors = { high: "bg-destructive/10 text-destructive border-destructive/20", medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", low: "bg-green-500/10 text-green-600 border-green-500/20" };
const riskRowColors = { high: "bg-destructive/5", medium: "bg-yellow-500/5", low: "" };

export default function AssignCustomers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [assignAgent, setAssignAgent] = useState("");
  const [assignPriority, setAssignPriority] = useState("medium");
  const [assignNotes, setAssignNotes] = useState("");
  const [filters, setFilters] = useState({ city: "", village: "", street: "", broker: "", vehicleType: "", dealer: "", financeName: "", dueDaysFrom: "", dueDaysTo: "", pendingFrom: "", pendingTo: "" });

  const filtered = useMemo(() => {
    return mockCustomers.filter((c) => {
      const s = searchTerm.toLowerCase();
      if (s && !c.hplNo.toLowerCase().includes(s) && !c.name.toLowerCase().includes(s) && !c.phone.includes(s) && !c.vehicle.toLowerCase().includes(s)) return false;
      if (filters.city && c.city !== filters.city) return false;
      if (filters.street && !c.street.toLowerCase().includes(filters.street.toLowerCase())) return false;
      if (filters.broker && c.broker !== filters.broker) return false;
      if (filters.vehicleType && c.vehicleType !== filters.vehicleType) return false;
      if (filters.dealer && c.dealer !== filters.dealer) return false;
      if (filters.financeName && c.financeName !== filters.financeName) return false;
      if (filters.dueDaysFrom && c.overdueDays < Number(filters.dueDaysFrom)) return false;
      if (filters.dueDaysTo && c.overdueDays > Number(filters.dueDaysTo)) return false;
      if (filters.pendingFrom && c.dueAmount < Number(filters.pendingFrom)) return false;
      if (filters.pendingTo && c.dueAmount > Number(filters.pendingTo)) return false;
      return true;
    });
  }, [searchTerm, filters]);

  const toggleSelect = (id: number) => setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const selectAll = () => setSelectedIds(filtered.map((c) => c.id));
  const clearSelection = () => setSelectedIds([]);
  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  const handleAssign = () => {
    setShowConfirm(false);
    setSelectedIds([]);
    setAssignAgent("");
    setAssignNotes("");
  };

  const suggestedAgent = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const areas = mockCustomers.filter((c) => selectedIds.includes(c.id)).map((c) => c.area);
    return mockAgents.find((a) => areas.some((area) => a.area.includes(area))) || mockAgents.reduce((min, a) => a.pending < min.pending ? a : min, mockAgents[0]);
  }, [selectedIds]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assign Customers</h1>
          <p className="text-sm text-muted-foreground">Select customers and assign to collection agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Export</Button>
        </div>
      </div>

      {/* Search + Filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <CapitalizedInput casing="none" placeholder="Search HPL No, Name, Phone, Vehicle..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" onClick={() => setFiltersOpen(!filtersOpen)}>
              <Filter className="h-4 w-4 mr-1" />Filters<ChevronDown className={`h-4 w-4 ml-1 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          <AnimatePresence>
            {filtersOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
                  <Select value={filters.city} onValueChange={(v) => setFilters({ ...filters, city: v })}>
                    <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
                    <SelectContent><SelectItem value="Chennai">Chennai</SelectItem></SelectContent>
                  </Select>
                  <CapitalizedInput casing="words" placeholder="Street" value={filters.street} onChange={(e) => setFilters({ ...filters, street: e.target.value })} />
                  <Select value={filters.broker} onValueChange={(v) => setFilters({ ...filters, broker: v })}>
                    <SelectTrigger><SelectValue placeholder="Broker" /></SelectTrigger>
                    <SelectContent><SelectItem value="Kumar">Kumar</SelectItem><SelectItem value="Ravi">Ravi</SelectItem><SelectItem value="Senthil">Senthil</SelectItem></SelectContent>
                  </Select>
                  <Select value={filters.vehicleType} onValueChange={(v) => setFilters({ ...filters, vehicleType: v })}>
                    <SelectTrigger><SelectValue placeholder="Vehicle Type" /></SelectTrigger>
                    <SelectContent><SelectItem value="Two Wheeler">Two Wheeler</SelectItem><SelectItem value="Four Wheeler">Four Wheeler</SelectItem></SelectContent>
                  </Select>
                  <Select value={filters.dealer} onValueChange={(v) => setFilters({ ...filters, dealer: v })}>
                    <SelectTrigger><SelectValue placeholder="Dealer" /></SelectTrigger>
                    <SelectContent><SelectItem value="TVS Motors">TVS Motors</SelectItem><SelectItem value="Maruti">Maruti</SelectItem><SelectItem value="Honda">Honda</SelectItem><SelectItem value="Bajaj">Bajaj</SelectItem><SelectItem value="Hyundai">Hyundai</SelectItem><SelectItem value="Toyota">Toyota</SelectItem><SelectItem value="Hero">Hero</SelectItem><SelectItem value="Mahindra">Mahindra</SelectItem></SelectContent>
                  </Select>
                  <Select value={filters.financeName} onValueChange={(v) => setFilters({ ...filters, financeName: v })}>
                    <SelectTrigger><SelectValue placeholder="Finance" /></SelectTrigger>
                    <SelectContent><SelectItem value="RIM Finance">RIM Finance</SelectItem><SelectItem value="Star Gold">Star Gold</SelectItem></SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <CapitalizedInput casing="none" placeholder="Due Days From" type="number" value={filters.dueDaysFrom} onChange={(e) => setFilters({ ...filters, dueDaysFrom: e.target.value })} />
                    <CapitalizedInput casing="none" placeholder="To" type="number" value={filters.dueDaysTo} onChange={(e) => setFilters({ ...filters, dueDaysTo: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <CapitalizedInput casing="none" placeholder="Amount From" type="number" value={filters.pendingFrom} onChange={(e) => setFilters({ ...filters, pendingFrom: e.target.value })} />
                    <CapitalizedInput casing="none" placeholder="To" type="number" value={filters.pendingTo} onChange={(e) => setFilters({ ...filters, pendingTo: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setFilters({ city: "", village: "", street: "", broker: "", vehicleType: "", dealer: "", financeName: "", dueDaysFrom: "", dueDaysTo: "", pendingFrom: "", pendingTo: "" })}>
                    <X className="h-3 w-3 mr-1" />Clear All
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer Table */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[60vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                    <TableRow>
                      <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={() => allSelected ? clearSelection() : selectAll()} /></TableHead>
                      <TableHead className="w-12">S.No</TableHead>
                      <TableHead>HPL No</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead className="text-right">Due Amount</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-center">Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c, i) => (
                      <TableRow key={c.id} className={`cursor-pointer transition-colors ${selectedIds.includes(c.id) ? "bg-primary/5" : riskRowColors[c.riskLevel]}`} onClick={() => toggleSelect(c.id)}>
                        <TableCell><Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-foreground text-xs">{c.hplNo}</div>
                          <div className="text-[11px] text-muted-foreground">{c.name}</div>
                        </TableCell>
                        <TableCell className="text-xs">{c.vehicle}</TableCell>
                        <TableCell className="text-xs">{c.phone}</TableCell>
                        <TableCell className="text-xs">{c.area}</TableCell>
                        <TableCell className="text-right font-semibold text-xs">₹{c.dueAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-center"><span className="text-xs font-medium">{c.overdueDays}d</span></TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className={`text-[10px] ${riskColors[c.riskLevel]}`}>{c.riskLevel}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assignment Panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" />Assign Agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestedAgent && selectedIds.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1"><Zap className="h-3 w-3" />AI Suggestion</div>
                  <p className="text-xs text-muted-foreground">{suggestedAgent.name} — {suggestedAgent.pending} pending, covers area</p>
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setAssignAgent(String(suggestedAgent.id))}>Use Suggestion</Button>
                </motion.div>
              )}
              <Select value={assignAgent} onValueChange={setAssignAgent}>
                <SelectTrigger><SelectValue placeholder="Select Agent" /></SelectTrigger>
                <SelectContent>
                  {mockAgents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      <div className="flex items-center justify-between w-full">
                        <span>{a.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">({a.pending} pending)</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignPriority} onValueChange={setAssignPriority}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">🔴 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🟢 Low</SelectItem>
                </SelectContent>
              </Select>
              <DatePicker placeholder="Target Completion Date" />
              <Textarea placeholder="Notes / Instructions..." value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} className="min-h-[60px]" />
              <Button className="w-full" disabled={selectedIds.length === 0 || !assignAgent} onClick={() => setShowConfirm(true)}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Assign {selectedIds.length > 0 ? `(${selectedIds.length})` : ""} Customers
              </Button>
            </CardContent>
          </Card>

          {/* Workload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Agent Workload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mockAgents.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <p className="text-[10px] text-muted-foreground">{a.area}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{a.assigned}</p>
                    <p className="text-[10px] text-muted-foreground">{a.pending} pending</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky Selection Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg rounded-xl px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-semibold text-foreground">{selectedIds.length} Customers Selected</span>
            <Button size="sm" variant="outline" onClick={clearSelection}><X className="h-3 w-3 mr-1" />Clear</Button>
            <Button size="sm" disabled={!assignAgent} onClick={() => setShowConfirm(true)}><UserPlus className="h-3 w-3 mr-1" />Assign</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Assignment</DialogTitle>
            <DialogDescription>Review and confirm the agent assignment details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Customers</span><span className="font-semibold">{selectedIds.length}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Agent</span><span className="font-semibold">{mockAgents.find((a) => String(a.id) === assignAgent)?.name || "—"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Priority</span><Badge variant="outline">{assignPriority}</Badge></div>
            {assignNotes && <div className="text-sm"><span className="text-muted-foreground">Notes: </span>{assignNotes}</div>}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Selected Customers:</p>
              <div className="flex flex-wrap gap-1">
                {mockCustomers.filter((c) => selectedIds.includes(c.id)).map((c) => (
                  <Badge key={c.id} variant="secondary" className="text-[10px]">{c.hplNo}</Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleAssign}><CheckCircle2 className="h-4 w-4 mr-1" />Confirm Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
