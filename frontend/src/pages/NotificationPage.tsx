// src/pages/NotificationPage.tsx
import React, { useState, useMemo } from 'react';
import { 
  CheckCheck, 
  RotateCw, 
  Archive,
  CheckCircle2,
  CalendarDays
} from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationCategory, NotificationItemData } from '../types/notification';
import { NotificationFilters } from '../components/notifications/NotificationFilters';
import { NotificationItem } from '../components/notifications/NotificationItem';
import { NotificationEmptyState } from '../components/notifications/NotificationEmptyState';
import { Button } from '../components/ui/button';

export default function NotificationPage() {
  const {
    notifications,
    counts,
    unreadCount,
    isLoading,
    refresh,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    archive,
    unarchive,
  } = useNotifications();

  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 350);
  };

  // Filter notifications according to category, search, and archive
  const filteredNotifications = useMemo(() => {
    return notifications.filter(item => {
      // 1. Archive filter
      if (activeCategory === 'archive') {
        if (!item.isArchived) return false;
      } else {
        if (item.isArchived) return false;
      }

      // 2. Category tabs
      if (activeCategory === 'unread') {
        if (item.isRead) return false;
      } else if (
        activeCategory === 'payments' ||
        activeCategory === 'customers' ||
        activeCategory === 'agents' ||
        activeCategory === 'collections'
      ) {
        if (item.category !== activeCategory) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        const matchesCustomer = item.customerName?.toLowerCase().includes(query) ?? false;
        const matchesAgent = item.agentName?.toLowerCase().includes(query) ?? false;
        const matchesRecord = item.recordId?.toLowerCase().includes(query) ?? false;

        if (!matchesTitle && !matchesDesc && !matchesCustomer && !matchesAgent && !matchesRecord) {
          return false;
        }
      }

      return true;
    });
  }, [notifications, activeCategory, searchQuery]);

  // Group notifications into time sections: Today, Yesterday, Earlier
  const groupedSections = useMemo(() => {
    const today: NotificationItemData[] = [];
    const yesterday: NotificationItemData[] = [];
    const earlier: NotificationItemData[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    filteredNotifications.forEach(item => {
      const itemTime = new Date(item.timestamp).getTime();
      if (itemTime >= todayStart) {
        today.push(item);
      } else if (itemTime >= yesterdayStart) {
        yesterday.push(item);
      } else {
        earlier.push(item);
      }
    });

    const sections: Array<{ title: string; items: NotificationItemData[] }> = [];
    if (today.length > 0) sections.push({ title: 'Today', items: today });
    if (yesterday.length > 0) sections.push({ title: 'Yesterday', items: yesterday });
    if (earlier.length > 0) sections.push({ title: 'Earlier', items: earlier });

    return sections;
  }, [filteredNotifications]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllInView = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map(n => n.id)));
    }
  };

  const handleBatchMarkAsRead = () => {
    selectedIds.forEach(id => markAsRead(id));
    setSelectedIds(new Set());
  };

  const handleBatchArchive = () => {
    selectedIds.forEach(id => archive(id));
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── Row 1: Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-border/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Notifications
            </h1>
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {unreadCount} unread
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground border border-border/60">
                All caught up
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Stay updated on important activity across your finance operations.
          </p>
        </div>

        {/* Global Header Actions: Refresh & Mark All as Read */}
        <div className="flex items-center gap-2.5 self-stretch sm:self-auto flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="h-9 px-3.5 rounded-xl border-border/80 hover:bg-secondary text-xs font-medium transition-all shadow-2xs"
          >
            <RotateCw className={`h-3.5 w-3.5 mr-2 ${isRefreshing ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
            <span>Refresh</span>
          </Button>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              className="h-9 px-3.5 rounded-xl border-border/80 hover:bg-primary/5 hover:border-primary/40 text-xs font-medium text-foreground hover:text-primary transition-all shadow-2xs"
            >
              <CheckCheck className="h-4 w-4 mr-2 text-primary" />
              <span>Mark all as read</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── Row 2 & Row 3: Search Toolbar & Category Filters ────────────────── */}
      <NotificationFilters
        selectedCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setSelectedIds(new Set());
        }}
        counts={counts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredNotifications.length}
      />

      {/* ─── Bulk Action Toolbar (when items are selected) ───────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20 animate-in fade-in duration-150 shadow-2xs">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredNotifications.length}
              onChange={handleSelectAllInView}
              className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4 cursor-pointer"
            />
            <span className="text-xs font-semibold text-foreground">
              {selectedIds.size} of {filteredNotifications.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchMarkAsRead}
              className="h-8 text-xs rounded-lg border-border/80 hover:bg-secondary font-medium"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" />
              Mark as read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchArchive}
              className="h-8 text-xs rounded-lg border-border/80 hover:bg-secondary font-medium"
            >
              <Archive className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              Archive
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-8 text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ─── Row 4: Notification List / Empty / Skeleton State ───────────────── */}
      {isLoading && notifications.length === 0 ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 rounded-xl bg-secondary/50 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <NotificationEmptyState
          category={activeCategory}
          hasSearchQuery={Boolean(searchQuery.trim())}
          onClearFilter={() => {
            setActiveCategory('all');
            setSearchQuery('');
          }}
        />
      ) : (
        <div className="space-y-6 pt-1">
          {groupedSections.map(section => (
            <div key={section.title} className="space-y-2.5">
              {/* Section Header */}
              <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary/70" />
                <span>{section.title}</span>
                <span className="text-[11px] font-medium text-muted-foreground/70">
                  ({section.items.length})
                </span>
              </div>

              {/* Section Item Rows */}
              <div className="space-y-2">
                {section.items.map(item => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    onMarkAsRead={markAsRead}
                    onMarkAsUnread={markAsUnread}
                    onArchive={archive}
                    onUnarchive={unarchive}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
