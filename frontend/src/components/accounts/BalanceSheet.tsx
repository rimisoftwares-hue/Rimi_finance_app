import { motion } from "framer-motion";
import { Scale } from "lucide-react";
import { DrillLink, DrillAmount } from "../lib/accounting/DrillDown";

const liabilities = [
  { group: "Capital & Reserves", items: [{ name: "Capital Account", amount: 3500000 }, { name: "Reserves & Surplus", amount: 299000 }] },
  { group: "Long-term Borrowings", items: [{ name: "Loan from Bank", amount: 1500000 }] },
  { group: "Current Liabilities", items: [{ name: "Sundry Creditors", amount: 315000 }, { name: "Outstanding Expenses", amount: 85000 }, { name: "Provisions", amount: 45000 }] },
];

const assets = [
  { group: "Fixed Assets", items: [{ name: "Furniture & Fixtures", amount: 125000 }, { name: "Office Equipment", amount: 85000 }, { name: "Less: Depreciation", amount: -28000 }] },
  { group: "Investments", items: [{ name: "Loan Portfolio (Net)", amount: 4850000 }] },
  { group: "Current Assets", items: [{ name: "Cash in Hand", amount: 285000 }, { name: "Bank Balance", amount: 1250000 }, { name: "Interest Receivable", amount: 122000 }, { name: "Advance & Deposits", amount: 55000 }] },
];

const totalLiabilities = liabilities.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.amount, 0), 0);
const totalAssets = assets.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.amount, 0), 0);

function SideTable({ title, groups, total, colorClass, nature }: { title: string; groups: typeof liabilities; total: number; colorClass: string; nature: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card p-0 overflow-hidden">
      <div className={`px-4 py-3 ${colorClass} border-b border-border`}>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div>
        {groups.map(group => (
          <div key={group.group}>
            <div className="px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <DrillLink level={{
                kind: "group", name: group.group, nature,
                ledgers: group.items.map(i => ({ name: i.name, debit: nature === "Assets" ? i.amount : 0, credit: nature !== "Assets" ? i.amount : 0 })),
              }}>{group.group}</DrillLink>
            </div>
            {group.items.map(item => (
              <div key={item.name} className="flex justify-between px-4 py-2.5 border-b border-border/30 hover:bg-secondary/20 transition-colors">
                <DrillLink level={{ kind: "ledger", name: item.name, opening: item.amount }} className="text-sm text-foreground">{item.name}</DrillLink>
                <DrillAmount value={item.amount} level={{ kind: "ledger", name: item.name, opening: item.amount }} className={`text-sm font-medium ${item.amount < 0 ? "text-expense" : "text-foreground"}`} />
              </div>
            ))}
          </div>
        ))}
        <div className="flex justify-between px-4 py-3 bg-secondary/50 font-bold">
          <span className="text-sm text-foreground">Total</span>
          <span className="text-sm text-foreground">₹{total.toLocaleString()}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function BalanceSheet() {
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Balance Sheet</h1>
          <p className="text-muted-foreground mt-1">As on February 26, 2025 · Click any group / ledger / amount to drill down</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${totalLiabilities === totalAssets ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
          <Scale className="h-4 w-4" />
          {totalLiabilities === totalAssets ? "✔ Balanced" : "✖ Mismatch"}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SideTable title="Liabilities" groups={liabilities} total={totalLiabilities} colorClass="bg-primary/5" nature="Liabilities" />
        <SideTable title="Assets" groups={assets} total={totalAssets} colorClass="bg-income/5" nature="Assets" />
      </div>
    </div>
  );
}
