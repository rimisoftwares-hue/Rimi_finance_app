import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line,
} from "recharts";

export interface ChartBarSpec {
  key: string;
  label: string;
  color: string; // hsl(var(--...)) or hex
}

interface Props {
  title: string;
  subtitle?: string;
  data: Array<Record<string, any>>;
  xKey: string;
  bars: ChartBarSpec[];
  lineKey?: string;
  lineColor?: string;
  onBarClick?: (row: Record<string, any>, barKey: string) => void;
  defaultOpen?: boolean;
  height?: number;
}

export function MonthlyAnalysisChart({
  title, subtitle, data, xKey, bars, lineKey, lineColor,
  onBarClick, defaultOpen = true, height = 280,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const Chart: any = lineKey ? ComposedChart : BarChart;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="dashboard-card !p-0 overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40 hover:bg-secondary/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground">· {subtitle}</span>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden"
          >
            <div className="p-4" style={{ height }}>
              <ResponsiveContainer width="100%" height="100%">
                <Chart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey={xKey} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => `₹${Number(v).toLocaleString("en-IN")}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {bars.map(b => (
                    <Bar
                      key={b.key} dataKey={b.key} name={b.label} fill={b.color}
                      radius={[4, 4, 0, 0]}
                      cursor={onBarClick ? "pointer" : undefined}
                      onClick={onBarClick ? (d: any) => onBarClick(d, b.key) : undefined}
                    />
                  ))}
                  {lineKey && (
                    <Line type="monotone" dataKey={lineKey} stroke={lineColor || "hsl(var(--primary))"}
                      strokeWidth={2} dot={{ r: 3 }} name={lineKey} />
                  )}
                </Chart>
              </ResponsiveContainer>
            </div>
            <div className="px-4 py-2 border-t border-border bg-secondary/20 text-[11px] text-muted-foreground">
              Click any bar to drill down into that period.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
