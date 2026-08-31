import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StickyNote, History, Download, UserCog, Bell, LogOut,
  LayoutDashboard, Users, Settings, Bug,
  Upload, CheckCircle, AlertTriangle, Loader2, WifiOff, FlaskConical,
} from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate } from '../lib/utils';
import type { PatientListItem } from '../hooks/usePatients';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { dbSyncPush, dbSyncHasLocalChanges, dbAddAuditEntry } from '../lib/db-api';
import type { SyncResult } from '../lib/ipc-types';
import { BugReportModal } from './BugReportModal';
import { appVersionLabel } from '../lib/appInfo';

const GESCHLECHT_LABEL: Record<string, string> = { m: 'Männlich', w: 'Weiblich', d: 'Divers' };
const GESCHLECHT_SYMBOL: Record<string, string> = { m: '♂', w: '♀', d: '⚧' };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

type SyncStatus = 'idle' | 'pushing' | 'success' | 'error';

interface PatientHeaderProps {
  patient: Patient | null;
  results?: TestResult[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  generalNote?: string;
  onSaveGeneralNote?: (note: string) => void;
  onExportPDF?: () => void;
  // PDF Experimental — forked export pipeline (see src/lib/featureFlags.ts).
  // Only wired when PDF_EXPERIMENTAL_ENABLED is true.
  onExportPDFExperimental?: () => void;
  onManagePatient?: () => void;
  currentUser?: string | null;
  onLogout?: () => void;
  unreadCount?: number;
  onShowNotifications?: () => void;
  previousAdmissions?: PatientListItem[];
  onSelectPreviousPatient?: (id: string) => void;
  // Electron sync
  serverPath?: string;
  startupWarning?: string;
  onSyncComplete?: () => void;
}

export const PatientHeader: React.FC<PatientHeaderProps> = ({
  patient,
  results = [],
  activeTab,
  onTabChange,
  generalNote = '',
  onSaveGeneralNote,
  onExportPDF,
  onExportPDFExperimental,
  onManagePatient,
  currentUser,
  onLogout,
  unreadCount = 0,
  onShowNotifications,
  previousAdmissions = [],
  onSelectPreviousPatient,
  serverPath,
  startupWarning,
  onSyncComplete,
}) => {
  const { currentUser: authUser } = useAuth();
  const [bugReportOpen, setBugReportOpen] = useState(false);

  // ── Sync state (only active when serverPath is set) ──────────────────────
  const [syncStatus, setSyncStatus]   = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSync, setLastSync]       = useState<string | null>(null);
  const [hasChanges, setHasChanges]   = useState(false);
  const lastSyncTimeRef               = useRef<number>(0);

  const checkChanges = useCallback(async () => {
    if (!serverPath) return;
    if (Date.now() - lastSyncTimeRef.current < 90_000) return;
    setHasChanges(await dbSyncHasLocalChanges());
  }, [serverPath]);

  useEffect(() => {
    checkChanges();
    const id = setInterval(checkChanges, 30_000);
    return () => clearInterval(id);
  }, [checkChanges]);

  const handleSync = async () => {
    if (syncStatus === 'pushing') return;
    setSyncStatus('pushing');
    setSyncMessage('');
    const result: SyncResult = await dbSyncPush();
    if (!result.success) {
      setSyncStatus('error');
      setSyncMessage(result.error ?? 'Synchronisierung fehlgeschlagen');
      return;
    }
    const parts: string[] = [];
    if (result.newPatients     > 0) parts.push(`${result.newPatients} neue Pat.`);
    if (result.updatedPatients > 0) parts.push(`${result.updatedPatients} aktual. Pat.`);
    if (result.newResults      > 0) parts.push(`${result.newResults} neue Erg.`);
    if (result.updatedResults  > 0) parts.push(`${result.updatedResults} aktual. Erg.`);
    if (result.updatedResults > 0 || result.updatedPatients > 0) {
      dbAddAuditEntry(
        'SYNC',
        authUser ?? 'System',
        undefined,
        `Synchronisierung: ${result.updatedResults} Ergebnisse / ${result.updatedPatients} Patienten aktualisiert.`,
      );
    }
    setSyncStatus('success');
    setLastSync(new Date().toISOString());
    setSyncMessage(parts.length > 0 ? parts.join(', ') : 'Alles aktuell');
    setHasChanges(false);
    lastSyncTimeRef.current = Date.now();
    onSyncComplete?.();
    setTimeout(() => { setSyncStatus('idle'); setSyncMessage(''); lastSyncTimeRef.current = Date.now(); }, 4000);
  };

  // ── Tab helpers ───────────────────────────────────────────────────────────
  const isProfileTabActive = activeTab === 'profile';
  const isPatientsActive   = activeTab === 'patients';
  const isOptionsActive    = activeTab === 'admin';

  const tabCls = (active: boolean, disabled?: boolean) => cn(
    'flex items-center gap-1.5 px-4 h-full text-xs font-medium transition-colors whitespace-nowrap border-b-2',
    active
      ? 'border-slate-800 dark:border-slate-100 text-slate-900 dark:text-slate-50'
      : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-200 dark:hover:border-slate-600',
    disabled && 'opacity-30 cursor-not-allowed pointer-events-none',
  );

  const Dot = () => (
    <span className="mx-2 text-slate-200 dark:text-slate-700 select-none">·</span>
  );

  const isSyncing = syncStatus === 'pushing';

  return (
    <>
    <header className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] sticky top-0 z-50 h-16 flex items-stretch">

      {/* ── Navigation tabs ── */}
      <div className="flex items-stretch shrink-0 pr-1">
        <button
          className={tabCls(isProfileTabActive, !patient)}
          onClick={() => patient && onTabChange('profile')}
          title={!patient ? 'Kein Patient ausgewählt' : undefined}
        >
          <LayoutDashboard size={12} />
          Leistungsprofil
        </button>
        <button className={tabCls(isPatientsActive)} onClick={() => onTabChange('patients')}>
          <Users size={12} />
          Patienten
        </button>
        <button className={tabCls(isOptionsActive)} onClick={() => onTabChange('admin')}>
          <Settings size={12} />
          Optionen
        </button>
      </div>

      <div className="w-px bg-slate-100 dark:bg-slate-800 my-3 shrink-0" />

      {/* ── Patient identity ── */}
      {patient ? (
        <div className="flex flex-col justify-center flex-1 min-w-0 px-5 gap-1">

          {/* Row 1: Name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-none truncate">
              {patient.name}
            </span>
            <span
              className="text-[12px] text-slate-300 dark:text-slate-600 leading-none shrink-0 select-none"
              title={GESCHLECHT_LABEL[patient.geschlecht]}
            >
              {GESCHLECHT_SYMBOL[patient.geschlecht] ?? patient.geschlecht}
            </span>
            {patient.status === 'entlassen' && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-900 leading-none">
                Entlassen
              </span>
            )}
            {previousAdmissions.length > 0 && onSelectPreviousPatient && (
              <button
                type="button"
                onClick={() => onSelectPreviousPatient(previousAdmissions[0].id)}
                className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors leading-none border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
                title="Frühere Aufenthalte anzeigen"
              >
                <History size={10} />
                {previousAdmissions.length === 1 ? 'Früherer Aufenthalt' : `${previousAdmissions.length} frühere Aufenthalte`}
              </button>
            )}
          </div>

          {/* Row 2: Metadata */}
          <div className="flex items-center text-[11px] text-slate-400 dark:text-slate-500 leading-none flex-nowrap min-w-0">
            <span className="shrink-0">{patient.age}&thinsp;J</span>
            <Dot />
            <span className="shrink-0">{formatDate(patient.geburtsdatum)}</span>
            {patient.entlassdatum && (
              <>
                <Dot />
                <span className="shrink-0 text-rose-400 dark:text-rose-500">
                  Entl.&thinsp;{formatDate(patient.entlassdatum)}
                </span>
              </>
            )}
            {patient.bildungsjahre !== undefined && (
              <>
                <Dot />
                <span className="shrink-0">{patient.bildungsjahre}&thinsp;Bdj.</span>
              </>
            )}
            <Dot />
            {patient.diagnose && patient.diagnose.length > 0 ? (
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate min-w-0">
                {patient.diagnose.join('; ')}
              </span>
            ) : (
              <button
                type="button"
                onClick={onManagePatient}
                className="text-rose-400 dark:text-rose-500 italic hover:text-rose-500 dark:hover:text-rose-400 transition-colors shrink-0 leading-none"
                title="Diagnose eintragen"
              >
                Diagnose fehlt – eintragen
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center flex-1 px-5">
          <span className="text-[13px] text-slate-300 dark:text-slate-600 font-medium select-none">
            Kein Patient ausgewählt
          </span>
        </div>
      )}

      {/* ── Fehler melden ── */}
      {patient && (
        <div data-onboarding="bug-report-btn" className="flex items-center px-3 shrink-0 border-l border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setBugReportOpen(true)}
            title={`Fehler bei diesem Patienten melden · App-Version ${appVersionLabel()}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          >
            <Bug size={13} />
            Fehler melden
          </button>
        </div>
      )}

      {/* ── Note ── */}
      {patient && onSaveGeneralNote && (
        <div className="flex flex-col justify-center gap-[5px] px-5 w-80 shrink-0 border-l border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 leading-none">
            <StickyNote size={12} className="text-amber-400 dark:text-amber-500 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-widest select-none">
              Interne Notiz
            </span>
          </div>
          <input
            type="text"
            value={generalNote}
            onChange={e => onSaveGeneralNote(e.target.value)}
            placeholder="Notiz eintragen…"
            className={cn(
              'w-full text-sm leading-none bg-transparent',
              'text-slate-700 dark:text-slate-200',
              'placeholder:text-slate-300 dark:placeholder:text-slate-600',
              'border-b border-slate-200 dark:border-slate-700',
              'focus:border-amber-400 dark:focus:border-amber-500',
              'outline-none transition-colors pb-1',
            )}
          />
        </div>
      )}

      {/* ── Sync (Electron only) ── */}
      {serverPath && (
        <div className="flex items-center gap-2 px-4 border-l border-slate-100 dark:border-slate-800 shrink-0">
          {/* Warning indicator */}
          {startupWarning && syncStatus === 'idle' && (
            <span title={startupWarning} className="text-amber-500">
              <WifiOff size={12} />
            </span>
          )}

          {/* Status feedback */}
          {syncMessage && (
            <span className={cn(
              'text-[10px] flex items-center gap-1 shrink-0 max-w-36 truncate',
              syncStatus === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400',
            )}>
              {syncStatus === 'success'
                ? <CheckCircle size={10} className="shrink-0" />
                : <AlertTriangle size={10} className="shrink-0" />}
              {syncMessage}
            </span>
          )}

          {/* Last sync time */}
          {lastSync && syncStatus === 'idle' && !syncMessage && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
              {formatTime(lastSync)}
            </span>
          )}

          {/* Unsaved changes badge */}
          {hasChanges && syncStatus === 'idle' && !syncMessage && (
            <span
              title="Sie haben ungespeicherte Änderungen. Bitte erst synchronisieren."
              className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md shrink-0 cursor-help"
            >
              Nicht synchronisiert
            </span>
          )}

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            title="Lokale Änderungen auf den Server übertragen"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all shrink-0 disabled:opacity-40',
              hasChanges
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
            )}
          >
            {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Sync
          </button>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-1.5 px-4 border-l border-slate-100 dark:border-slate-800 shrink-0">
        {patient && onExportPDF && (
          <button
            onClick={onExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white transition-all shadow-sm"
          >
            <Download size={12} />
            PDF
          </button>
        )}
        {patient && onExportPDFExperimental && (
          <button
            onClick={onExportPDFExperimental}
            title="Experimenteller PDF-Export (eigene, abgekoppelte Pipeline) – siehe featureFlags.ts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-amber-400 dark:border-amber-500/70 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all"
          >
            <FlaskConical size={12} />
            PDF Exp.
          </button>
        )}
        {patient && onManagePatient && (
          <button
            onClick={onManagePatient}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
          >
            <UserCog size={12} />
            Bearbeiten
          </button>
        )}
        {onShowNotifications && (
          <button
            onClick={onShowNotifications}
            title="Benachrichtigungen"
            className={cn(
              'relative p-1.5 rounded-lg border transition-all',
              activeTab === 'notifications'
                ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300',
            )}
          >
            <Bell size={14} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}
        {currentUser && onLogout && (
          <button
            onClick={onLogout}
            title={`Abmelden (${currentUser})`}
            className="p-1.5 rounded-lg border border-transparent text-slate-300 dark:text-slate-600 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-500 dark:hover:text-rose-400 transition-all"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>

    </header>
    {patient && (
      <BugReportModal
        isOpen={bugReportOpen}
        onClose={() => setBugReportOpen(false)}
        patient={patient}
        results={results}
      />
    )}
    </>
  );
};
