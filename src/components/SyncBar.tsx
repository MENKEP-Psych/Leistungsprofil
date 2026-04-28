import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Upload, CheckCircle, AlertTriangle, Loader2, ServerCrash, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { dbSyncPull, dbSyncPush, dbSyncHasLocalChanges, isElectron } from '../lib/db-api';
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
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const checkChanges = useCallback(async () => {
    if (!isElectron()) return;
    const changed = await dbSyncHasLocalChanges();
    setHasChanges(changed);
  }, []);

  useEffect(() => {
    checkChanges();
    const interval = setInterval(checkChanges, 30_000);
    return () => clearInterval(interval);
  }, [checkChanges]);

  const handlePull = async () => {
    if (status === 'pulling' || status === 'pushing') return;
    if (hasChanges) {
      setStatus('error');
      setMessage('Ungespeicherte Änderungen — bitte erst synchronisieren (↑).');
      return;
    }
    setStatus('pulling');
    setMessage('');
    const result = await dbSyncPull();
    if (result.success) {
      setStatus('success');
      setLastSync(new Date().toISOString());
      setMessage('Aktualisiert');
      onSyncComplete();
      await checkChanges();
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('error');
      setMessage(result.error ?? 'Aktualisierung fehlgeschlagen');
    }
  };

  const handlePush = async () => {
    if (status === 'pulling' || status === 'pushing') return;
    setStatus('pushing');
    setMessage('');
    const result: SyncResult = await dbSyncPush();
    if (result.success) {
      const parts: string[] = [];
      if (result.newPatients > 0) parts.push(`${result.newPatients} neue Pat.`);
      if (result.updatedPatients > 0) parts.push(`${result.updatedPatients} aktual. Pat.`);
      if (result.newResults > 0) parts.push(`${result.newResults} neue Erg.`);
      if (result.updatedResults > 0) parts.push(`${result.updatedResults} aktual. Erg.`);
      setStatus('success');
      setLastSync(new Date().toISOString());
      setMessage(parts.length > 0 ? `Synchronisiert: ${parts.join(', ')}` : 'Alles bereits aktuell');
      setHasChanges(false);
      setTimeout(() => setStatus('idle'), 4000);
    } else {
      setStatus('error');
      setMessage(result.error ?? 'Synchronisierung fehlgeschlagen');
    }
  };

  if (!serverPath) return null;

  const isBusy = status === 'pulling' || status === 'pushing';

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 border-b text-xs font-medium transition-colors shrink-0',
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
      {message && status !== 'idle' && (
        <span className={cn(
          'text-[10px] shrink-0',
          status === 'success' && 'text-emerald-600 dark:text-emerald-400',
          status === 'error' && 'text-red-500 dark:text-red-400',
        )}>
          {status === 'success' && <CheckCircle size={10} className="inline mr-1" />}
          {status === 'error' && <AlertTriangle size={10} className="inline mr-1" />}
          {message}
        </span>
      )}

      {/* Last sync time */}
      {lastSync && status === 'idle' && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          Zuletzt: {formatTime(lastSync)}
        </span>
      )}

      {/* Unsaved changes badge */}
      {hasChanges && status === 'idle' && (
        <span className="text-[10px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md shrink-0">
          Nicht gespeichert
        </span>
      )}

      {/* Pull button */}
      <button
        onClick={handlePull}
        disabled={isBusy}
        title="Daten vom Server aktualisieren (überschreibt lokale Änderungen)"
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all shrink-0',
          'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
          'hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      >
        {status === 'pulling'
          ? <Loader2 size={10} className="animate-spin" />
          : <RefreshCw size={10} />}
        Aktualisieren
      </button>

      {/* Push button */}
      <button
        onClick={handlePush}
        disabled={isBusy}
        title="Lokale Änderungen auf den Server übertragen"
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all shrink-0',
          hasChanges
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 dark:shadow-none'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      >
        {status === 'pushing'
          ? <Loader2 size={10} className="animate-spin" />
          : <Upload size={10} />}
        Synchronisieren
      </button>
    </div>
  );
};
