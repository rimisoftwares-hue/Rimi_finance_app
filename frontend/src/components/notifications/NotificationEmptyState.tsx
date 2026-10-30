// src/components/notifications/NotificationEmptyState.tsx
import React from 'react';
import { BellOff, CheckCircle2, CreditCard, Users, UserCheck, Inbox, Archive } from 'lucide-react';
import { Button } from '../ui/button';
import { NotificationCategory } from '../../types/notification';

interface NotificationEmptyStateProps {
  category: NotificationCategory;
  onClearFilter?: () => void;
  hasSearchQuery?: boolean;
}

export const NotificationEmptyState: React.FC<NotificationEmptyStateProps> = ({
  category,
  onClearFilter,
  hasSearchQuery = false,
}) => {
  const getEmptyDetails = () => {
    if (hasSearchQuery) {
      return {
        icon: BellOff,
        title: 'No matching notifications',
        description: 'Try adjusting your search terms or filters to find what you are looking for.',
      };
    }

    switch (category) {
      case 'unread':
        return {
          icon: CheckCircle2,
          title: 'All caught up!',
          description: 'You have read all important updates across your finance operations.',
        };
      case 'payments':
        return {
          icon: CreditCard,
          title: 'No payment activity',
          description: 'There are no recent payment alerts, receipts, or bounce notices.',
        };
      case 'customers':
        return {
          icon: Users,
          title: 'No customer notices',
          description: 'No customer due dates or account notices pending at this time.',
        };
      case 'agents':
        return {
          icon: UserCheck,
          title: 'No agent or request alerts',
          description: 'All agent requests, proposals, and invitations have been processed.',
        };
      case 'collections':
        return {
          icon: Inbox,
          title: 'Collections clear',
          description: 'No overdue warnings or KYC follow-ups currently requiring action.',
        };
      case 'archive':
        return {
          icon: Archive,
          title: 'Archive is empty',
          description: 'Notifications you archive for later reference will appear here.',
        };
      default:
        return {
          icon: Inbox,
          title: 'No notifications',
          description: 'Important updates about payments, customers, and operations will show up here.',
        };
    }
  };

  const { icon: Icon, title, description } = getEmptyDetails();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-border bg-card/40 my-4">
      <div className="h-14 w-14 rounded-2xl bg-secondary/80 flex items-center justify-center mb-4 text-muted-foreground shadow-sm">
        <Icon className="h-7 w-7 text-primary/80" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-5 leading-relaxed">
        {description}
      </p>
      {category !== 'all' && onClearFilter && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClearFilter}
          className="rounded-xl border-border hover:bg-secondary text-xs font-medium"
        >
          View All Notifications
        </Button>
      )}
    </div>
  );
};
