import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Brain, AlertCircle } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { calculateVLMTPR, calculateVLMTPRPartial } from '../lib/vlmt';
import {
  prColorCls, PrBadge, TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface VLMTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

// Reihenfolge im Leistungsprofil & PR-Panel (gemäß Nutzeranforderung):
// Dg1–Dg5, Σ1–5 | I | Dg6, Δ5–6 | Dg7, Δ5–7 | W, W_F
const MEASURES = [
  { key: 'Dg1',      label: 'Supraspanne [1]',               rawLabel: 'Dg1'  },
  { key: 'Dg5',      label: 'Lernleistung [5]',              rawLabel: 'Dg5'  },
  { key: 'sumDg1_5', label: 'Gesamtlernleistung [Σ1–5]',     rawLabel: 'Σ'    },
  { key: 'I',        label: 'Interferenzliste [I]',           rawLabel: 'I'    },
  { key: 'Dg6',      label: 'Abruf n. Interferenz [6]',      rawLabel: 'Dg6'  },
  { key: 'Dg5_Dg6',  label: 'Verlust n. Interferenz [Δ5–6]', rawLabel: 'Δ5–6' },
  { key: 'Dg7',      label: 'Verzögerter Abruf [7]',         rawLabel: 'Dg7'  },
  { key: 'Dg5_Dg7',  label: 'Verlust n. Verzögerung [Δ5–7]', rawLabel: 'Δ5–7' },
  { key: 'W',        label: 'Richtig [WR]',                  rawLabel: 'W'    },
  { key: 'W_F',      label: 'Korr. Wiedererkennen [WR–FP-B–FP]', rawLabel: 'W_F' },
] as const;

// Eingabereihenfolge: Dg1-5 | I | Dg6 Dg7 | W FP_B FP
const FIELD_ORDER = ['Dg1','Dg2','Dg3','Dg4','Dg5','I','Dg6','Dg7','W','FP_B','FP'] as const;

const noSpinner = 'appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const VLMTTab: React.FC<VLMTTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [inputs, setInputs] = useState<Record<string, string>>(
    Object.fromEntries(FIELD_ORDER.map(f => [f, '']))
  );
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const vlmtResults = previousResults
    .filter(r => r.testId === 'vlmt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const num = (field: string): number | null => {
    const v = inputs[field];
    if (v === '' || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const dg1 = num('Dg1'); const dg2 = num('Dg2'); const dg3 = num('Dg3');
  const dg4 = num('Dg4'); const dg5 = num('Dg5'); const dg6 = num('Dg6');
  const dg7 = num('Dg7'); const iVal = num('I');   const wVal = num('W');
  const fpBVal = num('FP_B'); const fpVal = num('FP');

  // W_F (Korrigiertes Wiedererkennen) wird auto-berechnet aus W - FP_B - FP
  const wfVal: number | null =
    wVal !== null && (fpBVal !== null || fpVal !== null)
      ? wVal - (fpBVal ?? 0) - (fpVal ?? 0)
      : null;

  const sumDg1_5 =
    dg1 !== null && dg2 !== null && dg3 !== null && dg4 !== null && dg5 !== null
      ? dg1 + dg2 + dg3 + dg4 + dg5 : null;
  const delta5_6 = dg5 !== null && dg6 !== null ? dg5 - dg6 : null;
  const delta5_7 = dg5 !== null && dg7 !== null ? dg5 - dg7 : null;

  const allRequired =
    dg1 !== null && dg2 !== null && dg3 !== null && dg4 !== null &&
    dg5 !== null && dg6 !== null && dg7 !== null &&
    iVal !== null && wVal !== null;

  const anyValue = [dg1,dg2,dg3,dg4,dg5,dg6,dg7,iVal,wVal].some(v => v !== null);

  const partialResult = anyValue
    ? calculateVLMTPRPartial(ageAtTest, {
        Dg1: dg1, Dg2: dg2, Dg3: dg3, Dg4: dg4, Dg5: dg5,
        Dg6: dg6, Dg7: dg7, I: iVal, W: wVal, W_F: wfVal,
      })
    : null;

  // Keep full-result alias for norm info and save logic
  const liveResult = allRequired
    ? calculateVLMTPR(ageAtTest, {
        Dg1: dg1!, Dg2: dg2!, Dg3: dg3!, Dg4: dg4!, Dg5: dg5!,
        Dg6: dg6!, Dg7: dg7!, I: iVal!, W: wVal!, W_F: wfVal,
      })
    : null;

  const validate = () => {
    const e: Record<string, string> = {};
    const required = ['Dg1','Dg2','Dg3','Dg4','Dg5','Dg6','Dg7','I','W'] as const;
    for (const f of required) {
      const v = Number(inputs[f]);
      if (inputs[f] === '' || isNaN(v) || v < 0 || v > 15) e[f] = `0–15`;
    }
    if (inputs.FP_B !== '') {
      const v = Number(inputs.FP_B);
      if (isNaN(v) || v < 0 || v > 15) e.FP_B = '0–15';
    }
    if (inputs.FP !== '') {
      const v = Number(inputs.FP);
      if (isNaN(v) || v < 0 || v > 15) e.FP = '0–15';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const emptyInputs = () => Object.fromEntries(FIELD_ORDER.map(f => [f, '']));

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setErrors({});
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
    setInputs({
      Dg1: String(res.rawValues.Dg1 ?? ''), Dg2: String(res.rawValues.Dg2 ?? ''),
      Dg3: String(res.rawValues.Dg3 ?? ''), Dg4: String(res.rawValues.Dg4 ?? ''),
      Dg5: String(res.rawValues.Dg5 ?? ''), Dg6: String(res.rawValues.Dg6 ?? ''),
      Dg7: String(res.rawValues.Dg7 ?? ''), I:   String(res.rawValues.I   ?? ''),
      W:   String(res.rawValues.W   ?? ''),
      FP_B: res.rawValues.FP_B !== undefined ? String(res.rawValues.FP_B) : '',
      FP:   res.rawValues.FP   !== undefined ? String(res.rawValues.FP)   : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setInputs(emptyInputs());
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setErrors({});
    setAborted(false); setAbortComment('');
  };

  const handleSave = () => {
    if (!aborted && (!validate() || !allRequired)) return;

    let calcVals: Record<string, number | string> = {};
    let prs: Record<string, number | string> = {};
    let normInfoStr = 'VLMT';

    if (allRequired) {
      const prResult = calculateVLMTPR(ageAtTest, {
        Dg1: dg1!, Dg2: dg2!, Dg3: dg3!, Dg4: dg4!, Dg5: dg5!,
        Dg6: dg6!, Dg7: dg7!, I: iVal!, W: wVal!, W_F: wfVal,
      });
      calcVals = prResult.calculated;
      prs = prResult.prs;
      normInfoStr = prResult.normInfo;
    } else if (aborted && partialResult) {
      calcVals = partialResult.calculated;
      prs = partialResult.prs;
      normInfoStr = partialResult.normInfo;
    }

    const rawValues: Record<string, number | string> = {};
    if (dg1 !== null) rawValues.Dg1 = dg1;
    if (dg2 !== null) rawValues.Dg2 = dg2;
    if (dg3 !== null) rawValues.Dg3 = dg3;
    if (dg4 !== null) rawValues.Dg4 = dg4;
    if (dg5 !== null) rawValues.Dg5 = dg5;
    if (dg6 !== null) rawValues.Dg6 = dg6;
    if (dg7 !== null) rawValues.Dg7 = dg7;
    if (iVal !== null) rawValues.I = iVal;
    if (wVal !== null) rawValues.W = wVal;
    if (fpBVal !== null) rawValues.FP_B = fpBVal;
    if (fpVal  !== null) rawValues.FP   = fpVal;
    if (wfVal  !== null) rawValues.W_F  = wfVal;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'vlmt',
      date,
      rawValues,
      calculatedValues: calcVals,
      percentileRanks: prs,
      normInfo: normInfoStr,
      examiner,
      note,
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    setInputs(emptyInputs());
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  useShortcutSave(handleSave);

  const setInput = (field: string, value: string) =>
    setInputs(prev => ({ ...prev, [field]: value }));

  const focusNext = (currentField: string) => {
    const idx = FIELD_ORDER.indexOf(currentField as typeof FIELD_ORDER[number]);
    if (idx < FIELD_ORDER.length - 1) {
      document.getElementById(`vlmt-${FIELD_ORDER[idx + 1]}`)?.focus();
    } else {
      handleSave();
    }
  };

  const inputCls = (field: string) => cn(
    noSpinner,
    'w-full px-3 py-2.5 text-lg font-mono border-2 rounded-xl outline-none transition-all text-center',
    errors[field]
      ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'
      : 'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Brain size={22} />}
        title="VLMT"
        subtitle={`Verbaler Lern- und Merkfähigkeitstest · Alter: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-5">

            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            {/* Zeile 1: Lerndurchgänge Dg1–Dg5 */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                Lerndurchgänge (Dg1–5)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(['Dg1','Dg2','Dg3','Dg4','Dg5'] as const).map(f => (
                  <div key={f} className="space-y-1">
                    <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 text-center uppercase tracking-wide">{f}</div>
                    <input
                      id={`vlmt-${f}`}
                      type="number"
                      value={inputs[f]}
                      onChange={e => setInput(f, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && focusNext(f)}
                      className={inputCls(f)}
                      placeholder="–"
                      min={0} max={15}
                    />
                    {errors[f] && (
                      <p className="text-[9px] text-red-500 text-center flex items-center justify-center gap-0.5">
                        <AlertCircle size={9} /> {errors[f]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Live Σ */}
              {sumDg1_5 !== null && (
                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-xs">
                  <span className="text-indigo-400 dark:text-indigo-500 font-bold">Σ(1–5) =</span>
                  <span className="font-black text-indigo-700 dark:text-indigo-300">{sumDg1_5}</span>
                  {partialResult?.prs.sumDg1_5 !== undefined && partialResult.prs.sumDg1_5 !== 'n/a' && (
                    <span className={cn('ml-auto px-2 py-0.5 rounded-lg font-black text-[10px]', prColorCls(partialResult.prs.sumDg1_5))}>
                      PR {partialResult.prs.sumDg1_5}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Zeile 2: I | Dg6 | Dg7 */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                Interferenz &amp; Abruf
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['I','Dg6','Dg7'] as const).map(f => (
                  <div key={f} className="space-y-1">
                    <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 text-center uppercase tracking-wide">
                      {f === 'I' ? 'Interferenz (I)' : f}
                    </div>
                    <input
                      id={`vlmt-${f}`}
                      type="number"
                      value={inputs[f]}
                      onChange={e => setInput(f, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && focusNext(f)}
                      className={inputCls(f)}
                      placeholder="–"
                      min={0} max={15}
                    />
                    {errors[f] && (
                      <p className="text-[9px] text-red-500 text-center flex items-center justify-center gap-0.5">
                        <AlertCircle size={9} /> {errors[f]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Live Verluste */}
              {(delta5_6 !== null || delta5_7 !== null) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {delta5_6 !== null && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs">
                      <span className="text-amber-500 dark:text-amber-400 font-bold">Δ5–6 =</span>
                      <span className="font-black text-amber-700 dark:text-amber-300">{delta5_6}</span>
                      {partialResult?.prs.Dg5_Dg6 !== undefined && partialResult.prs.Dg5_Dg6 !== 'n/a' && (
                        <span className={cn('ml-auto px-1.5 py-0.5 rounded-lg font-black text-[10px]', prColorCls(partialResult.prs.Dg5_Dg6))}>
                          PR {partialResult.prs.Dg5_Dg6}
                        </span>
                      )}
                    </div>
                  )}
                  {delta5_7 !== null && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs">
                      <span className="text-amber-500 dark:text-amber-400 font-bold">Δ5–7 =</span>
                      <span className="font-black text-amber-700 dark:text-amber-300">{delta5_7}</span>
                      {partialResult?.prs.Dg5_Dg7 !== undefined && partialResult.prs.Dg5_Dg7 !== 'n/a' && (
                        <span className={cn('ml-auto px-1.5 py-0.5 rounded-lg font-black text-[10px]', prColorCls(partialResult.prs.Dg5_Dg7))}>
                          PR {partialResult.prs.Dg5_Dg7}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Zeile 3: Richtig (W) | FP-B | FP — W_F auto-berechnet */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                Wiedererkennen
              </label>
              <div className="grid grid-cols-3 gap-3">
                {/* Richtig (W) */}
                <div className="space-y-1">
                  <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 text-center uppercase tracking-wide">Richtig (W)</div>
                  <input
                    id="vlmt-W"
                    type="number"
                    value={inputs.W}
                    onChange={e => setInput('W', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && focusNext('W')}
                    className={inputCls('W')}
                    placeholder="–"
                    min={0} max={15}
                  />
                  {errors.W && (
                    <p className="text-[9px] text-red-500 text-center flex items-center justify-center gap-0.5">
                      <AlertCircle size={9} /> {errors.W}
                    </p>
                  )}
                </div>
                {/* FP-B */}
                <div className="space-y-1">
                  <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 text-center uppercase tracking-wide">FP-B (opt.)</div>
                  <input
                    id="vlmt-FP_B"
                    type="number"
                    value={inputs.FP_B}
                    onChange={e => setInput('FP_B', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && focusNext('FP_B')}
                    className={inputCls('FP_B')}
                    placeholder="–"
                    min={0} max={15}
                  />
                  {errors.FP_B && (
                    <p className="text-[9px] text-red-500 text-center flex items-center justify-center gap-0.5">
                      <AlertCircle size={9} /> {errors.FP_B}
                    </p>
                  )}
                </div>
                {/* FP */}
                <div className="space-y-1">
                  <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 text-center uppercase tracking-wide">FP (opt.)</div>
                  <input
                    id="vlmt-FP"
                    type="number"
                    value={inputs.FP}
                    onChange={e => setInput('FP', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    className={inputCls('FP')}
                    placeholder="–"
                    min={0} max={15}
                  />
                  {errors.FP && (
                    <p className="text-[9px] text-red-500 text-center flex items-center justify-center gap-0.5">
                      <AlertCircle size={9} /> {errors.FP}
                    </p>
                  )}
                </div>
              </div>

              {/* Auto-berechnetes W_F */}
              {wfVal !== null && (
                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-xs">
                  <span className="text-slate-400 dark:text-slate-500 font-bold">Korr. Wiedererkennen (W−FP-B−FP) =</span>
                  <span className="font-black text-slate-700 dark:text-slate-200">{wfVal}</span>
                  {partialResult?.prs.W_F !== undefined && partialResult.prs.W_F !== 'n/a' && (
                    <span className={cn('ml-auto px-2 py-0.5 rounded-lg font-black text-[10px]', prColorCls(partialResult.prs.W_F))}>
                      PR {partialResult.prs.W_F}
                    </span>
                  )}
                </div>
              )}
            </div>

            <NoteField value={note} onChange={setNote} />
            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          {/* Norm info */}
          {partialResult && (
            <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Norm: </span>
              {partialResult.normInfo}
            </div>
          )}
        </div>

        {/* ── RIGHT: Live PRs + History ── */}
        <div className="space-y-4">
          {/* Live PR panel */}
          {partialResult && Object.keys(partialResult.prs).length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
              <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Brain size={13} className="text-indigo-500" />
                PR-Werte (aktuell)
              </h3>
              <div className="space-y-1.5">
                {MEASURES.map(m => {
                  const pr = partialResult.prs[m.key];
                  if (pr === undefined || pr === 'n/a') return null;
                  const rawVal = (() => {
                    if (m.key === 'sumDg1_5') return sumDg1_5;
                    if (m.key === 'Dg5_Dg6') return delta5_6;
                    if (m.key === 'Dg5_Dg7') return delta5_7;
                    if (m.key === 'W_F') return wfVal;
                    return num(m.key);
                  })();
                  return (
                    <div key={m.key} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{m.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {rawVal !== null && (
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                            {m.rawLabel}: {rawVal}
                          </span>
                        )}
                        <PrBadge value={pr} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* History */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
            <div className="mb-4">
              <HistoryHeader count={vlmtResults.length} />
            </div>

            {vlmtResults.length === 0 ? <EmptyHistory /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5">Datum</th>
                      <th className="px-2 py-2.5 text-center">Σ(1–5)</th>
                      <th className="px-2 py-2.5 text-center">I</th>
                      <th className="px-2 py-2.5 text-center">Dg6</th>
                      <th className="px-2 py-2.5 text-center">Dg7</th>
                      <th className="px-2 py-2.5 text-center">Δ5–6</th>
                      <th className="px-2 py-2.5 text-center">Δ5–7</th>
                      <th className="px-2 py-2.5 text-center">PR Σ</th>
                      <th className="px-2 py-2.5 text-center">PR Dg7</th>
                      <th className="px-2 py-2.5 text-center">W</th>
                      <th className="px-2 py-2.5 text-center">PR W</th>
                      <th className="px-2 py-2.5 text-center">W−FP-B−FP</th>
                      <th className="px-2 py-2.5 text-center">PR W−FP</th>
                      {patient.status !== 'entlassen' && <th className="px-2 py-2.5 w-14" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {vlmtResults.map(res => (
                      <tr
                        key={res.id}
                        className={cn(
                          'hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors',
                          editingId === res.id && 'bg-indigo-50/60 dark:bg-indigo-900/30',
                        )}
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {formatDate(res.date)}
                            {res.aborted && <AbortBadge comment={res.abortComment} />}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.calculatedValues.sumDg1_5}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.I}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.Dg6}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.Dg7}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.calculatedValues.Dg5_Dg6}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.calculatedValues.Dg5_Dg7}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.sumDg1_5 !== undefined && res.percentileRanks.sumDg1_5 !== 'n/a' && (
                            <PrBadge value={res.percentileRanks.sumDg1_5} />
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.Dg7 !== undefined && res.percentileRanks.Dg7 !== 'n/a' && (
                            <PrBadge value={res.percentileRanks.Dg7} />
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.W ?? '–'}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.W !== undefined && res.percentileRanks.W !== 'n/a' && (
                            <PrBadge value={res.percentileRanks.W} />
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-slate-600 dark:text-slate-300">
                          {res.rawValues.W_F !== undefined ? res.rawValues.W_F : '–'}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {res.percentileRanks.W_F !== undefined && res.percentileRanks.W_F !== 'n/a' && (
                            <PrBadge value={res.percentileRanks.W_F} />
                          )}
                        </td>
                        {patient.status !== 'entlassen' && (
                          <td className="px-2 py-2.5">
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
