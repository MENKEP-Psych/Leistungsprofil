import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Save, History, CheckCircle2, Pencil, X, CalendarDays, Trash2, Check } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PageHeader, AbortButton, AbortBadge } from './TestForm';

interface TagesplanTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const TagesplanTab: React.FC<TagesplanTabProps> = ({
  patient,
  previousResults,
  onSave,
  onUpdate,
  onDelete,
}) => {
  const { currentUser } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [planText, setPlanText] = useState('');
  const [note, setNote] = useState('');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const tagesplanResults = previousResults
    .filter(r => r.testId === 'tagesplan')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const resetForm = () => {
    setPlanText('');
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setEditingId(null);
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setPlanText(String(res.rawValues.planText ?? ''));
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const handleSave = () => {
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'tagesplan',
      date,
      rawValues: { planText },
      calculatedValues: {},
      percentileRanks: {},
      normInfo: 'Tagesplan – Qualitative Auswertung',
      examiner,
      note,
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };
    if (editingId) {
      onUpdate(result);
      setEditingId(null);
    } else {
      onSave(result);
    }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    resetForm();
  };

  useShortcutSave(handleSave);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CalendarDays size={22} />}
        title="Tagesplan"
        subtitle="Qualitative Auswertung · 5. Exekutive Funktionen"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* INPUT */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Save size={16} className="text-indigo-600" />
              {editingId ? 'Messung bearbeiten' : 'Neue Messung'}
            </h3>
            {editingId && (
              <button
                onClick={resetForm}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 transition-colors"
              >
                <X size={13} /> Abbrechen
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Datum</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Untersucher</label>
                <input
                  type="text"
                  value={examiner}
                  onChange={e => setExaminer(e.target.value)}
                  placeholder="Kürzel"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1.5">Tagesplan</label>
              <textarea
                value={planText}
                onChange={e => setPlanText(e.target.value)}
                placeholder="Beschreibung des Tagesplans, Beobachtungen, Strategien..."
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none h-40 resize-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Notiz (optional)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Besonderheiten, Beobachtungen..."
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none h-16 resize-none"
              />
            </div>

            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />

            <button
              onClick={handleSave}
              className={cn(
                'w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2',
                lastSaved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
              )}
            >
              {lastSaved ? (
                <><CheckCircle2 size={18} /> Gespeichert!</>
              ) : editingId ? (
                <><Save size={18} /> Änderung speichern</>
              ) : (
                <><Save size={18} /> Messung speichern</>
              )}
            </button>
          </div>
        </div>

        {/* HISTORY */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <History size={16} className="text-indigo-600" />
            Verlauf
          </h3>

          {tagesplanResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
              <History size={48} strokeWidth={1} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">Keine vorherigen Messungen.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tagesplanResults.map(res => (
                <div
                  key={res.id}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    editingId === res.id
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{formatDate(res.date)}</span>
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                      {res.examiner && <span className="text-[10px] text-slate-400 dark:text-slate-500">· {res.examiner}</span>}
                    </div>
                    {patient.status !== 'entlassen' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => editingId === res.id ? resetForm() : startEdit(res)}
                          className={cn(
                            'p-1.5 rounded-lg transition-colors',
                            editingId === res.id
                              ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600'
                              : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-500'
                          )}
                          title="Bearbeiten"
                        >
                          <Pencil size={12} />
                        </button>
                        {confirmDeleteId === res.id ? (
                          <button
                            onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                            className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 hover:bg-red-200 transition-colors"
                          >
                            <Check size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {res.rawValues.planText && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{String(res.rawValues.planText)}</p>
                  )}
                  {res.note && <p className="text-[10px] italic text-slate-400 dark:text-slate-500 mt-1">{res.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
