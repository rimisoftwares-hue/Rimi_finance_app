import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { TablePagination } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";

interface RSPEntry {
  id: number;
  bankName: string;
  interestPercent: number;
  validityMonths: number;
  interestAfterValidity: number;
  processingCharges: number;
  appraiserCommission: number;
}

const bankSuggestions = [
  "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Punjab National Bank",
  "Bank of Baroda", "Canara Bank", "Union Bank", "IndusInd Bank", "Kotak Mahindra Bank",
  "Bajaj Finance", "Muthoot Finance", "Manappuram Finance", "Shriram Finance", "L&T Finance",
];

const initialData: RSPEntry[] = [
  { id: 1, bankName: "Bajaj Finance", interestPercent: 14.5, validityMonths: 36, interestAfterValidity: 18.0, processingCharges: 2500, appraiserCommission: 1.5 },
  { id: 2, bankName: "Shriram Finance", interestPercent: 16.0, validityMonths: 48, interestAfterValidity: 20.0, processingCharges: 3000, appraiserCommission: 2.0 },
  { id: 3, bankName: "HDFC Bank", interestPercent: 12.5, validityMonths: 60, interestAfterValidity: 15.0, processingCharges: 2000, appraiserCommission: 1.0 },
  { id: 4, bankName: "Muthoot Finance", interestPercent: 18.0, validityMonths: 24, interestAfterValidity: 22.0, processingCharges: 1500, appraiserCommission: 2.5 },
];

export default function RSPBankMaster() {
  const [data, setData] = useState<RSPEntry[]>(initialData);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<RSPEntry | null>(null);
  const [form, setForm] = useState<Partial<RSPEntry>>({});
  const [bankSearch, setBankSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = useMemo(
    () => data.filter((d) => d.bankName.toLowerCase().includes(searchTerm.toLowerCase())),
    [data, searchTerm]
  );

  const {
    paginatedItems,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(filtered, { initialPageSize: 15, resetKey: searchTerm });

  const suggestions = bankSuggestions.filter((b) => b.toLowerCase().includes(bankSearch.toLowerCase()));

  const openAdd = () => { setEditItem(null); setForm({}); setBankSearch(""); setShowDialog(true); };
  const openEdit = (item: RSPEntry) => { setEditItem(item); setForm(item); setBankSearch(item.bankName); setShowDialog(true); };

  const saveItem = () => {
    if (!bankSearch) return;
    if (editItem) {
      setData(data.map((d) => d.id === editItem.id ? { ...d, ...form, bankName: bankSearch } as RSPEntry : d));
    } else {
      setData([...data, { ...form, id: Date.now(), bankName: bankSearch } as RSPEntry]);
    }
    setShowDialog(false);
  };

  const deleteItem = (id: number) => setData(data.filter((d) => d.id !== id));

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">RSP - Bank Master</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage company bank accounts, branches, and IFSC records</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Entry</Button>
      </motion.div>

      <div className="dashboard-card !p-4 hover:translate-y-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search bank / NBFC..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">Bank / NBFC</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Interest %</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Validity (Months)</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Interest After</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Processing (₹)</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-right">Commission %</th>
                <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No bank / NBFC entries found
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{item.bankName}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-foreground">{item.interestPercent}%</td>
                    <td className="px-4 py-3 text-sm text-right text-foreground">{item.validityMonths}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-foreground">{item.interestAfterValidity}%</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-foreground">₹{item.processingCharges.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-foreground">{item.appraiserCommission}%</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <div className="flex justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}><Edit className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteItem(item.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
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
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Add"} RSP Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Label className="text-xs">Bank / NBFC Name</Label>
              <Input value={bankSearch} onChange={(e) => { setBankSearch(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Type to search..." />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-auto">
                  {suggestions.map((s) => (
                    <button key={s} className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-foreground" onClick={() => { setBankSearch(s); setShowSuggestions(false); }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Interest %</Label><Input type="number" value={form.interestPercent || ""} onChange={(e) => setForm({ ...form, interestPercent: +e.target.value })} /></div>
              <div><Label className="text-xs">Validity (Months)</Label><Input type="number" value={form.validityMonths || ""} onChange={(e) => setForm({ ...form, validityMonths: +e.target.value })} /></div>
              <div><Label className="text-xs">Interest After Validity %</Label><Input type="number" value={form.interestAfterValidity || ""} onChange={(e) => setForm({ ...form, interestAfterValidity: +e.target.value })} /></div>
              <div><Label className="text-xs">Processing Charges ₹</Label><Input type="number" value={form.processingCharges || ""} onChange={(e) => setForm({ ...form, processingCharges: +e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Appraiser Commission %</Label><Input type="number" value={form.appraiserCommission || ""} onChange={(e) => setForm({ ...form, appraiserCommission: +e.target.value })} /></div>
            </div>
            <Button onClick={saveItem} className="w-full">{editItem ? "Update" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
