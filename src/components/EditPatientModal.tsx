import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, X, AlertCircle, Loader2, ClipboardCheck, Trash2, Undo2, AlertTriangle } from 'lucide-react';
import { Patient } from '../types';
import { dbGetUsers } from '../lib/db-api';
import {
  DIAGNOSE_OPTIONEN, LOKALISATION_CONFIG,
  toggleDiagnoseSelection, resolveDiagnoses, resolveLokalisationMap,
  splitAndereFromDiagnoses, restoreLokalisationMap,
} from '../lib/diagnose-config';
import { cn } from '../lib/utils';

interface EditPatientModalProps {
  isOpen: boolean;
  patient: Patient | null;
  onClose: () => void;
  onSave: (updates: Partial<Pick<Patient, 'name' | 'geburtsdatum' | 'geschlecht' | 'bildungsjahre' | 'mitarbeiter' | 'aufnahmedatum' | 'entlassdatum' | 'diagnose' | 'lokalisation'>>) => Promise<boolean>;
  onDischarge?: () => Promise<void>;
  onUndoDischarge?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  isAdmin?: boolean;
}

const inputCls =
  'w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all outline-none';
const labelCls = 'text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1';

const PILL_BASE = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border';
const PILL_ACTIVE = 'bg-slate-900 text-white border-slate-900';
const PILL_IDLE = 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800';

// Pre-defined x offsets for the moving delete button (relative to its right-aligned natural position)
const DELETE_OFFSETS = [-40, -80, -120, -160, -200, -60, -100, -140, -50, -170];

export const EditPatientModal: React.FC<EditPatientModalProps> = ({
  isOpen, patient, onClose, onSave,
  onDischarge, onUndoDischarge, onDelete, isAdmin,
}) => {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [geburtsdatum, setGeburtsdatum] = useState('');
  const [geschlecht, setGeschlecht] = useState<'m' | 'w' | 'd'>('m');
  const [bildungsjahre, setBildungsjahre] = useState('');
  const [mitarbeiter, setMitarbeiter] = useState<string[]>([]);
  const [aufnahmedatum, setAufnahmedatum] = useState('');
  const [entlassdatum, setEntlassdatum] = useState('');
  const [diagnosen, setDiagnosen] = useState<string[]>([]);
  const [andereText, setAndereText] = useState('');
  const [lokalisationByDiagnose, setLokalisationByDiagnose] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<string[]>([]);

  // Danger zone state
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteXOffset, setDeleteXOffset] = useState(0);
  const [dangerLoading, setDangerLoading] = useState(false);
  const prevOffsetRef = useRef(0);

  useEffect(() => {
    dbGetUsers().then(users => setAllUsers(users.map(u => u.username)));
  }, []);

  useEffect(() => {
    if (patient && isOpen) {
      const parts = patient.name.split(' ');
      setVorname(parts.slice(0, -1).join(' ') || parts[0] || '');
      setNachname(parts.length > 1 ? parts[parts.length - 1] : '');
      setGeburtsdatum(patient.geburtsdatum);
      setGeschlecht(patient.geschlecht);
      setBildungsjahre(patient.bildungsjahre?.toString() ?? '');
      setMitarbeiter(patient.mitarbeiter ?? []);
      setAufnahmedatum(patient.aufnahmedatum ?? '');
      setEntlassdatum(patient.entlassdatum ?? '');

      const { selected, andereText: storedAndereText } = splitAndereFromDiagnoses(patient.diagnose ?? []);
      setDiagnosen(selected);
      setAndereText(storedAndereText);
      setLokalisationByDiagnose(restoreLokalisationMap(selected, patient.lokalisation ?? {}));
      setShowDischargeConfirm(false);
      setShowUndoConfirm(false);
      setShowDeleteConfirm(false);
      setDeleteCount(0);
      setDeleteXOffset(0);
    }
  // Bewusst nur an `patient.id` (nicht am ganzen `patient`-Objekt) hängen: das
  // Patienten-Objekt wird bei jedem Hintergrund-Sync / jeder Ergebnis-Änderung
  // neu erzeugt (u. a. weil `age` frisch berechnet wird). Hing der Effekt am
  // ganzen Objekt, lief er mitten im Bearbeiten erneut und überschrieb noch nicht
  // gespeicherte Eingaben mit den Serverwerten (z. B. „Bildungsjahre 10" sprang
  // zurück auf „6"). Die Formularwerte werden jetzt nur beim Öffnen bzw. beim
  // Wechsel auf einen anderen Patienten neu geladen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id, isOpen]);

  // Reset delete button position when confirm panel opens
  useEffect(() => {
    if (showDeleteConfirm) {
      setDeleteCount(0);
      setDeleteXOffset(0);
      prevOffsetRef.current = 0;
    }
  }, [showDeleteConfirm]);

  const shuffleDeleteBtn = () => {
    const available = DELETE_OFFSETS.filter(v => v !== prevOffsetRef.current);
    const next = available[Math.floor(Math.random() * available.length)];
    prevOffsetRef.current = next;
    setDeleteXOffset(next);
  };

  const handleDiagnoseClick = (opt: string) => {
    const wasSelected = diagnosen.includes(opt);
    setDiagnosen(prev => toggleDiagnoseSelection(prev, opt));
    if (opt === 'Andere' && wasSelected) setAndereText('');
    setLokalisationByDiagnose(prev => {
      const next = { ...prev };
      if (wasSelected) {
        delete next[opt];
      } else {
        const groups = LOKALISATION_CONFIG[opt as keyof typeof LOKALISATION_CONFIG] ?? [];
        next[opt] = Array(groups.length).fill('');
      }
      return next;
    });
  };

  const handleLokalisationClick = (diag: string, groupIdx: number, opt: string) => {
    setLokalisationByDiagnose(prev => {
      const arr = [...(prev[diag] ?? [])];
      arr[groupIdx] = arr[groupIdx] === opt ? '' : opt;
      return { ...prev, [diag]: arr };
    });
  };

  const resolvedDiagnosen = resolveDiagnoses(diagnosen, andereText);
  const resolvedLokalisation = resolveLokalisationMap(diagnosen, lokalisationByDiagnose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vorname.trim() || !nachname.trim() || !geburtsdatum) {
      setError('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const success = await onSave({
      name: `${vorname.trim()} ${nachname.trim()}`,
      geburtsdatum, geschlecht,
      bildungsjahre: bildungsjahre ? parseInt(bildungsjahre, 10) : undefined,
      mitarbeiter,
      aufnahmedatum: aufnahmedatum || undefined,
      entlassdatum: entlassdatum || undefined,
      diagnose: resolvedDiagnosen.length > 0 ? resolvedDiagnosen : undefined,
      lokalisation: Object.keys(resolvedLokalisation).length > 0 ? resolvedLokalisation : undefined,
    });
    setIsSubmitting(false);
    if (success) onClose();
    else setError('Fehler beim Speichern. Bitte erneut versuchen.');
  };

  const handleDischarge = async () => {
    if (!onDischarge) return;
    setDangerLoading(true);
    await onDischarge();
    setDangerLoading(false);
    setShowDischargeConfirm(false);
    onClose();
  };

  const handleUndoDischarge = async () => {
    if (!onUndoDischarge) return;
    setDangerLoading(true);
    await onUndoDischarge();
    setDangerLoading(false);
    setShowUndoConfirm(false);
  };

  const handleDeleteStep = async () => {
    const next = deleteCount + 1;
    if (next < 3) {
      setDeleteCount(next);
      shuffleDeleteBtn();
    } else {
      if (!onDelete) return;
      setDangerLoading(true);
      await onDelete();
      setDangerLoading(false);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  const isEntlassen = patient?.status === 'entlassen';
  const dischargeBlocked = !patient?.diagnose?.length;

  return (
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
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                  <Pencil size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">Patient verwalten</h2>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{patient?.name}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Vorname</label>
                  <input type="text" value={vorname} onChange={e => setVorname(e.target.value)} className={inputCls} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Nachname</label>
                  <input type="text" value={nachname} onChange={e => setNachname(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelCls}>Geburtsdatum</label>
                <input type="date" value={geburtsdatum} onChange={e => setGeburtsdatum(e.target.value)} className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label className={labelCls}>Geschlecht</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['m', 'w', 'd'] as const).map(g => (
                    <button key={g} type="button" onClick={() => setGeschlecht(g)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-all border ${geschlecht === g ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {g === 'm' ? 'Männlich' : g === 'w' ? 'Weiblich' : 'Divers'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Diagnose (Mehrfachauswahl) ── */}
              <div className="space-y-1.5">
                <label className={labelCls}>Aufnahmediagnose(n) (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {DIAGNOSE_OPTIONEN.map(opt => (
                    <button key={opt} type="button" onClick={() => handleDiagnoseClick(opt)}
                      className={`${PILL_BASE} ${diagnosen.includes(opt) ? PILL_ACTIVE : PILL_IDLE}`}>
                      {opt}
                    </button>
                  ))}
                </div>
                {diagnosen.includes('Andere') && (
                  <input type="text" value={andereText} onChange={e => setAndereText(e.target.value)}
                    placeholder="Diagnose eingeben…" className={inputCls + ' mt-2'} />
                )}
              </div>

              {/* ── Lokalisation je Diagnose ── */}
              {diagnosen
                .filter(d => (LOKALISATION_CONFIG[d as keyof typeof LOKALISATION_CONFIG] ?? []).length > 0)
                .map(d => {
                  const groups = LOKALISATION_CONFIG[d as keyof typeof LOKALISATION_CONFIG] ?? [];
                  return (
                    <div key={d} className="space-y-3 pl-3 border-l border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{d}</p>
                      {groups.map((group, gi) => (
                        <div key={group.label} className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{group.label}</label>
                          <div className="flex flex-wrap gap-1.5">
                            {group.options.map(opt => (
                              <button key={opt} type="button" onClick={() => handleLokalisationClick(d, gi, opt)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${lokalisationByDiagnose[d]?.[gi] === opt ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

              <div className="space-y-1.5">
                <label className={labelCls}>Bildungsjahre (optional)</label>
                <input type="number" value={bildungsjahre} onChange={e => setBildungsjahre(e.target.value)} placeholder="z. B. 12" min={0} max={30} className={inputCls} />
              </div>

              {allUsers.length > 0 && (
                <div className="space-y-1.5">
                  <label className={labelCls}>Zuständige Mitarbeiter:innen (optional)</label>
                  <div className="flex flex-wrap gap-2">
                    {allUsers.map(u => (
                      <button key={u} type="button"
                        onClick={() => setMitarbeiter(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                        className={`${PILL_BASE} ${mitarbeiter.includes(u) ? PILL_ACTIVE : PILL_IDLE}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Aufnahmedatum (optional)</label>
                  <input type="date" value={aufnahmedatum} onChange={e => setAufnahmedatum(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Entlassdatum (optional)</label>
                  <input type="date" value={entlassdatum} onChange={e => setEntlassdatum(e.target.value)} className={inputCls} />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-500 bg-rose-50 p-3 rounded-xl border border-rose-100">
                  <AlertCircle size={16} className="shrink-0" />
                  <span className="text-xs font-medium">{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-5 py-3 bg-slate-100 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                  Abbrechen
                </button>
                <button type="submit" disabled={isSubmitting}
                  className="flex-1 px-5 py-3 bg-slate-900 rounded-xl text-sm font-medium text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Speichern'}
                </button>
              </div>

              {/* ── Fallverwaltung ── */}
              {(onDischarge || onUndoDischarge || (onDelete && isAdmin)) && (
                <div className="border-t border-slate-100 pt-5 space-y-3">
                  <p className={labelCls}>Fallverwaltung</p>

                  {/* Entlassen */}
                  {!isEntlassen && onDischarge && (
                    <>
                      {!showDischargeConfirm ? (
                        <div className="space-y-2">
                          {dischargeBlocked && (
                            <p className="flex items-center gap-2 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                              <AlertTriangle size={13} className="shrink-0" />
                              Bitte zuerst eine Diagnose eintragen und speichern.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => !dischargeBlocked && setShowDischargeConfirm(true)}
                            disabled={dischargeBlocked}
                            title={dischargeBlocked ? 'Bitte zuerst Diagnose eintragen' : undefined}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-colors',
                              dischargeBlocked
                                ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
                            )}
                          >
                            <ClipboardCheck size={15} />
                            Fall abschließen / Patient entlassen
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                          <p className="text-sm font-medium text-amber-800">
                            {patient?.name} wird als entlassen markiert. Die Daten bleiben erhalten.
                          </p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setShowDischargeConfirm(false)}
                              className="flex-1 py-2 rounded-lg bg-white border border-amber-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                              Abbrechen
                            </button>
                            <button type="button" onClick={handleDischarge} disabled={dangerLoading}
                              className="flex-1 py-2 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2">
                              {dangerLoading ? <Loader2 size={13} className="animate-spin" /> : 'Abschließen'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Entlassung rückgängig */}
                  {isEntlassen && onUndoDischarge && (
                    <>
                      {!showUndoConfirm ? (
                        <button type="button" onClick={() => setShowUndoConfirm(true)}
                          className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
                          <Undo2 size={15} />
                          Entlassung rückgängig machen
                        </button>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                          <p className="text-sm font-medium text-amber-800">
                            {patient?.name} wird wieder als aktiv markiert.
                          </p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setShowUndoConfirm(false)}
                              className="flex-1 py-2 rounded-lg bg-white border border-amber-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                              Abbrechen
                            </button>
                            <button type="button" onClick={handleUndoDischarge} disabled={dangerLoading}
                              className="flex-1 py-2 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2">
                              {dangerLoading ? <Loader2 size={13} className="animate-spin" /> : 'Reaktivieren'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Löschen (nur Admin) */}
                  {onDelete && isAdmin && (
                    <>
                      {!showDeleteConfirm ? (
                        <button type="button" onClick={() => { setDeleteCount(0); setDeleteXOffset(0); setShowDeleteConfirm(true); }}
                          className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 bg-white text-rose-500 text-sm font-medium hover:bg-rose-50 hover:border-rose-200 transition-colors">
                          <Trash2 size={15} />
                          Patient dauerhaft löschen
                        </button>
                      ) : (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-rose-700">
                                {patient?.name} und alle Testergebnisse werden unwiderruflich gelöscht.
                              </p>
                              <p className="text-xs text-rose-400 mt-1">
                                Klicken Sie {3 - deleteCount}× auf „Löschen" — der Button springt jedes Mal.
                              </p>
                            </div>
                          </div>

                          {/* Moving delete button area */}
                          <div className="flex items-center justify-between pt-1">
                            <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeleteCount(0); setDeleteXOffset(0); }}
                              className="py-2 px-4 rounded-lg bg-white border border-rose-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shrink-0">
                              Abbrechen
                            </button>
                            <motion.button
                              type="button"
                              onClick={handleDeleteStep}
                              disabled={dangerLoading}
                              animate={{ x: deleteXOffset }}
                              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                              className="py-2 px-4 rounded-lg bg-rose-600 text-xs font-medium text-white hover:bg-rose-700 transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                            >
                              {dangerLoading
                                ? <Loader2 size={13} className="animate-spin" />
                                : deleteCount === 0
                                  ? 'Löschen (1/3)'
                                  : `Löschen (${deleteCount + 1}/3)`}
                            </motion.button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
