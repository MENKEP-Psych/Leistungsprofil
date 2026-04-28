import React from 'react';
import { Bell } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  unreadCount: number;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}

export const NotificationBell: React.FC<Props> = ({ unreadCount, active, onClick, compact = false }) => (
  <button
    onClick={onClick}
    title="Benachrichtigungen"
    className={cn(
      'relative flex items-center justify-center rounded-xl transition-all',
      compact
        ? 'w-9 h-9 shrink-0'
        : 'w-full gap-3 px-4 py-2.5 text-sm font-medium',
      active
        ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200',
    )}
  >
    <Bell
      size={compact ? 18 : 16}
      className={cn(active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600')}
    />
    {!compact && <span className="flex-1 text-left">Benachrichtigungen</span>}
    {unreadCount > 0 && (
      <span
        className={cn(
          'absolute min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center leading-none',
          compact ? 'top-0.5 right-0.5' : 'top-1.5 left-7',
        )}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )}
  </button>
);
