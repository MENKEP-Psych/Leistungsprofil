import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  CheckCircle,
  RefreshCw,
  Loader2,
  Users,
  UserPlus,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Copy,
  ShieldAlert,
  Download,
  Server,
  Save,
  FolderOpen,
  FlaskConical,
  ShieldCheck,
  FileDown,
} from 'lucide-react';
import { NormenVerifizierenTab } from './NormenVerifizierenTab';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useNormOverrides } from '../context/NormOverridesContext';
import { useTheme } from '../context/ThemeContext';
import { useProfilePrefs } from '../context/ProfilePrefsContext';
import { useAuditLog } from '../hooks/useAuditLog';
import { AuditEntry } from '../types';
import {
  dbGetUsers,
  dbCreateUser,
  dbDeleteUser,
  dbChangePassword,
  dbChangeRole,
  dbGetRecoveryKey,
  dbLogin,
  dbSyncGetServerPath,
  dbSyncSetServerPath,
  dbGetPdfFolder,
  dbSetPdfFolder,
  dbPickFolder,
  fetchAllPatientsForExport,
  isElectron,
} from '../lib/db-api';
import type { UserRow } from '../lib/ipc-types';
import { AnalyticsSection } from './AnalyticsSection';
import { recalculateAllResults, type RecalcProgress, type RecalcResult } from '../lib/recalculateNorms';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateAgeAtDate(geburtsdatum: string, testDate: string): number | null {
  if (!geburtsdatum || !testDate) return null;
  const birth = new Date(geburtsdatum);
  const test = new Date(testDate);
  if (isNaN(birth.getTime()) || isNaN(test.getTime())) return null;
  let age = test.getFullYear() - birth.getFullYear();
  const m = test.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && test.getDate() < birth.getDate())) age--;
  return age;
}

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
  LOGIN: 'Angemeldet',
  LOGOUT: 'Abgemeldet',
  PATIENT_CREATED: 'Patient erstellt',
  PATIENT_UPDATED: 'Patient bearbeitet',
  PATIENT_DISCHARGED: 'Patient entlassen',
  TEST_SAVED: 'Test gespeichert',
  TEST_UPDATED: 'Test bearbeitet',
  RESULT_DELETED: 'Ergebnis gelöscht',
};

const ACTION_COLOR: Record<AuditEntry['action'], string> = {
  LOGIN: 'bg-emerald-50 text-emerald-700',
  LOGOUT: 'bg-slate-100 text-slate-500',
  PATIENT_CREATED: 'bg-slate-100 text-slate-600',
  PATIENT_UPDATED: 'bg-amber-50 text-amber-700',
  PATIENT_DISCHARGED: 'bg-rose-50 text-rose-600',
  TEST_SAVED: 'bg-slate-100 text-slate-600',
  TEST_UPDATED: 'bg-slate-100 text-slate-500',
  RESULT_DELETED: 'bg-red-50 text-red-600',
};

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCSV(value: string | undefined): string {
  if (!value) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadAuditCSV(entries: AuditEntry[]): void {
  const header = ['Zeitstempel', 'Benutzer', 'Aktion', 'Patient', 'Details'];
  const rows = entries.map(e => [
    new Date(e.timestamp).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
    e.username,
    ACTION_LABELS[e.action] ?? e.action,
    e.patientName ?? '',
    e.details ?? '',
  ].map(escapeCSV).join(','));
  const csv = [header.join(','), ...rows].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-log_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Building blocks ───────────────────────────────────────────────────────────

const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const SectionHeader: React.FC<{
  label: string;
  badge?: string;
  right?: React.ReactNode;
}> = ({ label, badge, right }) => (
  <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800">
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold text-white uppercase tracking-widest">{label}</span>
      {badge && (
        <span className="text-[9px] font-semibold bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{badge}</span>
      )}
    </div>
    {right}
  </div>
);

const inputCls = 'w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300';
const btnPrimary = 'flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shrink-0';
const btnSecondary = 'flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 hover:border-slate-400 transition-all shrink-0';

// ── Change-password modal ─────────────────────────────────────────────────────

interface ChangePwModalProps {
  targetUsername: string;
  isOwn: boolean;
  onClose: () => void;
}

const ChangePwModal: React.FC<ChangePwModalProps> = ({ targetUsername, isOwn, onClose }) => {
  const { currentUser } = useAuth();
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showNew,    setShowNew]    = useState(false);
  const [error,      setError]      = useState('');
  const [done,       setDone]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPw.length < 6) { setError('Mindestens 6 Zeichen erforderlich'); return; }
    if (newPw !== confirmPw) { setError('Passwörter stimmen nicht überein'); return; }
    if (isOwn) {
      const result = await dbLogin(currentUser!, currentPw);
      if (!result?.success) { setError('Aktuelles Passwort ist falsch'); return; }
    }
    setLoading(true);
    const ok = await dbChangePassword(targetUsername, newPw);
    setLoading(false);
    if (ok) { setDone(true); setTimeout(onClose, 1200); }
    else { setError('Passwort konnte nicht geändert werden'); }
  };

  const labelCls = 'block text-[9px] font-semibold text-slate-400 uppercase tracking-widest';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">
            {isOwn ? 'Eigenes Passwort ändern' : `Passwort zurücksetzen – ${targetUsername}`}
          </span>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
              <CheckCircle size={18} />
              <span className="text-sm font-semibold">Passwort geändert</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {isOwn && (
                <div className="space-y-1">
                  <label className={labelCls}>Aktuelles Passwort</label>
                  <input ref={firstRef} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className={inputCls} />
                </div>
              )}
              <div className="space-y-1">
                <label className={labelCls}>Neues Passwort</label>
                <div className="relative">
                  <input ref={isOwn ? undefined : firstRef} type={showNew ? 'text' : 'password'}
                    value={newPw} onChange={e => setNewPw(e.target.value)} required
                    className={cn(inputCls, 'pr-10')} />
                  <button type="button" onClick={() => setShowNew(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Wiederholen</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required className={inputCls} />
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 transition-all">
                  Abbrechen
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : 'Speichern'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const AdminTab: React.FC = () => {
  const { currentUserRole, currentUser, encryptionKey } = useAuth();
  const { reload: reloadNorms } = useNormOverrides();
  const { getEntries } = useAuditLog();
  useTheme();
  const { showTrendArrows, setShowTrendArrows } = useProfilePrefs();
  const isAdmin = currentUserRole === 'admin';

  const [subTab,      setSubTab]      = useState<'einstellungen' | 'normen'>('einstellungen');
  const [changePwFor, setChangePwFor] = useState<{ username: string; isOwn: boolean } | null>(null);

  // User management
  const [users,          setUsers]          = useState<UserRow[]>([]);
  const [usersLoading,   setUsersLoading]   = useState(false);
  const [newUsername,    setNewUsername]    = useState('');
  const [newPassword,    setNewPassword]    = useState('');
  const [newRole,        setNewRole]        = useState<'admin' | 'user'>('user');
  const [createError,    setCreateError]    = useState('');
  const [createLoading,  setCreateLoading]  = useState(false);
  const [deleteError,    setDeleteError]    = useState('');
  const [roleError,      setRoleError]      = useState('');

  // Recovery key
  const [recoveryKey,      setRecoveryKey]      = useState<string | null>(null);
  const [recoveryRevealed, setRecoveryRevealed] = useState(false);
  const [recoveryCopied,   setRecoveryCopied]   = useState(false);

  // Server path
  const [serverPath,         setServerPath]         = useState('');
  const [serverPathSaving,   setServerPathSaving]   = useState(false);
  const [serverPathSaved,    setServerPathSaved]     = useState(false);
  const [serverPathError,    setServerPathError]     = useState('');
  const [serverPathUnlocked, setServerPathUnlocked] = useState(false);
  const [serverPathPw,       setServerPathPw]        = useState('');
  const [serverPathPwError,  setServerPathPwError]   = useState('');

  // PDF folder
  const [pdfFolder,       setPdfFolder]       = useState('');
  const [pdfFolderSaving, setPdfFolderSaving] = useState(false);
  const [pdfFolderSaved,  setPdfFolderSaved]  = useState(false);
  const [pdfFolderError,  setPdfFolderError]  = useState('');

  // Audit log
  const [auditOpen,    setAuditOpen]    = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Norms sync
  const [normsSyncing,   setNormsSyncing]   = useState(false);
  const [normsSynced,    setNormsSynced]    = useState(false);
  const [normsSyncError, setNormsSyncError] = useState('');

  // Patient export
  const [patientExportLoading, setPatientExportLoading] = useState(false);
  const [patientExportError,   setPatientExportError]   = useState('');

  // Norm recalculation
  const [recalcRunning,  setRecalcRunning]  = useState(false);
  const [recalcProgress, setRecalcProgress] = useState<RecalcProgress | null>(null);
  const [recalcResult,   setRecalcResult]   = useState<RecalcResult | null>(null);
  const [recalcError,    setRecalcError]    = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsers(await dbGetUsers());
    setUsersLoading(false);
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    setAuditEntries(await getEntries());
    setAuditLoading(false);
  };

  useEffect(() => {
    loadPdfFolder();
    if (isAdmin) { loadUsers(); loadRecoveryKey(); loadServerPath(); }
  }, [isAdmin]);

  async function loadRecoveryKey() { setRecoveryKey(await dbGetRecoveryKey()); }
  async function loadServerPath() { if (isElectron()) setServerPath(await dbSyncGetServerPath()); }
  async function loadPdfFolder() { if (isElectron()) setPdfFolder(await dbGetPdfFolder()); }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleUnlockServerPath = (e: React.FormEvent) => {
    e.preventDefault();
    if (serverPathPw === 'jobavarapport') { setServerPathUnlocked(true); setServerPathPwError(''); setServerPathPw(''); }
    else { setServerPathPwError('Falsches Passwort'); }
  };

  const handleSaveServerPath = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerPathError(''); setServerPathSaved(false); setServerPathSaving(true);
    const res = await dbSyncSetServerPath(serverPath.trim());
    setServerPathSaving(false);
    if (res.success) { setServerPathSaved(true); setServerPathUnlocked(false); setTimeout(() => setServerPathSaved(false), 3000); }
    else { setServerPathError(res.error ?? 'Fehler beim Speichern'); }
  };

  const handleSavePdfFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setPdfFolderError(''); setPdfFolderSaved(false); setPdfFolderSaving(true);
    const res = await dbSetPdfFolder(pdfFolder.trim());
    setPdfFolderSaving(false);
    if (res.success) { setPdfFolderSaved(true); setTimeout(() => setPdfFolderSaved(false), 3000); }
    else { setPdfFolderError(res.error ?? 'Fehler beim Speichern'); }
  };

  const handleAuditToggle = () => {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next && auditEntries.length === 0) loadAudit();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (newUsername.trim().length < 3) { setCreateError('Mindestens 3 Zeichen'); return; }
    if (newPassword.length < 6) { setCreateError('Passwort muss mindestens 6 Zeichen haben'); return; }
    setCreateLoading(true);
    const res = await dbCreateUser(newUsername.trim().toLowerCase(), newPassword, newRole);
    setCreateLoading(false);
    if (res.success) { setNewUsername(''); setNewPassword(''); setNewRole('user'); await loadUsers(); }
    else { setCreateError(res.error ?? 'Fehler beim Erstellen'); }
  };

  const handleDeleteUser = async (username: string) => {
    setDeleteError('');
    if (!confirm(`Benutzer »${username}« wirklich löschen?`)) return;
    const res = await dbDeleteUser(username);
    if (res.success) { await loadUsers(); }
    else { setDeleteError(res.error ?? 'Löschen fehlgeschlagen'); }
  };

  const handleChangeRole = async (username: string, currentRole: string) => {
    setRoleError('');
    const nr: 'admin' | 'user' = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`Rolle von »${username}« zu »${nr === 'admin' ? 'Administrator' : 'Benutzer'}« ändern?`)) return;
    const res = await dbChangeRole(username, nr);
    if (res.success) { await loadUsers(); }
    else { setRoleError(res.error ?? 'Rollenwechsel fehlgeschlagen'); }
  };

  const handleCopyRecovery = () => {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey).then(() => {
      setRecoveryCopied(true); setTimeout(() => setRecoveryCopied(false), 2000);
    });
  };

  const handleRecalculateNorms = async () => {
    setRecalcRunning(true); setRecalcResult(null); setRecalcError(''); setRecalcProgress(null);
    try {
      const result = await recalculateAllResults(encryptionKey, p => setRecalcProgress({ ...p }));
      setRecalcResult(result);
    } catch (err) {
      setRecalcError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setRecalcRunning(false); setRecalcProgress(null);
    }
  };

  const handleSyncNorms = async () => {
    setNormsSyncing(true); setNormsSyncError(''); setNormsSynced(false);
    try {
      await reloadNorms();
      setNormsSynced(true); setTimeout(() => setNormsSynced(false), 3000);
    } catch (err) {
      setNormsSyncError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally { setNormsSyncing(false); }
  };

  const handleExportAnonymizedCSV = async () => {
    setPatientExportLoading(true); setPatientExportError('');
    try {
      const all = await fetchAllPatientsForExport(encryptionKey);
      const header = [
        'Geburtsjahr', 'Aufenthaltsjahr', 'Alter_bei_Test', 'Geschlecht',
        'Status', 'Diagnose', 'Lokalisation', 'Bildungsjahre',
        'Test', 'Testdatum', 'PR_Werte',
      ];
      const rows: string[] = [];
      for (const { patient: p, results } of all) {
        const birthYear  = p.geburtsdatum ? p.geburtsdatum.substring(0, 4) : '';
        const stayYear   = p.aufnahmedatum?.substring(0, 4) ?? p.entlassdatum?.substring(0, 4) ?? '';
        const geschlecht = p.geschlecht === 'm' ? 'männlich' : p.geschlecht === 'w' ? 'weiblich' : 'divers';
        const status     = p.status === 'aktiv' ? 'aktiv' : 'entlassen';
        const bildung    = p.bildungsjahre !== undefined ? String(p.bildungsjahre) : '';
        const diagnoseStr = (p.diagnose ?? []).join('; ');
        const lokalisationStr = Object.entries(p.lokalisation ?? {}).map(([d, lok]) => `${d}: ${lok}`).join('; ');
        if (results.length === 0) {
          rows.push([birthYear, stayYear, '', geschlecht, status, diagnoseStr, lokalisationStr, bildung, '', '', ''].map(escapeCSV).join(','));
        } else {
          for (const r of results) {
            const ageAtTest = calculateAgeAtDate(p.geburtsdatum, r.date);
            const prStr = Object.entries(r.percentileRanks).map(([k, v]) => `${k}=${v}`).join('; ');
            rows.push([
              birthYear, stayYear,
              ageAtTest !== null ? String(ageAtTest) : '',
              geschlecht, status,
              diagnoseStr, lokalisationStr, bildung,
              r.testId, r.date, prStr,
            ].map(escapeCSV).join(','));
          }
        }
      }
      const csv = [header.join(','), ...rows].join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `patienten_anonymisiert_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPatientExportError(err instanceof Error ? err.message : 'Export fehlgeschlagen');
    } finally { setPatientExportLoading(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="pb-10">

      {/* Sub-tab switcher */}
      <div className="max-w-2xl mx-auto px-1 mb-5">
        <div className="inline-flex rounded-xl bg-slate-100 border border-slate-200 p-1 gap-1">
          {(['einstellungen', 'normen'] as const).map(tab => (
            <button key={tab} onClick={() => setSubTab(tab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                subTab === tab
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/60',
              )}>
              {tab === 'einstellungen' ? <Users size={13} /> : <FlaskConical size={13} />}
              {tab === 'einstellungen' ? 'Einstellungen' : 'Normen verifizieren'}
            </button>
          ))}
        </div>
      </div>

      {/* Normen-Tab */}
      {subTab === 'normen' && (
        <div className="max-w-5xl mx-auto px-1">
          <NormenVerifizierenTab />
        </div>
      )}

      {/* Einstellungen */}
      {subTab === 'einstellungen' && (
        <div className="max-w-2xl mx-auto space-y-4">
          {changePwFor && (
            <ChangePwModal
              targetUsername={changePwFor.username}
              isOwn={changePwFor.isOwn}
              onClose={() => setChangePwFor(null)}
            />
          )}

          {/* Persönliches Konto */}
          <Section>
            <SectionHeader label="Persönliches Konto" />
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <span className="text-sm font-bold text-slate-600">
                      {currentUser?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{currentUser}</p>
                    <p className="text-[11px] text-slate-400 font-medium capitalize">{currentUserRole}</p>
                  </div>
                </div>
                <button onClick={() => setChangePwFor({ username: currentUser!, isOwn: true })} className={btnSecondary}>
                  <KeyRound size={13} /> Passwort ändern
                </button>
              </div>
            </div>
          </Section>

          {/* Darstellung (persönlich, pro Nutzer) */}
          <Section>
            <SectionHeader label="Darstellung" />
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Trend-Pfeile im Leistungsprofil</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    Verbindungslinie mit Pfeil zwischen vorheriger und aktueller Messung
                    (grün = Verbesserung, rot = Verschlechterung). Ist sie aus, werden nur die beiden
                    Punkte gezeigt. Gilt nur für dich.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showTrendArrows}
                  onClick={() => setShowTrendArrows(!showTrendArrows)}
                  className={cn(
                    'relative shrink-0 w-11 h-6 rounded-full transition-colors',
                    showTrendArrows ? 'bg-slate-800' : 'bg-slate-300',
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                    showTrendArrows && 'translate-x-5',
                  )} />
                </button>
              </div>
            </div>
          </Section>

          {/* PDF-Exportordner */}
          {isElectron() && (
            <Section>
              <SectionHeader label="PDF-Exportordner" />
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Standard-Zielordner für den PDF-Export. Wird direkt ohne Dialog gespeichert. Gilt nur für diesen PC.
                </p>
                <form onSubmit={handleSavePdfFolder} className="flex gap-2">
                  <div className="flex-1 relative">
                    <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="text" value={pdfFolder}
                      onChange={e => { setPdfFolder(e.target.value); setPdfFolderSaved(false); }}
                      placeholder="z.B. G:\Leistungsprofil\PDFs"
                      className={cn(inputCls, 'pl-9 font-mono text-[12px]')} />
                  </div>
                  <button type="button" onClick={async () => { const f = await dbPickFolder(); if (f) { setPdfFolder(f); setPdfFolderSaved(false); } }} className={btnSecondary}>
                    <FolderOpen size={13} /> Durchsuchen
                  </button>
                  <button type="submit" disabled={pdfFolderSaving} className={btnPrimary}>
                    {pdfFolderSaving ? <Loader2 size={13} className="animate-spin" /> : pdfFolderSaved ? <CheckCircle size={13} /> : <Save size={13} />}
                    {pdfFolderSaved ? 'Gespeichert' : 'Speichern'}
                  </button>
                </form>
                {pdfFolderError && <ErrorMsg>{pdfFolderError}</ErrorMsg>}
              </div>
            </Section>
          )}

          {/* Admin-only sections */}
          {isAdmin && (
            <>
              {/* Benutzerverwaltung */}
              <Section>
                <SectionHeader
                  label="Benutzerverwaltung"
                  badge="Admin"
                  right={
                    <button onClick={loadUsers} disabled={usersLoading} className={cn(btnSecondary, 'border-white/20 bg-white/10 text-slate-200 hover:bg-white/20 hover:border-white/30')}>
                      {usersLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Aktualisieren
                    </button>
                  }
                />

                <div className="px-5 pt-4">
                  {usersLoading && users.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-slate-300" />
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-slate-200">
                      {users.map((u, i) => (
                        <div key={u.username}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 bg-white transition-colors hover:bg-slate-50/60',
                            i < users.length - 1 && 'border-b border-slate-100',
                          )}>
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 border',
                            u.username === 'recovery'
                              ? 'bg-amber-50 border-amber-200 text-amber-600'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          )}>
                            {u.username === 'recovery' ? '🔑' : u.username[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 truncate">{u.username}</span>
                              {u.username === currentUser && (
                                <span className="text-[9px] font-semibold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0">Du</span>
                              )}
                            </div>
                            <span className={cn('text-[10px] font-medium', u.username === 'recovery' ? 'text-amber-500' : 'text-slate-400')}>
                              {u.username === 'recovery' ? 'Notfall-Zugang' : u.role === 'admin' ? 'Administrator' : 'Benutzer'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {u.username !== 'recovery' && (
                              <ActionIconBtn title="Passwort zurücksetzen" onClick={() => setChangePwFor({ username: u.username, isOwn: u.username === currentUser })} hoverCls="hover:text-slate-700 hover:bg-slate-100">
                                <KeyRound size={13} />
                              </ActionIconBtn>
                            )}
                            {u.username !== 'recovery' && u.username !== currentUser && (
                              <ActionIconBtn title={u.role === 'admin' ? 'Zu Benutzer herabstufen' : 'Zu Admin hochstufen'} onClick={() => handleChangeRole(u.username, u.role)} hoverCls="hover:text-amber-600 hover:bg-amber-50">
                                <ShieldCheck size={13} />
                              </ActionIconBtn>
                            )}
                            {u.username !== 'recovery' && u.username !== currentUser && (
                              <ActionIconBtn title="Benutzer löschen" onClick={() => handleDeleteUser(u.username)} hoverCls="hover:text-rose-600 hover:bg-rose-50">
                                <Trash2 size={13} />
                              </ActionIconBtn>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {deleteError && <ErrorMsg className="mt-3">{deleteError}</ErrorMsg>}
                  {roleError && <ErrorMsg className="mt-3">{roleError}</ErrorMsg>}
                </div>

                <div className="mx-5 my-4 border-t border-slate-100" />

                {/* Create user */}
                <div className="px-5 pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserPlus size={12} className="text-slate-400" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Neuen Benutzer anlegen</span>
                  </div>
                  <form onSubmit={handleCreateUser} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Benutzername</label>
                        <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="z.B. mueller" className={inputCls} />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Initiales Passwort</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" className={inputCls} />
                      </div>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Rolle</label>
                        <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'user')} className={inputCls}>
                          <option value="user">Benutzer</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>
                      <button type="submit" disabled={createLoading} className={btnPrimary}>
                        {createLoading ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                        Erstellen
                      </button>
                    </div>
                    {createError && <ErrorMsg>{createError}</ErrorMsg>}
                  </form>
                </div>
              </Section>

              {/* Notfall-Zugang */}
              <Section>
                <SectionHeader label="Notfall-Zugang" badge="Admin" />
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Benutzername{' '}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded-md font-mono text-[11px] text-slate-600">recovery</code>{' '}
                    und dieser Code ermöglichen den Notfall-Login. Identisch mit der Datei{' '}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded-md font-mono text-[11px] text-slate-600">.recovery</code>{' '}
                    im geteilten Ordner.
                  </p>
                  <div className="flex items-center gap-2 p-4 bg-amber-50/60 border border-amber-200/60 rounded-xl">
                    <ShieldAlert size={15} className="text-amber-500 shrink-0" />
                    <div className="flex-1 overflow-hidden">
                      {recoveryKey === null ? (
                        <span className="text-xs text-slate-400">Wird geladen…</span>
                      ) : recoveryKey === '' ? (
                        <span className="text-xs text-slate-400 italic">Nicht verfügbar (nur im Electron-Modus)</span>
                      ) : (
                        <span className={cn('font-mono text-base font-bold text-slate-800 tracking-[0.15em] select-none transition-all duration-200', !recoveryRevealed && 'blur-sm')}>
                          {recoveryKey}
                        </span>
                      )}
                    </div>
                    {recoveryKey && (
                      <div className="flex items-center gap-1 shrink-0">
                        <ActionIconBtn title={recoveryRevealed ? 'Verbergen' : 'Anzeigen'} onClick={() => setRecoveryRevealed(v => !v)} hoverCls="hover:text-slate-700 hover:bg-amber-100">
                          {recoveryRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </ActionIconBtn>
                        <ActionIconBtn title="Kopieren" onClick={handleCopyRecovery} hoverCls="hover:text-slate-700 hover:bg-amber-100">
                          {recoveryCopied ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </ActionIconBtn>
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-[11px] text-amber-600 font-medium">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>Den Code sicher notieren und getrennt vom Computer aufbewahren.</span>
                  </div>
                </div>
              </Section>

              {/* Server-Datenbankpfad */}
              {isElectron() && (
                <Section>
                  <SectionHeader label="Server-Datenbankpfad" badge="IT" />
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Pfad zur Master-Datenbank auf dem Server-Share (z.B.{' '}
                      <code className="bg-slate-100 px-1.5 py-0.5 rounded-md font-mono text-[11px] text-slate-600">
                        G:\Leistungsprofil\leistungsprofil.sqlite
                      </code>). Nur für die IT.
                    </p>
                    {!serverPathUnlocked ? (
                      <form onSubmit={handleUnlockServerPath} className="flex gap-2">
                        <div className="flex-1 relative">
                          <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="password" value={serverPathPw}
                            onChange={e => { setServerPathPw(e.target.value); setServerPathPwError(''); }}
                            placeholder="IT-Passwort eingeben…"
                            className={cn(inputCls, 'pl-9')} />
                        </div>
                        <button type="submit" className={btnPrimary}>
                          <KeyRound size={13} /> Entsperren
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleSaveServerPath} className="flex gap-2">
                        <div className="flex-1 relative">
                          <Server size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="text" value={serverPath}
                            onChange={e => { setServerPath(e.target.value); setServerPathSaved(false); }}
                            placeholder="\\Server\Share\leistungsprofil.sqlite"
                            autoFocus className={cn(inputCls, 'pl-9 font-mono text-[12px]')} />
                        </div>
                        <button type="submit" disabled={serverPathSaving} className={btnPrimary}>
                          {serverPathSaving ? <Loader2 size={13} className="animate-spin" /> : serverPathSaved ? <CheckCircle size={13} /> : <Save size={13} />}
                          {serverPathSaved ? 'Gespeichert' : 'Speichern'}
                        </button>
                      </form>
                    )}
                    {serverPathPwError && <ErrorMsg>{serverPathPwError}</ErrorMsg>}
                    {serverPathError && <ErrorMsg>{serverPathError}</ErrorMsg>}
                    {serverPathSaved && <p className="text-[10px] text-slate-400">Gespeichert. Gilt ab dem nächsten App-Start.</p>}
                  </div>
                </Section>
              )}

              {/* Normen-Synchronisation */}
              {isElectron() && (
                <Section>
                  <SectionHeader label="Normen-Synchronisation" badge="IT" />
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Wenn ein Kollege im Tab „Normen verifizieren" Normwerte angepasst hat, werden diese Änderungen hier auf deinen PC übertragen. Normalerweise passiert das automatisch beim Öffnen des Normen-Tabs — dieser Button ist nur nötig, wenn du sichergehen willst, dass du die neuesten Werte hast, bevor du eine Neuberechnung startest.
                    </p>
                    <button onClick={handleSyncNorms} disabled={normsSyncing} className={btnPrimary}>
                      {normsSyncing ? <Loader2 size={13} className="animate-spin" /> : normsSynced ? <CheckCircle size={13} /> : <RefreshCw size={13} />}
                      {normsSynced ? 'Synchronisiert' : 'Normen jetzt synchronisieren'}
                    </button>
                    {normsSyncError && <ErrorMsg>{normsSyncError}</ErrorMsg>}
                  </div>
                </Section>
              )}

              {/* Normen-Neuberechnung */}
              {isAdmin && (
                <Section>
                  <SectionHeader label="Normen-Neuberechnung" badge="Admin" />
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Wenn Normwerte im Tab „Normen verifizieren" geändert wurden, zeigen bereits gespeicherte Testergebnisse noch die alten Prozenträge. Dieser Button berechnet die Prozenträge aller bisherigen Ergebnisse neu, sodass sie die aktuellen Normwerte widerspiegeln. Empfehlung: erst „Normen synchronisieren" klicken, dann hier neu berechnen.
                    </p>
                    <button
                      onClick={handleRecalculateNorms}
                      disabled={recalcRunning}
                      className={btnPrimary}
                    >
                      {recalcRunning
                        ? <Loader2 size={13} className="animate-spin" />
                        : recalcResult
                          ? <CheckCircle size={13} />
                          : <RefreshCw size={13} />}
                      {recalcRunning
                        ? `Neuberechnung… ${recalcProgress ? `(${recalcProgress.done}/${recalcProgress.total})` : ''}`
                        : recalcResult
                          ? 'Erneut berechnen'
                          : 'Jetzt neu berechnen'}
                    </button>
                    {recalcResult && (
                      <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-xs text-emerald-700 font-medium">
                        <CheckCircle size={13} className="shrink-0 mt-0.5" />
                        <span>
                          {recalcResult.updated} Ergebnis{recalcResult.updated !== 1 ? 'se' : ''} aktualisiert
                          {recalcResult.skipped > 0 && `, ${recalcResult.skipped} übersprungen`}
                          {recalcResult.errors.length > 0 && (
                            <span className="text-rose-600 block mt-1">{recalcResult.errors.length} Fehler: {recalcResult.errors[0]}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {recalcError && <ErrorMsg>{recalcError}</ErrorMsg>}
                  </div>
                </Section>
              )}

              {/* Analytics */}
              <AnalyticsSection />

              {/* Anonymisierter Datenexport */}
              <Section>
                <SectionHeader label="Anonymisierter Datenexport" badge="Admin" />
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Exportiert alle Patienten als CSV — eine Zeile pro Testergebnis. Enthält: Geburtsjahr, Aufenthaltsjahr, Alter bei Test, Geschlecht, Status, Diagnose, Lokalisation, Bildungsjahre und Perzentilränge. Kein Name, keine ID.
                  </p>
                  <button onClick={handleExportAnonymizedCSV} disabled={patientExportLoading} className={btnPrimary}>
                    {patientExportLoading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                    Patienten exportieren (.csv)
                  </button>
                  {patientExportError && <ErrorMsg>{patientExportError}</ErrorMsg>}
                </div>
              </Section>

              {/* Aktivitätslog */}
              <Section>
                <button onClick={handleAuditToggle}
                  className="w-full flex items-center justify-between px-5 py-2.5 bg-slate-800 hover:bg-slate-700 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Aktivitätslog</span>
                    <span className="text-[9px] font-semibold bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider">Admin</span>
                    {auditEntries.length > 0 && (
                      <span className="text-[9px] font-semibold bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md">{auditEntries.length}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {auditOpen && (
                      <button onClick={e => { e.stopPropagation(); loadAudit(); }} disabled={auditLoading}
                        className="flex items-center gap-1.5 px-2.5 py-1 border border-white/20 bg-white/10 text-slate-200 rounded-lg text-[10px] font-semibold hover:bg-white/20 transition-colors">
                        {auditLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                        Aktualisieren
                      </button>
                    )}
                    <ChevronDown size={15} className={cn('text-slate-400 transition-transform duration-200', auditOpen && 'rotate-180')} />
                  </div>
                </button>

                {auditOpen && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    {auditLoading && auditEntries.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 size={20} className="animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-4">
                        {auditEntries.length > 0 && (
                          <p className="text-xs text-slate-400">
                            <span className="font-bold text-slate-600">{auditEntries.length}</span> Einträge
                            {auditEntries[0] && (
                              <> · zuletzt {new Date(auditEntries[0].timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                            )}
                          </p>
                        )}
                        {auditEntries.length === 0 && <p className="text-xs text-slate-400">Keine Einträge vorhanden.</p>}
                        {auditEntries.length > 0 && (
                          <div className="w-full rounded-xl border border-slate-100 overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-gray-50/60">
                                <tr>
                                  <th className="px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Zeit</th>
                                  <th className="px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Benutzer</th>
                                  <th className="px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Aktion</th>
                                  <th className="px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Patient</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {auditEntries.slice(0, 50).map((e, i) => (
                                  <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono text-[10px]">
                                      {new Date(e.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-gray-700">{e.username}</td>
                                    <td className="px-3 py-2">
                                      <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-md', ACTION_COLOR[e.action])}>
                                        {ACTION_LABELS[e.action] ?? e.action}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">{e.patientName ?? '–'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <button onClick={() => downloadAuditCSV(auditEntries)} disabled={auditEntries.length === 0} className={btnPrimary}>
                          <Download size={13} />
                          Audit-Log exportieren (.csv)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Section>
            </>
          )}

          {/* Copyright */}
          <div className="pt-2 pb-6 text-center">
            <p className="text-[10px] text-slate-300 font-medium">
              © Paul Menke · Alle Rechte vorbehalten · Dieses Programm darf ohne ausdrückliche Genehmigung nicht vervielfältigt, weitergegeben oder anderweitig genutzt werden.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Small composables ─────────────────────────────────────────────────────────

const ActionIconBtn: React.FC<{
  onClick: () => void;
  title: string;
  hoverCls: string;
  children: React.ReactNode;
}> = ({ onClick, title, hoverCls, children }) => (
  <button onClick={onClick} title={title}
    className={cn('p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 transition-all', hoverCls)}>
    {children}
  </button>
);

const ErrorMsg: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn('text-xs text-rose-500 font-medium bg-rose-50 border border-rose-100 px-4 py-2.5 rounded-xl', className)}>
    {children}
  </p>
);
