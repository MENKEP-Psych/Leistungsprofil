import React, { useState, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Notification } from '../types';
import { addNotification } from '../lib/notifications';
import { dbGetUsers } from '../lib/db-api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

interface Props {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

export const NotificationsTab: React.FC<Props> = ({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}) => {
  const { currentUser } = useAuth();
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toUser, setToUser] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    dbGetUsers().then(users => {
      setAllUsers(users.map(u => u.username).filter(u => u !== currentUser));
    });
  }, [currentUser]);

  const handleSend = () => {
    if (!toUser || !message.trim() || !currentUser) return;
    setSending(true);
    addNotification(currentUser, toUser, message.trim());
    setSending(false);
    setSent(true);
    setToUser('');
    setMessage('');
    setTimeout(() => setSent(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell size={22} className="text-indigo-500" />
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">Benachrichtigungen</h2>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-black">
            {unreadCount} ungelesen
          </span>
        )}
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllAsRead}
            className="ml-auto flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
          >
            <CheckCheck size={13} />
            Alle als gelesen markieren
          </button>
        )}
      </div>

      {/* Compose */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setComposeOpen(o => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <Send size={14} className="text-indigo-500" />
          Neue Nachricht verfassen
          <span className="ml-auto">
            {composeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {composeOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 w-14 shrink-0">An:</label>
              <select
                value={toUser}
                onChange={e => setToUser(e.target.value)}
                className="flex-1 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">— Empfänger wählen —</option>
                {allUsers.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <label className="text-xs font-bold text-slate-500 w-14 shrink-0 pt-1.5">Nachricht:</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="Nachricht eingeben…"
                className="flex-1 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              {sent && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 self-center">
                  Nachricht gesendet ✓
                </span>
              )}
              <button
                onClick={handleSend}
                disabled={!toUser || !message.trim() || sending}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors',
                  toUser && message.trim()
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed',
                )}
              >
                <Send size={13} />
                Senden
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Bell size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">Keine Benachrichtigungen</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className={cn(
                'rounded-2xl border px-4 py-3 flex gap-3 items-start transition-colors',
                n.isRead
                  ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                    Von: {n.fromUser}
                  </span>
                  {n.autoSent && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                      Automatisch
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                {n.patientName && (
                  <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1">
                    Patient: {n.patientName}
                  </div>
                )}
                <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
                  {n.message}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {!n.isRead && (
                  <button
                    onClick={() => onMarkAsRead(n.id)}
                    title="Als gelesen markieren"
                    className="p-1 rounded text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
                <button
                  onClick={() => onDelete(n.id)}
                  title="Löschen"
                  className="p-1 rounded text-slate-300 dark:text-slate-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
