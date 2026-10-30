// import { useState, useEffect, useCallback } from "react";
// import {
//   Search, Filter, CalendarDays, CreditCard, Users, X,
//   Plus, TrendingUp, TrendingDown, DollarSign, Edit2, Trash2,
// } from "lucide-react";
// import { TransactionDialog, type TransactionFormData } from "../components/officeExpence/TransactionDialog";
// import { format } from "date-fns";
// import { cn } from "../components/lib/utils";
// import { Button } from "../components/ui/button";
// import { Input } from "../components/ui/input";
// import {
//   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
// } from "../components/ui/select";
// import {
//   Popover, PopoverContent, PopoverTrigger,
// } from "../components/ui/popover";
// import { Calendar } from "../components/ui/calendar";
// import {
//   Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
// } from "../components/ui/table";
// import { useCountUp } from "../hooks/useCountUp";
// import { toast } from "../hooks/use-toast";
// import {
//   AlertDialog, AlertDialogAction, AlertDialogCancel,
//   AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
//   AlertDialogHeader, AlertDialogTitle,
// } from "../components/ui/alert-dialog";

// const BASE_URL = import.meta.env.VITE_API_URL || "https://autofinex-desktop-api.rimio.in";

// const getHeaders = () => ({
//   "Content-Type": "application/json",
//   "finance-authorization": `Bearer ${localStorage.getItem("finance_token") || ""}`,
// });

// type TransactionType = "income" | "expense";

// interface Transaction {
//   id: number;
//   date: string;
//   category: string;
//   description: string;
//   amount: number;
//   type: TransactionType;
//   paymentMode: string;
//   enteredBy: string;
// }

// function SummaryCard({ title, amount, icon: Icon, variant }: {
//   title: string; amount: number; icon: React.ElementType; variant: "income" | "expense" | "profit";
// }) {
//   const animatedAmount = useCountUp(amount);
//   const colorMap = { income: "text-income", expense: "text-expense", profit: "text-primary" };
//   const bgMap = { income: "bg-income/10", expense: "bg-expense/10", profit: "bg-primary/10" };

//   return (
//     <div className="stat-card flex items-center gap-4">
//       <div className={cn("p-3 rounded-xl", bgMap[variant])}>
//         <Icon className={cn("w-6 h-6", colorMap[variant])} />
//       </div>
//       <div>
//         <p className="text-sm text-muted-foreground font-medium">{title}</p>
//         <p className={cn("text-2xl font-bold tracking-tight animate-count-up", colorMap[variant])}>
//           ₹{animatedAmount.toLocaleString("en-IN")}
//         </p>
//       </div>
//     </div>
//   );
// }

// const OfficeExpencePage = () => {
//   const [activeTab, setActiveTab] = useState<TransactionType | "all">("all");
//   const [search, setSearch] = useState("");
//   const [staffFilter, setStaffFilter] = useState("");
//   const [paymentModeFilter, setPaymentModeFilter] = useState("");
//   const [dateFrom, setDateFrom] = useState<Date>();
//   const [dateTo, setDateTo] = useState<Date>();
//   const [transactions, setTransactions] = useState<Transaction[]>([]);
//   const [staffList, setStaffList] = useState<string[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [dialogOpen, setDialogOpen] = useState(false);
//   const [editingTransaction, setEditingTransaction] = useState<TransactionFormData | null>(null);
//   const [deleteId, setDeleteId] = useState<number | null>(null);

//   // ── Fetch transactions ──────────────────────────────────────────────────────
//   const fetchTransactions = useCallback(async () => {
//     setLoading(true);
//     try {
//       const params = new URLSearchParams();
//       if (activeTab !== "all") params.set("type", activeTab);
//       if (search) params.set("search", search);
//       if (staffFilter) params.set("enteredBy", staffFilter);
//       if (paymentModeFilter) params.set("paymentMode", paymentModeFilter);
//       if (dateFrom) params.set("from", format(dateFrom, "yyyy-MM-dd"));
//       if (dateTo) params.set("to", format(dateTo, "yyyy-MM-dd"));

//       const res = await fetch(`${BASE_URL}/api/office-expenses?${params}`, {
//         headers: getHeaders(),
//       });
//       const json = await res.json();
//       if (json.success) {
//         setTransactions(json.data);
//       } else {
//         toast({ title: "Error", description: json.error, variant: "destructive" });
//       }
//     } catch {
//       toast({ title: "Network error", description: "Could not fetch transactions", variant: "destructive" });
//     } finally {
//       setLoading(false);
//     }
//   }, [activeTab, search, staffFilter, paymentModeFilter, dateFrom, dateTo]);

//   // ── Fetch staff list for filter dropdown ────────────────────────────────────
//   const fetchStaff = useCallback(async () => {
//     try {
//       const res = await fetch(`${BASE_URL}/api/office-expenses/staff`, { headers: getHeaders() });
//       const json = await res.json();
//       if (json.success) setStaffList(json.staff);
//     } catch { /* silent */ }
//   }, []);

//   useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
//   useEffect(() => { fetchStaff(); }, [fetchStaff]);

//   // ── Save (create or update) ─────────────────────────────────────────────────
//   const handleSave = async (data: TransactionFormData) => {
//     try {
//       const body = {
//         type: data.type,
//         date: format(data.date, "yyyy-MM-dd"),
//         category: data.category,
//         description: data.description,
//         amount: data.amount,
//         paymentMode: data.paymentMode,
//         enteredBy: data.enteredBy,
//       };

//       const url = data.id
//         ? `${BASE_URL}/api/office-expenses/${data.id}`
//         : `${BASE_URL}/api/office-expenses`;
//       const method = data.id ? "PUT" : "POST";

//       const res = await fetch(url, {
//         method,
//         headers: getHeaders(),
//         body: JSON.stringify(body),
//       });
//       const json = await res.json();

//       if (json.success) {
//         toast({ title: data.id ? "Transaction updated" : "Transaction added", variant: "default" });
//         fetchTransactions();
//         fetchStaff();
//       } else {
//         toast({ title: "Error", description: json.error, variant: "destructive" });
//       }
//     } catch {
//       toast({ title: "Network error", description: "Could not save transaction", variant: "destructive" });
//     }
//   };

//   // ── Delete ──────────────────────────────────────────────────────────────────
//   const handleDeleteConfirm = async () => {
//     if (!deleteId) return;
//     try {
//       const res = await fetch(`${BASE_URL}/api/office-expenses/${deleteId}`, {
//         method: "DELETE",
//         headers: getHeaders(),
//       });
//       const json = await res.json();
//       if (json.success) {
//         toast({ title: "Transaction deleted" });
//         setTransactions(prev => prev.filter(t => t.id !== deleteId));
//       } else {
//         toast({ title: "Error", description: json.error, variant: "destructive" });
//       }
//     } catch {
//       toast({ title: "Network error", description: "Could not delete transaction", variant: "destructive" });
//     } finally {
//       setDeleteId(null);
//     }
//   };

//   const handleEdit = (t: Transaction) => {
//     setEditingTransaction({
//       id: t.id, type: t.type, date: new Date(t.date), category: t.category,
//       description: t.description, amount: t.amount, paymentMode: t.paymentMode, enteredBy: t.enteredBy,
//     });
//     setDialogOpen(true);
//   };

//   const handleAdd = () => {
//     setEditingTransaction(null);
//     setDialogOpen(true);
//   };

//   const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
//   const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
//   const netProfit = totalIncome - totalExpense;

//   const clearFilters = () => {
//     setStaffFilter("");
//     setPaymentModeFilter("");
//     setDateFrom(undefined);
//     setDateTo(undefined);
//     setSearch("");
//     setActiveTab("all");
//   };

//   const hasFilters = staffFilter || paymentModeFilter || dateFrom || dateTo || search || activeTab !== "all";

//   return (
//     <div className="min-h-screen bg-background p-6 lg:p-8 overflow-auto">
//       <div className="max-w-[1400px] mx-auto space-y-6">
//         {/* Header */}
//         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
//           <div>
//             <h1 className="text-2xl font-bold text-foreground tracking-tight">Office Income &amp; Expense</h1>
//             <p className="text-sm text-muted-foreground mt-1">Manage and track all office transactions</p>
//           </div>
//           <div className="flex items-center gap-3">
//             {/* Toggle Buttons */}
//             <div className="flex bg-secondary rounded-lg p-1">
//               {(["all", "income", "expense"] as const).map((tab) => (
//                 <button
//                   key={tab}
//                   onClick={() => setActiveTab(tab)}
//                   className={cn(
//                     "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 capitalize",
//                     activeTab === tab
//                       ? "bg-primary text-primary-foreground shadow-sm"
//                       : "text-muted-foreground hover:text-foreground"
//                   )}
//                 >
//                   {tab === "all" ? "All" : tab}
//                 </button>
//               ))}
//             </div>
//             {/* Search */}
//             <div className="relative">
//               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
//               <Input
//                 placeholder="Search by category or description..."
//                 value={search}
//                 onChange={(e) => setSearch(e.target.value)}
//                 className="pl-10 w-[300px] bg-card border-border"
//               />
//             </div>
//           </div>
//         </div>

//         {/* Filters Row */}
//         <div className="dashboard-card !p-4">
//           <div className="flex flex-wrap items-center gap-3">
//             <div className="flex items-center gap-2 text-sm text-muted-foreground">
//               <Filter className="w-4 h-4" />
//               <span className="font-medium">Filters:</span>
//             </div>

//             <Select value={staffFilter} onValueChange={setStaffFilter}>
//               <SelectTrigger className="w-[160px] bg-background">
//                 <Users className="w-4 h-4 mr-2 text-muted-foreground" />
//                 <SelectValue placeholder="Entered By" />
//               </SelectTrigger>
//               <SelectContent>
//                 {staffList.map(s => (
//                   <SelectItem key={s} value={s}>{s}</SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>

//             <Popover>
//               <PopoverTrigger asChild>
//                 <Button variant="outline" className="bg-background gap-2">
//                   <CalendarDays className="w-4 h-4 text-muted-foreground" />
//                   {dateFrom ? format(dateFrom, "dd MMM") : "From"}
//                 </Button>
//               </PopoverTrigger>
//               <PopoverContent className="w-auto p-0" align="start">
//                 <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
//               </PopoverContent>
//             </Popover>

//             <Popover>
//               <PopoverTrigger asChild>
//                 <Button variant="outline" className="bg-background gap-2">
//                   <CalendarDays className="w-4 h-4 text-muted-foreground" />
//                   {dateTo ? format(dateTo, "dd MMM") : "To"}
//                 </Button>
//               </PopoverTrigger>
//               <PopoverContent className="w-auto p-0" align="start">
//                 <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
//               </PopoverContent>
//             </Popover>

//             <Select value={paymentModeFilter} onValueChange={setPaymentModeFilter}>
//               <SelectTrigger className="w-[160px] bg-background">
//                 <CreditCard className="w-4 h-4 mr-2 text-muted-foreground" />
//                 <SelectValue placeholder="Payment Mode" />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="Cash">Cash</SelectItem>
//                 <SelectItem value="UPI">UPI</SelectItem>
//                 <SelectItem value="Bank">Bank</SelectItem>
//               </SelectContent>
//             </Select>

//             {hasFilters && (
//               <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-destructive gap-1">
//                 <X className="w-4 h-4" /> Clear
//               </Button>
//             )}
//           </div>
//         </div>

//         {/* Summary Cards */}
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//           <SummaryCard title="Total Income" amount={totalIncome} icon={TrendingUp} variant="income" />
//           <SummaryCard title="Total Expense" amount={totalExpense} icon={TrendingDown} variant="expense" />
//           <SummaryCard title="Net Profit" amount={netProfit} icon={DollarSign} variant="profit" />
//         </div>

//         {/* Data Table */}
//         <div className="dashboard-card !p-0 overflow-hidden">
//           <Table>
//             <TableHeader>
//               <TableRow className="bg-secondary/50 hover:bg-secondary/50">
//                 <TableHead className="font-semibold">Date</TableHead>
//                 <TableHead className="font-semibold">Category</TableHead>
//                 <TableHead className="font-semibold">Description</TableHead>
//                 <TableHead className="font-semibold text-right">Amount</TableHead>
//                 <TableHead className="font-semibold">Payment Mode</TableHead>
//                 <TableHead className="font-semibold">Entered By</TableHead>
//                 <TableHead className="font-semibold text-center">Actions</TableHead>
//               </TableRow>
//             </TableHeader>
//             <TableBody>
//               {loading ? (
//                 <TableRow>
//                   <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
//                     Loading...
//                   </TableCell>
//                 </TableRow>
//               ) : transactions.length === 0 ? (
//                 <TableRow>
//                   <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
//                     No transactions found
//                   </TableCell>
//                 </TableRow>
//               ) : (
//                 transactions.map((t) => (
//                   <TableRow key={t.id} className="group hover:bg-secondary/30 transition-colors">
//                     <TableCell className="text-sm">{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
//                     <TableCell>
//                       <span className={cn(
//                         "text-xs font-medium px-2.5 py-1 rounded-full",
//                         t.type === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
//                       )}>
//                         {t.category}
//                       </span>
//                     </TableCell>
//                     <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{t.description}</TableCell>
//                     <TableCell className={cn("text-right font-semibold", t.type === "income" ? "text-income" : "text-expense")}>
//                       {t.type === "income" ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}
//                     </TableCell>
//                     <TableCell>
//                       <span className="text-xs bg-secondary px-2.5 py-1 rounded-full font-medium">{t.paymentMode}</span>
//                     </TableCell>
//                     <TableCell className="text-sm">{t.enteredBy}</TableCell>
//                     <TableCell>
//                       <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
//                         <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleEdit(t)}>
//                           <Edit2 className="w-4 h-4" />
//                         </Button>
//                         <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(t.id)}>
//                           <Trash2 className="w-4 h-4" />
//                         </Button>
//                       </div>
//                     </TableCell>
//                   </TableRow>
//                 ))
//               )}
//             </TableBody>
//           </Table>
//         </div>
//       </div>

//       {/* Floating Add Button */}
//       <button onClick={handleAdd} className="btn-floating">
//         <Plus className="w-6 h-6" />
//       </button>

//       <TransactionDialog
//         open={dialogOpen}
//         onOpenChange={setDialogOpen}
//         onSave={handleSave}
//         editData={editingTransaction}
//       />

//       {/* Delete Confirmation */}
//       <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
//             <AlertDialogDescription>
//               This action cannot be undone. The transaction will be permanently removed.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel>Cancel</AlertDialogCancel>
//             <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
//               Delete
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>
//     </div>
//   );
// };

// export default OfficeExpencePage;

import { useState, useEffect, useCallback } from "react";
import {
  Search, Filter, CalendarDays, CreditCard, Users, X,
  Plus, TrendingUp, TrendingDown, DollarSign, Edit2, Trash2,
} from "lucide-react";
import { TransactionDialog, type TransactionFormData } from "../components/officeExpence/TransactionDialog";
import { format } from "date-fns";
import { cn } from "../components/lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "../components/ui/popover";
import { Calendar } from "../components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { useCountUp } from "../hooks/useCountUp";
import { toast } from "../hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import axios from "axios";
import apiClient from "../api/apiClient";

// Use centralized apiClient
const api = apiClient;

type TransactionType = "income" | "expense";

interface Transaction {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  type: TransactionType;
  paymentMode: string;
  enteredBy: string;
}

function SummaryCard({ title, amount, icon: Icon, variant }: {
  title: string; amount: number; icon: React.ElementType; variant: "income" | "expense" | "profit";
}) {
  const animatedAmount = useCountUp(amount);
  const colorMap = { income: "text-income", expense: "text-expense", profit: "text-primary" };
  const bgMap = { income: "bg-income/10", expense: "bg-expense/10", profit: "bg-primary/10" };

  return (
    <div className="stat-card flex items-center gap-4">
      <div className={cn("p-3 rounded-xl", bgMap[variant])}>
        <Icon className={cn("w-6 h-6", colorMap[variant])} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <p className={cn("text-2xl font-bold tracking-tight animate-count-up", colorMap[variant])}>
          ₹{animatedAmount.toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}

const OfficeExpencePage = () => {
  const [activeTab, setActiveTab] = useState<TransactionType | "all">("all");
  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [paymentModeFilter, setPaymentModeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionFormData | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Fetch transactions ──────────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("type", activeTab);
      if (search) params.set("search", search);
      if (staffFilter) params.set("enteredBy", staffFilter);
      if (paymentModeFilter) params.set("paymentMode", paymentModeFilter);
      if (dateFrom) params.set("from", format(dateFrom, "yyyy-MM-dd"));
      if (dateTo) params.set("to", format(dateTo, "yyyy-MM-dd"));

      const response = await api.get(`/expenses?${params}`);

      if (response.data.success) {
        setTransactions(response.data.data);
      } else {
        toast({ title: "Error", description: response.data.error, variant: "destructive" });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        toast({
          title: "Error",
          description: error.response?.data?.error || "Could not fetch transactions",
          variant: "destructive"
        });
      } else {
        toast({ title: "Network error", description: "Could not fetch transactions", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, staffFilter, paymentModeFilter, dateFrom, dateTo]);

  // ── Fetch staff list for filter dropdown ────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    try {
      const response = await api.get("/expenses/staff");
      if (response.data.success) setStaffList(response.data.staff);
    } catch (error) {
      // silent fail for staff fetch
      console.error("Failed to fetch staff:", error);
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  // ── Save (create or update) ─────────────────────────────────────────────────
  const handleSave = async (data: TransactionFormData) => {
    try {
      const body = {
        type: data.type,
        date: format(data.date, "yyyy-MM-dd"),
        category: data.category,
        description: data.description,
        amount: data.amount,
        paymentMode: data.paymentMode,
        enteredBy: data.enteredBy,
      };

      let response;
      if (data.id) {
        // Update
        response = await api.put(`/expenses/${data.id}`, body);
      } else {
        // Create
        response = await api.post("/expenses", body);
      }

      if (response.data.success) {
        toast({
          title: data.id ? "Transaction updated" : "Transaction added",
          variant: "default"
        });
        await fetchTransactions();
        await fetchStaff();
      } else {
        toast({
          title: "Error",
          description: response.data.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        toast({
          title: "Error",
          description: error.response?.data?.error || "Could not save transaction",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Network error",
          description: "Could not save transaction",
          variant: "destructive"
        });
      }
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      const response = await api.delete(`/expenses/${deleteId}`);

      if (response.data.success) {
        toast({ title: "Transaction deleted" });
        setTransactions(prev => prev.filter(t => t.id !== deleteId));
      } else {
        toast({
          title: "Error",
          description: response.data.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        toast({
          title: "Error",
          description: error.response?.data?.error || "Could not delete transaction",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Network error",
          description: "Could not delete transaction",
          variant: "destructive"
        });
      }
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (t: Transaction) => {
    setEditingTransaction({
      id: t.id, type: t.type, date: new Date(t.date), category: t.category,
      description: t.description, amount: t.amount, paymentMode: t.paymentMode, enteredBy: t.enteredBy,
    });
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingTransaction(null);
    setDialogOpen(true);
  };

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const clearFilters = () => {
    setStaffFilter("");
    setPaymentModeFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearch("");
    setActiveTab("all");
  };

  const hasFilters = staffFilter || paymentModeFilter || dateFrom || dateTo || search || activeTab !== "all";

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8 overflow-auto">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Office Income &amp; Expense</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage and track all office transactions</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle Buttons */}
            <div className="flex bg-secondary rounded-lg p-1">
              {(["all", "income", "expense"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 capitalize",
                    activeTab === tab
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "all" ? "All" : tab}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by category or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-[300px] bg-card border-border"
              />
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="dashboard-card !p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters:</span>
            </div>

            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="w-[160px] bg-background">
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Entered By" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="bg-background gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  {dateFrom ? format(dateFrom, "dd MMM") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="bg-background gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  {dateTo ? format(dateTo, "dd MMM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Select value={paymentModeFilter} onValueChange={setPaymentModeFilter}>
              <SelectTrigger className="w-[160px] bg-background">
                <CreditCard className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Payment Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Bank">Bank</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-destructive gap-1">
                <X className="w-4 h-4" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard title="Total Income" amount={totalIncome} icon={TrendingUp} variant="income" />
          <SummaryCard title="Total Expense" amount={totalExpense} icon={TrendingDown} variant="expense" />
          <SummaryCard title="Net Profit" amount={netProfit} icon={DollarSign} variant="profit" />
        </div>

        {/* Data Table */}
        <div className="dashboard-card !p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Category</TableHead>
                <TableHead className="font-semibold">Description</TableHead>
                <TableHead className="font-semibold text-right">Amount</TableHead>
                <TableHead className="font-semibold">Payment Mode</TableHead>
                <TableHead className="font-semibold">Entered By</TableHead>
                <TableHead className="font-semibold text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((t) => (
                  <TableRow key={t.id} className="group hover:bg-secondary/30 transition-colors">
                    <TableCell className="text-sm">{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-xs font-medium px-2.5 py-1 rounded-full",
                        t.type === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
                      )}>
                        {t.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{t.description}</TableCell>
                    <TableCell className={cn("text-right font-semibold", t.type === "income" ? "text-income" : "text-expense")}>
                      {t.type === "income" ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs bg-secondary px-2.5 py-1 rounded-full font-medium">{t.paymentMode}</span>
                    </TableCell>
                    <TableCell className="text-sm">{t.enteredBy}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleEdit(t)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Floating Add Button */}
      <button onClick={handleAdd} className="btn-floating">
        <Plus className="w-6 h-6" />
      </button>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editData={editingTransaction}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The transaction will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OfficeExpencePage;