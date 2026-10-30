import { useState } from "react";
import { motion } from "framer-motion";
import {
  Phone, MessageSquare, UserPlus, MapPin, ExternalLink,
  Calendar, CreditCard, AlertTriangle, TrendingUp, Clock,
  Home, Navigation, Printer, BookOpen, CheckCircle, XCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  Customer, getRiskBadgeVariant, mockLocationHistory, mockPayments, mockLoans,
} from "./data/customerLocatorData";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

const paymentTrend = [
  { month: "Oct", amount: 8000 }, { month: "Nov", amount: 8000 },
  { month: "Dec", amount: 0 }, { month: "Jan", amount: 8000 },
  { month: "Feb", amount: 0 }, { month: "Mar", amount: 0 },
];

export function CustomerDeepView({ customer, open, onClose }: Props) {
  const [tab, setTab] = useState("overview");
  if (!customer) return null;

  const loan = mockLoans.find((l) => l.customerId === customer.id);
  const payments = mockPayments.filter((p) => loan && p.loanId === loan.id);
  const locations = mockLocationHistory.filter((l) => l.customerId === customer.id);
  const paidPct = loan ? Math.round((loan.paidAmount / loan.totalAmount) * 100) : 0;

  const openMaps = (lat: number, lng: number) =>
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");

  const riskBadgeCls = getRiskBadgeVariant(customer.riskLevel);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-xl">{customer.name}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">{customer.hplNumber} · {customer.vehicleNumber}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${riskBadgeCls}`}>
              {customer.riskLevel} · Score {customer.riskScore}
            </span>
          </div>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"><Phone className="h-3.5 w-3.5" />Call</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" />WhatsApp</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"><UserPlus className="h-3.5 w-3.5" />Assign Agent</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"><Navigation className="h-3.5 w-3.5" />Navigate</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" />Ledger</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"><Printer className="h-3.5 w-3.5" />Print</Button>
          </div>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="px-6 pt-4 pb-6">
          <TabsList className="grid grid-cols-5 w-full mb-4">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="location" className="text-xs">Location</TabsTrigger>
            <TabsTrigger value="payment" className="text-xs">Payment</TabsTrigger>
            <TabsTrigger value="loan" className="text-xs">Loan</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs">Risk</TabsTrigger>
          </TabsList>

          {/* TAB 1: Overview */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Phone", value: customer.phone, icon: Phone },
                { label: "Finance", value: customer.financeName, icon: CreditCard },
                { label: "Vehicle", value: customer.vehicleNumber, icon: MapPin },
                { label: "Distance", value: `${customer.distanceFromHome} KM`, icon: Navigation },
                { label: "Overdue", value: `₹${customer.overdueAmount.toLocaleString()}`, icon: AlertTriangle },
                { label: "Overdue Days", value: `${customer.overdueDays} days`, icon: Calendar },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                  <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-semibold text-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Home className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Home Address</p>
              </div>
              <p className="text-sm text-muted-foreground">{customer.homeAddress}</p>
              <p className="text-xs text-muted-foreground mt-1">Last seen at home: {customer.lastSeenHome}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Current Location</p>
              </div>
              <p className="text-sm text-muted-foreground">{customer.currentAddress}</p>
              <Button size="sm" variant="link" className="p-0 h-auto text-xs gap-1" onClick={() => openMaps(customer.currentLatitude, customer.currentLongitude)}>
                Open in Maps <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: Location History */}
          <TabsContent value="location" className="space-y-3">
            {(locations.length > 0 ? locations : mockLocationHistory).map((loc) => (
              <motion.div key={loc.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="flex gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => openMaps(loc.latitude, loc.longitude)}>
                <div className={`mt-1 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${loc.isHomeLocation ? "bg-green-100 text-green-600" : loc.distanceFromHome > 25 ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-700"}`}>
                  {loc.isHomeLocation ? <Home className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{loc.address}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{loc.timestamp}</span>
                    <span>{loc.distanceFromHome} KM</span>
                    {loc.durationStayed && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{loc.durationStayed}</span>}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </motion.div>
            ))}
          </TabsContent>

          {/* TAB 3: Payment */}
          <TabsContent value="payment" className="space-y-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={paymentTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Paid</TableHead>
                  <TableHead className="text-xs">Mode</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.dueDate}</TableCell>
                    <TableCell className="text-xs font-medium">₹{p.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{p.paymentDate || "-"}</TableCell>
                    <TableCell className="text-xs">{p.mode}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.status === "paid" ? "text-green-600" : p.status === "late" ? "text-yellow-600" : "text-red-600"}`}>
                        {p.status === "paid" ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {p.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          {/* TAB 4: Loan */}
          <TabsContent value="loan" className="space-y-4">
            {loan ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Loan", value: `₹${loan.totalAmount.toLocaleString()}` },
                    { label: "Paid", value: `₹${loan.paidAmount.toLocaleString()}` },
                    { label: "Pending", value: `₹${loan.pendingAmount.toLocaleString()}` },
                    { label: "EMI Amount", value: `₹${loan.emiAmount.toLocaleString()}` },
                    { label: "Interest Type", value: loan.interestType },
                    { label: "Next Due", value: loan.nextDueDate },
                    { label: "Overdue Days", value: `${loan.overdueDays} days` },
                    { label: "Penalty", value: `₹${loan.penaltyAmount.toLocaleString()}` },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-xl bg-muted/50 border border-border">
                      <p className="text-[11px] text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-xl border border-border bg-card">
                  <div className="flex justify-between mb-2">
                    <p className="text-sm font-medium">Repayment Progress</p>
                    <p className="text-sm font-bold text-primary">{paidPct}%</p>
                  </div>
                  <Progress value={paidPct} className="h-2" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No loan data available</p>
            )}
          </TabsContent>

          {/* TAB 5: Risk Analysis */}
          <TabsContent value="risk" className="space-y-4">
            <div className={`p-4 rounded-xl border-2 text-center ${riskBadgeCls}`}>
              <p className="text-sm font-medium mb-1">Combined Risk Score</p>
              <p className="text-4xl font-black">{customer.riskScore}</p>
              <p className="text-sm font-semibold capitalize mt-1">{customer.riskLevel} Risk</p>
            </div>
            {[
              { label: "Distance Risk (40%)", value: Math.min(customer.distanceFromHome / 50, 1) * 100, desc: `${customer.distanceFromHome} KM from home` },
              { label: "Payment Delay Risk (40%)", value: Math.min(customer.overdueDays / 90, 1) * 100, desc: `${customer.overdueDays} days overdue` },
              { label: "Dwell Time Risk (20%)", value: customer.riskScore > 60 ? 80 : 20, desc: customer.riskScore > 60 ? "Long stay away from home detected" : "Normal dwell patterns" },
            ].map((r) => (
              <div key={r.label} className="p-3 rounded-xl border border-border bg-card">
                <div className="flex justify-between mb-1.5">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-sm font-bold">{Math.round(r.value)}%</p>
                </div>
                <Progress value={r.value} className="h-1.5 mb-1" />
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
            ))}
            <div className="p-4 rounded-xl border border-border bg-muted/50">
              <p className="text-sm font-medium mb-2 flex items-center gap-2"><TrendingUp className="h-4 w-4" />Recommended Action</p>
              <p className="text-sm text-muted-foreground">
                {customer.riskScore > 80 ? "⚠️ Immediate field visit required. Assign senior agent and escalate to manager." :
                  customer.riskScore > 60 ? "🔶 Schedule field visit within 48 hours. Monitor movement closely." :
                    customer.riskScore > 30 ? "🟡 Monitor weekly. Send payment reminder via WhatsApp." :
                      "✅ No immediate action required. Continue standard follow-up."}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
