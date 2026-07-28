import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { tWertToPR } from '../lib/normUtils';
import { PrBadge, AbortBadge, HistoryRowActions, FormSave, HistoryDate } from './TestForm';

export const LPS_SUBTESTS = [
  { id: 's1_2', label: 'Subtest 1+2' },
  { id: 's3',   label: 'Subtest 3'   },
  { id: 's4',   label: 'Subtest 4'   },
  { id: 's5',   label: 'Subtest 5'   },
  { id: 's6',   label: 'Subtest 6'   },
  { id: 's7',   label: 'Subtest 7'   },
  { id: 's8',   label: 'Subtest 8'   },
  { id: 's9',   label: 'Subtest 9'   },
  { id: 's10',  label: 'Subtest 10'  },
  { id: 's11',  label: 'Subtest 11'  },
  { id: 's12',  label: 'Subtest 12'  },
  { id: 's13',  label: 'Subtest 13'  },
  { id: 's14',  label: 'Subtest 14'  },
] as const;

export const LPS_KORREKTUR_OPTIONS = [
  { value: 'unkorrigiert',              label: 'Unkorrigiert' },
  { value: 'alterskorrigiert',          label: 'Alterskorrigiert' },
  { value: 'bildungskorrigiert',        label: 'Bildungskorrigiert' },
  { value: 'alters_bildungskorrigiert', label: 'Alters- & Bildungskorrigiert' },
] as const;

export type LPSKorrekturValue = typeof LPS_KORREKTUR_OPTIONS[number]['value'];

export const LPS_VERSION_OPTIONS = [
  { value: 'A',      label: 'Version A' },
  { value: 'B',      label: 'Version B' },
  { value: '50plus', label: 'Version 50+' },
] as const;

export type LPSVersionValue = typeof LPS_VERSION_OPTIONS[number]['value'];

// LPS 50+ ist eine eigenständige Testform mit zwei parallelen Formen (A/B) —
// unabhängig von der äußeren Version-A/B-Unterscheidung des Standard-LPS.
export const LPS_50PLUS_FORM_OPTIONS = [
  { value: 'A', label: 'Form A' },
  { value: 'B', label: 'Form B' },
] as const;

export type LPS50PlusFormValue = typeof LPS_50PLUS_FORM_OPTIONS[number]['value'];

interface LPSTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

type SubtestState = { rw: string; tw: string };

const emptySubtests = (): Record<string, SubtestState> =>
  Object.fromEntries(LPS_SUBTESTS.map(s => [s.id, { rw: '', tw: '' }]));

export const LPSTab: React.FC<LPSTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [subtests,  setSubtests]  = useState<Record<string, SubtestState>>(emptySubtests());
  const [korrektur, setKorrektur] = useState<LPSKorrekturValue>('unkorrigiert');
  const [version,   setVersion]   = useState<LPSVersionValue>('A');
  const [lps50Form, setLps50Form] = useState<LPS50PlusFormValue>('A');
  const [note,      setNote]      = useState('');
  const [date,      setDate]      = useState(new Date().toISOString().split('T')[0]);
  const [examiner,  setExaminer]  = useState(currentUser ?? '');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted,      setAborted]      = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const results = previousResults
    .filter(r => r.testId === 'lps')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const setSubtest = (id: string, field: 'rw' | 'tw', value: string) =>
    setSubtests(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const getPR = (id: string): number | null => {
    const tw = subtests[id].tw;
    if (!tw || isNaN(Number(tw))) return null;
    return tWertToPR(Number(tw));
  };

  const reset = () => {
    setSubtests(emptySubtests());
    setKorrektur('unkorrigiert');
    setVersion('A');
    setLps50Form('A');
    setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false);
    setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    const st = emptySubtests();
    LPS_SUBTESTS.forEach(s => {
      st[s.id] = {
        rw: String(res.rawValues[`${s.id}_rw`] ?? ''),
        tw: String(res.rawValues[`${s.id}_tw`] ?? ''),
      };
    });
    setSubtests(st);
    setKorrektur((res.rawValues.korrektur as LPSKorrekturValue) ?? 'unkorrigiert');
    setVersion((res.rawValues.version as LPSVersionValue) ?? 'A');
    setLps50Form((res.rawValues.lps50Form as LPS50PlusFormValue) ?? 'A');
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const hasAnyInput = LPS_SUBTESTS.some(s => subtests[s.id].rw !== '' || subtests[s.id].tw !== '');

  const handleSave = () => {
    if (!aborted && !hasAnyInput) return;
    const rawValues: Record<string, number | string> = { korrektur, version };
    if (version === '50plus') rawValues.lps50Form = lps50Form;
    const percentileRanks: Record<string, number | string> = {};
    LPS_SUBTESTS.forEach(s => {
      const rw = subtests[s.id].rw;
      const tw = subtests[s.id].tw;
      if (rw !== '') rawValues[`${s.id}_rw`] = Number(rw);
      if (tw !== '') {
        rawValues[`${s.id}_tw`] = Number(tw);
        const pr = tWertToPR(Number(tw));
        if (pr !== null) percentileRanks[s.id] = pr;
      }
    });
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'lps', date, examiner, note,
      rawValues, calculatedValues: {}, percentileRanks,
      normInfo: 'LPS – Leistungsprüfsystem (T-Wert → Lienert-Normtabelle)',
      domainMapping: Object.fromEntries(LPS_SUBTESTS.map(s => [s.id, '4. Intellektuelle Leistungen'])),
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
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
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">LPS – Leistungsprüfsystem</h2>
        <span className="text-[11px] text-slate-400">T-Wert → Prozentrang (Lienert-Normtabelle)</span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Messwerte */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Messwerte</span>
          </div>

          {/* Version */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Version</div>
            <div className="flex flex-wrap gap-1.5">
              {LPS_VERSION_OPTIONS.map(opt => (
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

          {/* LPS 50+ hat zwei parallele Testformen (A/B) — nur relevant, wenn Version 50+ gewählt ist */}
          {version === '50plus' && (
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">LPS 50+ Form</div>
              <div className="flex flex-wrap gap-1.5">
                {LPS_50PLUS_FORM_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setLps50Form(opt.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                      lps50Form === opt.value
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Korrektur */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Normkorrektur</div>
            <div className="flex flex-wrap gap-1.5">
              {LPS_KORREKTUR_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setKorrektur(opt.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                    korrektur === opt.value
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subtest table */}
          <div className="divide-y divide-slate-50">
            <div className="grid grid-cols-[1fr_64px_64px_56px] gap-1 px-5 py-2 bg-slate-50/80">
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Subtest</span>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-center">RW</span>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-center">T-Wert</span>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-center">PR</span>
            </div>
            {LPS_SUBTESTS.map(s => {
              const pr = getPR(s.id);
              const rwFilled = subtests[s.id].rw !== '';
              const twFilled = subtests[s.id].tw !== '';
              return (
                <div key={s.id} className="grid grid-cols-[1fr_64px_64px_56px] gap-1 items-center px-5 py-1.5 hover:bg-slate-50/50 transition-colors">
                  <span className="text-xs font-medium text-slate-600">{s.label}</span>
                  <div className={cn(
                    'flex items-center rounded-md px-1.5 py-1 transition-all',
                    rwFilled ? 'border border-slate-400 bg-white' : 'border border-slate-300 bg-white',
                  )}>
                    <input type="text" inputMode="numeric" value={subtests[s.id].rw}
                      onChange={e => setSubtest(s.id, 'rw', e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="–"
                      className="w-full text-center text-xs font-mono font-semibold text-slate-800 bg-transparent outline-none placeholder:text-slate-300"
                    />
                  </div>
                  <div className={cn(
                    'flex items-center rounded-md px-1.5 py-1 transition-all',
                    twFilled ? 'border border-slate-400 bg-white' : 'border border-slate-300 bg-white',
                  )}>
                    <input type="text" inputMode="numeric" value={subtests[s.id].tw}
                      onChange={e => setSubtest(s.id, 'tw', e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="–"
                      className="w-full text-center text-xs font-mono font-semibold text-slate-800 bg-transparent outline-none placeholder:text-slate-300"
                    />
                  </div>
                  <div className="flex justify-center">
                    {pr !== null ? <PrBadge value={pr} /> : <span className="text-slate-300 text-xs">–</span>}
                  </div>
                </div>
              );
            })}
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
                    className="text-orange-300 hover:text-orange-500 transition-colors rounded p-0.5"><X size={13} /></button>
                </div>
                <textarea value={abortComment} onChange={e => setAbortComment(e.target.value)}
                  placeholder="Grund (optional)…" rows={2}
                  className="w-full px-3 py-2 text-sm rounded-2xl bg-orange-50 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none placeholder:text-orange-300" />
              </div>
            )}
            <div className="pt-1">
              <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
            </div>
          </div>
        </div>

      </div>

      <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Norm · </span>
        <span className="text-[11px] text-gray-400">LPS – Leistungsprüfsystem (Horn, 1983 / 1972) · T-Wert (20–80) → Prozentrang (Lienert-Normtabelle)</span>
      </div>

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
              const korrekturLabel = LPS_KORREKTUR_OPTIONS.find(o => o.value === res.rawValues.korrektur)?.label ?? 'Unkorrigiert';
              const versionLabel = LPS_VERSION_OPTIONS.find(o => o.value === res.rawValues.version)?.label;
              const form50Label = res.rawValues.version === '50plus'
                ? LPS_50PLUS_FORM_OPTIONS.find(o => o.value === res.rawValues.lps50Form)?.label
                : undefined;
              return (
                <div key={res.id} className={cn('transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50/60">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                      {versionLabel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 uppercase tracking-wider">{versionLabel}</span>}
                      {form50Label && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 uppercase tracking-wider">{form50Label}</span>}
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider">{korrekturLabel}</span>
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
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/60">
                      <tr>
                        <th className="px-5 py-1.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Subtest</th>
                        <th className="px-3 py-1.5 text-center text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Rohwert</th>
                        <th className="px-3 py-1.5 text-center text-[9px] font-semibold text-gray-400 uppercase tracking-wider">T-Wert</th>
                        <th className="px-3 py-1.5 text-center text-[9px] font-semibold text-gray-400 uppercase tracking-wider">PR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {LPS_SUBTESTS.map(s => {
                        const rw = res.rawValues[`${s.id}_rw`];
                        const tw = res.rawValues[`${s.id}_tw`];
                        const pr = res.percentileRanks[s.id];
                        if (rw === undefined && tw === undefined) return null;
                        return (
                          <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-1.5 font-medium text-gray-600">{s.label}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-gray-500">{rw !== undefined ? String(rw) : '–'}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-gray-500">{tw !== undefined ? String(tw) : '–'}</td>
                            <td className="px-3 py-1.5 text-center">
                              {pr !== undefined ? <PrBadge value={pr} /> : <span className="text-gray-300">–</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
