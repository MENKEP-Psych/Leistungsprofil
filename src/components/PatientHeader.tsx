import React, { useState } from 'react';
import { User, Calendar, BookOpen, Clock, Pencil, ClipboardCheck, DoorOpen, ShieldCheck, AlertTriangle, FileText, Undo2 } from 'lucide-react';
import { Patient } from '../types';
import { formatDate } from '../lib/utils';

interface PatientHeaderProps {
  patient: Patient;
  onEdit: () => void;
  onDischarge: () => void;
  onUndoDischarge?: () => void;
  generalNote?: string;
  onSaveGeneralNote?: (note: string) => void;
}

const GESCHLECHT_LABEL: Record<string, string> = {
  m: 'Männlich',
  w: 'Weiblich',
  d: 'Divers',
};

export const PatientHeader: React.FC<PatientHeaderProps> = ({ patient, onEdit, onDischarge, onUndoDischarge, generalNote = '', onSaveGeneralNote }) => {
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  const handleDischarge = async () => {
    await onDischarge();
    setShowDischargeConfirm(false);
  };

  const handleUndoDischarge = async () => {
    if (onUndoDischarge) await onUndoDischarge();
    setShowUndoConfirm(false);
  };

  return (
    <>
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 pt-3 pb-0 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between pb-3">
        {/* Left: patient info */}
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
            <User size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{patient.name}</h1>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                {GESCHLECHT_LABEL[patient.geschlecht] ?? patient.geschlecht}
              </span>
              {patient.status === 'entlassen' && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-rose-100 text-rose-600">
                  Entlassen
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <Calendar size={12} className="text-slate-400 dark:text-slate-500" />
                {formatDate(patient.geburtsdatum)}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <Clock size={12} className="text-slate-400 dark:text-slate-500" />
                {patient.age} Jahre
              </span>
              {patient.bildungsjahre !== undefined && (
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <BookOpen size={12} className="text-slate-400 dark:text-slate-500" />
                  {patient.bildungsjahre} Bildungsjahre
                </span>
              )}
              {patient.aufnahmedatum && (
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <DoorOpen size={12} className="text-green-500" />
                  Aufnahme: {formatDate(patient.aufnahmedatum)}
                </span>
              )}
              {patient.entlassdatum && (
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <DoorOpen size={12} className="text-rose-400" />
                  Entlassung: {formatDate(patient.entlassdatum)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="no-print flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Verschlüsselt</span>
          </div>

          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 transition-all"
          >
            <Pencil size={15} />
            Bearbeiten
          </button>

          {patient.status !== 'entlassen' ? (
            <button
              onClick={() => setShowDischargeConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm font-bold text-amber-700 transition-all border border-amber-200"
            >
              <ClipboardCheck size={15} />
              Fall abschließen
            </button>
          ) : onUndoDischarge && (
            <button
              onClick={() => setShowUndoConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm font-bold text-amber-600 transition-all border border-amber-200"
            >
              <Undo2 size={15} />
              Reaktivieren
            </button>
          )}
        </div>
        </div>

        {/* General note row */}
        {onSaveGeneralNote && (
          <div className="no-print border-t border-slate-100 dark:border-slate-700 py-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <FileText size={13} className="text-indigo-400" />
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">
                Allgemeine Notiz
              </span>
            </div>
            <input
              type="text"
              value={generalNote}
              onChange={e => onSaveGeneralNote(e.target.value)}
              placeholder="Beobachtungen, Verlauf, Empfehlungen..."
              className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all font-medium"
            />
          </div>
        )}
      </header>

      {/* Undo discharge confirmation overlay */}
      {showUndoConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Undo2 size={28} className="text-amber-500" />
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Entlassung rückgängig?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              <span className="font-bold text-slate-700 dark:text-slate-200">{patient.name}</span> wird wieder als aktiv markiert und erscheint in der Patientenliste.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUndoConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
              >
                Abbrechen
              </button>
              <button
                onClick={handleUndoDischarge}
                className="flex-1 py-3 rounded-2xl bg-amber-500 text-sm font-black text-white hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
              >
                Reaktivieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discharge confirmation overlay */}
      {showDischargeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <ClipboardCheck size={28} className="text-amber-600" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">Fall abschließen?</h3>
            <p className="text-sm text-slate-500 mb-6">
              <span className="font-bold text-slate-700">{patient.name}</span> wird als entlassen markiert und
              aus der aktiven Patientenliste entfernt. Die Daten bleiben erhalten.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDischargeConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-black text-slate-600 hover:bg-slate-200 transition-all"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDischarge}
                className="flex-1 py-3 rounded-2xl bg-amber-500 text-sm font-black text-white hover:bg-amber-600 transition-all shadow-lg shadow-amber-200"
              >
                Fall abschließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
