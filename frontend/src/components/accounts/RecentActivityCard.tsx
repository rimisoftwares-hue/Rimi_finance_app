import { motion } from "framer-motion";
import { History, Clock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface RecentActivityItem {
  id: string | number;
  name: string;
  group: string;
  lastUsedAt: string; // ISO or display
  voucherType: string;
  entries?: number;
}

interface Props {
  items: RecentActivityItem[];
  onSelect: (item: RecentActivityItem) => void;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

export function RecentActivityCard({ items, onSelect }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="dashboard-card p-0 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
            <p className="text-[11px] text-muted-foreground">Last used ledgers</p>
          </div>
        </div>
        <Badge variant="secondary" className="text-[10px]">Recent</Badge>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {items.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground text-center">No recent activity</p>
        )}
        {items.map((it, i) => (
          <motion.button
            key={it.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * i }}
            whileHover={{ x: 3 }}
            onClick={() => onSelect(it)}
            className="w-full text-left px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-secondary/50 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {it.name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{it.group}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {formatTime(it.lastUsedAt)}
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 h-4">{it.voucherType}</Badge>
                  {typeof it.entries === "number" && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <FileText className="h-3 w-3" /> {it.entries} entries
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
