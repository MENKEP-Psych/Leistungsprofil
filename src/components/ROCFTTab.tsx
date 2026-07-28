import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, Save, CheckCircle2, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { calculateROCFTPR } from '../lib/rocft';
import type { ROCFTPRResult } from '../lib/rocft';
import { prColorCls, PrBadge, AbortBadge, HistoryRowActions, HistoryDate, OutOfRangeWarning } from './TestForm';

interface ROCFTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ScaleKey = 'cft' | 'cfm' | 'cqm';

interface ScaleEntry {
  key: ScaleKey;
  label: string;
  sublabel: string;
  val: string;
  set: (v: string) => void;
  min: number;
  max: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function prNumeric(pr: number | string | undefined): number | null {
  if (pr === undefined || pr === 'n/a') return null;
  if (typeof pr === 'number') return pr;
  const s = String(pr).trim();
  if (s.startsWith('<')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.max(0.5, v / 2); }
  if (s.startsWith('>')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.min(99.5, v + 0.5); }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function prBarBgCls(pr: number | string): string {
  const n = prNumeric(pr) ?? 50;
  if (n < 2)  return 'bg-red-400';
  if (n < 16) return 'bg-orange-400';
  if (n < 31) return 'bg-yellow-400';
  if (n < 69) return 'bg-green-400';
  if (n < 84) return 'bg-blue-400';
  if (n < 98) return 'bg-violet-400';
  return 'bg-purple-400';
}

function prTextCls(pr: number | string): string {
  const n = prNumeric(pr) ?? 50;
  if (n < 2)  return 'text-red-500';
  if (n < 16) return 'text-orange-500';
  if (n < 31) return 'text-yellow-600';
  if (n < 69) return 'text-green-600';
  if (n < 84) return 'text-blue-500';
  if (n < 98) return 'text-violet-500';
  return 'text-purple-500';
}

// ── SaveBtn ───────────────────────────────────────────────────────────────────

const SaveBtn: React.FC<{
  onSave: () => void; saved: boolean; editingId: string | null; onCancel: () => void;
}> = ({ onSave, saved, editingId, onCancel }) => (
  <div className="flex items-center gap-2">
    <button onClick={onSave} className={cn(
      'flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95',
      saved
        ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
        : 'bg-slate-900 hover:bg-slate-700 text-white shadow-md shadow-slate-400/20',
    )}>
      {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
      {saved ? 'Gespeichert' : editingId ? 'Aktualisieren' : 'Speichern'}
    </button>
    {editingId && (
      <button onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
        <X size={13} /> Abbrechen
      </button>
    )}
  </div>
);

// ── AbortArea ─────────────────────────────────────────────────────────────────

const AbortArea: React.FC<{
  aborted: boolean; abortComment: string;
  onSetAborted: (v: boolean) => void; onAbortComment: (v: string) => void;
}> = ({ aborted, abortComment, onSetAborted, onAbortComment }) => {
  if (!aborted) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-orange-50 border border-orange-100">
        <OctagonX size={14} className="text-orange-400 shrink-0" />
        <span className="text-sm font-medium text-orange-700 flex-1">Abgebrochen / unvollständig</span>
        <button type="button" onClick={() => { onSetAborted(false); onAbortComment(''); }}
          className="text-orange-300 hover:text-orange-500 transition-colors rounded p-0.5">
          <X size={13} />
        </button>
      </div>
      <textarea value={abortComment} onChange={e => onAbortComment(e.target.value)}
        placeholder="Grund (optional)…" rows={2}
        className="w-full px-3 py-2 text-sm rounded-2xl bg-orange-50 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none placeholder:text-orange-300"
      />
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

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

  const ageOutOfRange = calculateROCFTPR(ageAtTest, {}).ageGroup === null;

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
      date, examiner, note, rawValues,
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
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  const SCALES: ScaleEntry[] = [
    { key: 'cft', label: 'CFT', sublabel: 'Abzeichnen', val: rawCFT, set: setRawCFT, min: 0, max: 36 },
    { key: 'cfm', label: 'CFM', sublabel: 'Gedächtnis', val: rawCFM, set: setRawCFM, min: 0, max: 72 },
    { key: 'cqm', label: 'CQM', sublabel: 'Quotient',   val: rawCQM, set: setRawCQM, min: 0, max: 300 },
  ];

  return (
    <div className="space-y-4" ref={containerRef}>

      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">
          Rey-Osterrieth Complex Figure Test
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
          <div className="divide-y divide-slate-200">
            {SCALES.map(({ key, label, sublabel, val, set, min, max }) => {
              const pr = liveResult?.prs[key];
              const hasPr = pr !== undefined && pr !== 'n/a';
              const prN = prNumeric(pr);
              const filled = val !== '';
              const numVal = val !== '' ? Number(val) : null;
              const outOfRange = numVal !== null && (numVal < min || numVal > max);
              return (
                <div key={key} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-32 shrink-0">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">{label}</div>
                    <div className="text-[11px] text-slate-500 font-medium">{sublabel}</div>
                  </div>
                  <div className={cn(
                    'flex items-center rounded-lg px-3 py-1.5 w-20 transition-all',
                    outOfRange
                      ? 'bg-white ring-2 ring-red-400'
                      : filled
                        ? 'bg-white border border-slate-400'
                        : 'bg-white border border-slate-300',
                  )}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={val}
                      onChange={e => set(e.target.value.replace(/[^0-9]/g, ''))}
                      className={cn(
                        'w-full text-center text-lg font-mono font-semibold bg-transparent outline-none placeholder:text-slate-300',
                        outOfRange ? 'text-red-500' : 'text-slate-800',
                      )}
                      placeholder="–"
                    />
                  </div>
                  <span className={cn('text-[10px] w-10 shrink-0 tabular-nums', outOfRange ? 'text-red-400 font-semibold' : 'text-slate-400')}>/{max}</span>
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="w-28 shrink-0 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      {hasPr && prN !== null && (
                        <div
                          className={cn('h-full rounded-full transition-all duration-700', prBarBgCls(pr!))}
                          style={{ width: `${Math.min(100, prN)}%` }}
                        />
                      )}
                    </div>
                    {hasPr ? (
                      <span className={cn('text-sm font-bold tabular-nums w-14 text-right shrink-0', prTextCls(pr!))}>
                        PR {pr}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 w-14 text-right shrink-0 select-none">–</span>
                    )}
                  </div>
                </div>
              );
            })}
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
              <AbortArea aborted={aborted} abortComment={abortComment} onSetAborted={setAborted} onAbortComment={setAbortComment} />
            )}
            {ageOutOfRange && <OutOfRangeWarning />}
            <div className="pt-1">
              <SaveBtn onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
            </div>
          </div>
        </div>

      </div>

      {/* Norm-Info */}
      {liveResult && (
        <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100">
          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Norm · </span>
          <span className="text-[11px] text-gray-400">{liveResult.normInfo}</span>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vorherige Messungen</span>
          {results.length > 0 && (
            <span className="text-[10px] bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md font-semibold">
              {results.length}
            </span>
          )}
        </div>
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <HistoryIcon size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">CFT</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">CFM</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">CQM</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR</th>
                {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {results.map(res => (
                <tr key={res.id} className={cn('hover:bg-gray-50/60 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                    </div>
                    {res.examiner && <div className="text-[9px] text-gray-400 mt-0.5">{res.examiner}</div>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.cft ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.cft !== undefined && res.percentileRanks.cft !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.cft} /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.cfm ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.cfm !== undefined && res.percentileRanks.cfm !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.cfm} /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.cqm ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.cqm !== undefined && res.percentileRanks.cqm !== 'n/a'
                      ? <PrBadge value={res.percentileRanks.cqm} /> : <span className="text-gray-300">–</span>}
                  </td>
                  {patient.status !== 'entlassen' && (
                    <td className="px-2 py-3">
                      <HistoryRowActions
                        id={res.id} editingId={editingId} confirmDeleteId={confirmDeleteId} patientDischarged={false}
                        onEdit={() => {
                          setConfirmDeleteId(null);
                          if (editingId === res.id) { cancelEdit(); } else { startEdit(res); }
                        }}
                        onDelete={() => onDelete(res.id)}
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
