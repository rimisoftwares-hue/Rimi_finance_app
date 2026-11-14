// src/components/notifications/NotificationFilters.tsx
import React from 'react';
import { 
  Inbox, 
  BellRing, 
  CreditCard, 
  Users, 
  UserCheck, 
  AlertTriangle, 
  Archive, 
  Search,
  X,
  KeyRound,
  RotateCw,
  CheckCheck
} from 'lucide-react';
import { NotificationCategory, NotificationFilterCounts } from '../../types/notification';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export interface NotificationFiltersProps {
  selectedCategory: NotificationCategory;
  onSelectCategory: (category: NotificationCategory) => void;
  counts: NotificationFilterCounts;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCount?: number;
  onJoinCodeClick?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
  onMarkAllAsRead?: () => void;
  unreadCount?: number;
}

export const NotificationFilters: React.FC<NotificationFiltersProps> = ({
  selectedCategory,
  onSelectCategory,
  counts,
  searchQuery,
  onSearchChange,
  filteredCount,
  onJoinCodeClick,
  onRefresh,
  isRefreshing = false,
  isLoading = false,
  onMarkAllAsRead,
  unreadCount = 0,
}) => {
  const filterTabs: Array<{
    id: NotificationCategory;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
  }> = [
    { id: 'all', label: 'All Activity', icon: Inbox, count: counts.all },
    { id: 'unread', label: 'Unread', icon: BellRing, count: counts.unread },
    { id: 'payments', label: 'Payments', icon: CreditCard, count: counts.payments },
    { id: 'customers', label: 'Customers', icon: Users, count: counts.customers },
    { id: 'agents', label: 'Agents & Requests', icon: UserCheck, count: counts.agents },
    { id: 'collections', label: 'Collections & Overdue', icon: AlertTriangle, count: counts.collections },
    { id: 'archive', label: 'Archive', icon: Archive, count: counts.archive },
  ];

  return (
    <div className="space-y-3.5">
      {/* ─── Row 2: Search Toolbar & Global Actions ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Left: Search Input */}
        <div className="relative w-full sm:w-[340px] md:w-[380px] lg:w-[420px] flex-shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notifications by customer, payment, agent, or reference ID..."
            className="pl-9 pr-9 h-9 text-xs sm:text-sm rounded-xl bg-card border-border/80 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground/60 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-secondary transition-colors cursor-pointer"
              title="Clear search"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right: Actions Toolbar (Join with Code, Refresh & Mark All as Read) */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap justify-start sm:justify-end">
          {onJoinCodeClick && (
            <Button
              variant="outline"
              size="sm"
              onClick={onJoinCodeClick}
              className="h-9 px-3.5 rounded-xl border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 mr-2 text-primary" />
              <span>Join with Code</span>
            </Button>
          )}

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing || isLoading}
              className="h-9 px-3.5 rounded-xl border-border/80 hover:bg-secondary text-xs font-medium transition-all shadow-2xs cursor-pointer"
            >
              <RotateCw className={`h-3.5 w-3.5 mr-2 ${isRefreshing ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
              <span>Refresh</span>
            </Button>
          )}

          {onMarkAllAsRead && unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkAllAsRead}
              className="h-9 px-3.5 rounded-xl border-border/80 hover:bg-primary/5 hover:border-primary/40 text-xs font-medium text-foreground hover:text-primary transition-all shadow-2xs cursor-pointer"
            >
              <CheckCheck className="h-4 w-4 mr-2 text-primary" />
              <span>Mark all as read</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── Row 3: Dedicated Notification Category Filters ─── */}
      <div className="border-t border-border/60 pt-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
          {filterTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectCategory(tab.id)}
                className={`flex items-center gap-2 h-9 px-3.5 rounded-xl text-xs sm:text-sm whitespace-nowrap transition-all duration-150 border cursor-pointer ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm font-semibold'
                    : 'bg-card text-muted-foreground border-border/80 hover:bg-secondary hover:text-foreground hover:border-border font-medium'
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none ${
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : tab.id === 'unread' && counts.unread > 0
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : 'bg-secondary text-muted-foreground border border-border/50'
                    }`}
                  >
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
