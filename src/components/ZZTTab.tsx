import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Timer } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { lookupZZT } from '../lib/normUtils';
import {
  PrBadge, TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface ZZTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const emptyTimes = (): string[] => Array(10).fill('');

export const ZZTTab: React.FC<ZZTTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [times, setTimes] = useState<string[]>(emptyTimes());
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const zztResults = previousResults
    .filter(r => r.testId === 'zzt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const parsedTimes = times.map(t => (t !== '' && !isNaN(Number(t)) && Number(t) > 0) ? Number(t) : null);
  const normResult = parsedTimes.some(t => t !== null) ? lookupZZT(parsedTimes) : null;

  const inputCls = (err: boolean) => cn(
    'w-full px-2 py-2 text-base font-mono border-2 rounded-xl outline-none transition-all text-center',
    err
      ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'
      : 'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  const reset = () => {
    setTimes(emptyTimes());
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    const t = emptyTimes();
    ROUNDS.forEach((r, i) => {
      const v = res.rawValues[`d${r}`];
      if (v !== undefined && v !== '') t[i] = String(v);
    });
    setTimes(t);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    const filled = parsedTimes.filter(t => t !== null);
    if (!aborted && filled.length === 0) return;

    const rawValues: Record<string, number | string> = {};
    ROUNDS.forEach((r, i) => {
      if (parsedTimes[i] !== null) rawValues[`d${r}`] = parsedTimes[i]!;
    });

    const wp = normResult?.wp ?? 0;
    const pr = normResult?.pr ?? 0;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'zzt',
      date,
      examiner,
      note,
      rawValues,
      calculatedValues: { wp },
      percentileRanks: { zzt: pr },
      normInfo: 'TME Zahlen-Zeige-Test (ZZT) – Gesamtnorm',
      domainMapping: { zzt: '1. Aufmerksamkeit (Informationsverarbeitung)' },
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Timer size={22} />}
        title="Zahlen-Zeige-Test (ZZT)"
        subtitle={`Informationsverarbeitungsgeschwindigkeit · Alter zum Testdatum: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Bearbeitungszeit in Sekunden (Durchgang 1–10)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {ROUNDS.map((r, i) => (
                  <div key={r} className="space-y-0.5">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">
                      D{r}
                    </label>
                    <input
                      type="number"
                      value={times[i]}
                      onChange={e => {
                        const next = [...times];
                        next[i] = e.target.value;
                        setTimes(next);
                      }}
                      placeholder="–"
                      min={1}
                      max={600}
                      className={inputCls(false)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {normResult && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
                <span className="text-xs text-slate-500 font-bold">Ø WP:</span>
                <span className="font-black text-indigo-700 dark:text-indigo-300">{normResult.wp}</span>
                <span className="text-xs text-slate-400 ml-2">→ PR:</span>
                <PrBadge value={normResult.pr} />
              </div>
            )}

            <NoteField value={note} onChange={setNote} />
            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-black text-slate-500 uppercase tracking-wider">Norm: </span>
            TME Zahlen-Zeige-Test (ZZT) – Gesamtnorm
            <span className="block mt-1 italic">Niedrigere Zeiten = bessere Leistung. WP aus Normtabelle pro Durchgang, mittlerer WP → PR.</span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="mb-4">
            <HistoryHeader count={zztResults.length} />
          </div>

          {zztResults.length === 0 ? <EmptyHistory /> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3 text-center">Ø WP</th>
                    <th className="px-3 py-3 text-center">PR</th>
                    {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {zztResults.map(res => (
                    <tr
                      key={res.id}
                      className={cn(
                        'hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors',
                        editingId === res.id && 'bg-indigo-50/60 dark:bg-indigo-900/30',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          {formatDate(res.date)}
                          {res.aborted && <AbortBadge comment={res.abortComment} />}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">
                        {res.calculatedValues.wp}
                      </td>
                      <td className="px-3 py-3 text-center"><PrBadge value={res.percentileRanks.zzt} /></td>
                      {patient.status !== 'entlassen' && (
                        <td className="px-2 py-3">
                          <HistoryRowActions
                            id={res.id}
                            editingId={editingId}
                            confirmDeleteId={confirmDeleteId}
                            patientDischarged={false}
                            onEdit={() => { setConfirmDeleteId(null); editingId === res.id ? cancelEdit() : startEdit(res); }}
                            onDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                            onConfirmDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                            onSetConfirm={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
