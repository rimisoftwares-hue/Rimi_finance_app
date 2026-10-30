import { motion } from "framer-motion";
import { Sparkles, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface RecentlyCreatedItem {
  id: string | number;
  name: string;
  group: string;
  createdAt: string; // ISO or display
}

interface Props {
  items: RecentlyCreatedItem[];
  onSelect: (item: RecentlyCreatedItem) => void;
  loading?: boolean;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export function RecentlyCreatedCard({ items, onSelect, loading }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="dashboard-card p-0 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-income/10 text-income">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recently Created</h3>
            <p className="text-[11px] text-muted-foreground">Newly added ledgers</p>
          </div>
        </div>
        <Badge className="text-[10px] bg-income/15 text-income border-transparent hover:bg-income/20">New</Badge>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {loading && (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-md bg-secondary/60 animate-pulse" />
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground text-center">No newly created ledgers</p>
        )}
        {!loading && items.map((it, i) => (
          <motion.button
            key={it.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * i }}
            whileHover={{ x: 3 }}
            onClick={() => onSelect(it)}
            className="w-full text-left px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-secondary/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {it.name}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{it.group}</p>
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                <Calendar className="h-3 w-3" /> {formatDate(it.createdAt)}
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}