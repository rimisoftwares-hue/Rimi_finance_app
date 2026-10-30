import { motion } from "framer-motion";
import { LayoutDashboard, UserCog } from "lucide-react";

interface DashboardToggleProps {
  mode: "main" | "staff";
  onToggle: (mode: "main" | "staff") => void;
}

export function DashboardToggle({ mode, onToggle }: DashboardToggleProps) {
  return (
    <div className="inline-flex items-center bg-secondary rounded-xl p-1 gap-1">
      <button
        onClick={() => onToggle("main")}
        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          mode === "main" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {mode === "main" && (
          <motion.div
            layoutId="dashboardToggle"
            className="absolute inset-0 bg-primary rounded-lg"
            style={{ boxShadow: "var(--shadow-primary)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <LayoutDashboard className="h-4 w-4 relative z-10" />
        <span className="relative z-10">Main Dashboard</span>
      </button>
      <button
        onClick={() => onToggle("staff")}
        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          mode === "staff" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {mode === "staff" && (
          <motion.div
            layoutId="dashboardToggle"
            className="absolute inset-0 bg-primary rounded-lg"
            style={{ boxShadow: "var(--shadow-primary)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <UserCog className="h-4 w-4 relative z-10" />
        <span className="relative z-10">Staff Dashboard</span>
      </button>
    </div>
  );
}
