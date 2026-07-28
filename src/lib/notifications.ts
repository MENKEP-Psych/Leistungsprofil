import { Notification } from '../types';
import { isElectron, dbGetNotifications, dbSetNotifications } from './db-api';

// Gemeinsame Quelle für Benachrichtigungen:
// - Electron-Betrieb: JSON-Datei `notifications.json` auf der Server-Freigabe
//   (geräteübergreifend, gleiches Muster wie Normen/Textbausteine).
// - Web/Dev: localStorage als Fallback.
// Mutationen lesen die Datei frisch, ändern sie und schreiben zurück
// (Read-Modify-Write), damit gleichzeitige Sender sich möglichst wenig überschreiben.

const KEY = 'leistungsprofil_notifications_v1';

export async function loadAllNotifications(): Promise<Notification[]> {
  if (isElectron()) {
    try {
      const raw = await dbGetNotifications();
      return raw ? (JSON.parse(raw) as Notification[]) : [];
    } catch {
      return [];
    }
  }
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Notification[];
  } catch {
    return [];
  }
}

async function saveAll(notifications: Notification[]): Promise<void> {
  if (isElectron()) {
    await dbSetNotifications(JSON.stringify(notifications)).catch(() => {});
  } else {
    localStorage.setItem(KEY, JSON.stringify(notifications));
  }
  // Lokale Hörer sofort aktualisieren; andere Geräte holen per Polling nach.
  window.dispatchEvent(new Event('notifications_updated'));
}

export async function addNotification(
  from: string,
  to: string,
  message: string,
  patientName?: string,
  autoSent?: boolean,
): Promise<Notification> {
  const all = await loadAllNotifications();
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
  await saveAll([n, ...all]);
  return n;
}

export async function markAsRead(id: string): Promise<void> {
  const all = await loadAllNotifications();
  await saveAll(all.map(n => (n.id === id ? { ...n, isRead: true } : n)));
}

export async function markAllAsRead(username: string): Promise<void> {
  const all = await loadAllNotifications();
  await saveAll(all.map(n => (n.toUser === username ? { ...n, isRead: true } : n)));
}

export async function deleteNotification(id: string): Promise<void> {
  const all = await loadAllNotifications();
  await saveAll(all.filter(n => n.id !== id));
}
