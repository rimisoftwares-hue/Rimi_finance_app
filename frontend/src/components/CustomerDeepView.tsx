import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Phone, MessageSquare, UserPlus, MapPin, ExternalLink,
  Calendar, CreditCard, AlertTriangle, TrendingUp, Clock,
  Home, Navigation, Printer, BookOpen, CheckCircle, XCircle, RefreshCw,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { getRiskBadgeVariant } from "./data/customerLocatorData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  fetchCustomerDeepView, getRiskErrorMessage, isRiskCustomerId,
  CustomerDeepViewResponse, CreditBand, RiskLevel, RiskPhone,
} from "../api/riskApi";

/**
 * Minimal customer info needed to open the deep view. Real customers (Alerts) pass a
 * UUID id and the sheet loads live data; the mock locator screens (LiveMap / Track)
 * still pass numeric ids, for which no live profile exists yet.
 */
export interface DeepViewCustomerSeed {
  id: string | number;
  name: string;
  hplNumber?: string;
  vehicleNumber?: string;
  riskLevel?: RiskLevel;
}

interface Props {
  customer: DeepViewCustomerSeed | null;
  open: boolean;
  onClose: () => void;
}

const formatINR = (value: number | null | undefined) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const creditBandClass = (band: CreditBand) => {
  switch (band) {
    case "Excellent": return "bg-green-500/15 text-green-700 border-green-300";
    case "Good": return "bg-emerald-500/15 text-emerald-700 border-emerald-300";
    case "Fair": return "bg-yellow-500/15 text-yellow-700 border-yellow-300";
    case "Poor": return "bg-red-500/15 text-red-700 border-red-300";
  }
};

const phoneLabel = (phone: RiskPhone, index: number) => {
  if (index === 0) return "Primary";
  if (phone.contactType === "guardian") return "Guardian";
  if (phone.type === "work") return "Work";
  return "Customer";
};

const recommendedAction = (level: RiskLevel) => {
  switch (level) {
    case "critical": return "⚠️ Immediate field visit required. Assign senior agent and escalate to manager.";
    case "high": return "🔶 Schedule field visit within 48 hours. Monitor movement closely.";
    case "warning": return "🟡 Monitor weekly. Send payment reminder via WhatsApp.";
    case "safe": return "✅ No immediate action required. Continue standard follow-up.";
  }
};

export function CustomerDeepView({ customer, open, onClose }: Props) {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<CustomerDeepViewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const customerId = customer?.id;
  const isLive = isRiskCustomerId(customerId);

  useEffect(() => {
    if (!open || !isRiskCustomerId(customerId)) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetchCustomerDeepView(customerId, controller.signal)
      .then((res) => setData(res))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getRiskErrorMessage(err, "Failed to load customer details"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, customerId, reloadKey]);

  if (!customer) return null;

  const c = data?.customer;
  const loan = data?.loan ?? null;
  const risk = data?.risk;
  const monthlyPayments = data?.monthlyPayments ?? [];
  const locations = data?.locationHistory ?? [];
  const paidPct = loan && loan.totalLoan > 0 ? Math.min(100, Math.round((loan.paidAmount / loan.totalLoan) * 100)) : 0;
  const overdueDays = loan?.overdueDays ?? 0;

  const openMaps = (lat: number | null | undefined, lng: number | null | undefined) => {
    if (lat == null || lng == null) return;
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  const riskLevel: RiskLevel | undefined = risk?.riskLevel ?? customer.riskLevel;
  const riskBadgeCls = riskLevel ? getRiskBadgeVariant(riskLevel) : "";
  const hplLabel = c ? (c.hplno !== null ? `HPL ${c.hplno}` : "—") : (customer.hplNumber ?? "—");
  const vehicleLabel = c ? (c.vehicleNumber ?? "—") : (customer.vehicleNumber ?? "—");

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-xl">{c?.name ?? customer.name}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">{hplLabel} · {vehicleLabel}</p>
            </div>
            {riskLevel && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${riskBadgeCls}`}>
                {riskLevel}{risk ? ` · Due Risk ${risk.dueRiskScore}` : ""}
              </span>
            )}
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

        {!isLive ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            Live risk profile is not available for this customer yet.
          </div>
        ) : loading ? (
          <div className="px-6 pt-4 pb-6 space-y-4">
            <Skeleton className="h-9 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw className="h-3.5 w-3.5" />Retry
            </Button>
          </div>
        ) : c && risk ? (
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
                  { label: "Phone", value: c.phone ?? "—", icon: Phone },
                  { label: "Finance", value: c.financeName, icon: CreditCard },
                  { label: "Vehicle", value: c.vehicleNumber ?? "—", icon: MapPin },
                  { label: "Distance", value: c.distanceFromHome != null ? `${c.distanceFromHome} KM` : "—", icon: Navigation },
                  { label: "Overdue", value: formatINR(loan?.overdueAmount), icon: AlertTriangle },
                  { label: "Overdue Days", value: `${overdueDays} days`, icon: Calendar },
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
                <p className="text-sm text-muted-foreground">{c.homeAddress ?? "Address not available"}</p>
                {c.currentLocation.lastSeenHome && (
                  <p className="text-xs text-muted-foreground mt-1">Last seen at home: {c.currentLocation.lastSeenHome}</p>
                )}
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-medium text-foreground mb-2">Registered Contact Numbers</p>
                  {c.allPhones.length > 0 ? (
                    <div className="space-y-1.5">
                      {c.allPhones.map((p, i) => (
                        <div key={`${p.number}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground">
                            {phoneLabel(p, i)}
                          </span>
                          <a href={`tel:${p.number}`} className="flex items-center gap-1.5 font-medium text-primary hover:underline">
                            <Phone className="h-3 w-3" />{p.number}
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No contact numbers registered</p>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Current Location</p>
                </div>
                <p className="text-sm text-muted-foreground">{c.currentLocation.address}</p>
                {c.currentLocation.latitude != null && c.currentLocation.longitude != null && (
                  <Button size="sm" variant="link" className="p-0 h-auto text-xs gap-1" onClick={() => openMaps(c.currentLocation.latitude, c.currentLocation.longitude)}>
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* TAB 2: Location History */}
            <TabsContent value="location" className="space-y-3">
              {locations.length > 0 ? (
                locations.map((loc) => (
                  <motion.div key={loc.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => openMaps(loc.latitude, loc.longitude)}>
                    <div className={`mt-1 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${loc.isHomeLocation ? "bg-green-100 text-green-600" : (loc.distanceFromHome ?? 0) > 25 ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-700"}`}>
                      {loc.isHomeLocation ? <Home className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{loc.address}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{loc.timestamp}</span>
                        {loc.distanceFromHome != null && <span>{loc.distanceFromHome} KM</span>}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </motion.div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No live GPS history reported for this customer yet</p>
              )}
            </TabsContent>

            {/* TAB 3: Payment */}
            <TabsContent value="payment" className="space-y-4">
              {monthlyPayments.length > 0 ? (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyPayments}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="monthLabel" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip formatter={(v) => [formatINR(Number(v)), "Total Paid"]} />
                        <Bar dataKey="totalPaid" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Month</TableHead>
                        <TableHead className="text-xs">Installments</TableHead>
                        <TableHead className="text-xs">Penalty</TableHead>
                        <TableHead className="text-xs">Total Paid</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyPayments.map((p) => (
                        <TableRow key={p.monthKey}>
                          <TableCell className="text-xs">{p.monthLabel}</TableCell>
                          <TableCell className="text-xs">{p.paymentCount}</TableCell>
                          <TableCell className="text-xs">{formatINR(p.totalPenalty)}</TableCell>
                          <TableCell className="text-xs font-medium">{formatINR(p.totalPaid)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium capitalize ${p.status === "paid" ? "text-green-600" : p.status === "late" ? "text-yellow-600" : "text-red-600"}`}>
                              {p.status === "paid" ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {p.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No payments recorded yet</p>
              )}
            </TabsContent>

            {/* TAB 4: Loan */}
            <TabsContent value="loan" className="space-y-4">
              {loan ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Total Loan", value: formatINR(loan.totalLoan) },
                      { label: "Paid", value: formatINR(loan.paidAmount) },
                      { label: "Pending", value: formatINR(loan.pendingAmount) },
                      { label: "EMI Amount", value: formatINR(loan.emiAmount) },
                      { label: "Interest Rate", value: loan.interestLabel ?? "—" },
                      { label: "Next Due", value: loan.nextDueDate ?? "—" },
                      { label: "Overdue Days", value: `${loan.overdueDays} days` },
                      { label: "Penalty", value: formatINR(loan.penaltyAmount) },
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
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-4 rounded-xl border-2 text-center ${creditBandClass(risk.creditBand)}`}>
                  <p className="text-sm font-medium mb-1">Credit Score</p>
                  <p className="text-4xl font-black">{risk.creditScore}<span className="text-base font-semibold opacity-70">/100</span></p>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-bold border ${creditBandClass(risk.creditBand)}`}>
                    {risk.creditBand}
                  </span>
                </div>
                <div className={`p-4 rounded-xl border-2 text-center ${riskBadgeCls}`}>
                  <p className="text-sm font-medium mb-1">Due Risk</p>
                  <p className="text-4xl font-black">{risk.dueRiskScore}<span className="text-base font-semibold opacity-70">/100</span></p>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${riskBadgeCls}`}>
                    {risk.riskLevel}
                  </span>
                </div>
              </div>
              {[
                { label: "Due Delay Risk", value: risk.breakdown.dueDelayRisk, desc: `${overdueDays} days overdue` },
                {
                  label: "Credit Vulnerability",
                  value: risk.breakdown.creditScoreRisk,
                  desc: `On-time payments ${Math.round(risk.metrics.onTimePaymentRatio * 100)}% · Broken promises ${risk.metrics.brokenPromises} · Seizure ${risk.metrics.seizureHistory ? "Yes" : "No"}`,
                },
                {
                  label: "Location Distance Risk",
                  value: risk.breakdown.distanceRisk,
                  desc: c.distanceFromHome != null ? `${c.distanceFromHome} KM from home` : "Live GPS not reported",
                },
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
                <p className="text-sm text-muted-foreground">{recommendedAction(risk.riskLevel)}</p>
              </div>
            </TabsContent>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
