import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import { isElectron } from '../lib/db-api';
import {
  loadAllNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  addNotification,
} from '../lib/notifications';

export function useNotifications() {
  const { currentUser } = useAuth();
  const [all, setAll] = useState<Notification[]>([]);

  const reload = useCallback(async () => {
    setAll(await loadAllNotifications());
  }, []);

  useEffect(() => {
    reload();
    const onUpd = () => { reload(); };
    window.addEventListener('notifications_updated', onUpd);
    // Geräteübergreifend: gemeinsame Datei regelmäßig abrufen (wie Patientendaten-Polling).
    let poll: ReturnType<typeof setInterval> | undefined;
    if (isElectron()) poll = setInterval(reload, 30_000);
    return () => {
      window.removeEventListener('notifications_updated', onUpd);
      if (poll) clearInterval(poll);
    };
  }, [reload]);

  const notifications = currentUser
    ? all
        .filter(n => n.toUser === currentUser)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const unreadCount = currentUser
    ? all.filter(n => n.toUser === currentUser && !n.isRead).length
    : 0;

  return {
    notifications,
    unreadCount,
    markAsRead: (id: string) => { void markAsRead(id); },
    markAllAsRead: () => { if (currentUser) void markAllAsRead(currentUser); },
    deleteNotification: (id: string) => { void deleteNotification(id); },
    addNotification: (to: string, message: string, patientName?: string) => {
      if (currentUser) void addNotification(currentUser, to, message, patientName);
    },
  };
}
