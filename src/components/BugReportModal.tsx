import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bug, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { buildBugReportBundle } from '../lib/bugReport';
import { dbSaveJson } from '../lib/db-api';
import { useNormOverrides } from '../context/NormOverridesContext';
import { cn } from '../lib/utils';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  results: TestResult[];
}

type Ort = 'Testfeld' | 'Leistungsprofil' | 'PDF-Export' | 'Anderes';
const ORT_OPTIONS: Ort[] = ['Testfeld', 'Leistungsprofil', 'PDF-Export', 'Anderes'];

type PatientSeit = 'neu' | 'vorher' | 'weiss_nicht';
const PATIENT_SEIT_LABEL: Record<PatientSeit, string> = {
  neu: 'Neu seit dem letzten Update angelegt',
  vorher: 'Bestand schon vorher',
  weiss_nicht: 'Weiß ich nicht',
};

// Fehlerbericht: fragt gezielt nach Erwartung/Ist-Zustand + Fundort, baut daraus
// zusammen mit einer anonymisierten Version des Falls (siehe lib/anonymize.ts)
// eine JSON-Datei, die der Nutzer per nativem Speichern-Dialog ablegt (Default:
// Desktop) — die Datei kann dann gefahrlos per Mail verschickt werden.
export const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, onClose, patient, results }) => {
  const { overrides, assignments, verificationStore } = useNormOverrides();
  const [erwartet, setErwartet] = useState('');
  const [tatsaechlich, setTatsaechlich] = useState('');
  const [ort, setOrt] = useState<Ort>('Leistungsprofil');
  const [ortFreitext, setOrtFreitext] = useState('');
  const [patientSeit, setPatientSeit] = useState<PatientSeit>('weiss_nicht');
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'canceled' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErwartet('');
      setTatsaechlich('');
      setOrt('Leistungsprofil');
      setOrtFreitext('');
      setPatientSeit('weiss_nicht');
      setSaveState('idle');
      setErrorMsg('');
    }
  }, [isOpen]);

  const canSubmit = erwartet.trim() !== '' && tatsaechlich.trim() !== '' && (ort !== 'Anderes' || ortFreitext.trim() !== '');

  const handleSave = async () => {
    setIsSaving(true);
    setSaveState('idle');
    try {
      const bundle = buildBugReportBundle(
        patient,
        results,
        {
          erwartetesVerhalten: erwartet.trim(),
          tatsaechlichesVerhalten: tatsaechlich.trim(),
          ort: ort === 'Anderes' ? ortFreitext.trim() : ort,
          patientAngelegt: PATIENT_SEIT_LABEL[patientSeit],
        },
        { overrides, assignments, verification: verificationStore },
      );
      const filename = `fehlerbericht_${new Date().toISOString().slice(0, 10)}_${Math.random().toString(36).slice(2, 8)}.json`;
      const res = await dbSaveJson(filename, JSON.stringify(bundle, null, 2));
      if (res.success) {
        setSaveState('saved');
      } else if (res.canceled) {
        setSaveState('canceled');
      } else {
        setSaveState('error');
        setErrorMsg(res.error ?? 'Unbekannter Fehler');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-900/15 overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-rose-500 rounded-xl flex items-center justify-center text-white">
                  <Bug size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">Fehler bei diesem Patienten melden</h2>
                  <p className="text-[11px] text-slate-400">Der Fall wird vor dem Speichern automatisch anonymisiert.</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                <X size={18} />
              </button>
            </div>

            {saveState === 'saved' ? (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <CheckCircle2 size={32} className="text-emerald-500" />
                <p className="text-sm font-semibold text-slate-700">Fehlerbericht gespeichert</p>
                <p className="text-xs text-slate-500">Die Datei kann jetzt per E-Mail verschickt werden.</p>
                <button type="button" onClick={onClose}
                  className="mt-2 py-2 px-4 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-700 transition-colors">
                  Schließen
                </button>
              </div>
            ) : (
              <>
                <div className="p-6 space-y-5 overflow-y-auto">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                      Was sollte passieren?
                    </label>
                    <textarea
                      value={erwartet}
                      onChange={e => setErwartet(e.target.value)}
                      rows={2}
                      placeholder="Erwartetes Verhalten…"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all outline-none resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                      Was ist stattdessen passiert?
                    </label>
                    <textarea
                      value={tatsaechlich}
                      onChange={e => setTatsaechlich(e.target.value)}
                      rows={2}
                      placeholder="Tatsächliches Verhalten…"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all outline-none resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                      Wo trat das Problem auf?
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ORT_OPTIONS.map(o => (
                        <label key={o} className={cn(
                          'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors',
                          ort === o
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
                        )}>
                          <input type="radio" name="ort" className="sr-only" checked={ort === o} onChange={() => setOrt(o)} />
                          {o}
                        </label>
                      ))}
                    </div>
                    {ort === 'Anderes' && (
                      <input
                        type="text"
                        value={ortFreitext}
                        onChange={e => setOrtFreitext(e.target.value)}
                        placeholder="Wo genau?"
                        className="mt-1.5 w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all outline-none"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                      Wurde dieser Patient seit dem letzten App-Update neu angelegt?
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(Object.keys(PATIENT_SEIT_LABEL) as PatientSeit[]).map(k => (
                        <label key={k} className={cn(
                          'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors',
                          patientSeit === k
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
                        )}>
                          <input type="radio" name="patientSeit" className="sr-only" checked={patientSeit === k} onChange={() => setPatientSeit(k)} />
                          {PATIENT_SEIT_LABEL[k]}
                        </label>
                      ))}
                    </div>
                  </div>
                  {saveState === 'error' && (
                    <p className="text-xs text-rose-500">Speichern fehlgeschlagen: {errorMsg}</p>
                  )}
                  {saveState === 'canceled' && (
                    <p className="text-xs text-slate-400">Speichern abgebrochen.</p>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                  <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    Abbrechen
                  </button>
                  <button type="button" onClick={handleSave} disabled={isSaving || !canSubmit}
                    className="py-2 px-4 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : 'Anonymisiert speichern'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
