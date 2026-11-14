import { useState, useRef, useEffect, useMemo } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  PanelLeftOpen,
  PanelLeftClose,
  LayoutDashboard,
  Users,
  UserX,
  UserCheck,
  UserPlus,
  Car,
  User,
  ChevronRight,
  CreditCard,
  LogOut,
  Building,
  FileText,
  FilePlus,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileCheck,
  FileX,
  BarChart3,
  Search,
  ShieldCheck,
  Wallet,
  BookOpen,
  Briefcase,
  PieChart,
  RefreshCw,
  BellDot,
  HandCoins,
  Bot,
  MessageSquare,
  Brain,
  Settings,
  Crosshair,
  MapPin,
  Radio,
  BarChart2,
  Map,
  Building2,
  Landmark,
  Skull,
  LogIn,
  Clock,
  PhoneCall,
  Mail,
  Phone,
  Loader2
} from "lucide-react";
import { useAuth } from '../contexts/AuthContext';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';
import { getAuthMode } from '../utils/authStorage';
import { toast as notifyToast } from '../hooks/use-toast';
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./ui/hover-card";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { fetchUserProfileOverview } from '../api/userProfileApi';
import { cn } from "./lib/utils";

const isMacOS = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

interface SubmenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
}

interface NavigationItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  ownerOnly?: boolean;
  submenu?: SubmenuItem[];
}

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Total Customers", href: "/customers", icon: Users },
  { name: "Unpaid Customers", href: "/unpaidloans", icon: UserX },
  {
    name: "Entry",
    icon: FilePlus,
    submenu: [
      { name: "Loan Form", href: "/loanForm", icon: FileText },
      { name: "Loan Requests", href: "/loanRequests", icon: BellDot },
    ]
  },
  {
    name: "Collections",
    icon: ClipboardList,
    submenu: [
      { name: "Pendings", href: "/collections/pending", icon: FileText },
      { name: "KYC Pending", href: "/collections/kyc", icon: FileCheck },
      { name: "Terminated", href: "/collections/terminated", icon: FileX },
      { name: "Godown Vehicle", href: "/collections/godown", icon: Car }
    ]
  },
  {
    name: "Reports",
    icon: BarChart3,
    submenu: [
      // { name: "Collection Report", href: "/reports/collection", icon: FileText },
      { name: "Payments", href: "/paymentReport", icon: CreditCard },
      // { name: "Activity Log", href: "/reports/activity", icon: Activity },
      { name: "Due Analysis", href: "/reports/due-analysis", icon: Search },
      { name: "Compliance", href: "/reports/compliance", icon: ShieldCheck },
      { name: "Charges", href: "/reports/charges", icon: CreditCard },
      { name: "Balances", href: "/reports/balances", icon: Wallet },
      { name: "Bill", href: "/reports/bill", icon: FileText }
    ]
  },
  {
    name: "Accounts",
    icon: Wallet,
    submenu: [
      { name: "Ledger Groups", href: "/accounts/ledger-groups", icon: Briefcase },
      { name: "Ledger", href: "/accounts/ledger", icon: BookOpen },
      { name: "Vouchers", href: "/accounts/vouchers", icon: FileText },
      { name: "Day Book", href: "/accounts/daybook", icon: BookOpen },
      { name: "Office Expense", href: "/office-expense", icon: FileText },
      { name: "Statements", href: "/accounts/statements", icon: FileText },
      { name: "Business", href: "/accounts/business", icon: Briefcase },
      { name: "Demand", href: "/accounts/demand", icon: FileText },
      { name: "Balance Sheet", href: "/accounts/balance-sheet", icon: FileText },
      { name: "Trial Balance", href: "/accounts/trial-balance", icon: FileText },
      { name: "Profit & Loss", href: "/accounts/pnl", icon: PieChart },
      { name: "Cash Flow", href: "/accounts/cash-flow", icon: RefreshCw }
    ]
  },
  {
    name: "AI Assistant",
    icon: Bot,
    submenu: [
      { name: "Dashboard", href: "/ai/dashboard", icon: LayoutDashboard },
      { name: "Lead Calling", href: "/ai/lead-calling", icon: PhoneCall },
      { name: "Logs", href: "/ai/logs", icon: MessageSquare },
      { name: "Insights", href: "/ai/insights", icon: Brain },
      { name: "Settings", href: "/ai/settings", icon: Settings },
    ],
  },
  {
    name: "Customer Locator",
    icon: Crosshair,
    submenu: [
      { name: "Track", href: "/locator/track", icon: MapPin },
      { name: "Alerts", href: "/locator/alerts", icon: Radio },
      { name: "Insights", href: "/locator/insights", icon: BarChart2 },
      { name: "Live Map", href: "/locator/live", icon: Map },
    ],
  },
  { name: "Notices", href: "/notices", icon: BellDot },
  { name: "Vehicles", href: "/vehicle", icon: Car },
  {
    name: "Agent Mgmt",
    icon: MapPin,
    submenu: [
      { name: "Agent Management", href: "/AgentManagement", icon: UserCheck },
      { name: "Invite Studio", href: "/invite", icon: UserPlus },
      { name: "Assign Customers", href: "/agents/assign", icon: Users },
      { name: "Area Allocation", href: "/agents/areas", icon: MapPin },
      { name: "Assignment History", href: "/agents/history", icon: Clock },
      { name: "Staff Location", href: "/agents/location", icon: MapPin },
      { name: "Staff Login", href: "/agents/login", icon: LogIn },
    ],
  },
  {
    name: "Master",
    icon: Building2,
    submenu: [
      { name: "Company Profile", href: "/master/company", icon: Building2, ownerOnly: true },
      { name: "Settings", href: "/master/settings", icon: Settings },
      { name: "RSP Bank", href: "/master/rsp", icon: Landmark },
      { name: "Hand Loan", href: "/master/hand-loan", icon: HandCoins },
      { name: "Bad Debts", href: "/master/bad-debts", icon: Skull },
    ],
  },
];

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [activeFlyout, setActiveFlyout] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fetchedPhoto, setFetchedPhoto] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggingOutRef = useRef(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const navigate = useNavigate();
  const { owner } = useOwnerAuth();
  const { user, userLogout, currentFinance } = useAuth();
  const location = useLocation();

  const isOwner = Boolean((owner && (!user || user.role === 'owner')) || user?.role === 'owner');

  // User display & profile computations
  const displayName =
    (user as any)?.name?.trim() ||
    user?.username?.trim() ||
    user?.email?.split('@')[0] ||
    owner?.username?.trim() ||
    'User';

  const userInitial = displayName.charAt(0).toUpperCase() || 'U';

  const rawRole = user?.role || (owner ? 'owner' : 'user');
  const userRole =
    rawRole === 'owner' ? 'Owner' :
      rawRole === 'admin' ? 'Admin' :
        rawRole === 'agent' ? 'Agent' :
          rawRole === 'staff' ? 'Staff' :
            rawRole.charAt(0).toUpperCase() + rawRole.slice(1);

  const username = user?.username || owner?.username || '';
  const email = user?.email || (owner as any)?.email || '';
  const phone = user?.phone_no || (user as any)?.phone || (owner as any)?.phone || '';
  const financeName = currentFinance?.name || currentFinance?.finance_name || '';

  const directPhoto =
    (user as any)?.photo ||
    (user as any)?.photo_url ||
    (user as any)?.profile_photo ||
    (user as any)?.avatar ||
    (owner as any)?.photo ||
    (owner as any)?.photo_url ||
    null;

  const photoUrl = directPhoto || fetchedPhoto;

  // Asynchronously fetch profile overview if no photo is on the user object
  useEffect(() => {
    if (!directPhoto && user) {
      let isSubscribed = true;
      fetchUserProfileOverview()
        .then((data) => {
          if (isSubscribed && data?.profile?.photo) {
            setFetchedPhoto(data.profile.photo);
          }
        })
        .catch(() => {
          // Silently ignore
        });
      return () => {
        isSubscribed = false;
      };
    }
  }, [directPhoto, user]);

  useEffect(() => {
    setImgError(false);
  }, [photoUrl]);

  const getRoleBadgeClasses = (role: string) => {
    const r = role.toLowerCase();
    switch (r) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'agent':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'staff':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  const handleLogout = async () => {
    if (isLoggingOutRef.current || isLoggingOut) return;

    isLoggingOutRef.current = true;
    setIsLoggingOut(true);

    // Snapshot authentication mode BEFORE calling userLogout(), which clears authMode in Direct User Mode
    const hasLicenseSession =
      getAuthMode() === 'license' && Boolean(localStorage.getItem('ownerToken'));

    const destination = hasLicenseSession ? '/user-login' : '/owner-login';

    setProfileOpen(false);
    setIsExpanded(false);
    setOpenSubmenu(null);

    let remoteClosed = true;
    try {
      if (user) {
        const result = await userLogout('manual');
        if (result && result.remoteClosed === false) {
          remoteClosed = false;
        }
      }
    } catch (error) {
      remoteClosed = false;
      console.error('User logout error:', error);
    } finally {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
      if (!remoteClosed) {
        notifyToast({
          title: 'Logged Out Locally',
          description: 'Your local session was cleared, but the server could not be reached to close the remote session.',
          variant: 'destructive',
        });
      }
      navigate(destination, { replace: true });
    }
  };

  const renderAvatar = (sizeClasses = "h-8 w-8 text-xs") => {
    if (photoUrl && !imgError) {
      return (
        <img
          src={photoUrl}
          alt={displayName}
          onError={() => setImgError(true)}
          className={cn(
            sizeClasses,
            "rounded-full object-cover shrink-0 border border-border/60 shadow-xs"
          )}
        />
      );
    }
    return (
      <div
        className={cn(
          sizeClasses,
          "rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold flex items-center justify-center shrink-0 shadow-xs select-none"
        )}
      >
        {userInitial}
      </div>
    );
  };

  // Filter navigation items and submenus based on role restrictions
  const filteredNavigation = useMemo(() => {
    return navigation
      .filter((item) => !item.ownerOnly || isOwner)
      .map((item) => {
        if (!item.submenu) return item;
        return {
          ...item,
          submenu: item.submenu.filter((sub) => !sub.ownerOnly || isOwner),
        };
      });
  }, [isOwner]);

  const toggleSubmenu = (menuName: string) => {
    setOpenSubmenu((prev) => (prev === menuName ? null : menuName));
  };

  // Close overlay on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
        setOpenSubmenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  // Close overlay on outside click (ignoring clicks inside radix popover portals)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.('[data-radix-popper-content-wrapper]') ||
        target?.closest?.('[role="dialog"]')
      ) {
        return;
      }
      if (
        isExpanded &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        setIsExpanded(false);
        setOpenSubmenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  // Helper to check if a navigation item or one of its sub-items is active
  const isItemActive = (item: NavigationItem) => {
    if (item.href) {
      return item.href === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.href);
    }
    if (item.submenu) {
      return item.submenu.some((sub) =>
        sub.href === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(sub.href)
      );
    }
    return false;
  };

  return (
    <>
      {/* 
        1. Permanent Static Spacer:
        Reserves exactly 64px (w-16 shrink-0) in the layout flex container so that the 
        right-side main content width NEVER resizes, shrinks, or shifts.
      */}
      <div
        className="w-16 shrink-0 h-screen pointer-events-none select-none invisible"
        aria-hidden="true"
      />

      {/* 
        2. Backdrop Overlay:
        Smoothly fades in behind the expanded floating drawer. Clicking it collapses the sidebar.
      */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 animate-in fade-in"
          onClick={() => {
            setIsExpanded(false);
            setOpenSubmenu(null);
          }}
          aria-hidden="true"
        />
      )}

      {/* 
        3. Floating Overlay Drawer:
        Positioned fixed top-0 left-0 h-screen z-50.
        Smoothly expands from w-16 to w-64 without shifting main content.
      */}
      <aside
        ref={sidebarRef}
        className={cn(
          "fixed top-0 left-0 h-screen z-50 bg-card border-r border-border flex flex-col select-none",
          "transition-[width,box-shadow] duration-300 ease-in-out",
          isExpanded ? "w-64 shadow-2xl" : "w-16 shadow-none"
        )}
      >
        {/* Header / Brand Logo Section */}
        <div
          className={cn(
            "flex-shrink-0 border-b border-border bg-card/60 backdrop-blur-sm flex items-center h-10 px-3",
            isMacOS && "pt-6 h-16"
          )}
        >
          {!isExpanded ? (
            /* Collapsed State: Logo swaps to Expand Icon (PanelLeftOpen) on hover */
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="group relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-accent text-foreground transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                {/* Default state: Logo */}
                <img
                  src="./rimi_logo.png"
                  alt="RIMI Logo"
                  className="w-6 h-6 object-contain transition-all duration-200 group-hover:opacity-0 group-hover:scale-75"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />

                {/* Hover state: Expand Sidebar icon */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200 text-primary">
                  <PanelLeftOpen className="w-5 h-5" />
                </div>
              </button>
            </div>
          ) : (
            /* Expanded State Header: Full Logo + Brand Name on left, Collapse Icon on right */
            <div className="w-full flex items-center justify-between min-w-0 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
                <img
                  src="./rimi_logo.png"
                  alt="RIMI Logo"
                  className="w-6 h-6 object-contain shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="flex items-baseline gap-1 whitespace-nowrap overflow-hidden">
                  <span className="text-base font-bold text-foreground tracking-tight">
                    RIMI
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    Software
                  </span>
                </div>
              </div>

              {/* Dedicated Collapse Sidebar Button */}
              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                  setOpenSubmenu(null);
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {filteredNavigation.map((item) => {
            const hasSubmenu = Boolean(item.submenu && item.submenu.length > 0);
            const active = isItemActive(item);

            // ==========================================
            // COLLAPSED STATE (w-16): Hover Flyout Popover
            // ==========================================
            if (!isExpanded) {
              return (
                <div key={item.name} className="flex justify-center">
                  <HoverCard
                    open={activeFlyout === item.name}
                    onOpenChange={(open) => {
                      if (open) {
                        setActiveFlyout(item.name);
                      } else {
                        setActiveFlyout((prev) => (prev === item.name ? null : prev));
                      }
                    }}
                    openDelay={activeFlyout ? 0 : 70}
                    closeDelay={120}
                  >
                    <HoverCardTrigger asChild>
                      {hasSubmenu ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsExpanded(true);
                            setOpenSubmenu(item.name);
                          }}
                          className={cn(
                            "w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer relative",
                            active
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          )}
                          aria-label={item.name}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                          {/* Active indicator dot when submenu has active item */}
                          {active && (
                            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </button>
                      ) : (
                        <NavLink
                          to={item.href || "/"}
                          end={item.href === "/"}
                          className={cn(
                            "w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150 cursor-pointer",
                            active
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          )}
                          aria-label={item.name}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                        </NavLink>
                      )}
                    </HoverCardTrigger>

                    {/* Floating Context Menu / Flyout Popover */}
                    <HoverCardContent
                      side="right"
                      align="start"
                      sideOffset={10}
                      className={cn(
                        "z-50 rounded-xl border border-border/80 bg-popover/95 dark:bg-gray-900/95 backdrop-blur-md shadow-2xl p-0 outline-none",
                        "before:content-[''] before:absolute before:-left-3.5 before:top-0 before:bottom-0 before:w-4 before:bg-transparent",
                        hasSubmenu ? "w-60" : "w-auto min-w-[120px] max-w-xs"
                      )}
                    >
                      {hasSubmenu && item.submenu ? (
                        /* Case A: Item WITH Sub-headings/Sub-items (Flyout Menu) */
                        <div className="flex flex-col">
                          {/* Flyout Header */}
                          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-border/70 bg-muted/40 rounded-t-xl">
                            <span className="font-semibold text-xs tracking-wider uppercase text-foreground">
                              {item.name}
                            </span>
                          </div>

                          {/* Flyout Sub-items List */}
                          <div className="p-1.5 space-y-0.5 max-h-[60vh] overflow-y-auto">
                            {item.submenu.map((subItem) => {
                              const isSubActive =
                                subItem.href === "/"
                                  ? location.pathname === "/"
                                  : location.pathname.startsWith(subItem.href);

                              return (
                                <NavLink
                                  key={subItem.name}
                                  to={subItem.href}
                                  end={subItem.href === "/"}
                                  onClick={() => setActiveFlyout(null)}
                                  className={cn(
                                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all group",
                                    isSubActive
                                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                      : "text-muted-foreground hover:text-foreground hover:bg-accent hover:translate-x-0.5"
                                  )}
                                >
                                  <subItem.icon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate flex-1">
                                    {subItem.name}
                                  </span>
                                  <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </NavLink>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Case B: Item WITHOUT Sub-headings (Compact Menu Name Popover) */
                        <div className="flex items-center gap-2 px-3 py-2 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span className="text-xs font-semibold text-foreground tracking-wide">
                            {item.name}
                          </span>
                        </div>
                      )}
                    </HoverCardContent>
                  </HoverCard>
                </div>
              );
            }

            // ==========================================
            // EXPANDED STATE (w-64): Inline Items & Accordion
            // Zero Text-Wrapping & Clean Slide-Over Drawer
            // ==========================================
            if (hasSubmenu && item.submenu) {
              const isSubmenuOpen = openSubmenu === item.name;

              return (
                <div key={item.name} className="space-y-1">
                  {/* Parent Accordion Trigger */}
                  <button
                    type="button"
                    onClick={() => toggleSubmenu(item.name)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 text-left cursor-pointer",
                      "whitespace-nowrap overflow-hidden select-none",
                      isSubmenuOpen
                        ? "bg-accent text-foreground font-semibold"
                        : active
                          ? "bg-primary/10 text-primary font-medium dark:bg-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />

                    <div className="flex items-center justify-between flex-1 min-w-0 overflow-hidden">
                      <span className="text-sm font-medium truncate whitespace-nowrap">
                        {item.name}
                      </span>
                      <div className="shrink-0 ml-2">
                        {isSubmenuOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Submenu Accordion Items */}
                  {isSubmenuOpen && (
                    <div className="ml-5 pl-2.5 my-1 space-y-1 border-l-2 border-border/80 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                      {item.submenu.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.href}
                          end={subItem.href === "/"}
                          onClick={() => {
                            // Close overlay drawer after selection
                            setIsExpanded(false);
                            setOpenSubmenu(null);
                          }}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                              "whitespace-nowrap overflow-hidden select-none",
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )
                          }
                        >
                          <subItem.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1 whitespace-nowrap">
                            {subItem.name}
                          </span>
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Regular direct link without submenu (Expanded State)
            return (
              <NavLink
                key={item.name}
                to={item.href || "/"}
                end={item.href === "/"}
                onClick={() => {
                  // Close overlay drawer after selection
                  setIsExpanded(false);
                  setOpenSubmenu(null);
                }}
                className={({ isActive }) =>
                  cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 select-none",
                    "whitespace-nowrap overflow-hidden",
                    isActive
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />

                <div className="flex items-center justify-between flex-1 min-w-0 overflow-hidden">
                  <span className="text-sm font-medium truncate whitespace-nowrap">
                    {item.name}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                </div>
              </NavLink>
            );
          })}
        </nav>

        {/* User / Finance Info & Logout Section */}
        {(owner || user) && (
          <div className="flex-shrink-0 p-2.5 bg-card/60 backdrop-blur-sm">
            <Popover open={profileOpen} onOpenChange={setProfileOpen}>
              <PopoverTrigger asChild>
                {isExpanded ? (
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer group select-none",
                      profileOpen
                        ? "bg-accent text-accent-foreground shadow-xs"
                        : "hover:bg-accent/60 text-foreground"
                    )}
                    aria-label={`Open profile for ${displayName}`}
                  >
                    {/* Avatar: Photo or Capitalized Initial */}
                    {renderAvatar("h-8 w-8 text-xs")}

                    {/* Display Name & Role */}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-xs font-semibold text-foreground truncate leading-tight">
                        {displayName}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium border leading-tight truncate",
                            getRoleBadgeClasses(rawRole)
                          )}
                        >
                          {userRole}
                        </span>
                        {username && username !== displayName && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            @{username}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Indicator */}
                    <ChevronUp
                      className={cn(
                        "h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform duration-200",
                        profileOpen ? "rotate-180 text-foreground" : ""
                      )}
                    />
                  </button>
                ) : (
                  <div className="w-full flex justify-center">
                    <button
                      type="button"
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer select-none",
                        profileOpen
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "hover:ring-2 hover:ring-primary/40 hover:scale-105"
                      )}
                      aria-label={`Open profile for ${displayName}`}
                      title={displayName}
                    >
                      {renderAvatar("h-8 w-8 text-xs")}
                    </button>
                  </div>
                )}
              </PopoverTrigger>

              <PopoverContent
                side={isExpanded ? "top" : "right"}
                align={isExpanded ? "start" : "end"}
                sideOffset={isExpanded ? 10 : 14}
                collisionPadding={12}
                className="w-80 p-0 rounded-2xl bg-popover/98 dark:bg-card/98 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 z-[100]"
              >
                {/* Popover Header — Clickable to open User Profile */}
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    setIsExpanded(false);
                    navigate('/UserProfile');
                  }}
                  title="View Profile"
                  aria-label={`View profile for ${displayName}`}
                  className="w-full p-4 bg-muted/40 hover:bg-muted/70 border-b border-border/60 text-left transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <div className="flex items-center gap-3">
                    {renderAvatar("h-12 w-12 text-lg")}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {displayName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                            getRoleBadgeClasses(rawRole)
                          )}
                        >
                          {userRole}
                        </span>
                        {username && (
                          <span className="text-xs text-muted-foreground truncate">
                            @{username}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* Popover Details List */}
                <div className="p-4 space-y-3 text-xs">
                  {username && (
                    <div className="flex items-start gap-2.5 text-muted-foreground">
                      <User className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground/70">
                          Username
                        </p>
                        <p className="text-foreground font-medium truncate">
                          {username}
                        </p>
                      </div>
                    </div>
                  )}

                  {email && (
                    <div className="flex items-start gap-2.5 text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground/70">
                          Email
                        </p>
                        <p className="text-foreground font-medium truncate" title={email}>
                          {email}
                        </p>
                      </div>
                    </div>
                  )}

                  {phone && (
                    <div className="flex items-start gap-2.5 text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground/70">
                          Phone
                        </p>
                        <p className="text-foreground font-medium truncate">
                          {phone}
                        </p>
                      </div>
                    </div>
                  )}

                  {financeName && (
                    <div className="flex items-start gap-2.5 text-muted-foreground">
                      <Building className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground/70">
                          Finance Company
                        </p>
                        <p className="text-foreground font-medium truncate" title={financeName}>
                          {financeName}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Popover Action: User Logout */}
                {user && (
                  <div className="p-3 bg-muted/20 border-t border-border/60">
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {isLoggingOut ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Logging out...</span>
                        </>
                      ) : (
                        <>
                          <LogOut className="h-3.5 w-3.5" />
                          <span>User Logout</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </aside>
    </>
  );
}