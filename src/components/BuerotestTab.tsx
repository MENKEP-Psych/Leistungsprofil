import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { AbortBadge, HistoryRowActions, FormSave, HistoryDate } from './TestForm';

interface BuerotestTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const BuerotestTab: React.FC<BuerotestTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [date,           setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [examiner,       setExaminer]       = useState(currentUser ?? '');
  const [aufgabe1,       setAufgabe1]       = useState('');
  const [aufgabe6variant, setAufgabe6variant] = useState<'A' | 'B'>('A');
  const [aufgabe6,       setAufgabe6]       = useState('');
  const [note,           setNote]           = useState('');
  const [lastSaved,      setLastSaved]      = useState(false);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const results = previousResults
    .filter(r => r.testId === 'buerotest')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const reset = () => {
    setAufgabe1(''); setAufgabe6variant('A'); setAufgabe6(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setAufgabe1(String(res.rawValues.aufgabe1 ?? ''));
    setAufgabe6variant((res.rawValues.aufgabe6variant as 'A' | 'B') ?? 'A');
    setAufgabe6(String(res.rawValues.aufgabe6 ?? ''));
    setNote(res.note ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'buerotest', date, examiner, note,
      rawValues: { aufgabe1, aufgabe6variant, aufgabe6 },
      calculatedValues: {}, percentileRanks: {},
      normInfo: 'Bürotest – Qualitative Auswertung',
    };
    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true); setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  const textareaCls = 'w-full px-3 py-2.5 bg-white rounded-xl text-sm text-slate-700 placeholder:text-slate-300 outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all resize-none';

  return (
    <div className="space-y-4" ref={containerRef}>

      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">Bürotest</h2>
        <span className="text-[11px] text-slate-400">Qualitative Auswertung · Exekutive Funktionen</span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Aufgaben */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Aufgaben</span>
          </div>
          <div className="p-5 space-y-4">

            {/* Aufgabe 1 */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aufgabe 1</label>
              <textarea value={aufgabe1} onChange={e => setAufgabe1(e.target.value)}
                placeholder="Ergebnis / Beobachtungen zu Aufgabe 1…" rows={4}
                className={textareaCls} />
            </div>

            {/* Aufgabe 6 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aufgabe 6</label>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                  {(['A', 'B'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setAufgabe6variant(v)}
                      className={cn(
                        'px-3 py-1 rounded-md text-xs font-bold transition-all',
                        aufgabe6variant === v
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-600',
                      )}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={aufgabe6} onChange={e => setAufgabe6(e.target.value)}
                placeholder={`Ergebnis / Beobachtungen zu Aufgabe 6${aufgabe6variant}…`} rows={4}
                className={textareaCls} />
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
            {results.map(res => (
              <div key={res.id} className={cn('p-5 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                    {res.aborted && <AbortBadge comment={res.abortComment} />}
                    {res.examiner && <span className="text-[9px] text-gray-400">{res.examiner}</span>}
                  </div>
                  {patient.status !== 'entlassen' && (
                    <HistoryRowActions
                      id={res.id} editingId={editingId} confirmDeleteId={confirmDeleteId} patientDischarged={false}
                      onEdit={() => { setConfirmDeleteId(null); editingId === res.id ? cancelEdit() : startEdit(res); }}
                      onDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                      onConfirmDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                      onSetConfirm={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                    />
                  )}
                </div>
                {res.rawValues.aufgabe1 && (
                  <div className="mb-2">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Aufgabe 1</div>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{String(res.rawValues.aufgabe1)}</p>
                  </div>
                )}
                {res.rawValues.aufgabe6 && (
                  <div className="mb-2">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                      Aufgabe 6{res.rawValues.aufgabe6variant ? ` (${res.rawValues.aufgabe6variant})` : ''}
                    </div>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{String(res.rawValues.aufgabe6)}</p>
                  </div>
                )}
                {res.note && <p className="text-[10px] italic text-gray-400 mt-1">{res.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
