import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, X, AlertCircle, Loader2 } from 'lucide-react';
import { Patient } from '../types';
import { dbGetUsers } from '../lib/db-api';
import { DIAGNOSE_OPTIONEN, LOKALISATION_CONFIG, serializeLokalisation } from '../lib/diagnose-config';

// Re-export so other files that used to import from here still work
export { DIAGNOSE_OPTIONEN };

interface CreatePatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (patient: Patient) => Promise<boolean>;
}

const inputCls =
  'w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest px-1';

export const CreatePatientModal: React.FC<CreatePatientModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [geburtsdatum, setGeburtsdatum] = useState('');
  const [geschlecht, setGeschlecht] = useState<'m' | 'w' | 'd' | ''>('');
  const [bildungsjahre, setBildungsjahre] = useState('');
  const [neuropsychologin, setNeuropsychologin] = useState('');
  const [aufnahmedatum, setAufnahmedatum] = useState('');
  const [entlassdatum, setEntlassdatum] = useState('');
  const [diagnose, setDiagnose] = useState('');
  const [andereText, setAndereText] = useState('');
  const [lokalisationSelections, setLokalisationSelections] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<string[]>([]);

  useEffect(() => {
    dbGetUsers().then(users => setAllUsers(users.map(u => u.username)));
  }, []);

  const currentGroups = LOKALISATION_CONFIG[diagnose as keyof typeof LOKALISATION_CONFIG] ?? [];

  const reset = () => {
    setVorname(''); setNachname(''); setGeburtsdatum(''); setGeschlecht('');
    setBildungsjahre(''); setNeuropsychologin(''); setAufnahmedatum(''); setEntlassdatum('');
    setDiagnose(''); setAndereText(''); setLokalisationSelections([]); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleDiagnoseClick = (opt: string) => {
    const next = diagnose === opt ? '' : opt;
    setDiagnose(next);
    if (opt !== 'Andere') setAndereText('');
    // Reset localisation when diagnosis changes
    const groups = LOKALISATION_CONFIG[next as keyof typeof LOKALISATION_CONFIG] ?? [];
    setLokalisationSelections(Array(groups.length).fill(''));
  };

  const handleLokalisationClick = (groupIdx: number, opt: string) => {
    setLokalisationSelections(prev => {
      const next = [...prev];
      next[groupIdx] = next[groupIdx] === opt ? '' : opt;
      return next;
    });
  };

  const resolvedDiagnose = diagnose === 'Andere'
    ? (andereText.trim() ? `Andere: ${andereText.trim()}` : '')
    : diagnose;

  const resolvedLokalisation = serializeLokalisation(lokalisationSelections);

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
      neuropsychologin: neuropsychologin.trim() || undefined,
      aufnahmedatum: aufnahmedatum || undefined,
      entlassdatum: entlassdatum || undefined,
      diagnose: resolvedDiagnose || undefined,
      lokalisation: resolvedLokalisation || undefined,
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl shadow-slate-900/20 overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Neuer Patient</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stammdaten erfassen</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className={labelCls}>Vorname</label>
                  <input type="text" value={vorname} onChange={e => setVorname(e.target.value)} placeholder="Vorname" className={inputCls} autoFocus />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Nachname</label>
                  <input type="text" value={nachname} onChange={e => setNachname(e.target.value)} placeholder="Nachname" className={inputCls} />
                </div>
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Geburtsdatum</label>
                <input type="date" value={geburtsdatum} onChange={e => setGeburtsdatum(e.target.value)} className={inputCls} />
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Geschlecht</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['m', 'w', 'd'] as const).map(g => (
                    <button key={g} type="button" onClick={() => setGeschlecht(g)}
                      className={`py-3 rounded-2xl text-sm font-black transition-all border-2 ${geschlecht === g ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-indigo-300'}`}>
                      {g === 'm' ? 'Männlich' : g === 'w' ? 'Weiblich' : 'Divers'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Diagnose ── */}
              <div className="space-y-2">
                <label className={labelCls}>Aufnahmediagnose (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {DIAGNOSE_OPTIONEN.map(opt => (
                    <button key={opt} type="button" onClick={() => handleDiagnoseClick(opt)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${diagnose === opt ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-600'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
                {diagnose === 'Andere' && (
                  <input type="text" value={andereText} onChange={e => setAndereText(e.target.value)}
                    placeholder="Diagnose eingeben…" className={inputCls + ' mt-2'} autoFocus />
                )}
              </div>

              {/* ── Lokalisation (contextual) ── */}
              {currentGroups.length > 0 && (
                <div className="space-y-3 pl-3 border-l-2 border-violet-100">
                  {currentGroups.map((group, gi) => (
                    <div key={group.label} className="space-y-1.5">
                      <label className="text-[10px] font-black text-violet-400 uppercase tracking-widest">{group.label}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {group.options.map(opt => (
                          <button key={opt} type="button" onClick={() => handleLokalisationClick(gi, opt)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${lokalisationSelections[gi] === opt ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 border-violet-400' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-600'}`}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <label className={labelCls}>Bildungsjahre (optional)</label>
                <input type="number" value={bildungsjahre} onChange={e => setBildungsjahre(e.target.value)} placeholder="z. B. 12" min={0} max={30} className={inputCls} />
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Zuständige Mitarbeiter:in (optional)</label>
                <select value={neuropsychologin} onChange={e => setNeuropsychologin(e.target.value)} className={inputCls}>
                  <option value="">– Keine Zuweisung –</option>
                  {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className={labelCls}>Aufnahmedatum (optional)</label>
                  <input type="date" value={aufnahmedatum} onChange={e => setAufnahmedatum(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Entlassdatum (optional)</label>
                  <input type="date" value={entlassdatum} onChange={e => setEntlassdatum(e.target.value)} className={inputCls} />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-2xl border border-red-100">
                  <AlertCircle size={18} />
                  <span className="text-xs font-bold">{error}</span>
                </div>
              )}

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={handleClose} className="flex-1 px-6 py-4 bg-slate-100 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-200 transition-all uppercase tracking-widest">
                  Abbrechen
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-6 py-4 bg-indigo-600 rounded-2xl text-sm font-black text-white hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 uppercase tracking-widest flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Erstellen'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
