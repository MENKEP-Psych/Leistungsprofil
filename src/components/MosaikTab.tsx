import React, { useState } from 'react';
import { useShortcutSave } from '../hooks/useShortcutSave';
import { Grid2x2 } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { lookupMosaik } from '../lib/normUtils';
import {
  PrBadge, TestMeta, NoteField, FormSave, AbortButton, AbortBadge,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface MosaikTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const MosaikTab: React.FC<MosaikTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rawMosaik, setRawMosaik] = useState('');
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
    .filter(r => r.testId === 'mosaik')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const mosaikVal = rawMosaik !== '' && !isNaN(Number(rawMosaik)) ? Number(rawMosaik) : null;
  const mosaikNorm = mosaikVal !== null ? lookupMosaik(mosaikVal, ageAtTest) : null;

  const inputCls = cn(
    'w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all text-center',
    'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  const reset = () => {
    setRawMosaik(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setAborted(false); setAbortComment('');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawMosaik(String(res.rawValues.rohwert ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setAborted(res.aborted ?? false);
    setAbortComment(res.abortComment ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    if (!aborted && mosaikVal === null) return;
    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'mosaik',
      date,
      examiner,
      note,
      rawValues: mosaikVal !== null ? { rohwert: mosaikVal } : {},
      calculatedValues: mosaikNorm ? { awp: mosaikNorm.awp } : {},
      percentileRanks: mosaikNorm ? { mosaik: mosaikNorm.pr } : {},
      normInfo: 'WIE Mosaik-Test [MT 2a] – Normtabelle',
      domainMapping: { mosaik: '3. Visuo-Perz. / Visuo-Konstr. Leistungen' },
      aborted: aborted || undefined,
      abortComment: aborted ? abortComment : undefined,
    };
    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  useShortcutSave(handleSave);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Grid2x2 size={22} />}
        title="Mosaik-Test"
        subtitle={`Visuo-konstruktive Leistung (WIE) · Alter zum Testdatum: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Rohwertsumme (inkl. Zeitbonus, max. 68)
              </label>
              <input
                type="number"
                value={rawMosaik}
                onChange={e => setRawMosaik(e.target.value)}
                className={inputCls}
                placeholder="–"
                min={0}
                max={68}
              />
              {mosaikNorm && (
                <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 text-xs">
                  <span className="text-slate-500 font-bold">AWP {mosaikNorm.awp}</span>
                  <span className="text-slate-400">→</span>
                  <PrBadge value={mosaikNorm.pr} />
                  <span className="text-slate-400 ml-auto text-[10px]">Altersgruppe {ageAtTest} J.</span>
                </div>
              )}
            </div>

            <NoteField value={note} onChange={setNote} />
            <AbortButton aborted={aborted} comment={abortComment} onToggle={() => setAborted(a => !a)} onComment={setAbortComment} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-black text-slate-500 uppercase tracking-wider">Norm: </span>
            WIE Mosaik-Test [MT 2a] – alterskorrigierte Normtabelle
            <span className="block mt-1 italic">
              Aufgaben 5–14. Max. 60 s (Aufg. 5–9), 120 s (Aufg. 10–14). Zeitbonus inklusive.
            </span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="mb-4"><HistoryHeader count={results.length} /></div>
          {results.length === 0 ? <EmptyHistory /> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3 text-center">Rohwert</th>
                    <th className="px-3 py-3 text-center">AWP</th>
                    <th className="px-3 py-3 text-center">PR</th>
                    {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {results.map(res => (
                    <tr
                      key={res.id}
                      className={cn(
                        'hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors',
                        editingId === res.id && 'bg-indigo-50/60 dark:bg-indigo-900/30',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          {formatDate(res.date)}
                          {res.aborted && <AbortBadge comment={res.abortComment} />}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.rohwert}</td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.calculatedValues.awp ?? '–'}</td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.mosaik !== undefined
                          ? <PrBadge value={res.percentileRanks.mosaik} />
                          : <span className="text-slate-300">–</span>}
                      </td>
                      {patient.status !== 'entlassen' && (
                        <td className="px-2 py-3">
                          <HistoryRowActions
                            id={res.id}
                            editingId={editingId}
                            confirmDeleteId={confirmDeleteId}
                            patientDischarged={false}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
