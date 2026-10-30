import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Download, Printer, RotateCcw, ChevronDown, ChevronUp,
  Phone, Loader2, MapPin, CheckCircle2, XCircle, Clock, AlertTriangle,
  FileText, Upload, Eye, ShieldCheck, User, Car, CreditCard, History,
  Sparkles, Bold, Italic, List as ListIcon, Heading1, Save, FileDown, FileUp,
  Bell, MessageCircle, Mail, Smartphone, X, Zap, Bookmark, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/* ─────────────────────────────── Mock data ─────────────────────────────── */

type Status = "Pending" | "Approved" | "Rejected" | "Hold";

interface LoanRequest {
  id: string;
  reqId: string;
  photo: string;
  name: string;
  father: string;
  mobile: string;
  altMobile: string;
  aadhaar: string;
  pan: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  gps: { lat: number; lng: number };
  vehiclePhoto: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleName: string;
  vehicleNo: string;
  chassisNo: string;
  engineNo: string;
  mfgYear: number;
  vehiclePrice: number;
  financeAmount: number;
  downPayment: number;
  bookingAmount: number;
  loanRequested: number;
  applicationDate: string;
  visitDate: string;
  status: Status;
  agent: string;
  branch: string;
  vehicleType: "Two Wheeler" | "Four Wheeler";
  hplNo?: string;
  payments: {
    online: { mode: string; txnId: string; date: string; amount: number }[];
    offline: { receipt: string; collectedBy: string; date: string; amount: number }[];
  };
  visit: { date: string; time: string; executive: string; showroom: string; status: string; notes: string };
  previousLoans: {
    hpl: string; date: string; amount: number; outstanding: number; paid: number;
    emiAmount: number; emiDue: string; dueMonths: number; penalty: number; interestDue: number;
    agent: string; lastPayment: string; status: "Active" | "Closed" | "Overdue";
  }[];
  risk: { level: "Low" | "Medium" | "High"; outstanding: number; emiPct: number; missedEmis: number; creditScore: number; recommendation: string };
  documents: { name: string; type: string; verified: boolean; url: string }[];
}

const AVATAR = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;
const VPHOTO = "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=200&h=140&fit=crop";

const MOCK: LoanRequest[] = [
  {
    id: "1", reqId: "LR-2026-00142", photo: AVATAR("Karthik Raja"), name: "KARTHIK RAJA", father: "Selvam",
    mobile: "9876543210", altMobile: "9123456700", aadhaar: "4321 8765 2109", pan: "AXBPK3456R",
    address: "12/A, Nehru Street", city: "Madurai", district: "Madurai", state: "Tamil Nadu", pincode: "625001",
    gps: { lat: 9.9252, lng: 78.1198 }, vehiclePhoto: VPHOTO,
    vehicleBrand: "Honda", vehicleModel: "Activa 6G", vehicleName: "Honda Activa 6G", vehicleNo: "TN59 XX 4321",
    chassisNo: "ME4JF509LKT12345", engineNo: "JF50E9012345", mfgYear: 2025,
    vehiclePrice: 92000, financeAmount: 72000, downPayment: 20000, bookingAmount: 15000, loanRequested: 72000,
    applicationDate: "2026-06-28", visitDate: "2026-07-01", status: "Pending", agent: "Ramesh K.", branch: "Madurai HO", vehicleType: "Two Wheeler",
    payments: {
      online: [{ mode: "UPI", txnId: "UPI74829384", date: "2026-06-28", amount: 10000 }],
      offline: [{ receipt: "RCP-8412", collectedBy: "Suresh (Field)", date: "2026-06-29", amount: 5000 }],
    },
    visit: { date: "2026-07-01", time: "11:30 AM", executive: "Anitha M.", showroom: "Honda Madurai", status: "Completed", notes: "Vehicle verified. Customer available on site." },
    previousLoans: [
      { hpl: "HPL 205", date: "2023-08-14", amount: 65000, outstanding: 0, paid: 65000, emiAmount: 0, emiDue: "-", dueMonths: 0, penalty: 0, interestDue: 0, agent: "Vinoth", lastPayment: "2025-01-10", status: "Closed" },
    ],
    risk: { level: "Low", outstanding: 0, emiPct: 100, missedEmis: 0, creditScore: 782, recommendation: "Recommended for approval" },
    documents: [
      { name: "Aadhaar Card", type: "ID Proof", verified: true, url: "" },
      { name: "PAN Card", type: "ID Proof", verified: true, url: "" },
      { name: "Driving License", type: "ID Proof", verified: false, url: "" },
      { name: "Address Proof", type: "Address", verified: true, url: "" },
      { name: "Salary Slip", type: "Income", verified: false, url: "" },
      { name: "Bank Statement", type: "Income", verified: true, url: "" },
      { name: "Vehicle Invoice", type: "Vehicle", verified: true, url: "" },
      { name: "Passport Photo", type: "Photo", verified: true, url: "" },
    ],
  },
  {
    id: "2", reqId: "LR-2026-00143", photo: AVATAR("Meena Devi"), name: "MEENA DEVI", father: "Balan",
    mobile: "9845123456", altMobile: "-", aadhaar: "8912 4432 1102", pan: "BXCPM8823L",
    address: "45, Anna Nagar 2nd Cross", city: "Trichy", district: "Trichy", state: "Tamil Nadu", pincode: "620017",
    gps: { lat: 10.7905, lng: 78.7047 }, vehiclePhoto: VPHOTO,
    vehicleBrand: "TVS", vehicleModel: "Jupiter 125", vehicleName: "TVS Jupiter 125", vehicleNo: "TN45 YY 2210",
    chassisNo: "MD625GF12PT98765", engineNo: "GF12E4498765", mfgYear: 2026,
    vehiclePrice: 88000, financeAmount: 68000, downPayment: 20000, bookingAmount: 8000, loanRequested: 68000,
    applicationDate: "2026-06-30", visitDate: "2026-07-02", status: "Pending", agent: "Priya S.", branch: "Trichy Branch", vehicleType: "Two Wheeler",
    payments: {
      online: [{ mode: "Bank Transfer", txnId: "NEFT884211", date: "2026-06-30", amount: 8000 }],
      offline: [],
    },
    visit: { date: "2026-07-02", time: "10:00 AM", executive: "Karthik R.", showroom: "TVS Trichy", status: "Scheduled", notes: "" },
    previousLoans: [
      { hpl: "HPL 412", date: "2024-01-20", amount: 120000, outstanding: 37000, paid: 83000, emiAmount: 6200, emiDue: "2026-06-15", dueMonths: 2, penalty: 850, interestDue: 1240, agent: "Vinoth", lastPayment: "2026-04-15", status: "Overdue" },
    ],
    risk: { level: "High", outstanding: 37000, emiPct: 68, missedEmis: 2, creditScore: 612, recommendation: "Clear existing dues before approval" },
    documents: [
      { name: "Aadhaar Card", type: "ID Proof", verified: true, url: "" },
      { name: "PAN Card", type: "ID Proof", verified: true, url: "" },
      { name: "Address Proof", type: "Address", verified: false, url: "" },
      { name: "Bank Statement", type: "Income", verified: false, url: "" },
      { name: "Passport Photo", type: "Photo", verified: true, url: "" },
    ],
  },
  {
    id: "3", reqId: "LR-2026-00144", photo: AVATAR("Vikram Prasad"), name: "VIKRAM PRASAD", father: "Prasad",
    mobile: "9012345678", altMobile: "9887766554", aadhaar: "1290 8765 5544", pan: "CXDPV5544K",
    address: "78, Gandhi Road", city: "Dindigul", district: "Dindigul", state: "Tamil Nadu", pincode: "624001",
    gps: { lat: 10.365, lng: 77.9803 }, vehiclePhoto: VPHOTO,
    vehicleBrand: "Bajaj", vehicleModel: "Pulsar N160", vehicleName: "Bajaj Pulsar N160", vehicleNo: "TN57 AZ 8899",
    chassisNo: "MD2A36PZ8P9876543", engineNo: "PZ8E7654321", mfgYear: 2026,
    vehiclePrice: 138000, financeAmount: 105000, downPayment: 33000, bookingAmount: 20000, loanRequested: 105000,
    applicationDate: "2026-06-25", visitDate: "2026-06-27", status: "Approved", agent: "Ramesh K.", branch: "Dindigul Branch", vehicleType: "Two Wheeler", hplNo: "HPL 1042",
    payments: {
      online: [{ mode: "Card", txnId: "RZP_9928211", date: "2026-06-25", amount: 15000 }],
      offline: [{ receipt: "RCP-8433", collectedBy: "Manoj (Field)", date: "2026-06-26", amount: 5000 }],
    },
    visit: { date: "2026-06-27", time: "3:30 PM", executive: "Anitha M.", showroom: "Bajaj Dindigul", status: "Completed", notes: "Chassis matched, RC available." },
    previousLoans: [],
    risk: { level: "Low", outstanding: 0, emiPct: 100, missedEmis: 0, creditScore: 810, recommendation: "Excellent profile, approved" },
    documents: [
      { name: "Aadhaar Card", type: "ID Proof", verified: true, url: "" },
      { name: "PAN Card", type: "ID Proof", verified: true, url: "" },
      { name: "Driving License", type: "ID Proof", verified: true, url: "" },
      { name: "Address Proof", type: "Address", verified: true, url: "" },
      { name: "Bank Statement", type: "Income", verified: true, url: "" },
      { name: "Vehicle Invoice", type: "Vehicle", verified: true, url: "" },
      { name: "Passport Photo", type: "Photo", verified: true, url: "" },
    ],
  },
  {
    id: "4", reqId: "LR-2026-00145", photo: AVATAR("Ravi Shankar"), name: "RAVI SHANKAR", father: "Kumar",
    mobile: "9234567890", altMobile: "-", aadhaar: "5566 7788 9900", pan: "DXEPR2233M",
    address: "9, MG Road", city: "Sivaganga", district: "Sivaganga", state: "Tamil Nadu", pincode: "630561",
    gps: { lat: 9.8433, lng: 78.4809 }, vehiclePhoto: VPHOTO,
    vehicleBrand: "Hero", vehicleModel: "Splendor Plus", vehicleName: "Hero Splendor Plus", vehicleNo: "TN63 BA 1120",
    chassisNo: "MBLHA10AXPHA98765", engineNo: "HA10E9876543", mfgYear: 2025,
    vehiclePrice: 78000, financeAmount: 60000, downPayment: 18000, bookingAmount: 5000, loanRequested: 60000,
    applicationDate: "2026-06-20", visitDate: "2026-06-22", status: "Rejected", agent: "Priya S.", branch: "Sivaganga Branch", vehicleType: "Two Wheeler",
    payments: {
      online: [], offline: [{ receipt: "RCP-8398", collectedBy: "Suresh (Field)", date: "2026-06-20", amount: 5000 }],
    },
    visit: { date: "2026-06-22", time: "5:00 PM", executive: "Karthik R.", showroom: "Hero Sivaganga", status: "Completed", notes: "Address mismatch" },
    previousLoans: [
      { hpl: "HPL 778", date: "2023-11-05", amount: 210000, outstanding: 56000, paid: 154000, emiAmount: 8800, emiDue: "2026-06-20", dueMonths: 6, penalty: 3200, interestDue: 4400, agent: "Vinoth", lastPayment: "2025-12-15", status: "Overdue" },
    ],
    risk: { level: "High", outstanding: 56000, emiPct: 41, missedEmis: 6, creditScore: 548, recommendation: "Reject — history of default" },
    documents: [
      { name: "Aadhaar Card", type: "ID Proof", verified: true, url: "" },
      { name: "PAN Card", type: "ID Proof", verified: false, url: "" },
      { name: "Address Proof", type: "Address", verified: false, url: "" },
    ],
  },
];

const DEFAULT_TERMS_MD = `# Loan Agreement — Terms & Conditions

## 1. Loan Amount & Tenure
The finance company agrees to sanction a loan of **₹{{amount}}** payable in **{{tenure}} months** at an interest rate of **{{rate}}% per annum**.

## 2. EMI Schedule
- Equated Monthly Instalment: ₹{{emi}}
- Due on the **5th of every month**
- Late payment penalty: ₹100 + 2% p.m. on overdue amount

## 3. Hypothecation
The financed vehicle stands hypothecated to the finance company until the loan is fully repaid. Sale, transfer or alteration without written consent is prohibited.

## 4. Insurance
- Comprehensive insurance is **mandatory** through the loan tenure.
- Renewal proof must be submitted within 15 days of expiry.

## 5. Default & Recovery
- 3 consecutive missed EMIs constitute default.
- The finance company reserves the right to repossess the vehicle upon default.

## 6. Prepayment
Prepayment is permitted after 6 EMIs with a nominal foreclosure charge of 2% on outstanding principal.

## 7. Jurisdiction
All disputes are subject to the exclusive jurisdiction of courts at **Madurai, Tamil Nadu**.
`;

const CHECKLIST_ITEMS = [
  "Customer identity verified",
  "Address verified",
  "Vehicle verified",
  "Booking amount verified",
  "Documents complete",
  "Existing loans checked",
  "Credit assessment completed",
  "Terms accepted by customer",
];

/* ─────────────────────────────── Helpers ─────────────────────────────── */

const statusStyles: Record<Status, string> = {
  Pending: "bg-warning/10 text-warning border-warning/20",
  Approved: "bg-income/10 text-income border-income/20",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
  Hold: "bg-muted-foreground/10 text-muted-foreground border-border",
};

const riskStyles: Record<string, string> = {
  Low: "bg-income/10 text-income",
  Medium: "bg-warning/10 text-warning",
  High: "bg-destructive/10 text-destructive",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Tiny markdown → HTML renderer (headings, bold, italic, lists, hr, paragraphs). */
function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (let raw of lines) {
    const line = esc(raw);
    if (/^\s*$/.test(line)) { if (inList) { out.push("</ul>"); inList = false; } out.push(""); continue; }
    if (/^---+$/.test(line)) { out.push("<hr class='my-3 border-border'/>"); continue; }
    let m;
    if ((m = line.match(/^#\s+(.*)/))) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h1 class='text-xl font-bold mt-4 mb-2 text-foreground'>${m[1]}</h1>`); continue; }
    if ((m = line.match(/^##\s+(.*)/))) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h2 class='text-lg font-semibold mt-3 mb-1.5 text-foreground'>${m[1]}</h2>`); continue; }
    if ((m = line.match(/^###\s+(.*)/))) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h3 class='text-base font-semibold mt-2 mb-1 text-foreground'>${m[1]}</h3>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)/))) {
      if (!inList) { out.push("<ul class='list-disc pl-6 space-y-0.5 text-sm text-foreground'>"); inList = true; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    out.push(`<p class='text-sm leading-relaxed text-foreground my-1.5'>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");

  function inline(s: string) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong class='font-semibold'>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code class='px-1 py-0.5 rounded bg-secondary text-xs'>$1</code>");
  }
}

/* ─────────────────────────────── Sub-components ─────────────────────────────── */

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm text-foreground text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ─────────────────────────────── Markdown Editor ─────────────────────────────── */

function TermsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [savedTemplates, setSavedTemplates] = useState<{ name: string; content: string }[]>([
    { name: "Standard 2-Wheeler", content: DEFAULT_TERMS_MD },
  ]);

  const wrap = (before: string, after = before) => {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    onChange(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + before.length, e + before.length); }, 0);
  };
  const prefixLine = (p: string) => {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    onChange(value.slice(0, lineStart) + p + value.slice(lineStart));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { onChange(String(r.result)); toast.success(`Loaded ${f.name}`); };
    r.readAsText(f);
  };
  const handleDownload = () => {
    const blob = new Blob([value], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "loan-terms.md"; a.click();
  };
  const saveTemplate = () => {
    const name = prompt("Template name?");
    if (name) { setSavedTemplates(p => [...p, { name, content: value }]); toast.success("Template saved"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => wrap("**")}><Bold className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => wrap("*")}><Italic className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => prefixLine("# ")}><Heading1 className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => prefixLine("- ")}><ListIcon className="h-3.5 w-3.5" /></Button>
        <div className="w-px h-6 bg-border mx-1" />
        <label className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs border border-border rounded-md cursor-pointer hover:bg-secondary">
          <FileUp className="h-3.5 w-3.5" /> Upload .md
          <input type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={handleUpload} />
        </label>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleDownload}><FileDown className="h-3.5 w-3.5" /> Download</Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={saveTemplate}><Save className="h-3.5 w-3.5" /> Save Template</Button>
        <select
          className="input-field text-xs py-1 h-8 ml-auto"
          onChange={e => { const t = savedTemplates.find(t => t.name === e.target.value); if (t) onChange(t.content); }}
          defaultValue=""
        >
          <option value="" disabled>Load template…</option>
          {savedTemplates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} className="font-mono text-xs min-h-[380px] resize-y" />
        <div className="min-h-[380px] max-h-[500px] overflow-auto rounded-md border border-border p-4 bg-secondary/20">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Detail Dialog ─────────────────────────────── */

function DetailDialog({ req, onClose, onUpdate }: {
  req: LoanRequest; onClose: () => void;
  onUpdate: (updates: Partial<LoanRequest>) => void;
}) {
  const [tab, setTab] = useState("customer");
  const [hplNo, setHplNo] = useState(req.hplNo ?? "");
  const [terms, setTerms] = useState(DEFAULT_TERMS_MD);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST_ITEMS.map(i => [i, false]))
  );
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<{ time: string; text: string }[]>([]);
  const [notify, setNotify] = useState({ app: true, sms: true, whatsapp: true, email: false });

  const timeline = useMemo(() => [
    { time: `${req.applicationDate} 09:12`, user: "Customer App", action: "Loan Applied", remarks: `Requested ${inr(req.loanRequested)}` },
    { time: `${req.applicationDate} 09:45`, user: "System", action: "Booking Amount Received", remarks: `${inr(req.payments.online[0]?.amount ?? 0)} via ${req.payments.online[0]?.mode ?? "—"}` },
    { time: `${req.visitDate} 11:30`, user: req.visit.executive, action: "Vehicle Visit", remarks: req.visit.status },
    { time: `${req.applicationDate} 14:20`, user: "Customer App", action: "Documents Uploaded", remarks: `${req.documents.length} files` },
    ...notes.map(n => ({ time: n.time, user: "Finance Staff", action: "Internal Note", remarks: n.text })),
    ...(req.status !== "Pending" ? [{ time: "Now", user: "Admin", action: `Marked ${req.status}`, remarks: req.hplNo ?? "-" }] : []),
  ], [req, notes]);

  const autoHpl = () => setHplNo(`HPL ${1000 + Math.floor(Math.random() * 9000)}`);

  const doDecision = (status: Status) => {
    if (status === "Approved") {
      const required = ["Customer identity verified", "Address verified", "Vehicle verified", "Booking amount verified"];
      const missing = required.filter(k => !checklist[k]);
      if (missing.length) { toast.error(`Complete mandatory checks: ${missing[0]}`); return; }
      if (!hplNo.trim()) { toast.error("Assign an HPL number before approving"); return; }
    }
    onUpdate({ status, hplNo: status === "Approved" ? hplNo : req.hplNo });
    const channels = Object.entries(notify).filter(([, v]) => v).map(([k]) => k).join(", ");
    toast.success(`${status}. Notifying customer via ${channels || "in-app only"}.`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <img src={req.photo} alt={req.name} className="h-14 w-14 rounded-xl object-cover ring-2 ring-primary/20" />
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-3">
                <span>{req.name}</span>
                <Badge variant="outline" className={statusStyles[req.status]}>{req.status}</Badge>
                {req.hplNo && <Badge className="bg-primary/10 text-primary border-primary/20">{req.hplNo}</Badge>}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-4 text-xs">
                <span className="font-mono">{req.reqId}</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.mobile}</span>
                <span className="flex items-center gap-1"><Car className="h-3 w-3" />{req.vehicleName}</span>
                <span>Requested {inr(req.loanRequested)}</span>
              </DialogDescription>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-secondary rounded-md"><X className="h-4 w-4" /></button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 flex flex-wrap h-auto">
              <TabsTrigger value="customer"><User className="h-3.5 w-3.5 mr-1.5" />Customer</TabsTrigger>
              <TabsTrigger value="vehicle"><Car className="h-3.5 w-3.5 mr-1.5" />Vehicle</TabsTrigger>
              <TabsTrigger value="payments"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Payments</TabsTrigger>
              <TabsTrigger value="visit"><MapPin className="h-3.5 w-3.5 mr-1.5" />Visit</TabsTrigger>
              <TabsTrigger value="history"><History className="h-3.5 w-3.5 mr-1.5" />Loan History</TabsTrigger>
              <TabsTrigger value="risk"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Credit Risk</TabsTrigger>
              <TabsTrigger value="docs"><FileText className="h-3.5 w-3.5 mr-1.5" />Documents</TabsTrigger>
              <TabsTrigger value="terms"><Bookmark className="h-3.5 w-3.5 mr-1.5" />Terms</TabsTrigger>
              <TabsTrigger value="approval"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approval</TabsTrigger>
              <TabsTrigger value="notes"><MessageCircle className="h-3.5 w-3.5 mr-1.5" />Notes</TabsTrigger>
              <TabsTrigger value="timeline"><Clock className="h-3.5 w-3.5 mr-1.5" />Timeline</TabsTrigger>
            </TabsList>

            {/* Customer */}
            <TabsContent value="customer" className="mt-0 grid md:grid-cols-2 gap-4">
              <SectionCard title="Personal Details" icon={User}>
                <InfoRow label="Full Name" value={req.name} />
                <InfoRow label="Father / Guardian" value={req.father} />
                <InfoRow label="Mobile" value={req.mobile} mono />
                <InfoRow label="Alternate" value={req.altMobile} mono />
                <InfoRow label="Aadhaar" value={req.aadhaar} mono />
                <InfoRow label="PAN" value={req.pan} mono />
              </SectionCard>
              <SectionCard title="Address & Location" icon={MapPin}>
                <InfoRow label="Address" value={req.address} />
                <InfoRow label="City" value={req.city} />
                <InfoRow label="District" value={req.district} />
                <InfoRow label="State" value={req.state} />
                <InfoRow label="Pincode" value={req.pincode} mono />
                <InfoRow label="GPS" value={
                  <a href={`https://maps.google.com/?q=${req.gps.lat},${req.gps.lng}`} target="_blank" rel="noreferrer"
                     className="text-primary hover:underline inline-flex items-center gap-1 font-mono text-xs">
                    {req.gps.lat}, {req.gps.lng} <ExternalLink className="h-3 w-3" />
                  </a>
                } />
              </SectionCard>
            </TabsContent>

            {/* Vehicle */}
            <TabsContent value="vehicle" className="mt-0 grid md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <img src={req.vehiclePhoto} alt={req.vehicleName} className="w-full rounded-xl object-cover border border-border" />
              </div>
              <div className="md:col-span-2 grid md:grid-cols-2 gap-4">
                <SectionCard title="Vehicle Details" icon={Car}>
                  <InfoRow label="Brand" value={req.vehicleBrand} />
                  <InfoRow label="Model" value={req.vehicleModel} />
                  <InfoRow label="Registration No" value={req.vehicleNo} mono />
                  <InfoRow label="Chassis No" value={req.chassisNo} mono />
                  <InfoRow label="Engine No" value={req.engineNo} mono />
                  <InfoRow label="Mfg. Year" value={req.mfgYear} />
                </SectionCard>
                <SectionCard title="Finance Breakup" icon={CreditCard}>
                  <InfoRow label="Vehicle Price" value={inr(req.vehiclePrice)} />
                  <InfoRow label="Finance Amount" value={<span className="text-primary font-semibold">{inr(req.financeAmount)}</span>} />
                  <InfoRow label="Down Payment" value={inr(req.downPayment)} />
                  <InfoRow label="Booking Amount" value={inr(req.bookingAmount)} />
                  <InfoRow label="Remaining" value={<span className="text-warning font-semibold">{inr(req.vehiclePrice - req.bookingAmount)}</span>} />
                </SectionCard>
              </div>
            </TabsContent>

            {/* Payments */}
            <TabsContent value="payments" className="mt-0 space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Total Booking Received</p>
                  <p className="text-2xl font-bold text-income mt-1">{inr(req.bookingAmount)}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Remaining Balance</p>
                  <p className="text-2xl font-bold text-warning mt-1">{inr(req.vehiclePrice - req.bookingAmount)}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Loan Requested</p>
                  <p className="text-2xl font-bold text-primary mt-1">{inr(req.loanRequested)}</p>
                </div>
              </div>
              <SectionCard title="Online Payments" icon={Zap}>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2">Mode</th><th>Txn ID</th><th>Date</th><th className="text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {req.payments.online.length ? req.payments.online.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2"><Badge variant="outline">{p.mode}</Badge></td>
                        <td className="font-mono text-xs">{p.txnId}</td><td>{p.date}</td>
                        <td className="text-right text-income font-semibold">{inr(p.amount)}</td>
                      </tr>
                    )) : <tr><td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">No online payments</td></tr>}
                  </tbody>
                </table>
              </SectionCard>
              <SectionCard title="Offline Payments" icon={CreditCard}>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2">Receipt</th><th>Collected By</th><th>Date</th><th className="text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {req.payments.offline.length ? req.payments.offline.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 font-mono text-xs">{p.receipt}</td>
                        <td>{p.collectedBy}</td><td>{p.date}</td>
                        <td className="text-right text-income font-semibold">{inr(p.amount)}</td>
                      </tr>
                    )) : <tr><td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">No offline collections</td></tr>}
                  </tbody>
                </table>
              </SectionCard>
            </TabsContent>

            {/* Visit */}
            <TabsContent value="visit" className="mt-0">
              <SectionCard title="Vehicle Inspection" icon={MapPin}>
                <div className="grid md:grid-cols-2 gap-x-6">
                  <InfoRow label="Inspection Date" value={req.visit.date} />
                  <InfoRow label="Time" value={req.visit.time} />
                  <InfoRow label="Sales Executive" value={req.visit.executive} />
                  <InfoRow label="Showroom" value={req.visit.showroom} />
                  <InfoRow label="Status" value={<Badge className={req.visit.status === "Completed" ? "bg-income/10 text-income" : "bg-warning/10 text-warning"}>{req.visit.status}</Badge>} />
                </div>
                {req.visit.notes && <div className="mt-3 p-3 rounded-md bg-secondary/40 text-sm text-foreground">{req.visit.notes}</div>}
              </SectionCard>
            </TabsContent>

            {/* Loan History */}
            <TabsContent value="history" className="mt-0 space-y-4">
              {req.previousLoans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <Sparkles className="h-8 w-8 mx-auto text-income mb-2" />
                  <p className="text-sm font-semibold text-foreground">First-time customer</p>
                  <p className="text-xs text-muted-foreground mt-1">No previous loans on file.</p>
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border p-3 bg-secondary/30">
                      <p className="text-xs text-muted-foreground">Total Loans</p>
                      <p className="text-xl font-bold">{req.previousLoans.length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-secondary/30">
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="text-xl font-bold text-primary">{req.previousLoans.filter(l => l.status !== "Closed").length}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-secondary/30">
                      <p className="text-xs text-muted-foreground">Total Outstanding</p>
                      <p className="text-xl font-bold text-destructive">{inr(req.previousLoans.reduce((s, l) => s + l.outstanding, 0))}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3 bg-secondary/30">
                      <p className="text-xs text-muted-foreground">Total Paid</p>
                      <p className="text-xl font-bold text-income">{inr(req.previousLoans.reduce((s, l) => s + l.paid, 0))}</p>
                    </div>
                  </div>
                  {req.previousLoans.map((l) => {
                    const overdue = l.status === "Overdue";
                    return (
                      <div key={l.hpl} className={`rounded-xl border p-4 ${overdue ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary/10 text-primary">{l.hpl}</Badge>
                            <Badge className={l.status === "Closed" ? "bg-income/10 text-income" : overdue ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}>{l.status}</Badge>
                            {overdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
                          </div>
                          <span className="text-xs text-muted-foreground">Opened {l.date}</span>
                        </div>
                        <div className="grid md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
                          <InfoRow label="Amount" value={inr(l.amount)} />
                          <InfoRow label="Paid" value={inr(l.paid)} />
                          <InfoRow label="Outstanding" value={<span className={overdue ? "text-destructive font-semibold" : ""}>{inr(l.outstanding)}</span>} />
                          <InfoRow label="EMI" value={inr(l.emiAmount)} />
                          <InfoRow label="EMI Due" value={l.emiDue} />
                          <InfoRow label="Due Months" value={l.dueMonths} />
                          <InfoRow label="Penalty" value={inr(l.penalty)} />
                          <InfoRow label="Interest Due" value={inr(l.interestDue)} />
                          <InfoRow label="Agent" value={l.agent} />
                          <InfoRow label="Last Payment" value={l.lastPayment} />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </TabsContent>

            {/* Risk */}
            <TabsContent value="risk" className="mt-0">
              <div className="grid md:grid-cols-2 gap-4">
                <SectionCard title="Credit Assessment" icon={ShieldCheck}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Overall Risk</p>
                      <Badge className={`text-base px-3 py-1 mt-1 ${riskStyles[req.risk.level]}`}>{req.risk.level}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Internal Credit Score</p>
                      <p className="text-3xl font-bold text-foreground">{req.risk.creditScore}</p>
                    </div>
                  </div>
                  <InfoRow label="Total Outstanding" value={inr(req.risk.outstanding)} />
                  <InfoRow label="EMI Collection %" value={`${req.risk.emiPct}%`} />
                  <InfoRow label="Missed EMIs" value={req.risk.missedEmis} />
                </SectionCard>
                <SectionCard title="Recommendation" icon={Sparkles}>
                  <div className={`p-4 rounded-lg text-sm ${riskStyles[req.risk.level]}`}>{req.risk.recommendation}</div>
                </SectionCard>
              </div>
            </TabsContent>

            {/* Docs */}
            <TabsContent value="docs" className="mt-0 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {req.documents.map(d => (
                <div key={d.name} className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
                  <div className="h-12 w-12 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.type}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1"><Eye className="h-3 w-3" /> View</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1"><Download className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  {d.verified
                    ? <Badge className="bg-income/10 text-income text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                    : <Badge className="bg-warning/10 text-warning text-[10px]">Pending</Badge>}
                </div>
              ))}
            </TabsContent>

            {/* Terms */}
            <TabsContent value="terms" className="mt-0">
              <TermsEditor value={terms} onChange={setTerms} />
            </TabsContent>

            {/* Approval / HPL / Checklist */}
            <TabsContent value="approval" className="mt-0 grid lg:grid-cols-2 gap-4">
              <SectionCard title="Approval Checklist" icon={CheckCircle2}>
                <div className="space-y-2">
                  {CHECKLIST_ITEMS.map(item => (
                    <label key={item} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={checklist[item]} onCheckedChange={v => setChecklist(p => ({ ...p, [item]: !!v }))} />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </SectionCard>
              <div className="space-y-4">
                <SectionCard title="HPL Number Assignment" icon={Bookmark}>
                  <div className="flex gap-2">
                    <Input placeholder="e.g. HPL 1042" value={hplNo} onChange={e => setHplNo(e.target.value.toUpperCase())} className="font-mono" />
                    <Button variant="outline" onClick={autoHpl} className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Auto</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Must be unique across the finance company.</p>
                </SectionCard>
                <SectionCard title="Notify Customer On Decision" icon={Bell}>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="flex items-center gap-2"><Checkbox checked={notify.app} onCheckedChange={v => setNotify(p => ({ ...p, app: !!v }))} /><Smartphone className="h-3.5 w-3.5" /> App Push</label>
                    <label className="flex items-center gap-2"><Checkbox checked={notify.sms} onCheckedChange={v => setNotify(p => ({ ...p, sms: !!v }))} /><MessageCircle className="h-3.5 w-3.5" /> SMS</label>
                    <label className="flex items-center gap-2"><Checkbox checked={notify.whatsapp} onCheckedChange={v => setNotify(p => ({ ...p, whatsapp: !!v }))} /><Phone className="h-3.5 w-3.5" /> WhatsApp</label>
                    <label className="flex items-center gap-2"><Checkbox checked={notify.email} onCheckedChange={v => setNotify(p => ({ ...p, email: !!v }))} /><Mail className="h-3.5 w-3.5" /> Email</label>
                  </div>
                </SectionCard>
              </div>
            </TabsContent>

            {/* Notes */}
            <TabsContent value="notes" className="mt-0">
              <SectionCard title="Internal Notes (Finance Staff Only)" icon={MessageCircle}>
                <div className="flex gap-2">
                  <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add internal remark, follow-up reminder, or @mention…" className="min-h-[80px]" />
                  <Button onClick={() => { if (!note.trim()) return; setNotes(p => [...p, { time: new Date().toLocaleString(), text: note }]); setNote(""); }}>Add</Button>
                </div>
                <div className="mt-4 space-y-2 max-h-72 overflow-auto">
                  {notes.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-4">No internal notes yet.</p>
                    : notes.map((n, i) => (
                      <div key={i} className="p-3 rounded-lg bg-secondary/40 border border-border">
                        <p className="text-[10px] text-muted-foreground">{n.time}</p>
                        <p className="text-sm text-foreground mt-1">{n.text}</p>
                      </div>
                    ))}
                </div>
              </SectionCard>
            </TabsContent>

            {/* Timeline */}
            <TabsContent value="timeline" className="mt-0">
              <div className="relative pl-6">
                <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
                {timeline.map((t, i) => (
                  <div key={i} className="relative pb-4">
                    <div className="absolute -left-4 top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                    <div className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{t.action}</p>
                        <span className="text-[10px] text-muted-foreground">{t.time}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">by {t.user}</p>
                      {t.remarks && <p className="text-xs text-foreground mt-1">{t.remarks}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer decision bar */}
        <DialogFooter className="px-6 py-3 border-t border-border bg-secondary/30 flex-row justify-between sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> {Object.values(checklist).filter(Boolean).length}/{CHECKLIST_ITEMS.length} checks done
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => doDecision("Hold")}><Clock className="h-4 w-4 mr-1.5" /> Hold</Button>
            <Button variant="outline" size="sm" onClick={() => { toast.info("Document request sent to customer app."); }}><Upload className="h-4 w-4 mr-1.5" /> Request Docs</Button>
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => doDecision("Rejected")}><XCircle className="h-4 w-4 mr-1.5" /> Reject</Button>
            <Button size="sm" className="bg-income hover:bg-income/90 text-white" onClick={() => doDecision("Approved")}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────── List Page ─────────────────────────────── */

const uniq = <K extends keyof LoanRequest>(k: K) => [...new Set(MOCK.map(m => String(m[k])))];

const initialFilters = {
  status: "" as "" | Status, period: "" as "" | "Today" | "Week" | "Month",
  agent: "", branch: "", vehicleType: "",
};

const PAGE = 10;

export default function LoanRequests() {
  const [rows, setRows] = useState<LoanRequest[]>(MOCK);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<keyof LoanRequest>("applicationDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading] = useState(false);
  const [active, setActive] = useState<LoanRequest | null>(null);

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    const now = new Date();
    return rows.filter(r => {
      const searchMatch = !t ||
        r.name.toLowerCase().includes(t) || r.mobile.includes(t) ||
        r.vehicleName.toLowerCase().includes(t) || r.vehicleNo.toLowerCase().includes(t) ||
        r.reqId.toLowerCase().includes(t) || (r.hplNo?.toLowerCase().includes(t) ?? false);
      if (!searchMatch) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.agent && r.agent !== filters.agent) return false;
      if (filters.branch && r.branch !== filters.branch) return false;
      if (filters.vehicleType && r.vehicleType !== filters.vehicleType) return false;
      if (filters.period) {
        const d = new Date(r.applicationDate);
        const diff = (now.getTime() - d.getTime()) / 86400000;
        if (filters.period === "Today" && diff > 1) return false;
        if (filters.period === "Week" && diff > 7) return false;
        if (filters.period === "Month" && diff > 31) return false;
      }
      return true;
    }).sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av! < bv! ? -1 : av! > bv! ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, searchTerm, filters, sortKey, sortDir]);

  const paged = filtered.slice((page - 1) * PAGE, page * PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const toggleSort = (k: keyof LoanRequest) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const toggleAll = () => {
    if (paged.every(r => selected.has(r.id))) {
      const s = new Set(selected); paged.forEach(r => s.delete(r.id)); setSelected(s);
    } else {
      const s = new Set(selected); paged.forEach(r => s.add(r.id)); setSelected(s);
    }
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s);
  };

  const clearFilters = () => { setFilters(initialFilters); setSearchTerm(""); setPage(1); };

  const updateReq = (id: string, patch: Partial<LoanRequest>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const bulkAction = (status: Status) => {
    if (selected.size === 0) return toast.error("Select at least one request");
    setRows(prev => prev.map(r => selected.has(r.id) ? { ...r, status } : r));
    toast.success(`${selected.size} request(s) marked ${status}`);
    setSelected(new Set());
  };

  const SortHead = ({ label, k, align = "left" }: { label: string; k: keyof LoanRequest; align?: "left" | "right" | "center" }) => (
    <th className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 text-${align} cursor-pointer select-none hover:text-foreground`}
      onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{label}
        {sortKey === k && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Loan Requests</h1>
          <p className="text-muted-foreground mt-1">Review, verify and process customer loan applications</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground mr-2">{selected.size} selected</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => bulkAction("Hold")}><Clock className="h-4 w-4" /> Hold</Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => bulkAction("Rejected")}><XCircle className="h-4 w-4" /> Reject</Button>
              <Button size="sm" className="gap-1.5 bg-income hover:bg-income/90 text-white" onClick={() => bulkAction("Approved")}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
              <div className="w-px h-6 bg-border mx-1" />
            </>
          )}
          <Button variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" size="sm" className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </motion.div>

      {/* KPIs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Pending", v: rows.filter(r => r.status === "Pending").length, c: "text-warning", i: Clock },
          { l: "Approved", v: rows.filter(r => r.status === "Approved").length, c: "text-income", i: CheckCircle2 },
          { l: "Rejected", v: rows.filter(r => r.status === "Rejected").length, c: "text-destructive", i: XCircle },
          { l: "Total Requested", v: inr(rows.reduce((s, r) => s + r.loanRequested, 0)), c: "text-primary", i: CreditCard },
        ].map(k => (
          <div key={k.l} className="dashboard-card flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg bg-secondary flex items-center justify-center ${k.c}`}><k.i className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className={`text-lg font-bold ${k.c}`}>{k.v}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Search + Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, mobile, HPL, vehicle, request ID…" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="gap-2">
              <Filter className="h-4 w-4" /> Filters {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={clearFilters}><RotateCcw className="h-4 w-4" /> Clear</Button>
          </div>
          <div className="flex items-center gap-1.5">
            {(["", "Today", "Week", "Month"] as const).map(p => (
              <button key={p || "all"} onClick={() => setFilters(f => ({ ...f, period: p }))}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${filters.period === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                {p || "All"}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <select className="input-field text-sm py-2" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value as any }))}>
                    <option value="">All</option><option>Pending</option><option>Approved</option><option>Rejected</option><option>Hold</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Agent</label>
                  <select className="input-field text-sm py-2" value={filters.agent} onChange={e => setFilters(f => ({ ...f, agent: e.target.value }))}>
                    <option value="">All Agents</option>
                    {uniq("agent").map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Branch</label>
                  <select className="input-field text-sm py-2" value={filters.branch} onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))}>
                    <option value="">All Branches</option>
                    {uniq("branch").map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Vehicle Type</label>
                  <select className="input-field text-sm py-2" value={filters.vehicleType} onChange={e => setFilters(f => ({ ...f, vehicleType: e.target.value }))}>
                    <option value="">All Types</option><option>Two Wheeler</option><option>Four Wheeler</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
        {loading && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-3 py-3 w-10">
                    <Checkbox checked={paged.length > 0 && paged.every(r => selected.has(r.id))} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 text-left">Customer</th>
                  <SortHead label="Mobile" k="mobile" />
                  <SortHead label="Vehicle" k="vehicleName" />
                  <SortHead label="Booking" k="bookingAmount" align="right" />
                  <SortHead label="Loan Amount" k="loanRequested" align="right" />
                  <SortHead label="Applied" k="applicationDate" />
                  <SortHead label="Visit" k="visitDate" />
                  <SortHead label="Status" k="status" align="center" />
                  <SortHead label="Agent" k="agent" />
                  <th className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r, i) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * i }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => setActive(r)}>
                      <div className="flex items-center gap-3">
                        <img src={r.photo} alt={r.name} className="h-9 w-9 rounded-full object-cover ring-1 ring-border" />
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-tight">{r.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{r.reqId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground" onClick={() => setActive(r)}>
                      <span className="flex items-center gap-1 font-mono text-xs"><Phone className="h-3 w-3" /> {r.mobile}</span>
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => setActive(r)}>
                      <p className="text-sm text-foreground">{r.vehicleName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{r.vehicleNo}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-income font-medium" onClick={() => setActive(r)}>{inr(r.bookingAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-primary" onClick={() => setActive(r)}>{inr(r.loanRequested)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground" onClick={() => setActive(r)}>{r.applicationDate}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground" onClick={() => setActive(r)}>{r.visitDate}</td>
                    <td className="px-4 py-3 text-center" onClick={() => setActive(r)}>
                      <Badge variant="outline" className={statusStyles[r.status]}>{r.status}</Badge>
                      {r.hplNo && <p className="text-[10px] font-mono text-primary mt-0.5">{r.hplNo}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground" onClick={() => setActive(r)}>{r.agent}</td>
                    <td className="px-4 py-3 text-center">
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setActive(r)}>
                        <Eye className="h-3 w-3" /> Review
                      </Button>
                    </td>
                  </motion.tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-12 text-sm text-muted-foreground">No loan requests match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-sm text-muted-foreground">Showing {paged.length} of {filtered.length} records</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </motion.div>

      {active && <DetailDialog req={active} onClose={() => setActive(null)} onUpdate={(patch) => updateReq(active.id, patch)} />}
    </div>
  );
}
