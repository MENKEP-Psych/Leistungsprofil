import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { lookupZahlenspanne } from '../lib/normUtils';
import { PrBadge, AbortBadge, HistoryRowActions, FormSave, HistoryDate } from './TestForm';

interface ZahlenspanneTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

function prNumeric(pr: number | string | null | undefined): number | null {
  if (pr == null) return null;
  const s = String(pr).trim();
  if (s.startsWith('>')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.min(99.5, v + 0.5); }
  if (s.startsWith('<')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.max(0.5, v / 2); }
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

export const ZahlenspanneTab: React.FC<ZahlenspanneTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rawVorwaerts, setRawVorwaerts] = useState('');
  const [rawRueckwaerts, setRawRueckwaerts] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const results = previousResults
    .filter(r => r.testId === 'zahlenspanne')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const vwVal = rawVorwaerts !== '' && !isNaN(Number(rawVorwaerts)) ? Number(rawVorwaerts) : null;
  const rkVal = rawRueckwaerts !== '' && !isNaN(Number(rawRueckwaerts)) ? Number(rawRueckwaerts) : null;

  const prVorwaerts = vwVal !== null ? lookupZahlenspanne(vwVal, ageAtTest, 'vorwaerts') : null;
  const prRueckwaerts = rkVal !== null ? lookupZahlenspanne(rkVal, ageAtTest, 'rueckwaerts') : null;

  const reset = () => {
    setRawVorwaerts(''); setRawRueckwaerts(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawVorwaerts(String(res.rawValues.vorwaerts ?? ''));
    setRawRueckwaerts(String(res.rawValues.rueckwaerts ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    if (!aborted && vwVal === null && rkVal === null) return;

    const rawValues: Record<string, number | string> = {};
    if (vwVal !== null) rawValues.vorwaerts = vwVal;
    if (rkVal !== null) rawValues.rueckwaerts = rkVal;

    const prs: Record<string, number | string> = {};
    if (prVorwaerts !== null) prs.vorwaerts = prVorwaerts;
    if (prRueckwaerts !== null) prs.rueckwaerts = prRueckwaerts;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'zahlenspanne',
      date, examiner, note, rawValues,
      calculatedValues: {},
      percentileRanks: prs,
      normInfo: 'WMS-R Zahlenspanne [ZN 3] – Normtabelle',
      domainMapping: {
        vorwaerts: '2. Gedächtnis (Merkspanne)',
        rueckwaerts: '2. Gedächtnis (Arbeitsgedächtnis)',
      },
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

  const TILES = [
    { key: 'vorwaerts',   label: 'Vorwärts',  sublabel: 'Merkspanne · max. 12',       val: rawVorwaerts,   set: setRawVorwaerts,   pr: prVorwaerts   },
    { key: 'rueckwaerts', label: 'Rückwärts', sublabel: 'Arbeitsgedächtnis · max. 12', val: rawRueckwaerts, set: setRawRueckwaerts, pr: prRueckwaerts },
  ];

  return (
    <div className="space-y-4" ref={containerRef}>

      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">
          Zahlenspanne
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
            {TILES.map(({ key, label, sublabel, val, set, pr }) => {
              const prN = prNumeric(pr);
              const filled = val !== '';
              return (
                <div key={key} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-36 shrink-0">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">{label}</div>
                    <div className="text-[11px] text-slate-500 font-medium">{sublabel}</div>
                  </div>
                  <div className={cn(
                    'flex items-center rounded-lg px-3 py-1.5 w-20 transition-all',
                    filled ? 'bg-white border border-slate-400' : 'bg-white border border-slate-300',
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
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="w-28 shrink-0 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      {prN !== null && (
                        <div
                          className={cn('h-full rounded-full transition-all duration-700', barCls(prN))}
                          style={{ width: `${Math.min(100, prN)}%` }}
                        />
                      )}
                    </div>
                    {pr !== null ? (
                      <span className={cn('text-sm font-bold tabular-nums shrink-0', txtCls(prN ?? 50))}>
                        PR {pr}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 shrink-0 select-none">–</span>
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
        <span className="text-[11px] text-gray-400">WMS-R Zahlenspanne [ZN 3] – alterskorrigierte Normtabelle · Vorwärts → Merkspanne · Rückwärts → Arbeitsgedächtnis</span>
      </div>

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
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Vorw.</th>
                <th className="px-3 py-3 text-center text-[9px] font-medium text-gray-400 uppercase tracking-wider">PR</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rückw.</th>
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
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.vorwaerts ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.vorwaerts !== undefined
                      ? <PrBadge value={res.percentileRanks.vorwaerts} />
                      : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.rueckwaerts ?? '–'}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.rueckwaerts !== undefined
                      ? <PrBadge value={res.percentileRanks.rueckwaerts} />
                      : <span className="text-gray-300">–</span>}
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
