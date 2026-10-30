import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Search, Printer, Download, Mail, MessageCircle, Link2,
  Eye, X, Check, Users, FileSpreadsheet, FileType, Stamp, Award,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { useToast } from "../../hooks/use-toast";

// ---------- Data ----------
const docTypes = [
  { id: "due_card", name: "Due Card", desc: "EMI schedule & payment status" },
  { id: "notice", name: "Notice Letter", desc: "Legal demand & warning notice" },
  { id: "ledger", name: "Ledger Statement", desc: "Full transaction history" },
  { id: "reminder", name: "Payment Reminder", desc: "Friendly payment reminder" },
];

const themes = [
  { id: "classic", name: "Classic", desc: "Simple white", accent: "bg-white border-foreground/20" },
  { id: "modern", name: "Modern", desc: "Clean blue", accent: "bg-primary/5 border-primary/40" },
  { id: "premium", name: "Premium", desc: "Gradient + logo", accent: "border-warning/40", style: { background: "var(--gradient-primary)", color: "white" } },
  { id: "compact", name: "Compact", desc: "Minimal print", accent: "bg-secondary/30 border-border" },
];

const customers = [
  { id: 1, hpl: "HPL 0056", name: "Manoj Singh", phone: "+91 98401 23456", vehicle: "TN-59-AB-1234", status: "Due", amount: 56000, street: "Gandhi Street", village: "Thirunagar", city: "Madurai" },
  { id: 2, hpl: "HPL 0091", name: "Venkatesh Raman", phone: "+91 98842 11122", vehicle: "TN-59-CD-5678", status: "Due", amount: 80000, street: "Nehru Road", village: "Kappalur", city: "Madurai" },
  { id: 3, hpl: "FR 0031", name: "Ashok Kumar", phone: "+91 99443 22211", vehicle: "TN-57-EF-9012", status: "Active", amount: 72000, street: "Anna Nagar", village: "Vilachery", city: "Dindigul" },
  { id: 4, hpl: "FR 0012", name: "Suresh Babu", phone: "+91 90030 33345", vehicle: "TN-59-GH-3456", status: "Due", amount: 37000, street: "MG Road", village: "Pasumalai", city: "Madurai" },
  { id: 5, hpl: "FR 0023", name: "Lakshmi Narasimhan", phone: "+91 91111 44456", vehicle: "TN-58-IJ-7890", status: "Active", amount: 12000, street: "Kamaraj Street", village: "Teppakulam", city: "Trichy" },
  { id: 6, hpl: "HPL 0005", name: "Gopal Krishna", phone: "+91 93823 55567", vehicle: "TN-59-KL-2345", status: "Closed", amount: 0, street: "Gandhi Street", village: "Thirunagar", city: "Madurai" },
  { id: 7, hpl: "HPL 0078", name: "Arun Prakash", phone: "+91 98765 67878", vehicle: "TN-59-MN-6789", status: "Due", amount: 14000, street: "Nehru Road", village: "Kappalur", city: "Sivaganga" },
];

const locationData = {
  streets: ["Gandhi Street", "Nehru Road", "Anna Nagar", "MG Road", "Kamaraj Street"],
  villages: ["Thirunagar", "Kappalur", "Vilachery", "Pasumalai", "Teppakulam"],
  cities: ["Madurai", "Dindigul", "Trichy", "Sivaganga"],
};

const statusColors: Record<string, string> = {
  Active: "bg-income/10 text-income",
  Due: "badge-warning",
  Closed: "bg-muted text-muted-foreground",
};

// ---------- Mini Template Card Preview ----------
function TemplateThumb({ theme, docName }: { theme: typeof themes[0]; docName: string }) {
  const isPremium = theme.id === "premium";
  return (
    <div
      className={`relative h-32 rounded-lg border-2 ${theme.accent} overflow-hidden p-2.5 flex flex-col gap-1`}
      style={theme.style}
    >
      <div className="flex items-center gap-1.5">
        <div className={`h-4 w-4 rounded ${isPremium ? "bg-white/30" : "bg-primary"}`} />
        <div className={`h-1.5 flex-1 rounded ${isPremium ? "bg-white/40" : "bg-foreground/30"}`} />
      </div>
      <div className={`text-[8px] font-bold tracking-wider ${isPremium ? "text-white" : "text-foreground"} text-center mt-1`}>
        {docName.toUpperCase()}
      </div>
      <div className="space-y-0.5 mt-1">
        <div className={`h-1 rounded w-3/4 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
        <div className={`h-1 rounded w-2/3 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
        <div className={`h-1 rounded w-1/2 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
      </div>
      <div className={`mt-auto h-3 rounded ${isPremium ? "bg-white/40" : theme.id === "modern" ? "bg-primary/30" : "bg-foreground/20"}`} />
    </div>
  );
}

// ---------- Live Preview ----------
function DocumentPreview({ docType, theme, customer, watermark, footer }: any) {
  const isPremium = theme.id === "premium";
  const isModern = theme.id === "modern";
  const isCompact = theme.id === "compact";

  return (
    <div className="relative bg-white text-black rounded-xl border border-border overflow-hidden shadow-lg">
      {watermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <span className="text-6xl font-black text-black/5 -rotate-45 select-none">CONFIDENTIAL</span>
        </div>
      )}

      {/* Header */}
      <div
        className={`px-6 py-4 ${isPremium ? "text-white" : isModern ? "bg-primary/10" : "bg-white border-b-2 border-black"}`}
        style={isPremium ? { background: "var(--gradient-primary)" } : {}}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold ${isPremium ? "bg-white/20" : "bg-primary text-white"}`}>
              FE
            </div>
            <div>
              <h2 className={`${isCompact ? "text-base" : "text-xl"} font-bold`}>FINANCE ERP COMPANY</h2>
              <p className="text-xs opacity-80">123 Main Street, Madurai – 625001 | +91 98765 43210</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 relative z-10">
        <div className="text-center mb-5">
          <h3 className={`${isCompact ? "text-sm" : "text-lg"} font-bold uppercase ${isModern ? "text-primary" : ""}`}>
            {docType.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Date: {new Date().toLocaleDateString("en-IN")}</p>
        </div>

        <div className={`grid grid-cols-2 gap-3 mb-5 ${isCompact ? "text-xs" : "text-sm"}`}>
          <div><span className="text-gray-500">Customer:</span> <span className="font-semibold ml-1">{customer.name}</span></div>
          <div><span className="text-gray-500">Loan No:</span> <span className="font-semibold ml-1">{customer.hpl}</span></div>
          <div><span className="text-gray-500">Phone:</span> <span className="font-semibold ml-1">{customer.phone}</span></div>
          <div><span className="text-gray-500">Vehicle:</span> <span className="font-semibold ml-1">{customer.vehicle}</span></div>
          <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-semibold ml-1">{customer.street}, {customer.village}, {customer.city}</span></div>
        </div>

        <div className={`rounded-lg p-4 mb-4 ${isPremium ? "bg-blue-50" : isModern ? "bg-primary/5" : "border border-gray-300"}`}>
          <h4 className="font-semibold mb-2 text-sm">Loan Summary</h4>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-gray-500">Principal:</span> <div className="font-bold">₹2,50,000</div></div>
            <div><span className="text-gray-500">EMI:</span> <div className="font-bold">₹15,000</div></div>
            <div><span className="text-gray-500">Rate:</span> <div className="font-bold">24%</div></div>
            <div><span className="text-gray-500">Paid:</span> <div className="font-bold text-green-600">₹2,05,000</div></div>
            <div><span className="text-gray-500">Due:</span> <div className="font-bold text-red-600">₹{customer.amount.toLocaleString()}</div></div>
            <div><span className="text-gray-500">Status:</span> <div className="font-bold">{customer.status}</div></div>
          </div>
        </div>

        {!isCompact && (
          <p className="text-xs text-gray-600 leading-relaxed mb-6">
            This is to inform you that an amount of <strong>₹{customer.amount.toLocaleString()}</strong> is overdue against the above loan account. Kindly remit the dues immediately to avoid further action.
          </p>
        )}

        <div className="flex justify-between mt-8 pt-4">
          <div className="text-center">
            <div className="border-t border-gray-400 w-32 mb-1" />
            <p className="text-[10px] text-gray-500">Customer Signature</p>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-32 mb-1" />
            <p className="text-[10px] text-gray-500">Authorised Signatory</p>
          </div>
        </div>

        {footer && (
          <div className={`mt-5 pt-3 border-t text-center text-[10px] ${isPremium ? "text-gray-600" : "text-gray-500"}`}>
            <Stamp className="inline h-3 w-3 mr-1" />
            Finance ERP Company • Authorised Seal & Signature
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main ----------
export default function Notices() {
  const { toast } = useToast();
  const [docType, setDocType] = useState(docTypes[0]);
  const [theme, setTheme] = useState(themes[1]); // default Modern
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [footer, setFooter] = useState(true);

  const [filters, setFilters] = useState({
    hplFrom: "", hplTo: "", name: "", phone: "", street: "", village: "", city: "", dealType: "", status: "All",
  });
  const [streetSugg, setStreetSugg] = useState<string[]>([]);
  const [villageSugg, setVillageSugg] = useState<string[]>([]);
  const [citySugg, setCitySugg] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const filtered = useMemo(() => {
    return customers.filter(c => {
      if (filters.name && !c.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.phone && !c.phone.includes(filters.phone)) return false;
      if (filters.street && !c.street.toLowerCase().includes(filters.street.toLowerCase())) return false;
      if (filters.village && !c.village.toLowerCase().includes(filters.village.toLowerCase())) return false;
      if (filters.city && !c.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.status !== "All" && c.status !== filters.status) return false;
      return true;
    });
  }, [filters]);

  const onChange = (k: string, v: string) => {
    setFilters(p => ({ ...p, [k]: v }));
    if (k === "street") setStreetSugg(v ? locationData.streets.filter(s => s.toLowerCase().includes(v.toLowerCase())) : []);
    if (k === "village") setVillageSugg(v ? locationData.villages.filter(s => s.toLowerCase().includes(v.toLowerCase())) : []);
    if (k === "city") setCitySugg(v ? locationData.cities.filter(s => s.toLowerCase().includes(v.toLowerCase())) : []);
  };

  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));
  const toggleOne = (id: number) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const previewCustomer = filtered.find(c => selected.includes(c.id)) || filtered[0] || customers[0];
  const totalPages = Math.max(1, selected.length);
  const fileSize = `${(totalPages * 42).toFixed(0)} KB`;

  const handleExport = (fmt: string) => {
    if (selected.length === 0) {
      toast({ title: "No customers selected", description: "Please select at least one customer.", variant: "destructive" });
      return;
    }
    toast({ title: `Exporting as ${fmt}`, description: `${selected.length} document(s) • ${fileSize}` });
  };

  const handleShare = (channel: string) => {
    if (selected.length === 0) {
      toast({ title: "No customers selected", variant: "destructive" });
      return;
    }
    if (channel === "WhatsApp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${docType.name} from Finance ERP – ${selected.length} document(s)`)}`, "_blank");
    } else if (channel === "Email") {
      window.open(`mailto:?subject=Customer Due Notice&body=Please find attached the ${docType.name}.`, "_blank");
    } else if (channel === "Copy Link") {
      navigator.clipboard.writeText(`${window.location.origin}/share/doc-${Date.now()}`);
    }
    toast({ title: `Shared via ${channel}`, description: `${selected.length} document(s) sent` });
    setShareOpen(false);
  };

  const AutoSuggest = ({ value, suggestions, filterKey, label }: any) => (
    <div className="relative">
      <Input value={value} onChange={e => onChange(filterKey, e.target.value)} placeholder={label} className="text-sm" />
      {suggestions.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {suggestions.map((s: string) => (
            <button key={s} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 text-foreground"
              onClick={() => { onChange(filterKey, s); setStreetSugg([]); setVillageSugg([]); setCitySugg([]); }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Notices & Print</h1>
          <p className="text-muted-foreground mt-1">Premium document generator & sharing system</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
          <Eye className="h-4 w-4" /> Live Preview
        </Button>
      </motion.div>

      {/* SECTION 1 — TEMPLATE SELECTION */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Document Template
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Choose document type and visual theme</p>
          </div>
        </div>

        {/* Doc type pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {docTypes.map(d => (
            <button key={d.id} onClick={() => setDocType(d)}
              className={`text-left rounded-lg border-2 p-3 transition-all ${docType.id === d.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40"}`}>
              <p className="text-sm font-semibold text-foreground">{d.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{d.desc}</p>
            </button>
          ))}
        </div>

        {/* Theme variants */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Template Variants</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {themes.map(t => (
            <motion.button key={t.id} whileHover={{ y: -3 }} onClick={() => setTheme(t)}
              className={`rounded-xl border-2 transition-all overflow-hidden text-left ${theme.id === t.id ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-border hover:border-primary/40"}`}>
              <TemplateThumb theme={t} docName={docType.name} />
              <div className="p-2.5 bg-card">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  {theme.id === t.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground">{t.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Watermark / Footer toggles */}
        <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-border">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={watermark} onCheckedChange={(v) => setWatermark(!!v)} />
            <Award className="h-4 w-4 text-warning" /> Confidential Watermark
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={footer} onCheckedChange={(v) => setFooter(!!v)} />
            <Stamp className="h-4 w-4 text-primary" /> Company Seal & Footer
          </label>
        </div>
      </motion.section>

      {/* SECTION 2 — CUSTOMER FILTER */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Customer Selection
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Filter and select customers for document generation</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="badge-success text-xs px-3 py-1.5 rounded-full font-semibold">
              {selected.length} Selected
            </div>
            <div className="bg-secondary text-xs px-3 py-1.5 rounded-full font-semibold text-muted-foreground">
              {filtered.length} Found
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">HPL No From</label>
            <Input className="text-sm" placeholder="HPL 100" value={filters.hplFrom} onChange={e => onChange("hplFrom", e.target.value)} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">HPL No To</label>
            <Input className="text-sm" placeholder="HPL 999" value={filters.hplTo} onChange={e => onChange("hplTo", e.target.value)} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Customer Name</label>
            <Input className="text-sm" placeholder="Name" value={filters.name} onChange={e => onChange("name", e.target.value)} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
            <Input className="text-sm" placeholder="Phone number" value={filters.phone} onChange={e => onChange("phone", e.target.value)} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Street</label>
            <AutoSuggest value={filters.street} suggestions={streetSugg} filterKey="street" label="Street" /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Village</label>
            <AutoSuggest value={filters.village} suggestions={villageSugg} filterKey="village" label="Village" /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
            <AutoSuggest value={filters.city} suggestions={citySugg} filterKey="city" label="City" /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Deal Type</label>
            <select className="input-field text-sm py-2" value={filters.dealType} onChange={e => onChange("dealType", e.target.value)}>
              <option value="">All</option><option>Consulting</option><option>Finance</option>
            </select></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <select className="input-field text-sm py-2" value={filters.status} onChange={e => onChange("status", e.target.value)}>
              <option>All</option><option>Active</option><option>Closed</option><option>Due</option>
            </select></div>
        </div>

        {/* Customer table */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 w-10">
                    <Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                  </th>
                  {["HPL", "Name", "Phone", "Vehicle", "Status", "Amount"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className={`border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors ${selected.includes(c.id) ? "bg-primary/5" : ""}`}
                    onClick={() => toggleOne(c.id)}>
                    <td className="px-3 py-2.5"><Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleOne(c.id)} /></td>
                    <td className="px-3 py-2.5 text-sm font-medium text-primary">{c.hpl}</td>
                    <td className="px-3 py-2.5 text-sm font-medium text-foreground">{c.name}</td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground">{c.phone}</td>
                    <td className="px-3 py-2.5 text-sm text-foreground">{c.vehicle}</td>
                    <td className="px-3 py-2.5"><span className={`${statusColors[c.status]} text-xs px-2 py-0.5 rounded-full`}>{c.status}</span></td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-expense">₹{c.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No customers match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.section>

      {/* SECTION 3 — EXPORT & SHARE */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Export & Share
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Generate, download or share documents instantly</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Pages: <strong className="text-foreground">{totalPages}</strong></span>
            <span>Size: <strong className="text-foreground">{fileSize}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Export */}
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Export As</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleExport("PDF")}>
                <FileText className="h-5 w-5 text-expense" />
                <span className="text-xs">PDF</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleExport("DOC")}>
                <FileType className="h-5 w-5 text-primary" />
                <span className="text-xs">Word</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleExport("Excel")}>
                <FileSpreadsheet className="h-5 w-5 text-income" />
                <span className="text-xs">Excel</span>
              </Button>
            </div>
          </div>

          {/* Share */}
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Share Via</p>
            <div className="grid grid-cols-4 gap-2">
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleShare("WhatsApp")}>
                <MessageCircle className="h-5 w-5 text-income" />
                <span className="text-xs">WhatsApp</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleShare("Email")}>
                <Mail className="h-5 w-5 text-primary" />
                <span className="text-xs">Email</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleExport("PDF")}>
                <Download className="h-5 w-5 text-foreground" />
                <span className="text-xs">Download</span>
              </Button>
              <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleShare("Copy Link")}>
                <Link2 className="h-5 w-5 text-warning" />
                <span className="text-xs">Copy Link</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Sticky action bar */}
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 lg:left-64 z-40 bg-card/95 backdrop-blur border-t border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">{docType.name}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{theme.name} theme</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-semibold text-primary">{selected.length} customer(s)</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" className="gap-1.5" style={{ background: "var(--gradient-primary)" }} onClick={() => setShareOpen(true)}>
              <Download className="h-4 w-4" /> Generate & Share
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Live Preview — {docType.name} ({theme.name})
            </DialogTitle>
          </DialogHeader>
          <DocumentPreview docType={docType} theme={theme} customer={previewCustomer} watermark={watermark} footer={footer} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            <Button className="gap-2" style={{ background: "var(--gradient-primary)" }} onClick={() => handleExport("PDF")}>
              <Download className="h-4 w-4" /> Export PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Share Document</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Generating <strong>{selected.length}</strong> document(s) • <strong>{fileSize}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handleShare("WhatsApp")}>
              <MessageCircle className="h-6 w-6 text-income" /> WhatsApp
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handleShare("Email")}>
              <Mail className="h-6 w-6 text-primary" /> Email
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => { handleExport("PDF"); setShareOpen(false); }}>
              <Download className="h-6 w-6" /> Download
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handleShare("Copy Link")}>
              <Link2 className="h-6 w-6 text-warning" /> Copy Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
