import { motion } from "framer-motion";
import { ArrowUpRight, Clock, IndianRupee, AlertTriangle, CheckCircle } from "lucide-react";

const activities = [
  { id: 1, type: "payment", message: "Payment of ₹15,000 received from Rajesh Kumar", time: "2 min ago", icon: IndianRupee },
  { id: 2, type: "overdue", message: "Loan OWN-0042 overdue by 15 days", time: "15 min ago", icon: AlertTriangle },
  { id: 3, type: "closed", message: "Loan FR-0018 closed successfully", time: "1 hr ago", icon: CheckCircle },
  { id: 4, type: "payment", message: "Payment of ₹8,500 received from Suresh Babu", time: "2 hrs ago", icon: IndianRupee },
  { id: 5, type: "overdue", message: "3 loans crossing 60-day due threshold", time: "3 hrs ago", icon: AlertTriangle },
];

const typeStyles: Record<string, string> = {
  payment: "bg-income/10 text-income",
  overdue: "bg-expense/10 text-expense",
  closed: "bg-primary/10 text-primary",
};

import { useNavigate } from "react-router-dom";

export function RecentActivity() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="dashboard-card"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">Latest transactions & alerts</p>
        </div>
        <button
          onClick={() => navigate("/reports/activity")}
          className="text-sm text-primary font-medium flex items-center gap-1 hover:underline cursor-pointer"
        >
          View All <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-3">
        {activities.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i }}
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors"
          >
            <div className={`p-2 rounded-lg shrink-0 ${typeStyles[item.type]}`}>
              <item.icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{item.message}</p>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
