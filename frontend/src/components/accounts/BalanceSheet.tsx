import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Scale, Loader2 } from "lucide-react";
import { DrillLink, DrillAmount } from "../lib/accounting/DrillDown";
import { DatePicker } from "../ui/date-picker";
import { Label } from "../ui/label";
import { useAuth } from "../../contexts/AuthContext";
import { fetchBalanceSheet } from "../../api/balanceSheetApi";
import type { BalanceSheetData, BalanceSheetGroup } from "../../types/balanceSheet";

function getTodayDate() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function SideTable({
  title,
  groups,
  total,
  colorClass,
  nature,
  loading,
}: {
  title: string;
  groups: BalanceSheetGroup[];
  total: number;
  colorClass: string;
  nature: string;
  loading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card p-0 overflow-hidden">
      <div className={`px-4 py-3 ${colorClass} border-b border-border`}>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div>
        {loading && groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
            Loading {title.toLowerCase()}...
          </div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No {title.toLowerCase()} records found as of this date
          </div>
        ) : (
          groups.map(group => (
            <div key={group.group}>
              <div className="px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <DrillLink level={{
                  kind: "group", name: group.group, nature,
                  ledgers: group.items
                    .filter(i => i.drillable !== false)
                    .map(i => ({ name: i.name, debit: nature === "Assets" ? i.amount : 0, credit: nature !== "Assets" ? i.amount : 0 })),
                }}>{group.group}</DrillLink>
              </div>
              {group.items.map(item => (
                <div key={item.name} className="flex justify-between px-4 py-2.5 border-b border-border/30 hover:bg-secondary/20 transition-colors">
                  {item.drillable !== false ? (
                    <DrillLink level={{ kind: "ledger", name: item.name, opening: item.amount }} className="text-sm text-foreground">{item.name}</DrillLink>
                  ) : (
                    <span className="text-sm text-foreground font-medium">{item.name}</span>
                  )}
                  {item.drillable !== false ? (
                    <DrillAmount value={item.amount} level={{ kind: "ledger", name: item.name, opening: item.amount }} className={`text-sm font-medium ${item.amount < 0 ? "text-expense" : "text-foreground"}`} />
                  ) : (
                    <span className={`text-sm font-medium ${item.amount < 0 ? "text-expense" : "text-foreground"}`}>
                      {item.amount < 0 ? `-₹${Math.abs(item.amount).toLocaleString()}` : `₹${item.amount.toLocaleString()}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
        <div className="flex justify-between px-4 py-3 bg-secondary/50 font-bold">
          <span className="text-sm text-foreground">Total</span>
          <span className="text-sm text-foreground">₹{total.toLocaleString()}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function BalanceSheet() {
  const { currentFinance } = useAuth();
  const today = useMemo(() => getTodayDate(), []);
  const [asOfDate, setAsOfDate] = useState(today);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchBalanceSheet({ as_of_date: asOfDate }, controller.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("fetchBalanceSheet error:", err);
        setError(err?.response?.data?.message || err?.message || "Failed to load Balance Sheet");
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [currentFinance?.id, asOfDate]);

  const liabilities = data?.liabilities || [];
  const assets = data?.assets || [];
  const totalLiabilities = data?.totalLiabilities ?? 0;
  const totalAssets = data?.totalAssets ?? 0;
  const isBalanced = data?.isBalanced ?? (totalLiabilities === totalAssets);
  const difference = data?.difference ?? Math.abs(totalLiabilities - totalAssets);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Balance Sheet</h1>
          <p className="text-muted-foreground mt-1">
            As on {asOfDate} · Click any group / ledger / amount to drill down
          </p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${isBalanced ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
          <Scale className="h-4 w-4" />
          {isBalanced ? "✔ Balanced" : `✖ Mismatch (Diff: ₹${difference.toLocaleString()})`}
        </div>
      </motion.div>

      {/* As on Date filter bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dashboard-card !p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">As on Date</Label>
          <DatePicker
            value={asOfDate}
            onChange={(e) => setAsOfDate(e?.target?.value || e)}
            placeholder="As on Date"
            className="min-w-[160px] w-auto"
          />
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Updating...</span>
          </div>
        )}
      </motion.div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Side-by-side Liabilities & Assets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SideTable title="Liabilities" groups={liabilities} total={totalLiabilities} colorClass="bg-primary/5" nature="Liabilities" loading={loading} />
        <SideTable title="Assets" groups={assets} total={totalAssets} colorClass="bg-income/5" nature="Assets" loading={loading} />
      </div>
    </div>
  );
}
