import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Save, History, CheckCircle2, Plus, Trash2, Pencil, X, Check, FlaskConical, AlignLeft } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PageHeader, AbortButton, AbortBadge } from './TestForm';

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
  freitext?: string; // if defined (even ''), this row is a free-text block (no value/PR)
}

const emptyRow = (): CustomRow => ({ label: '', value: '', pr: '' });
const emptyFreitextRow = (): CustomRow => ({ label: '', value: '', pr: '', freitext: '' });

export const CustomTestTab: React.FC<CustomTestTabProps> = ({
  patient,
  previousResults,
  onSave,
  onUpdate,
  onDelete,
}) => {
  const { currentUser } = useAuth();
  const [testName, setTestName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [rows, setRows] = useState<CustomRow[]>([emptyRow()]);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const customResults = previousResults
    .filter(r => r.testId === 'custom')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const addFreitextRow = () => setRows(prev => [...prev, emptyFreitextRow()]);

  const removeRow = (idx: number) =>
    setRows(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  const updateRow = (idx: number, field: keyof CustomRow, val: string) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!testName.trim()) errs.testName = 'Bitte Testname eingeben.';
    if (!date) errs.date = 'Bitte Datum eingeben.';
    const hasContent = rows.some(r =>
      r.freitext !== undefined ? r.freitext.trim() !== '' : (r.label.trim() || r.value.trim())
    );
    if (!hasContent) errs.rows = 'Bitte mindestens eine Zeile mit Inhalt eingeben.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildResult = (): TestResult => {
    const percentileRanks: Record<string, number | string> = {};
    rows.forEach((r, i) => {
      if (r.freitext === undefined && r.pr.trim() !== '') {
        const num = parseFloat(r.pr);
        percentileRanks[`row_${i}`] = isNaN(num) ? r.pr : num;
      }
    });

    return {
      id: editingId ?? Date.now().toString(),
      testId: 'custom',
      date,
      rawValues: {
        testName: testName.trim(),
        rows: JSON.stringify(rows),
      },
      calculatedValues: {},
      percentileRanks,
      normInfo: 'custom',
      examiner,
      note,
    };
  };

  const handleSave = () => {
    if (!aborted && !validate()) return;
    const result = { ...buildResult(), aborted: aborted || undefined, abortComment: aborted ? abortComment : undefined };
    if (editingId) {
      onUpdate(result);
    } else {
      onSave(result);
    }
    resetForm();
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 2500);
  };

  useShortcutSave(handleSave);

  const resetForm = () => {
    setEditingId(null);
    setTestName('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setRows([emptyRow()]);
    setNote('');
    setErrors({});
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setTestName(String(res.rawValues.testName ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    try {
      const parsed = JSON.parse(String(res.rawValues.rows ?? '[]')) as CustomRow[];
      setRows(parsed.length > 0 ? parsed : [emptyRow()]);
    } catch {
      setRows([emptyRow()]);
    }
    setNote(res.note ?? '');
    setErrors({});
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => resetForm();

  const sharedInputCls = 'px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none transition-all';

  return (
    <div className="space-y-8">
      <PageHeader
        icon={<FlaskConical size={22} />}
        title="Eigener Test"
        subtitle="Qualitative Auswertung · Freie Dokumentation"
      />

      {/* Form */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/40 p-8 space-y-6">

        {/* Test name – prominent, full width */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Testname *
          </label>
          <input
            type="text"
            value={testName}
            onChange={e => setTestName(e.target.value)}
            placeholder="z. B. Stroop, RBMT, BNT..."
            className={cn(
              'w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border rounded-2xl text-base font-black text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all',
              errors.testName ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'
            )}
          />
          {errors.testName && <p className="text-xs text-red-500 font-medium">{errors.testName}</p>}
        </div>

        {/* Date + Examiner */}
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Datum</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={cn(
                'w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all',
                errors.date ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'
              )}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Untersucher</label>
            <input
              type="text"
              value={examiner}
              onChange={e => setExaminer(e.target.value)}
              placeholder="Kürzel"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Testabbruch – near metadata */}
        <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />

        {/* Dynamic rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Testergebnisse
            </label>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={addFreitextRow}
                  title="Für qualitative Beobachtungen ohne Zahlenwert"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-amber-600 border border-amber-300 hover:bg-amber-50 rounded-xl transition-colors"
                >
                  <AlignLeft size={13} /> Freitext-Zeile
                </button>
                <span className="text-[9px] text-amber-400 pr-1">Qualitative Beobachtung</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={addRow}
                  title="Für quantitative Werte mit optionalem Prozentrang"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-xl transition-colors"
                >
                  <Plus size={14} /> Zeile hinzufügen
                </button>
                <span className="text-[9px] text-emerald-400 pr-1">Quantitativer Wert</span>
              </div>
            </div>
          </div>

          {errors.rows && <p className="text-xs text-red-500 font-medium">{errors.rows}</p>}

          {/* Column headers – only when at least one normal row exists */}
          {rows.some(r => r.freitext === undefined) && (
            <div className="grid grid-cols-[1fr_1fr_120px_32px] gap-2 px-1">
              <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Bezeichnung</span>
              <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Rohwert / Ergebnis</span>
              <span className="flex items-center gap-1 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Prozentrang (PR)
                <span
                  title="Zahl 0–100 → erscheint in der Profilgrafik. Freitext möglich, aber ohne Grafik."
                  className="cursor-help text-slate-300 hover:text-slate-500 transition-colors normal-case"
                >
                  ⓘ
                </span>
              </span>
              <span />
            </div>
          )}

          {rows.map((row, idx) =>
            row.freitext !== undefined ? (
              /* Freitext row */
              <div key={idx} className="flex items-start gap-2">
                <div className="flex-1 flex items-start gap-2 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2">
                  <AlignLeft size={13} className="text-amber-400 mt-2 shrink-0" />
                  <textarea
                    value={row.freitext}
                    onChange={e => updateRow(idx, 'freitext', e.target.value)}
                    rows={2}
                    placeholder="Freitext (qualitative Beobachtungen, ohne PR)..."
                    className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none resize-none placeholder:text-amber-400/60"
                  />
                </div>
                <button
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  title={rows.length === 1 ? 'Mindestens eine Zeile erforderlich' : 'Zeile entfernen'}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all disabled:opacity-30 mt-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              /* Normal row */
              <div key={idx} className="grid grid-cols-[1fr_1fr_120px_32px] gap-2 items-center">
                <input
                  type="text"
                  value={row.label}
                  onChange={e => updateRow(idx, 'label', e.target.value)}
                  placeholder="z. B. Subtest 4"
                  className={sharedInputCls}
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={e => updateRow(idx, 'value', e.target.value)}
                  placeholder="z. B. 18 Punkte, 2:34 min, »gut«"
                  className={sharedInputCls}
                />
                <input
                  type="text"
                  value={row.pr}
                  onChange={e => updateRow(idx, 'pr', e.target.value)}
                  placeholder="0–100 oder Text"
                  className={sharedInputCls}
                />
                <button
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  title={rows.length === 1 ? 'Mindestens eine Zeile erforderlich' : 'Zeile entfernen'}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          )}

        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Notiz</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Beobachtungen, Besonderheiten..."
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            className={cn(
              'flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95',
              lastSaved
                ? 'bg-emerald-500 text-white shadow-emerald-200'
                : 'bg-slate-900 text-white hover:bg-emerald-700 shadow-slate-200'
            )}
          >
            {lastSaved ? (
              <><CheckCircle2 size={20} /> Gespeichert</>
            ) : (
              <><Save size={20} /> {editingId ? 'Aktualisieren' : 'Ergebnis speichern'}</>
            )}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* History */}
      {customResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-700">
            <History size={18} className="text-slate-400 dark:text-slate-500" />
            <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">Verlauf</h3>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700">
            {customResults.map((res, idx) => {
              let parsedRows: CustomRow[] = [];
              try { parsedRows = JSON.parse(String(res.rawValues.rows ?? '[]')); } catch { /* ignore */ }
              const testNameVal = String(res.rawValues.testName ?? '–');

              return (
                <div key={res.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={cn(
                          'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border',
                          idx === 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-600'
                        )}>
                          {idx === 0 ? 'Aktuell' : `Messung ${customResults.length - idx}`}
                        </span>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">{testNameVal}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(res.date)}</span>
                        {res.aborted && <AbortBadge comment={res.abortComment} />}
                        {res.examiner && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">· {res.examiner}</span>
                        )}
                      </div>

                      {parsedRows.filter(r =>
                        r.freitext !== undefined ? r.freitext.trim() : (r.label || r.value)
                      ).length > 0 && (
                        <div className="space-y-1">
                          {parsedRows.map((row, ri) =>
                            row.freitext !== undefined ? (
                              row.freitext.trim() ? (
                                <p key={ri} className="text-xs italic text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg px-2 py-1">
                                  {row.freitext}
                                </p>
                              ) : null
                            ) : (row.label || row.value) ? (
                              <div key={ri} className="flex items-baseline gap-2 text-xs">
                                <span className="font-bold text-slate-600 dark:text-slate-300 min-w-[140px]">{row.label || '–'}</span>
                                <span className="text-slate-500 dark:text-slate-400">{row.value || '–'}</span>
                                {row.pr && (
                                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded-lg">
                                    PR {row.pr}
                                  </span>
                                )}
                              </div>
                            ) : null
                          )}
                        </div>
                      )}

                      {res.note && (
                        <p className="text-xs italic text-slate-400 dark:text-slate-500 mt-2">{res.note}</p>
                      )}
                    </div>

                    {patient.status !== 'entlassen' && (
                      <div className="flex gap-2 shrink-0">
                        {confirmDeleteId === res.id ? (
                          <>
                            <button
                              onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-xl text-xs font-black hover:bg-red-600 transition-all"
                            >
                              <Check size={13} /> Löschen
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                            >
                              Abbrechen
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(res)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(res.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
