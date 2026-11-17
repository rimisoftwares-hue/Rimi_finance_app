import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { DashboardToggle } from "../components/dashboard/DashboardToggle";
import { MainDashboard } from "../components/dashboard/MainDashboard";
import { StaffDashboard } from "../components/dashboard/StaffDashboard";
import { AIBotMascot } from "../components/ai/AIBotMascot";
import { useAuth } from "../contexts/AuthContext";
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
  
  const { currentFinance } = useAuth();
  const [switching, setSwitching] = useState(false);
  const activeFinanceId = currentFinance?.id ? String(currentFinance.id) : "";

  useEffect(() => {
    const handleFinanceSwitched = () => {
      setSwitching(true);
      const timer = setTimeout(() => setSwitching(false), 300);
      return () => clearTimeout(timer);
    };

    window.addEventListener("autofinex:finance-switched", handleFinanceSwitched);
    return () => {
      window.removeEventListener("autofinex:finance-switched", handleFinanceSwitched);
    };
  }, []);

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
          {/* Compact AI Voice Assistant Trigger */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("autofinex:open-ai-assistant"))}
            className="inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-xl text-sm font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border/70 hover:border-sky-400/50 transition-all shadow-xs cursor-pointer"
            title="Open AutoFinex AI Voice & Chat Assistant"
          >
            <AIBotMascot size={24} />
            <span>AI Assistant</span>
          </button>

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
