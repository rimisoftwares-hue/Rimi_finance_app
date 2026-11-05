import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ChevronDown, Check, Loader2, Bell, X } from "lucide-react";
import { DashboardToggle } from "../components/dashboard/DashboardToggle";
import { MainDashboard } from "../components/dashboard/MainDashboard";
import { StaffDashboard } from "../components/dashboard/StaffDashboard";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { usePermissionFlow } from "../hooks/usePermissionFlow";
import { DevicePermissionService } from "../services/devicePermissionService";
import { PermissionModal } from "../components/common/PermissionModal";

/* ── Shimmer block ── */
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-secondary/60 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Shimmer key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Shimmer className="h-80" />
        <Shimmer className="h-80" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Shimmer className="h-32" />
        <Shimmer className="h-32" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [mode, setMode] = useState<"main" | "staff">(() => {
    return (localStorage.getItem("dashboardMode") as "main" | "staff") || "main";
  });
  
  const { currentFinance, financeList, switchFinance, refreshFinanceList } = useAuth();
  const [showFinanceMenu, setShowFinanceMenu] = useState(false);
  const [switching, setSwitching] = useState(false);
  const notificationFlow = usePermissionFlow("notification");
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);

  useEffect(() => {
    const isDismissed = sessionStorage.getItem("dismissed_notification_banner") === "true";
    if (isDismissed) return;

    DevicePermissionService.queryStatus("notification").then((status) => {
      if (status === "prompt") {
        setShowNotificationBanner(true);
      }
    });
  }, []);

  const handleEnableNotifications = async () => {
    const res = await notificationFlow.ensure();
    if (res.granted) {
      setShowNotificationBanner(false);
    }
  };

  const handleDismissBanner = () => {
    sessionStorage.setItem("dismissed_notification_banner", "true");
    setShowNotificationBanner(false);
  };

  useEffect(() => {
    localStorage.setItem("dashboardMode", mode);
  }, [mode]);

  useEffect(() => {
    if (financeList.length === 0) {
      refreshFinanceList();
    }
  }, [financeList.length, refreshFinanceList]);

  const activeFinanceId = currentFinance?.id ? String(currentFinance.id) : "";
  const activeFinanceName = currentFinance?.name || currentFinance?.finance_name || "Select Finance";

  const handleSwitchFinance = async (f: any) => {
    setShowFinanceMenu(false);
    const targetIdStr = String(f.id);
    if (targetIdStr === activeFinanceId) return;

    setSwitching(true);
    try {
      const success = await switchFinance(targetIdStr);
      if (success) {
        toast.success(`Switched to ${f.name || f.finance_name || "Finance"}`);
      } else {
        toast.error("Failed to switch finance company");
      }
    } catch (err: any) {
      console.error("Dashboard switch error:", err);
      toast.error(err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to switch finance");
    } finally {
      setTimeout(() => setSwitching(false), 300);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {mode === "main"
              ? "Business overview & management insights"
              : "Daily operations & collection tasks"}
          </p>
        </motion.div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Finance Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFinanceMenu(!showFinanceMenu)}
              disabled={switching}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:border-primary/30 transition-all duration-200 shadow-sm disabled:opacity-60"
            >
              {switching ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : currentFinance?.logo_url || currentFinance?.finance_photo ? (
                <img
                  src={currentFinance.logo_url || currentFinance.finance_photo}
                  alt={activeFinanceName}
                  className="h-4 w-4 rounded object-cover"
                />
              ) : (
                <Building2 className="h-4 w-4 text-primary" />
              )}
              <span className="max-w-[180px] truncate">{activeFinanceName}</span>
              {switching && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showFinanceMenu ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showFinanceMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden"
                >
                  <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Authorized Finances ({financeList.length})
                    </p>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-1 space-y-1">
                    {financeList.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No authorized finances available
                      </div>
                    ) : (
                      financeList.map(f => {
                        const isSelected = String(f.id) === activeFinanceId;
                        return (
                          <button
                            key={f.id}
                            disabled={switching}
                            onClick={() => handleSwitchFinance(f)}
                            className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between gap-2 ${
                              isSelected
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground hover:bg-secondary/80"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              {f.logo_url || f.finance_photo ? (
                                <img
                                  src={f.logo_url || f.finance_photo}
                                  alt={f.name || f.finance_name}
                                  className="h-6 w-6 rounded-md object-cover border border-border/40 shrink-0"
                                />
                              ) : (
                                <div className={`p-1.5 rounded-md shrink-0 ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                  <Building2 className="h-3.5 w-3.5" />
                                </div>
                              )}
                              <div className="truncate">
                                <p className="text-xs font-medium truncate">{f.name || f.finance_name}</p>
                                {f.city && (
                                  <p className="text-[10px] text-muted-foreground truncate">{f.city}</p>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dashboard Toggle */}
          <DashboardToggle mode={mode} onToggle={setMode} />
        </div>
      </div>

      {/* Dismissible Desktop Reminders Banner */}
      {showNotificationBanner && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-foreground text-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-xs sm:text-sm">Enable desktop reminders</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">Receive reminders for upcoming collections and assignment updates.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleEnableNotifications}
              className="h-8 text-xs font-medium"
            >
              Enable
            </Button>
            <button
              type="button"
              onClick={handleDismissBanner}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Content with smooth finance-switch transition */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {switching ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <DashboardSkeleton />
            </motion.div>
          ) : (
            <motion.div
              key={`${mode}-${activeFinanceId || 'default'}`}
              initial={{ opacity: 0.3, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.3, scale: 0.98 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              {mode === "main" ? <MainDashboard /> : <StaffDashboard />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PermissionModal
        open={notificationFlow.phase === 'soft' || notificationFlow.phase === 'blocked'}
        type="notification"
        mode={notificationFlow.phase === 'blocked' ? 'blocked' : 'soft'}
        busy={notificationFlow.phase === 'requesting'}
        onAllow={notificationFlow.onAllow}
        onCancel={notificationFlow.onCancel}
        onRetry={notificationFlow.retryAfterSettings}
      />
    </div>
  );
}
