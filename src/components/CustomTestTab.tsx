import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { History as HistoryIcon, Plus, AlignLeft, Trash2 } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PrBadge, AbortBadge, FormSave, HistoryRowActions, HistoryDate } from './TestForm';

interface CustomTestTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export interface CustomRow {
  label: string;
  value: string;
  pr: string;
  freitext?: string;
}

const emptyRow = (): CustomRow => ({ label: '', value: '', pr: '' });
const emptyFreitextRow = (): CustomRow => ({ label: '', value: '', pr: '', freitext: '' });

function prNumeric(pr: string): number | null {
  const v = parseFloat(pr);
  return isNaN(v) ? null : Math.min(100, Math.max(0, v));
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

export const CustomTestTab: React.FC<CustomTestTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [testName,     setTestName]     = useState('');
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0]);
  const [examiner,     setExaminer]     = useState(currentUser ?? '');
  const [rows,         setRows]         = useState<CustomRow[]>([emptyRow()]);
  const [note,         setNote]         = useState('');
  const [lastSaved,    setLastSaved]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nameError,    setNameError]    = useState(false);

  const results = previousResults
    .filter(r => r.testId === 'custom')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const addRow        = () => setRows(prev => [...prev, emptyRow()]);
  const addFreitext   = () => setRows(prev => [...prev, emptyFreitextRow()]);
  const removeRow     = (i: number) => setRows(prev => prev.length === 1 ? prev : prev.filter((_, j) => j !== i));
  const updateRow     = (i: number, field: keyof CustomRow, val: string) =>
    setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r));

  const reset = () => {
    setTestName(''); setRows([emptyRow()]); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setNameError(false);
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setTestName(String(res.rawValues.testName ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    try {
      const parsed = JSON.parse(String(res.rawValues.rows ?? '[]')) as CustomRow[];
      setRows(parsed.length > 0 ? parsed : [emptyRow()]);
    } catch { setRows([emptyRow()]); }
    setNote(res.note ?? '');
    setNameError(false);
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    if (!testName.trim()) { setNameError(true); return; }
    setNameError(false);

    const percentileRanks: Record<string, number | string> = {};
    rows.forEach((r, i) => {
      if (r.freitext === undefined && r.pr.trim() !== '') {
        const n = parseFloat(r.pr);
        percentileRanks[`row_${i}`] = isNaN(n) ? r.pr : n;
      }
    });

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'custom', date, examiner, note,
      rawValues: { testName: testName.trim(), rows: JSON.stringify(rows) },
      calculatedValues: {}, percentileRanks,
      normInfo: 'Eigener Test',
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true); setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  const inputCls = 'w-full px-2.5 py-2 text-sm text-slate-700 bg-white rounded-lg outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300';

  return (
    <div className="space-y-4" ref={containerRef}>

      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">Eigener Test</h2>
        <span className="text-[11px] text-slate-400">Freie Dokumentation</span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Testergebnisse */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Testergebnisse</span>
          </div>
          <div className="p-5 space-y-4">

            {/* Test name */}
            <div className="space-y-1">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Testname *</label>
              <input type="text" value={testName} onChange={e => { setTestName(e.target.value); setNameError(false); }}
                placeholder="z. B. Stroop, RBMT, BNT…"
                className={cn(inputCls, nameError && 'ring-2 ring-red-400')} />
              {nameError && <p className="text-[10px] text-red-500">Bitte Testname eingeben.</p>}
            </div>

            {/* Column headers */}
            {rows.some(r => r.freitext === undefined) && (
              <div className="grid grid-cols-[1fr_1fr_100px_28px] gap-2 px-0.5">
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Bezeichnung</span>
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Ergebnis / Rohwert</span>
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">PR (0–100)</span>
                <span />
              </div>
            )}

            {/* Rows */}
            <div className="space-y-2">
              {rows.map((row, i) =>
                row.freitext !== undefined ? (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                      <AlignLeft size={12} className="text-amber-400 mt-1 shrink-0" />
                      <textarea value={row.freitext}
                        onChange={e => updateRow(i, 'freitext', e.target.value)}
                        rows={2} placeholder="Qualitative Beobachtung…"
                        className="flex-1 bg-transparent text-sm text-slate-700 outline-none resize-none placeholder:text-amber-400/60" />
                    </div>
                    <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all disabled:opacity-30 mt-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <div key={i} className="grid grid-cols-[1fr_1fr_100px_28px] gap-2 items-center">
                    <input type="text" value={row.label}
                      onChange={e => updateRow(i, 'label', e.target.value)}
                      placeholder="z. B. Subtest 4" className={inputCls} />
                    <input type="text" value={row.value}
                      onChange={e => updateRow(i, 'value', e.target.value)}
                      placeholder="z. B. 18, 2:34 min" className={inputCls} />
                    <div className="space-y-1">
                      <div className={cn(
                        'flex items-center rounded-lg px-2 py-1.5 transition-all',
                        row.pr !== '' ? 'border border-slate-400 bg-white' : 'border border-slate-300 bg-white',
                      )}>
                        <input type="text" inputMode="numeric" value={row.pr}
                          onChange={e => updateRow(i, 'pr', e.target.value.replace(/[^0-9.]/g, ''))}
                          placeholder="–"
                          className="w-full text-center text-sm font-mono font-semibold text-slate-800 bg-transparent outline-none placeholder:text-slate-300" />
                      </div>
                      {row.pr !== '' && prNumeric(row.pr) !== null && (
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-500', barCls(prNumeric(row.pr)!))}
                            style={{ width: `${Math.min(100, prNumeric(row.pr)!)}%` }} />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all disabled:opacity-30">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Add buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={addRow}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                <Plus size={12} /> Zeile
              </button>
              <button type="button" onClick={addFreitext}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors">
                <AlignLeft size={12} /> Freitext
              </button>
            </div>

          </div>
        </div>

        {/* Right: Untersuchung */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-2.5 bg-slate-800 rounded-t-2xl">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Untersuchung</span>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Datum</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all" />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Untersucher</label>
                <input type="text" value={examiner} onChange={e => setExaminer(e.target.value)} placeholder="Kürzel"
                  className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Notiz</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Besonderheiten…"
                className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300" />
            </div>
            <div className="pt-1">
              <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
            </div>
          </div>
        </div>

      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vorherige Messungen</span>
          {results.length > 0 && (
            <span className="text-[10px] bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md font-semibold">{results.length}</span>
          )}
        </div>
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <HistoryIcon size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {results.map(res => {
              let parsedRows: CustomRow[] = [];
              try { parsedRows = JSON.parse(String(res.rawValues.rows ?? '[]')); } catch { /* ignore */ }
              const nameVal = String(res.rawValues.testName ?? '–');

              return (
                <div key={res.id} className={cn('p-5 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">{nameVal}</span>
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                      {res.examiner && <span className="text-[9px] text-gray-400">{res.examiner}</span>}
                    </div>
                    <HistoryRowActions
                      id={res.id}
                      editingId={editingId}
                      confirmDeleteId={confirmDeleteId}
                      patientDischarged={patient.status === 'entlassen'}
                      onEdit={() => { setConfirmDeleteId(null); editingId === res.id ? cancelEdit() : startEdit(res); }}
                      onDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                      onConfirmDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                      onSetConfirm={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    {parsedRows.map((row, ri) =>
                      row.freitext !== undefined ? (
                        row.freitext.trim() ? (
                          <p key={ri} className="text-xs italic text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                            {row.freitext}
                          </p>
                        ) : null
                      ) : (row.label || row.value) ? (
                        <div key={ri} className="flex items-baseline gap-2 text-xs">
                          <span className="font-medium text-gray-600 min-w-[140px]">{row.label || '–'}</span>
                          <span className="text-gray-500">{row.value || '–'}</span>
                          {row.pr && prNumeric(row.pr) !== null
                            ? <PrBadge value={prNumeric(row.pr)!} />
                            : row.pr
                              ? <span className="font-mono text-[10px] text-gray-400">PR {row.pr}</span>
                              : null}
                        </div>
                      ) : null
                    )}
                  </div>
                  {res.note && <p className="text-[10px] italic text-gray-400 mt-2">{res.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
