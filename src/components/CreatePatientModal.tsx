import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, X, AlertCircle, Loader2 } from 'lucide-react';
import { Patient } from '../types';
import { dbGetUsers } from '../lib/db-api';
import {
  DIAGNOSE_OPTIONEN, LOKALISATION_CONFIG,
  toggleDiagnoseSelection, resolveDiagnoses, resolveLokalisationMap,
} from '../lib/diagnose-config';

// Re-export so other files that used to import from here still work
export { DIAGNOSE_OPTIONEN };

interface CreatePatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (patient: Patient) => Promise<boolean>;
}

const inputCls =
  'w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all outline-none';
const labelCls = 'text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1';

const PILL_BASE = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border';
const PILL_ACTIVE = 'bg-slate-900 text-white border-slate-900';
const PILL_IDLE = 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800';

export const CreatePatientModal: React.FC<CreatePatientModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [geburtsdatum, setGeburtsdatum] = useState('');
  const [geschlecht, setGeschlecht] = useState<'m' | 'w' | 'd' | ''>('');
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

  useEffect(() => {
    dbGetUsers().then(users => setAllUsers(users.map(u => u.username)));
  }, []);

  const reset = () => {
    setVorname(''); setNachname(''); setGeburtsdatum(''); setGeschlecht('');
    setBildungsjahre(''); setMitarbeiter([]); setAufnahmedatum(''); setEntlassdatum('');
    setDiagnosen([]); setAndereText(''); setLokalisationByDiagnose({}); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

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
    if (!vorname.trim() || !nachname.trim() || !geburtsdatum || !geschlecht) {
      setError('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const success = await onCreate({
      id: crypto.randomUUID(),
      name: `${vorname.trim()} ${nachname.trim()}`,
      geburtsdatum, geschlecht,
      bildungsjahre: bildungsjahre ? parseInt(bildungsjahre, 10) : undefined,
      mitarbeiter,
      aufnahmedatum: aufnahmedatum || undefined,
      entlassdatum: entlassdatum || undefined,
      diagnose: resolvedDiagnosen.length > 0 ? resolvedDiagnosen : undefined,
      lokalisation: Object.keys(resolvedLokalisation).length > 0 ? resolvedLokalisation : undefined,
      status: 'aktiv',
      age: 0,
    });
    setIsSubmitting(false);
    if (success) { reset(); onClose(); }
    else setError('Fehler beim Erstellen. Bitte erneut versuchen.');
  };

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
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">Neuer Patient</h2>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Stammdaten erfassen</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Vorname</label>
                  <input type="text" value={vorname} onChange={e => setVorname(e.target.value)} placeholder="Vorname" className={inputCls} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Nachname</label>
                  <input type="text" value={nachname} onChange={e => setNachname(e.target.value)} placeholder="Nachname" className={inputCls} />
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
                    placeholder="Diagnose eingeben…" className={inputCls + ' mt-2'} autoFocus />
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
                <button type="button" onClick={handleClose}
                  className="flex-1 px-5 py-3 bg-slate-100 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
                  Abbrechen
                </button>
                <button type="submit" disabled={isSubmitting}
                  className="flex-1 px-5 py-3 bg-slate-900 rounded-xl text-sm font-medium text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Erstellen'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
