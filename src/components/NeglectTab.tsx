import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { History as HistoryIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { AbortBadge, HistoryRowActions, FormSave, HistoryDate } from './TestForm';

const EXP_FIELDS: { key: string; label: string }[] = [
  { key: 'exp_linien',    label: 'Linienhalbieren'  },
  { key: 'exp_dreieck',   label: '▲ durchstreichen' },
  { key: 'exp_apples',    label: 'Apples-Test'      },
  { key: 'exp_abzeichen', label: 'Abzeichnen'       },
  { key: 'exp_uhr',       label: 'Uhr zeichnen'     },
];

interface NeglectTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const NeglectTab: React.FC<NeglectTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [date,           setDate]          = useState(new Date().toISOString().split('T')[0]);
  const [examiner,       setExaminer]      = useState(currentUser ?? '');
  const [note,           setNote]          = useState('');
  const [expLinien,      setExpLinien]     = useState('');
  const [expDreieck,     setExpDreieck]    = useState('');
  const [expApples,      setExpApples]     = useState('');
  const [expAbzeichen,   setExpAbzeichen]  = useState('');
  const [expUhr,         setExpUhr]        = useState('');
  const [expFreitext,    setExpFreitext]   = useState('');
  const [lastSaved,      setLastSaved]     = useState(false);
  const [editingId,      setEditingId]     = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId,     setExpandedId]    = useState<string | null>(null);

  const results = previousResults
    .filter(r => r.testId === 'neglect_gf')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const fieldValues: Record<string, string> = {
    exp_linien:    expLinien,
    exp_dreieck:   expDreieck,
    exp_apples:    expApples,
    exp_abzeichen: expAbzeichen,
    exp_uhr:       expUhr,
  };

  const fieldSetters: Record<string, (v: string) => void> = {
    exp_linien:    setExpLinien,
    exp_dreieck:   setExpDreieck,
    exp_apples:    setExpApples,
    exp_abzeichen: setExpAbzeichen,
    exp_uhr:       setExpUhr,
  };

  const reset = () => {
    setExpLinien(''); setExpDreieck(''); setExpApples('');
    setExpAbzeichen(''); setExpUhr(''); setExpFreitext('');
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setExpLinien(String(res.rawValues.exp_linien ?? ''));
    setExpDreieck(String(res.rawValues.exp_dreieck ?? ''));
    setExpApples(String(res.rawValues.exp_apples ?? ''));
    setExpAbzeichen(String(res.rawValues.exp_abzeichen ?? ''));
    setExpUhr(String(res.rawValues.exp_uhr ?? ''));
    setExpFreitext(String(res.rawValues.exp_freitext ?? ''));
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'neglect_gf', date, examiner, note,
      rawValues: {
        exp_linien: expLinien, exp_dreieck: expDreieck,
        exp_apples: expApples, exp_abzeichen: expAbzeichen,
        exp_uhr: expUhr, exp_freitext: expFreitext,
      },
      calculatedValues: {}, percentileRanks: {},
      normInfo: '',
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
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">Explorationsaufgaben</h2>
        <span className="text-[11px] text-slate-400">Linienhalbieren · Apples-Test · Abzeichnen · Uhr zeichnen</span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Exploration */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Exploration</span>
          </div>
          <div className="p-5 space-y-4">
            {EXP_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-500 w-36 shrink-0 text-right italic">{label}</span>
                <div className="flex-1 border-b border-dashed border-slate-300">
                  <input type="text" value={fieldValues[key]} onChange={e => fieldSetters[key](e.target.value)}
                    placeholder=""
                    className="w-full bg-transparent text-sm outline-none py-1 text-slate-700 placeholder:text-slate-300" />
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3 pt-1">
              <span className="text-[11px] font-semibold text-slate-500 w-36 shrink-0 text-right italic pt-1">Freitext</span>
              <div className="flex-1">
                <textarea value={expFreitext} onChange={e => setExpFreitext(e.target.value)}
                  placeholder="Qualitative Beobachtungen, weitere Tests…" rows={3}
                  className="w-full px-3 py-2 bg-white rounded-xl text-sm text-slate-700 placeholder:text-slate-300 outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all resize-none" />
              </div>
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
              const isExpanded = expandedId === res.id;
              const hasExpData = EXP_FIELDS.some(f => res.rawValues[f.key]) || res.rawValues.exp_freitext;
              return (
                <div key={res.id} className={cn('transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                    </div>
                    {res.examiner && <span className="text-[9px] text-gray-400">{res.examiner}</span>}
                    <div className="ml-auto flex items-center gap-1">
                      {hasExpData && (
                        <button type="button" onClick={() => setExpandedId(isExpanded ? null : res.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          {isExpanded ? 'Einklappen' : 'Details'}
                        </button>
                      )}
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
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 space-y-1.5 bg-white border-t border-gray-50">
                      {EXP_FIELDS.map(f => res.rawValues[f.key] ? (
                        <div key={f.key} className="flex gap-3 text-xs">
                          <span className="text-gray-400 italic w-36 shrink-0 text-right">{f.label}:</span>
                          <span className="text-gray-600">{String(res.rawValues[f.key])}</span>
                        </div>
                      ) : null)}
                      {res.rawValues.exp_freitext && (
                        <div className="flex gap-3 text-xs">
                          <span className="text-gray-400 italic w-36 shrink-0 text-right">Freitext:</span>
                          <span className="text-gray-600 whitespace-pre-wrap">{String(res.rawValues.exp_freitext)}</span>
                        </div>
                      )}
                      {res.note && (
                        <div className="text-[10px] italic text-gray-400 border-t border-gray-50 pt-2 mt-2">{res.note}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
