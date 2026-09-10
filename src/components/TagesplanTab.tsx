import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { AbortBadge, HistoryRowActions, FormSave, HistoryDate } from './TestForm';

interface TagesplanTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const TagesplanTab: React.FC<TagesplanTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0]);
  const [examiner,     setExaminer]     = useState(currentUser ?? '');
  const [planText,     setPlanText]     = useState('');
  const [note,         setNote]         = useState('');
  const [lastSaved,    setLastSaved]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const results = previousResults
    .filter(r => r.testId === 'tagesplan')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const reset = () => {
    setPlanText(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setPlanText(String(res.rawValues.planText ?? ''));
    setNote(res.note ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'tagesplan', date, examiner, note,
      rawValues: { planText },
      calculatedValues: {}, percentileRanks: {},
      normInfo: 'Tagesplan – Qualitative Auswertung',
    };
    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true); setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  return (
    <div className="space-y-4" ref={containerRef}>

      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">Tagesplan</h2>
        <span className="text-[11px] text-slate-400">Qualitative Auswertung · Exekutive Funktionen</span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Tagesplan */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Tagesplan</span>
          </div>
          <div className="p-5">
            <textarea value={planText} onChange={e => setPlanText(e.target.value)}
              placeholder="Beschreibung des Tagesplans, Beobachtungen, Strategien…" rows={10}
              className="w-full px-3 py-2.5 bg-white rounded-xl text-sm text-slate-700 placeholder:text-slate-300 outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all resize-none" />
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
                <div className="flex items-start justify-between gap-2 mb-2">
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
                {res.rawValues.planText && (
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{String(res.rawValues.planText)}</p>
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
