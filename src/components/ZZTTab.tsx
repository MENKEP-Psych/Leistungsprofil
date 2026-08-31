import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { lookupZZT } from '../lib/normUtils';
import { PrBadge, AbortBadge, HistoryRowActions, FormSave, HistoryDate, resolveNoteOnlySave } from './TestForm';

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
    let effAborted = aborted;
    let effAbortComment = aborted ? abortComment : '';
    if (!aborted && filled.length === 0) {
      if (resolveNoteOnlySave(note) === 'cancel') return;
      effAborted = true;
      effAbortComment = note.trim();
    }

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
      note: effAborted && !aborted ? '' : note,
      rawValues,
      calculatedValues: filled.length > 0 ? { wp } : {},
      percentileRanks: filled.length > 0 ? { zzt: pr } : {},
      normInfo: 'TME Zahlen-Zeige-Test (ZZT) – Gesamtnorm',
      domainMapping: { zzt: '1. Aufmerksamkeit (Informationsverarbeitung)' },
      aborted: effAborted || undefined,
      abortComment: effAborted ? effAbortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  return (
    <div className="space-y-4" ref={containerRef}>

      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">Zahlen-Zeige-Test (ZZT)</h2>
        <span className="text-[11px] text-slate-400">Alter: {ageAtTest} J.</span>
      </div>

      {/* 2-Spalten */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Links: Messwerte */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Messwerte · Bearbeitungszeit in Sekunden</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {ROUNDS.map((r, i) => {
                const val = times[i];
                const filled = val !== '';
                const invalid = filled && (isNaN(Number(val)) || Number(val) <= 0);
                return (
                  <div key={r} className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">D{r}</label>
                    <div className={cn(
                      'flex items-center rounded-lg px-2 py-1.5 transition-all',
                      invalid
                        ? 'bg-white ring-2 ring-red-400'
                        : filled
                          ? 'bg-white border border-slate-400'
                          : 'bg-white border border-slate-300',
                    )}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={val}
                        onChange={e => {
                          const next = [...times];
                          next[i] = e.target.value.replace(/[^0-9]/g, '');
                          setTimes(next);
                        }}
                        placeholder="–"
                        className={cn(
                          'w-full text-center text-sm font-mono font-semibold bg-transparent outline-none placeholder:text-slate-300',
                          invalid ? 'text-red-500' : 'text-slate-800',
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {normResult ? (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ø WP</span>
                <span className="font-bold font-mono text-slate-700">{normResult.wp}</span>
                <span className="text-slate-300 mx-1">→</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">PR</span>
                <PrBadge value={normResult.pr} />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Ø WP</span>
                <span className="text-sm text-slate-200">–</span>
                <span className="text-slate-200 mx-1">→</span>
                <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">PR</span>
                <span className="text-sm text-slate-200">–</span>
              </div>
            )}
          </div>
        </div>

        {/* Rechts: Untersuchung */}
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
            <div className="pt-1">
              <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
            </div>
          </div>
        </div>

      </div>

      {/* Norm-Info */}
      <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Norm · </span>
        <span className="text-[11px] text-gray-400">TME Zahlen-Zeige-Test – Gesamtnorm · Niedrigere Zeiten = bessere Leistung · WP aus Normtabelle pro Durchgang, mittlerer WP → PR</span>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vorherige Messungen</span>
          {zztResults.length > 0 && (
            <span className="text-[10px] bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md font-semibold">
              {zztResults.length}
            </span>
          )}
        </div>
        {zztResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <HistoryIcon size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Ø WP</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PR</th>
                {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {zztResults.map(res => (
                <tr key={res.id} className={cn('hover:bg-gray-50/60 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                    </div>
                    {res.examiner && <div className="text-[9px] text-gray-400 mt-0.5">{res.examiner}</div>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.calculatedValues.wp}</td>
                  <td className="px-3 py-3 text-center"><PrBadge value={res.percentileRanks.zzt} /></td>
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
