import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, UserPlus, Search, Calendar, ArrowRight, Loader2, Archive, TableProperties } from 'lucide-react';
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

const GESCHLECHT_BADGE: Record<string, { label: string; cls: string }> = {
  m: { label: 'M', cls: 'bg-blue-100 text-blue-700' },
  w: { label: 'W', cls: 'bg-pink-100 text-pink-700' },
  d: { label: 'D', cls: 'bg-violet-100 text-violet-700' },
};

function relativeTime(updatedAt: { seconds: number } | null): string {
  if (!updatedAt?.seconds) return 'Unbekannt';
  const diff = Date.now() / 1000 - updatedAt.seconds;
  if (diff < 60) return 'Gerade eben';
  if (diff < 3600) return `Vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `Vor ${Math.floor(diff / 3600)} Std.`;
  if (diff < 604800) return `Vor ${Math.floor(diff / 86400)} Tagen`;
  return new Date(updatedAt.seconds * 1000).toLocaleDateString('de-DE');
}

export const PatientList: React.FC<PatientListProps> = ({ onSelectPatient, onCreatePatient }) => {
  const { patients, isLoading } = usePatients();
  const { encryptionKey, currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [npFilter, setNpFilter] = useState('');
  const [onlyOwn, setOnlyOwn] = useState(false);
  const [isExportingTAP, setIsExportingTAP] = useState(false);

  const handleTapDailyPDF = async () => {
    if (!encryptionKey) return;
    setIsExportingTAP(true);
    try {
      const data = await fetchAllActivePatients(encryptionKey);
      exportTapDailyPDF(data);
    } finally {
      setIsExportingTAP(false);
    }
  };

  const neuropsychs = [...new Set(
    patients.map(p => p.neuropsychologin).filter((v): v is string => !!v)
  )].sort();

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!npFilter || p.neuropsychologin === npFilter) &&
    (!onlyOwn || p.neuropsychologin === currentUser)
  );

  const active = filtered.filter(p => p.status !== 'entlassen');
  const archived = filtered.filter(p => p.status === 'entlassen');

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-sm font-medium">Lade Patientenliste...</p>
      </div>
    );
  }

  const PatientRow: React.FC<{ patient: typeof patients[0]; dimmed?: boolean }> = ({ patient, dimmed = false }) => {
    const badge = GESCHLECHT_BADGE[patient.geschlecht] ?? { label: '?', cls: 'bg-slate-100 text-slate-500' };
    return (
      <button
        key={patient.id}
        onClick={() => onSelectPatient(patient.id)}
        className={cn(
          'w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all group text-left',
          dimmed && 'opacity-60'
        )}
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900 group-hover:text-indigo-600 transition-colors">
            <Users size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {patient.name}
              </span>
              <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-lg', badge.cls)}>
                {badge.label}
              </span>
              {patient.status === 'entlassen' && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-rose-100 text-rose-500">
                  Entlassen
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                <Calendar size={11} />
                {formatDate(patient.geburtsdatum)}
              </span>
              {patient.neuropsychologin && (
                <span className="text-xs font-medium text-indigo-400">
                  {patient.neuropsychologin}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-0.5">
              Zuletzt bearbeitet
            </div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{relativeTime(patient.updatedAt)}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <ArrowRight size={18} />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-200">
            <Users size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">Patientenverwaltung</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
              {active.length} aktiv{archived.length > 0 && ` · ${archived.length} entlassen`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTapDailyPDF}
            disabled={isExportingTAP}
            title="TAP-Tagesübersicht als PDF exportieren"
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 disabled:opacity-50"
          >
            <TableProperties size={16} />
            TAP-Täglich
          </button>
          <button
            onClick={onCreatePatient}
            className="flex items-center gap-2.5 px-6 py-3 bg-indigo-600 rounded-2xl text-sm font-black text-white hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
          >
            <UserPlus size={18} /> Neuer Patient
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden">
        {/* Search + archive toggle */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Patient suchen (Name)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
            />
          </div>
          {neuropsychs.length > 0 && (
            <select
              value={npFilter}
              onChange={e => setNpFilter(e.target.value)}
              className="px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-600 dark:text-slate-300"
            >
              <option value="">Alle Neuropsycholog*innen</option>
              {neuropsychs.map(np => (
                <option key={np} value={np}>{np}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setOnlyOwn(v => !v)}
            title="Nur eigene Patienten anzeigen"
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black transition-all border',
              onlyOwn
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200'
                : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400'
            )}
          >
            Eigene
          </button>

          {archived.length > 0 && (
            <button
              onClick={() => setShowArchive(v => !v)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black transition-all border',
                showArchive
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400'
              )}
            >
              <Archive size={16} />
              Archiv
            </button>
          )}
        </div>

        {/* Active patients */}
        <div className="divide-y divide-slate-50 dark:divide-slate-700">
          {active.length > 0 ? (
            active.map(p => <PatientRow key={p.id} patient={p} />)
          ) : (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-50 dark:bg-slate-700 rounded-3xl flex items-center justify-center text-slate-200 dark:text-slate-600 mx-auto mb-3">
                <Search size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-600 dark:text-slate-300">Keine aktiven Patienten</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                {searchTerm ? 'Kein Treffer für Ihre Suche.' : 'Legen Sie einen neuen Patienten an.'}
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
            <div className="px-5 py-3 bg-slate-100 dark:bg-slate-700 border-t border-slate-200 dark:border-slate-600 flex items-center gap-2">
              <Archive size={14} className="text-slate-400 dark:text-slate-500" />
              <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Entlassene Patienten ({archived.length})
              </span>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700 bg-slate-50/30 dark:bg-slate-800/30">
              {archived.map(p => <PatientRow key={p.id} patient={p} dimmed />)}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
