import { Notification } from '../types';

const KEY = 'leistungsprofil_notifications_v1';

function load(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Notification[];
  } catch {
    return [];
  }
}

function save(notifications: Notification[]): void {
  localStorage.setItem(KEY, JSON.stringify(notifications));
}

export function getNotificationsForUser(username: string): Notification[] {
  return load()
    .filter(n => n.toUser === username)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addNotification(
  from: string,
  to: string,
  message: string,
  patientName?: string,
  autoSent?: boolean
): Notification {
  const all = load();
  const n: Notification = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    fromUser: from,
    toUser: to,
    message,
    patientName,
    isRead: false,
    createdAt: new Date().toISOString(),
    autoSent,
  };
  save([n, ...all]);
  window.dispatchEvent(new Event('notifications_updated'));
  return n;
}

export function markAsRead(id: string): void {
  const all = load().map(n => n.id === id ? { ...n, isRead: true } : n);
  save(all);
  window.dispatchEvent(new Event('notifications_updated'));
}

export function markAllAsRead(username: string): void {
  const all = load().map(n => n.toUser === username ? { ...n, isRead: true } : n);
  save(all);
  window.dispatchEvent(new Event('notifications_updated'));
}

export function deleteNotification(id: string): void {
  save(load().filter(n => n.id !== id));
  window.dispatchEvent(new Event('notifications_updated'));
}

export function countUnread(username: string): number {
  return load().filter(n => n.toUser === username && !n.isRead).length;
}
