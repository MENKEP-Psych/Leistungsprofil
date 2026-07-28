import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Users, UserPlus, Search, ArrowRight, Loader2, Archive, TableProperties, Star } from 'lucide-react';
import { usePatients } from '../hooks/usePatients';
import { useAuth } from '../context/AuthContext';
import { fetchAllActivePatients } from '../lib/db-api';
import { exportTapDailyPDF } from '../lib/tapDailyPDF';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';

interface PatientListProps {
  onSelectPatient: (id: string) => void;
  onCreatePatient: () => void;
}

const STORAGE_KEY = 'patientList_onlyOwnDefault';

function loadOnlyOwnDefault(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

function saveOnlyOwnDefault(val: boolean) {
  try { localStorage.setItem(STORAGE_KEY, String(val)); } catch {}
}

function getLastName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1] ?? fullName;
}

function isEntlassungOverdue(entlassdatum?: string, status?: string): boolean {
  if (!entlassdatum || status === 'entlassen') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(entlassdatum);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

export const PatientList: React.FC<PatientListProps> = ({ onSelectPatient, onCreatePatient }) => {
  const { patients, isLoading } = usePatients();
  const { encryptionKey, currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [npFilter, setNpFilter] = useState('');
  const [onlyOwn, setOnlyOwn] = useState(loadOnlyOwnDefault);
  const [savedDefault, setSavedDefault] = useState(loadOnlyOwnDefault);
  const [isExportingTAP, setIsExportingTAP] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const displayedRef = useRef<typeof patients>([]);
  const focusedRef = useRef(-1);

  const handleSaveDefault = () => {
    saveOnlyOwnDefault(onlyOwn);
    setSavedDefault(onlyOwn);
  };

  const handleTapDailyPDF = async () => {
    if (!encryptionKey) return;
    setIsExportingTAP(true);
    try {
      const data = await fetchAllActivePatients(encryptionKey);
      await exportTapDailyPDF(data);
    } finally {
      setIsExportingTAP(false);
    }
  };

  const neuropsychs = [...new Set(
    patients.flatMap(p => p.mitarbeiter)
  )].sort();

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!npFilter || p.mitarbeiter.includes(npFilter)) &&
    (!onlyOwn || p.mitarbeiter.includes(currentUser ?? ''))
  );

  const active = filtered
    .filter(p => p.status !== 'entlassen')
    .sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name), 'de'));

  const archived = filtered.filter(p => p.status === 'entlassen');

  // Archiv-Button-Sichtbarkeit basiert auf ALLEN Patienten (unabhängig vom Filter),
  // damit der Button nicht verschwindet wenn "Eigene" aktiv ist
  const totalArchived = patients.filter(p => p.status === 'entlassen').length;

  useEffect(() => { displayedRef.current = showArchive ? [...active, ...archived] : active; });
  useEffect(() => { focusedRef.current = focusedIndex; });
  useEffect(() => { setFocusedIndex(-1); }, [searchTerm, npFilter, onlyOwn, showArchive]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    listRef.current?.querySelector(`[data-row-index="${focusedIndex}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, displayedRef.current.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedRef.current >= 0) {
        const p = displayedRef.current[focusedRef.current];
        if (p) onSelectPatient(p.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectPatient]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mb-4" size={40} />
        <p className="text-sm font-medium">Lade Patientenliste...</p>
      </div>
    );
  }

  const PatientRow: React.FC<{ patient: typeof patients[0]; dimmed?: boolean; isFocused?: boolean; index: number }> = ({ patient, dimmed = false, isFocused = false, index }) => {
    const parts = patient.name.trim().split(' ');
    const lastName = parts[parts.length - 1] ?? patient.name;
    const firstName = parts.slice(0, -1).join(' ');
    const overdue = isEntlassungOverdue(patient.entlassdatum, patient.status);

    const Dot = () => <span className="mx-1.5 text-slate-300 dark:text-slate-600 select-none">·</span>;

    return (
      <button
        data-row-index={index}
        onClick={() => onSelectPatient(patient.id)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3.5 transition-colors group text-left',
          'border-b border-slate-200 dark:border-slate-700 last:border-0',
          isFocused
            ? 'bg-slate-100 dark:bg-slate-700/60'
            : 'hover:bg-slate-50 dark:hover:bg-slate-700/40',
          dimmed && 'opacity-55'
        )}
      >
        <div className="min-w-0 flex-1">
          {/* Row 1: Name + status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {lastName}{firstName ? `, ${firstName}` : ''}
            </span>
            {patient.status === 'entlassen' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
                Entlassen
              </span>
            )}
            {overdue && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                Entlassung prüfen
              </span>
            )}
          </div>

          {/* Row 2: Metadata */}
          <div className="flex items-center text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap gap-y-0.5">
            <span>{formatDate(patient.geburtsdatum)}</span>
            {patient.mitarbeiter.length > 0 && (
              <>
                <Dot />
                <span className="font-medium capitalize">{patient.mitarbeiter.join(', ')}</span>
              </>
            )}
            {patient.entlassdatum && (
              <>
                <Dot />
                <span>Entl.&thinsp;{formatDate(patient.entlassdatum)}</span>
              </>
            )}
          </div>
        </div>

        <ArrowRight
          size={14}
          className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors shrink-0 ml-3"
        />
      </button>
    );
  };

  return (
    <div className="space-y-4">

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none overflow-hidden">

        {/* Dark header */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Users size={13} className="text-slate-300" />
            </div>
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Patienten</span>
            <span className="text-[9px] font-semibold bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md">
              {active.length} aktiv
            </span>
            {archived.length > 0 && (
              <span className="text-[9px] font-semibold bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-md">
                {archived.length} entlassen
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTapDailyPDF}
              disabled={isExportingTAP}
              title="TAP-Tagesübersicht als PDF exportieren"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 bg-white/10 text-slate-200 rounded-xl text-[10px] font-semibold hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              {isExportingTAP ? <Loader2 size={12} className="animate-spin" /> : <TableProperties size={12} />}
              TAP-Täglich
            </button>
            <button
              onClick={onCreatePatient}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-900 rounded-xl text-[10px] font-semibold hover:bg-slate-100 transition-colors"
            >
              <UserPlus size={12} /> Neuer Patient
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Name suchen…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* Neuropsychologin filter */}
          {neuropsychs.length > 0 && (
            <select
              value={npFilter}
              onChange={e => setNpFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-medium focus:outline-none focus:border-slate-400 transition-colors text-slate-600 dark:text-slate-300"
            >
              <option value="">Alle Mitarbeiter*innen</option>
              {neuropsychs.map(np => (
                <option key={np} value={np}>{np}</option>
              ))}
            </select>
          )}

          {/* Alle / Eigene segmented control + Standard-Stern (immer sichtbar, kein Layout-Shift) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-700">
              <button
                onClick={() => setOnlyOwn(false)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  !onlyOwn
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                )}
              >
                Alle
              </button>
              <button
                onClick={() => setOnlyOwn(true)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors border-l border-slate-200 dark:border-slate-600',
                  onlyOwn
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                )}
              >
                Eigene
              </button>
            </div>

            {/* Stern: immer gerendert — goldfarben wenn aktiver Filter = Standard, sonst grau klickbar */}
            <button
              onClick={onlyOwn !== savedDefault ? handleSaveDefault : undefined}
              title={onlyOwn === savedDefault ? 'Dieser Filter ist der Standard' : 'Als Standard speichern'}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                onlyOwn === savedDefault
                  ? 'text-amber-400 cursor-default'
                  : 'text-slate-300 dark:text-slate-600 hover:text-amber-400 dark:hover:text-amber-400 cursor-pointer'
              )}
            >
              <Star
                size={14}
                fill={onlyOwn === savedDefault ? 'currentColor' : 'none'}
                strokeWidth={onlyOwn === savedDefault ? 0 : 1.5}
              />
            </button>
          </div>

          {/* Archive toggle — Sichtbarkeit basiert auf totalArchived, nicht gefiltertem archived */}
          {(totalArchived > 0 || showArchive) && (
            <button
              onClick={() => setShowArchive(v => !v)}
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border shrink-0 min-w-[120px]',
                showArchive
                  ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 border-slate-800 dark:border-slate-200'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
              )}
            >
              <Archive size={13} />
              {showArchive ? 'Archiv ausblenden' : `Archiv (${totalArchived})`}
            </button>
          )}
        </div>

        {/* Active patients */}
        <div ref={listRef}>
          {active.length > 0 ? (
            active.map((p, i) => (
              <PatientRow key={p.id} patient={p} index={i} isFocused={focusedIndex === i} />
            ))
          ) : (
            <div className="py-12 text-center">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-300 dark:text-slate-600 mx-auto mb-3">
                <Users size={20} />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Keine aktiven Patienten</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {searchTerm || onlyOwn
                  ? 'Kein Treffer für den aktuellen Filter.'
                  : 'Legen Sie einen neuen Patienten an.'}
              </p>
            </div>
          )}
        </div>

        {/* Archived patients */}
        {showArchive && archived.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="px-5 py-2 bg-slate-100 dark:bg-slate-700/60 border-t border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Entlassene Patienten ({archived.length})
              </span>
            </div>
            <div>
              {archived.map((p, i) => (
                <PatientRow key={p.id} patient={p} dimmed index={active.length + i} isFocused={focusedIndex === active.length + i} />
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
};
