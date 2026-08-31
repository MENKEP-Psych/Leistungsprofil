import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { useAutoFocusFirst } from '../hooks/useAutoFocusFirst';
import { OctagonX, X, History as HistoryIcon } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import tolAlterNorms from '../data/tol_normen_alter.json';
import { PrBadge, AbortBadge, HistoryRowActions, FormSave, HistoryDate, OutOfRangeWarning, resolveNoteOnlySave } from './TestForm';
import { lookupTolAlterPR, lookupTolAlterBildungPR, findTolAltergruppe } from '../lib/tolUtils';

interface TOLTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

function prNumeric(pr: number | string | null | undefined): number | null {
  if (pr == null) return null;
  const s = String(pr).trim();
  if (s === 'N/A') return null;
  if (s.startsWith('>')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.min(99.5, v + 0.5); }
  if (s.startsWith('<')) { const v = parseFloat(s.slice(1)); return isNaN(v) ? null : Math.max(0.5, v / 2); }
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

export const TOLTab: React.FC<TOLTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rohwert,  setRohwert]  = useState('');
  const [note,     setNote]     = useState('');
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [lastSaved,  setLastSaved]  = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aborted,    setAborted]    = useState(false);
  const [abortComment, setAbortComment] = useState('');

  const tolResults = previousResults
    .filter(r => r.testId === 'tol')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const ageAtTest  = calculateAge(patient.geburtsdatum, date);
  const hasBildung = patient.bildungsjahre !== undefined;

  const rw             = rohwert !== '' && !isNaN(Number(rohwert)) ? Number(rohwert) : null;
  const previewAlter   = rw !== null ? lookupTolAlterPR(rw, ageAtTest) : null;
  const previewBildung = rw !== null && hasBildung ? lookupTolAlterBildungPR(rw, ageAtTest, patient.bildungsjahre!) : null;

  const prNAlter   = prNumeric(previewAlter);
  const prNBildung = prNumeric(previewBildung);
  const ageOutOfRange = !findTolAltergruppe(ageAtTest);

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRohwert(String(res.rawValues.rohwert));
    setDate(res.date); setExaminer(res.examiner ?? ''); setNote(res.note ?? '');
    setAborted(res.aborted ?? false); setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRohwert(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  const handleSave = () => {
    let effAborted = aborted;
    let effAbortComment = aborted ? abortComment : '';
    if (!aborted && rw === null) {
      if (resolveNoteOnlySave(note) === 'cancel') return;
      effAborted = true;
      effAbortComment = note.trim();
    }

    const prAlter   = rw !== null ? lookupTolAlterPR(rw, ageAtTest) : undefined;
    const prBildung = rw !== null && hasBildung ? lookupTolAlterBildungPR(rw, ageAtTest, patient.bildungsjahre!) : undefined;
    const alterGroup = findTolAltergruppe(ageAtTest);

    const prs: Record<string, number | string> = {};
    if (prAlter !== undefined)   prs.alterkorrigiert = prAlter;
    if (prBildung !== undefined) prs.alter_bildung   = prBildung;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'tol', date, examiner,
      note: effAborted && !aborted ? '' : note,
      rawValues:        rw !== null ? { rohwert: rw } : {},
      calculatedValues: rw !== null ? { rohwert: rw } : {},
      percentileRanks:  prs,
      normInfo: `Altersgruppe: ${alterGroup?.label ?? 'Unbekannt'}${hasBildung ? `, Bildungsjahre: ${patient.bildungsjahre}` : ''}`,
      domainMapping: { alterkorrigiert: '5. Exekutive Funktionen', alter_bildung: '5. Exekutive Funktionen' },
      aborted: effAborted || undefined,
      abortComment: effAborted ? effAbortComment : undefined,
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true); setTimeout(() => setLastSaved(false), 3000);
    setRohwert(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  useShortcutSave(handleSave);
  const containerRef = useAutoFocusFirst<HTMLDivElement>();

  return (
    <div className="space-y-4" ref={containerRef}>

      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-slate-800 tracking-tight">Turm von London</h2>
        <span className="text-[11px] text-slate-400">
          TOL · Alter: {ageAtTest} J.{hasBildung ? ` · ${patient.bildungsjahre} Bildungsjahre` : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">

        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-5 py-2.5 bg-slate-800">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Messwerte</span>
          </div>

          {/* Rohwert row */}
          <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100">
            <div className="w-40 shrink-0">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Gelöste Probleme</div>
              <div className="text-[11px] text-slate-500 font-medium">Rohwert · max. 20</div>
            </div>
            <div className={cn(
              'flex items-center rounded-lg px-3 py-1.5 w-20 transition-all',
              rohwert !== '' ? 'bg-white border border-slate-400' : 'bg-white border border-slate-300',
            )}>
              <input
                type="text" inputMode="numeric" value={rohwert}
                onChange={e => setRohwert(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full text-center text-lg font-mono font-semibold text-slate-800 bg-transparent outline-none placeholder:text-slate-300"
                placeholder="–"
              />
            </div>
          </div>

          {/* Live PR rows */}
          {previewAlter !== null && previewAlter !== 'N/A' && (
            <div className="px-5 py-3 space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-slate-500 w-44 shrink-0">Alterskorrigiert</span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  {prNAlter !== null && (
                    <div className={cn('h-full rounded-full transition-all duration-700', barCls(prNAlter))}
                      style={{ width: `${Math.min(100, prNAlter)}%` }} />
                  )}
                </div>
                <span className={cn('text-sm font-bold tabular-nums shrink-0', txtCls(prNAlter ?? 50))}>
                  PR {previewAlter}
                </span>
              </div>
              {previewBildung !== null && previewBildung !== 'N/A' && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-slate-500 w-44 shrink-0">Alters- &amp; bildungskorr.</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    {prNBildung !== null && (
                      <div className={cn('h-full rounded-full transition-all duration-700', barCls(prNBildung))}
                        style={{ width: `${Math.min(100, prNBildung)}%` }} />
                    )}
                  </div>
                  <span className={cn('text-sm font-bold tabular-nums shrink-0', txtCls(prNBildung ?? 50))}>
                    PR {previewBildung}
                  </span>
                </div>
              )}
              {!hasBildung && (
                <p className="text-[10px] text-amber-600 italic">Bildungsjahre nicht hinterlegt.</p>
              )}
            </div>
          )}
          {previewAlter === 'N/A' && (
            <div className="px-5 py-3 text-[10px] text-amber-600 italic">
              Kein Normwert für Alter {ageAtTest}.
            </div>
          )}
        </div>

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
            {ageOutOfRange && <OutOfRangeWarning />}
            <div className="pt-1">
              <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
            </div>
          </div>
        </div>

      </div>

      <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Norm · </span>
        <span className="text-[11px] text-gray-400">{tolAlterNorms.meta.quelle}</span>
        {tolAlterNorms.meta.hinweis && (
          <span className="text-[11px] text-gray-400 italic"> · {tolAlterNorms.meta.hinweis}</span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vorherige Messungen</span>
          {tolResults.length > 0 && (
            <span className="text-[10px] bg-slate-600 text-slate-200 px-1.5 py-0.5 rounded-md font-semibold">{tolResults.length}</span>
          )}
        </div>
        {tolResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300">
            <HistoryIcon size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-gray-400">Noch keine Messungen gespeichert</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Datum</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rohwert</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PR (Alter)</th>
                <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PR (Alter+Bild.)</th>
                {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tolResults.map(res => (
                <tr key={res.id} className={cn('hover:bg-gray-50/60 transition-colors', editingId === res.id && 'bg-gray-100/60')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700">
                      <HistoryDate date={res.date} geburtsdatum={patient.geburtsdatum} />
                      {res.aborted && <AbortBadge comment={res.abortComment} />}
                    </div>
                    {res.examiner && <div className="text-[9px] text-gray-400 mt-0.5">{res.examiner}</div>}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">{res.rawValues.rohwert}</td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.alterkorrigiert !== undefined
                      ? <PrBadge value={res.percentileRanks.alterkorrigiert} />
                      : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {res.percentileRanks.alter_bildung !== undefined
                      ? <PrBadge value={res.percentileRanks.alter_bildung} />
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
