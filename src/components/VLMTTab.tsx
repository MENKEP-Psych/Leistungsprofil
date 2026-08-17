import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { calculateVLMTPR, calculateVLMTPRPartial } from '../lib/vlmt';
import { prColorCls, PrBadge, AbortBadge, HistoryRowActions, FormSave, HistoryDate, OutOfRangeWarning } from './TestForm';

interface VLMTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

const FIELD_ORDER = ['Dg1','Dg2','Dg3','Dg4','Dg5','I','Dg6','Dg7','W','FP_B','FP'] as const;

// Der VLMT wird in mehreren Parallelformen durchgeführt (Wortlisten A, C, D).
export const VLMT_VERSION_OPTIONS = [
  { value: 'A', label: 'Version A' },
  { value: 'C', label: 'Version C' },
  { value: 'D', label: 'Version D' },
] as const;

export type VLMTVersionValue = typeof VLMT_VERSION_OPTIONS[number]['value'];

function prNumeric(pr: number | string | undefined): number | null {
  if (pr === undefined || pr === 'n/a') return null;
  if (typeof pr === 'number') return pr;
  const s = String(pr).trim();
  if (s.startsWith('<')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.max(0.5, v / 2); }
  if (s.startsWith('>')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.min(99.5, v + 0.5); }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function barCls(n: number): string {
  if (n < 2)  return 'bg-red-400';
  if (n < 16) return 'bg-orange-400';
  if (n < 31) return 'bg-yellow-400';
  if (n < 69) return 'bg-green-400';
  if (n < 84) return 'bg-blue-400';
  if (n < 98) return 'bg-violet-400';
  return 'bg-purple-400';
}

function txtCls(n: number): string {
  if (n < 2)  return 'text-red-500';
  if (n < 16) return 'text-orange-500';
  if (n < 31) return 'text-yellow-600';
  if (n < 69) return 'text-green-600';
  if (n < 84) return 'text-blue-500';
  if (n < 98) return 'text-violet-500';
  return 'text-purple-500';
}

export const VLMTTab: React.FC<VLMTTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [inputs, setInputs] = useState<Record<string, string>>(
    Object.fromEntries(FIELD_ORDER.map(f => [f, '']))
  );
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [version, setVersion] = useState<VLMTVersionValue>('A');
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

  const ageOutOfRange = calculateVLMTPRPartial(ageAtTest, {}).normInfo.includes('Keine Normen');

  const validate = () => {
    const e: Record<string, string> = {};
    const required = ['Dg1','Dg2','Dg3','Dg4','Dg5','Dg6','Dg7','I','W'] as const;
    for (const f of required) {
      // Leere Felder sind bei Teil-/Abbruch-Speicherung erlaubt — nur ausgefüllte
      // Felder müssen im gültigen Bereich liegen.
      if (inputs[f] === '') continue;
      const v = Number(inputs[f]);
      if (isNaN(v) || v < 0 || v > 15) e[f] = `0–15`;
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
    setVersion((res.rawValues.version as VLMTVersionValue) ?? 'A');
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
    setVersion('A');
    setErrors({});
    setAborted(false); setAbortComment('');
  };

  const handleSave = () => {
    // Wie bei den anderen Tests: ein leerer Datensatz wird nur bei explizitem Abbruch
    // gespeichert, ein teilweise ausgefüllter Datensatz IMMER (nicht erst, wenn auch
    // "Test abgebrochen" angeklickt wurde) — sonst geht der bis dahin erreichte
    // Lernverlauf beim Speichern kommentarlos verloren.
    if (!validate() || (!aborted && !anyValue)) return;

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
    } else if (partialResult) {
      calcVals = partialResult.calculated;
      prs = partialResult.prs;
      normInfoStr = partialResult.normInfo;
    }

    const rawValues: Record<string, number | string> = { version };
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
    setVersion('A');
    setAborted(false); setAbortComment('');
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

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
    'w-full text-center text-lg font-mono font-semibold bg-transparent outline-none placeholder:text-slate-300',
    errors[field] ? 'text-red-500' : 'text-slate-800',
  );

  const wrapCls = (field: string, filled: boolean) => cn(
    'flex items-center justify-center rounded-lg px-2 py-1.5 transition-all',
    errors[field]
      ? 'bg-white ring-2 ring-red-400'
      : filled
        ? 'bg-white border border-slate-400'
        : 'bg-white border border-slate-300',
  );

  return (
    <div className="space-y-4" ref={containerRef}>

      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">
          Verbaler Lern- und Merkfähigkeitstest
        </h2>
        <span className="text-[11px] text-slate-400">Alter: {ageAtTest} J.</span>
      </div>

      {/* 2-Spalten: Messwerte links, Meta rechts */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Links: Messwerte */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Messwerte</span>
          </div>

          {/* Version (Wortliste A/C/D) */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Version</div>
            <div className="flex flex-wrap gap-1.5">
              {VLMT_VERSION_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setVersion(opt.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                    version === opt.value
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lerndurchgänge Dg1–Dg5 */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Lerndurchgänge (Dg1–5)
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(['Dg1','Dg2','Dg3','Dg4','Dg5'] as const).map(f => (
                <div key={f} className="space-y-1">
                  <div className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-wide">{f}</div>
                  <div className={wrapCls(f, inputs[f] !== '')}>
                    <input
                      id={`vlmt-${f}`}
                      type="text"
                      inputMode="numeric"
                      value={inputs[f]}
                      onChange={e => { setInput(f, e.target.value.replace(/[^0-9]/g, '')); setErrors(p => ({ ...p, [f]: '' })); }}
                      onKeyDown={e => e.key === 'Enter' && focusNext(f)}
                      className={inputCls(f)}
                      placeholder="–"
                    />
                  </div>
                  {errors[f] && (
                    <p className="text-[9px] text-red-500 text-center">{errors[f]}</p>
                  )}
                </div>
              ))}
            </div>
            {sumDg1_5 !== null && (() => {
              const pr = partialResult?.prs.sumDg1_5;
              const prN = prNumeric(pr);
              return (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28 shrink-0">Σ(1–5) = {sumDg1_5}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    {prN !== null && (
                      <div className={cn('h-full rounded-full transition-all duration-700', barCls(prN))} style={{ width: `${Math.min(100, prN)}%` }} />
                    )}
                  </div>
                  {pr !== undefined && pr !== 'n/a' ? (
                    <span className={cn('text-sm font-bold tabular-nums shrink-0', txtCls(prN ?? 50))}>PR {pr}</span>
                  ) : (
                    <span className="text-[10px] text-slate-300 shrink-0 select-none">–</span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Interferenz & Abruf */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Interferenz &amp; Abruf
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['I','Dg6','Dg7'] as const).map(f => (
                <div key={f} className="space-y-1">
                  <div className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-wide">
                    {f === 'I' ? 'Interferenz (I)' : f}
                  </div>
                  <div className={wrapCls(f, inputs[f] !== '')}>
                    <input
                      id={`vlmt-${f}`}
                      type="text"
                      inputMode="numeric"
                      value={inputs[f]}
                      onChange={e => { setInput(f, e.target.value.replace(/[^0-9]/g, '')); setErrors(p => ({ ...p, [f]: '' })); }}
                      onKeyDown={e => e.key === 'Enter' && focusNext(f)}
                      className={inputCls(f)}
                      placeholder="–"
                    />
                  </div>
                  {errors[f] && (
                    <p className="text-[9px] text-red-500 text-center">{errors[f]}</p>
                  )}
                </div>
              ))}
            </div>
            {[
              { label: 'Δ5–6', val: delta5_6, prKey: 'Dg5_Dg6' as const },
              { label: 'Δ5–7', val: delta5_7, prKey: 'Dg5_Dg7' as const },
            ].filter(r => r.val !== null).map(({ label, val, prKey }) => {
              const pr = partialResult?.prs[prKey];
              const prN = prNumeric(pr);
              return (
                <div key={label} className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28 shrink-0">{label} = {val}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    {prN !== null && (
                      <div className={cn('h-full rounded-full transition-all duration-700', barCls(prN))} style={{ width: `${Math.min(100, prN)}%` }} />
                    )}
                  </div>
                  {pr !== undefined && pr !== 'n/a' ? (
                    <span className={cn('text-sm font-bold tabular-nums shrink-0', txtCls(prN ?? 50))}>PR {pr}</span>
                  ) : (
                    <span className="text-[10px] text-slate-300 shrink-0 select-none">–</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Wiedererkennen */}
          <div className="px-5 py-4">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Wiedererkennen
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                { f: 'W',    label: 'Richtig (W)',  optional: false },
                { f: 'FP_B', label: 'Fehler Liste B', optional: true  },
                { f: 'FP',   label: 'Fehler Distraktor', optional: true  },
              ] as const).map(({ f, label, optional }) => (
                <div key={f} className="space-y-1">
                  <div className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-wide">{label}</div>
                  <div className={wrapCls(f, inputs[f] !== '')}>
                    <input
                      id={`vlmt-${f}`}
                      type="text"
                      inputMode="numeric"
                      value={inputs[f]}
                      onChange={e => { setInput(f, e.target.value.replace(/[^0-9]/g, '')); setErrors(p => ({ ...p, [f]: '' })); }}
                      onKeyDown={e => e.key === 'Enter' && (optional && f === 'FP' ? handleSave() : focusNext(f))}
                      className={inputCls(f)}
                      placeholder="–"
                    />
                  </div>
                  {errors[f] && (
                    <p className="text-[9px] text-red-500 text-center">{errors[f]}</p>
                  )}
                </div>
              ))}
            </div>
            {wfVal !== null && (() => {
              const pr = partialResult?.prs.W_F;
              const prN = prNumeric(pr);
              return (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28 shrink-0">W−FP-B−FP = {wfVal}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    {prN !== null && (
                      <div className={cn('h-full rounded-full transition-all duration-700', barCls(prN))} style={{ width: `${Math.min(100, prN)}%` }} />
                    )}
                  </div>
                  {pr !== undefined && pr !== 'n/a' ? (
                    <span className={cn('text-sm font-bold tabular-nums shrink-0', txtCls(prN ?? 50))}>PR {pr}</span>
                  ) : (
                    <span className="text-[10px] text-slate-300 shrink-0 select-none">–</span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Rechts: Meta + Speichern */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-2.5 bg-slate-800 rounded-t-2xl">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Untersuchung</span>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Datum</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Untersucher</label>
                <input type="text" value={examiner} onChange={e => setExaminer(e.target.value)} placeholder="Kürzel"
                  className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Notiz</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Besonderheiten…"
                className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300"
              />
            </div>
            {!aborted ? (
              <button type="button" onClick={() => setAborted(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors w-full">
                <OctagonX size={13} /> Test abgebrochen / unvollständig
              </button>
            ) : (
              <button type="button" onClick={() => { setAborted(false); setAbortComment(''); }}
                className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-orange-600 bg-orange-50 rounded-xl border border-orange-100 w-full">
                <OctagonX size={13} /> Abgebrochen <X size={11} className="ml-auto" />
              </button>
            )}
            {aborted && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-orange-50 border border-orange-100">
                  <OctagonX size={14} className="text-orange-400 shrink-0" />
                  <span className="text-sm font-medium text-orange-700 flex-1">Abgebrochen / unvollständig</span>
                  <button type="button" onClick={() => { setAborted(false); setAbortComment(''); }}
                    className="text-orange-300 hover:text-orange-500 transition-colors rounded p-0.5">
                    <X size={13} />
                  </button>
                </div>
                <textarea value={abortComment} onChange={e => setAbortComment(e.target.value)}
                  placeholder="Grund (optional)…" rows={2}
                  className="w-full px-3 py-2 text-sm rounded-2xl bg-orange-50 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none placeholder:text-orange-300"
                />
              </div>
            )}
            {ageOutOfRange && <OutOfRangeWarning />}
            <div className="pt-1">
              <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
            </div>
          </div>
        </div>

      </div>

      {/* Norm-Info */}
      {partialResult && (
        <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100">
          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Norm · </span>
          <span className="text-[11px] text-gray-400">{partialResult.normInfo}</span>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vorherige Messungen</span>
          {vlmtResults.length > 0 && (
            <span className="text-[10px] bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md font-semibold">
              {vlmtResults.length}
            </span>
          )}
        </div>
        {vlmtResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <HistoryIcon size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Σ(1–5)</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Dg6</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Dg7</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR Dg7</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Δ5–6</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Δ5–7</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">W</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR W</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">W−FP</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR W−FP</th>
                {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vlmtResults.map(res => (
                <tr key={res.id} className={cn('hover:bg-gray-50/60 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                      {res.rawValues.version && res.rawValues.version !== 'A' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 uppercase tracking-wider">
                          {VLMT_VERSION_OPTIONS.find(o => o.value === res.rawValues.version)?.label ?? res.rawValues.version}
                        </span>
                      )}
                    </div>
                    {res.examiner && <div className="text-[9px] text-gray-400 mt-0.5">{res.examiner}</div>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.calculatedValues.sumDg1_5 ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.sumDg1_5 !== undefined && res.percentileRanks.sumDg1_5 !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.sumDg1_5} /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.Dg6 ?? '–'}</td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.Dg7 ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.Dg7 !== undefined && res.percentileRanks.Dg7 !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.Dg7} /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.calculatedValues.Dg5_Dg6 ?? '–'}</td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.calculatedValues.Dg5_Dg7 ?? '–'}</td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.W ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.W !== undefined && res.percentileRanks.W !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.W} /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">
                    {res.rawValues.W_F !== undefined ? res.rawValues.W_F : '–'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.W_F !== undefined && res.percentileRanks.W_F !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.W_F} /> : <span className="text-gray-300">–</span>}
                  </td>
                  {patient.status !== 'entlassen' && (
                    <td className="px-2 py-3">
                      <HistoryRowActions
                        id={res.id} editingId={editingId} confirmDeleteId={confirmDeleteId} patientDischarged={false}
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
        )}
      </div>
    </div>
  );
};
