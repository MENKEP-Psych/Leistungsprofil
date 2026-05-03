import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Brain } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { tWertToPR } from '../lib/normUtils';
import {
  PrBadge, TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

export const LPS_SUBTESTS = [
  { id: 's1_2', label: 'Subtest 1+2' },
  { id: 's3',   label: 'Subtest 3'   },
  { id: 's4',   label: 'Subtest 4'   },
  { id: 's5',   label: 'Subtest 5'   },
  { id: 's6',   label: 'Subtest 6'   },
  { id: 's7',   label: 'Subtest 7'   },
  { id: 's8',   label: 'Subtest 8'   },
  { id: 's9',   label: 'Subtest 9'   },
  { id: 's10',  label: 'Subtest 10'  },
  { id: 's11',  label: 'Subtest 11'  },
  { id: 's12',  label: 'Subtest 12'  },
  { id: 's13',  label: 'Subtest 13'  },
  { id: 's14',  label: 'Subtest 14'  },
] as const;

export const LPS_KORREKTUR_OPTIONS = [
  { value: 'unkorrigiert',              label: 'Unkorrigiert' },
  { value: 'alterskorrigiert',          label: 'Alterskorrigiert' },
  { value: 'bildungskorrigiert',        label: 'Bildungskorrigiert' },
  { value: 'alters_bildungskorrigiert', label: 'Alters- & Bildungskorrigiert' },
] as const;

export type LPSKorrekturValue = typeof LPS_KORREKTUR_OPTIONS[number]['value'];

interface LPSTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

type SubtestState = { rw: string; tw: string };

const emptySubtests = (): Record<string, SubtestState> =>
  Object.fromEntries(LPS_SUBTESTS.map(s => [s.id, { rw: '', tw: '' }]));

export const LPSTab: React.FC<LPSTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [subtests, setSubtests] = useState<Record<string, SubtestState>>(emptySubtests());
  const [korrektur, setKorrektur] = useState<LPSKorrekturValue>('unkorrigiert');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const results = previousResults
    .filter(r => r.testId === 'lps')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const setSubtest = (id: string, field: 'rw' | 'tw', value: string) => {
    setSubtests(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getPR = (id: string): number | null => {
    const tw = subtests[id].tw;
    if (!tw || isNaN(Number(tw))) return null;
    return tWertToPR(Number(tw));
  };

  const reset = () => {
    setSubtests(emptySubtests());
    setKorrektur('unkorrigiert');
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false);
    setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    const st = emptySubtests();
    LPS_SUBTESTS.forEach(s => {
      st[s.id] = {
        rw: String(res.rawValues[`${s.id}_rw`] ?? ''),
        tw: String(res.rawValues[`${s.id}_tw`] ?? ''),
      };
    });
    setSubtests(st);
    setKorrektur((res.rawValues.korrektur as LPSKorrekturValue) ?? 'unkorrigiert');
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const hasAnyInput = LPS_SUBTESTS.some(s => subtests[s.id].rw !== '' || subtests[s.id].tw !== '');

  const handleSave = () => {
    if (!aborted && !hasAnyInput) return;

    const rawValues: Record<string, number | string> = { korrektur };
    const percentileRanks: Record<string, number | string> = {};

    LPS_SUBTESTS.forEach(s => {
      const rw = subtests[s.id].rw;
      const tw = subtests[s.id].tw;
      if (rw !== '') rawValues[`${s.id}_rw`] = Number(rw);
      if (tw !== '') {
        rawValues[`${s.id}_tw`] = Number(tw);
        const pr = tWertToPR(Number(tw));
        if (pr !== null) percentileRanks[s.id] = pr;
      }
    });

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'lps',
      date,
      examiner,
      note,
      rawValues,
      calculatedValues: {},
      percentileRanks,
      normInfo: 'LPS – Leistungsprüfsystem (T-Wert → Lienert-Normtabelle)',
      domainMapping: Object.fromEntries(LPS_SUBTESTS.map(s => [s.id, '4. Intellektuelle Leistungen'])),
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);

  const inputCls = cn(
    'w-full px-2 py-1.5 text-sm font-mono border rounded-lg outline-none text-center transition-all',
    'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-400',
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Brain size={22} />}
        title="LPS – Leistungsprüfsystem"
        subtitle="Intellektuelle Leistungen · T-Wert → Prozentrang (Lienert-Normtabelle)"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            {/* Korrektur selection */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Normkorrektur
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LPS_KORREKTUR_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setKorrektur(opt.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
                      korrektur === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-indigo-300 hover:text-indigo-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />

            {/* Subtest table */}
            <div className="space-y-1.5 pt-1">
              <div className="grid grid-cols-[1fr_74px_74px_66px] gap-1 px-2 pb-0.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtest</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Rohwert</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">T-Wert</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">PR</span>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden divide-y divide-slate-50 dark:divide-slate-700">
                {LPS_SUBTESTS.map(s => {
                  const pr = getPR(s.id);
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[1fr_74px_74px_66px] gap-1 items-center px-2 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 pl-1">{s.label}</span>
                      <input
                        type="number"
                        value={subtests[s.id].rw}
                        onChange={e => setSubtest(s.id, 'rw', e.target.value)}
                        className={inputCls}
                        placeholder="–"
                        min={0}
                      />
                      <input
                        type="number"
                        value={subtests[s.id].tw}
                        onChange={e => setSubtest(s.id, 'tw', e.target.value)}
                        className={inputCls}
                        placeholder="–"
                        min={20}
                        max={80}
                      />
                      <div className="flex justify-center">
                        {pr !== null
                          ? <PrBadge value={pr} />
                          : <span className="text-slate-300 dark:text-slate-600 text-xs">–</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <NoteField value={note} onChange={setNote} />
          </div>

          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-black text-slate-500 uppercase tracking-wider">Norm: </span>
            LPS – Leistungsprüfsystem (Horn, 1983 / 1972).
            <span className="block mt-1 italic">
              T-Wert (20–80) wird über die Lienert-Normtabelle in den Prozentrang umgerechnet.
            </span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="mb-4"><HistoryHeader count={results.length} /></div>
          {results.length === 0 ? <EmptyHistory /> : (
            <div className="space-y-3">
              {results.map(res => {
                const resKorrekturLabel = LPS_KORREKTUR_OPTIONS.find(
                  o => o.value === res.rawValues.korrektur
                )?.label ?? 'Unkorrigiert';

                return (
                  <div
                    key={res.id}
                    className={cn(
                      'rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden',
                      editingId === res.id && 'ring-2 ring-indigo-400',
                    )}
                  >
                    {/* History entry header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-700">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatDate(res.date)}</span>
                        {res.aborted && <AbortBadge comment={res.abortComment} />}
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 uppercase tracking-wider">
                          {resKorrekturLabel}
                        </span>
                      </div>
                      {patient.status !== 'entlassen' && (
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
                      )}
                    </div>
                    {/* Subtest results table */}
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 dark:bg-slate-700/50 text-slate-400 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-1.5 font-black text-[9px]">Subtest</th>
                          <th className="px-3 py-1.5 font-black text-[9px] text-center">Rohwert</th>
                          <th className="px-3 py-1.5 font-black text-[9px] text-center">T-Wert</th>
                          <th className="px-3 py-1.5 font-black text-[9px] text-center">PR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {LPS_SUBTESTS.map(s => {
                          const rw = res.rawValues[`${s.id}_rw`];
                          const tw = res.rawValues[`${s.id}_tw`];
                          const pr = res.percentileRanks[s.id];
                          if (rw === undefined && tw === undefined) return null;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-1.5 font-medium text-slate-600 dark:text-slate-300">{s.label}</td>
                              <td className="px-3 py-1.5 text-center font-mono text-slate-500 dark:text-slate-400">
                                {rw !== undefined ? String(rw) : '–'}
                              </td>
                              <td className="px-3 py-1.5 text-center font-mono text-slate-500 dark:text-slate-400">
                                {tw !== undefined ? String(tw) : '–'}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                {pr !== undefined
                                  ? <PrBadge value={pr} />
                                  : <span className="text-slate-300">–</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
