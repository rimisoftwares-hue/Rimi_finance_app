import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Moon, Sun, Bell, ChevronDown, Check, Loader2, Building2 } from "lucide-react";
import { Button } from "./ui/button";
import { Sidebar } from "./Sidebar";
import { useOwnerAuth } from "../contexts/OwnerAuthContext";
import { useAuth } from "../contexts/AuthContext";
import { UserProfile } from './UserProfile';
import { useNotifications } from '../hooks/useNotifications';
import { toast } from "sonner";
import { cn } from "./lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function Layout() {
  const [isDark, setIsDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { owner, isLoading } = useOwnerAuth();
  const { currentFinance, financeList, switchFinance, refreshFinanceList } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    if (financeList.length === 0 && refreshFinanceList) {
      refreshFinanceList();
    }
  }, [financeList.length, refreshFinanceList]);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  // Display finance name fallback order: currentFinance?.name -> currentFinance?.finance_name -> owner?.username -> "RIMI Software"
  const displayName =
    currentFinance?.name ||
    currentFinance?.finance_name ||
    owner?.username ||
    "RIMI Software";

  const handleSwitchFinance = async (f: (typeof financeList)[number]) => {
    if (String(f.id) === String(currentFinance?.id)) {
      setOpen(false);
      return;
    }

    setSwitching(true);
    const targetName = f.name || f.finance_name || "Finance";
    try {
      const result = await switchFinance(String(f.id));
      if (result !== false) {
        toast.success(`Switched to ${targetName}`);
      } else {
        toast.error("Failed to switch finance company");
      }
    } catch (error: unknown) {
      console.error("Error switching finance company:", error);
      const err = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
      const errorMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to switch finance company";
      toast.error(errorMsg);
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  };

  return (
    <div className={`min-h-screen bg-background transition-colors duration-300 ${isDark ? "dark" : ""}`}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header 
            className="h-10 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-between"
            data-tauri-drag-region
          >
            {/* Left side with draggable area */}
            <div 
              className="flex items-center h-full px-6 flex-1 cursor-default"
              data-tauri-drag-region
            >
              <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <DropdownMenu
                  open={open}
                  onOpenChange={(next) => {
                    if (!switching) setOpen(next);
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={switching || isLoading}
                      title={isLoading ? "Loading..." : "Switch finance company"}
                      className="group flex items-center gap-1.5 text-left rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        className={cn(
                          "text-xl font-bold tracking-tight transition-colors duration-200 select-none",
                          open
                            ? "text-primary"
                            : "text-foreground group-hover:text-foreground/75"
                        )}
                      >
                        {isLoading ? "Loading..." : displayName}
                      </span>
                      {switching ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                      ) : (
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 transition-all duration-200",
                            open
                              ? "opacity-100 rotate-180 text-primary"
                              : "opacity-0 group-hover:opacity-100 text-muted-foreground"
                          )}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    className="w-72 rounded-xl bg-popover/95 backdrop-blur-md border border-border shadow-xl p-1.5 z-50"
                  >
                    <DropdownMenuLabel className="flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>Authorized Finances</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-secondary text-secondary-foreground">
                        {financeList.length}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="my-1" />
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {financeList.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          No authorized finances found
                        </div>
                      ) : (
                        financeList.map((f) => {
                          const isActive = String(f.id) === String(currentFinance?.id);
                          const financeName = f.name || f.finance_name || "Finance";
                          const logoUrl = f.logo_url || f.finance_photo;

                          return (
                            <DropdownMenuItem
                              key={f.id}
                              disabled={switching}
                              onSelect={(e) => {
                                e.preventDefault();
                                handleSwitchFinance(f);
                              }}
                              className={cn(
                                "flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm",
                                isActive
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-foreground hover:bg-secondary/80 focus:bg-secondary/80"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                {logoUrl ? (
                                  <img
                                    src={logoUrl}
                                    alt={financeName}
                                    className="h-6 w-6 rounded-md object-cover border border-border/40 shrink-0"
                                  />
                                ) : (
                                  <div
                                    className={cn(
                                      "p-1.5 rounded-md shrink-0",
                                      isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                                    )}
                                  >
                                    <Building2 className="h-3.5 w-3.5" />
                                  </div>
                                )}
                                <div className="truncate">
                                  <p className="text-xs font-medium truncate">{financeName}</p>
                                  {f.city && (
                                    <p className="text-[10px] text-muted-foreground truncate">{f.city}</p>
                                  )}
                                </div>
                              </div>
                              {isActive && (
                                <Check className="h-4 w-4 text-primary shrink-0 ml-1" />
                              )}
                            </DropdownMenuItem>
                          );
                        })
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            {/* Right side with controls - spaced for window controls (minimize/maximize/close) */}
            <div className="flex items-center h-full space-x-2 pl-4 pr-36" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {/* Notification Bell */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/notification')}
                className="relative hover:bg-secondary transition-colors"
                title="Notifications"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              >
                <Bell className="h-4 w-4 text-foreground/80 hover:text-foreground transition-colors" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>

              {/* Theme Toggle Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="relative"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              
              {/* User Profile Dropdown */}
              <UserProfile />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-background">
            <div className="p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default Layout;
