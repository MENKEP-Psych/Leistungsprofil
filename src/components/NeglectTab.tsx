import React, { useState } from 'react';
import { Save, History, CheckCircle2, Eye, Pencil, X, ChevronDown, ChevronUp, Trash2, Check } from 'lucide-react';
import { PageHeader } from './TestForm';
import { Patient, TestResult } from '../types';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const EXP_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['Linienhalbieren',  'exp_linien'],
  ['▲ durchstreichen', 'exp_dreieck'],
  ['Apples-Test',      'exp_apples'],
  ['Abzeichnen',       'exp_abzeichen'],
  ['Uhr zeichnen',     'exp_uhr'],
] as const;

// ── Main component ────────────────────────────────────────────────────────────

interface NeglectTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const NeglectTab: React.FC<NeglectTabProps> = ({
  patient,
  previousResults,
  onSave,
  onUpdate,
  onDelete,
}) => {
  const { currentUser } = useAuth();
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [note,     setNote]     = useState('');

  const [expLinien,    setExpLinien]    = useState('');
  const [expDreieck,   setExpDreieck]   = useState('');
  const [expApples,    setExpApples]    = useState('');
  const [expAbzeichen, setExpAbzeichen] = useState('');
  const [expUhr,       setExpUhr]       = useState('');

  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [lastSaved,       setLastSaved]       = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);

  const expResults = previousResults
    .filter(r => r.testId === 'neglect_gf')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const resetForm = () => {
    setExpLinien(''); setExpDreieck(''); setExpApples('');
    setExpAbzeichen(''); setExpUhr('');
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  const startEdit = (res: TestResult) => {
    const r = res.rawValues;
    setEditingId(res.id);
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setExpLinien(String(r.exp_linien ?? ''));
    setExpDreieck(String(r.exp_dreieck ?? ''));
    setExpApples(String(r.exp_apples ?? ''));
    setExpAbzeichen(String(r.exp_abzeichen ?? ''));
    setExpUhr(String(r.exp_uhr ?? ''));
  };

  const cancelEdit = () => { setEditingId(null); resetForm(); };

  const handleSave = () => {
    const rawValues: Record<string, string> = {
      exp_linien:    expLinien,
      exp_dreieck:   expDreieck,
      exp_apples:    expApples,
      exp_abzeichen: expAbzeichen,
      exp_uhr:       expUhr,
    };

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'neglect_gf',
      date,
      rawValues,
      calculatedValues: {},
      percentileRanks: {},
      normInfo: '',
      examiner,
      note,
    };

    if (editingId) { onUpdate(result); setEditingId(null); }
    else           { onSave(result); }

    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    resetForm();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Eye size={22} />}
        title="Explorationsaufgaben"
        subtitle="Linienhalbieren · Apples-Test · Abzeichnen · Uhr zeichnen"
      />

      {/* ── FORM CARD ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">

        {/* Form header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Save size={16} className="text-indigo-600" />
            {editingId ? 'Untersuchung bearbeiten' : 'Neue Untersuchung'}
          </h3>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X size={13} /> Abbrechen
            </button>
          )}
        </div>

        {/* Date + Examiner */}
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div>
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Untersucher
            </label>
            <input
              type="text"
              value={examiner}
              onChange={e => setExaminer(e.target.value)}
              placeholder="Kürzel"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* ── EXPLORATIONSAUFGABEN ── */}
        <div className="space-y-2">
          {([
            ['Linienhalbieren',  expLinien,    setExpLinien],
            ['▲ durchstreichen', expDreieck,   setExpDreieck],
            ['Apples-Test',      expApples,    setExpApples],
            ['Abzeichnen',       expAbzeichen, setExpAbzeichen],
            ['Uhr zeichnen',     expUhr,       setExpUhr],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-36 shrink-0 text-right italic">
                {label}
              </span>
              <div className="flex-1 border-b border-dashed border-slate-300 dark:border-slate-600">
                <input
                  type="text"
                  value={val}
                  onChange={e => setter(e.target.value)}
                  placeholder=""
                  className="w-full bg-transparent text-sm outline-none py-0.5 text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div>
          <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
            Notiz (optional)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Beobachtungen, Besonderheiten..."
            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 h-16 resize-none"
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className={cn(
            'w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2',
            lastSaved
              ? 'bg-emerald-500 text-white'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
          )}
        >
          {lastSaved   ? <><CheckCircle2 size={18} /> Gespeichert!</> :
           editingId   ? <><Save size={18} /> Änderung speichern</> :
                         <><Save size={18} /> Untersuchung speichern</>}
        </button>
      </div>

      {/* ── HISTORY ── */}
      {expResults.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <History size={16} className="text-indigo-600" />
            Verlauf
          </h3>
          <div className="space-y-2">
            {expResults.map(res => {
              const isExpanded = expandedId === res.id;
              const hasExpData = EXP_KEYS.some(([, k]) => res.rawValues[k]);

              return (
                <div key={res.id} className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                  {/* Summary row */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-700/40">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDate(res.date)}</span>
                    {res.examiner && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{res.examiner}</span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {hasExpData && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : res.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          {isExpanded ? 'Einklappen' : 'Details'}
                        </button>
                      )}
                      {patient.status !== 'entlassen' && (
                        <>
                          <button
                            onClick={() => { setConfirmDeleteId(null); editingId === res.id ? cancelEdit() : startEdit(res); }}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              editingId === res.id
                                ? 'bg-indigo-100 text-indigo-600'
                                : 'hover:bg-indigo-50 text-slate-300 hover:text-indigo-500'
                            )}
                            title="Bearbeiten"
                          >
                            <Pencil size={12} />
                          </button>
                          {confirmDeleteId === res.id ? (
                            <button
                              onClick={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                              className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                              title="Löschen bestätigen"
                            >
                              <Check size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                              title="Löschen"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 bg-white dark:bg-slate-800">
                      <div className="space-y-1">
                        {EXP_KEYS.map(([label, key]) =>
                          res.rawValues[key] ? (
                            <div key={key} className="flex gap-2 text-xs">
                              <span className="text-slate-400 dark:text-slate-500 italic w-36 shrink-0 text-right">
                                {label}:
                              </span>
                              <span className="text-slate-700 dark:text-slate-200">{String(res.rawValues[key])}</span>
                            </div>
                          ) : null
                        )}
                      </div>
                      {res.note && (
                        <div className="text-xs italic text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700 pt-2">
                          {res.note}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
