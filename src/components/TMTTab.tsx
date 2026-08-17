import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import tmtNorms from '../data/tmt-norms.json';
import { PrBadge, AbortBadge, HistoryRowActions, FormSave, HistoryDate, OutOfRangeWarning } from './TestForm';
import { lookupTMTPR } from '../lib/tmtUtils';

interface TMTTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

function prN(pr: number | string | null | undefined): number | null {
  if (pr == null) return null;
  const s = String(pr).trim();
  if (!s) return null;
  if (s.startsWith('>')) { const v = parseFloat(s.slice(1).trim()); return isNaN(v) ? null : Math.min(99.5, v + 0.5); }
  if (s.startsWith('<')) { const v = parseFloat(s.slice(1).trim()); return isNaN(v) ? null : Math.max(0.5, v / 2); }
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

export const TMTTab: React.FC<TMTTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const containerRef = useAutoFocusFirst<HTMLDivElement>();
  const { currentUser } = useAuth();
  const [rawA, setRawA] = useState('');
  const [rawB, setRawB] = useState('');
  const [errA, setErrA] = useState('');
  const [errB, setErrB] = useState('');
  const [noteA, setNoteA] = useState('');
  const [noteB, setNoteB] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const tmtResults = previousResults
    .filter(r => r.testId === 'tmt')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const calculatePR = (age: number, value: number, part: 'A' | 'B'): number | string =>
    lookupTMTPR(age, value, part);

  const normGroup = tmtNorms.altersgruppen.find(g => ageAtTest >= g.von && ageAtTest <= g.bis);
  const ageOutOfRange = !normGroup;

  const previewA = rawA && !isNaN(Number(rawA)) && Number(rawA) > 0
    ? calculatePR(ageAtTest, Number(rawA), 'A') : null;
  const previewB = rawB && !isNaN(Number(rawB)) && Number(rawB) > 0
    ? calculatePR(ageAtTest, Number(rawB), 'B') : null;

  const validate = () => {
    const e: Record<string, string> = {};
    const aFilled = rawA !== '';
    const bFilled = rawB !== '';
    // Teil A und B sind unabhängig auswertbar — nur ein befülltes Feld muss gültig sein;
    // ein leeres Feld blockiert das Speichern des jeweils anderen Teils nicht mehr.
    if (aFilled && (isNaN(Number(rawA)) || Number(rawA) <= 0)) e.rawA = 'Ungültig';
    if (bFilled && (isNaN(Number(rawB)) || Number(rawB) <= 0)) e.rawB = 'Ungültig';
    if (!aFilled && !bFilled) { e.rawA = 'Mind. ein Teil'; e.rawB = 'Mind. ein Teil'; }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawA(String(res.rawValues.A));
    setRawB(String(res.rawValues.B));
    setErrA(res.rawValues.errA != null ? String(res.rawValues.errA) : '');
    setErrB(res.rawValues.errB != null ? String(res.rawValues.errB) : '');
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    // Ältere Datensätze kennen nur EINE gemeinsame Notiz (res.note) für A+B — als
    // Ausgangswert für beide Felder übernehmen, bis sie einzeln überschrieben wird.
    // Nur echte Alt-Datensätze (weder noteA noch noteB gesetzt) dürfen auf res.note
    // zurückfallen — sonst würde eine nur für Teil B eingegebene Notiz auch bei Teil A
    // erscheinen (und umgekehrt).
    const legacySingleNote = res.rawValues.noteA == null && res.rawValues.noteB == null;
    setNoteA(res.rawValues.noteA != null ? String(res.rawValues.noteA) : (legacySingleNote ? (res.note ?? '') : ''));
    setNoteB(res.rawValues.noteB != null ? String(res.rawValues.noteB) : (legacySingleNote ? (res.note ?? '') : ''));
    setErrors({});
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRawA(''); setRawB(''); setErrA(''); setErrB(''); setNoteA(''); setNoteB('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setErrors({});
    setAborted(false); setAbortComment('');
  };

  const handleSave = () => {
    if (!aborted && !validate()) return;

    const hasA = rawA !== '' && !isNaN(Number(rawA)) && Number(rawA) > 0;
    const hasB = rawB !== '' && !isNaN(Number(rawB)) && Number(rawB) > 0;

    const rawValues: Record<string, number | string> = {};
    const calcValues: Record<string, number | string> = {};
    const prs: Record<string, number | string> = {};

    if (hasA) {
      const valA = Number(rawA);
      rawValues.A = valA;
      calcValues.A = valA;
      prs.A = calculatePR(ageAtTest, valA, 'A');
    }
    if (hasB) {
      const valB = Number(rawB);
      rawValues.B = valB;
      calcValues.B = valB;
      prs.B = calculatePR(ageAtTest, valB, 'B');
    }
    if (hasA && hasB) {
      calcValues.BminusA = Number(rawB) - Number(rawA);
    }
    if (errA.trim() && !isNaN(Number(errA))) rawValues.errA = Number(errA);
    if (errB.trim() && !isNaN(Number(errB))) rawValues.errB = Number(errB);
    // Teil A und B haben je eine eigene Notiz (ersetzt die frühere gemeinsame `note`).
    if (noteA.trim()) rawValues.noteA = noteA;
    if (noteB.trim()) rawValues.noteB = noteB;

    const group = tmtNorms.altersgruppen.find(g => ageAtTest >= g.von && ageAtTest <= g.bis);

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'tmt',
      date,
      rawValues,
      calculatedValues: calcValues,
      percentileRanks: prs,
      normInfo: `Norm: ${group?.label ?? 'Unbekannt'}, ${tmtNorms.meta.quelle}`,
      examiner,
      note: noteA || noteB || undefined,
      domainMapping: {
        A: '1. Aufmerksamkeit (Geschwindigkeit)',
        B: '1. Aufmerksamkeit (Geteilt)',
      },
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    setRawA(''); setRawB(''); setErrA(''); setErrB(''); setNoteA(''); setNoteB('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  useShortcutSave(handleSave);

  const TILES = [
    { key: 'A' as const, label: 'A', val: rawA, set: setRawA, preview: previewA, errKey: 'rawA' },
    { key: 'B' as const, label: 'B', val: rawB, set: setRawB, preview: previewB, errKey: 'rawB' },
  ];

  return (
    <div ref={containerRef} className="space-y-4">

      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">
          Trail Making Test A &amp; B
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
            {TILES.map(({ key, label, val, set, preview, errKey }) => {
              const prVal = prN(preview);
              const filled = val !== '';
              const hasError = !!errors[errKey];
              const invalid = filled && (isNaN(Number(val)) || Number(val) <= 0);
              return (
                <div key={key} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-32 shrink-0">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Teil {label}</div>
                    <div className="text-[11px] text-slate-500 font-medium">Sekunden</div>
                  </div>
                  <div className={cn(
                    'flex items-center rounded-lg px-3 py-1.5 w-20 transition-all',
                    hasError || invalid
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
                        set(e.target.value.replace(/[^0-9]/g, ''));
                        setErrors(prev => ({ ...prev, [errKey]: '' }));
                      }}
                      className={cn(
                        'w-full text-center text-lg font-mono font-semibold bg-transparent outline-none placeholder:text-slate-300',
                        hasError || invalid ? 'text-red-500' : 'text-slate-800',
                      )}
                      placeholder="–"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 w-6 shrink-0">s</span>
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="w-28 shrink-0 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      {prVal !== null && (
                        <div
                          className={cn('h-full rounded-full transition-all duration-700', barCls(prVal))}
                          style={{ width: `${Math.min(100, prVal)}%` }}
                        />
                      )}
                    </div>
                    {preview !== null ? (
                      <span className={cn('text-sm font-bold tabular-nums whitespace-nowrap shrink-0', txtCls(prVal ?? 50))}>
                        PR {preview}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 shrink-0 select-none">–</span>
                    )}
                  </div>
                </div>
              );
            })}
            {([
              { key: 'A' as const, val: errA, set: setErrA },
              { key: 'B' as const, val: errB, set: setErrB },
            ]).map(({ key, val, set }) => (
              <div key={`err${key}`} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-32 shrink-0">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Fehler {key}</div>
                  <div className="text-[11px] text-slate-500 font-medium">Anzahl · optional</div>
                </div>
                <div className={cn(
                  'flex items-center rounded-lg px-3 py-1.5 w-20 transition-all',
                  val !== ''
                    ? 'bg-white border border-slate-400'
                    : 'bg-white border border-slate-300',
                )}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={val}
                    onChange={e => set(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-center text-lg font-mono font-semibold text-slate-800 bg-transparent outline-none placeholder:text-slate-300"
                    placeholder="–"
                  />
                </div>
                <span className="text-[10px] text-slate-400 w-6 shrink-0">Anz.</span>
                <div className="flex-1" />
              </div>
            ))}
          </div>
          {rawA && rawB && Number(rawA) > 0 && Number(rawB) > 0 && (
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-32 shrink-0">B − A</span>
              <span className="text-sm font-bold font-mono text-slate-700">{Number(rawB) - Number(rawA)} s</span>
            </div>
          )}
          {normGroup && (
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/30 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-32 shrink-0">
                x̄ · SD
              </span>
              <span className="text-[11px] text-slate-400">
                A: x̄ {normGroup.mittelwert.A} s · SD {normGroup.sd.A}
                <span className="mx-2 text-slate-200">|</span>
                B: x̄ {normGroup.mittelwert.B} s · SD {normGroup.sd.B}
              </span>
            </div>
          )}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Notiz Teil A</label>
                <input type="text" value={noteA} onChange={e => setNoteA(e.target.value)} placeholder="Besonderheiten…"
                  className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Notiz Teil B</label>
                <input type="text" value={noteB} onChange={e => setNoteB(e.target.value)} placeholder="Besonderheiten…"
                  className="w-full px-3 py-2 text-sm text-slate-700 bg-white rounded-xl outline-none border border-slate-300 focus:ring-2 focus:ring-slate-400/60 transition-all placeholder:text-slate-300"
                />
              </div>
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
      <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Norm · </span>
        <span className="text-[11px] text-gray-400">{tmtNorms.meta.quelle}</span>
        {tmtNorms.meta.hinweis && (
          <span className="text-[11px] text-gray-400 italic"> · {tmtNorms.meta.hinweis}</span>
        )}
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vorherige Messungen</span>
          {tmtResults.length > 0 && (
            <span className="text-[10px] bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md font-semibold">
              {tmtResults.length}
            </span>
          )}
        </div>
        {tmtResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <HistoryIcon size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">A (s)</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">B (s)</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">B−A</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PR A</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PR B</th>
                {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tmtResults.map(res => {
                const hasErrors = res.rawValues.errA != null || res.rawValues.errB != null;
                return (
                  <React.Fragment key={res.id}>
                    <tr className={cn('hover:bg-gray-50/60 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                          {res.aborted && <AbortBadge comment={res.abortComment} />}
                        </div>
                        {res.examiner && <div className="text-[9px] text-gray-400 mt-0.5">{res.examiner}</div>}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.A ?? '–'}</td>
                      <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.B ?? '–'}</td>
                      <td className="px-3 py-3 text-center font-mono font-bold text-slate-600">{res.calculatedValues.BminusA ?? '–'}</td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.A ? <PrBadge value={res.percentileRanks.A} /> : <span className="text-gray-300">–</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.B ? <PrBadge value={res.percentileRanks.B} /> : <span className="text-gray-300">–</span>}
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
                    {hasErrors && (
                      <tr className={cn('bg-amber-50/50', editingId === res.id && 'bg-gray-100/40')}>
                        <td colSpan={patient.status !== 'entlassen' ? 7 : 6} className="px-5 pb-2 pt-0">
                          <span className="text-[10px] text-amber-600 font-bold italic">
                            Fehler:{' '}
                            {res.rawValues.errA != null && `A: ${res.rawValues.errA}`}
                            {res.rawValues.errA != null && res.rawValues.errB != null && ' · '}
                            {res.rawValues.errB != null && `B: ${res.rawValues.errB}`}
                          </span>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
