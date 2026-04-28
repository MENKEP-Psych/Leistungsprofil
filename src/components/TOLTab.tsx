import React, { useState } from 'react';
import { BrainCircuit, AlertCircle } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import tolAlterNorms from '../data/tol_normen_alter.json';
import tolBildungNorms from '../data/tol_normen_bildung.json';
import {
  prColorCls, PrBadge, TestMeta, NoteField, FormSave,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface TOLTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

type NormEntry = { rohwert: number; pr: number };

function lookupPR(rohwert: number, normen: NormEntry[]): number | string {
  let resultIdx = -1;
  for (let i = 0; i < normen.length; i++) {
    if (rohwert >= normen[i].rohwert) resultIdx = i;
  }
  if (resultIdx === -1) return `< ${normen[0]?.pr ?? 1}`;
  const lower = normen[resultIdx].pr;
  const next = normen[resultIdx + 1];
  if (next && next.pr - 1 > lower) return `${lower}–${next.pr - 1}`;
  return lower;
}

function findAltergruppe(age: number, altersgruppen: typeof tolAlterNorms.altersgruppen) {
  return (
    altersgruppen.find(g => g.label !== 'Gesamt' && g.bis !== null && age >= g.von && age <= (g.bis as number)) ??
    altersgruppen.find(g => g.label !== 'Gesamt' && g.bis === null && age >= g.von) ??
    altersgruppen.find(g => g.label === 'Gesamt')
  );
}

function lookupAlterPR(rohwert: number, age: number): number | string {
  const group = findAltergruppe(age, tolAlterNorms.altersgruppen);
  if (!group) return 'N/A';
  return lookupPR(rohwert, group.normen);
}

function lookupAlterBildungPR(rohwert: number, age: number, bildungsjahre: number): number | string {
  const bg = tolBildungNorms.bildungsgruppen.find(b =>
    b.bildungsjahre_bis !== null
      ? bildungsjahre >= b.bildungsjahre_von && bildungsjahre <= (b.bildungsjahre_bis as number)
      : bildungsjahre >= b.bildungsjahre_von
  );
  if (!bg) return 'N/A';
  const group = findAltergruppe(age, bg.altersgruppen as typeof tolAlterNorms.altersgruppen);
  if (!group) return 'N/A';
  return lookupPR(rohwert, group.normen);
}

export const TOLTab: React.FC<TOLTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rohwert, setRohwert] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const tolResults = previousResults
    .filter(r => r.testId === 'tol')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const ageAtTest = calculateAge(patient.geburtsdatum, date);
  const hasBildung = patient.bildungsjahre !== undefined;

  const rw = rohwert !== '' && !isNaN(Number(rohwert)) ? Number(rohwert) : null;
  const previewAlter = rw !== null ? lookupAlterPR(rw, ageAtTest) : null;
  const previewBildung =
    rw !== null && hasBildung ? lookupAlterBildungPR(rw, ageAtTest, patient.bildungsjahre!) : null;

  const validate = () => {
    const e: Record<string, string> = {};
    const n = Number(rohwert);
    if (rohwert === '' || isNaN(n) || n < 0 || n > 20 || !Number.isInteger(n))
      e.rohwert = 'Ganzzahl zwischen 0 und 20 eingeben.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRohwert(String(res.rawValues.rohwert));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
    setErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRohwert(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
    setErrors({});
  };

  const handleSave = () => {
    if (!validate()) return;
    const rw = Number(rohwert);
    const prAlter = lookupAlterPR(rw, ageAtTest);
    const prBildung = hasBildung ? lookupAlterBildungPR(rw, ageAtTest, patient.bildungsjahre!) : undefined;

    const alterGroup = findAltergruppe(ageAtTest, tolAlterNorms.altersgruppen);
    const prs: Record<string, number | string> = { alterkorrigiert: prAlter };
    if (prBildung !== undefined) prs.alter_bildung = prBildung;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'tol',
      date,
      rawValues: { rohwert: rw },
      calculatedValues: { rohwert: rw },
      percentileRanks: prs,
      normInfo: `Altersgruppe: ${alterGroup?.label ?? 'Unbekannt'}${hasBildung ? `, Bildungsjahre: ${patient.bildungsjahre}` : ''}`,
      examiner,
      note,
      domainMapping: { alterkorrigiert: '5. Exekutive Funktionen', alter_bildung: '5. Exekutive Funktionen' },
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    setRohwert(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<BrainCircuit size={22} />}
        title="Turm von London"
        subtitle={`TOL · Alter zum Testdatum: ${ageAtTest} J.${hasBildung ? ` · ${patient.bildungsjahre} Bildungsjahre` : ''}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-4">

            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            {/* Rohwert — single large input */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Gelöste Probleme (Rohwert, max. 20)
              </label>
              <input
                type="number"
                value={rohwert}
                onChange={e => setRohwert(e.target.value)}
                className={cn(
                  'w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all text-center',
                  errors.rohwert
                    ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'
                    : 'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
                )}
                placeholder="–"
                min={0} max={20}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              {errors.rohwert && (
                <p className="text-[10px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={10} /> {errors.rohwert}
                </p>
              )}

              {/* Live PR preview */}
              {previewAlter !== null && (
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold w-52">→ PR Alterskorrigiert</span>
                    <PrBadge value={previewAlter} />
                  </div>
                  {previewBildung !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold w-52">→ PR Alters- & bildungskorrigiert</span>
                      <PrBadge value={previewBildung} />
                    </div>
                  )}
                  {!hasBildung && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 italic">
                      Bildungsjahre nicht hinterlegt – kein bildungskorrigierter PR berechnet.
                    </p>
                  )}
                </div>
              )}
            </div>

            <NoteField value={note} onChange={setNote} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          {/* Norm info */}
          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Norm: </span>
            {tolAlterNorms.meta.quelle}
            <span className="block mt-1 italic">{tolAlterNorms.meta.hinweis}</span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
          <div className="mb-4">
            <HistoryHeader count={tolResults.length} />
          </div>

          {tolResults.length === 0 ? <EmptyHistory /> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3 text-center">Rohwert</th>
                    <th className="px-3 py-3 text-center">PR (Alter)</th>
                    <th className="px-3 py-3 text-center">PR (Alter+Bild.)</th>
                    {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {tolResults.map(res => (
                    <tr
                      key={res.id}
                      className={cn(
                        'hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors',
                        editingId === res.id && 'bg-indigo-50/60 dark:bg-indigo-900/30',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{formatDate(res.date)}</td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">
                        {res.rawValues.rohwert}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <PrBadge value={res.percentileRanks.alterkorrigiert} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.alter_bildung !== undefined
                          ? <PrBadge value={res.percentileRanks.alter_bildung} />
                          : <span className="text-slate-300 dark:text-slate-600 text-[10px]">–</span>
                        }
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
