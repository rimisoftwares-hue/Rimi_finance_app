import { motion } from "framer-motion";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

interface SummaryCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  variant?: "default" | "income" | "expense" | "pending";
  onClick?: () => void;
}

function AnimatedCounter({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{typeof value === "number" && value > 999 ? count.toLocaleString() : count}</span>;
}

const variantStyles = {
  default: "border-t-primary",
  income: "border-t-income",
  expense: "border-t-expense",
  pending: "border-t-pending",
};

const iconBgStyles = {
  default: "bg-primary/10 text-primary",
  income: "bg-income/10 text-income",
  expense: "bg-expense/10 text-expense",
  pending: "bg-pending/10 text-pending",
};

export function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  onClick,
}: SummaryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`dashboard-card cursor-pointer border-t-4 ${variantStyles[variant]}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold text-foreground">
            {typeof value === "number" ? <AnimatedCounter value={value} /> : value}
          </p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-xl ${iconBgStyles[variant]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-3">
          {trend.isPositive ? (
            <TrendingUp className="h-3 w-3 text-income" />
          ) : (
            <TrendingDown className="h-3 w-3 text-expense" />
          )}
          <span className={`text-xs font-medium ${trend.isPositive ? "text-income" : "text-expense"}`}>
            {trend.value}%
          </span>
          <span className="text-xs text-muted-foreground">vs last month</span>
        </div>
      )}
    </motion.div>
  );
}
