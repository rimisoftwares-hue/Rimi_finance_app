// src/services/notificationService.ts
import apiClient from '../api/apiClient';
import type { Invitation } from '../types/invitations';
import {
  InviteNotificationStatus,
  NotificationFilterCounts,
  NotificationItemData,
  NotificationStatus,
} from '../types/notification';
import { deriveInvitationStatus, invitationService } from './invitationService';

const STORAGE_KEY_READ = 'autofinex_notifications_read_v1';
const STORAGE_KEY_ARCHIVED = 'autofinex_notifications_archived_v1';
const UPDATE_EVENT = 'autofinex_notifications_updated';

// Cache recently responded invitations in the session so the Accepted/Declined state remains visible
const respondedInvitesCache = new Map<string, Invitation>();

// Forward invitation updates to notification listeners
invitationService.subscribe(() => {
  notifyListeners();
});

// Helpers to get persistent read/archive sets
function getReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_READ);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadSet(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage error
  }
  notifyListeners();
}

function getArchivedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ARCHIVED);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveArchivedSet(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY_ARCHIVED, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage error
  }
  notifyListeners();
}

function notifyListeners() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

// Generate realistic fixed timestamps relative to now for consistency
function getTimestamp(offsetHours: number): string {
  const date = new Date(Date.now() - offsetHours * 60 * 60 * 1000);
  return date.toISOString();
}

function formatRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function mapDirectInvitationToNotification(
  inv: Invitation,
  readSet: Set<string>,
  archivedSet: Set<string>
): NotificationItemData {
  const notifId = `notif-invite-${inv.id}`;
  const derived = deriveInvitationStatus(inv);

  let inviteStatus: InviteNotificationStatus = 'pending';
  if (derived === 'accepted') {
    inviteStatus = 'accepted';
  } else if (derived === 'declined') {
    inviteStatus = 'declined';
  } else if (derived === 'cancelled' || derived === 'expired') {
    inviteStatus = 'cancelled';
  }

  const roleLabel = formatRoleLabel(inv.role);
  const targetName = inv.targetUser?.displayName || 'You';
  const targetHandle = inv.targetUser?.username ? `@${inv.targetUser.username}` : '';

  let title = `Company Invitation — ${inv.financeName}`;
  let description = `${inv.createdByName} invited ${targetName} ${targetHandle ? `(${targetHandle}) ` : ''}to join ${inv.financeName} as ${roleLabel}.`;
  let status: NotificationStatus = 'pending';
  let statusLabel = 'Invite Pending';
  let isRead = readSet.has(notifId);

  if (inviteStatus === 'accepted') {
    title = `You joined ${inv.financeName} as ${roleLabel}`;
    description = `${targetName} accepted the invitation from ${inv.createdByName} and joined ${inv.financeName} as ${roleLabel}.`;
    status = 'success';
    statusLabel = 'Accepted';
    isRead = true;
  } else if (inviteStatus === 'declined') {
    title = 'Declined';
    description = `Invitation from ${inv.createdByName} to join ${inv.financeName} as ${roleLabel} was declined.`;
    status = 'failed';
    statusLabel = 'Declined';
    isRead = true;
  } else if (inviteStatus === 'cancelled') {
    title = `Invitation Cancelled — ${inv.financeName}`;
    description = `The direct invitation to join ${inv.financeName} as ${roleLabel} is no longer active.`;
    status = 'info';
    statusLabel = 'Cancelled';
    isRead = true;
  }

  return {
    id: notifId,
    type: 'agent_invite',
    category: 'agents',
    title,
    description,
    timestamp: inv.createdAt,
    isRead,
    isArchived: archivedSet.has(notifId),
    status,
    statusLabel,
    agentName: targetName,
    recordId: inv.staffCode || inv.id.toUpperCase().slice(0, 12),
    actionLabel: inviteStatus === 'accepted' ? 'View Users' : 'View Invites',
    actionLink: inviteStatus === 'accepted' ? '/AgentManagement' : '/invite',
    invitationId: inv.id,
    financeId: inv.financeId,
    financeName: inv.financeName,
    role: inv.role,
    invitedByName: inv.createdByName,
    inviteStatus,
    metadata: {
      role: inv.role,
      financeId: inv.financeId,
      financeName: inv.financeName,
      invitedByName: inv.createdByName,
      inviteStatus,
    },
  };
}

// Curated operational notifications reflecting real AutoFinex features
const operationalSeedNotifications: NotificationItemData[] = [
  {
    id: 'seed-agent-req-01',
    type: 'agent_join_request',
    category: 'agents',
    title: 'New Agent Join Request',
    description:
      'Ramesh Kumar (Staff ID: STF-104) has requested onboarding access for Salem North branch.',
    timestamp: getTimestamp(1.5), // Today, 1.5 hours ago
    isRead: false,
    isArchived: false,
    status: 'pending',
    statusLabel: 'Pending Approval',
    agentName: 'Ramesh Kumar',
    recordId: 'STF-104',
    actionLabel: 'Review Request',
    actionLink: '/AgentManagement',
    metadata: { phone: '9842109876', branch: 'Salem North' },
  },
  {
    id: 'seed-pay-01',
    type: 'payment_success',
    category: 'payments',
    title: 'Payment Received — HPL 931',
    description:
      'EMI payment of ₹15,000 received for Selva Prabu (Yamaha FZ-S, TN38 DP 7000) via Cash.',
    timestamp: getTimestamp(3), // Today, 3 hours ago
    isRead: false,
    isArchived: false,
    status: 'success',
    statusLabel: 'Collected',
    amount: 15000,
    customerName: 'Selva Prabu',
    recordId: 'HPL 931',
    actionLabel: 'View Payment',
    actionLink: '/paymentReport',
    metadata: { billNumber: 'REC-2024-889', collectedBy: 'Karthik Raja' },
  },
  {
    id: 'seed-col-01',
    type: 'emi_overdue',
    category: 'collections',
    title: 'Critical Overdue: Suresh Babu (HPL 412)',
    description:
      '6 installments overdue (₹37,000 outstanding) on Honda Activa 6G (TN45 AB 3210). Collection team assigned.',
    timestamp: getTimestamp(5.5), // Today, 5.5 hours ago
    isRead: false,
    isArchived: false,
    status: 'overdue',
    statusLabel: 'Overdue 65 Days',
    amount: 37000,
    customerName: 'Suresh Babu',
    recordId: 'HPL 412',
    actionLabel: 'View Collections',
    actionLink: '/collections/pending',
    metadata: { vehicle: 'TN45 AB 3210', missedEmis: 6 },
  },
  {
    id: 'seed-agent-rec-01',
    type: 'agent_record_request',
    category: 'agents',
    title: 'Vehicle Loan Application Submitted',
    description:
      'Agent Saravanan submitted a new vehicle finance proposal for Priya Devi (Hero Splendor Plus).',
    timestamp: getTimestamp(18), // Yesterday
    isRead: false,
    isArchived: false,
    status: 'info',
    statusLabel: 'Under Review',
    amount: 65000,
    customerName: 'Priya Devi',
    agentName: 'Saravanan M',
    recordId: 'REQ-8821',
    actionLabel: 'Review Loan Request',
    actionLink: '/loanRequests',
    metadata: { vehicleType: 'Two Wheeler', requestedAmount: 65000 },
  },
  {
    id: 'seed-cust-unpaid-01',
    type: 'customer_unpaid',
    category: 'customers',
    title: 'Upcoming Due Date Reminder',
    description:
      'Scheduled EMI of ₹4,250 for Manoj Singh (Bajaj Pulsar 150) is due tomorrow.',
    timestamp: getTimestamp(22), // Yesterday
    isRead: true,
    isArchived: false,
    status: 'warning',
    statusLabel: 'Due Soon',
    amount: 4250,
    customerName: 'Manoj Singh',
    recordId: 'HPL 778',
    actionLabel: 'View Customer',
    actionLink: '/unpaidloans',
    metadata: { dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0] },
  },
  {
    id: 'seed-col-kyc-01',
    type: 'collection_notice',
    category: 'collections',
    title: 'KYC Document Verification Required',
    description:
      'Aadhaar & RC verification pending for loan account HPL 650 (Lakshmi Narasimhan).',
    timestamp: getTimestamp(48), // 2 days ago
    isRead: true,
    isArchived: false,
    status: 'warning',
    statusLabel: 'KYC Pending',
    customerName: 'Lakshmi Narasimhan',
    recordId: 'HPL 650',
    actionLabel: 'View KYC Collections',
    actionLink: '/collections/kyc',
    metadata: { missingDocs: ['RC Copy', 'Address Proof'] },
  },
  {
    id: 'seed-pay-02',
    type: 'payment_failed',
    category: 'payments',
    title: 'NACH / Auto-Debit Return Notice',
    description:
      'Auto-debit of ₹6,500 bounced for account HPL 103 (Arun Prakash) due to insufficient funds.',
    timestamp: getTimestamp(56), // Earlier
    isRead: true,
    isArchived: false,
    status: 'failed',
    statusLabel: 'Mandate Return',
    amount: 6500,
    customerName: 'Arun Prakash',
    recordId: 'HPL 103',
    actionLabel: 'View Payment Record',
    actionLink: '/paymentReport',
    metadata: { bounceCharge: 350 },
  },
];

export const notificationService = {
  /**
   * Subscribe to notification updates
   */
  subscribe(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener(UPDATE_EVENT, handler);
    return () => window.removeEventListener(UPDATE_EVENT, handler);
  },

  /**
   * Fetch all notifications, merging live backend data, direct invitations, and AutoFinex operational events
   */
  async getNotifications(): Promise<NotificationItemData[]> {
    const readSet = getReadSet();
    const archivedSet = getArchivedSet();
    const liveNotifications: NotificationItemData[] = [];

    interface UnpaidCustomerRaw {
      id?: string | number;
      hplno?: string;
      cname?: string;
      dueAmount?: number;
      dueMonth?: number;
      vehicleName?: string;
      vehicleNumber?: string;
    }

    interface PaymentReportItemRaw {
      id?: string | number;
      customerName?: string;
      customerHplno?: string;
      total?: number;
      payment?: number;
      paymentMode?: string;
      collected_by?: string;
      date?: string;
      billNumber?: string;
    }

    // 0. Include real pending direct invitations for the logged-in user (plus recently responded in this session)
    try {
      const pendingDirectInvites = await invitationService.listPendingDirectInvitesForUser();
      const mergedMap = new Map<string, Invitation>();
      respondedInvitesCache.forEach((inv, id) => mergedMap.set(id, inv));
      pendingDirectInvites.forEach(inv => mergedMap.set(inv.id, inv));

      mergedMap.forEach(inv => {
        liveNotifications.push(
          mapDirectInvitationToNotification(inv, readSet, archivedSet)
        );
      });
    } catch {
      // Ignore if unauthenticated or owner-only session
    }

    // Attempt to pull real live operational data from backend
    try {
      // 1. Unpaid customers
      const unpaidRes = await apiClient
        .get('/customers/unpaidcustomers', { timeout: 3000 })
        .catch(() => null);
      if (unpaidRes?.data?.success && Array.isArray(unpaidRes.data.customers)) {
        const topUnpaid = (unpaidRes.data.customers as UnpaidCustomerRaw[]).slice(0, 4);
        topUnpaid.forEach(cust => {
          const id = `live-unpaid-${cust.hplno || cust.id}`;
          liveNotifications.push({
            id,
            type: (cust.dueMonth ?? 0) > 2 ? 'emi_overdue' : 'customer_unpaid',
            category: (cust.dueMonth ?? 0) > 2 ? 'collections' : 'customers',
            title: `Unpaid EMI Notice: ${cust.cname || 'Customer'}`,
            description: `${cust.cname || 'Customer'} (${cust.hplno || ''}) has ${cust.dueMonth || 1} pending EMI totaling ₹${(cust.dueAmount || 0).toLocaleString('en-IN')} on ${cust.vehicleName || 'vehicle'}.`,
            timestamp: getTimestamp(2),
            isRead: readSet.has(id),
            isArchived: archivedSet.has(id),
            status: (cust.dueMonth ?? 0) > 2 ? 'overdue' : 'warning',
            statusLabel:
              (cust.dueMonth ?? 0) > 2 ? `${cust.dueMonth} Months Due` : 'Payment Due',
            amount: cust.dueAmount,
            customerName: cust.cname,
            recordId: cust.hplno,
            actionLabel: 'View Unpaid Account',
            actionLink: '/unpaidloans',
            metadata: { vehicleNumber: cust.vehicleNumber },
          });
        });
      }
    } catch {
      // Graceful fallback to seed operational data
    }

    try {
      // 2. Recent payments
      const paymentsRes = await apiClient
        .get('/payments/report?type=today', { timeout: 3000 })
        .catch(() => null);
      if (paymentsRes?.data?.success && Array.isArray(paymentsRes.data.payments)) {
        const recentPayments = (paymentsRes.data.payments as PaymentReportItemRaw[]).slice(0, 3);
        recentPayments.forEach(pmt => {
          const id = `live-pmt-${pmt.id}`;
          liveNotifications.push({
            id,
            type: 'payment_success',
            category: 'payments',
            title: `Payment Received: ${pmt.customerName || 'Customer'}`,
            description: `Payment of ₹${(pmt.total || pmt.payment || 0).toLocaleString('en-IN')} received via ${pmt.paymentMode || 'Cash'} by collector ${pmt.collected_by || 'Staff'}.`,
            timestamp: pmt.date ? new Date(pmt.date).toISOString() : getTimestamp(4),
            isRead: readSet.has(id),
            isArchived: archivedSet.has(id),
            status: 'success',
            statusLabel: 'Received',
            amount: pmt.total || pmt.payment,
            customerName: pmt.customerName,
            recordId: pmt.customerHplno,
            actionLabel: 'View Payment',
            actionLink: '/paymentReport',
            metadata: { billNumber: pmt.billNumber },
          });
        });
      }
    } catch {
      // Graceful fallback
    }

    // Merge operational seeds
    const seedsWithState = operationalSeedNotifications.map(item => ({
      ...item,
      isRead: readSet.has(item.id) ? true : item.isRead,
      isArchived: archivedSet.has(item.id),
    }));

    // Combine and sort descending by timestamp
    const all = [...liveNotifications, ...seedsWithState];
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return all;
  },

  /**
   * Respond to a direct `agent_invite` notification (Accept or Decline)
   */
  async respondToInvite(
    notificationId: string,
    invitationId: string,
    decision: 'accept' | 'decline'
  ): Promise<Invitation> {
    const updated = await invitationService.respondToInvitation(invitationId, decision);
    respondedInvitesCache.set(invitationId, updated);
    this.markAsRead(notificationId);
    return updated;
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const list = await this.getNotifications();
    return list.filter(n => !n.isRead && !n.isArchived).length;
  },

  /**
   * Mark a single notification as read
   */
  markAsRead(id: string) {
    const set = getReadSet();
    set.add(id);
    saveReadSet(set);
  },

  /**
   * Mark a single notification as unread
   */
  markAsUnread(id: string) {
    const set = getReadSet();
    set.delete(id);
    saveReadSet(set);
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    const list = await this.getNotifications();
    const set = getReadSet();
    list.forEach(n => set.add(n.id));
    saveReadSet(set);
  },

  /**
   * Archive a notification
   */
  archive(id: string) {
    const set = getArchivedSet();
    set.add(id);
    saveArchivedSet(set);
  },

  /**
   * Unarchive a notification (restore to inbox)
   */
  unarchive(id: string) {
    const set = getArchivedSet();
    set.delete(id);
    saveArchivedSet(set);
  },

  /**
   * Calculate counts for all filter tabs
   */
  calculateCounts(notifications: NotificationItemData[]): NotificationFilterCounts {
    const active = notifications.filter(n => !n.isArchived);
    return {
      all: active.length,
      unread: active.filter(n => !n.isRead).length,
      payments: active.filter(n => n.category === 'payments').length,
      customers: active.filter(n => n.category === 'customers').length,
      agents: active.filter(n => n.category === 'agents').length,
      collections: active.filter(n => n.category === 'collections').length,
      archive: notifications.filter(n => n.isArchived).length,
    };
  },
};
