import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import {
  getNotificationsForUser,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  addNotification,
  countUnread,
} from '../lib/notifications';

export function useNotifications() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const reload = () => {
    if (!currentUser) return;
    setNotifications(getNotificationsForUser(currentUser));
    setUnreadCount(countUnread(currentUser));
  };

  useEffect(() => {
    reload();
    window.addEventListener('notifications_updated', reload);
    return () => window.removeEventListener('notifications_updated', reload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return {
    notifications,
    unreadCount,
    markAsRead: (id: string) => markAsRead(id),
    markAllAsRead: () => { if (currentUser) markAllAsRead(currentUser); },
    deleteNotification: (id: string) => deleteNotification(id),
    addNotification: (to: string, message: string, patientName?: string) => {
      if (currentUser) addNotification(currentUser, to, message, patientName);
    },
  };
}
