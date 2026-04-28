import React, { useState } from 'react';
import { Hash } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { lookupZahlenspanne } from '../lib/normUtils';
import {
  PrBadge, TestMeta, NoteField, FormSave,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface ZahlenspanneTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
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

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const results = previousResults
    .filter(r => r.testId === 'zahlenspanne')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const vwVal = rawVorwaerts !== '' && !isNaN(Number(rawVorwaerts)) ? Number(rawVorwaerts) : null;
  const rkVal = rawRueckwaerts !== '' && !isNaN(Number(rawRueckwaerts)) ? Number(rawRueckwaerts) : null;

  const prVorwaerts = vwVal !== null ? lookupZahlenspanne(vwVal, ageAtTest, 'vorwaerts') : null;
  const prRueckwaerts = rkVal !== null ? lookupZahlenspanne(rkVal, ageAtTest, 'rueckwaerts') : null;

  const inputCls = cn(
    'w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all text-center',
    'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  const reset = () => {
    setRawVorwaerts(''); setRawRueckwaerts(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawVorwaerts(String(res.rawValues.vorwaerts ?? ''));
    setRawRueckwaerts(String(res.rawValues.rueckwaerts ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    if (vwVal === null && rkVal === null) return;

    const rawValues: Record<string, number | string> = {};
    if (vwVal !== null) rawValues.vorwaerts = vwVal;
    if (rkVal !== null) rawValues.rueckwaerts = rkVal;

    const prs: Record<string, number | string> = {};
    if (prVorwaerts !== null) prs.vorwaerts = prVorwaerts;
    if (prRueckwaerts !== null) prs.rueckwaerts = prRueckwaerts;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'zahlenspanne',
      date,
      examiner,
      note,
      rawValues,
      calculatedValues: {},
      percentileRanks: prs,
      normInfo: 'WMS-R Zahlenspanne [ZN 3] – Normtabelle',
      domainMapping: {
        vorwaerts: '2. Gedächtnis (Merkspanne)',
        rueckwaerts: '2. Gedächtnis (Arbeitsgedächtnis)',
      },
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Hash size={22} />}
        title="Zahlenspanne"
        subtitle={`Merkspanne & Arbeitsgedächtnis (WMS-R) · Alter zum Testdatum: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Vorwärts (Rohwert, max. 12)
                </label>
                <input
                  type="number"
                  value={rawVorwaerts}
                  onChange={e => setRawVorwaerts(e.target.value)}
                  className={inputCls}
                  placeholder="–"
                  min={0}
                  max={12}
                />
                {prVorwaerts !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">→ PR</span>
                    <PrBadge value={prVorwaerts} />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Rückwärts (Rohwert, max. 12)
                </label>
                <input
                  type="number"
                  value={rawRueckwaerts}
                  onChange={e => setRawRueckwaerts(e.target.value)}
                  className={inputCls}
                  placeholder="–"
                  min={0}
                  max={12}
                />
                {prRueckwaerts !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">→ PR</span>
                    <PrBadge value={prRueckwaerts} />
                  </div>
                )}
              </div>
            </div>

            <NoteField value={note} onChange={setNote} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-black text-slate-500 uppercase tracking-wider">Norm: </span>
            WMS-R Zahlenspanne [ZN 3] – alterskorrigierte Normtabelle
            <span className="block mt-1 italic">
              Vorwärts → Merkspanne · Rückwärts → Arbeitsgedächtnis. Höhere Rohwerte = bessere Leistung.
            </span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="mb-4">
            <HistoryHeader count={results.length} />
          </div>

          {results.length === 0 ? <EmptyHistory /> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3 text-center">Vorw.</th>
                    <th className="px-3 py-3 text-center">PR Vorw.</th>
                    <th className="px-3 py-3 text-center">Rückw.</th>
                    <th className="px-3 py-3 text-center">PR Rückw.</th>
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
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{formatDate(res.date)}</td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">
                        {res.rawValues.vorwaerts ?? '–'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.vorwaerts !== undefined
                          ? <PrBadge value={res.percentileRanks.vorwaerts} />
                          : <span className="text-slate-300">–</span>}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">
                        {res.rawValues.rueckwaerts ?? '–'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.rueckwaerts !== undefined
                          ? <PrBadge value={res.percentileRanks.rueckwaerts} />
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
