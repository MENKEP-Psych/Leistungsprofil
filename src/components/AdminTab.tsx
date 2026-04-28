import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  CheckCircle,
  ClipboardList,
  RefreshCw,
  Loader2,
  Moon,
  Sun,
  Users,
  UserPlus,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Copy,
  User,
  ShieldAlert,
  Download,
  Server,
  Save,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAuditLog } from '../hooks/useAuditLog';
import { AuditEntry } from '../types';
import {
  dbGetUsers,
  dbCreateUser,
  dbDeleteUser,
  dbChangePassword,
  dbGetRecoveryKey,
  dbLogin,
  dbSyncGetServerPath,
  dbSyncSetServerPath,
  isElectron,
} from '../lib/db-api';
import type { UserRow } from '../lib/ipc-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  LOGIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  LOGOUT: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  PATIENT_CREATED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PATIENT_UPDATED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  PATIENT_DISCHARGED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  TEST_SAVED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  TEST_UPDATED: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  RESULT_DELETED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ── CSV export ────────────────────────────────────────────────────────────────

function escapeCSV(value: string | undefined): string {
  if (!value) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
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
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const date = new Date().toISOString().slice(0, 10);
  link.download = `audit-log_${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Section wrapper ───────────────────────────────────────────────────────────

const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const SectionHeader: React.FC<{ label: string; badge?: string; right?: React.ReactNode }> = ({ label, badge, right }) => (
  <div className="flex items-center justify-between px-6 pt-6 pb-4">
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">{label}</span>
      {badge && (
        <span className="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{badge}</span>
      )}
    </div>
    {right}
  </div>
);

// ── Change‑password modal ─────────────────────────────────────────────────────

interface ChangePwModalProps {
  targetUsername: string;
  isOwn: boolean;
  onClose: () => void;
}

const ChangePwModal: React.FC<ChangePwModalProps> = ({ targetUsername, isOwn, onClose }) => {
  const { currentUser } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl p-8 w-full max-w-sm mx-4">
        <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mb-6">
          {isOwn ? 'Eigenes Passwort ändern' : `Passwort zurücksetzen — ${targetUsername}`}
        </h3>

        {done ? (
          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl">
            <CheckCircle size={18} />
            <span className="text-sm font-bold">Passwort geändert</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isOwn && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aktuelles Passwort</label>
                <input
                  ref={firstRef}
                  type="password"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neues Passwort</label>
              <div className="relative">
                <input
                  ref={isOwn ? undefined : firstRef}
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-11 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                />
                <button type="button" onClick={() => setShowNew(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Wiederholen</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              />
            </div>

            {error && <p className="text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-black text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                Abbrechen
              </button>
              <button type="submit" disabled={loading} className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <Loader2 size={15} className="animate-spin" /> : 'Speichern'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const AdminTab: React.FC = () => {
  const { currentUserRole, currentUser } = useAuth();
  const { getEntries } = useAuditLog();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = currentUserRole === 'admin';

  // Password modal
  const [changePwFor, setChangePwFor] = useState<{ username: string; isOwn: boolean } | null>(null);

  // User management
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Recovery key
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null); // null = loading
  const [recoveryRevealed, setRecoveryRevealed] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  // Server path (sync configuration — protected by IT password)
  const [serverPath, setServerPath] = useState('');
  const [serverPathSaving, setServerPathSaving] = useState(false);
  const [serverPathSaved, setServerPathSaved] = useState(false);
  const [serverPathError, setServerPathError] = useState('');
  const [serverPathUnlocked, setServerPathUnlocked] = useState(false);
  const [serverPathPw, setServerPathPw] = useState('');
  const [serverPathPwError, setServerPathPwError] = useState('');

  // Audit log
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsers(await dbGetUsers());
    setUsersLoading(false);
  };

  const loadRecoveryKey = async () => {
    const key = await dbGetRecoveryKey();
    setRecoveryKey(key); // empty string means "not available in this mode"
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    setAuditEntries(await getEntries());
    setAuditLoading(false);
  };

  const loadServerPath = async () => {
    if (!isElectron()) return;
    const p = await dbSyncGetServerPath();
    setServerPath(p);
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadRecoveryKey();
      loadServerPath();
    }
  }, [isAdmin]);

  const handleUnlockServerPath = (e: React.FormEvent) => {
    e.preventDefault();
    if (serverPathPw === 'jobavarapport') {
      setServerPathUnlocked(true);
      setServerPathPwError('');
      setServerPathPw('');
    } else {
      setServerPathPwError('Falsches Passwort');
    }
  };

  const handleSaveServerPath = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerPathError('');
    setServerPathSaved(false);
    setServerPathSaving(true);
    const res = await dbSyncSetServerPath(serverPath.trim());
    setServerPathSaving(false);
    if (res.success) {
      setServerPathSaved(true);
      setServerPathUnlocked(false);
      setTimeout(() => setServerPathSaved(false), 3000);
    } else {
      setServerPathError(res.error ?? 'Fehler beim Speichern');
    }
  };

  const handleAuditToggle = () => {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next && auditEntries.length === 0) loadAudit();
  };

  // ── User actions ────────────────────────────────────────────────────────────

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (newUsername.trim().length < 3) { setCreateError('Mindestens 3 Zeichen'); return; }
    if (newPassword.length < 6) { setCreateError('Passwort muss mindestens 6 Zeichen haben'); return; }
    setCreateLoading(true);
    const res = await dbCreateUser(newUsername.trim().toLowerCase(), newPassword, newRole);
    setCreateLoading(false);
    if (res.success) {
      setNewUsername(''); setNewPassword(''); setNewRole('user');
      await loadUsers();
    } else {
      setCreateError(res.error ?? 'Fehler beim Erstellen');
    }
  };

  const handleDeleteUser = async (username: string) => {
    setDeleteError('');
    if (!confirm(`Benutzer »${username}« wirklich löschen?`)) return;
    const res = await dbDeleteUser(username);
    if (res.success) { await loadUsers(); }
    else { setDeleteError(res.error ?? 'Löschen fehlgeschlagen'); }
  };

  const handleCopyRecovery = () => {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey).then(() => {
      setRecoveryCopied(true);
      setTimeout(() => setRecoveryCopied(false), 2000);
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      {changePwFor && (
        <ChangePwModal
          targetUsername={changePwFor.username}
          isOwn={changePwFor.isOwn}
          onClose={() => { setChangePwFor(null); }}
        />
      )}

      {/* ── Persönliches Konto ── */}
      <Section>
        <SectionHeader label="Persönliches Konto" />
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <User size={16} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">{currentUser}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium capitalize">{currentUserRole}</p>
              </div>
            </div>
            <button
              onClick={() => setChangePwFor({ username: currentUser!, isOwn: true })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-black transition-all"
            >
              <KeyRound size={13} />
              Passwort ändern
            </button>
          </div>
        </div>
      </Section>

      {/* ── Erscheinungsbild ── */}
      <Section>
        <SectionHeader label="Erscheinungsbild" />
        <div className="px-6 pb-6">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-700/60 border border-slate-100 dark:border-slate-700 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark'
                ? <Moon size={16} className="text-indigo-400" />
                : <Sun size={16} className="text-amber-500" />}
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
            <div className={cn('relative w-10 h-5 rounded-full transition-colors', theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-300')}>
              <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform', theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5')} />
            </div>
          </button>
        </div>
      </Section>

      {/* ── Admin‑only sections ── */}
      {isAdmin && (
        <>
          {/* Benutzerverwaltung */}
          <Section>
            <SectionHeader
              label="Benutzerverwaltung"
              badge="Admin"
              right={
                <button
                  onClick={loadUsers}
                  disabled={usersLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 text-xs font-black transition-all disabled:opacity-50"
                >
                  {usersLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Aktualisieren
                </button>
              }
            />

            {/* User list */}
            <div className="px-6">
              {usersLoading && users.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-slate-300 dark:text-slate-600" />
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700">
                  {users.map((u, i) => (
                    <div
                      key={u.username}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 transition-colors',
                        i < users.length - 1 && 'border-b border-slate-50 dark:border-slate-700',
                        'hover:bg-slate-50/80 dark:hover:bg-slate-700/40'
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        'w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0',
                        u.username === 'recovery'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          : u.role === 'admin'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      )}>
                        {u.username === 'recovery' ? '🔑' : u.username[0].toUpperCase()}
                      </div>

                      {/* Name + role */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{u.username}</span>
                          {u.username === currentUser && (
                            <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0">Du</span>
                          )}
                        </div>
                        <span className={cn(
                          'text-[10px] font-semibold',
                          u.username === 'recovery' ? 'text-amber-500 dark:text-amber-400' :
                          u.role === 'admin' ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                        )}>
                          {u.username === 'recovery' ? 'Notfall-Zugang' : u.role === 'admin' ? 'Administrator' : 'Benutzer'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {u.username !== 'recovery' && (
                          <button
                            onClick={() => setChangePwFor({ username: u.username, isOwn: u.username === currentUser })}
                            title="Passwort zurücksetzen"
                            className="p-2 rounded-xl text-slate-300 dark:text-slate-600 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30 transition-all"
                          >
                            <KeyRound size={14} />
                          </button>
                        )}
                        {u.username !== 'recovery' && u.username !== currentUser && (
                          <button
                            onClick={() => handleDeleteUser(u.username)}
                            title="Benutzer löschen"
                            className="p-2 rounded-xl text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {deleteError && (
                <p className="mt-3 text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl">{deleteError}</p>
              )}
            </div>

            {/* Divider */}
            <div className="mx-6 my-5 border-t border-slate-100 dark:border-slate-700" />

            {/* Create user form */}
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus size={14} className="text-slate-400 dark:text-slate-500" />
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Neuen Benutzer anlegen</span>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Benutzername</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      placeholder="z.B. mueller"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Initiales Passwort</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mindestens 6 Zeichen"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rolle</label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as 'admin' | 'user')}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    >
                      <option value="user">Benutzer</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-sm font-black transition-all disabled:opacity-60 shrink-0"
                  >
                    {createLoading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    Erstellen
                  </button>
                </div>
                {createError && (
                  <p className="text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl">{createError}</p>
                )}
              </form>
            </div>
          </Section>

          {/* Notfall-Zugang */}
          <Section>
            <SectionHeader label="Notfall-Zugang" badge="Admin" />
            <div className="px-6 pb-6 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Falls alle regulären Passwörter vergessen wurden, kann mit dem Benutzernamen{' '}
                <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">recovery</code>{' '}
                und diesem Code eingeloggt werden. Der Code ist identisch mit dem Inhalt der Datei{' '}
                <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">.recovery</code>{' '}
                im geteilten Ordner.
              </p>

              {/* Key display */}
              <div className="relative flex items-center gap-2 p-4 bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-700 rounded-2xl">
                <ShieldAlert size={16} className="text-amber-500 shrink-0" />
                <div className="flex-1 overflow-hidden">
                  {recoveryKey === null ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Wird geladen…</span>
                  ) : recoveryKey === '' ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium italic">Nicht verfügbar (nur im Electron-Modus)</span>
                  ) : (
                    <span
                      className={cn(
                        'font-mono text-base font-black text-slate-800 dark:text-slate-100 tracking-[0.15em] select-none transition-all duration-200',
                        !recoveryRevealed && 'blur-sm'
                      )}
                    >
                      {recoveryKey}
                    </span>
                  )}
                </div>

                {recoveryKey ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setRecoveryRevealed(v => !v)}
                      title={recoveryRevealed ? 'Verbergen' : 'Anzeigen'}
                      className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-all"
                    >
                      {recoveryRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      onClick={handleCopyRecovery}
                      title="Kopieren"
                      className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-all"
                    >
                      {recoveryCopied ? <CheckCircle size={15} className="text-emerald-500" /> : <Copy size={15} />}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Den Code sicher notieren und getrennt vom Computer aufbewahren.</span>
              </div>
            </div>
          </Section>

          {/* Server-Datenbankpfad */}
          {isElectron() && (
            <Section>
              <SectionHeader label="Server-Datenbankpfad" badge="IT" />
              <div className="px-6 pb-6 space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Pfad zur Master-Datenbank auf dem Server-Share (z.B.{' '}
                  <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    G:\Leistungsprofil\leistungsprofil.sqlite
                  </code>
                  {' '}oder UNC-Pfad). Nur für die IT.
                </p>

                {!serverPathUnlocked ? (
                  <form onSubmit={handleUnlockServerPath} className="flex gap-3">
                    <div className="flex-1 relative">
                      <KeyRound size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                      <input
                        type="password"
                        value={serverPathPw}
                        onChange={e => { setServerPathPw(e.target.value); setServerPathPwError(''); }}
                        placeholder="IT-Passwort eingeben…"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                      />
                    </div>
                    <button
                      type="submit"
                      className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-black transition-all shrink-0"
                    >
                      <KeyRound size={14} />
                      Entsperren
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSaveServerPath} className="flex gap-3">
                    <div className="flex-1 relative">
                      <Server size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        value={serverPath}
                        onChange={e => { setServerPath(e.target.value); setServerPathSaved(false); }}
                        placeholder="\\Server\Share\leistungsprofil.sqlite"
                        autoFocus
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-indigo-300 dark:border-indigo-600 rounded-xl text-sm font-mono font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={serverPathSaving}
                      className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black transition-all disabled:opacity-60 shrink-0"
                    >
                      {serverPathSaving
                        ? <Loader2 size={14} className="animate-spin" />
                        : serverPathSaved
                          ? <CheckCircle size={14} />
                          : <Save size={14} />}
                      {serverPathSaved ? 'Gespeichert' : 'Speichern'}
                    </button>
                  </form>
                )}

                {serverPathPwError && (
                  <p className="text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl">{serverPathPwError}</p>
                )}
                {serverPathError && (
                  <p className="text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl">{serverPathError}</p>
                )}

                {serverPathSaved && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Pfad gespeichert. Wird beim nächsten App-Start für den automatischen Pull verwendet.
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* Audit-Log (collapsible) */}
          <Section>
            <button
              onClick={handleAuditToggle}
              className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ClipboardList size={15} className="text-slate-400 dark:text-slate-500" />
                <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Aktivitätslog</span>
                <span className="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md uppercase tracking-wider">Admin</span>
                {auditEntries.length > 0 && (
                  <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded-md">{auditEntries.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {auditOpen && (
                  <button
                    onClick={e => { e.stopPropagation(); loadAudit(); }}
                    disabled={auditLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 text-[10px] font-black transition-all disabled:opacity-50"
                  >
                    {auditLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    Aktualisieren
                  </button>
                )}
                <ChevronDown
                  size={16}
                  className={cn('text-slate-300 dark:text-slate-600 transition-transform duration-200', auditOpen && 'rotate-180')}
                />
              </div>
            </button>

            {auditOpen && (
              <div className="border-t border-slate-100 dark:border-slate-700 px-6 py-5">
                {auditLoading && auditEntries.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-slate-300 dark:text-slate-600" />
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-4">
                    {auditEntries.length > 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        <span className="font-black text-slate-600 dark:text-slate-300">{auditEntries.length}</span> Einträge
                        {auditEntries[0] && (
                          <> · zuletzt {new Date(auditEntries[0].timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                        )}
                      </p>
                    )}
                    {auditEntries.length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Keine Einträge vorhanden.</p>
                    )}
                    <button
                      onClick={() => downloadAuditCSV(auditEntries)}
                      disabled={auditEntries.length === 0}
                      className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-black transition-all shadow-md shadow-indigo-200 dark:shadow-none"
                    >
                      <Download size={14} />
                      Audit-Log exportieren (.csv)
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
};
