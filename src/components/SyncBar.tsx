import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, Loader2, ServerCrash, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { dbSyncPull, dbSyncPush, dbSyncHasLocalChanges, dbAddAuditEntry, isElectron } from '../lib/db-api';
import { useAuth } from '../context/AuthContext';
import type { SyncResult } from '../lib/ipc-types';

interface SyncBarProps {
  serverPath: string;
  startupWarning: string;
  onSyncComplete: () => void; // Called after pull/push so the rest of the app can reload data
}

type SyncStatus = 'idle' | 'pulling' | 'pushing' | 'success' | 'error';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export const SyncBar: React.FC<SyncBarProps> = ({ serverPath, startupWarning, onSyncComplete }) => {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const lastSyncTimeRef = useRef<number>(0);

  const checkChanges = useCallback(async () => {
    if (!isElectron()) return;
    // Skip the check immediately after a sync to avoid race conditions
    if (Date.now() - lastSyncTimeRef.current < 5_000) return;
    const changed = await dbSyncHasLocalChanges();
    setHasChanges(changed);
  }, []);

  useEffect(() => {
    checkChanges();
    const interval = setInterval(checkChanges, 30_000);
    return () => clearInterval(interval);
  }, [checkChanges]);

  // Unified sync: push local changes → server auto-pulls back → check state
  const handleSync = async () => {
    if (status === 'pulling' || status === 'pushing') return;
    setStatus('pushing');
    setMessage('');
    const pushResult: SyncResult = await dbSyncPush();
    if (!pushResult.success) {
      setStatus('error');
      setMessage(pushResult.error ?? 'Synchronisierung fehlgeschlagen');
      return;
    }
    const parts: string[] = [];
    if (pushResult.newPatients > 0) parts.push(`${pushResult.newPatients} neue Pat.`);
    if (pushResult.updatedPatients > 0) parts.push(`${pushResult.updatedPatients} aktual. Pat.`);
    if (pushResult.newResults > 0) parts.push(`${pushResult.newResults} neue Erg.`);
    if (pushResult.updatedResults > 0) parts.push(`${pushResult.updatedResults} aktual. Erg.`);
    if (pushResult.updatedResults > 0 || pushResult.updatedPatients > 0) {
      dbAddAuditEntry(
        'SYNC',
        currentUser ?? 'System',
        undefined,
        `Synchronisierung: ${pushResult.updatedResults} Ergebnisse / ${pushResult.updatedPatients} Patienten wurden aktualisiert.`
      );
    }
    setStatus('success');
    setLastSync(new Date().toISOString());
    setMessage(parts.length > 0 ? `Synchronisiert: ${parts.join(', ')}` : 'Alles aktuell');
    setHasChanges(false);
    lastSyncTimeRef.current = Date.now();
    onSyncComplete();
    setTimeout(() => setStatus('idle'), 4000);
  };

  if (!serverPath) return null;

  const isBusy = status === 'pulling' || status === 'pushing';

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 border-b text-xs font-medium transition-colors shrink-0',
      startupWarning
        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
    )}>
      {/* Server path indicator */}
      <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 min-w-0 shrink-0">
        <ServerCrash size={11} className="shrink-0" />
        <span className="truncate max-w-40 text-[10px]" title={serverPath}>{serverPath}</span>
      </div>

      <div className="flex-1" />

      {/* Startup warning */}
      {startupWarning && status === 'idle' && (
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0">
          <WifiOff size={11} />
          <span className="text-[10px] hidden sm:inline">{startupWarning}</span>
        </div>
      )}

      {/* Status message */}
      {message && (
        <span className={cn(
          'text-[10px] shrink-0 flex items-center gap-1.5',
          status === 'success' && 'text-emerald-600 dark:text-emerald-400',
          status === 'error' && 'text-red-500 dark:text-red-400',
        )}>
          {status === 'success' && <CheckCircle size={10} />}
          {status === 'error' && <AlertTriangle size={10} />}
          {message}
        </span>
      )}

      {/* Last sync time */}
      {lastSync && status === 'idle' && !message && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          Zuletzt: {formatTime(lastSync)}
        </span>
      )}

      {/* Unsaved changes badge */}
      {hasChanges && status === 'idle' && (
        <span className="text-[10px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md shrink-0">
          Nicht synchronisiert
        </span>
      )}

      {/* Sync button (push + server auto-pulls back) */}
      <button
        onClick={handleSync}
        disabled={isBusy}
        title="Lokale Änderungen auf den Server übertragen und aktualisieren"
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all shrink-0',
          hasChanges
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 dark:shadow-none'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      >
        {(status === 'pushing' || status === 'pulling')
          ? <Loader2 size={12} className="animate-spin" />
          : <Upload size={12} />}
        Synchronisieren
      </button>
    </div>
  );
};
