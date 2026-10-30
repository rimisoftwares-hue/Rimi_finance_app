import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { DrillLink, DrillAmount } from "../lib/accounting/DrillDown";

const expenses = [
  { name: "Salary & Wages", amount: 360000 },
  { name: "Rent & Utilities", amount: 325000 },
  { name: "Office Expenses", amount: 95000 },
  { name: "Insurance Premium", amount: 42000 },
  { name: "Depreciation", amount: 28000 },
  { name: "Bad Debts Written Off", amount: 65000 },
  { name: "Professional Fees", amount: 35000 },
  { name: "Miscellaneous", amount: 18000 },
];

const incomes = [
  { name: "Interest Income", amount: 680000 },
  { name: "Penalty & Late Fee", amount: 245000 },
  { name: "Document Charges", amount: 180000 },
  { name: "Seizing Charges Recovery", amount: 85000 },
  { name: "Processing Fee", amount: 62000 },
  { name: "Miscellaneous Income", amount: 15000 },
];

const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
const totalIncome = incomes.reduce((s, r) => s + r.amount, 0);
const grossProfit = totalIncome - totalExpense;
const marginPct = ((grossProfit / totalIncome) * 100).toFixed(1);

export default function ProfitLoss() {
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Profit & Loss Statement</h1>
        <p className="text-muted-foreground mt-1">For the period ending February 2025 · Click any ledger / amount to drill down</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="dashboard-card border-t-4 border-t-expense">
          <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-4 w-4 text-expense" /><p className="text-sm text-muted-foreground">Total Expenses</p></div>
          <p className="text-2xl font-bold text-expense">₹{totalExpense.toLocaleString()}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card border-t-4 border-t-income">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-income" /><p className="text-sm text-muted-foreground">Total Income</p></div>
          <p className="text-2xl font-bold text-income">₹{totalIncome.toLocaleString()}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="dashboard-card border-t-4 border-t-income">
          <p className="text-sm text-muted-foreground mb-1">Net Profit</p>
          <p className={`text-2xl font-bold ${grossProfit > 0 ? "text-income" : "text-expense"}`}>₹{grossProfit.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Margin: {marginPct}%</p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-expense/5 border-b border-border">
            <DrillLink level={{ kind: "group", name: "Expenses", nature: "Expense", ledgers: expenses.map(e => ({ name: e.name, debit: e.amount, credit: 0 })) }} className="text-base font-semibold text-foreground">Expenses</DrillLink>
          </div>
          <table className="w-full">
            <tbody>
              {expenses.map((item) => (
                <tr key={item.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm"><DrillLink level={{ kind: "ledger", name: item.name }} className="text-foreground">{item.name}</DrillLink></td>
                  <td className="px-4 py-3 text-sm text-right font-medium"><DrillAmount value={item.amount} level={{ kind: "ledger", name: item.name }} className="text-expense" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-secondary/50 font-bold"><td className="px-4 py-3 text-sm text-foreground">Total Expenses</td><td className="px-4 py-3 text-sm text-right text-expense">₹{totalExpense.toLocaleString()}</td></tr></tfoot>
          </table>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="dashboard-card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-income/5 border-b border-border">
            <DrillLink level={{ kind: "group", name: "Income", nature: "Income", ledgers: incomes.map(e => ({ name: e.name, debit: 0, credit: e.amount })) }} className="text-base font-semibold text-foreground">Income</DrillLink>
          </div>
          <table className="w-full">
            <tbody>
              {incomes.map((item) => (
                <tr key={item.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm"><DrillLink level={{ kind: "ledger", name: item.name }} className="text-foreground">{item.name}</DrillLink></td>
                  <td className="px-4 py-3 text-sm text-right font-medium"><DrillAmount value={item.amount} level={{ kind: "ledger", name: item.name }} className="text-income" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-secondary/50 font-bold"><td className="px-4 py-3 text-sm text-foreground">Total Income</td><td className="px-4 py-3 text-sm text-right text-income">₹{totalIncome.toLocaleString()}</td></tr></tfoot>
          </table>
        </motion.div>
      </div>
    </div>
  );
}
