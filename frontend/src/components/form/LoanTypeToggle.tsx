import { motion } from "framer-motion";
import { FileText, Car } from "lucide-react";

export type LoanType = "consulting" | "vehicle";

export interface LoanTypeToggleProps {
  value: LoanType;
  onChange: (value: LoanType) => void;
  disabled?: boolean;
}

export function LoanTypeToggle({ value, onChange, disabled = false }: LoanTypeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Loan Entry Type"
      className="inline-flex items-center bg-secondary rounded-xl p-1 gap-1"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("consulting")}
        aria-pressed={value === "consulting"}
        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
          value === "consulting"
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {value === "consulting" && (
          <motion.div
            layoutId="loanEntryToggle"
            className="absolute inset-0 bg-primary rounded-lg"
            style={{ boxShadow: "var(--shadow-primary)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <FileText className="h-4 w-4 relative z-10" />
        <span className="relative z-10">Consulting Loan</span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("vehicle")}
        aria-pressed={value === "vehicle"}
        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
          value === "vehicle"
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {value === "vehicle" && (
          <motion.div
            layoutId="loanEntryToggle"
            className="absolute inset-0 bg-primary rounded-lg"
            style={{ boxShadow: "var(--shadow-primary)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <Car className="h-4 w-4 relative z-10" />
        <span className="relative z-10">Vehicle Loan</span>
      </button>
    </div>
  );
}

