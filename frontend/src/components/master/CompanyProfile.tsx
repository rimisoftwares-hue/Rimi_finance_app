import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Building2, Phone, Mail, MapPin, Upload, Plus, Trash2, Star, Edit, Check, X,
  Users, CreditCard, TrendingUp, IndianRupee, Warehouse, Car, UserCheck,
  Shield, Calendar, Clock, Download, Printer, CheckCircle, XCircle,
  Loader2, AlertCircle, RefreshCw, Lock, ShieldAlert, ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { DatePicker } from "../ui/date-picker";
import { ImageUpload } from "../common/ImageUpload_DK";
import { AddFinanceDialog } from "./AddFinanceDialog";
import { useOwnerAuth } from "../../contexts/OwnerAuthContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { Textarea } from "../ui/textarea";


/* ── types ── */
interface BankAccount {
  id: string | number;
  bankName: string;
  branch: string;
  ifscCode: string;
  accountName: string;
  accountNumber: string;
  upiId: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface CompanyDataState {
  id: string;
  name: string;
  ownerName: string;
  phone: string[];
  email: string[];
  since: string;
  isActive: boolean;
  companyId: string;
  lastUpdated: string;
  logoUrl: string | null;
  printLogoUrl: string | null;
  // Address details
  houseNo: string;
  street: string;
  streetName: string;
  village: string;
  landmark: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  location: string;
  office_lat: number | null | string;
  office_lng: number | null | string;
  office_geofence_m: number | string;
}

interface KPIsState {
  total_customers: number;
  active_loans: number;
  closed_loans: number;
  monthly_collection: number;
  total_due: number;
  total_staff: number;
  total_agents: number;
  godowns_count: number;
  vehicles_financed: number;
  total_users: number;
}

/* ── Animated Counter ── */
function AnimatedNum({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cur = 0;
    const target = Number(value) || 0;
    if (target === 0) {
      setCount(0);
      return;
    }
    const inc = Math.max(1, target / 25);
    const t = setInterval(() => {
      cur += inc;
      if (cur >= target) {
        setCount(target);
        clearInterval(t);
      } else {
        setCount(Math.floor(cur));
      }
    }, 30);
    return () => clearInterval(t);
  }, [value]);
  return <>{count.toLocaleString("en-IN")}</>;
}

/* ── Profile Completion Formula ── */
function computeCompletion(companyData: CompanyDataState, banks: BankAccount[]) {
  let filled = 0;
  const total = 9;
  if (companyData.name?.trim()) filled++;
  if (companyData.ownerName?.trim()) filled++;
  if (companyData.city?.trim() || companyData.address?.trim()) filled++;
  if (companyData.phone && companyData.phone.length > 0 && companyData.phone[0]?.trim()) filled++;
  if (companyData.email && companyData.email.length > 0 && companyData.email[0]?.trim()) filled++;
  if (companyData.since) filled++;
  if (companyData.logoUrl) filled++;
  if (banks && banks.length > 0) filled++;
  if (banks && banks.some(b => b.isPrimary)) filled++;
  return Math.round((filled / total) * 100);
}

const colorMap: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  income: "bg-income/10 text-income",
  expense: "bg-expense/10 text-expense",
  pending: "bg-pending/10 text-pending",
};

/* ══════════════════════════════════════════════════ */
export default function CompanyProfile() {
  const navigate = useNavigate();
  const { owner, ownerLogout } = useOwnerAuth();
  const { user, currentFinance, refreshFinanceDetails, refreshFinanceList } = useAuth();

  // Strict Owner Access Verification
  const isOwner = Boolean(owner && (!user || user.role === 'owner'));
  const authenticatedOwnerId = owner?.id || (user?.role === 'owner' ? user.id : '') || '';
  const authenticatedOwnerName = owner?.username || (user?.role === 'owner' ? user.username : 'Owner');

  // Main Page State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingPrintLogo, setIsUploadingPrintLogo] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(!isOwner);

  // Modals state
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [showAddFinance, setShowAddFinance] = useState(false);
  const [showWebLogoDialog, setShowWebLogoDialog] = useState(false);
  const [showPrintLogoDialog, setShowPrintLogoDialog] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);

  // Forms state
  const [newBank, setNewBank] = useState<Partial<BankAccount>>({});
  const [tempWebLogoFile, setTempWebLogoFile] = useState<File | null>(null);
  const [tempPrintLogoFile, setTempPrintLogoFile] = useState<File | null>(null);

  // Dynamic Data
  const [companyData, setCompanyData] = useState<CompanyDataState>({
    id: "",
    name: "",
    ownerName: "",
    phone: [""],
    email: [""],
    since: "",
    isActive: true,
    companyId: "",
    lastUpdated: new Date().toISOString(),
    logoUrl: null,
    printLogoUrl: null,
    houseNo: "",
    street: "",
    streetName: "",
    village: "",
    landmark: "",
    address: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    location: "",
    office_lat: null,
    office_lng: null,
    office_geofence_m: 200,
  });

  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [kpis, setKpis] = useState<KPIsState>({
    total_customers: 0,
    active_loans: 0,
    closed_loans: 0,
    monthly_collection: 0,
    total_due: 0,
    total_staff: 0,
    total_agents: 0,
    godowns_count: 0,
    vehicles_financed: 0,
    total_users: 0,
  });

  const [customerGrowth, setCustomerGrowth] = useState<{ month: string; customers: number }[]>([]);
  const [collectionTrend, setCollectionTrend] = useState<{ month: string; amount: number }[]>([]);

  // Auth Headers helper (handled automatically by apiClient)
  const getAuthHeaders = useCallback(() => ({}), []);

  // Fetch Company Data from Backend
  const fetchProfileData = useCallback(async () => {
    if (!isOwner) {
      setAccessDenied(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.get('/finance/profile');

      if (response.data?.success && response.data?.finance) {
        const f = response.data.finance;

        setCompanyData({
          id: String(f.id || ""),
          name: f.finance_name || "",
          ownerName: f.owner_name || authenticatedOwnerName,
          phone: Array.isArray(f.phone_numbers) && f.phone_numbers.length > 0 ? f.phone_numbers : [""],
          email: Array.isArray(f.emails) && f.emails.length > 0 ? f.emails : [""],
          since: f.since ? String(f.since) : (f.established_date ? String(f.established_date).split("T")[0] : ""),
          isActive: f.is_active === 1 || f.is_active === true,
          companyId: f.id ? `FIN-${String(f.id).slice(0, 8).toUpperCase()}` : "",
          lastUpdated: f.updated_at || f.created_at || new Date().toISOString(),
          logoUrl: f.logo_url || f.finance_photo || null,
          printLogoUrl: f.print_logo_url || null,
          houseNo: f.house_no || "",
          street: f.street || "",
          streetName: f.street_name || "",
          village: f.village || "",
          landmark: f.land_mark || "",
          address: f.address || "",
          city: f.city || "",
          district: f.district || "",
          state: f.state || "",
          pincode: f.pincode || "",
          location: f.location || "",
          office_lat: f.office_lat !== undefined && f.office_lat !== null ? f.office_lat : "",
          office_lng: f.office_lng !== undefined && f.office_lng !== null ? f.office_lng : "",
          office_geofence_m: f.office_geofence_m !== undefined && f.office_geofence_m !== null ? f.office_geofence_m : 200,
        });

        if (Array.isArray(f.banks)) {
          setBanks(f.banks.map((b: any) => ({
            id: b.id,
            bankName: b.bank_name,
            branch: b.branch || "",
            ifscCode: b.ifsc_code,
            accountName: b.account_name,
            accountNumber: b.account_number,
            upiId: b.upi_id || "",
            isPrimary: Boolean(b.is_primary),
            isActive: Boolean(b.is_active),
          })));
        }

        if (f.kpis) {
          setKpis({
            total_customers: Number(f.kpis.total_customers) || 0,
            active_loans: Number(f.kpis.active_loans) || 0,
            closed_loans: Number(f.kpis.closed_loans) || 0,
            monthly_collection: Number(f.kpis.monthly_collection) || 0,
            total_due: Number(f.kpis.total_due) || 0,
            total_staff: Number(f.kpis.total_staff) || 0,
            total_agents: Number(f.kpis.total_agents) || 0,
            godowns_count: Number(f.kpis.godowns_count) || 0,
            vehicles_financed: Number(f.kpis.vehicles_financed) || 0,
            total_users: Number(f.kpis.total_users) || 0,
          });
        }

        if (Array.isArray(f.customer_growth)) {
          setCustomerGrowth(f.customer_growth.map((cg: any) => ({
            month: cg.month,
            customers: Number(cg.customers) || 0,
          })));
        }

        if (Array.isArray(f.collection_trend)) {
          setCollectionTrend(f.collection_trend.map((ct: any) => ({
            month: ct.month,
            amount: Number(ct.amount) || 0,
          })));
        }
      }
    } catch (err: any) {
      console.error("Error fetching company profile:", err);
      if (err?.response?.status === 403) {
        setAccessDenied(true);
        toast.error("Access denied. Owner authorization required.");
      } else {
        toast.error(err?.response?.data?.error || "Failed to load company profile data");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isOwner, getAuthHeaders, authenticatedOwnerName]);

  useEffect(() => {
    refreshFinanceList();
  }, [refreshFinanceList]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData, currentFinance?.id]);

  // Profile completion calculation
  const profileCompletion = useMemo(() => computeCompletion(companyData, banks), [companyData, banks]);

  // Form helpers for dynamic phones & emails
  const addPhoneField = () => setCompanyData(prev => ({ ...prev, phone: [...prev.phone, ""] }));
  const removePhoneField = (index: number) => {
    setCompanyData(prev => {
      const p = [...prev.phone];
      p.splice(index, 1);
      return { ...prev, phone: p.length ? p : [""] };
    });
  };
  const updatePhone = (index: number, val: string) => {
    setCompanyData(prev => {
      const p = [...prev.phone];
      p[index] = val;
      return { ...prev, phone: p };
    });
  };

  const addEmailField = () => setCompanyData(prev => ({ ...prev, email: [...prev.email, ""] }));
  const removeEmailField = (index: number) => {
    setCompanyData(prev => {
      const e = [...prev.email];
      e.splice(index, 1);
      return { ...prev, email: e.length ? e : [""] };
    });
  };
  const updateEmailField = (index: number, val: string) => {
    setCompanyData(prev => {
      const e = [...prev.email];
      e[index] = val;
      return { ...prev, email: e };
    });
  };

  // ─── SAVE COMPANY INFORMATION ───
  const handleSaveCompanyProfile = async () => {
    if (!companyData.name.trim()) {
      toast.error("Company name cannot be empty");
      return;
    }

    const validPhones = companyData.phone.filter(p => p.trim());
    if (validPhones.length === 0) {
      toast.error("Please provide at least one phone number");
      return;
    }

    setIsSaving(true);
    try {
      const headers = getAuthHeaders();
      const payload = {
        finance_name: companyData.name.trim(),
        phone_numbers: validPhones,
        emails: companyData.email.filter(e => e.trim()),
        since: companyData.since,
        is_active: companyData.isActive,
        house_no: companyData.houseNo,
        street: companyData.street,
        street_name: companyData.streetName,
        village: companyData.village,
        landmark: companyData.landmark,
        address: companyData.address,
        city: companyData.city,
        district: companyData.district,
        state: companyData.state,
        pincode: companyData.pincode,
        location: companyData.location,
        office_lat: companyData.office_lat !== "" && companyData.office_lat !== null ? Number(companyData.office_lat) : null,
        office_lng: companyData.office_lng !== "" && companyData.office_lng !== null ? Number(companyData.office_lng) : null,
        office_geofence_m: companyData.office_geofence_m ? parseInt(String(companyData.office_geofence_m), 10) : 200,
      };

      const res = await apiClient.put('/finance/profile', payload);

      if (res.data?.success) {
        toast.success("Company profile updated successfully!");
        setIsEditing(false);
        await refreshFinanceDetails();
      } else {
        toast.error(res.data?.error || "Failed to update profile");
      }
    } catch (err: any) {
      console.error("Save company error:", err);
      toast.error(err?.response?.data?.error || err.message || "Failed to save company profile");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── LOGO UPLOADS ───
  const handleUploadWebLogo = async () => {
    if (!tempWebLogoFile) return;
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", tempWebLogoFile);
      formData.append("asset_type", "web_logo");

      const res = await apiClient.post('/finance/logos/upload?type=web_logo', formData);

      if (res.data?.success) {
        toast.success("Finance logo updated successfully!");
        setCompanyData(prev => ({ ...prev, logoUrl: res.data.fileUrl }));
        setShowWebLogoDialog(false);
        setTempWebLogoFile(null);
        await refreshFinanceDetails();
      } else {
        toast.error(res.data?.error || "Failed to upload logo");
      }
    } catch (err: any) {
      console.error("Logo upload error:", err);
      toast.error(err?.response?.data?.error || "Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleUploadPrintLogo = async () => {
    if (!tempPrintLogoFile) return;
    setIsUploadingPrintLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", tempPrintLogoFile);
      formData.append("asset_type", "print_logo");

      const res = await apiClient.post('/finance/logos/upload?type=print_logo', formData);

      if (res.data?.success) {
        toast.success("Official print logo updated successfully!");
        setCompanyData(prev => ({ ...prev, printLogoUrl: res.data.fileUrl }));
        setShowPrintLogoDialog(false);
        setTempPrintLogoFile(null);
      } else {
        toast.error(res.data?.error || "Failed to upload print logo");
      }
    } catch (err: any) {
      console.error("Print logo upload error:", err);
      toast.error(err?.response?.data?.error || "Failed to upload print logo");
    } finally {
      setIsUploadingPrintLogo(false);
    }
  };

  // ─── BANK ACCOUNT ACTIONS ───
  const handleAddBank = async () => {
    if (!newBank.bankName?.trim() || !newBank.accountNumber?.trim() || !newBank.ifscCode?.trim()) {
      toast.error("Bank name, account number, and IFSC code are required");
      return;
    }

    try {
      const headers = getAuthHeaders();
      const payload = {
        bank_name: newBank.bankName.trim(),
        branch: newBank.branch?.trim() || "",
        ifsc_code: newBank.ifscCode.trim().toUpperCase(),
        account_name: newBank.accountName?.trim() || companyData.name,
        account_number: newBank.accountNumber.trim(),
        upi_id: newBank.upiId?.trim() || "",
        is_primary: banks.length === 0,
      };

      const res = await apiClient.post('/finance/banks', payload);
      if (res.data?.success && res.data?.bank) {
        toast.success("Bank account added successfully!");
        const b = res.data.bank;
        setBanks(prev => [
          ...prev,
          {
            id: b.id,
            bankName: b.bank_name,
            branch: b.branch || "",
            ifscCode: b.ifsc_code,
            accountName: b.account_name,
            accountNumber: b.account_number,
            upiId: b.upi_id || "",
            isPrimary: Boolean(b.is_primary),
            isActive: Boolean(b.is_active),
          }
        ]);
        setNewBank({});
        setShowBankDialog(false);
      }
    } catch (err: any) {
      console.error("Add bank error:", err);
      toast.error(err?.response?.data?.error || "Failed to add bank account");
    }
  };

  const handleSaveEditBank = async () => {
    if (!editingBank) return;
    try {
      const payload = {
        bank_name: editingBank.bankName.trim(),
        branch: editingBank.branch?.trim() || "",
        ifsc_code: editingBank.ifscCode.trim().toUpperCase(),
        account_name: editingBank.accountName.trim(),
        account_number: editingBank.accountNumber.trim(),
        upiId: editingBank.upiId?.trim() || "",
      };

      const res = await apiClient.put(`/finance/banks/${editingBank.id}`, payload);
      if (res.data?.success) {
        toast.success("Bank account updated successfully!");
        setBanks(prev => prev.map(b => b.id === editingBank.id ? editingBank : b));
        setEditingBank(null);
      }
    } catch (err: any) {
      console.error("Edit bank error:", err);
      toast.error(err?.response?.data?.error || "Failed to update bank account");
    }
  };

  const handleSetPrimaryBank = async (id: string | number) => {
    try {
      const res = await apiClient.patch(`/finance/banks/${id}/primary`, {});
      if (res.data?.success) {
        toast.success("Primary bank account updated!");
        setBanks(prev => prev.map(b => ({
          ...b,
          isPrimary: String(b.id) === String(id),
          isActive: String(b.id) === String(id) ? true : b.isActive
        })));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to set primary bank");
    }
  };

  const handleToggleBankActive = async (id: string | number) => {
    try {
      const target = banks.find(b => String(b.id) === String(id));
      if (!target) return;

      const res = await apiClient.patch(`/finance/banks/${id}/status`, { is_active: !target.isActive });
      if (res.data?.success) {
        setBanks(prev => prev.map(b => String(b.id) === String(id) ? { ...b, isActive: !b.isActive } : b));
        toast.success(res.data.message || "Bank status updated");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update bank status");
    }
  };

  const handleDeleteBank = async (id: string | number) => {
    if (!window.confirm("Are you sure you want to delete this bank account?")) return;
    try {
      const res = await apiClient.delete(`/finance/banks/${id}`);
      if (res.data?.success) {
        toast.success("Bank account deleted successfully!");
        setBanks(prev => prev.filter(b => String(b.id) !== String(id)));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete bank account");
    }
  };

  // ─── EXPORT & PRINT ───
  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    try {
      const exportObject = {
        company: companyData,
        bankAccounts: banks,
        kpiSummary: kpis,
        exportedAt: new Date().toISOString(),
        exportedBy: authenticatedOwnerName,
      };
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${companyData.name.replace(/\s+/g, "_") || "company"}_profile_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Company profile export generated");
    } catch (e) {
      toast.error("Failed to generate export");
    }
  };

  const formattedFullAddress = useMemo(() => {
    const parts = [
      companyData.houseNo,
      companyData.street,
      companyData.streetName,
      companyData.village,
      companyData.landmark ? `Near ${companyData.landmark}` : null,
      companyData.city,
      companyData.district,
      companyData.state,
      companyData.pincode,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : (companyData.address || "Address not provided");
  }, [companyData]);

  // Quick actions items
  const quickActions = [
    { label: "Add Staff", icon: UserCheck, href: "/agents/location" },
    { label: "Add Agent", icon: Shield, href: "/agents/location" },
    { label: "Add Customer", icon: Users, href: "/collections/pending" },
    { label: "Add Loan", icon: CreditCard, href: "/loans" },
  ];

  // ─── OWNER-ONLY SECURITY GUARD UI ───
  if (accessDenied || !isOwner) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-card rounded-2xl border border-destructive/30 shadow-2xl p-6 sm:p-8 text-center space-y-5"
        >
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto border border-destructive/20 shadow-inner">
            <ShieldAlert className="h-8 w-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <Badge variant="destructive" className="px-3 py-1 text-xs uppercase tracking-wider">
              Owner Security Protocol Active
            </Badge>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Master Company Access Restricted
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This Master Company Profile and bank management terminal is strictly restricted to account <strong className="text-foreground">Owners</strong>.
              Your current authenticated session does not possess Owner privileges.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-muted/60 border border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>Your Session: <strong className="text-foreground">{user?.username || "Guest"}</strong></span>
            <Badge variant="outline" className="text-[11px] font-mono capitalize">
              Role: {user?.role || "Non-owner"}
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/dashboard")}
            >
              Back to Dashboard
            </Button>
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/owner-login")}
            >
              <Lock className="h-4 w-4 mr-2" /> Owner Login
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── LOADING STATE ───
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading company profile and bank records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Gradient Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden shadow-lg"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="px-6 py-8 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-5">
            {/* Logo Avatar */}
            <div className="relative group cursor-pointer" onClick={() => setShowWebLogoDialog(true)}>
              <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center shadow-lg overflow-hidden">
                {companyData.logoUrl ? (
                  <img src={companyData.logoUrl} alt={companyData.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-card flex items-center justify-center">
                    <span className="text-3xl font-bold text-primary">
                      {companyData.name ? companyData.name.charAt(0).toUpperCase() : "F"}
                    </span>
                  </div>
                )}
              </div>
              <div
                className="absolute -bottom-1 -right-1 rounded-full p-1.5 bg-card shadow border border-border group-hover:scale-110 transition-transform"
                title="Change Logo"
              >
                <Edit className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>

            {/* Info */}
            <div className="text-primary-foreground space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="text-2xl lg:text-3xl font-bold">{companyData.name || "Untitled Finance"}</h1>
                <Badge variant={companyData.isActive ? "default" : "destructive"} className="text-xs">
                  {companyData.isActive ? <><CheckCircle className="h-3 w-3 mr-1" />Active</> : <><XCircle className="h-3 w-3 mr-1" />Inactive</>}
                </Badge>
                <Badge variant="outline" className="text-xs bg-white/10 text-primary-foreground border-white/30">
                  <Shield className="h-3 w-3 mr-1" /> Owner Verified
                </Badge>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm opacity-90 pt-1">
                {companyData.phone[0] && (
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{companyData.phone[0]}</span>
                )}
                {companyData.email[0] && (
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{companyData.email[0]}</span>
                )}
                {companyData.since && (
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Since {companyData.since}</span>
                )}
              </div>

              <p className="text-xs opacity-70 pt-1">
                Owner: <strong className="text-white">{companyData.ownerName}</strong> • {companyData.companyId} • Last updated: {new Date(companyData.lastUpdated).toLocaleDateString("en-IN")}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-primary-foreground border-white/30 hover:bg-white/30 backdrop-blur-sm shadow-sm"
              onClick={() => setShowAddFinance(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" /> New Finance
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-primary-foreground border-white/30 hover:bg-white/30 backdrop-blur-sm shadow-sm"
              onClick={() => {
                if (isEditing) {
                  handleSaveCompanyProfile();
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={isSaving}
            >
              {isSaving ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</>
              ) : isEditing ? (
                <><Check className="h-4 w-4 mr-1.5" /> Save Changes</>
              ) : (
                <><Edit className="h-4 w-4 mr-1.5" /> Edit Profile</>
              )}
            </Button>
            {isEditing && (
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={() => {
                  setIsEditing(false);
                  fetchProfileData();
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-primary-foreground border-white/30 hover:bg-white/30 backdrop-blur-sm shadow-sm"
              onClick={handleExport}
            >
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-primary-foreground border-white/30 hover:bg-white/30 backdrop-blur-sm shadow-sm"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            {/* Refresh Button */}
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-primary-foreground border-white/30 hover:bg-white/30 backdrop-blur-sm shadow-sm flex items-center gap-1.5"
              onClick={fetchProfileData}
              disabled={isLoading}
              title="Refresh Current Profile"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden md:inline font-medium text-xs">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Profile Completion Bar */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-primary-foreground/80 font-medium">Profile Completion</span>
            <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${profileCompletion}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-white/90"
              />
            </div>
            <span className="text-xs font-bold text-primary-foreground">{profileCompletion}%</span>
          </div>
        </div>
      </motion.div>

      {/* ─── 8 KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: "Total Customers", value: kpis.total_customers, icon: Users, color: "primary", href: "/customers" },
          { title: "Active Loans", value: kpis.active_loans, icon: CreditCard, color: "income", href: "/loans" },
          { title: "Monthly Collection", value: `₹${(kpis.monthly_collection / 100000).toFixed(1)}L`, icon: IndianRupee, color: "income", href: "/reports/collection" },
          { title: "Total Due", value: `₹${(kpis.total_due / 100000).toFixed(1)}L`, icon: TrendingUp, color: "expense", href: "/reports/due-analysis" },
          { title: "Total Staff", value: kpis.total_staff, icon: UserCheck, color: "primary", href: "/AgentManagement" },
          { title: "Total Agents", value: kpis.total_agents, icon: Shield, color: "pending", href: "/AgentManagement" },
          { title: "Godowns", value: kpis.godowns_count, icon: Warehouse, color: "primary", href: "/collections/godown" },
          { title: "Vehicles Financed", value: kpis.vehicles_financed, icon: Car, color: "income", href: "/vehicle" },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -3 }}
            onClick={() => navigate(kpi.href)}
            className="cursor-pointer"
          >
            <Card className="overflow-hidden border-t-2 border-t-primary/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{kpi.title}</p>
                  <p className="text-xl font-bold text-foreground">
                    {typeof kpi.value === "number" ? <AnimatedNum value={kpi.value} /> : kpi.value}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl ${colorMap[kpi.color]}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ─── Main Content Grid: Company Details + Logos & Actions ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Details (Span 2) */}
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Company Information
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {isEditing ? "Editing Mode" : "Read Only View"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Finance Company Name *</Label>
                {isEditing ? (
                  <Input
                    value={companyData.name}
                    onChange={e => setCompanyData({ ...companyData, name: e.target.value })}
                    placeholder="Company Legal Name"
                  />
                ) : (
                  <p className="text-sm font-semibold text-foreground">{companyData.name || "-"}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Account Owner Name</Label>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 pt-1">
                  <Shield className="h-3.5 w-3.5 text-primary" /> {companyData.ownerName}
                </p>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Registered Office Address</Label>
              {isEditing ? (
                <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px]">Building/Door No</Label>
                      <Input
                        value={companyData.houseNo}
                        onChange={e => setCompanyData({ ...companyData, houseNo: e.target.value })}
                        placeholder="e.g. 45"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Street</Label>
                      <Input
                        value={companyData.street}
                        onChange={e => setCompanyData({ ...companyData, street: e.target.value })}
                        placeholder="e.g. 2nd Floor"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Street Name</Label>
                      <Input
                        value={companyData.streetName}
                        onChange={e => setCompanyData({ ...companyData, streetName: e.target.value })}
                        placeholder="e.g. Oppanakara St"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Village / Area</Label>
                      <Input
                        value={companyData.village}
                        onChange={e => setCompanyData({ ...companyData, village: e.target.value })}
                        placeholder="e.g. Town Hall"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Landmark</Label>
                      <Input
                        value={companyData.landmark}
                        onChange={e => setCompanyData({ ...companyData, landmark: e.target.value })}
                        placeholder="e.g. Near Clock Tower"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[11px]">City</Label>
                      <Input
                        value={companyData.city}
                        onChange={e => setCompanyData({ ...companyData, city: e.target.value })}
                        placeholder="City"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">District</Label>
                      <Input
                        value={companyData.district}
                        onChange={e => setCompanyData({ ...companyData, district: e.target.value })}
                        placeholder="District"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">State</Label>
                      <Input
                        value={companyData.state}
                        onChange={e => setCompanyData({ ...companyData, state: e.target.value })}
                        placeholder="State"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Pincode</Label>
                      <Input
                        value={companyData.pincode}
                        onChange={e => setCompanyData({ ...companyData, pincode: e.target.value })}
                        placeholder="641001"
                        maxLength={6}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-dashed border-border/60">
                    <div>
                      <Label className="text-[11px]">Office Latitude</Label>
                      <Input
                        value={companyData.office_lat ?? ""}
                        onChange={e => setCompanyData({ ...companyData, office_lat: e.target.value })}
                        placeholder="e.g. 11.0168445"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Office Longitude</Label>
                      <Input
                        value={companyData.office_lng ?? ""}
                        onChange={e => setCompanyData({ ...companyData, office_lng: e.target.value })}
                        placeholder="e.g. 76.9558321"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Geofence (Meters)</Label>
                      <Input
                        type="number"
                        value={companyData.office_geofence_m ?? 200}
                        onChange={e => setCompanyData({ ...companyData, office_geofence_m: e.target.value })}
                        placeholder="200"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground flex items-start gap-1.5 pt-0.5">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    {formattedFullAddress}
                  </p>
                  {companyData.office_lat && companyData.office_lng && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 ml-5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        Office GPS: {Number(companyData.office_lat).toFixed(6)}, {Number(companyData.office_lng).toFixed(6)} (Geofence: {companyData.office_geofence_m || 200}m)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Phone Numbers & Emails */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Official Phone Numbers *</Label>
                  {isEditing && (
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] text-primary p-0" onClick={addPhoneField}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    {companyData.phone.map((ph, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={ph}
                          onChange={e => updatePhone(idx, e.target.value)}
                          placeholder="+91 98765 43210"
                          className="h-8 text-xs"
                        />
                        {companyData.phone.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removePhoneField(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {companyData.phone.map((p, i) => (
                      <p key={i} className="text-sm text-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {p || "-"}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Official Email Addresses</Label>
                  {isEditing && (
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] text-primary p-0" onClick={addEmailField}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    {companyData.email.map((em, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={em}
                          onChange={e => updateEmailField(idx, e.target.value)}
                          placeholder="accounts@finance.com"
                          className="h-8 text-xs"
                        />
                        {companyData.email.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeEmailField(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {companyData.email.map((e, i) => (
                      <p key={i} className="text-sm text-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {e || "-"}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Status & Established Date */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">Operational Status</Label>
                {isEditing ? (
                  <Switch
                    checked={companyData.isActive}
                    onCheckedChange={v => setCompanyData({ ...companyData, isActive: v })}
                  />
                ) : null}
                <Badge variant={companyData.isActive ? "default" : "secondary"} className="text-xs">
                  {companyData.isActive ? "Active Operations" : "Inactive / Suspended"}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Established Since:</Label>
                {isEditing ? (
                  <DatePicker
                    value={companyData.since}
                    onValueChange={val => setCompanyData({ ...companyData, since: val })}
                    placeholder="Pick established date"
                    className="w-44 h-8 text-xs"
                    max={new Date()}
                  />
                ) : (
                  <span className="text-xs font-semibold text-foreground">
                    {companyData.since ? companyData.since : "Not specified"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logos & Quick Actions Column */}
        <div className="space-y-6">
          {/* Branding Logos Card */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Branding Assets</span>
                <Badge variant="outline" className="text-[10px] font-mono">S3 Cloud Storage</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Web Logo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Finance Web Logo (1:1)</Label>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-6 p-0 text-xs text-primary"
                    onClick={() => setShowWebLogoDialog(true)}
                  >
                    Change Logo
                  </Button>
                </div>
                <div
                  onClick={() => setShowWebLogoDialog(true)}
                  className="w-full aspect-video border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 bg-muted/20 transition-all overflow-hidden relative group"
                >
                  {companyData.logoUrl ? (
                    <>
                      <img src={companyData.logoUrl} alt="Finance Logo" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-medium gap-1">
                        <Edit className="h-3.5 w-3.5" /> Click to Replace
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold text-primary-foreground shadow" style={{ background: "var(--gradient-primary)" }}>
                        {companyData.name ? companyData.name.charAt(0).toUpperCase() : "F"}
                      </div>
                      <span className="text-xs text-muted-foreground">Upload brand logo</span>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Printing Logo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Official Printing Logo (Receipts/Bills)</Label>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-6 p-0 text-xs text-primary"
                    onClick={() => setShowPrintLogoDialog(true)}
                  >
                    Change Logo
                  </Button>
                </div>
                <div
                  onClick={() => setShowPrintLogoDialog(true)}
                  className="w-full aspect-video border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 bg-muted/20 transition-all overflow-hidden relative group"
                >
                  {companyData.printLogoUrl ? (
                    <>
                      <img src={companyData.printLogoUrl} alt="Printing Logo" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-medium gap-1">
                        <Edit className="h-3.5 w-3.5" /> Click to Replace
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload official receipt logo</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {quickActions.map(qa => (
                <Button
                  key={qa.label}
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2 h-auto py-3 border-border hover:bg-primary/5"
                  onClick={() => navigate(qa.href)}
                >
                  <qa.icon className="h-4 w-4 text-primary" />
                  <span className="text-xs">{qa.label}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Bank Accounts Management Table ─── */}
      <Card className="shadow-sm border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Company Collection Bank Accounts
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configured bank accounts for receiving customer payments, EMI deposits, and disbursements.
            </p>
          </div>
          <Dialog open={showBankDialog} onOpenChange={setShowBankDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" /> Add Bank Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Company Bank Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name *</Label>
                  <Input
                    placeholder="e.g. State Bank of India, HDFC Bank"
                    value={newBank.bankName || ""}
                    onChange={e => setNewBank({ ...newBank, bankName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Branch</Label>
                    <Input
                      placeholder="e.g. Main Branch"
                      value={newBank.branch || ""}
                      onChange={e => setNewBank({ ...newBank, branch: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">IFSC Code *</Label>
                    <Input
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      value={newBank.ifscCode || ""}
                      onChange={e => setNewBank({ ...newBank, ifscCode: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Holder Name *</Label>
                  <Input
                    placeholder="Defaults to Finance Name"
                    value={newBank.accountName || ""}
                    onChange={e => setNewBank({ ...newBank, accountName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number *</Label>
                  <Input
                    placeholder="e.g. 50100987654321"
                    value={newBank.accountNumber || ""}
                    onChange={e => setNewBank({ ...newBank, accountNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UPI ID (Optional)</Label>
                  <Input
                    placeholder="e.g. abcdfinance@okhdfc"
                    value={newBank.upiId || ""}
                    onChange={e => setNewBank({ ...newBank, upiId: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddBank} className="w-full mt-2">
                  Save Bank Account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Bank Name</TableHead>
                <TableHead className="text-xs">Branch</TableHead>
                <TableHead className="text-xs">IFSC Code</TableHead>
                <TableHead className="text-xs">Account Number</TableHead>
                <TableHead className="text-xs">UPI ID</TableHead>
                <TableHead className="text-xs text-center">Primary</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    No bank accounts configured yet. Click "Add Bank Account" to configure your primary deposit account.
                  </TableCell>
                </TableRow>
              ) : (
                banks.map(bank => (
                  <TableRow
                    key={bank.id}
                    className={`${!bank.isActive ? "opacity-50" : ""} ${bank.isPrimary ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    <TableCell className="text-sm font-semibold text-foreground">
                      {bank.bankName}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{bank.branch || "-"}</TableCell>
                    <TableCell className="text-xs font-mono font-medium">{bank.ifscCode}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs text-muted-foreground">{bank.accountName}</p>
                        <p className="text-sm font-mono text-foreground font-medium">{bank.accountNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{bank.upiId || "-"}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={bank.isPrimary ? "default" : "ghost"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleSetPrimaryBank(bank.id)}
                        title={bank.isPrimary ? "Primary Account" : "Click to make Primary"}
                      >
                        <Star className={`h-3.5 w-3.5 ${bank.isPrimary ? "fill-current" : ""}`} />
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={bank.isActive}
                        onCheckedChange={() => handleToggleBankActive(bank.id)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditingBank({ ...bank })}
                          title="Edit"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteBank(bank.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Bank Dialog */}
      <Dialog open={!!editingBank} onOpenChange={open => !open && setEditingBank(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bank Account</DialogTitle>
          </DialogHeader>
          {editingBank && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Bank Name</Label>
                <Input
                  value={editingBank.bankName}
                  onChange={e => setEditingBank({ ...editingBank, bankName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Branch</Label>
                  <Input
                    value={editingBank.branch}
                    onChange={e => setEditingBank({ ...editingBank, branch: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    value={editingBank.ifscCode}
                    onChange={e => setEditingBank({ ...editingBank, ifscCode: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Account Holder Name</Label>
                <Input
                  value={editingBank.accountName}
                  onChange={e => setEditingBank({ ...editingBank, accountName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Account Number</Label>
                <Input
                  value={editingBank.accountNumber}
                  onChange={e => setEditingBank({ ...editingBank, accountNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">UPI ID</Label>
                <Input
                  value={editingBank.upiId}
                  onChange={e => setEditingBank({ ...editingBank, upiId: e.target.value })}
                />
              </div>
              <Button onClick={handleSaveEditBank} className="w-full mt-2">
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Stats & Real-Time Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats Panel */}
        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Company Stats Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Total Registered Users", value: kpis.total_users },
              { label: "Staff Members", value: kpis.total_staff },
              { label: "Field Collection Agents", value: kpis.total_agents },
              { label: "Active Godowns", value: kpis.godowns_count },
              { label: "Total Customers", value: kpis.total_customers },
              { label: "Total Loans Issued", value: kpis.active_loans + kpis.closed_loans },
              { label: "Closed / Completed Loans", value: kpis.closed_loans },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className="text-sm font-bold text-foreground">{s.value.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Customer Growth AreaChart */}
        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Customer Growth Trend</span>
              <span className="text-xs text-muted-foreground font-normal">Past 6 Months</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={customerGrowth}>
                <defs>
                  <linearGradient id="cgFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="customers" stroke="hsl(var(--primary))" fill="url(#cgFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Collection Trend BarChart */}
        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Collection Trend (₹ Lakhs)</span>
              <span className="text-xs text-muted-foreground font-normal">Past 6 Months</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(val: any) => [`₹${val} Lakhs`, "Collection"]}
                />
                <Bar dataKey="amount" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ─── Web Logo Upload Dialog ─── */}
      <Dialog open={showWebLogoDialog} onOpenChange={setShowWebLogoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Finance Web Logo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <ImageUpload
              label="Select & Crop Web Logo (1:1 Aspect Ratio)"
              value={tempWebLogoFile}
              onChange={f => setTempWebLogoFile(f instanceof File ? f : null)}
              enableCrop={true}
              aspectRatio={1}
              existingUrl={companyData.logoUrl || undefined}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowWebLogoDialog(false)}>Cancel</Button>
              <Button onClick={handleUploadWebLogo} disabled={isUploadingLogo || !tempWebLogoFile}>
                {isUploadingLogo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : "Save Logo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Print Logo Upload Dialog ─── */}
      <Dialog open={showPrintLogoDialog} onOpenChange={setShowPrintLogoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Official Printing Logo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <ImageUpload
              label="Select & Crop Printing Logo (Receipt / Letterhead)"
              value={tempPrintLogoFile}
              onChange={f => setTempPrintLogoFile(f instanceof File ? f : null)}
              enableCrop={true}
              aspectRatio={1}
              existingUrl={companyData.printLogoUrl || undefined}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPrintLogoDialog(false)}>Cancel</Button>
              <Button onClick={handleUploadPrintLogo} disabled={isUploadingPrintLogo || !tempPrintLogoFile}>
                {isUploadingPrintLogo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : "Save Print Logo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add New Finance Dialog ─── */}
      <AddFinanceDialog
        open={showAddFinance}
        onOpenChange={setShowAddFinance}
        authenticatedOwnerId={authenticatedOwnerId}
        authenticatedOwnerName={authenticatedOwnerName}
        onCreated={async () => {
          await refreshFinanceList();
          await fetchProfileData();
        }}
      />
    </div>
  );
}
