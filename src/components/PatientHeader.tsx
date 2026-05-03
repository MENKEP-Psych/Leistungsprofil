import React, { useState } from 'react';
import { User, Calendar, BookOpen, Pencil, ClipboardCheck, DoorOpen, Undo2, Stethoscope, StickyNote, Building2, LayoutDashboard, History } from 'lucide-react';
import { Patient } from '../types';
import { formatDate } from '../lib/utils';
import type { PatientListItem } from '../hooks/usePatients';

interface PatientHeaderProps {
  patient: Patient;
  onEdit: () => void;
  onDischarge: () => void;
  onUndoDischarge?: () => void;
  generalNote?: string;
  onSaveGeneralNote?: (note: string) => void;
  onEditClick?: () => void;
  onShowProfile?: () => void;
  previousAdmissions?: PatientListItem[];
  onSelectPreviousPatient?: (id: string) => void;
}

const GESCHLECHT_LABEL: Record<string, string> = {
  m: 'Männlich',
  w: 'Weiblich',
  d: 'Divers',
};

export const PatientHeader: React.FC<PatientHeaderProps> = ({ patient, onEdit, onDischarge, onUndoDischarge, generalNote = '', onSaveGeneralNote, onShowProfile, previousAdmissions = [], onSelectPreviousPatient }) => {
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
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-5 py-2 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between gap-4">
          {/* Left: patient info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
              <User size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-black text-slate-800 dark:text-slate-100 leading-tight">{patient.name}</h1>
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                  {GESCHLECHT_LABEL[patient.geschlecht] ?? patient.geschlecht}
                </span>
                {patient.status === 'entlassen' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-600">
                    Entlassen
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-0.5">
                <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  <Calendar size={11} className="text-slate-400 dark:text-slate-500" />
                  {formatDate(patient.geburtsdatum)} · {patient.age} J.
                </span>
                {patient.bildungsjahre !== undefined && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    <BookOpen size={11} className="text-slate-400 dark:text-slate-500" />
                    {patient.bildungsjahre} Bdj.
                  </span>
                )}
                {patient.aufnahmedatum && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    <DoorOpen size={11} className="text-green-500" />
                    {formatDate(patient.aufnahmedatum)}
                  </span>
                )}
                {(patient.station || patient.zimmer) && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    <Building2 size={11} className="text-slate-400 dark:text-slate-500" />
                    {[patient.station, patient.zimmer].filter(Boolean).join(' · ')}
                  </span>
                )}
                {previousAdmissions.length > 0 && onSelectPreviousPatient && (
                  <button
                    type="button"
                    onClick={() => onSelectPreviousPatient(previousAdmissions[0].id)}
                    className="flex items-center gap-1 text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-1.5 py-0.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                    title={previousAdmissions.length > 1 ? `${previousAdmissions.length} frühere Aufenthalte gefunden` : 'Früherer Aufenthalt gefunden – klicken zum Öffnen'}
                  >
                    <History size={9} />
                    {previousAdmissions.length === 1 ? 'Früherer Aufenthalt' : `${previousAdmissions.length}× früher`}
                  </button>
                )}
                {patient.diagnose ? (
                  <span className="flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400 font-medium">
                    <Stethoscope size={11} />
                    {patient.diagnose}
                    {patient.lokalisation && (
                      <span className="text-violet-400 dark:text-violet-500 font-normal">
                        · {patient.lokalisation}
                      </span>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium hover:text-violet-500 transition-colors"
                    title="Diagnose eintragen"
                  >
                    <Stethoscope size={10} />
                    <span className="italic">Diagnose eintragen</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Center: general note */}
          {onSaveGeneralNote && (
            <div className="no-print flex-1 flex items-center gap-2 min-w-0 max-w-lg">
              <StickyNote size={14} className="text-amber-400 shrink-0" />
              <input
                type="text"
                value={generalNote}
                onChange={e => onSaveGeneralNote(e.target.value)}
                placeholder="Interne Notiz (nicht im PDF): Beobachtungen, Verlauf, Empfehlungen..."
                className="flex-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder:text-amber-400/70 dark:placeholder:text-amber-600 focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 outline-none transition-all font-medium"
              />
            </div>
          )}

          {/* Right: actions */}
          <div className="no-print flex items-center gap-2 shrink-0">
            {onShowProfile && (
              <button
                onClick={onShowProfile}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-bold text-white transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
              >
                <LayoutDashboard size={13} />
                Leistungsprofil
              </button>
            )}
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
            >
              <Pencil size={13} />
              Bearbeiten
            </button>

            {patient.status !== 'entlassen' ? (
              <button
                onClick={() => setShowDischargeConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 rounded-xl text-xs font-bold text-amber-700 transition-all border border-amber-200"
              >
                <ClipboardCheck size={13} />
                Fall abschließen
              </button>
            ) : onUndoDischarge && (
              <button
                onClick={() => setShowUndoConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 rounded-xl text-xs font-bold text-amber-600 transition-all border border-amber-200"
              >
                <Undo2 size={13} />
                Reaktivieren
              </button>
            )}
          </div>
        </div>
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
