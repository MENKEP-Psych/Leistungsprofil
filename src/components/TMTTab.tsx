import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Activity, AlertCircle } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import tmtNorms from '../data/tmt-norms.json';
import {
  prColorCls, PrBadge, TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface TMTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const TMTTab: React.FC<TMTTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rawA, setRawA] = useState('');
  const [rawB, setRawB] = useState('');
  const [errA, setErrA] = useState('');
  const [errB, setErrB] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const tmtResults = previousResults
    .filter(r => r.testId === 'tmt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const calculatePR = (age: number, value: number, part: 'A' | 'B'): number | string => {
    const group = tmtNorms.altersgruppen.find(g => age >= g.von && age <= g.bis);
    if (!group) return 'N/A';
    const normen = group.normen;

    // Check against best (lowest time) threshold first
    let highestPR: number | null = null;
    let highestThreshold: number | null = null;
    for (const norm of normen) {
      const v = part === 'A' ? norm.A : norm.B;
      if (v !== null) { highestPR = norm.pr as number; highestThreshold = v; break; }
    }
    if (highestThreshold !== null && value <= highestThreshold) {
      return `>${highestPR}`;
    }

    // Find matching norm; track previous (better) PR to build a range string
    let prevPR: number | null = null;
    for (const norm of normen) {
      const normVal = part === 'A' ? norm.A : norm.B;
      if (normVal === null) continue;
      if (value <= normVal) {
        return prevPR !== null ? `${norm.pr}–${prevPR}` : norm.pr;
      }
      prevPR = norm.pr as number;
    }

    // Below all norms
    let lowestValidPR = 10;
    for (let i = normen.length - 1; i >= 0; i--) {
      const v = part === 'A' ? normen[i].A : normen[i].B;
      if (v !== null) { lowestValidPR = normen[i].pr as number; break; }
    }
    return `< ${lowestValidPR}`;
  };

  const previewA = rawA && !isNaN(Number(rawA)) && Number(rawA) > 0
    ? calculatePR(ageAtTest, Number(rawA), 'A') : null;
  const previewB = rawB && !isNaN(Number(rawB)) && Number(rawB) > 0
    ? calculatePR(ageAtTest, Number(rawB), 'B') : null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!rawA || isNaN(Number(rawA)) || Number(rawA) <= 0)
      e.rawA = 'Gültige Zeit für Teil A eingeben.';
    if (!rawB || isNaN(Number(rawB)) || Number(rawB) <= 0)
      e.rawB = 'Gültige Zeit für Teil B eingeben.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawA(String(res.rawValues.A));
    setRawB(String(res.rawValues.B));
    setErrA(res.rawValues.errA != null ? String(res.rawValues.errA) : '');
    setErrB(res.rawValues.errB != null ? String(res.rawValues.errB) : '');
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setErrors({});
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRawA(''); setRawB(''); setErrA(''); setErrB(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setErrors({});
    setAborted(false); setAbortComment('');
  };

  const handleSave = () => {
    if (!aborted && !validate()) return;

    const hasA = rawA !== '' && !isNaN(Number(rawA)) && Number(rawA) > 0;
    const hasB = rawB !== '' && !isNaN(Number(rawB)) && Number(rawB) > 0;

    const rawValues: Record<string, number | string> = {};
    const calcValues: Record<string, number | string> = {};
    const prs: Record<string, number | string> = {};

    if (hasA) {
      const valA = Number(rawA);
      rawValues.A = valA;
      calcValues.A = valA;
      prs.A = calculatePR(ageAtTest, valA, 'A');
    }
    if (hasB) {
      const valB = Number(rawB);
      rawValues.B = valB;
      calcValues.B = valB;
      prs.B = calculatePR(ageAtTest, valB, 'B');
    }
    if (hasA && hasB) {
      calcValues.BminusA = Number(rawB) - Number(rawA);
    }
    if (errA.trim() && !isNaN(Number(errA))) rawValues.errA = Number(errA);
    if (errB.trim() && !isNaN(Number(errB))) rawValues.errB = Number(errB);

    const group = tmtNorms.altersgruppen.find(g => ageAtTest >= g.von && ageAtTest <= g.bis);

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'tmt',
      date,
      rawValues,
      calculatedValues: calcValues,
      percentileRanks: prs,
      normInfo: `Norm: ${group?.label ?? 'Unbekannt'}, ${tmtNorms.meta.quelle}`,
      examiner,
      note,
      domainMapping: {
        A: '1. Aufmerksamkeit (Geschwindigkeit)',
        B: '1. Aufmerksamkeit (Geteilt)',
      },
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    setRawA(''); setRawB(''); setErrA(''); setErrB(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  useShortcutSave(handleSave);

  const inputCls = (hasError: boolean) => cn(
    'w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all text-center',
    hasError
      ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'
      : 'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  const errInputCls = 'w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none text-center dark:text-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Activity size={22} />}
        title="TMT A & B"
        subtitle={`Trail Making Test · Alter zum Testdatum: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-4">

            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            {/* A + B — large mono inputs side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Teil A (Sek.)
                </label>
                <input
                  type="number"
                  value={rawA}
                  onChange={e => setRawA(e.target.value)}
                  className={inputCls(!!errors.rawA)}
                  placeholder="–"
                  min={1}
                  onKeyDown={e => e.key === 'Enter' && document.getElementById('tmt-b')?.focus()}
                />
                {errors.rawA && (
                  <p className="text-[10px] text-red-600 flex items-center gap-1">
                    <AlertCircle size={10} /> {errors.rawA}
                  </p>
                )}
                {previewA !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">→ PR</span>
                    <PrBadge value={previewA} />
                  </div>
                )}
                {/* Fehler A */}
                <div className="pt-1">
                  <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">
                    Fehler A (optional)
                  </label>
                  <input
                    type="number"
                    value={errA}
                    onChange={e => setErrA(e.target.value)}
                    className={errInputCls}
                    placeholder="–"
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Teil B (Sek.)
                </label>
                <input
                  id="tmt-b"
                  type="number"
                  value={rawB}
                  onChange={e => setRawB(e.target.value)}
                  className={inputCls(!!errors.rawB)}
                  placeholder="–"
                  min={1}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                {errors.rawB && (
                  <p className="text-[10px] text-red-600 flex items-center gap-1">
                    <AlertCircle size={10} /> {errors.rawB}
                  </p>
                )}
                {previewB !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">→ PR</span>
                    <PrBadge value={previewB} />
                  </div>
                )}
                {/* Fehler B */}
                <div className="pt-1">
                  <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">
                    Fehler B (optional)
                  </label>
                  <input
                    type="number"
                    value={errB}
                    onChange={e => setErrB(e.target.value)}
                    className={errInputCls}
                    placeholder="–"
                    min={0}
                  />
                </div>
              </div>
            </div>

            {/* B–A live calc */}
            {rawA && rawB && Number(rawA) > 0 && Number(rawB) > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700 text-sm">
                <span className="text-slate-400 dark:text-slate-500 font-bold">B − A =</span>
                <span className="font-black text-slate-700 dark:text-slate-200">{Number(rawB) - Number(rawA)} s</span>
              </div>
            )}

            <NoteField value={note} onChange={setNote} />
            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          {/* Norm info */}
          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Norm: </span>
            {tmtNorms.meta.quelle}
            <span className="block mt-1 italic">{tmtNorms.meta.hinweis}</span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
          <div className="mb-4">
            <HistoryHeader count={tmtResults.length} />
          </div>

          {tmtResults.length === 0 ? <EmptyHistory /> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3 text-center">A (s)</th>
                    <th className="px-3 py-3 text-center">B (s)</th>
                    <th className="px-3 py-3 text-center">B−A</th>
                    <th className="px-3 py-3 text-center">PR A</th>
                    <th className="px-3 py-3 text-center">PR B</th>
                    {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {tmtResults.map(res => {
                    const hasErrors = res.rawValues.errA != null || res.rawValues.errB != null;
                    return (
                      <React.Fragment key={res.id}>
                        <tr
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
                          <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.A}</td>
                          <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.B}</td>
                          <td className="px-3 py-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {res.calculatedValues.BminusA}
                          </td>
                          <td className="px-3 py-3 text-center"><PrBadge value={res.percentileRanks.A} /></td>
                          <td className="px-3 py-3 text-center"><PrBadge value={res.percentileRanks.B} /></td>
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
                        {hasErrors && (
                          <tr className={cn(
                            'bg-amber-50/50 dark:bg-amber-900/10',
                            editingId === res.id && 'bg-indigo-50/40 dark:bg-indigo-900/20',
                          )}>
                            <td colSpan={patient.status !== 'entlassen' ? 7 : 6} className="px-4 pb-2 pt-0">
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold italic">
                                Fehler:{' '}
                                {res.rawValues.errA != null && `A: ${res.rawValues.errA}`}
                                {res.rawValues.errA != null && res.rawValues.errB != null && ' · '}
                                {res.rawValues.errB != null && `B: ${res.rawValues.errB}`}
                              </span>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
