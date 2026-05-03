import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { FileText } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import {
  TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface BuerotestTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const BuerotestTab: React.FC<BuerotestTabProps> = ({
  patient, previousResults, onSave, onUpdate, onDelete,
}) => {
  const { currentUser } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [aufgabe1, setAufgabe1] = useState('');
  const [aufgabe6variant, setAufgabe6variant] = useState<'A' | 'B'>('A');
  const [aufgabe6, setAufgabe6] = useState('');
  const [note, setNote] = useState('');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const bueroResults = previousResults
    .filter(r => r.testId === 'buerotest')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const resetForm = () => {
    setAufgabe1(''); setAufgabe6variant('A'); setAufgabe6(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setEditingId(null);
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setAufgabe1(String(res.rawValues.aufgabe1 ?? ''));
    setAufgabe6variant((res.rawValues.aufgabe6variant as 'A' | 'B') ?? 'A');
    setAufgabe6(String(res.rawValues.aufgabe6 ?? ''));
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const handleSave = () => {
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'buerotest',
      date,
      rawValues: { aufgabe1, aufgabe6variant, aufgabe6 },
      calculatedValues: {},
      percentileRanks: {},
      normInfo: 'Bürotest – Qualitative Auswertung',
      examiner,
      note,
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };
    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    resetForm();
  };

  useShortcutSave(handleSave);

  const textareaCls = 'w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<FileText size={22} />}
        title="Bürotest"
        subtitle="Qualitative Auswertung · 5. Exekutive Funktionen"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-4">

          <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

          {/* Aufgabe 1 */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Aufgabe 1</label>
            <textarea
              value={aufgabe1}
              onChange={e => setAufgabe1(e.target.value)}
              placeholder="Ergebnis / Beobachtungen zu Aufgabe 1..."
              className={cn(textareaCls, 'h-24')}
            />
          </div>

          {/* Aufgabe 6 with A/B toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Aufgabe 6</label>
              <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-xl p-0.5 gap-0.5">
                {(['A', 'B'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setAufgabe6variant(v)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-black transition-all',
                      aufgabe6variant === v
                        ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={aufgabe6}
              onChange={e => setAufgabe6(e.target.value)}
              placeholder={`Ergebnis / Beobachtungen zu Aufgabe 6${aufgabe6variant}...`}
              className={cn(textareaCls, 'h-24')}
            />
          </div>

          <NoteField value={note} onChange={setNote} />
          <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
          <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={resetForm} />
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
          <div className="mb-4">
            <HistoryHeader count={bueroResults.length} />
          </div>

          {bueroResults.length === 0 ? <EmptyHistory /> : (
            <div className="space-y-3">
              {bueroResults.map(res => (
                <div
                  key={res.id}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    editingId === res.id
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/20'
                      : 'border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{formatDate(res.date)}</span>
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                      {res.examiner && <span className="text-[10px] text-slate-400 dark:text-slate-500">· {res.examiner}</span>}
                    </div>
                    <HistoryRowActions
                      id={res.id}
                      editingId={editingId}
                      confirmDeleteId={confirmDeleteId}
                      patientDischarged={patient.status === 'entlassen'}
                      onEdit={() => editingId === res.id ? resetForm() : startEdit(res)}
                      onDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                      onConfirmDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                      onSetConfirm={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                    />
                  </div>
                  {res.rawValues.aufgabe1 && (
                    <div className="mb-2">
                      <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Aufgabe 1</div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {String(res.rawValues.aufgabe1)}
                      </p>
                    </div>
                  )}
                  {res.rawValues.aufgabe6 && (
                    <div className="mb-2">
                      <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
                        Aufgabe 6{res.rawValues.aufgabe6variant ? ` (${res.rawValues.aufgabe6variant})` : ''}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {String(res.rawValues.aufgabe6)}
                      </p>
                    </div>
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
