// src/hooks/useNotifications.ts
import { useState, useEffect, useCallback } from 'react';
import { NotificationItemData, NotificationFilterCounts } from '../types/notification';
import { notificationService } from '../services/notificationService';

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItemData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await notificationService.getNotifications();
      setNotifications(data);
    } catch (err: unknown) {
      console.error('Failed to load notifications:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load notifications';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const unsubscribe = notificationService.subscribe(() => {
      fetchNotifications();
    });
    return unsubscribe;
  }, [fetchNotifications]);

  const counts: NotificationFilterCounts = notificationService.calculateCounts(notifications);

  const markAsRead = useCallback((id: string) => {
    notificationService.markAsRead(id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAsUnread = useCallback((id: string) => {
    notificationService.markAsUnread(id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isRead: false } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const archive = useCallback((id: string) => {
    notificationService.archive(id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isArchived: true } : n))
    );
  }, []);

  const unarchive = useCallback((id: string) => {
    notificationService.unarchive(id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isArchived: false } : n))
    );
  }, []);

  return {
    notifications,
    counts,
    unreadCount: counts.unread,
    isLoading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    archive,
    unarchive,
  };
}
