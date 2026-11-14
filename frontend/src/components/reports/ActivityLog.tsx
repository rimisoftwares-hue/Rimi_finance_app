import { motion } from "framer-motion";
import { Activity, Monitor, Smartphone, LogIn, LogOut } from "lucide-react";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { TablePagination } from "../common";
import { useClientPagination } from "../../hooks/useClientPagination";
import { useMemo, useState } from "react";

const activityLogs = [
  { id: 1, user: "Admin", action: "Login", time: "09:00 AM", date: "2025-02-26", duration: "Active", device: "Desktop", ip: "192.168.1.10", icon: LogIn },
  { id: 2, user: "Raju (Staff)", action: "Payment Entry", time: "09:15 AM", date: "2025-02-26", duration: "—", device: "Mobile", ip: "192.168.1.25", icon: Activity },
  { id: 3, user: "Admin", action: "Loan Approved", time: "09:45 AM", date: "2025-02-26", duration: "—", device: "Desktop", ip: "192.168.1.10", icon: Activity },
  { id: 4, user: "Priya (Staff)", action: "Login", time: "10:00 AM", date: "2025-02-26", duration: "2h 15m", device: "Desktop", ip: "192.168.1.32", icon: LogIn },
  { id: 5, user: "Raju (Staff)", action: "Logout", time: "11:30 AM", date: "2025-02-26", duration: "2h 15m", device: "Mobile", ip: "192.168.1.25", icon: LogOut },
  { id: 6, user: "Admin", action: "Customer Updated", time: "12:00 PM", date: "2025-02-26", duration: "—", device: "Desktop", ip: "192.168.1.10", icon: Activity },
  { id: 7, user: "Priya (Staff)", action: "Collection Entry", time: "01:30 PM", date: "2025-02-26", duration: "—", device: "Desktop", ip: "192.168.1.32", icon: Activity },
  { id: 8, user: "Priya (Staff)", action: "Logout", time: "05:00 PM", date: "2025-02-25", duration: "7h 00m", device: "Desktop", ip: "192.168.1.32", icon: LogOut },
  { id: 9, user: "Admin", action: "Report Generated", time: "05:30 PM", date: "2025-02-25", duration: "—", device: "Desktop", ip: "192.168.1.10", icon: Activity },
  { id: 10, user: "Raju (Staff)", action: "Login", time: "09:00 AM", date: "2025-02-25", duration: "8h 30m", device: "Mobile", ip: "192.168.1.25", icon: LogIn },
];

const actionColors: Record<string, string> = {
  Login: "bg-income/10 text-income",
  Logout: "bg-destructive/10 text-destructive",
  "Payment Entry": "bg-primary/10 text-primary",
  "Loan Approved": "badge-success",
  "Customer Updated": "bg-warning/10 text-warning",
  "Collection Entry": "bg-primary/10 text-primary",
  "Report Generated": "bg-accent text-accent-foreground",
};

export default function ActivityLog() {
  const [userFilter, setUserFilter] = useState("");

  const filtered = useMemo(
    () =>
      activityLogs.filter((log) =>
        log.user.toLowerCase().includes(userFilter.toLowerCase())
      ),
    [userFilter]
  );

  const {
    paginatedItems,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(filtered, { initialPageSize: 15, resetKey: userFilter });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Activity Log</h1>
          <p className="text-muted-foreground mt-1 text-sm">User activity and session tracking</p>
        </div>
      </motion.div>

      <div className="dashboard-card !p-4 hover:translate-y-0">
        <div className="flex items-center gap-4">
          <Input placeholder="Filter by user..." value={userFilter} onChange={e => setUserFilter(e.target.value)} className="max-w-xs" />
          <DatePicker className="max-w-xs" defaultValue="2025-02-26" />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                {["User", "Action", "Date", "Time", "Duration", "Device", "IP Address"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No activity logs found</td>
                </tr>
              ) : (
                paginatedItems.map((log, i) => (
                  <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{log.user}</td>
                    <td className="px-4 py-3 text-sm"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[log.action] || "badge-default"}`}><log.icon className="h-3 w-3" /> {log.action}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{log.date}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{log.time}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{log.duration}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {log.device === "Desktop" ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                        {log.device}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{log.ip}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </motion.div>
    </div>
  );
}
