// src/components/notifications/NotificationItem.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  UserCheck,
  AlertTriangle,
  Users,
  Bell,
  ArrowUpRight,
  MoreHorizontal,
  Check,
  CheckCheck,
  Archive,
  ArchiveRestore,
  Clock,
  Tag,
  X,
  Loader2,
  Building2,
} from 'lucide-react';
import { NotificationItemData } from '../../types/notification';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { notificationService } from '../../services/notificationService';
import type { Invitation } from '../../types/invitations';

interface NotificationItemProps {
  notification: NotificationItemData;
  onMarkAsRead: (id: string) => void;
  onMarkAsUnread: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onRespondToInvite?: (
    notificationId: string,
    invitationId: string,
    decision: 'accept' | 'decline'
  ) => Promise<Invitation>;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  onUnarchive,
  onRespondToInvite,
  isSelected = false,
  onToggleSelect,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshFinanceList } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [respondingDecision, setRespondingDecision] = useState<'accept' | 'decline' | null>(
    null
  );
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  // Format relative timestamp
  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (diffDays < 7) return `${diffDays}d ago`;

      return (
        date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ` at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      );
    } catch {
      return isoString;
    }
  };

  // Category Icon & Color Theme
  const getCategoryVisuals = () => {
    switch (notification.category) {
      case 'payments':
        return {
          icon: CreditCard,
          bg: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        };
      case 'customers':
        return {
          icon: Users,
          bg: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
        };
      case 'agents':
        return {
          icon: UserCheck,
          bg: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25',
        };
      case 'collections':
        return {
          icon: AlertTriangle,
          bg: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
        };
      default:
        return {
          icon: Bell,
          bg: 'bg-secondary text-foreground border-border',
        };
    }
  };

  // Status Badge visual
  const getStatusBadge = () => {
    if (!notification.statusLabel) return null;

    let badgeClass = 'bg-secondary text-muted-foreground border-border';
    if (notification.status === 'success') {
      badgeClass = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
    } else if (notification.status === 'overdue' || notification.status === 'failed') {
      badgeClass = 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25';
    } else if (notification.status === 'warning' || notification.status === 'pending') {
      badgeClass = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25';
    } else if (notification.status === 'info') {
      badgeClass = 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25';
    }

    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-tight border ${badgeClass}`}
      >
        {notification.statusLabel}
      </span>
    );
  };

  const visuals = getCategoryVisuals();
  const IconComponent = visuals.icon;

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
    navigate(notification.actionLink);
  };

  const handleInviteDecision = async (
    e: React.MouseEvent,
    decision: 'accept' | 'decline'
  ) => {
    e.stopPropagation();
    if (!notification.invitationId || respondingDecision) return;

    setRespondingDecision(decision);
    try {
      const responder = onRespondToInvite
        ? onRespondToInvite
        : (nId: string, invId: string, dec: 'accept' | 'decline') =>
            notificationService.respondToInvite(nId, invId, dec);

      const updated = await responder(notification.id, notification.invitationId, decision);
      const roleLabel =
        updated.role.charAt(0).toUpperCase() + updated.role.slice(1);

      if (decision === 'accept') {
        await refreshFinanceList().catch(() => {});
        toast({
          title: `You joined ${updated.financeName} as ${roleLabel}`,
          description: `${updated.targetUser?.displayName || 'Your account'} now has access to ${updated.financeName}.`,
        });
      } else {
        toast({
          title: 'Declined',
          description: `You declined the invitation to join ${updated.financeName}.`,
        });
      }
    } catch (err: unknown) {
      toast({
        title: 'Unable to respond to invitation',
        description: err instanceof Error ? err.message : 'An error occurred.',
        variant: 'destructive',
      });
    } finally {
      setRespondingDecision(null);
    }
  };

  const isDirectAgentInvite =
    notification.type === 'agent_invite' && Boolean(notification.invitationId);
  const isPendingDirectInvite =
    isDirectAgentInvite && notification.inviteStatus === 'pending';
  const roleDisplay = notification.role
    ? notification.role.charAt(0).toUpperCase() + notification.role.slice(1)
    : 'Agent';

  return (
    <div
      onClick={() => {
        if (!notification.isRead) {
          onMarkAsRead(notification.id);
        }
      }}
      className={`group relative flex flex-col sm:flex-row sm:items-start gap-3.5 p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
        notification.isRead
          ? 'bg-card/50 hover:bg-card border-border/70 hover:border-border text-muted-foreground'
          : 'bg-card hover:bg-card border-primary/30 hover:border-primary/50 shadow-sm text-foreground'
      }`}
    >
      {/* Unread Left Border Highlight */}
      {!notification.isRead && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-md" />
      )}

      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        {/* Select Checkbox */}
        {onToggleSelect && (
          <div
            onClick={e => {
              e.stopPropagation();
              onToggleSelect(notification.id);
            }}
            className="pt-1 flex-shrink-0"
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4 cursor-pointer"
            />
          </div>
        )}

        {/* Category Icon Badge */}
        <div
          className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${visuals.bg} shadow-2xs`}
        >
          <IconComponent className="h-4.5 w-4.5" />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 pr-1">
          {/* Title, Unread Dot, and Status Badge */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4
              className={`text-sm tracking-tight ${
                notification.isRead
                  ? 'font-medium text-foreground/85'
                  : 'font-semibold text-foreground'
              }`}
            >
              {notification.title}
            </h4>

            {!notification.isRead && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" title="Unread" />
            )}

            {getStatusBadge()}
          </div>

          {/* Concise Description */}
          <p
            className={`text-xs sm:text-sm line-clamp-2 leading-relaxed ${
              notification.isRead ? 'text-muted-foreground/90' : 'text-foreground/80'
            }`}
          >
            {notification.description}
          </p>

          {/* Direct Invite Details */}
          {isDirectAgentInvite && notification.financeName && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-[11px] font-medium text-foreground border border-border">
                <Building2 className="h-3 w-3 text-primary" />
                {notification.financeName} · {roleDisplay}
              </span>
            </div>
          )}

          {/* Metadata Footer: Timestamp, Amount, Record ID */}
          <div className="flex flex-wrap items-center gap-2.5 mt-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" />
              {formatTimestamp(notification.timestamp)}
            </span>

            {notification.recordId && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary font-mono text-[10px] text-muted-foreground border border-border/50">
                <Tag className="h-2.5 w-2.5 opacity-70" />
                {notification.recordId}
              </span>
            )}

            {notification.amount !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-secondary/80 font-semibold text-foreground border border-border/40">
                ₹{notification.amount.toLocaleString('en-IN')}
              </span>
            )}

            {notification.customerName && (
              <span className="hidden sm:inline-flex items-center text-muted-foreground/80 font-medium">
                • {notification.customerName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Controls: Accept/Decline for Pending Direct Invites OR Contextual Action Button & Menu */}
      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        {isPendingDirectInvite ? (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Button
              type="button"
              size="sm"
              disabled={respondingDecision !== null}
              onClick={e => handleInviteDecision(e, 'accept')}
              className="h-8 px-3 text-xs gap-1.5"
            >
              {respondingDecision === 'accept' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={respondingDecision !== null}
              onClick={e => handleInviteDecision(e, 'decline')}
              className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {respondingDecision === 'decline' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Decline
            </Button>
          </div>
        ) : (
          <button
            onClick={handleActionClick}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border/80 hover:border-primary transition-all duration-150 shadow-2xs"
          >
            <span>{notification.actionLabel}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Action Dropdown Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-border transition-colors cursor-pointer"
            title="Notification options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-border bg-card shadow-lg z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
              {notification.isRead ? (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onMarkAsUnread(notification.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-secondary flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Mark as unread</span>
                </button>
              ) : (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onMarkAsRead(notification.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-secondary flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Mark as read</span>
                </button>
              )}

              {notification.isArchived ? (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onUnarchive(notification.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-secondary flex items-center gap-2 transition-colors border-t border-border/50 cursor-pointer"
                >
                  <ArchiveRestore className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Move to Inbox</span>
                </button>
              ) : (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onArchive(notification.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-secondary flex items-center gap-2 transition-colors border-t border-border/50 cursor-pointer"
                >
                  <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Archive</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
