export type NotificationCategory = 
  | 'all' 
  | 'unread' 
  | 'payments' 
  | 'customers' 
  | 'agents' 
  | 'collections' 
  | 'archive';

export type NotificationType =
  | 'customer_unpaid'
  | 'emi_overdue'
  | 'emi_reminder'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_pending'
  | 'agent_invite'
  | 'agent_join_request'
  | 'agent_record_request'
  | 'loan_approved'
  | 'loan_rejected'
  | 'collection_notice';

export type NotificationStatus = 
  | 'pending'
  | 'success'
  | 'failed'
  | 'warning'
  | 'info'
  | 'approved'
  | 'rejected'
  | 'overdue';

export type InviteNotificationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface NotificationItemData {
  id: string;
  type: NotificationType;
  category: 'payments' | 'customers' | 'agents' | 'collections' | 'system';
  title: string;
  description: string;
  timestamp: string; // ISO string
  isRead: boolean;
  isArchived: boolean;
  status?: NotificationStatus;
  statusLabel?: string;
  amount?: number;
  recordId?: string;
  customerName?: string;
  agentName?: string;
  actionLabel: string;
  actionLink: string;
  metadata?: Record<string, unknown>;
  // Direct invite notification fields
  invitationId?: string;
  financeId?: string;
  financeName?: string;
  role?: 'admin' | 'agent' | 'staff';
  invitedByName?: string;
  inviteStatus?: InviteNotificationStatus;
}

export interface NotificationFilterCounts {
  all: number;
  unread: number;
  payments: number;
  customers: number;
  agents: number;
  collections: number;
  archive: number;
}
