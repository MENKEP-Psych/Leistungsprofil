import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { PenLine } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { calculateROCFTPR } from '../lib/rocft';
import {
  prColorCls, PrBadge, TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface ROCFTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

const noSpinner = 'appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const ROCFTTab: React.FC<ROCFTTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rawCFT, setRawCFT] = useState('');
  const [rawCFM, setRawCFM] = useState('');
  const [rawCQM, setRawCQM] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const results = previousResults
    .filter(r => r.testId === 'rey')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const cftVal = rawCFT !== '' && !isNaN(Number(rawCFT)) ? Number(rawCFT) : null;
  const cfmVal = rawCFM !== '' && !isNaN(Number(rawCFM)) ? Number(rawCFM) : null;
  const cqmVal = rawCQM !== '' && !isNaN(Number(rawCQM)) ? Number(rawCQM) : null;

  const ageAtTest = calculateAge(patient.geburtsdatum, date);
  const hasAnyValue = cftVal !== null || cfmVal !== null || cqmVal !== null;
  const liveResult = hasAnyValue
    ? calculateROCFTPR(ageAtTest, { cft: cftVal, cfm: cfmVal, cqm: cqmVal })
    : null;

  const inputCls = cn(
    noSpinner,
    'w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all text-center',
    'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  const reset = () => {
    setRawCFT(''); setRawCFM(''); setRawCQM(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawCFT(String(res.rawValues.cft ?? ''));
    setRawCFM(String(res.rawValues.cfm ?? ''));
    setRawCQM(String(res.rawValues.cqm ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    if (!aborted && !hasAnyValue) return;

    const prResult = calculateROCFTPR(ageAtTest, { cft: cftVal, cfm: cfmVal, cqm: cqmVal });

    const rawValues: Record<string, number | string> = {};
    if (cftVal !== null) rawValues.cft = cftVal;
    if (cfmVal !== null) rawValues.cfm = cfmVal;
    if (cqmVal !== null) rawValues.cqm = cqmVal;

    const percentileRanks: Record<string, number | string> = {};
    if (prResult.prs.cft !== undefined) percentileRanks.cft = prResult.prs.cft;
    if (prResult.prs.cfm !== undefined) percentileRanks.cfm = prResult.prs.cfm;
    if (prResult.prs.cqm !== undefined) percentileRanks.cqm = prResult.prs.cqm;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'rey',
      date,
      examiner,
      note,
      rawValues,
      calculatedValues: {},
      percentileRanks,
      normInfo: prResult.normInfo,
      domainMapping: { rey: '3. Visuo-Perz. / Visuo-Konstr. Leistungen' },
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };
    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);

  const SCALES = [
    { key: 'cft', label: 'CFT – Kopieren',   val: rawCFT, set: setRawCFT, max: 36 },
    { key: 'cfm', label: 'CFM – Direkt',      val: rawCFM, set: setRawCFM, max: 72 },
    { key: 'cqm', label: 'CQM – Verzögert',   val: rawCQM, set: setRawCQM, max: 200 },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PenLine size={22} />}
        title="Rey-Osterrieth-Figur (ROCFT)"
        subtitle={`Visuo-konstruktive Leistung · CFT · CFM · CQM · Alter: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            <div className="grid grid-cols-3 gap-4">
              {SCALES.map(({ key, label, val, set, max }) => (
                <div key={key} className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
                  <input
                    type="number"
                    value={val}
                    onChange={e => set(e.target.value)}
                    className={inputCls}
                    placeholder="–"
                    min={0}
                    max={max}
                  />
                  {/* Live PR badge */}
                  {liveResult?.prs[key] !== undefined && (
                    <div className="flex justify-center">
                      <span className={cn(
                        'px-2 py-0.5 rounded-lg font-black text-[10px]',
                        prColorCls(liveResult.prs[key]!)
                      )}>
                        PR {liveResult.prs[key]}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <NoteField value={note} onChange={setNote} />
            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          {/* Norm info */}
          {liveResult && (
            <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Norm: </span>
              {liveResult.normInfo}
            </div>
          )}
        </div>

        {/* ── HISTORY ── */}
        <div className="space-y-4">
          {/* Live PR Panel */}
          {liveResult && hasAnyValue && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <PenLine size={13} className="text-indigo-500" />
                PR-Werte (aktuell)
              </h3>
              <div className="space-y-1.5">
                {SCALES.map(({ key, label }) => {
                  const pr = liveResult.prs[key];
                  if (pr === undefined || pr === 'n/a') return null;
                  return (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
                      <PrBadge value={pr} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="mb-4"><HistoryHeader count={results.length} /></div>
            {results.length === 0 ? <EmptyHistory /> : (
              <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Datum</th>
                      <th className="px-3 py-3 text-center">CFT</th>
                      <th className="px-3 py-3 text-center">PR</th>
                      <th className="px-3 py-3 text-center">CFM</th>
                      <th className="px-3 py-3 text-center">PR</th>
                      <th className="px-3 py-3 text-center">CQM</th>
                      <th className="px-3 py-3 text-center">PR</th>
                      {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {results.map(res => (
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
                        <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.cft ?? '–'}</td>
                        <td className="px-3 py-3 text-center">
                          {res.percentileRanks.cft !== undefined && res.percentileRanks.cft !== 'n/a'
                            ? <PrBadge value={res.percentileRanks.cft} />
                            : <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.cfm ?? '–'}</td>
                        <td className="px-3 py-3 text-center">
                          {res.percentileRanks.cfm !== undefined && res.percentileRanks.cfm !== 'n/a'
                            ? <PrBadge value={res.percentileRanks.cfm} />
                            : <span className="text-slate-300">–</span>}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.cqm ?? '–'}</td>
                        <td className="px-3 py-3 text-center">
                          {res.percentileRanks.cqm !== undefined && res.percentileRanks.cqm !== 'n/a'
                            ? <PrBadge value={res.percentileRanks.cqm} />
                            : <span className="text-slate-300">–</span>}
                        </td>
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
    </div>
  );
};
